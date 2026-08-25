-- ===========================================================================
-- 064_the_audit_log_records_what_admins_actually_do.sql
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- ---------------------------------------------------------------------------
-- WHY
-- ---------------------------------------------------------------------------
-- The Audit Log calls itself the record of every governance decision, and it
-- records four things, all of them about staff: verified, verification
-- withdrawn, two-factor reset, moved school. Everything else a platform
-- administrator can do leaves no trace at all.
--
-- A school can be created, put on trial, suspended or closed — and suspending
-- is not cosmetic since db/063, it stops that school's educators adding
-- children. An invoice a family can see can be voided. A practitioner's
-- application to work with children can be approved or refused. A school's
-- first enquiry can be marked onboarded or declined. None of it is written
-- down anywhere.
--
-- That is worse than an incomplete log. It is a log that looks complete: you
-- open it after something has gone wrong, see nothing about the school that
-- was suspended last Tuesday, and conclude nobody suspended it.
--
-- ---------------------------------------------------------------------------
-- TRIGGERS, NOT CALLS FROM THE APPLICATION
-- ---------------------------------------------------------------------------
-- Every one of these is an ordinary UPDATE or INSERT today — the browser
-- writes straight to the table, and the specialist decision goes through the
-- API server using the caller's own token. Asking each of those places to also
-- insert an audit row would mean four opportunities to forget, and a fifth the
-- day somebody adds a new screen.
--
-- A trigger cannot be forgotten and cannot be skipped. It fires for the
-- browser, for the server, and for anybody with a psql prompt.
--
-- `auth.uid()` is the actor in all four paths: the three browser writes carry
-- the user's own token, and `/api/specialist-applications/:id/decide` builds a
-- client from the caller's bearer token rather than the service key. Where it
-- is null the row is still written — that a change happened is the more
-- important half, and a missing name is visible as one.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS WILL DO TO THE TEST NOISE, SAID PLAINLY
-- ---------------------------------------------------------------------------
-- The RLS suite builds a school on every run, so every run will now leave a
-- 'school.created' row behind for ever. The audit log already carries 73
-- 'Moved school' entries from the same source. This makes a real problem more
-- visible rather than causing it: the tests share one database with the
-- product. The screen has a filter now; the fix is a separate project.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Schools: created, and every status change
-- ---------------------------------------------------------------------------
-- Both live on `organisations`. `public.schools` is a security_invoker view
-- over it (db/053), so a write through the view fires these just the same —
-- which is the point of putting them on the table rather than the view.
create or replace function public.audit_organisation_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_audit_events
    (actor_id, action, subject_id, subject_label, detail)
  values (
    auth.uid(),
    'school.created',
    new.id,
    new.name,
    format('Created as %s, status %s.', new.kind, new.status)
  );
  return null;
end;
$$;

drop trigger if exists audit_organisation_created on public.organisations;
create trigger audit_organisation_created
  after insert on public.organisations
  for each row execute function public.audit_organisation_created();


create or replace function public.audit_organisation_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  insert into public.admin_audit_events
    (actor_id, action, subject_id, subject_label, detail)
  values (
    auth.uid(),
    'school.status_changed',
    new.id,
    new.name,
    -- Say what it MEANS, not only what it was set to. Whoever reads this back
    -- is asking why a school's teachers could not add a child that week.
    format('%s to %s.%s',
      initcap(old.status),
      new.status,
      case
        when new.status in ('suspended', 'closed')
          then ' Its educators can no longer add students.'
        when old.status in ('suspended', 'closed')
          then ' Its educators can add students again.'
        else ''
      end
    )
  );
  return null;
end;
$$;

drop trigger if exists audit_organisation_status on public.organisations;
create trigger audit_organisation_status
  after update of status on public.organisations
  for each row execute function public.audit_organisation_status();


-- ---------------------------------------------------------------------------
-- 2. Invoices: voiding, which is the only write this side has
-- ---------------------------------------------------------------------------
-- Not every status change. `paid` is stamped by the server after Stripe
-- confirms money moved (db/020) and belongs to the payment record rather than
-- to anybody's decision, and `draft -> open` is a school billing its own
-- family. Voiding is the one act a platform administrator performs on somebody
-- else's invoice, so it is the one worth a name against it.
create or replace function public.audit_invoice_voided()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'void' or old.status = 'void' then
    return null;
  end if;

  insert into public.admin_audit_events
    (actor_id, action, subject_id, subject_label, detail)
  values (
    auth.uid(),
    'invoice.voided',
    new.id,
    coalesce(new.description, 'Invoice'),
    format('%s cancelled. It was %s.',
      to_char(new.amount_cents / 100.0, 'FM999999990.00'),
      old.status
    )
  );
  return null;
end;
$$;

drop trigger if exists audit_invoice_voided on public.invoices;
create trigger audit_invoice_voided
  after update of status on public.invoices
  for each row execute function public.audit_invoice_voided();


-- ---------------------------------------------------------------------------
-- 3. Specialist applications: every decision
-- ---------------------------------------------------------------------------
-- This is a decision about whether somebody may work with children, and until
-- now it was recorded only on the application row itself — which the same
-- administrator can change again.
create or replace function public.audit_application_decided()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  insert into public.admin_audit_events
    (actor_id, action, subject_id, subject_label, detail)
  values (
    auth.uid(),
    'application.decided',
    new.id,
    new.full_name,
    format('%s to %s.%s',
      initcap(replace(old.status, '_', ' ')),
      replace(new.status, '_', ' '),
      case
        when coalesce(btrim(new.review_note), '') <> ''
          then ' ' || new.review_note
        else ''
      end
    )
  );
  return null;
end;
$$;

drop trigger if exists audit_application_decided on public.specialist_applications;
create trigger audit_application_decided
  after update of status on public.specialist_applications
  for each row execute function public.audit_application_decided();


-- ---------------------------------------------------------------------------
-- 4. Enquiries: triage
-- ---------------------------------------------------------------------------
-- db/045 already refuses to let anybody rewrite what an enquirer said. What it
-- does not record is who decided the outcome, and 'onboarded' is the row that
-- turns into a school.
create or replace function public.audit_enquiry_triaged()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  insert into public.admin_audit_events
    (actor_id, action, subject_id, subject_label, detail)
  values (
    auth.uid(),
    'enquiry.triaged',
    new.id,
    coalesce(new.organisation_name, new.contact_name),
    format('%s to %s.%s',
      initcap(old.status),
      new.status,
      case
        when coalesce(btrim(new.handled_note), '') <> ''
          then ' ' || new.handled_note
        else ''
      end
    )
  );
  return null;
end;
$$;

drop trigger if exists audit_enquiry_triaged on public.enquiries;
create trigger audit_enquiry_triaged
  after update of status on public.enquiries
  for each row execute function public.audit_enquiry_triaged();

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
-- Five triggers, and none of them replaced anything that was already there:
--
--   select tgname, tgrelid::regclass as on_table
--   from pg_trigger
--   where tgname like 'audit_%' and not tgisinternal
--   order by tgname;
--
-- Then, signed in as a Platform Admin, change a school's status on the Schools
-- page and reload the Audit Log. A 'School status changed' row appears naming
-- you, the school, and what it now means for its educators. Change it back and
-- a second row appears — an audit trail records the correction as well as the
-- mistake, which is the whole idea.
-- ---------------------------------------------------------------------------

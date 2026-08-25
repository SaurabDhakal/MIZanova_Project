-- ===========================================================================
-- 069_the_audit_trail_stops_copying_childrens_notes.sql
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- ---------------------------------------------------------------------------
-- WHY: db/065 PUT CLINICAL NOTES ON A GOVERNANCE SCREEN
-- ---------------------------------------------------------------------------
-- db/065 wrote the previous text of a behaviour log into the audit entry, in
-- full, with this reasoning in its own comment: "a diff would be smaller and
-- useless: the question is always 'what did it say before'".
--
-- The reasoning was right about the question and wrong about where the answer
-- may live. Reading the Audit Log after db/068 made it visible — an entry on
-- screen said, in plain text:
--
--     Notes: Private note that guardians must not see.
--
-- Two things are wrong with that, and the second is the serious one.
--
--   1. A platform admin reading the audit trail for an unrelated reason ends up
--      reading a child's clinical notes. Nobody chose to open that record.
--
--   2. It leaves NO ENTRY IN RECORD ACCESS. db/023 exists so that every read of
--      a child's record is recorded and can be questioned — it is the control
--      this product points at when asked who has seen a file. An audit entry
--      containing the note body is a way to read the note that the control
--      cannot see. A side door around the oversight is worse than no oversight,
--      because the trail still looks complete.
--
-- ---------------------------------------------------------------------------
-- WHAT REPLACES IT, AND WHY NOT JUST "NOTES CHANGED"
-- ---------------------------------------------------------------------------
-- Deleting the evidence is not the fix either. The reason db/065 audits
-- corrections rather than creations is that a note quietly rewritten after an
-- incident is the thing an investigation is about, and "notes changed" cannot
-- distinguish a typo from a safeguarding disclosure being erased.
--
-- So the entry keeps a FINGERPRINT: how long the previous text was, and a
-- sha256 of it. That preserves the evidentiary job and drops the readable one.
-- If a dispute later turns on what a note said, somebody produces the text they
-- claim it was and the hash confirms or refutes it — which is the actual
-- question an auditor asks, and it is now answerable without anybody reading a
-- child's notes in passing.
--
-- The hash is not a secrecy device. A short, guessable note could be brute
-- forced by someone who already has platform-admin access to this table. It is
-- a verification device, and it is strictly better than the plaintext it
-- replaces.
--
-- ---------------------------------------------------------------------------
-- THIS FILE ALSO REWRITES 78 EXISTING ROWS, WHICH NEEDS SAYING OUT LOUD
-- ---------------------------------------------------------------------------
-- Editing an audit trail is the thing an audit trail exists to prevent, and
-- every screen in this product tells the reader these entries cannot be
-- altered. That claim is about the application, and it stays true: no policy
-- here grants update to anybody, and this runs once by hand.
--
-- It is acceptable exactly because no real school is on this system yet — the
-- rows are seed and test data holding invented notes. Once a real child's
-- record is in here, the same operation would be evidence tampering and the
-- answer would have to be different: leave the old rows alone and let them age
-- out under a retention rule.
--
-- The redaction keeps the fingerprint of what it removes, computed from the
-- text on its way out, so the existing entries lose their readability without
-- losing their meaning.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. One definition of what a note fingerprint looks like
-- ---------------------------------------------------------------------------
-- Shared by both triggers and by the redaction below, so the three cannot
-- drift into three different formats for the same fact.
-- ---------------------------------------------------------------------------
create or replace function public.note_fingerprint(t text)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
  select case
    when nullif(btrim(t), '') is null then 'empty'
    else length(t)::text || ' characters, sha256 ' ||
         substring(encode(sha256(convert_to(t, 'UTF8')), 'hex') from 1 for 16)
  end;
$$;


-- ---------------------------------------------------------------------------
-- 2. A behaviour log corrected
-- ---------------------------------------------------------------------------
-- Reproduced whole rather than patched. `create or replace function` replaces
-- the entire body, and rebuilding one from memory is how db/046 silently
-- deleted db/036's work. Only the `detail` expression differs from db/065.
--
-- The ::text casts on the bare literals are load-bearing and are db/065's own
-- fix: `text[] || 'notes'` is ambiguous to the planner and raised "malformed
-- array literal" at runtime, which meant behaviour-log edits failed outright.
-- ---------------------------------------------------------------------------
create or replace function public.audit_behaviour_log_edited()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed  text[] := '{}';
  v_school uuid;
  v_child  text;
begin
  if new.notes is distinct from old.notes then
    changed := changed || 'notes'::text;
  end if;
  if new.behaviour_type is distinct from old.behaviour_type then
    changed := changed || format('type %s to %s', old.behaviour_type::text, new.behaviour_type::text);
  end if;
  if new.intensity is distinct from old.intensity then
    changed := changed || format('intensity %s to %s', old.intensity::text, new.intensity::text);
  end if;
  if new.is_risk_flagged is distinct from old.is_risk_flagged then
    changed := changed || (case when new.is_risk_flagged
                                then 'flagged as a risk'::text
                                else 'risk flag removed'::text end);
  end if;
  if new.occurred_at is distinct from old.occurred_at then
    changed := changed || 'when it happened'::text;
  end if;

  if array_length(changed, 1) is null then
    return null;
  end if;

  select s.school_id, s.display_name into v_school, v_child
  from public.students s where s.id = new.student_id;

  insert into public.admin_audit_events
    (actor_id, school_id, action, subject_id, subject_label, detail)
  values (
    auth.uid(),
    v_school,
    'behaviour_log.edited',
    new.id,
    coalesce(v_child, 'A student'),
    -- The fingerprint of the old text, never the old text. See the header.
    format('Changed %s.%s',
      array_to_string(changed, ', '),
      case when new.notes is distinct from old.notes
           then ' Previous notes: ' || public.note_fingerprint(old.notes)
           else '' end
    )
  );
  return null;
end;
$$;

drop trigger if exists audit_behaviour_log_edited on public.behaviour_logs;
create trigger audit_behaviour_log_edited
  after update on public.behaviour_logs
  for each row execute function public.audit_behaviour_log_edited();


-- ---------------------------------------------------------------------------
-- 3. A behaviour log removed
-- ---------------------------------------------------------------------------
-- `old` is all there is by the time this runs, so the entry still carries the
-- type, the intensity and when it happened — those describe the incident rather
-- than quoting the record, and they are what makes a deletion reviewable.
-- ---------------------------------------------------------------------------
create or replace function public.audit_behaviour_log_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school uuid;
  v_child  text;
begin
  select s.school_id, s.display_name into v_school, v_child
  from public.students s where s.id = old.student_id;

  insert into public.admin_audit_events
    (actor_id, school_id, action, subject_id, subject_label, detail)
  values (
    auth.uid(),
    v_school,
    'behaviour_log.deleted',
    old.id,
    coalesce(v_child, 'A student'),
    format('%s, %s intensity, recorded %s. Notes: %s',
      old.behaviour_type::text,
      old.intensity::text,
      to_char(old.occurred_at, 'DD Mon YYYY HH24:MI'),
      public.note_fingerprint(old.notes)
    )
  );
  return null;
end;
$$;

drop trigger if exists audit_behaviour_log_deleted on public.behaviour_logs;
create trigger audit_behaviour_log_deleted
  after delete on public.behaviour_logs
  for each row execute function public.audit_behaviour_log_deleted();


-- ---------------------------------------------------------------------------
-- 4. The entries already written
-- ---------------------------------------------------------------------------
-- The note body is extracted, fingerprinted, and replaced by its fingerprint
-- in one pass — so the row loses the text and keeps the proof.
--
-- Matched on '. Notes: ' and ' Previous notes: ', the two shapes db/065's
-- format strings produce. A note body that itself contained one of those
-- phrases would be redacted from that point instead, which errs towards
-- removing too much. That is the right direction to err.
--
-- Idempotent: a detail already ending in a fingerprint does not match
-- '%characters, sha256 %' twice.
--
-- '(empty)' is db/065's placeholder for a note that was blank, and is skipped
-- rather than fingerprinted. Without that guard this would hash the literal
-- string '(empty)' and record "7 characters" for a note that had none — a
-- fingerprint of the placeholder instead of the thing.
-- ---------------------------------------------------------------------------
update public.admin_audit_events
set detail = left(detail, strpos(detail, '. Notes: ') + 8)
           || public.note_fingerprint(substr(detail, strpos(detail, '. Notes: ') + 9))
where action = 'behaviour_log.deleted'
  and strpos(detail, '. Notes: ') > 0
  and detail not like '%characters, sha256 %'
  and detail not like '%. Notes: (empty)';

update public.admin_audit_events
set detail = left(detail, strpos(detail, ' Previous notes: ') + 16)
           || public.note_fingerprint(substr(detail, strpos(detail, ' Previous notes: ') + 17))
where action = 'behaviour_log.edited'
  and strpos(detail, ' Previous notes: ') > 0
  and detail not like '%characters, sha256 %'
  and detail not like '% Previous notes: (empty)';

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
-- Nothing left holding a note body. Both of these must return 0:
--
--   select count(*) from public.admin_audit_events
--   where action in ('behaviour_log.edited', 'behaviour_log.deleted')
--     and detail like '%Notes: %'
--     and detail not like '%characters, sha256 %'
--     and detail not like '%Notes: (empty)';
--
-- And the fingerprint verifies. Take any redacted row, produce the text you
-- believe was there, and compare — this is the whole point of keeping it:
--
--   select public.note_fingerprint('Private note that guardians must not see.');
--
-- STILL OPEN, and not fixed here. `subject_label` on a goal entry carries the
-- goal's title ("Ava W. — Join group work for a full session"), which is also
-- content from a child's record. It is a much smaller exposure than a clinical
-- note and removing it would leave the entry unable to say which goal it means,
-- so it needs a decision rather than a quick edit. Named here so it is not
-- found again by accident.
--
-- Also still open: these tables have no retention rule at all.
-- ---------------------------------------------------------------------------

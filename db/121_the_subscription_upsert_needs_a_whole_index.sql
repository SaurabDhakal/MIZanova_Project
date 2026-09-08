-- ---------------------------------------------------------------------------
-- 121 — The subscription upsert needs a whole index
-- ---------------------------------------------------------------------------
-- A real test subscription was paid for on 8 Sep and never recorded:
--
--     critical | billing | subscription_unrecorded
--     Stripe subscription sub_1UDOlpHOcDQ5feVDkTsjUULt could not be recorded:
--     there is no unique or exclusion constraint matching the ON CONFLICT
--     specification
--
-- Stripe had the money and the subscription. MiZanova had nothing — which is
-- the exact failure db/111 wrote `recordSubscription` to prevent, and the one
-- its own comment claimed was already handled:
--
--     "IDEMPOTENT BY INDEX. `individual_subscriptions_stripe_idx` is unique on
--      `stripe_subscription_id`, so an upsert on that column is safe to
--      replay"
--
-- The index is unique and it is on that column. The sentence is still wrong,
-- because the index is PARTIAL:
--
--     create unique index individual_subscriptions_stripe_idx
--       on public.individual_subscriptions (stripe_subscription_id)
--       where stripe_subscription_id is not null;
--
-- ---------------------------------------------------------------------------
-- A PARTIAL INDEX CANNOT ARBITRATE AN ON CONFLICT
-- ---------------------------------------------------------------------------
-- Postgres will only use an index to resolve `on conflict (col)` when it can
-- prove the index covers every row the statement might collide with. A partial
-- index covers a subset, so the statement has to repeat the predicate before
-- Postgres will accept it — `on conflict (stripe_subscription_id) where
-- stripe_subscription_id is not null`.
--
-- PostgREST does not emit that. `upsert(row, { onConflict: '…' })` becomes a
-- bare `on conflict (stripe_subscription_id)`, Postgres finds no whole index
-- matching it, and raises 42P10. There is no option on the client that adds
-- the predicate, so this is fixed in the schema or not at all.
--
-- ---------------------------------------------------------------------------
-- THE PREDICATE WAS BUYING NOTHING
-- ---------------------------------------------------------------------------
-- `where … is not null` looks like it is what allows the many rows that have
-- no Stripe id yet. It is not. Postgres treats nulls as DISTINCT from one
-- another in a unique index by default, so a plain unique index on a nullable
-- column already permits unlimited null rows and rejects only real duplicates.
--
-- So the predicate never widened what the table accepts. It only narrowed what
-- the index can be used for, and the one thing it took away is the thing the
-- payment path depends on. Dropping it changes no rule and costs a handful of
-- index entries for the null rows.
--
-- The sibling index below it is a different case and is deliberately left
-- alone: `individual_subscriptions_one_live_idx` is partial on `status` to let
-- cancelled subscriptions accumulate as history, nothing upserts against it,
-- and its predicate is load-bearing.
--
-- ---------------------------------------------------------------------------
-- AFTER APPLYING THIS
-- ---------------------------------------------------------------------------
-- The subscription already paid for at Stripe is still missing from this
-- table. Applying the fix does not backfill it — replay the event from the
-- Stripe CLI, or open the subscription screen once so the confirm path runs.
-- ---------------------------------------------------------------------------

begin;

-- Same name, same column, same uniqueness. Only the predicate goes.
drop index if exists public.individual_subscriptions_stripe_idx;

create unique index individual_subscriptions_stripe_idx
  on public.individual_subscriptions (stripe_subscription_id);

comment on index public.individual_subscriptions_stripe_idx is
  'Unique and deliberately NOT partial: a partial index cannot arbitrate the '
  'ON CONFLICT that recordSubscription depends on. Nulls are distinct by '
  'default, so this still allows many rows with no Stripe id.';

commit;

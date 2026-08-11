-- ===========================================================================
-- MiZanova — verify.sql
-- Read-only. Changes nothing. Run it in the SQL Editor any time you want to
-- see the current state of the schema, or after running a numbered script.
-- ===========================================================================

select 'roles defined' as check_name,
       coalesce(string_agg(e.enumlabel, ', ' order by e.enumsortorder), 'MISSING') as result
from pg_type t
left join pg_enum e on e.enumtypid = t.oid
where t.typname = 'user_role'

union all
select 'tables',
       coalesce(string_agg(tablename, ', ' order by tablename), 'none')
from pg_tables
where schemaname = 'public'

union all
select 'row-level security',
       coalesce(string_agg(c.relname || ' = ' ||
                case when c.relrowsecurity then 'ON' else 'OFF ***' end,
                ', ' order by c.relname), 'no tables')
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'

union all
select 'policies',
       coalesce(count(*)::text || ' — ' ||
                string_agg(policyname, ', ' order by policyname),
                'none yet — correct until 004 runs')
from pg_policies
where schemaname = 'public'

union all
select 'signup trigger',
       coalesce(string_agg(tgname, ', '), '*** MISSING ***')
from pg_trigger
where tgname = 'on_auth_user_created' and not tgisinternal

union all
select 'functions',
       coalesce(string_agg(p.proname, ', ' order by p.proname), 'none')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'

union all
select 'generated columns',
       coalesce(string_agg(table_name || '.' || column_name, ', '), 'none')
from information_schema.columns
where table_schema = 'public' and is_generated = 'ALWAYS'

union all
select 'accounts registered',
       count(*)::text
from auth.users;

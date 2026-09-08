import pg from 'pg'
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
const { rows } = await c.query(`
  select grantee, table_name, string_agg(distinct privilege_type, ',' order by privilege_type) p
  from information_schema.role_table_grants
  where grantee in ('anon','authenticated') and table_schema='public'
    and table_name in ('course_catalogue','individual_plan_public')
  group by 1,2 order by 1,2`)
for (const r of rows) console.log(`  ${r.grantee.padEnd(14)} ${r.table_name.padEnd(24)} ${r.p}`)
const { rows: n } = await c.query(`select count(*)::int n from information_schema.role_table_grants where grantee='anon' and table_schema='public'`)
console.log('\n  total anon grants now:', n[0].n, ' (was 91 before db/119, 14 after)')
await c.end()

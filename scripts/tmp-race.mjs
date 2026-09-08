import { createClient } from '@supabase/supabase-js'
const a = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } })
const EMAIL='zz-race@mizanova.test', PASSWORD='Temp!Race2026'
const { data: old } = await a.from('profiles').select('id').eq('email', EMAIL).maybeSingle()
if (old) await a.auth.admin.deleteUser(old.id)
if (process.argv.includes('--remove')) {
  // The auth user may outlive the profile row in this test; clear it by email.
  const { data: users } = await a.auth.admin.listUsers()
  const u = users?.users?.find(x => x.email === EMAIL)
  if (u) await a.auth.admin.deleteUser(u.id)
  console.log('gone'); process.exit(0)
}
const { data: c, error } = await a.auth.admin.createUser({
  email: EMAIL, password: PASSWORD, email_confirm: true,
  user_metadata: { role: 'parent', first_name: 'Race', last_name: 'Case' } })
if (error) throw new Error(error.message)
// Simulate the trigger not having landed: the auth user exists, the profile does not.
await a.from('profiles').delete().eq('id', c.user.id)
const { data: check } = await a.from('profiles').select('id').eq('id', c.user.id).maybeSingle()
console.log(`auth user exists, profile row: ${check ? 'STILL THERE' : 'absent'}`)
console.log(`${EMAIL} / ${PASSWORD}`)

import { createClient } from '@supabase/supabase-js'
const a = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } })
const EMAIL='zz-ghost@mizanova.test', PASSWORD='Temp!Ghost2026'
const { data: old } = await a.from('profiles').select('id').eq('email', EMAIL).maybeSingle()
if (old) await a.auth.admin.deleteUser(old.id)
if (process.argv.includes('--remove')) { console.log('gone'); process.exit(0) }
const { data: arlo } = await a.from('students').select('id, school_id').eq('first_name','Arlo').single()
const { data: c, error } = await a.auth.admin.createUser({
  email: EMAIL, password: PASSWORD, email_confirm: true,
  user_metadata: { role: 'parent', first_name: 'Ghost', last_name: 'Account' } })
if (error) throw new Error(error.message)
await a.from('student_guardians').upsert(
  { student_id: arlo.id, profile_id: c.user.id, relationship: 'parent' },
  { onConflict: 'student_id,profile_id' })
console.log(`created ${EMAIL} / ${PASSWORD}  id=${c.user.id}`)

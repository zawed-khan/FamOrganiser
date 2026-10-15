// Netlify Function: the family admin creates a person's login, or resets their PIN.
//
// Why a server: creating someone else's login needs Supabase's powerful "service role" key, which must never
// be inside the phone app. It lives only in Netlify as the secret SUPABASE_SERVICE_ROLE_KEY.
// The function first checks that the caller is signed in AND is the admin of the family they name.
//
// POST /api/members   (header: Authorization: Bearer <the signed-in person's access token>)
//   { action: 'create', family_id, name, pin, role, relation }  -> { user_id, login_name, display_name }
//   { action: 'reset_pin', family_id, user_id, pin }            -> { ok: true }
import { createClient } from '@supabase/supabase-js'

export const config = { path: '/api/members' }

const ROLES = ['adult', 'teen', 'child', 'guest']

// Same rules as src/core/loginName.ts and src/core/pin.ts (checked against each other in tests/members.test.mjs)
export const toLoginName = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')
export const placeholderEmail = (loginName) => `${loginName}@example.com`
export const pinToPassword = (pin) => `${pin}-family-manager`

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** `makeClient` is a parameter only so the tests can swap in a fake Supabase. */
export async function handle(req, env, makeClient = createClient) {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL
  const anon = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
  const service = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon) return json({ error: 'The server is not set up yet (missing the Supabase address).' }, 500)
  if (!service) return json({ error: 'The server is not set up yet. The owner must add SUPABASE_SERVICE_ROLE_KEY in Netlify.' }, 500)

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Please sign in again.' }, 401)
  let body
  try { body = await req.json() } catch { return json({ error: 'Bad request.' }, 400) }

  const noSession = { persistSession: false, autoRefreshToken: false }
  const asUser = makeClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: noSession })
  const { data: who, error: whoError } = await asUser.auth.getUser(token)
  if (whoError || !who?.user) return json({ error: 'Please sign in again.' }, 401)

  const familyId = String(body.family_id ?? '')
  const { data: isAdmin, error: adminError } = await asUser.rpc('is_family_admin', { fid: familyId })
  if (adminError || isAdmin !== true) return json({ error: 'Only the family admin can do this.' }, 403)

  const admin = makeClient(url, service, { auth: noSession })
  const pin = String(body.pin ?? '')
  if (!/^\d{4}$/.test(pin)) return json({ error: 'The PIN must be exactly 4 digits.' }, 400)

  if (body.action === 'create') return create(admin, familyId, body, pin)
  if (body.action === 'reset_pin') return resetPin(admin, familyId, String(body.user_id ?? ''), pin)
  return json({ error: 'Unknown action.' }, 400)
}

async function create(admin, familyId, body, pin) {
  const name = String(body.name ?? '').trim()
  const role = String(body.role ?? '')
  const relation = String(body.relation ?? '').trim().slice(0, 30)
  if (!name || name.length > 40) return json({ error: 'Please type a name (up to 40 letters).' }, 400)
  const login = toLoginName(name)
  if (login.length < 3 || login.length > 30) return json({ error: 'Please use a name with at least 3 letters or numbers.' }, 400)
  if (!ROLES.includes(role)) return json({ error: 'Choose adult, teen, child or guest.' }, 400)

  const { data: taken } = await admin.from('profiles').select('id').eq('username', login).maybeSingle()
  if (taken) return json({ error: 'Someone already uses that name. Add a surname or a number.' }, 409)

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: placeholderEmail(login), password: pinToPassword(pin), email_confirm: true,
    user_metadata: { name, username: login },
  })
  if (createError || !created?.user) return json({ error: 'That name could not be used. Try adding a surname.' }, 409)

  const { error: memberError } = await admin.from('members')
    .insert({ family_id: familyId, user_id: created.user.id, role, relation })
  if (memberError) {
    await admin.auth.admin.deleteUser(created.user.id) // leave nothing half-made
    return json({ error: 'Could not add them. Nothing was changed.' }, 500)
  }
  return json({ user_id: created.user.id, login_name: login, display_name: name })
}

async function resetPin(admin, familyId, userId, pin) {
  const { data: member } = await admin.from('members').select('role').eq('family_id', familyId).eq('user_id', userId).maybeSingle()
  if (!member) return json({ error: 'That person is not in your family.' }, 404)
  if (member.role === 'admin') return json({ error: 'Use 👤 at the top to change your own PIN.' }, 403)
  const { error } = await admin.auth.admin.updateUserById(userId, { password: pinToPassword(pin) })
  if (error) return json({ error: 'Could not change the PIN.' }, 500)
  return json({ ok: true })
}

export default (req) => handle(req, process.env)

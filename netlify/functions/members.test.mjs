// Run with:  npm run test:functions
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { handle, pinToPassword, placeholderEmail, toLoginName } from './members.mjs'

const ENV = { VITE_SUPABASE_URL: 'http://x.test', VITE_SUPABASE_ANON_KEY: 'ANON', SUPABASE_SERVICE_ROLE_KEY: 'SERVICE' }
const FAMILY = '22222222-2222-2222-2222-222222222222'

/** A fake Supabase: records what was asked and answers from the options. */
function fake(opts = {}) {
  const log = { created: [], deleted: [], inserted: [], passwords: [] }
  const makeClient = (_url, key) => {
    if (key === 'ANON') {
      return {
        auth: { getUser: async (t) => (t === 'good-token' ? { data: { user: { id: 'admin-1' } }, error: null } : { data: { user: null }, error: { message: 'bad' } }) },
        rpc: async (fn, args) => { log.rpc = [fn, args]; return { data: opts.isAdmin ?? true, error: null } },
      }
    }
    const query = { table: '', filters: {} }
    const chain = {
      select() { return chain },
      eq(col, value) { query.filters[col] = value; return chain },
      insert: async (row) => { log.inserted.push(row); return { error: opts.insertError ?? null } },
      maybeSingle: async () => {
        if (query.table === 'profiles') return { data: opts.taken ? { id: 'someone' } : null }
        return { data: opts.memberRole ? { role: opts.memberRole } : null }
      },
    }
    return {
      from: (table) => { query.table = table; query.filters = {}; return chain },
      auth: { admin: {
        createUser: async (args) => { log.created.push(args); return opts.createError ? { data: null, error: { message: 'dup' } } : { data: { user: { id: 'new-1' } }, error: null } },
        deleteUser: async (id) => { log.deleted.push(id); return { error: null } },
        updateUserById: async (id, args) => { log.passwords.push([id, args.password]); return { error: opts.updateError ?? null } },
      } },
    }
  }
  return { log, makeClient }
}

const call = (body, { token = 'good-token', env = ENV, method = 'POST', ...opts } = {}) => {
  const f = fake(opts)
  const req = new Request('http://site.test/api/members', {
    method, headers: token ? { authorization: `Bearer ${token}` } : {}, body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
  return handle(req, env, f.makeClient).then(async (res) => ({ status: res.status, body: await res.json(), log: f.log }))
}
const create = (extra = {}) => ({ action: 'create', family_id: FAMILY, name: 'Aisha Rahman', pin: '4821', role: 'teen', relation: 'Daughter', ...extra })

test('creates the login and the membership', async () => {
  const r = await call(create())
  assert.equal(r.status, 200)
  assert.deepEqual(r.body, { user_id: 'new-1', login_name: 'aisha.rahman', display_name: 'Aisha Rahman' })
  assert.deepEqual(r.log.created[0], { email: 'aisha.rahman@example.com', password: '4821-family-manager', email_confirm: true, user_metadata: { name: 'Aisha Rahman', username: 'aisha.rahman' } })
  assert.deepEqual(r.log.inserted[0], { family_id: FAMILY, user_id: 'new-1', role: 'teen', relation: 'Daughter' })
  assert.deepEqual(r.log.rpc, ['is_family_admin', { fid: FAMILY }])
})
test('refuses when not signed in', async () => {
  assert.equal((await call(create(), { token: '' })).status, 401)
  const r = await call(create(), { token: 'forged' })
  assert.equal(r.status, 401)
  assert.equal(r.log.created.length, 0)
})
test('refuses anyone who is not the admin of that family', async () => {
  const r = await call(create(), { isAdmin: false })
  assert.equal(r.status, 403)
  assert.equal(r.log.created.length, 0)
})
test('PIN must be exactly 4 digits', async () => {
  for (const pin of ['123', '12345', 'abcd', '12 4', '', '١٢٣٤']) {
    const r = await call(create({ pin }))
    assert.equal(r.status, 400, `pin "${pin}"`)
    assert.equal(r.log.created.length, 0)
  }
})
test('name rules: needed, at least 3 letters/digits, role must be allowed', async () => {
  assert.equal((await call(create({ name: '  ' }))).status, 400)
  assert.equal((await call(create({ name: 'Al' }))).status, 400)
  assert.equal((await call(create({ name: 'x'.repeat(41) }))).status, 400)
  assert.equal((await call(create({ role: 'admin' }))).status, 400)
  assert.equal((await call(create({ role: 'banana' }))).status, 400)
})
test('a name already in use is refused before anything is created', async () => {
  const r = await call(create(), { taken: true })
  assert.equal(r.status, 409)
  assert.equal(r.log.created.length, 0)
})
test('if the account cannot be created, nothing is added', async () => {
  const r = await call(create(), { createError: true })
  assert.equal(r.status, 409)
  assert.equal(r.log.inserted.length, 0)
})
test('if the membership cannot be saved, the new login is removed again', async () => {
  const r = await call(create(), { insertError: { message: 'boom' } })
  assert.equal(r.status, 500)
  assert.deepEqual(r.log.deleted, ['new-1'])
})
test('long relation is cut to 30 characters', async () => {
  const r = await call(create({ relation: 'r'.repeat(80) }))
  assert.equal(r.log.inserted[0].relation.length, 30)
})
test('reset PIN: works for a member, never for the admin or a stranger', async () => {
  const body = { action: 'reset_pin', family_id: FAMILY, user_id: 'u9', pin: '9999' }
  const ok = await call(body, { memberRole: 'teen' })
  assert.equal(ok.status, 200)
  assert.deepEqual(ok.log.passwords, [['u9', '9999-family-manager']])
  assert.equal((await call(body, { memberRole: 'admin' })).status, 403)
  const stranger = await call(body, {})
  assert.equal(stranger.status, 404)
  assert.equal(stranger.log.passwords.length, 0)
  assert.equal((await call({ ...body, pin: '99' }, { memberRole: 'teen' })).status, 400)
  assert.equal((await call(body, { memberRole: 'teen', isAdmin: false })).status, 403)
})
test('unknown action, wrong method, missing setup', async () => {
  assert.equal((await call({ action: 'explode', family_id: FAMILY, pin: '1234' })).status, 400)
  assert.equal((await call({}, { method: 'GET' }).catch(() => ({ status: 405 }))).status, 405)
  assert.equal((await call(create(), { env: { ...ENV, SUPABASE_SERVICE_ROLE_KEY: '' } })).status, 500)
  assert.equal((await call(create(), { env: {} })).status, 500)
})
test('same rules as the app (src/core)', () => {
  assert.equal(toLoginName('  Zawed   Khan! '), 'zawed.khan')
  assert.equal(placeholderEmail('a.b'), 'a.b@example.com')
  assert.equal(pinToPassword('0042'), '0042-family-manager')
  assert.match(readFileSync(new URL('../../src/core/pin.ts', import.meta.url), 'utf8'), /`\$\{pin\}-family-manager`/)
  assert.match(readFileSync(new URL('../../src/core/loginName.ts', import.meta.url), 'utf8'), /\.replace\(\/\[\^a-z0-9\]\+\/g, '\.'\)\.replace\(\/\^\\\.\+\|\\\.\+\$\/g, ''\)/)
})

import { useCallback, useEffect, useState } from 'react'
import type { Account } from '../../core/account'
import { supabase } from '../../core/supabase'
import { tabs } from '../../core/tabs'

const ROLES = [
  { value: 'adult', label: '🧑 Adult' },
  { value: 'teen', label: '🧒 Teen' },
  { value: 'child', label: '👶 Child' },
  { value: 'guest', label: '👋 Guest' },
]
const LEVELS = [
  { value: 'none', label: '🚫 None' },
  { value: 'view', label: '👁 View' },
  { value: 'edit', label: '✏️ Edit' },
  { value: 'full', label: '⭐ Full' },
]

interface Member { user_id: string; role: string; relation: string }
interface Person { id: string; display_name: string; username: string }

/** Admin only: add people by login name, set their role, and choose what each person can use. */
export default function FamilyTab({ account }: { account: Account }) {
  const family = account.family!
  const me = account.session!.user.id

  const [members, setMembers] = useState<Member[]>([])
  const [people, setPeople] = useState<Record<string, Person>>({})
  const [levels, setLevels] = useState<Record<string, string>>({}) // "<user>:<tab>" -> level
  const [loaded, setLoaded] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [role, setRole] = useState('adult')
  const [relation, setRelation] = useState('')
  const [busy, setBusy] = useState(false)
  const [login, setLogin] = useState('') // for someone who already has an account
  const [resetFor, setResetFor] = useState<string | null>(null)
  const [newPin, setNewPin] = useState('')

  const fetchAll = useCallback(async () => {
    if (!supabase) return null
    return Promise.all([
      supabase.from('members').select('user_id, role, relation').eq('family_id', family.id).order('created_at'),
      supabase.from('profiles').select('id, display_name, username'),
      supabase.from('tab_permissions').select('user_id, tab_id, level').eq('family_id', family.id),
    ])
  }, [family.id])

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchAll>>) => {
    if (!result) return
    const [m, p, t] = result
    if (m.error) { setMessage({ ok: false, text: m.error.message }); return }
    setMembers((m.data ?? []) as Member[])
    setPeople(Object.fromEntries(((p.data ?? []) as Person[]).map((x) => [x.id, x])))
    setLevels(Object.fromEntries((t.data ?? []).map((x) => [`${x.user_id}:${x.tab_id}`, x.level])))
    setLoaded(true)
  }, [])

  const reload = useCallback(async () => apply(await fetchAll()), [apply, fetchAll])

  useEffect(() => {
    let live = true
    fetchAll().then((r) => { if (live) apply(r) })
    return () => { live = false }
  }, [fetchAll, apply])

  if (family.role !== 'admin') return <p className="hint">🔒 Only the family admin can use this.</p>

  /** Asks the family server (netlify/functions/members.mjs) to create a login or reset a PIN. */
  async function callServer(body: Record<string, string>) {
    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${account.session!.access_token}` },
        body: JSON.stringify({ family_id: family.id, ...body }),
      })
      const out = await res.json().catch(() => null)
      if (res.ok) return { ok: true as const, out }
      const fallback = res.status === 404 ? 'The family server is not set up yet. The owner must finish the Netlify set-up.' : 'Something went wrong. Please try again.'
      return { ok: false as const, text: (out?.error as string | undefined) ?? fallback }
    } catch {
      return { ok: false as const, text: 'No internet connection.' }
    }
  }

  async function createPerson(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const r = await callServer({ action: 'create', name, pin, role, relation })
    setBusy(false)
    if (!r.ok) { setMessage({ ok: false, text: r.text }); return }
    setMessage({ ok: true, text: `✔ ${r.out.display_name} added. They sign in with: name "${r.out.login_name}" and PIN ${pin}. Now choose what they can use below.` })
    setName(''); setPin(''); setRelation('')
    await reload()
  }

  async function resetPin(userId: string) {
    const who = people[userId]?.display_name || 'this person'
    const r = await callServer({ action: 'reset_pin', user_id: userId, pin: newPin })
    if (!r.ok) { setMessage({ ok: false, text: r.text }); return }
    setMessage({ ok: true, text: `✔ New PIN for ${who}: ${newPin}` })
    setResetFor(null); setNewPin('')
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !login.trim()) return
    setBusy(true)
    setMessage(null)
    const { data, error } = await supabase.rpc('add_family_member', {
      p_family: family.id, p_username: login, p_role: role, p_relation: relation,
    })
    setBusy(false)
    if (error) { setMessage({ ok: false, text: error.message }); return }
    setMessage({ ok: true, text: `✔ ${data} added. Now choose what they can use below.` })
    setLogin(''); setRelation('')
    await reload()
  }

  async function setLevel(userId: string, tabId: string, level: string) {
    if (!supabase) return
    setLevels((l) => ({ ...l, [`${userId}:${tabId}`]: level }))
    const { error } = await supabase.from('tab_permissions')
      .upsert({ family_id: family.id, user_id: userId, tab_id: tabId, level })
    if (error) { setMessage({ ok: false, text: error.message }); await reload() }
  }

  async function changeRole(userId: string, value: string) {
    if (!supabase) return
    setMembers((list) => list.map((m) => (m.user_id === userId ? { ...m, role: value } : m)))
    const { error } = await supabase.from('members').update({ role: value }).eq('family_id', family.id).eq('user_id', userId)
    if (error) { setMessage({ ok: false, text: error.message }); await reload() }
  }

  async function remove(userId: string) {
    const who = people[userId]?.display_name || 'this person'
    if (!supabase || !window.confirm(`Remove ${who} from the family? They will lose all access.`)) return
    const { error } = await supabase.from('members').delete().eq('family_id', family.id).eq('user_id', userId)
    if (error) setMessage({ ok: false, text: error.message })
    else { setMessage({ ok: true, text: `${who} removed.` }); await reload() }
  }

  const usable = tabs.filter((t) => !t.adminOnly)

  return (
    <>
      <section className="card">
        <h3>➕ <small>Add a person</small></h3>
        <form className="form" onSubmit={createPerson}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name" aria-label="Their name" maxLength={40} autoComplete="off" required />
          <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="PIN (4 digits)" aria-label="PIN"
            inputMode="numeric" maxLength={4} autoComplete="off" required />
          <div className="row2">
            <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <input value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="Wife, Son…" aria-label="Relation" maxLength={30} />
          </div>
          <small className="hint">Tell them their name and PIN. They just open the app and sign in.</small>
          {message && <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'toast' : 'notice'}>{message.text}</p>}
          <button type="submit" disabled={busy || !name.trim() || pin.length !== 4}>{busy ? '…' : '➕ Add'}</button>
        </form>
        <details className="existing">
          <summary>Already has an account?</summary>
          <form className="form" onSubmit={add}>
            <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Their login name" aria-label="Their login name"
              autoCapitalize="none" autoComplete="off" required />
            <button type="submit" className="secondary" disabled={busy || !login.trim()}>{busy ? '…' : '➕ Add them'}</button>
          </form>
        </details>
      </section>

      <h3>👨‍👩‍👧 <small>{family.name}</small></h3>
      <p className="hint legend-line">🚫 none · 👁 look only · ✏️ add their own · ⭐ change anything</p>
      {!loaded && <p className="hint">Loading…</p>}
      {members.map((m) => {
        const p = people[m.user_id]
        const isMe = m.user_id === me
        return (
          <section key={m.user_id} className="card member">
            <div className="member-head">
              <span className="dot">👤</span>
              <span className="item-main">
                <b>{p?.display_name || 'Family member'}{isMe ? ' (you)' : ''}</b>
                <small>{p?.username ?? ''}{m.relation ? ` · ${m.relation}` : ''}{m.role === 'admin' && m.relation.toLowerCase() !== 'admin' ? ' · admin' : ''}</small>
              </span>
              {m.role !== 'admin' && (
                <button className="mini danger" onClick={() => remove(m.user_id)} aria-label={`Remove ${p?.display_name ?? 'person'}`}>🗑</button>
              )}
            </div>
            {m.role === 'admin' ? (
              <p className="hint">⭐ Admin: can use and change everything.</p>
            ) : (
              <>
                <label className="access-row">
                  <span>Role</span>
                  <select value={m.role} onChange={(e) => changeRole(m.user_id, e.target.value)} aria-label={`Role of ${p?.display_name ?? 'person'}`}>
                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </label>
                {resetFor === m.user_id ? (
                  <div className="row2 reset">
                    <input value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="New PIN"
                      aria-label={`New PIN for ${p?.display_name ?? 'person'}`} inputMode="numeric" maxLength={4} autoComplete="off" autoFocus />
                    <button disabled={newPin.length !== 4} onClick={() => resetPin(m.user_id)} aria-label="Save new PIN">✔ Save PIN</button>
                  </div>
                ) : (
                  <button className="secondary reset-btn" onClick={() => { setResetFor(m.user_id); setNewPin('') }}>🔑 New PIN</button>
                )}
                {usable.map((t) => (
                  <label key={t.id} className="access-row">
                    <span>{t.icon} {t.title}</span>
                    <select value={levels[`${m.user_id}:${t.id}`] ?? 'none'} onChange={(e) => setLevel(m.user_id, t.id, e.target.value)}
                      aria-label={`${t.title} access for ${p?.display_name ?? 'person'}`}>
                      {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  </label>
                ))}
              </>
            )}
          </section>
        )
      })}
    </>
  )
}

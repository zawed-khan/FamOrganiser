import { useState } from 'react'
import { toLoginName } from '../core/loginName'
import { isPin, pinToPassword } from '../core/pin'
import { supabase } from '../core/supabase'

/** Sign in with a name and a 4-digit PIN given by the family admin. (An old email + password still works.) */
export default function AuthScreen() {
  const [who, setWho] = useState('')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const usingEmail = who.includes('@')

  async function signIn() {
    if (!supabase) return
    let email = who.trim()
    if (!usingEmail) {
      // turn the name into the account's email, then use the normal email + password sign-in
      const { data } = await supabase.rpc('login_email', { p_username: toLoginName(email) })
      if (!data) return 'Wrong name or PIN.'
      email = data as string
    }
    // a 4-digit PIN gets its fixed ending added; anything else (an older password) is used as typed
    const password = isPin(secret) && !usingEmail ? pinToPassword(secret) : secret
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? (error.message === 'Invalid login credentials' ? 'Wrong name or PIN.' : error.message) : ''
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    const problem = await signIn()
    setBusy(false)
    if (problem) setMessage(problem)
  }

  return (
    <section className="panel">
      <h2>Welcome</h2>
      <form onSubmit={submit} className="form">
        <label>
          👤 Name
          <input value={who} onChange={(e) => setWho(e.target.value)} required maxLength={60} autoComplete="username" autoCapitalize="none" placeholder="Your name" />
        </label>
        <label>
          🔑 {usingEmail ? 'Password' : 'PIN'}
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} required
            inputMode={usingEmail ? 'text' : 'numeric'} maxLength={usingEmail ? 72 : 4} autoComplete="current-password"
            placeholder={usingEmail ? 'Password' : '4 digits'} />
        </label>
        {message && <p role="alert" className="notice">{message}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Please wait…' : 'Sign in'}</button>
        <small className="hint">Your name and PIN are given by the family admin.</small>
      </form>
    </section>
  )
}

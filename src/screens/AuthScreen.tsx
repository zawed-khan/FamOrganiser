import { useState } from 'react'
import { LOGIN_NAME_MIN, placeholderEmail, toLoginName } from '../core/loginName'
import { supabase } from '../core/supabase'

/** Sign in or create an account with a name and a password. (An email still works for sign-in.) */
export default function AuthScreen() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [who, setWho] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const loginName = toLoginName(who)

  async function signIn() {
    if (!supabase) return
    let email = who.trim()
    if (!email.includes('@')) {
      // turn the name into the account's email, then use the normal email + password sign-in
      const { data } = await supabase.rpc('login_email', { p_username: toLoginName(email) })
      if (!data) return 'Wrong name or password.'
      email = data as string
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? (error.message === 'Invalid login credentials' ? 'Wrong name or password.' : error.message) : ''
  }

  async function signUp() {
    if (!supabase) return
    if (loginName.length < LOGIN_NAME_MIN) return `Please type a name with at least ${LOGIN_NAME_MIN} letters or numbers.`
    const { data: free } = await supabase.rpc('username_available', { p_username: loginName })
    if (free === false) return 'Someone already uses that name. Add your surname or a number.'
    const { data, error } = await supabase.auth.signUp({
      email: placeholderEmail(loginName), password, options: { data: { name: who.trim(), username: loginName } },
    })
    if (error) return error.message
    if (!data.session) return 'Account created, but sign-in is waiting for email confirmation. Ask the admin to switch "Confirm email" off in Supabase.'
    return ''
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    const problem = mode === 'in' ? await signIn() : await signUp()
    setBusy(false)
    if (problem) setMessage(problem)
  }

  return (
    <section className="panel">
      <h2>{mode === 'in' ? 'Welcome back' : 'Create your account'}</h2>
      <form onSubmit={submit} className="form">
        <label>
          {mode === 'in' ? '👤 Name' : '👤 Your name'}
          <input value={who} onChange={(e) => setWho(e.target.value)} required maxLength={40} autoComplete="username"
            placeholder={mode === 'in' ? 'Your name' : 'e.g. Zawed Khan'} />
        </label>
        {mode === 'up' && loginName && <small className="hint">You will sign in with: <b>{loginName}</b></small>}
        <label>
          🔑 Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          />
        </label>
        {message && <p role="alert" className="notice">{message}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="secondary" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMessage('') }}>
          {mode === 'in' ? 'I am new — create account' : 'I already have an account'}
        </button>
      </form>
    </section>
  )
}

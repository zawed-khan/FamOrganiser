import { useState } from 'react'
import { supabase } from '../core/supabase'

/** Plain email + password sign in / create account, with big friendly controls. */
export default function AuthScreen() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setMessage('')
    const { data, error } =
      mode === 'in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { name: name.trim() } } })
    setBusy(false)
    if (error) setMessage(error.message)
    else if (mode === 'up' && data.session && name.trim()) {
      await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', data.session.user.id)
    } else if (mode === 'up' && !data.session) setMessage('Account created. Please check your email to confirm it, then sign in.')
  }

  return (
    <section className="panel">
      <h2>{mode === 'in' ? 'Welcome back' : 'Create your account'}</h2>
      <form onSubmit={submit} className="form">
        {mode === 'up' && (
          <label>
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Password
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

import { useState } from 'react'
import type { Account } from '../core/account'
import { Sheet } from '../core/Sheet'
import { toLoginName } from '../core/loginName'

/** Change the name the app shows for you, the name you sign in with, and your password. */
export default function ProfileSheet({ account, onClose }: { account: Account; onClose: () => void }) {
  const [name, setName] = useState(account.name)
  const [login, setLogin] = useState(account.username)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [pwMessage, setPwMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwBusy, setPwBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const msg = await account.saveProfile(name, login)
    setBusy(false)
    if (msg) setError(msg)
    else onClose()
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    if (password !== again) { setPwMessage({ ok: false, text: 'The two passwords are not the same.' }); return }
    setPwBusy(true)
    const msg = await account.changePassword(password)
    setPwBusy(false)
    if (msg) setPwMessage({ ok: false, text: msg })
    else { setPwMessage({ ok: true, text: '✔ Password changed.' }); setPassword(''); setAgain('') }
  }

  return (
    <Sheet title="👤 You" onClose={onClose}>
      <form className="form" onSubmit={save}>
        <label>
          Name
          <input value={name} maxLength={40} autoFocus placeholder="Name" onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          🔑 Sign in with
          <input value={login} maxLength={30} placeholder="login name" autoCapitalize="none" onChange={(e) => setLogin(e.target.value)} />
        </label>
        {toLoginName(login) !== login && login && <small className="hint">Will be saved as <b>{toLoginName(login)}</b></small>}
        {error && <p role="alert" className="notice">{error}</p>}
        <div className="btn-row">
          <button type="submit" disabled={busy}>{busy ? '…' : '✔ Save'}</button>
        </div>
      </form>

      <form className="form pw" onSubmit={savePassword}>
        <h3>🔒 <small>Change password</small></h3>
        <input type="password" value={password} autoComplete="new-password" placeholder="New password (8+ characters)"
          aria-label="New password" onChange={(e) => setPassword(e.target.value)} />
        <input type="password" value={again} autoComplete="new-password" placeholder="Type it again"
          aria-label="New password again" onChange={(e) => setAgain(e.target.value)} />
        {pwMessage && <p role={pwMessage.ok ? 'status' : 'alert'} className={pwMessage.ok ? 'toast' : 'notice'}>{pwMessage.text}</p>}
        <div className="btn-row">
          <button type="submit" className="secondary" disabled={pwBusy || !password}>{pwBusy ? '…' : '🔒 Change password'}</button>
        </div>
      </form>
    </Sheet>
  )
}

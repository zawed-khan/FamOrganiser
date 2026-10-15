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

  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [pinMessage, setPinMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pinBusy, setPinBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const msg = await account.saveProfile(name, login)
    setBusy(false)
    if (msg) setError(msg)
    else onClose()
  }

  async function savePin(e: React.FormEvent) {
    e.preventDefault()
    if (pin !== again) { setPinMessage({ ok: false, text: 'The two PINs are not the same.' }); return }
    setPinBusy(true)
    const msg = await account.changePin(pin)
    setPinBusy(false)
    if (msg) setPinMessage({ ok: false, text: msg })
    else { setPinMessage({ ok: true, text: '✔ PIN changed.' }); setPin(''); setAgain('') }
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

      <form className="form pw" onSubmit={savePin}>
        <h3>🔒 <small>Change PIN</small></h3>
        <input type="password" inputMode="numeric" maxLength={4} value={pin} autoComplete="new-password" placeholder="New PIN (4 digits)"
          aria-label="New PIN" onChange={(e) => setPin(e.target.value)} />
        <input type="password" inputMode="numeric" maxLength={4} value={again} autoComplete="new-password" placeholder="Type it again"
          aria-label="New PIN again" onChange={(e) => setAgain(e.target.value)} />
        {pinMessage && <p role={pinMessage.ok ? 'status' : 'alert'} className={pinMessage.ok ? 'toast' : 'notice'}>{pinMessage.text}</p>}
        <div className="btn-row">
          <button type="submit" className="secondary" disabled={pinBusy || !pin}>{pinBusy ? '…' : '🔒 Change PIN'}</button>
        </div>
      </form>
    </Sheet>
  )
}

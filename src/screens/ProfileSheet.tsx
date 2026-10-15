import { useState } from 'react'
import type { Account } from '../core/account'
import { Sheet } from '../core/Sheet'
import { toLoginName } from '../core/loginName'

/** Change the name the app shows for you, and the name you sign in with. */
export default function ProfileSheet({ account, onClose }: { account: Account; onClose: () => void }) {
  const [name, setName] = useState(account.name)
  const [login, setLogin] = useState(account.username)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const msg = await account.saveProfile(name, login)
    setBusy(false)
    if (msg) setError(msg)
    else onClose()
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
    </Sheet>
  )
}

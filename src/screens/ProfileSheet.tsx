import { useState } from 'react'
import type { Account } from '../core/account'
import { Sheet } from '../core/Sheet'

/** Change the name the app shows for you. */
export default function ProfileSheet({ account, onClose }: { account: Account; onClose: () => void }) {
  const [name, setName] = useState(account.name)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const msg = await account.setName(name)
    setBusy(false)
    if (msg) setError(msg)
    else onClose()
  }

  return (
    <Sheet title="👤 Your name" onClose={onClose}>
      <form className="form" onSubmit={save}>
        <input value={name} maxLength={40} autoFocus placeholder="Name" aria-label="Your name" onChange={(e) => setName(e.target.value)} />
        <small className="hint">{account.session?.user.email}</small>
        {error && <p role="alert" className="notice">{error}</p>}
        <div className="btn-row">
          <button type="submit" disabled={busy}>{busy ? '…' : '✔ Save'}</button>
        </div>
      </form>
    </Sheet>
  )
}

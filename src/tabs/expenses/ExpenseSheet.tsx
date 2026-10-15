import { useEffect, useState } from 'react'
import { receiptUrl, type ExpensesData } from './data'
import type { Currency, QueuedExpense } from './types'
import { Sheet } from '../../core/Sheet'
import { categoryLook, compressImage, dayLabel, money } from './util'

function readLocalPhoto(id: string) {
  try { return localStorage.getItem(`fm.expenses.receipt.${id}`) } catch { return null }
}

/** One expense: look at it, see the receipt, edit or delete it. */
export default function ExpenseSheet({ data, expense, onClose }: { data: ExpensesData; expense: QueuedExpense; onClose: () => void }) {
  const waiting = data.queue.some((q) => q.id === expense.id)
  const mine = expense.user_id === data.userId
  const canChange = !waiting && data.canAdd && (data.canManage || mine)
  const look = categoryLook(data.cats, expense.category)

  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [remoteReceipt, setRemoteReceipt] = useState<string | null>(null)
  // a photo still waiting to upload is only on this phone
  const receipt = waiting ? readLocalPhoto(expense.id) : remoteReceipt

  const [amount, setAmount] = useState(String(expense.amount))
  const [currency, setCurrency] = useState<Currency>(expense.currency)
  const [category, setCategory] = useState(expense.category)
  const [sub, setSub] = useState(expense.subcategory)
  const [note, setNote] = useState(expense.note)
  const [date, setDate] = useState(expense.spent_on)
  const [isPrivate, setIsPrivate] = useState(expense.is_private)
  const [photo, setPhoto] = useState('')

  useEffect(() => {
    let live = true
    if (!waiting && expense.receipt_path) receiptUrl(expense.receipt_path).then((u) => { if (live) setRemoteReceipt(u) })
    return () => { live = false }
  }, [expense.receipt_path, waiting])

  const tops = data.cats.filter((c) => !c.parent_id)
  const parent = tops.find((c) => c.name === category)
  const subs = data.cats.filter((c) => c.parent_id && c.parent_id === parent?.id)

  async function save() {
    const value = Number(amount)
    if (!(value > 0)) { setError('Type an amount bigger than zero.'); return }
    setBusy(true)
    const msg = await data.updateExpense(expense, {
      amount: Math.round(value * 100) / 100, currency, category, subcategory: sub, note: note.trim(), spent_on: date, is_private: isPrivate,
    }, photo || undefined)
    setBusy(false)
    if (msg) setError(navigator.onLine ? msg : 'Connect to the internet to change this.')
    else onClose()
  }

  async function remove() {
    if (!window.confirm('Delete this expense?')) return
    const msg = await data.deleteExpense(expense)
    if (msg) setError(msg)
    else onClose()
  }

  if (editing) {
    return (
      <Sheet title="✏️ Edit" onClose={onClose}>
        <div className="form">
          <div className="row2">
            <input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
            <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} aria-label="Money">
              <option value="SAR">SAR</option><option value="INR">₹ INR</option>
            </select>
          </div>
          <div className="row2">
            <select value={category} onChange={(e) => { setCategory(e.target.value); setSub('') }} aria-label="Category">
              {!tops.some((c) => c.name === category) && <option>{category}</option>}
              {tops.map((c) => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
            </select>
            <select value={sub} onChange={(e) => setSub(e.target.value)} aria-label="Sub-category">
              <option value="">—</option>
              {sub && !subs.some((c) => c.name === sub) && <option>{sub}</option>}
              {subs.map((c) => <option key={c.id}>{c.name}</option>)}
            </select>
          </div>
          <input value={note} maxLength={120} placeholder="📝 Note" onChange={(e) => setNote(e.target.value)} aria-label="Note" />
          <div className="row2">
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
            <label className="chip">📷{photo ? ' ✔' : expense.receipt_path ? ' ⟳' : ''}
              <input type="file" accept="image/*" hidden aria-label="Receipt photo"
                onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { setPhoto(await compressImage(f)) } catch { setError('Could not read that photo.') } } e.target.value = '' }} />
            </label>
          </div>
          <label className="check"><input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} /> 🔒 Private</label>
          {error && <p role="alert" className="notice">{error}</p>}
          <div className="btn-row">
            <button className="secondary" onClick={() => setEditing(false)} aria-label="Cancel">✕</button>
            <button onClick={save} disabled={busy}>{busy ? '…' : '✔ Save'}</button>
          </div>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet title={`${look.icon} ${expense.category}${expense.subcategory ? ` › ${expense.subcategory}` : ''}`} onClose={onClose}>
      <p className="big-amount">{money(expense.amount, expense.currency)}</p>
      <div className="facts">
        <span>📅 {dayLabel(expense.spent_on)}</span>
        <span>👤 {data.names[expense.user_id] ?? 'Family member'}</span>
        {expense.is_private && <span>🔒</span>}
        {waiting && <span>⏳ waiting to upload</span>}
      </div>
      {expense.note && <p>📝 {expense.note}</p>}
      {receipt && <a href={receipt} target="_blank" rel="noreferrer"><img className="receipt" src={receipt} alt="Receipt" /></a>}
      {error && <p role="alert" className="notice">{error}</p>}
      {!data.canDelete(expense) && (
        <p className="hint">🔒 {data.level < 2 ? 'You can only look at expenses.' : 'Only the person who added this, or the admin, can delete it.'}</p>
      )}
      <div className="btn-row">
        {data.canDelete(expense) && <button className="secondary danger" onClick={remove} aria-label="Delete">🗑</button>}
        {canChange && <button onClick={() => setEditing(true)} aria-label="Edit">✏️ Edit</button>}
      </div>
    </Sheet>
  )
}

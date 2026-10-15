import { useState } from 'react'
import type { ExpensesData } from './data'
import type { Category } from './types'
import { Sheet } from '../../core/Sheet'

const ICONS = ['🍔', '🍕', '☕', '🛒', '🥦', '🍎', '🥩', '🚗', '⛽', '🚕', '🚌', '✈️', '🧾', '💡', '💧', '📱', '🌐', '🏠', '🔧', '🛋️',
  '🎒', '📚', '💊', '🩺', '🦷', '🛍️', '👕', '💻', '🎉', '🎬', '🎮', '🎁', '🐶', '👶', '💇', '🏋️', '🕌', '🤲', '💰', '🏦', '📦', '🏷️']
const COLORS = ['#f97316', '#16a34a', '#2563eb', '#7c3aed', '#0d9488', '#0ea5e9', '#dc2626', '#db2777', '#ca8a04', '#64748b']

/** Create, rename or delete a category (or a sub-category when `parent` is given). */
export default function CategorySheet({ data, edit, parent, onClose, onSaved }: {
  data: ExpensesData
  edit?: Category
  parent?: Category | null
  onClose: () => void
  onSaved?: (name: string) => void
}) {
  const par = edit ? data.cats.find((c) => c.id === edit.parent_id) ?? null : parent ?? null
  const [name, setName] = useState(edit?.name ?? '')
  const [icon, setIcon] = useState(edit?.icon ?? (par ? '' : '🏷️'))
  const [color, setColor] = useState(edit?.color ?? par?.color ?? COLORS[3])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    const n = name.trim()
    if (!n) { setError('Type a name.'); return }
    setBusy(true)
    const msg = edit
      ? await data.updateCategory(edit, { name: n, icon, color })
      : await data.addCategory({ name: n, icon, color, parent_id: par?.id ?? null })
    setBusy(false)
    if (msg) { setError(msg); return }
    onSaved?.(n)
    onClose()
  }

  async function remove() {
    if (!edit) return
    const subs = data.cats.filter((c) => c.parent_id === edit.id).length
    const warn = `Delete “${edit.name}”${subs ? ` and its ${subs} sub-categories` : ''}? Old expenses keep their name.`
    if (!window.confirm(warn)) return
    const msg = await data.removeCategory(edit)
    if (msg) setError(msg)
    else onClose()
  }

  return (
    <Sheet title={edit ? '✏️ Category' : par ? `＋ Under ${par.icon} ${par.name}` : '＋ New category'} onClose={onClose}>
      <div className="form">
        <label>
          <span className="lbl">🔤</span>
          <input value={name} maxLength={40} placeholder="Name" autoFocus onChange={(e) => setName(e.target.value)} />
        </label>
        <div>
          <div className="emoji-grid">
            {ICONS.map((i) => (
              <button key={i} type="button" className={`emoji ${icon === i ? 'on' : ''}`} onClick={() => setIcon(i)} aria-label={`Icon ${i}`}>{i}</button>
            ))}
          </div>
          <input className="emoji-own" value={icon} maxLength={8} placeholder="or type any emoji" onChange={(e) => setIcon(e.target.value)} />
        </div>
        {!par && (
          <div className="swatches">
            {COLORS.map((c) => (
              <button key={c} type="button" className={`swatch ${color === c ? 'on' : ''}`} style={{ background: c }}
                onClick={() => setColor(c)} aria-label={`Colour ${c}`} />
            ))}
          </div>
        )}
        {error && <p role="alert" className="notice">{error}</p>}
        <div className="btn-row">
          {edit && data.canManage && <button type="button" className="secondary danger" onClick={remove} aria-label="Delete">🗑</button>}
          <button type="button" onClick={save} disabled={busy}>{busy ? '…' : '✔ Save'}</button>
        </div>
      </div>
    </Sheet>
  )
}

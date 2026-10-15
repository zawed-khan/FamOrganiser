import { useMemo, useState } from 'react'
import type { ExpensesData } from './data'
import ExpenseSheet from './ExpenseSheet'
import type { Period, QueuedExpense } from './types'
import { Donut, PeriodBar } from './ui'
import { categoryLook, dayLabel, group, money, num, range, sar, sum } from './util'

/** Totals for the chosen day / week / month, a category ring, and the list (with search and a category filter). */
export default function HomeView({ data, period, onPeriod }: { data: ExpensesData; period: Period; onPeriod: (p: Period) => void }) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [only, setOnly] = useState('')
  const [open, setOpen] = useState<QueuedExpense | null>(null)
  const [error, setError] = useState('')

  async function remove(e: QueuedExpense) {
    if (!window.confirm(`Delete ${money(e.amount, e.currency)} · ${e.subcategory || e.category}?`)) return
    setError(await data.deleteExpense(e))
  }

  const { from, to } = range(period)
  const q = query.trim().toLowerCase()

  // typing in the search box looks through every expense, not just this period
  const visible = useMemo(() => data.all.filter((e) => {
    if (q) {
      const hay = `${e.category} ${e.subcategory} ${e.note} ${e.amount} ${data.names[e.user_id] ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    } else if (e.spent_on < from || e.spent_on > to) return false
    return !only || e.category === only
  }), [data.all, data.names, q, from, to, only])

  const inPeriod = useMemo(() => data.all.filter((e) => e.spent_on >= from && e.spent_on <= to), [data.all, from, to])
  const totals = useMemo(() => {
    const t = { SAR: 0, INR: 0 }
    for (const e of inPeriod) t[e.currency] += e.amount
    return t
  }, [inPeriod])
  const slices = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of inPeriod) m.set(e.category, (m.get(e.category) ?? 0) + sum([e], data.rate))
    return [...m.entries()].map(([label, value]) => ({ label, value, color: categoryLook(data.cats, label).color }))
      .filter((s) => s.value > 0).sort((a, b) => b.value - a.value)
  }, [inPeriod, data.cats, data.rate])

  const allSar = totals.SAR + (data.rate > 0 ? totals.INR / data.rate : 0)
  const unconverted = totals.INR > 0 && !(data.rate > 0)
  const days = [...group(visible, (e) => e.spent_on).entries()]
  const overall = data.budgets['']
  const monthSpent = period.mode === 'month' ? allSar : 0

  return (
    <>
      <PeriodBar period={period} onChange={onPeriod} />

      <section className="card summary">
        <Donut slices={slices} center={<><small>Spent</small><strong>{sar(allSar)}</strong></>} />
        <div className="summary-side">
          <div className="legend">
            {slices.slice(0, 5).map((s) => (
              <button key={s.label} className={`legend-row ${only === s.label ? 'on' : ''}`} onClick={() => setOnly(only === s.label ? '' : s.label)}>
                <i style={{ background: s.color }} /><span>{categoryLook(data.cats, s.label).icon} {s.label}</span><b>{num(s.value, 0)}</b>
              </button>
            ))}
            {slices.length === 0 && <p className="hint">No spending here yet.</p>}
          </div>
          {totals.INR > 0 && <small className="hint">SAR {num(totals.SAR)} · ₹{num(totals.INR)}{unconverted ? ' · set ₹ rate in ⚙️' : ''}</small>}
        </div>
      </section>

      {period.mode === 'month' && overall > 0 && (
        <div className="budget-line" role="img" aria-label={`Budget used ${Math.round((monthSpent / overall) * 100)} percent`}>
          <span>🎯</span>
          <div className="bar"><div className={monthSpent > overall ? 'over' : ''} style={{ width: `${Math.min(100, (monthSpent / overall) * 100)}%` }} /></div>
          <small>{num(monthSpent, 0)} / {num(overall, 0)}</small>
        </div>
      )}

      <div className="searchbar">
        <button className={`icon-btn ${searching || q ? 'on' : ''}`} onClick={() => { setSearching((s) => !s); if (searching) setQuery('') }} aria-label="Search">🔍</button>
        {searching ? (
          <input value={query} autoFocus placeholder="Search note, category, amount…" onChange={(e) => setQuery(e.target.value)} aria-label="Search" />
        ) : (
          <div className="chips scroll" aria-label="Filter by category">
            <button className={`chip ${only === '' ? 'on' : ''}`} onClick={() => setOnly('')}>All</button>
            {data.cats.filter((c) => !c.parent_id).map((c) => (
              <button key={c.id} className={`chip ${only === c.name ? 'on' : ''}`} onClick={() => setOnly(only === c.name ? '' : c.name)} aria-label={c.name}>{c.icon}</button>
            ))}
          </div>
        )}
      </div>
      {q && <p className="hint">🔍 {visible.length} found in all dates</p>}

      {data.queue.length > 0 && (
        <p className="notice">⏳ {data.queue.length} waiting to upload <button className="mini" onClick={data.sync} aria-label="Upload now">⬆</button></p>
      )}

      {error && <p role="alert" className="notice">{error}</p>}
      {days.length === 0 && <p className="hint empty">🧾 Nothing here. Tap ＋ to add.</p>}
      {days.map(([day, list]) => (
        <section key={day} className="day">
          <div className="day-head"><span>{dayLabel(day)}</span><small>{sar(sum(list, data.rate))}</small></div>
          {list.map((e) => {
            const look = categoryLook(data.cats, e.category)
            const waiting = data.queue.some((x) => x.id === e.id)
            return (
              <div key={e.id} className="item-row">
                <button className="item" onClick={() => setOpen(e)}>
                  <span className="dot" style={{ background: `${look.color}22`, color: look.color }}>{look.icon}</span>
                  <span className="item-main">
                    <b>{e.subcategory || e.category}</b>
                    <small>
                      {e.subcategory ? `${e.category} · ` : ''}{data.names[e.user_id] ?? '👤'}{e.note ? ` · ${e.note}` : ''}
                    </small>
                  </span>
                  <span className="item-amount">
                    {e.is_private && '🔒 '}{e.receipt_path || waiting ? '📎 ' : ''}{waiting && '⏳ '}{money(e.amount, e.currency)}
                  </span>
                </button>
                {data.canDelete(e) && <button className="item-del" onClick={() => remove(e)} aria-label={`Delete ${e.subcategory || e.category} ${money(e.amount, e.currency)}`}>🗑</button>}
              </div>
            )
          })}
        </section>
      ))}

      {open && <ExpenseSheet data={data} expense={open} onClose={() => setOpen(null)} />}
    </>
  )
}

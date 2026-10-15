import type { ReactNode } from 'react'
import type { Mode, Period } from './types'
import { periodLabel, shift, today } from './util'

const MODES: { mode: Mode; label: string }[] = [{ mode: 'day', label: 'Day' }, { mode: 'week', label: 'Week' }, { mode: 'month', label: 'Month' }]

/** Day / Week / Month switch with ‹ › to move between periods. */
export function PeriodBar({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  return (
    <div className="period">
      <div className="seg" role="tablist">
        {MODES.map((m) => (
          <button key={m.mode} role="tab" aria-selected={period.mode === m.mode}
            className={period.mode === m.mode ? 'on' : ''} onClick={() => onChange({ mode: m.mode, anchor: today() })}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="period-nav">
        <button className="icon-btn" aria-label="Previous" onClick={() => onChange(shift(period, -1))}>‹</button>
        <button className="period-label" onClick={() => onChange({ ...period, anchor: today() })} aria-label="Jump to today">{periodLabel(period)}</button>
        <button className="icon-btn" aria-label="Next" onClick={() => onChange(shift(period, 1))}>›</button>
      </div>
    </div>
  )
}

export interface Slice { label: string; value: number; color: string }

/** Ring chart. Every slice is also listed with its figure beneath it, so colour is never the only clue. */
export function Donut({ slices, center }: { slices: Slice[]; center: ReactNode }) {
  const total = slices.reduce((t, s) => t + s.value, 0)
  const R = 15.9155 // circumference 100, so dash lengths are percentages
  let offset = 0
  return (
    <div className="donut">
      <svg viewBox="0 0 42 42" role="img" aria-label="Spending by category">
        <circle cx="21" cy="21" r={R} fill="none" stroke="var(--track)" strokeWidth="5" />
        {total > 0 && slices.map((s) => {
          const len = (s.value / total) * 100
          const el = (
            <circle key={s.label} cx="21" cy="21" r={R} fill="none" stroke={s.color} strokeWidth="5"
              strokeDasharray={`${Math.max(0, len - 0.4)} ${100 - Math.max(0, len - 0.4)}`} strokeDashoffset={25 - offset}>
              <title>{s.label}</title>
            </circle>
          )
          offset += len
          return el
        })}
      </svg>
      <div className="donut-center">{center}</div>
    </div>
  )
}

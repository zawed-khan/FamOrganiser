import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Account } from '../../core/account'
import { supabase } from '../../core/supabase'
import type { Budgets, Category, Expense, QueuedExpense, Recurring } from './types'
import { dataUrlToBlob, nextDate, today } from './util'

const QUEUE_KEY = 'fm.expenses.queue'
const RATE_KEY = 'fm.expenses.sarToInr'
const receiptKey = (id: string) => `fm.expenses.receipt.${id}`
const cacheKey = (fid: string, name: string) => `fm.exp.${fid}.${name}`
const OFFLINE = 'You are offline. Showing what is saved on this phone.'

function read<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback } catch { return fallback }
}
function write(key: string, value: string): boolean {
  try { localStorage.setItem(key, value); return true } catch { return false }
}
const writeJson = (key: string, value: unknown) => write(key, JSON.stringify(value))

const numeric = <T extends { amount: number }>(r: T): T => ({ ...r, amount: Number(r.amount) })

/** A link to a receipt photo that works for an hour. */
export async function receiptUrl(path: string) {
  if (!supabase) return null
  const { data } = await supabase.storage.from('receipts').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

export const receiptPath = (e: Pick<Expense, 'family_id' | 'user_id' | 'id'>) => `${e.family_id}/${e.user_id}/${e.id}.jpg`

/** Everything the Expenses tab needs: data from the database, a copy on the phone, and the actions. */
export function useExpenses(account: Account) {
  const family = account.family!
  const fid = family.id
  const userId = account.session!.user.id
  const isAdmin = family.role === 'admin'

  const [level, setLevel] = useState<number>(isAdmin ? 3 : read(cacheKey(fid, 'level'), 0))
  const [rows, setRows] = useState<Expense[]>(() => read(cacheKey(fid, 'rows'), []))
  const [cats, setCats] = useState<Category[]>(() => read(cacheKey(fid, 'cats'), []))
  const [budgets, setBudgets] = useState<Budgets>(() => read(cacheKey(fid, 'budgets'), {}))
  const [recurring, setRecurring] = useState<Recurring[]>([])
  const [names, setNames] = useState<Record<string, string>>(() => read(cacheKey(fid, 'names'), {}))
  const [queue, setQueue] = useState<QueuedExpense[]>(() => read(QUEUE_KEY, []))
  const [rate, setRateState] = useState<number>(() => Number(read<string>(RATE_KEY, '')) || 0)
  const [message, setMessage] = useState('')
  const syncing = useRef(false)

  const setRate = useCallback((v: number) => {
    setRateState(v)
    write(RATE_KEY, JSON.stringify(v > 0 ? String(v) : ''))
  }, [])

  const reload = useCallback(async () => {
    if (!supabase) return
    let lvl = 3
    if (!isAdmin) {
      const { data, error } = await supabase.from('tab_permissions').select('level')
        .eq('family_id', fid).eq('user_id', userId).eq('tab_id', 'expenses').maybeSingle()
      if (error) { setMessage(OFFLINE); return }
      lvl = { view: 1, edit: 2, full: 3 }[data?.level as 'view'] ?? 0
      setLevel(lvl)
      writeJson(cacheKey(fid, 'level'), lvl)
    }
    if (lvl < 1) return

    const loadCats = () => supabase!.from('expense_categories').select('*').eq('family_id', fid).order('sort_order').order('name')
    const [e, c, b, r, p] = await Promise.all([
      supabase.from('expenses').select('*').eq('family_id', fid)
        .order('spent_on', { ascending: false }).order('created_at', { ascending: false }).limit(2000),
      loadCats(),
      supabase.from('expense_budgets').select('category, monthly_amount').eq('family_id', fid),
      supabase.from('expense_recurring').select('*').eq('family_id', fid).order('next_on'),
      supabase.from('profiles').select('id, display_name'),
    ])
    if (e.error) { setMessage(OFFLINE); return }
    setMessage('')
    const list = (e.data ?? []).map(numeric) as Expense[]
    setRows(list)
    writeJson(cacheKey(fid, 'rows'), list)

    let catList = (c.data ?? []) as Category[]
    if (!c.error && catList.length === 0 && lvl >= 2) {
      // first time: fill in the starter categories (safe to call twice, the database only fills an empty list)
      await supabase.rpc('seed_expense_categories', { p_family: fid })
      catList = ((await loadCats()).data ?? []) as Category[]
    }
    if (!c.error) { setCats(catList); writeJson(cacheKey(fid, 'cats'), catList) }

    if (!b.error) {
      const map: Budgets = {}
      for (const x of b.data ?? []) map[x.category] = Number(x.monthly_amount)
      setBudgets(map)
      writeJson(cacheKey(fid, 'budgets'), map)
    }
    if (!r.error) setRecurring((r.data ?? []).map(numeric) as Recurring[])
    if (!p.error) {
      const map = Object.fromEntries((p.data ?? []).map((x) => [x.id, x.display_name || 'Family member']))
      setNames(map)
      writeJson(cacheKey(fid, 'names'), map)
    }
  }, [fid, userId, isAdmin])

  /** Creates the expenses that repeating entries have come due for (only your own; safe if two phones open at once). */
  const runRecurring = useCallback(async () => {
    if (!supabase) return 0
    const { data } = await supabase.from('expense_recurring').select('*').eq('family_id', fid).eq('user_id', userId).eq('active', true)
    let made = 0
    for (const raw of (data ?? []) as Recurring[]) {
      if (raw.next_on > today()) continue
      const dates: string[] = []
      let next = raw.next_on
      while (next <= today() && dates.length < 60) { dates.push(next); next = nextDate(next, raw.every) }
      // claim these dates first: only the phone whose update matches the old date goes on to create them
      const claim = await supabase.from('expense_recurring').update({ next_on: next }).eq('id', raw.id).eq('next_on', raw.next_on).select('id')
      if (claim.error || !claim.data?.length) continue
      const { error } = await supabase.from('expenses').insert(dates.map((spent_on) => ({
        id: crypto.randomUUID(), family_id: fid, user_id: userId, amount: raw.amount, currency: raw.currency,
        category: raw.category, subcategory: raw.subcategory, note: raw.note, is_private: raw.is_private, spent_on,
      })))
      if (error) await supabase.from('expense_recurring').update({ next_on: raw.next_on }).eq('id', raw.id)
      else made += dates.length
    }
    return made
  }, [fid, userId])

  const sync = useCallback(async () => {
    if (!supabase || syncing.current) return
    syncing.current = true
    try {
      const left: QueuedExpense[] = []
      for (const e of read<QueuedExpense[]>(QUEUE_KEY, [])) {
        const { repeat, ...row } = e
        const photo = localStorage.getItem(receiptKey(e.id))
        let path = row.receipt_path
        if (photo && !path) {
          const target = receiptPath(row)
          const up = await supabase.storage.from('receipts').upload(target, await dataUrlToBlob(photo), { contentType: 'image/jpeg', upsert: true })
          if (up.error) { left.push(e); continue }
          path = target
        }
        const { error } = await supabase.from('expenses').insert({ ...row, subcategory: row.subcategory ?? '', receipt_path: path })
        // 23505 = already saved earlier (the id is made on the phone, so retrying is safe)
        if (error && error.code !== '23505') { left.push(e); continue }
        if (repeat && repeat !== 'none') {
          await supabase.from('expense_recurring').insert({
            id: row.id, family_id: row.family_id, user_id: row.user_id, amount: row.amount, currency: row.currency,
            category: row.category, subcategory: row.subcategory ?? '', note: row.note, is_private: row.is_private,
            every: repeat, next_on: nextDate(row.spent_on, repeat),
          })
        }
        try { localStorage.removeItem(receiptKey(e.id)) } catch { /* storage unavailable */ }
      }
      writeJson(QUEUE_KEY, left)
      setQueue(left)
      await reload()
      if ((await runRecurring()) > 0) await reload()
    } finally { syncing.current = false }
  }, [reload, runRecurring])

  useEffect(() => {
    sync()
    window.addEventListener('online', sync)
    return () => window.removeEventListener('online', sync)
  }, [sync])

  // ------------------------------------------------------------ actions
  /** Saves on the phone first (so it also works offline), then uploads. Returns a message for the user. */
  async function addExpense(entry: Omit<QueuedExpense, 'id' | 'family_id' | 'user_id' | 'receipt_path'>, photo?: string) {
    const e: QueuedExpense = { ...entry, id: crypto.randomUUID(), family_id: fid, user_id: userId, receipt_path: null }
    if (photo && !write(receiptKey(e.id), photo)) return { ok: false, text: 'No room on this phone for the photo. Save without it.' }
    const q = [...read<QueuedExpense[]>(QUEUE_KEY, []), e]
    if (!writeJson(QUEUE_KEY, q)) {
      try { localStorage.removeItem(receiptKey(e.id)) } catch { /* storage unavailable */ }
      return { ok: false, text: 'No room on this phone to save. Connect to the internet and try again.' }
    }
    setQueue(q)
    if (!navigator.onLine) return { ok: true, text: 'Saved on this phone. It will upload when you are online.' }
    await sync()
    return { ok: true, text: 'Saved ✔' }
  }

  async function updateExpense(old: Expense, patch: Partial<Expense>, photo?: string) {
    if (!supabase) return 'Not connected.'
    const next = { ...patch }
    if (photo) {
      const target = receiptPath(old)
      const up = await supabase.storage.from('receipts').upload(target, await dataUrlToBlob(photo), { contentType: 'image/jpeg', upsert: true })
      if (up.error) return up.error.message
      next.receipt_path = target
    }
    const { error } = await supabase.from('expenses').update(next).eq('id', old.id)
    if (error) return error.message
    await reload()
    return ''
  }

  async function removeExpense(e: Expense) {
    if (!supabase) return 'Not connected.'
    const { error } = await supabase.from('expenses').delete().eq('id', e.id)
    if (error) return error.message
    if (e.receipt_path) await supabase.storage.from('receipts').remove([e.receipt_path])
    setRows((r) => r.filter((x) => x.id !== e.id))
    return ''
  }

  /** Can this person delete this entry? Everyone can drop their own waiting entries; saved ones follow the Expenses rules. */
  const canDelete = (e: Expense) => queue.some((q) => q.id === e.id) || (level >= 2 && (level >= 3 || e.user_id === userId))

  /** Deletes one entry, whether it is saved or still waiting to upload. Returns an error message, or ''. */
  async function deleteExpense(e: Expense) {
    if (queue.some((q) => q.id === e.id)) { removeQueued(e.id); return '' }
    const msg = await removeExpense(e)
    return msg && !navigator.onLine ? 'Connect to the internet to delete this.' : msg
  }

  function removeQueued(id: string) {
    const q = read<QueuedExpense[]>(QUEUE_KEY, []).filter((x) => x.id !== id)
    writeJson(QUEUE_KEY, q)
    setQueue(q)
    try { localStorage.removeItem(receiptKey(id)) } catch { /* storage unavailable */ }
  }

  async function addCategory(c: { name: string; icon: string; color: string; parent_id: string | null }) {
    if (!supabase) return 'Not connected.'
    const sort_order = Math.max(0, ...cats.map((x) => x.sort_order)) + 1
    const { error } = await supabase.from('expense_categories').insert({ ...c, family_id: fid, sort_order })
    if (error) return error.code === '23505' ? 'That name is already used here.' : navigator.onLine ? error.message : 'Connect to the internet to add a category.'
    await reload()
    return ''
  }

  /** Renaming also renames it on the expenses, repeating entries and budgets that use it. */
  async function updateCategory(c: Category, patch: { name: string; icon: string; color: string }) {
    if (!supabase) return 'Not connected.'
    const { error } = await supabase.from('expense_categories').update(patch).eq('id', c.id)
    if (error) return error.code === '23505' ? 'That name is already used here.' : error.message
    if (patch.name !== c.name) {
      const parent = c.parent_id ? cats.find((x) => x.id === c.parent_id) : null
      for (const table of ['expenses', 'expense_recurring']) {
        if (parent) await supabase.from(table).update({ subcategory: patch.name }).eq('family_id', fid).eq('category', parent.name).eq('subcategory', c.name)
        else await supabase.from(table).update({ category: patch.name }).eq('family_id', fid).eq('category', c.name)
      }
      if (!parent && budgets[c.name]) {
        await supabase.from('expense_budgets').update({ category: patch.name }).eq('family_id', fid).eq('category', c.name)
      }
    }
    await reload()
    return ''
  }

  async function removeCategory(c: Category) {
    if (!supabase) return 'Not connected.'
    const { error } = await supabase.from('expense_categories').delete().eq('id', c.id)
    if (error) return error.message
    if (!c.parent_id) await supabase.from('expense_budgets').delete().eq('family_id', fid).eq('category', c.name)
    await reload()
    return ''
  }

  async function setBudget(category: string, amount: number) {
    if (!supabase) return 'Not connected.'
    const { error } = amount > 0
      ? await supabase.from('expense_budgets').upsert({ family_id: fid, category, monthly_amount: amount })
      : await supabase.from('expense_budgets').delete().eq('family_id', fid).eq('category', category)
    if (error) return error.message
    await reload()
    return ''
  }

  async function setRecurringActive(id: string, active: boolean) {
    if (!supabase) return
    await supabase.from('expense_recurring').update({ active }).eq('id', id)
    await reload()
  }

  async function removeRecurring(id: string) {
    if (!supabase) return
    await supabase.from('expense_recurring').delete().eq('id', id)
    await reload()
  }

  /** Saved expenses plus those still waiting to upload, newest day first. */
  const all = useMemo<QueuedExpense[]>(
    () => [...queue, ...rows.filter((r) => !queue.some((q) => q.id === r.id))].sort((a, b) => (a.spent_on < b.spent_on ? 1 : a.spent_on > b.spent_on ? -1 : 0)),
    [queue, rows])

  return {
    userId, isAdmin, level, canAdd: level >= 2, canManage: level >= 3,
    all, queue, cats, budgets, recurring, names, rate, message,
    setMessage, setRate, sync,
    addExpense, updateExpense, deleteExpense, canDelete,
    addCategory, updateCategory, removeCategory, setBudget, setRecurringActive, removeRecurring,
  }
}

export type ExpensesData = ReturnType<typeof useExpenses>

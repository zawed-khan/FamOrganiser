import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export interface FamilyInfo {
  id: string
  name: string
  status: 'pending' | 'active' | 'rejected'
  role: string
}

export interface Account {
  loading: boolean
  session: Session | null
  isSuperAdmin: boolean
  /** The person's own name (what the app shows instead of the email). */
  name: string
  setName: (name: string) => Promise<string>
  family: FamilyInfo | null
  refresh: () => Promise<void>
}

/** Who is signed in, are they a super-admin, and which family do they belong to. */
export function useAccount(): Account {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [name, setNameState] = useState('')
  const [family, setFamily] = useState<FamilyInfo | null>(null)

  const load = useCallback(async (s: Session | null) => {
    if (!supabase || !s) {
      setIsSuperAdmin(false)
      setNameState('')
      setFamily(null)
      return
    }
    const [profile, membership] = await Promise.all([
      supabase.from('profiles').select('is_super_admin, display_name').eq('id', s.user.id).maybeSingle(),
      supabase.from('members').select('role, families(id, name, status)').eq('user_id', s.user.id).limit(1).maybeSingle(),
    ])
    setIsSuperAdmin(Boolean(profile.data?.is_super_admin))
    // The database starts everyone with the first part of their email as a placeholder name.
    // If they typed a name when signing up, use that instead (the first time they get in).
    let shown: string = profile.data?.display_name ?? ''
    const typed = String(s.user.user_metadata?.name ?? '').trim()
    if (typed && (!shown || shown === (s.user.email ?? '').split('@')[0])) {
      const { error } = await supabase.from('profiles').update({ display_name: typed }).eq('id', s.user.id)
      if (!error) shown = typed
    }
    setNameState(shown)
    const f = membership.data?.families as unknown as Omit<FamilyInfo, 'role'> | null | undefined
    setFamily(f ? { ...f, role: membership.data!.role } : null)
  }, [])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      load(data.session).finally(() => setLoading(false))
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      load(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  /** Saves a new name. Returns an error message, or '' when it worked. */
  const setName = useCallback(async (value: string) => {
    const n = value.trim()
    if (!supabase || !session) return 'Not signed in.'
    if (!n) return 'Please type a name.'
    const { error } = await supabase.from('profiles').update({ display_name: n }).eq('id', session.user.id)
    if (error) return error.message
    setNameState(n)
    return ''
  }, [session])

  return { loading, session, isSuperAdmin, name, setName, family, refresh: () => load(session) }
}

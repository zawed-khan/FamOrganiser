import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import { LOGIN_NAME_MIN, toLoginName } from './loginName'
import { isPin, pinToPassword } from './pin'
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
  /** The name they sign in with (lower case, dots between words). */
  username: string
  saveProfile: (name: string, loginName: string) => Promise<string>
  /** Sets a new 4-digit PIN for the signed-in person. */
  changePin: (pin: string) => Promise<string>
  family: FamilyInfo | null
  refresh: () => Promise<void>
}

/** Who is signed in, are they a super-admin, and which family do they belong to. */
export function useAccount(): Account {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [name, setNameState] = useState('')
  const [username, setUsername] = useState('')
  const [family, setFamily] = useState<FamilyInfo | null>(null)

  const load = useCallback(async (s: Session | null) => {
    if (!supabase || !s) {
      setIsSuperAdmin(false)
      setNameState('')
      setUsername('')
      setFamily(null)
      return
    }
    const [profile, membership] = await Promise.all([
      supabase.from('profiles').select('is_super_admin, display_name, username').eq('id', s.user.id).maybeSingle(),
      supabase.from('members').select('role, families(id, name, status)').eq('user_id', s.user.id).limit(1).maybeSingle(),
    ])
    setIsSuperAdmin(Boolean(profile.data?.is_super_admin))
    setNameState(profile.data?.display_name ?? '')
    setUsername(profile.data?.username ?? '')
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

  /** Saves the name shown in the app and the name used to sign in. Returns an error message, or '' when it worked. */
  const saveProfile = useCallback(async (value: string, loginValue: string) => {
    const n = value.trim()
    const login = toLoginName(loginValue)
    if (!supabase || !session) return 'Not signed in.'
    if (!n) return 'Please type a name.'
    if (login.length < LOGIN_NAME_MIN) return `Login name needs at least ${LOGIN_NAME_MIN} letters or numbers.`
    const { error } = await supabase.from('profiles').update({ display_name: n, username: login }).eq('id', session.user.id)
    if (error) return error.code === '23505' ? 'Someone already uses that login name.' : error.message
    setNameState(n)
    setUsername(login)
    return ''
  }, [session])

  /** Sets a new 4-digit PIN for the signed-in person. Returns an error message, or '' when it worked. */
  const changePin = useCallback(async (pin: string) => {
    if (!supabase || !session) return 'Not signed in.'
    if (!isPin(pin)) return 'The PIN must be exactly 4 digits.'
    const { error } = await supabase.auth.updateUser({ password: pinToPassword(pin) })
    return error ? error.message : ''
  }, [session])

  return { loading, session, isSuperAdmin, name, username, saveProfile, changePin, family, refresh: () => load(session) }
}

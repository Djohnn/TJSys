import { useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import {
  fetchCsrf,
  fetchMe,
  loginApi,
  challengeMfaApi,
  verifyRecoveryApi,
  logoutApi,
} from './authApi'
import type { User, Membership } from './authApi'

export type AuthState = 'loading' | 'anonymous' | 'mfa_required' | 'authenticated'

export interface LoginResult {
  requiresMfa: boolean
  temporaryToken?: string
  tenantId?: string
}

export interface AuthContextValue {
  state: AuthState
  user: User | null
  memberships: Membership[]
  login: (email: string, password: string) => Promise<LoginResult>
  challengeMfa: (temporaryToken: string, code: string) => Promise<void>
  verifyRecovery: (tenantId: string, code: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const queryClient = useQueryClient()
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false

    async function init() {
      try {
        await fetchCsrf()
        const me = await fetchMe()
        if (cancelledRef.current) return
        setUser(me.user ?? null)
        setMemberships(me.memberships ?? [])
        setState('authenticated')
      } catch {
        if (!cancelledRef.current) {
          setState('anonymous')
        }
      }
    }

    init()
    return () => {
      cancelledRef.current = true
    }
  }, [])

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      const response = await loginApi(email, password)

      if (response.requires_mfa) {
        setState('mfa_required')
        return {
          requiresMfa: true,
          temporaryToken: response.mfa_session,
          tenantId: response.mfa_tenant_id,
        }
      }

      const me = await fetchMe()
      setUser(me.user ?? null)
      setMemberships(me.memberships ?? [])
      setState('authenticated')
      return { requiresMfa: false }
    },
    [],
  )

  const challengeMfa = useCallback(
    async (temporaryToken: string, code: string): Promise<void> => {
      await challengeMfaApi(temporaryToken, code)
      const me = await fetchMe()
      setUser(me.user ?? null)
      setMemberships(me.memberships ?? [])
      setState('authenticated')
    },
    [],
  )

  const verifyRecovery = useCallback(
    async (tenantId: string, code: string): Promise<void> => {
      await verifyRecoveryApi(tenantId, code)
      const me = await fetchMe()
      setUser(me.user ?? null)
      setMemberships(me.memberships ?? [])
      setState('authenticated')
    },
    [],
  )

  const logout = useCallback(async (): Promise<void> => {
    try {
      await logoutApi()
    } finally {
      queryClient.clear()
      setUser(null)
      setMemberships([])
      setState('anonymous')
    }
  }, [queryClient])

  return (
    <AuthContext.Provider
      value={{ state, user, memberships, login, challengeMfa, verifyRecovery, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

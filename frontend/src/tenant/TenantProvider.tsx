import { useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from 'react'

import { useAuth } from '@/auth/AuthProvider'
import type { Membership } from '@/auth/authApi'

const STORAGE_KEY = 'tjsys:selected-tenant'

export interface TenantContextValue {
  selectedTenant: Membership | null
  memberships: Membership[]
  selectTenant: (tenantId: string) => void
}

export const TenantContext = createContext<TenantContextValue | null>(null)

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant must be used within TenantProvider')
  return ctx
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const [overrideTenantId, setOverrideTenantId] = useState<string | null>(null)

  const selectedTenant = useMemo(() => {
    if (auth.state !== 'authenticated') return null

    const id = overrideTenantId ?? localStorage.getItem(STORAGE_KEY)
    if (id) {
      const match = auth.memberships.find((m) => m.tenant_id === id)
      if (match) return match
    }

    return auth.memberships.length > 0 ? auth.memberships[0] : null
  }, [auth.state, auth.memberships, overrideTenantId])

  // Auto-selecionar primeiro tenant e persistir no localStorage
  useEffect(() => {
    if (auth.state === 'authenticated' && auth.memberships.length > 0 && !selectedTenant) {
      const firstTenant = auth.memberships[0]
      localStorage.setItem(STORAGE_KEY, firstTenant.tenant_id)
      setOverrideTenantId(firstTenant.tenant_id)
    }
  }, [auth.state, auth.memberships, selectedTenant])

  const selectTenant = useCallback(
    (tenantId: string) => {
      const membership = auth.memberships.find(
        (m) => m.tenant_id === tenantId,
      )
      if (!membership) {
        throw new Error(`Tenant ${tenantId} not found in memberships`)
      }

      queryClient.clear()
      localStorage.setItem(STORAGE_KEY, tenantId)
      setOverrideTenantId(tenantId)
    },
    [auth.memberships, queryClient],
  )

  return (
    <TenantContext.Provider
      value={{
        selectedTenant,
        memberships: auth.memberships,
        selectTenant,
      }}
    >
      {children}
    </TenantContext.Provider>
  )
}

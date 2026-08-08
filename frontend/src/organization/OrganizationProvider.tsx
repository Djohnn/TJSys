import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from 'react'

import { useTenant } from '@/tenant/TenantProvider'
import { useAuth } from '@/auth/AuthProvider'
import type { Branch, Company } from './organizationApi'
import { fetchCompanies, fetchBranches } from './organizationApi'

const BRANCH_KEY = 'tjsys:selected-branch'

export interface OrganizationContextValue {
  companies: Company[]
  branches: Branch[]
  currentCompany: Company | null
  currentBranch: Branch | null
  setCurrentBranch: (branch: Branch | null) => void
  isLoading: boolean
}

export const OrganizationContext = createContext<OrganizationContextValue | null>(null)

export function useOrganization(): OrganizationContextValue {
  const ctx = useContext(OrganizationContext)
  if (!ctx) throw new Error('useOrganization must be used within OrganizationProvider')
  return ctx
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { selectedTenant } = useTenant()
  const auth = useAuth()

  const [companies, setCompanies] = useState<Company[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [branchOverride, setBranchOverride] = useState<string | null>(null)

  useEffect(() => {
    const tenant = selectedTenant
    if (auth.state !== 'authenticated' || !tenant) {
      setCompanies([])
      setBranches([])
      setBranchOverride(null)
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)

    const tenantId = tenant.tenant_id
    async function load() {
      try {
        const [companiesRes, branchesRes] = await Promise.all([
          fetchCompanies(tenantId),
          fetchBranches(tenantId),
        ])
        if (cancelled) return

        const loadedCompanies = companiesRes.results
        const loadedBranches = branchesRes.results

        setCompanies(loadedCompanies)
        setBranches(loadedBranches)
      } catch {
        if (!cancelled) {
          setCompanies([])
          setBranches([])
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
    }, [selectedTenant, auth.state])

  const currentBranch = useMemo(() => {
    if (!selectedTenant || companies.length === 0) return null

    const storedId = branchOverride ?? localStorage.getItem(BRANCH_KEY)
    if (storedId) {
      const match = branches.find((b) => b.id === storedId)
      if (match) return match
    }

    return null
  }, [branchOverride, branches, selectedTenant, companies.length])

  const currentCompany = useMemo(() => {
    if (!currentBranch) return companies.length === 1 ? companies[0] : null
    return companies.find((c) => c.id === currentBranch.company) ?? null
  }, [currentBranch, companies])

  const setCurrentBranch = useCallback((branch: Branch | null) => {
    if (branch) {
      localStorage.setItem(BRANCH_KEY, branch.id)
      setBranchOverride(branch.id)
    } else {
      localStorage.removeItem(BRANCH_KEY)
      setBranchOverride(null)
    }
  }, [])

  return (
    <OrganizationContext.Provider
      value={{
        companies,
        branches,
        currentCompany,
        currentBranch,
        setCurrentBranch,
        isLoading,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  )
}

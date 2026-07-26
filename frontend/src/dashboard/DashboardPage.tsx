import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { healthCheck } from '@/organization/organizationApi'

const ROLE_CAPABILITIES: Record<string, string[]> = {
  admin: [
    'organization.read', 'catalog.view', 'inventory.view',
    'sales.view', 'financial.view', 'users.manage',
  ],
  manager: [
    'organization.read', 'catalog.view', 'inventory.view',
    'sales.view', 'financial.view', 'users.read',
  ],
  operator: [
    'catalog.view', 'inventory.view', 'sales.view',
  ],
}

interface ModuleCard {
  id: string
  label: string
  description: string
  capability: string
  to: string
}

const MODULES: ModuleCard[] = [
  { id: 'organization', label: 'Empresas e Filiais', description: 'Gerenciar empresas e filiais', capability: 'organization.read', to: '/organization/companies' },
  { id: 'catalog', label: 'Catálogo', description: 'Produtos, preços e categorias', capability: 'catalog.view', to: '/catalog' },
  { id: 'inventory', label: 'Estoque', description: 'Entradas, saídas e transferências', capability: 'inventory.view', to: '/inventory' },
  { id: 'sales', label: 'Vendas', description: 'PDV, pedidos e comandas', capability: 'sales.view', to: '/sales' },
  { id: 'financial', label: 'Financeiro', description: 'Contas a pagar/receber e relatórios', capability: 'financial.view', to: '/financial' },
  { id: 'access', label: 'Acesso', description: 'Membros, convites e funções', capability: 'users.manage', to: '/access/members' },
  { id: 'security', label: 'Segurança', description: 'Política MFA e dispositivos', capability: 'organization.read', to: '/security/mfa' },
  { id: 'devices', label: 'Dispositivos', description: 'PDV tablets e terminais', capability: 'organization.read', to: '/devices' },
]

function hasCapability(role: string, capability: string): boolean {
  const caps = ROLE_CAPABILITIES[role]
  if (!caps) return false
  return caps.includes(capability)
}

export default function DashboardPage() {
  const { selectedTenant } = useTenant()

  const role = selectedTenant?.role ?? ''
  const availableModules = MODULES.filter((m) => hasCapability(role, m.capability))

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => healthCheck(signal),
    retry: false,
    refetchInterval: 60_000,
  })

  return (
    <div data-testid="dashboard-page" className="p-6">
      <h2 className="text-2xl font-bold text-neutral-900 mb-2">Dashboard</h2>

      {selectedTenant && (
        <p data-testid="current-tenant" className="text-sm text-text-muted mb-4">
          Tenant ativo: <strong className="text-text">{selectedTenant.tenant_name}</strong> &mdash; {role}
        </p>
      )}

      <div data-testid="health-status" aria-live="polite" className="mb-6">
        {health
          ? <span className="text-green-700 text-sm">&#9679; Backend online</span>
          : <span className="text-warning text-sm">&#9679; Verificando...</span>
        }
      </div>

      <div
        data-testid="module-cards"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {availableModules.map((mod) => (
          <Link
            key={mod.id}
            to={mod.to}
            data-testid={`card-${mod.id}`}
            className="block p-5 rounded-xl border border-border bg-primary-50 hover:bg-primary-100 hover:border-primary-300 transition-all no-underline"
          >
            <h3 className="text-base font-semibold text-primary-800 mb-1">{mod.label}</h3>
            <p className="text-sm text-primary-700">{mod.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

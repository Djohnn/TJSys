import { useTenant } from './TenantProvider'

export default function TenantSelector() {
  const { selectedTenant, memberships, selectTenant } = useTenant()

  if (memberships.length <= 1) return null

  return (
    <div data-testid="tenant-selector">
      {memberships.map((m) => (
        <button
          key={m.tenant_id}
          onClick={() => selectTenant(m.tenant_id)}
          aria-current={
            selectedTenant?.tenant_id === m.tenant_id ? 'true' : undefined
          }
        >
          {m.tenant_name}
        </button>
      ))}
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import { listProductConfigs } from './fiscalApi'
import type { FiscalProductConfig, PaginatedResponse } from './fiscalApi'
import { useTenant } from '@/tenant/TenantProvider'

export default function ProductConfigPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.id

  const { data, isLoading, isError } = useQuery<PaginatedResponse<FiscalProductConfig>>({
    queryKey: ['fiscal-product-configs', tenantId],
    queryFn: () => listProductConfigs({ tenantId }),
    enabled: !!tenantId,
  })

  if (isLoading) return <p data-testid="loading-state">Carregando...</p>
  if (isError) return <p data-testid="error-state">Erro ao carregar configurações.</p>

  return (
    <div data-testid="product-config-page">
      <h2>Configuração Fiscal de Produtos</h2>
      <table data-testid="product-config-table">
        <thead><tr><th>Produto</th><th>CST ICMS</th><th>Alíquota</th><th>Origem</th></tr></thead>
        <tbody>
          {data?.results.map(cfg => (
            <tr key={cfg.id} data-testid="product-config-row">
              <td>{cfg.product}</td>
              <td>{cfg.cst_icms}</td>
              <td>{cfg.aliquota_icms}</td>
              <td>{cfg.origem}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
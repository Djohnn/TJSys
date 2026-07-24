import { useQuery } from '@tanstack/react-query'
import { listProductConfigs } from './fiscalApi'
import type { FiscalProductConfig, PaginatedResponse } from './fiscalApi'
import { useTenant } from '@/tenant/TenantProvider'
import Card from '@/components/ui/Card'

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
    <div data-testid="product-config-page" className="p-6">
      <Card title="Configuração Fiscal de Produtos">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table data-testid="product-config-table" className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-border">
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Produto</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">CST ICMS</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Alíquota</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Origem</th>
              </tr>
            </thead>
            <tbody>
              {data?.results.map(cfg => (
                <tr key={cfg.id} data-testid="product-config-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                  <td className="px-4 py-3 text-neutral-700">{cfg.product}</td>
                  <td className="px-4 py-3 text-neutral-700">{cfg.cst_icms}</td>
                  <td className="px-4 py-3 text-neutral-700">{cfg.aliquota_icms}</td>
                  <td className="px-4 py-3 text-neutral-700">{cfg.origem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
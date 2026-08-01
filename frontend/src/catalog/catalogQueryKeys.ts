export const catalogKeys = {
  categories: (tenantId: string) => ['categories', tenantId] as const,
  units: (tenantId: string) => ['units', tenantId] as const,
  brands: (tenantId: string) => ['brands', tenantId] as const,
}

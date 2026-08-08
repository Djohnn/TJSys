import { z } from 'zod'
import type { Product, ProductStockData, ProductStockSummary } from './catalogApi'

const decimal = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/, 'Informe um decimal válido')

export const productStockSchema = z
  .object({
    branch: z.string().min(1, 'Filial é obrigatória'),
    location: z.string().min(1, 'Local de estoque é obrigatório'),
    current_quantity: decimal.default('0'),
    initial_quantity: decimal.default('0'),
    minimum_quantity: decimal.default('0'),
    maximum_quantity: decimal.or(z.literal('')).default(''),
    reorder_point: decimal.default('0'),
    allow_negative: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.maximum_quantity && Number(value.maximum_quantity) < Number(value.minimum_quantity)) {
      ctx.addIssue({
        code: 'custom',
        path: ['maximum_quantity'],
        message: 'Máxima deve ser maior ou igual à mínima',
      })
    }
  })

export type ProductStockFormData = z.infer<typeof productStockSchema>

export const productSchema = z
  .object({
    name: z.string().min(1, 'Nome é obrigatório').max(200),
    description: z.string().max(1000).default(''),
    sku: z.string().max(50).default(''),
    barcode: z.string().max(50).default(''),
    category: z.string().nullable().default(null),
    unit: z.string().nullable().default(null),
    is_active: z.boolean().default(true),
    product_kind: z.string().default(''),
    brand: z.string().max(100).default(''),
    model: z.string().max(100).default(''),
    tags: z.string().default(''),
    scale_code: z.string().max(50).default(''),
    tracks_inventory: z.boolean().default(false),
    stock: z.any().nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.tracks_inventory && value.stock && typeof value.stock === 'object') {
      const result = productStockSchema.safeParse(value.stock)
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({
            code: issue.code as 'custom',
            message: issue.message,
            path: ['stock', ...(issue.path as (string | number)[])],
          })
        }
      }
    }
  })

export type ProductFormData = Omit<z.infer<typeof productSchema>, 'stock'> & {
  stock: ProductStockFormData | null
}

/** Maps a persisted product resource into the identity form representation. */
export function productToFormData(
  product: Product,
  stockSummary?: ProductStockSummary | ProductStockSummary[] | null,
): ProductFormData {
  const summary = Array.isArray(stockSummary) ? stockSummary[0] : stockSummary
  const persistedStock = product.stock ?? product.stock_summary ?? summary
  const stockRecord = persistedStock as (Partial<ProductStockData> & Partial<ProductStockSummary>) | null | undefined
  return {
    name: product.name ?? '',
    description: product.description ?? '',
    sku: product.sku ?? '',
    barcode: product.barcode ?? '',
    category: product.category ?? null,
    unit: product.unit ?? null,
    is_active: product.is_active ?? true,
    product_kind: product.product_kind ?? '',
    brand: product.brand ?? '',
    model: product.model ?? '',
    tags: Array.isArray(product.tags) ? product.tags.join(', ') : '',
    scale_code: product.scale_code ?? '',
    tracks_inventory: product.tracks_inventory ?? false,
    stock: product.tracks_inventory
      ? {
          branch: stockRecord?.branch ?? '',
          location: stockRecord?.location ?? '',
          current_quantity: stockRecord?.current_quantity ?? stockRecord?.quantity ?? '0',
          initial_quantity: stockRecord?.initial_quantity ?? '0',
          minimum_quantity: stockRecord?.minimum_quantity ?? '0',
          maximum_quantity: stockRecord?.maximum_quantity ?? '',
          reorder_point: stockRecord?.reorder_point ?? '0',
          allow_negative: stockRecord?.allow_negative ?? false,
        }
      : null,
  }
}

/** Maps form data to backend Product payload, separating barcode for ProductCode creation. */
export function toProductPayload(data: ProductFormData) {
  const { unit, barcode, tags, stock, ...product } = data
  return {
    product: {
      ...product,
      base_unit: unit ?? undefined,
      tags: tags ? tags.split(',').map(v => v.trim()).filter(Boolean) : [],
    },
    barcode: barcode?.trim() ?? '',
    stock: data.tracks_inventory && stock ? stock : undefined,
  }
}

export const categorySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(200),
})

export type CategoryFormData = z.infer<typeof categorySchema>

export const fiscalDataSchema = z.object({
  fiscal_type: z.string().default(''),
  ncm: z.string().max(20).default(''),
  cest: z.string().max(20).default(''),
  origin_code: z.string().regex(/^[0-8]$/, 'Origem deve ser entre 0 e 8').default('0'),
  fiscal_class: z.string().max(50).default(''),
})

export type FiscalDataFormData = z.infer<typeof fiscalDataSchema>

export const priceTierSchema = z.object({
  min_quantity: z.string().min(1, 'Quantidade mínima é obrigatória'),
  amount: z.string().min(1, 'Valor é obrigatório'),
})

export type PriceTierFormData = z.infer<typeof priceTierSchema>

export const compositionSchema = z.object({
  component: z.string().min(1, 'Componente é obrigatório'),
  quantity: z.string().min(1, 'Quantidade é obrigatória'),
})

export type CompositionFormData = z.infer<typeof compositionSchema>

export const serviceSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(200),
  sku: z.string().max(50).default(''),
  description: z.string().max(1000).default(''),
  category: z.string().nullable().default(null),
  unit: z.string().nullable().default(null),
  is_active: z.boolean().default(true),
  price: z.string().default(''),
  billing_unit: z.string().max(50).default(''),
  duration_minutes: z.coerce.number().min(0).default(0),
  ncm: z.string().max(20).default(''),
  cest: z.string().max(20).default(''),
  origin_code: z.string().regex(/^[0-8]$/, 'Origem deve ser entre 0 e 8').default('0'),
  fiscal_class: z.string().max(50).default(''),
})

export type ServiceFormData = z.infer<typeof serviceSchema>

export function toServicePayload(data: ServiceFormData) {
  const { unit, billing_unit, duration_minutes, price, ncm, cest, origin_code, fiscal_class, ...product } = data
  return {
    product: {
      ...product,
      base_unit: unit ?? undefined,
      product_kind: 'servico',
      tracks_inventory: false,
      billing_unit,
      duration_minutes,
    },
    fiscal: {
      fiscal_type: 'servico',
      ncm,
      cest,
      origin_code,
      fiscal_class,
    },
    price_tier: price
      ? { min_quantity: '1', amount: price }
      : null,
  }
}

import { z } from 'zod'

export const productSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(200),
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
})

export type ProductFormData = z.infer<typeof productSchema>

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

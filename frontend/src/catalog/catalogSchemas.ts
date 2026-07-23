import { z } from 'zod'

export const productSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(200),
  sku: z.string().max(50).default(''),
  barcode: z.string().max(50).default(''),
  category: z.string().nullable().default(null),
  unit: z.string().nullable().default(null),
  is_active: z.boolean().default(true),
})

export type ProductFormData = z.infer<typeof productSchema>

export const categorySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(200),
})

export type CategoryFormData = z.infer<typeof categorySchema>

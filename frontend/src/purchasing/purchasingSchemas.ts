import { z } from 'zod'

export const supplierSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(200),
  cnpj: z.string().max(18).default(''),
  ie: z.string().max(20).default(''),
  is_active: z.boolean().default(true),
})

export type SupplierFormData = z.infer<typeof supplierSchema>

export const purchaseOrderItemSchema = z.object({
  product: z.string().min(1, 'Produto é obrigatório'),
  quantity: z.string().min(1, 'Quantidade é obrigatória'),
  unit_price: z.string().min(1, 'Preço unitário é obrigatório'),
})

export type PurchaseOrderItemFormData = z.infer<typeof purchaseOrderItemSchema>

export const purchaseOrderSchema = z.object({
  supplier: z.string().min(1, 'Fornecedor é obrigatório'),
  branch: z.string().min(1, 'Filial é obrigatória'),
  items: z.array(purchaseOrderItemSchema).min(1, 'Adicione pelo menos um item'),
})

export type PurchaseOrderFormData = z.infer<typeof purchaseOrderSchema>

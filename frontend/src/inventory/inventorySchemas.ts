import { z } from 'zod'

export const receiptSchema = z.object({
  product: z.string().min(1, 'Produto é obrigatório'),
  branch: z.string().min(1, 'Filial é obrigatória'),
  location: z.string().min(1, 'Localização é obrigatória'),
  quantity: z.string().min(1, 'Quantidade é obrigatória').regex(/^\d+(\.\d+)?$/, 'Quantidade deve ser um número decimal'),
  reference: z.string().default(''),
})

export type ReceiptFormData = z.infer<typeof receiptSchema>

export const transferSchema = z.object({
  product: z.string().min(1, 'Produto é obrigatório'),
  source_branch: z.string().min(1, 'Filial origem é obrigatória'),
  destination_branch: z.string().min(1, 'Filial destino é obrigatória'),
  quantity: z.string().min(1, 'Quantidade é obrigatória').regex(/^\d+(\.\d+)?$/, 'Quantidade deve ser um número decimal'),
  reason: z.string().min(1, 'Motivo é obrigatório'),
})

export type TransferFormData = z.infer<typeof transferSchema>

export const adjustmentSchema = z.object({
  product: z.string().min(1, 'Produto é obrigatório'),
  branch: z.string().min(1, 'Filial é obrigatória'),
  location: z.string().min(1, 'Localização é obrigatória'),
  quantity: z.string().min(1, 'Quantidade é obrigatória').regex(/^-?\d+(\.\d+)?$/, 'Quantidade deve ser um número decimal (pode ser negativo)'),
  reason: z.string().min(1, 'Motivo é obrigatório'),
})

export type AdjustmentFormData = z.infer<typeof adjustmentSchema>

export const stockPolicySchema = z
  .object({
    minimum_quantity: z.string().regex(/^\d+(\.\d{1,6})?$/, 'Informe um decimal válido').default('0'),
    maximum_quantity: z.string().regex(/^$|^\d+(\.\d{1,6})?$/, 'Informe um decimal válido').default(''),
    reorder_point: z.string().regex(/^\d+(\.\d{1,6})?$/, 'Informe um decimal válido').default('0'),
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

export type StockPolicyFormData = z.infer<typeof stockPolicySchema>

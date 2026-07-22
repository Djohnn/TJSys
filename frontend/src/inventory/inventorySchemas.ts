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

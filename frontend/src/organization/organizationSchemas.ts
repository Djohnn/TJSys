import { z } from 'zod'

export const companySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(200),
  cnpj: z.string().max(18).default(''),
  ie: z.string().max(20).default(''),
  is_active: z.boolean().default(true),
})

export type CompanyFormData = z.infer<typeof companySchema>

export const branchSchema = z.object({
  company: z.string().min(1, 'Empresa é obrigatória'),
  name: z.string().min(1, 'Nome é obrigatório').max(200),
  ie: z.string().max(20).default(''),
  is_active: z.boolean().default(true),
})

export type BranchFormData = z.infer<typeof branchSchema>

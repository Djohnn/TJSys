import { z } from 'zod'

export const personFormSchema = z.object({
  person_type: z.enum(['PF', 'PJ']),
  name: z.string().default(''),
  cpf: z.string().default(''),
  rg: z.string().default(''),
  company_name: z.string().default(''),
  trade_name: z.string().default(''),
  cnpj: z.string().default(''),
  ie: z.string().default(''),
  role: z.enum(['customer', 'supplier', 'employee']),
  is_active: z.boolean().default(true),
}).superRefine((data, ctx) => {
  if (data.person_type === 'PF') {
    if (!data.name) ctx.addIssue({ code: 'custom', path: ['name'], message: 'Nome é obrigatório' })
    if (!data.cpf) ctx.addIssue({ code: 'custom', path: ['cpf'], message: 'CPF é obrigatório' })
  } else {
    if (!data.company_name) ctx.addIssue({ code: 'custom', path: ['company_name'], message: 'Razão Social é obrigatória' })
    if (!data.trade_name) ctx.addIssue({ code: 'custom', path: ['trade_name'], message: 'Nome Fantasia é obrigatório' })
    if (!data.cnpj) ctx.addIssue({ code: 'custom', path: ['cnpj'], message: 'CNPJ é obrigatório' })
  }
})

export type PersonFormData = z.infer<typeof personFormSchema>

export const addressFormSchema = z.object({
  street: z.string().min(1, 'Logradouro é obrigatório'),
  number: z.string().min(1, 'Número é obrigatório'),
  complement: z.string().default(''),
  neighborhood: z.string().min(1, 'Bairro é obrigatório'),
  city: z.string().min(1, 'Cidade é obrigatória'),
  state: z.string().min(1, 'Estado é obrigatório'),
  zip: z.string().min(1, 'CEP é obrigatório'),
  is_primary: z.boolean().default(false),
})

export type AddressFormData = z.infer<typeof addressFormSchema>

export const contactFormSchema = z.object({
  type: z.enum(['phone', 'email']),
  value: z.string().min(1, 'Valor é obrigatório'),
  is_primary: z.boolean().default(false),
})

export type ContactFormData = z.infer<typeof contactFormSchema>

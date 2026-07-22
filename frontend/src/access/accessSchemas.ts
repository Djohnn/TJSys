import { z } from 'zod'

export const roleSchema = z.enum(['admin', 'manager', 'operator'])

export const inviteSchema = z.object({
  email: z.string().email('Email inválido'),
  role: roleSchema,
  branch_ids: z.array(z.string()).optional(),
})

export const memberUpdateSchema = z.object({
  role: roleSchema.optional(),
  is_active: z.boolean().optional(),
  branch_ids: z.array(z.string()).optional(),
})

export type InviteFormData = z.infer<typeof inviteSchema>
export type MemberUpdateFormData = z.infer<typeof memberUpdateSchema>

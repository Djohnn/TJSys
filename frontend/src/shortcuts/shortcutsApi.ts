import { apiRequest } from '@/api/client'

export interface Shortcuts {
  [key: string]: string
}

export async function getShortcuts(tenantId: string, signal?: AbortSignal): Promise<Shortcuts> {
  const response = await apiRequest<{ shortcuts: Shortcuts }>('/auth/shortcuts/', {
    tenantId,
    signal,
  })
  return response?.shortcuts ?? {}
}

export async function updateShortcuts(
  tenantId: string,
  shortcuts: Shortcuts,
  signal?: AbortSignal,
): Promise<Shortcuts> {
  const response = await apiRequest<{ shortcuts: Shortcuts }>('/auth/shortcuts/', {
    method: 'PUT',
    body: { shortcuts },
    tenantId,
    signal,
  })
  return response?.shortcuts ?? {}
}

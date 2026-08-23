const DEFAULT_PDV_BASE_URL = 'http://127.0.0.1:5199'
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000/api/v1'

export const PDV_BASE_URL = process.env.BASE_URL ?? DEFAULT_PDV_BASE_URL
export const API_BASE_URL = (process.env.E2E_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, '')
export const EXTERNAL_SERVER = process.env.E2E_EXTERNAL_SERVER === '1'

export function apiUrl(path: string): string {
  return `${API_BASE_URL}/${path.replace(/^\/+/, '')}`
}

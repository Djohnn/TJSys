import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const authStorageDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'test-results',
  '.auth',
)

export const authStorageState = path.join(authStorageDirectory, 'e2e-user.json')

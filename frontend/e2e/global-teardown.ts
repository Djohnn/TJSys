import { rm } from 'node:fs/promises'
import { authStorageDirectory } from './auth-state'

export default async function globalTeardown(): Promise<void> {
  await rm(authStorageDirectory, { recursive: true, force: true })
}

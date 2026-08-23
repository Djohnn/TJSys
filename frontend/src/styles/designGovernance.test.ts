import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import manifest from '../../../docs/02_Architecture/design-system/reference/manifest.json'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../')

it('fixa a versão e os hashes aprovados para todos os assets', () => {
  expect(manifest.version).toBe('1.0.0')

  const assets = Object.entries(manifest.assets)
  expect(assets).toHaveLength(4)

  for (const [name, asset] of assets) {
    expect(asset.path, `${name} path`).toBeTruthy()
    expect(asset.sha256, `${name} hash format`).toMatch(/^[A-F0-9]{64}$/)

    const assetPath = resolve(repositoryRoot, asset.path)
    expect(existsSync(assetPath), `${name} asset exists`).toBe(true)

    const rawAsset = readFileSync(assetPath)
    const canonicalAsset = /\.(md|html)$/i.test(asset.path)
      ? Buffer.from(rawAsset.toString('utf8').replace(/\r\n/g, '\n'))
      : rawAsset
    const actualHash = createHash('sha256')
      .update(canonicalAsset)
      .digest('hex')
      .toUpperCase()
    expect(actualHash, `${name} SHA-256`).toBe(asset.sha256)
  }
})

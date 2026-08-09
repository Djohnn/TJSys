export const forbiddenHex = /#[0-9a-fA-F]{3,8}\b/g

export function findLiteralColors(path, source) {
  if (path.endsWith('tokens.css') || path.includes('/test/') || path.endsWith('.test.ts') || path.endsWith('.test.tsx')) return []
  return [...source.matchAll(forbiddenHex)].map(match => ({ path, value: match[0] }))
}

// CLI entry point
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function main() {
  const frontendSrc = path.resolve(__dirname, '..', 'src')
  const errors = []

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        scanDir(fullPath)
      } else if (entry.isFile()) {
        const relPath = path.relative(process.cwd(), fullPath)
        if (!relPath.endsWith('tokens.css') && !relPath.includes('/test/') && !relPath.endsWith('.test.ts') && !relPath.endsWith('.test.tsx')) {
          const source = fs.readFileSync(fullPath, 'utf-8')
          const matches = findLiteralColors(relPath, source)
          if (matches.length > 0) {
            errors.push(...matches)
          }
        }
      }
    }
  }

  scanDir(frontendSrc)

  if (errors.length > 0) {
    console.error('❌ Cores HEX literais encontradas (fora de tokens.css):')
    for (const err of errors) {
      console.error(`  ${err.path}: ${err.value}`)
    }
    process.exit(1)
  } else {
    console.log('✅ Nenhuma cor HEX literal encontrada fora de tokens.css')
    process.exit(0)
  }
}

main()
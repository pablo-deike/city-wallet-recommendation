import { readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', '.vite', '__tests__'])
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx'])

function normalizePath(value) {
  return value.replaceAll('\\', '/')
}

export function collectAppSourceFiles({ rootDir = APP_ROOT_DIR } = {}) {
  const files = []

  function walk(currentDir) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) {
          continue
        }

        walk(join(currentDir, entry.name))
        continue
      }

      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(extname(entry.name))) {
        continue
      }

      const absolutePath = join(currentDir, entry.name)
      const relPath = normalizePath(relative(rootDir, absolutePath))

      if (relPath.split('/').includes('__tests__')) {
        continue
      }

      files.push({
        relPath,
        contents: readFileSync(absolutePath, 'utf8'),
      })
    }
  }

  walk(rootDir)

  return files.sort((left, right) => left.relPath.localeCompare(right.relPath))
}

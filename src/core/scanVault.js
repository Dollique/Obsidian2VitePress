import { promises as fs } from 'node:fs'
import path from 'node:path'
import { routeForNote } from './slug.js'

export async function scanVaults(config) {
  const notes = []

  for (const vault of config.vaults) {
    const root = path.resolve(vault.root)
    const files = await walk(root)

    for (const file of files) {
      if (!file.endsWith('.md')) continue

      const relativePath = slash(path.relative(root, file))
      if (!isIncluded(relativePath, vault)) continue

      const content = await fs.readFile(file, 'utf8')
      const basename = path.basename(relativePath, '.md')
      notes.push({
        vault,
        root,
        absolutePath: file,
        relativePath,
        basename,
        content
      })
    }
  }

  const index = createNoteIndex(notes, config)
  return { notes, index }
}

function createNoteIndex(notes, config) {
  const byRoute = new Map()
  const byTarget = new Map()

  for (const note of notes) {
    note.route = routeForNote(note, config)

    if (byRoute.has(note.route)) {
      const existing = byRoute.get(note.route)
      throw new Error(`Route collision: ${existing.relativePath} and ${note.relativePath} both resolve to ${note.route}`)
    }

    byRoute.set(note.route, note)

    addTarget(byTarget, note.basename, note)
    addTarget(byTarget, note.relativePath.replace(/\.md$/i, ''), note)
    addTarget(byTarget, note.relativePath, note)
  }

  return { byRoute, byTarget }
}

function addTarget(map, target, note) {
  const key = normalizeTarget(target)
  const matches = map.get(key) ?? []
  if (matches.includes(note)) return

  matches.push(note)
  map.set(key, matches)
}

export function normalizeTarget(target) {
  return target
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
    .trim()
    .toLowerCase()
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (entry.name === '.obsidian' || entry.name === '.git') continue

    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath))
    } else if (entry.isFile()) {
      files.push(fullPath)
    }
  }

  return files
}

function isIncluded(relativePath, vault) {
  if (vault.include?.length && !vault.include.some((prefix) => relativePath.startsWith(prefix))) {
    return false
  }

  if (vault.exclude?.some((prefix) => relativePath.startsWith(prefix))) {
    return false
  }

  return true
}

function slash(value) {
  return value.replace(/\\/g, '/')
}

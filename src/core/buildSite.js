import { promises as fs } from 'node:fs'
import path from 'node:path'
import { resolveConfig } from './defaults.js'
import { scanVaults } from './scanVault.js'
import { collectBacklinks, convertMarkdown } from './convertMarkdown.js'

export async function buildSite(userConfig) {
  const config = resolveConfig(userConfig)
  const outDir = path.resolve(config.outDir)

  if (config.cleanOutDir) {
    await fs.rm(outDir, { recursive: true, force: true })
  }

  await fs.mkdir(outDir, { recursive: true })

  const { notes, index } = await scanVaults(config)
  const backlinks = collectBacklinks(notes, index, config)

  for (const note of notes) {
    const markdown = convertMarkdown(note, { index, config, backlinks })
    const outputPath = path.join(outDir, `${note.outputRoute.replace(/^\/+/, '')}.md`)
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, markdown, 'utf8')
  }

  return {
    outDir,
    notes: notes.map((note) => ({
      source: note.absolutePath,
      route: note.route
    }))
  }
}

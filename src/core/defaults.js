export const defaultConfig = {
  outDir: 'docs/generated',
  cleanOutDir: true,
  slug: {
    strategy: 'vitepress'
  },
  brokenLinks: 'route',
  unsupportedSyntax: 'fail',
  assets: {
    outDir: 'assets',
    preserveFilenames: true
  },
  embeds: {
    notes: 'inline',
    assets: 'copy'
  },
  backlinks: {
    enabled: true,
    heading: 'Backlinks'
  }
}

export function resolveConfig(config) {
  if (!config || !Array.isArray(config.vaults) || config.vaults.length === 0) {
    throw new Error('Obsidian2VitePress requires at least one configured vault.')
  }

  return {
    ...defaultConfig,
    ...config,
    slug: {
      ...defaultConfig.slug,
      ...config.slug
    },
    assets: {
      ...defaultConfig.assets,
      ...config.assets
    },
    embeds: {
      ...defaultConfig.embeds,
      ...config.embeds
    },
    backlinks: {
      ...defaultConfig.backlinks,
      ...config.backlinks
    }
  }
}

export function createSlug(value, strategy = 'vitepress') {
  if (strategy === 'preserve') {
    return value
  }

  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\\/g, '/')
    .split('/')
    .map((part) =>
      part
        .trim()
        .replace(/\.[^.]+$/, '')
        .replace(/['"]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
    )
    .filter(Boolean)
    .join('/')
}

export function normalizeRouteBase(routeBase = '') {
  if (!routeBase || routeBase === '/') return ''
  return `/${routeBase.replace(/^\/+|\/+$/g, '')}`
}

export function routeForNote(note, config) {
  const routeBase = normalizeRouteBase(note.vault.routeBase)
  const strategy = config.slug?.strategy ?? 'vitepress'
  const custom = config.slug?.custom

  if (strategy === 'custom') {
    if (typeof custom !== 'function') {
      throw new Error('slug.strategy is custom, but slug.custom is not a function.')
    }

    return normalizeGeneratedRoute(custom({
      vaultName: note.vault.name,
      sourcePath: note.relativePath,
      basename: note.basename
    }), routeBase)
  }

  return normalizeGeneratedRoute(createSlug(note.relativePath, strategy), routeBase)
}

export function routeForUncreatedNote(target, sourceNote, config) {
  const routeBase = normalizeRouteBase(sourceNote?.vault?.routeBase)
  const strategy = config.slug?.strategy ?? 'vitepress'
  const withoutAnchor = target.split('#')[0]
  return normalizeGeneratedRoute(createSlug(withoutAnchor, strategy), routeBase)
}

export function anchorSlug(value) {
  return createSlug(value, 'vitepress')
}

function normalizeGeneratedRoute(route, routeBase) {
  const cleanRoute = String(route)
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
    .replace(/^\/+|\/+$/g, '')

  return `${routeBase}/${cleanRoute}`.replace(/\/+/g, '/')
}

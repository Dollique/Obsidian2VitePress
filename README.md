# Obsidian2VitePress

Local VitePress plugin for copying Obsidian vault notes into VitePress-compatible Markdown.

Current scaffold supports:

- Multiple vaults.
- VitePress-style route generation.
- Wikilinks.
- Uncreated wikilinks as normal links to missing VitePress routes.
- Backlinks appended to generated target notes.
- Basic Obsidian callout conversion to VitePress containers.

## Usage

```js
// docs/.vitepress/config.js
import { defineConfig } from 'vitepress'
import { obsidian2vitepress } from '../../src/index.js'

export default defineConfig({
  vite: {
    plugins: [
      obsidian2vitepress({
        vaults: [
          {
            name: 'main',
            root: '../vault',
            routeBase: '/'
          }
        ],
        outDir: 'docs/generated',
        brokenLinks: 'route'
      })
    ]
  }
})
```

## Broken Links

Default behavior is:

```js
brokenLinks: 'route'
```

That means `[[Missing Note]]` becomes:

```md
[Missing Note](/missing-note)
```

No generated file is created for the missing note. VitePress or the deployed site handles that route.

Other policies:

- `fail`: throw during conversion.
- `warn`: print a warning and render the expected route.
- `preserve`: leave the original Obsidian wikilink text.

## Backlinks

Backlinks are enabled by default. If `Alpha.md` links to `[[Beta]]`, the generated `beta.md` receives:

```md
## Backlinks

- [Alpha](/alpha)
```

Only existing target notes receive backlink sections.

## Test

```sh
npm test
```

# Obsidian2VitePress

Local VitePress plugin for copying Obsidian vault notes into VitePress-compatible Markdown.

Current scaffold supports:

- Multiple vaults.
- VitePress-style route generation.
- Selective note inclusion using frontmatter (`filterByPublished`) and obsidian property (`published`).
- Dynamic folder routing via frontmatter (`useParentProperty`) and obsidian property (`parent`).
- Numerical sequence ordering via frontmatter (`useOrderProperty`) and obsidian property (`order`).
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
        brokenLinks: 'route',
        // Optional feature flags
        filterByPublished: true,  // Only process notes with published: true
        useParentProperty: true,  // Override folder routing with frontmatter parent
        useOrderProperty: true   // Prefix route filenames with frontmatter order
      })
    ]
  }
})
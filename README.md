# Obsidian2VitePress

A local VitePress plugin that converts and imports Obsidian vault notes into VitePress-compatible Markdown.

## Features

- **Multi-Vault Support:** Import notes from multiple Obsidian vaults simultaneously.
- **VitePress Route Generation:** Automatic path mapping for generated Markdown files.
- **Selective Publishing (`filterByPublished`):** Only process notes marked with `published: true` in frontmatter.
- **Custom Folder Hierarchy (`useParentProperty`):** Override directory structures using the `parent` frontmatter property.
- **Ordered Filenames (`useOrderProperty`):** Prefix filenames and routes using a numerical `order` frontmatter property.
- **Homepage Routing (`useHomeRewrite`):** Automatically rewrite notes with `layout: home` to `index.md`.
- **Wikilink Resolution:** Parse standard `[[Wikilinks]]` and handle links to uncreated notes seamlessly.
- **Backlink Generation:** Append backlink lists automatically to referenced target pages.
- **Callout Support:** Convert Obsidian `> [!NOTE]` callout syntax into standard VitePress custom containers.
- **Paywall Management (`serverDir`, `paywallProperty`, `paywallIndicator`):** Securely restrict full articles or split content dynamically by moving restricted body text to a server directory while keeping frontmatter route stubs public.

## Configuration Options

| Option                 | Type     | Default                   | Description                                                                                                                                                                                                 |
| :--------------------- | :------- | :------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`serverDir`**        | `string` | `"server/paywalledNotes"` | Target directory where full paywalled note bodies or split paywalled sections are saved for your backend server to fetch securely.                                                                          |
| **`paywallProperty`**  | `string` | `"paywall"`               | The frontmatter boolean property name used to completely paywall an article (e.g., `paywall: true`). Generates a frontmatter-only stub for VitePress routing while storing the full content in `serverDir`. |
| **`paywallIndicator`** | `string` | `"PAYWALL"`               | The inline marker string (used as `{{ PAYWALL }}`) to split a single note into public content (above the marker) and paywalled content (below the marker).                                                  |

## Usage

```js
// docs/.vitepress/config.js
import { defineConfig } from "vitepress";
import { obsidian2vitepress } from "../../src/index.js";

export default defineConfig({
  vite: {
    plugins: [
      obsidian2vitepress({
        vaults: [
          {
            name: "main",
            root: "../vault",
            routeBase: "/",
          },
        ],
        outDir: "docs/generated",
        brokenLinks: "route",
        // Optional feature flags
        filterByPublished: true, // Include only notes where `published: true`
        useParentProperty: true, // Route files based on `parent:` frontmatter
        useOrderProperty: true, // Prefix file slugs with numerical `order:` frontmatter
        useHomeRewrite: true, // Save notes with `layout: home` as `index.md`
        serverDir: "server/paywalledNotes", // Directory for backend-served paywalled content
        paywallProperty: "paywall", // Frontmatter key for full article paywalls
        paywallIndicator: "PAYWALL", // Inline tag for partial content paywalls (e.g. {{ PAYWALL }})
        callouts: {
          wrap: true, // wrap all callouts in a `div` wrapper element
          fallbackType: "info", // if a custom callback is used fall back to this type
          typeAsLabelFallback: true, // if no title is provided, always use the type name as the label
          prettifyLabels: true, // all labels are prettified
        },
      }),
    ],
  },
});
```

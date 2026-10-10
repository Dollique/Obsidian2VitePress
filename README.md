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
- **Custom Image Rendering:** Configure image output to use standard HTML `<img>` tags or custom Vue components, with optional wrapper elements and support for image dimensions.
- **Paywall Management (`serverDir`, `paywallProperty`, `paywallIndicator`, `hidePaywalledContentInNavigation`):** Securely restrict full article bodies (stripping frontmatter) or split content dynamically, stamping `isFullyPaywalled` frontmatter metadata on public stubs to guide frontend navigation visibility.
- **Mystical Paywall Teaser (`mysticalPaywall`):** Wrap locked paywalled content stubs in a `.mystical-paywall` container with randomized text placeholders for unauthenticated visitors to preview before unlocking.

## Asset Configuration Options

Configure how assets are imported and how Obsidian image embeds are rendered.

| Option                     | Type      | Default    | Description                                                                                                                                                                          |
| :------------------------- | :-------- | :--------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`outDir`**               | `string`  | `"assets"` | Output directory for imported assets.                                                                                                                                                |
| **`preserveFilenames`**    | `boolean` | `true`     | Preserve original asset filenames when importing assets.                                                                                                                             |
| **`customImageComponent`** | `string`  | `""`       | Optional Vue component name used to render image embeds (e.g., `"ImageLightbox"`). An empty string outputs a standard HTML `<img>` tag.                                              |
| **`wrapperElement`**       | `string`  | `""`       | Optional CSS class for a `<div>` wrapping each rendered image. For example, `"image-wrapper"` produces `<div class="image-wrapper">...</div>`. An empty string disables the wrapper. |

Image dimension attributes are included when dimensions are specified in the Obsidian embed. Images without explicit dimensions are still rendered using the configured image output.

## Paywall Configuration Options

| Option                                 | Type      | Default                   | Description                                                                                                                                                                                                                            |
| :------------------------------------- | :-------- | :------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`serverDir`**                        | `string`  | `"server/paywalledNotes"` | Target directory where full paywalled note body content or split paywalled sections are saved for your backend server to fetch securely.                                                                                               |
| **`paywallProperty`**                  | `string`  | `"paywall"`               | The frontmatter boolean property name used to completely paywall an article (e.g., `paywall: true`). Generates a frontmatter-only stub for VitePress routing while storing only the body content (without frontmatter) in `serverDir`. |
| **`paywallIndicator`**                 | `string`  | `"PAYWALL"`               | The inline marker string (used as `{{ PAYWALL }}`) to split a single note into public content (above the marker) and paywalled content (below the marker).                                                                             |
| **`paywallInfoComponent`**             | `string`  | `undefined`               | Optional Vue component name (e.g., `"PaywallInfo"`) injected automatically at the split boundary of partial paywall articles. If empty or omitted, no component is appended.                                                           |
| **`hidePaywalledContentInNavigation`** | `string`  | `"mixed"`                 | Controls sidebar visibility mode for paywalled items: `"all"` (hide all paywalled items), `"mixed"` (keep Rule 1 teasers visible, hide Rule 2 stubs), or `"none"` (keep everything visible).                                           |
| **`mysticalPaywall`**                  | `boolean` | `false`                   | Enables wrapping of locked paywalled stubs in a `.mystical-paywall` frontend preview container.                                                                                                                                        |

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
        filterByPublished: true, // Include only notes where published: true
        useParentProperty: true, // Route files based on parent: frontmatter
        useOrderProperty: true, // Prefix file slugs with numerical order: frontmatter
        useHomeRewrite: true, // Save notes with layout: home as index.md

        // Asset configuration
        assets: {
          outDir: "assets",
          preserveFilenames: true,
          customImageComponent: "ImageLightbox", // Empty string uses a standard <img> tag
          wrapperElement: "image-wrapper", // Empty string disables the wrapper
        },

        // Paywall configuration
        serverDir: "server/paywalledNotes",
        paywallProperty: "paywall", // Frontmatter key for full article paywalls
        paywallIndicator: "PAYWALL", // Inline tag for partial content paywalls (e.g. {{ PAYWALL }})
        hidePaywalledContentInNavigation: "mixed", // Navigation visibility mode ("all" | "mixed" | "none")
        mysticalPaywall: true, // Wrap locked content in a mystical preview container

        callouts: {
          wrap: true, // Wrap all callouts in a div wrapper element
          fallbackType: "info", // Fallback type when a custom callback is used
          typeAsLabelFallback: true, // Use the type as the label when no title is provided
          prettifyLabels: true, // Prettify all labels
        },
      }),
    ],
  },
});
```

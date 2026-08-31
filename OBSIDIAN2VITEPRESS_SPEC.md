# Obsidian2VitePress Spec

## Purpose

Obsidian2VitePress is a local VitePress-oriented build plugin that converts one or more Obsidian vaults into VitePress-compatible Markdown/HTML pages.

The plugin's first job is reliable publishing: take Obsidian Markdown as authored in a vault, resolve Obsidian-specific syntax, copy the converted content into the VitePress docs tree, and fail loudly when it encounters syntax or references it cannot handle.

The project starts as a local plugin in this repository. Its public API and filesystem boundaries should be designed so it can later mature into an npm package without rewriting the core conversion pipeline.

## Goals

- Convert Obsidian Markdown into VitePress routes.
- Support multiple user-configured vaults.
- Copy generated files into the VitePress docs directory instead of mutating source vault files.
- Preserve authoring ergonomics in Obsidian.
- Follow VitePress theme conventions for rendered output.
- Treat unsupported conversion behavior as a bug and fail by default.
- Make broken link handling configurable.
- Keep the implementation maintainable for VitePress by integrating with the Markdown tooling VitePress already uses where practical.

## Non-Goals For V1

- Full compatibility with every third-party Obsidian plugin.
- A standalone hosted publishing service.
- Editing or normalizing the source vault in place.
- Owning a custom visual theme independent of VitePress.
- Publishing as an npm package immediately.

## Primary User Flow

1. User configures one or more Obsidian vaults.
2. User runs the VitePress dev server or build.
3. Obsidian2VitePress scans configured vaults.
4. The plugin copies converted Markdown/assets into a generated VitePress docs location.
5. VitePress renders the generated files as normal pages.
6. Unsupported syntax fails the build.
7. Broken links follow the configured policy.

## Package Shape

Initial local layout should separate the plugin shell from conversion logic:

```text
src/
  plugin/
    vitepressPlugin.ts
  core/
    convertMarkdown.ts
    resolveLinks.ts
    scanVault.ts
    copyAssets.ts
    slug.ts
  types.ts
```

The eventual npm package should expose:

```ts
export function obsidian2vitepress(
  config: Obsidian2VitePressConfig,
): VitePressPlugin;
```

Exact exported type should be adjusted to match VitePress plugin integration once implementation confirms the best hook point.

## Configuration

Proposed config:

```ts
export interface Obsidian2VitePressConfig {
  vaults: VaultConfig[];
  outDir: string;
  cleanOutDir?: boolean;
  slug?: SlugConfig;
  brokenLinks?: BrokenLinkPolicy;
  unsupportedSyntax?: UnsupportedSyntaxPolicy;
  assets?: AssetConfig;
  embeds?: EmbedConfig;
  backlinks?: BacklinkConfig;
  callouts?: CalloutConfig;
}

export interface VaultConfig {
  name: string;
  root: string;
  include?: string[];
  exclude?: string[];
  routeBase?: string;
}

export interface SlugConfig {
  strategy?: "vitepress" | "kebab" | "preserve" | "custom";
  custom?: (input: SlugInput) => string;
}

export interface SlugInput {
  vaultName: string;
  sourcePath: string;
  basename: string;
  heading?: string;
}

export type BrokenLinkPolicy = "route" | "fail" | "warn" | "preserve";
export type UnsupportedSyntaxPolicy = "fail";

export interface AssetConfig {
  outDir?: string;
  preserveFilenames?: boolean;
}

export interface EmbedConfig {
  notes?: "inline" | "card" | "link";
  assets?: "copy" | "link";
}

export interface BacklinkConfig {
  enabled?: boolean;
  heading?: string;
}
```

Defaults:

```ts
{
  cleanOutDir: true,
  slug: { strategy: 'vitepress' },
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
  callouts: {
    wrap: true,
    fallbackType: 'info'
  }
}
```

## Multiple Vaults

Multiple vaults are first-class.

Each vault must have:

- A unique `name`.
- A filesystem `root`.
- An optional `routeBase`.

Route examples:

```ts
vaults: [
  {
    name: "personal",
    root: "../PersonalVault",
    routeBase: "/personal",
  },
  {
    name: "work",
    root: "../WorkVault",
    routeBase: "/work",
  },
];
```

If two generated pages resolve to the same output route, the plugin must fail with a collision error that lists both source files.

## Output Model

The plugin copies converted content into the configured VitePress docs tree.

Example:

```text
vault/
  Notes/My Note.md

docs/
  generated/
    notes/my-note.md
```

The generated Markdown should be valid VitePress Markdown. Obsidian-specific syntax should be converted before VitePress renders the page.

Generated files should be treated as build artifacts. Source vault files are never changed.

## Markdown Parser Direction

Use the most maintainable fit for VitePress.

VitePress uses Markdown-it internally, so v1 should prefer a Markdown-it-compatible transform strategy unless implementation research shows a serious limitation. This keeps behavior closer to VitePress and reduces impedance between conversion and rendering.

Recommended approach:

- Pre-scan vault files to build note, heading, block, and asset indexes.
- Convert Obsidian-specific syntax into VitePress-compatible Markdown/HTML before final VitePress rendering.
- Use Markdown-it plugins or token transforms where that produces safer behavior than regex replacement.
- Use structured parsing for YAML frontmatter.

## Supported Obsidian Features In V1

### Wikilinks

Support:

```md
[[Page]]
[[Page|Alias]]
[[Folder/Page]]
[[Page#Heading]]
[[Page#Heading|Alias]]
[[Page#^block-id]]
```

Output should be standard Markdown links targeting generated VitePress routes:

```md
[Page](/generated/page)
[Alias](/generated/page)
[Alias](/generated/page#heading)
```

### Embeds

Support:

```md
![[image.png]]
![[Folder/image.png]]
![[Note]]
![[Note#Heading]]
```

Asset embeds should become normal Markdown or HTML media references after copying assets:

```md
![image](/generated/assets/image.png)
```

Note embeds should be configurable:

- `inline`: inline the converted content.
- `card`: emit a VitePress-theme-friendly block linking to the note.
- `link`: emit a normal link.

Default: `inline`.

### Callouts

Support Obsidian callouts:

```md
> [!note]
> Content

> [!note]- Folded by default
> Content

> [!note]+ Expanded, collapsible
> Content
```

Conversion behavior:

- The type is mapped to a VitePress custom container (see mapping below).
- A `-` or `+` marker forces a `details` (foldable) container, overriding the
  type's normal mapping. Without a marker, the type mapping decides.
- `+` additionally adds an `open` class to the wrapper so the theme can expand
  the `<details>` on render (VitePress has no "expanded-but-collapsible" mode).
- Unknown callout types fall back to `info` rather than failing, so custom
  callouts (e.g. `[!musicbox]`) render instead of crashing the build. The
  fallback type is configurable.

Type mapping (used when no `-`/`+` marker is present):

```text
note      -> info
info      -> info
todo      -> info
tip       -> tip
success   -> tip
question  -> details
warning   -> warning
failure   -> danger
danger    -> danger
bug       -> danger
example   -> details
quote     -> details
unknown   -> info  (fallback)
```

Callout-specific configuration:

```ts
export interface CalloutConfig {
  wrap?: boolean; // wrap each callout in a <div class="callout callout-<type>">
  fallbackType?: string; // container type used for unknown callout types (default 'info')
}
```

Default: `{ wrap: true, fallbackType: 'info' }`.

When `wrap` is true, the converter emits:

```html
<div class="callout callout-musicbox">::: details Title content :::</div>
```

so themes can target callouts by their original Obsidian type id.

### Tags

Support inline and frontmatter tags:

```md
#tag
#nested/tag
```

V1 should preserve tags as semantic output with VitePress-friendly classes:

```html
<span class="vp-tag">tag</span>
```

Tags in code blocks must not be transformed.

### YAML Frontmatter

Preserve valid YAML frontmatter and allow plugin-generated fields when needed.

The plugin may add generated metadata such as:

```yaml
outline: deep
```

It must not overwrite explicit user frontmatter unless a documented option enables that behavior.

### Footnotes

Support standard Markdown footnotes if VitePress/Markdown-it plugin support is available in the local setup. If a footnote cannot be rendered correctly, fail.

### Math

Support Obsidian-style inline and block math:

```md
$x + y$

$$
x + y
$$
```

Implementation may require configuring the VitePress Markdown pipeline with a compatible math plugin. If math is present and the renderer is not configured, fail with a clear message.

### Mermaid

Support fenced Mermaid blocks:

````md
```mermaid
graph TD
  A --> B
```
````

Use VitePress-compatible Mermaid rendering if available. If not configured, fail with a clear message.

### Heading And Block Links

Heading links should resolve to generated route anchors.

Block links:

```md
^block-id
[[Page#^block-id]]
```

V1 should support resolving block links. Rendering block IDs may require injecting stable anchors near the target block.

## Unsupported Syntax

Unsupported syntax policy is intentionally strict:

```ts
unsupportedSyntax: "fail";
```

Unsupported Obsidian constructs should fail with:

- Source vault.
- Source file.
- Line number when available.
- Syntax snippet.
- Suggested issue category.

This keeps gaps visible during development and prevents silent publishing errors.

## Broken Links

Broken wikilinks are configurable. The default is to render a normal Markdown link to the route where the note would exist, leaving the missing document to VitePress and the deployed site to handle.

```ts
brokenLinks: "route" | "fail" | "warn" | "preserve";
```

Behavior:

- `route`: render a link to the expected generated route for the missing note.
- `fail`: stop the build.
- `warn`: emit a warning and render visibly unresolved output.
- `preserve`: keep the original Obsidian link text.

Default: `route`.

## Backlinks

Backlinks are enabled by default.

When a generated note has inbound wikilinks from other existing notes, the plugin appends a VitePress-compatible Markdown section:

```md
## Backlinks

- [Source Note](/source-note)
```

Only resolved links to existing notes produce backlinks. Links to uncreated notes still render as forward links to missing VitePress routes, but no backlink section is generated because there is no target document to modify.

## Asset Handling

Assets referenced by embeds or Markdown links should be copied into the generated output.

Supported initial asset types:

- Images: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`
- PDFs
- Audio/video files when linked or embedded

Asset output paths should avoid collisions. If two files share the same name but different content, the plugin should either preserve folders or add a content hash.

## Route And Slug Rules

Default route behavior should align with VitePress file routing.

Recommended default:

- Preserve folder hierarchy.
- Convert note filenames to URL-safe slugs.
- Use lowercase kebab-case for generated routes unless `slug.strategy` says otherwise.
- Resolve aliases through the note index.

Example:

```text
Vault: Notes/My Cool Note.md
Route: /notes/my-cool-note
```

Custom slug support should be available because vault naming conventions vary.

## Collision Handling

The plugin must fail on:

- Duplicate generated routes.
- Duplicate generated asset paths with different source files.
- Ambiguous wikilinks where multiple notes match the same target.
- Multiple vaults producing the same route without distinct `routeBase` values.

## Dev Server Behavior

The plugin should support both VitePress dev and build.

Dev mode:

- Watch configured vault files.
- Re-copy changed source files.
- Rebuild affected link indexes when needed.
- Surface conversion errors in the terminal.

Build mode:

- Clean output directory if configured.
- Run full scan.
- Convert all included files.
- Fail on configured errors.

## VitePress Theme Integration

The plugin should not own a separate visual theme.

Output should use:

- VitePress custom containers for callouts where possible.
- VitePress-compatible Markdown.
- Small semantic classes only where VitePress has no native construct, such as tags or note embed cards.

Any default CSS should be minimal and optional.

## Error Reporting

Errors should be actionable.

Example:

```text
Obsidian2VitePress: unresolved wikilink

Vault: personal
File: Notes/Example.md
Line: 42
Link: [[Missing Note]]
Policy: brokenLinks=fail
```

## Test Plan

Core tests:

- Scans one vault.
- Scans multiple vaults.
- Converts wikilinks.
- Converts aliases.
- Converts heading links.
- Converts block links.
- Converts asset embeds.
- Converts note embeds.
- Converts callouts.
- Preserves frontmatter.
- Converts tags outside code blocks.
- Detects broken links.
- Detects route collisions.
- Detects ambiguous links.
- Fails on unsupported syntax.

Integration tests:

- VitePress build succeeds with generated docs.
- VitePress dev updates generated files after vault edits.
- Generated routes match expected URLs.
- Generated assets load from expected paths.

Fixture structure:

```text
fixtures/
  single-vault/
  multi-vault/
  broken-links/
  embeds/
  callouts/
  collisions/
```

## Open Implementation Questions

- Exact VitePress hook point for copying generated files before dev/build page discovery.
- Whether to write generated files inside `docs/.obsidian2vitepress` or a user-facing `docs/generated` path.
- Whether note embed inlining should include or strip target frontmatter.
- How much default CSS is necessary for tags and embed cards.
- Whether Mermaid and math should be plugin-owned configuration or documented peer setup.
- Whether block IDs should render visible anchors or hidden anchors.

## V1 Acceptance Criteria

- User can configure at least two vaults.
- Plugin copies converted files into a VitePress docs directory.
- VitePress build produces pages for converted notes.
- Wikilinks resolve to VitePress routes.
- Embedded assets are copied and referenced correctly.
- Note embeds work with the default inline mode.
- Callouts render using VitePress theme containers.
- Unsupported syntax fails the build.
- Broken link behavior is configurable.
- Route collisions fail with clear diagnostics.
- Source vault files are never modified.

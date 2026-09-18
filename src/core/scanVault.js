import { promises as fs } from "node:fs";
import path from "node:path";
import { outputRouteForNote, routeForNote } from "./slug.js";
import { parseFrontmatter, injectTitleToMarkdown } from "./frontmatter.js";

// Helper: Normalize path separators
const slash = (value) => value.replace(/\\/g, "/");

// Helper: Check if a relative path is included in the vault
const isIncluded = (relativePath, vault) => {
  if (
    vault.include?.length &&
    !vault.include.some((prefix) => relativePath.startsWith(prefix))
  ) {
    return false;
  }
  if (vault.exclude?.some((prefix) => relativePath.startsWith(prefix))) {
    return false;
  }
  return true;
};

// Helper: Normalize the generated relative root
const normalizeGeneratedRelativeRoot = (outputRouteBase) => {
  return String(outputRouteBase ?? "").replace(/^\/+|\/+$/g, "");
};

// Helper: Check if a path is inside the generated output directory
const isGeneratedOutputPath = (candidate, options) => {
  if (!options.generatedRelativeRoot) return false;
  const relative = slash(path.relative(options.root, candidate));
  return (
    relative === options.generatedRelativeRoot ||
    relative.startsWith(`${options.generatedRelativeRoot}/`)
  );
};

// Helper: Normalize a target for indexing
export const normalizeTarget = (target) => {
  return target.replace(/\\/g, "/").replace(/\.md$/i, "").trim().toLowerCase();
};

// Helper: Add a note to the target index
const addTarget = (map, target, note) => {
  const key = normalizeTarget(target);
  const matches = map.get(key) ?? [];
  if (!matches.includes(note)) {
    matches.push(note);
    map.set(key, matches);
  }
};

// Helper: Recursively walk a directory
const walk = async (dir, options) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    // Skip hidden/system directories, git, and Obsidian trash
    if (
      entry.name === ".obsidian" ||
      entry.name === ".git" ||
      entry.name === ".trash"
    )
      continue;

    const fullPath = path.join(dir, entry.name);

    // Also catch any nested .trash directories or paths containing .trash/
    if (
      slash(fullPath).includes("/.trash/") ||
      slash(fullPath).endsWith("/.trash")
    )
      continue;

    if (
      fullPath === options.outDir ||
      fullPath.startsWith(`${options.outDir}/`)
    )
      continue;
    if (isGeneratedOutputPath(fullPath, options)) continue;

    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath, options)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
};

// Helper: Check if a note is paywalled via frontmatter property
const isPaywalled = (note, config) => {
  const paywallProperty = config.paywallProperty || "paywall";
  return note.frontmatter?.[paywallProperty] === true;
};

// Helper (DRY): Handles splitting content for Rule 1 ({{ PAYWALL }})
const extractSplitContent = (content, config) => {
  const paywallIndicator = config.paywallIndicator || "PAYWALL";
  const indicator = `{{ ${paywallIndicator} }}`;
  const indicatorIndex = content.indexOf(indicator);

  const publicContent = content.substring(0, indicatorIndex).trimEnd();
  const paywalledContent = content
    .substring(indicatorIndex + indicator.length)
    .trimStart();

  return { publicContent, paywalledContent };
};

// Helper: Save paywalled content to serverDir using the slug/outputRoute logic
const savePaywalledContent = async (note, config) => {
  const serverDir = config.serverDir || "server/paywalledNotes";
  const serverPath = path.resolve(serverDir);

  if (note.paywalledContent) {
    // Get the exact route structure computed by slug.js (e.g. including useParentProperty, order, etc.)
    const generatedRoute = outputRouteForNote(note, config);
    // Remove leading slash and append .md extension
    const relativeOutputPath = `${generatedRoute.replace(/^\/+/, "")}.md`;
    const filePath = path.join(serverPath, relativeOutputPath);
    const fileDir = path.dirname(filePath);

    try {
      await fs.mkdir(fileDir, { recursive: true });
      await fs.writeFile(filePath, note.paywalledContent);
      console.log(
        `Moved paywalled content for "${note.basename}" to ${filePath}`,
      );
    } catch (error) {
      console.error(
        `Failed to write paywalled content for "${note.basename}": ${error.message}`,
      );
    }
  }
};

// Main: Scan all vaults and create an index
export const scanVaults = async (config) => {
  const notes = [];
  const outDir = path.resolve(config.outDir);
  const generatedRelativeRoot = normalizeGeneratedRelativeRoot(
    config.outputRouteBase,
  );

  for (const vault of config.vaults) {
    const root = path.resolve(vault.root);
    const files = await walk(root, {
      root,
      outDir,
      generatedRelativeRoot,
    });

    for (const file of files) {
      if (!file.endsWith(".md")) continue;

      const relativePath = slash(path.relative(root, file));
      if (!isIncluded(relativePath, vault)) continue;

      const rawContent = await fs.readFile(file, "utf8");
      const basename = path.basename(relativePath, ".md");

      const content = injectTitleToMarkdown(rawContent, basename);
      const frontmatter = parseFrontmatter(content);

      // Skip if not published (if filtering is enabled)
      if (config.filterByPublished && !frontmatter.published) continue;

      const noteObj = {
        vault,
        root,
        absolutePath: file,
        relativePath,
        basename,
        frontmatter,
      };

      const paywalled = isPaywalled(noteObj, config);
      const paywallIndicator = config.paywallIndicator || "PAYWALL";
      const hasPaywallIndicator = content.includes(`{{ ${paywallIndicator} }}`);

      if (hasPaywallIndicator) {
        // Rule 1: Split content via {{ PAYWALL }} indicator
        console.log(`Note "${basename}" has {{ PAYWALL }}. Splitting content.`);
        const { publicContent, paywalledContent } = extractSplitContent(
          content,
          config,
        );

        noteObj.paywalledContent = paywalledContent;
        await savePaywalledContent(noteObj, config);

        notes.push({
          ...noteObj,
          content: publicContent,
          paywalled: false,
          paywalledContent: null,
        });
      } else if (paywalled) {
        // Rule 2: Paywalled via property. Full content to serverDir, frontmatter-only stub to outDir.
        console.log(
          `Note "${basename}" is paywalled via property. Moving full content to serverDir and writing frontmatter stub to outDir.`,
        );

        // 1. Save the *entire* original content to the server folder using full noteObj
        noteObj.paywalledContent = content;
        await savePaywalledContent(noteObj, config);

        // 2. Extract only the frontmatter for the public outDir stub
        const firstClosingFrontmatter = content.indexOf("---", 3);
        const frontmatterEndIndex =
          firstClosingFrontmatter !== -1
            ? firstClosingFrontmatter + 3
            : content.length;
        const frontmatterOnlyStub = content.substring(0, frontmatterEndIndex);

        // 3. Push stub to notes so VitePress generates the route for it
        notes.push({
          ...noteObj,
          content: frontmatterOnlyStub,
          paywalled: true,
          paywalledContent: null,
        });
      } else {
        // Non-paywalled note
        notes.push({
          ...noteObj,
          content,
          paywalled: false,
          paywalledContent: null,
        });
      }
    }
  }

  return {
    notes,
    index: createNoteIndex(notes, config),
  };
};

// Helper: Create an index of notes by route and target
const createNoteIndex = (notes, config) => {
  const byRoute = new Map();
  const byTarget = new Map();

  for (const note of notes) {
    note.outputRoute = outputRouteForNote(note, config);
    note.route = routeForNote(note, config);

    // Check for route collisions
    if (byRoute.has(note.route)) {
      const existing = byRoute.get(note.route);
      throw new Error(
        `Route collision: ${existing.relativePath} and ${note.relativePath} both resolve to ${note.route}`,
      );
    }
    byRoute.set(note.route, note);

    // Index by original basename, relative path (with/without .md)
    addTarget(byTarget, note.basename, note);
    addTarget(byTarget, note.relativePath.replace(/\.md$/i, ""), note);
    addTarget(byTarget, note.relativePath, note);

    // If home rewrite is active and note is marked as home layout, also index under 'index'
    if (
      config.useHomeRewrite &&
      String(note.frontmatter?.layout).trim().toLowerCase() === "home"
    ) {
      addTarget(byTarget, "index", note);
    }

    // If order property is active, also index by ordered target name
    if (
      config.useOrderProperty &&
      note.frontmatter?.order !== undefined &&
      note.frontmatter?.order !== null &&
      note.frontmatter?.order !== "" &&
      !isNaN(Number(note.frontmatter.order))
    ) {
      const orderedName = `${note.frontmatter.order}-${note.basename}`;
      addTarget(byTarget, orderedName, note);
    }
  }

  return { byRoute, byTarget };
};

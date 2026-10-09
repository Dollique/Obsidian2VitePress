import { promises as fs } from "node:fs";
import path from "node:path";
import { outputRouteForNote, routeForNote } from "./slug.js";
import { parseFrontmatter, injectTitleToMarkdown } from "./frontmatter.js";
import { collectBacklinks } from "./convertMarkdown.js";
import {
  slash,
  isIncluded,
  normalizeGeneratedRelativeRoot,
  walk,
  stripEmbeddedAssets,
  randomizeWordsInText,
} from "../utils.js";

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

// Main: Scan all vaults and create an index
export const scanVaults = async (config) => {
  const notes = [];
  const pendingPaywallSaves = []; // Queue paywalled items to save after indexing
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
        const missingProperties = [];

        if (
          noteObj.frontmatter?.id === undefined ||
          noteObj.frontmatter?.id === null ||
          String(noteObj.frontmatter.id).trim() === ""
        ) {
          missingProperties.push("id");
        }

        if (!paywalled) {
          missingProperties.push(
            `${config.paywallProperty || "paywall"}: true`,
          );
        }

        if (missingProperties.length > 0) {
          throw new Error(
            `[obsidian2vitepress] Invalid paywall note: "${relativePath}".\n` +
              `The note contains {{ ${paywallIndicator} }} but is missing or has invalid required properties: ` +
              `${missingProperties.join(", ")}.\n` +
              `Every note containing the paywall marker must define a non-empty "id" and ` +
              `"${config.paywallProperty || "paywall"}: true" in its frontmatter.`,
          );
        }

        // Rule 1: Split content via {{ PAYWALL }} indicator
        const { publicContent, paywalledContent } = extractSplitContent(
          content,
          config,
        );

        // 1. Store original content for serverDir
        noteObj.paywalledContent = paywalledContent;
        pendingPaywallSaves.push(noteObj);

        let modifiedPublicContent = publicContent;

        // 2. Append the paywall info component FIRST (so it sits before the mystical teaser)
        const componentName = config.paywallInfoComponent;
        if (
          componentName &&
          typeof componentName === "string" &&
          componentName.trim().length > 0
        ) {
          modifiedPublicContent = `${modifiedPublicContent}\n\n<${componentName.trim()} />`;
        }

        // 3. Append the mystical-paywall wrapper AFTER the component
        if (config.mysticalPaywall) {
          const mysticalPaywalled = randomizeWordsInText(
            stripEmbeddedAssets(paywalledContent),
          );
          modifiedPublicContent = `${modifiedPublicContent}\n\n<div class="mystical-paywall">\n\n${mysticalPaywalled}\n\n</div>`;
        }

        if (modifiedPublicContent.startsWith("---")) {
          modifiedPublicContent = modifiedPublicContent.replace(
            "---",
            "---\nisFullyPaywalled: false",
          );
        } else {
          modifiedPublicContent =
            `---\nisFullyPaywalled: false\n---\n` + modifiedPublicContent;
        }

        notes.push({
          ...noteObj,
          content: modifiedPublicContent,
          paywalled: false,
          paywalledContent: null,
        });
      } else if (paywalled) {
        // Rule 2: Paywalled via property
        const firstClosingFrontmatter = content.indexOf("---", 3);
        let bodyContent = content;
        let frontmatterOnlyStub = content;

        if (content.startsWith("---") && firstClosingFrontmatter !== -1) {
          frontmatterOnlyStub = content.substring(
            0,
            firstClosingFrontmatter + 3,
          );
          bodyContent = content
            .substring(firstClosingFrontmatter + 3)
            .trimStart();
        }

        // Store original body content for serverDir
        noteObj.paywalledContent = bodyContent;
        pendingPaywallSaves.push(noteObj);

        if (frontmatterOnlyStub.startsWith("---")) {
          frontmatterOnlyStub = frontmatterOnlyStub.replace(
            "---",
            "---\nisFullyPaywalled: true",
          );
        } else {
          frontmatterOnlyStub =
            `---\nisFullyPaywalled: true\n---\n` + frontmatterOnlyStub;
        }

        notes.push({
          ...noteObj,
          content: frontmatterOnlyStub,
          paywalled: true,
          paywalledContent: null,
        });
      } else {
        notes.push({
          ...noteObj,
          content,
          paywalled: false,
          paywalledContent: null,
        });
      }
    }
  }

  // 1. Create index first so routes are computed
  const index = createNoteIndex(notes, config);

  // 2. Collect backlinks for full context
  const backlinks = collectBacklinks(notes, index, config);

  for (const note of pendingPaywallSaves) {
    note.outputRoute = outputRouteForNote(note, config);
    note.route = routeForNote(note, config);
  }

  return {
    notes,
    index,
    backlinks,
    paywallNotes: pendingPaywallSaves,
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

    if (
      config.useHomeRewrite &&
      String(note.frontmatter?.layout).trim().toLowerCase() === "home"
    ) {
      addTarget(byTarget, "index", note);
    }

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

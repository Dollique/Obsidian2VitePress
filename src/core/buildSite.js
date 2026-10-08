import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveConfig } from "./defaults.js";
import { scanVaults } from "./scanVault.js";
import { cleanDir, walk, slash, isIncluded } from "../utils.js";
import { collectBacklinks, convertMarkdown } from "./convertMarkdown.js";

export async function buildSite(userConfig) {
  const config = resolveConfig(userConfig);
  const outDir = config.outDir;

  if (config.cleanOutDir) {
    await cleanDir(outDir);
  } else {
    await fs.mkdir(path.resolve(outDir), { recursive: true });
  }

  const { notes, index } = await scanVaults(config);
  const backlinks = collectBacklinks(notes, index, config);

  // Build the asset lookup BEFORE converting notes
  const assetMap = await buildAssetMap(config);

  const referencedAssets = new Set();
  const context = { index, config, backlinks, referencedAssets, assetMap };

  // 1. Process and write all markdown notes
  for (const note of notes) {
    const markdown = convertMarkdown(note, context);
    const outputPath = path.join(
      path.resolve(outDir),
      `${note.outputRoute.replace(/^\/+/, "")}.md`,
    );
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, markdown, "utf8");
  }

  // 2. Copy only the assets that were referenced
  if (config.embeds?.assets === "copy") {
    await copyVaultAssets(config, referencedAssets, assetMap);
  }

  return {
    outDir: path.resolve(outDir),
    notes: notes.map((note) => ({
      source: note.absolutePath,
      route: note.route,
    })),
  };
}

async function buildAssetMap(config) {
  const assetExtensions = /\.(png|jpe?g|gif|webp|svg|pdf|mp3|mp4|wav|mov)$/i;
  const resolvedOutDir = path.resolve(config.outDir);
  const assetMap = new Map();

  for (const vault of config.vaults) {
    const root = path.resolve(vault.root);
    const files = await walk(root, { root, outDir: resolvedOutDir });

    for (const file of files) {
      if (!assetExtensions.test(file)) continue;

      const relativePath = slash(path.relative(root, file));
      if (!isIncluded(relativePath, vault)) continue;

      const filename = path.basename(file).toLowerCase();
      const existing = assetMap.get(filename);

      if (existing) {
        console.warn(
          `[Warning] Duplicate asset filename "${filename}": ` +
            `"${existing.relativePath}" vs "${relativePath}" — using the latter.`,
        );
      }

      assetMap.set(relativePath.toLowerCase(), {
        absolutePath: file,
        relativePath,
      });
      assetMap.set(filename, { absolutePath: file, relativePath });
    }
  }

  console.log(`[DEBUG buildAssetMap] Built map with ${assetMap.size} entries.`);
  return assetMap;
}

async function copyVaultAssets(config, referencedAssets, assetMap) {
  const assetOutDirName = config.assets?.outDir || "assets";
  const resolvedOutDir = path.resolve(config.outDir);
  const prefixToRemove = `${assetOutDirName.toLowerCase()}/`;

  for (const ref of referencedAssets) {
    let cleanRef = ref.replace(/^\/+/, "").toLowerCase();
    if (cleanRef.startsWith(prefixToRemove)) {
      cleanRef = cleanRef.slice(prefixToRemove.length);
    }

    const assetMatch = assetMap.get(cleanRef);
    if (!assetMatch) {
      console.warn(`[Warning] Referenced asset not found in vaults: "${ref}"`);
      continue;
    }

    const targetSubPath = config.assets?.preserveFilenames
      ? assetMatch.relativePath
      : path.basename(assetMatch.absolutePath);

    const destinationPath = path.join(
      resolvedOutDir,
      assetOutDirName,
      targetSubPath,
    );

    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.copyFile(assetMatch.absolutePath, destinationPath);
  }
}

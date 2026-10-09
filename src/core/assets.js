// assets.js
import { promises as fs } from "node:fs";
import path from "node:path";
import { walk, slash, isIncluded } from "../utils.js";

const ASSET_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|pdf|mp3|mp4|wav|mov)$/i;

/** Build the vault-wide asset lookup (unchanged logic, relocated). */
export async function buildAssetMap(config) {
  const assetMap = new Map();
  const resolvedOutDir = path.resolve(config.outDir);

  for (const vault of config.vaults) {
    const root = path.resolve(vault.root);
    const files = await walk(root, { root, outDir: resolvedOutDir });

    for (const file of files) {
      if (!ASSET_EXTENSIONS.test(file)) continue;

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

  return assetMap;
}

/**
 * Copy every referenced asset to `<destDir>/<assets.outDir>/`.
 * Used for BOTH the public build (destDir = outDir) and the
 * paywalled serverDir — one implementation, two destinations.
 */
export async function copyReferencedAssets(
  config,
  referencedAssets,
  assetMap,
  destDir,
) {
  const assetOutDirName = config.assets?.outDir || "assets";
  const resolvedDest = path.resolve(destDir);
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
      resolvedDest,
      assetOutDirName,
      targetSubPath,
    );

    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.copyFile(assetMatch.absolutePath, destinationPath);
  }
}

import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveConfig } from "./defaults.js";
import { scanVaults } from "./scanVault.js";
import { cleanDir } from "../utils.js";
import { collectBacklinks, convertMarkdown } from "./convertMarkdown.js";
import { buildAssetMap, copyReferencedAssets } from "./assets.js";

export async function buildSite(userConfig) {
  const config = resolveConfig(userConfig);
  const outDir = config.outDir;
  const serverDir = config.serverDir || "server/paywalledNotes";

  if (config.cleanOutDir) {
    await cleanDir(outDir);
  } else {
    await fs.mkdir(path.resolve(outDir), { recursive: true });
  }

  // Scan only — no writing from inside scanVaults anymore
  const { notes, index, paywallNotes } = await scanVaults(config);

  const assetMap = await buildAssetMap(config);

  // ---- Shared context factory: same conversion rules everywhere ----
  const makeContext = () => ({
    index,
    config,
    backlinks: collectBacklinks(notes, index, config),
    assetMap,
    referencedAssets: new Set(),
  });

  // 1. Public notes → outDir
  const publicContext = makeContext();
  for (const note of notes) {
    const markdown = convertMarkdown(note, publicContext);
    await writeRoute(outDir, note.outputRoute, markdown);
  }

  // 2. Paywalled originals → serverDir, through the SAME pipeline
  const serverContext = makeContext();
  for (const note of paywallNotes) {
    const markdown = convertMarkdown(
      { ...note, content: note.paywalledContent },
      serverContext,
    );
    await writeRoute(serverDir, note.outputRoute, markdown);
  }

  // 3. Copy referenced assets based on configuration strategy
  if (config.embeds?.assets === "copy") {
    const isPublicStrategy = config.assets?.destinationType === "public";

    // Determine where public assets should go
    const publicAssetDest = isPublicStrategy
      ? path.resolve(config.assets.publicDir || "../../public")
      : outDir;

    await copyReferencedAssets(
      config,
      publicContext.referencedAssets,
      assetMap,
      publicAssetDest,
    );

    // For server/paywall notes, they usually still need their own copy if served privately
    await copyReferencedAssets(
      config,
      serverContext.referencedAssets,
      assetMap,
      serverDir,
    );
  }

  return {
    outDir: path.resolve(outDir),
    notes: notes.map((note) => ({
      source: note.absolutePath,
      route: note.route,
    })),
  };
}

/** Write a converted note under `<baseDir>/<route>.md`. */
async function writeRoute(baseDir, route, markdown) {
  const outputPath = path.join(
    path.resolve(baseDir),
    `${route.replace(/^\/+/, "")}.md`,
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, markdown, "utf8");
}

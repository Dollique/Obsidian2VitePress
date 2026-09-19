import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveConfig } from "./defaults.js";
import { scanVaults } from "./scanVault.js";
import { cleanDir } from "../utils.js";
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

  for (const note of notes) {
    const markdown = convertMarkdown(note, { index, config, backlinks });
    const outputPath = path.join(
      path.resolve(outDir),
      `${note.outputRoute.replace(/^\/+/, "")}.md`,
    );
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, markdown, "utf8");
  }

  return {
    outDir: path.resolve(outDir),
    notes: notes.map((note) => ({
      source: note.absolutePath,
      route: note.route,
    })),
  };
}

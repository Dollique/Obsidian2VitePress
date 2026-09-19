import { promises as fs } from "node:fs";
import path from "node:path";

// Helper: Clean and recreate a directory (DRY helper for outDir / serverDir)
export const cleanDir = async (dirPath) => {
  if (!dirPath) return;
  const resolvedPath = path.resolve(dirPath);
  await fs.rm(resolvedPath, { recursive: true, force: true });
  await fs.mkdir(resolvedPath, { recursive: true });
};

// Helper: Normalize path separators
export const slash = (value) => value.replace(/\\/g, "/");

// Helper: Check if a relative path is included in the vault
export const isIncluded = (relativePath, vault) => {
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
export const normalizeGeneratedRelativeRoot = (outputRouteBase) => {
  return String(outputRouteBase ?? "").replace(/^\/+|\/+$/g, "");
};

// Helper: Check if a path is inside the generated output directory
export const isGeneratedOutputPath = (candidate, options) => {
  if (!options.generatedRelativeRoot) return false;
  const relative = slash(path.relative(options.root, candidate));
  return (
    relative === options.generatedRelativeRoot ||
    relative.startsWith(`${options.generatedRelativeRoot}/`)
  );
};

// Helper: Recursively walk a directory
export const walk = async (dir, options) => {
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

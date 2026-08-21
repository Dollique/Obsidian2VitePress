// src/core/frontmatter.js
export function parseFrontmatter(content) {
  // Look for frontmatter at the beginning of the file
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return {};
  }

  const frontmatterString = match[1];
  const frontmatter = {};

  // Simple parsing of key: value pairs
  frontmatterString.split("\n").forEach((line) => {
    const [key, ...rest] = line.split(":");
    if (key && rest.length > 0) {
      const value = rest.join(":").trim();
      // Handle boolean values
      if (value === "true") {
        frontmatter[key.trim()] = true;
      } else if (value === "false") {
        frontmatter[key.trim()] = false;
      } else {
        frontmatter[key.trim()] = value.replace(/^['"]|['"]$/g, ""); // Remove quotes
      }
    }
  });

  return frontmatter;
}

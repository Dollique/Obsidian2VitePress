export function parseFrontmatter(content) {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
  const match = content.match(frontmatterRegex);
  if (!match) return {};

  const frontmatter = {};
  const frontmatterString = match[1];

  frontmatterString.split("\n").forEach((line) => {
    const [key, ...rest] = line.split(":");
    if (!key || rest.length === 0) return;

    let value = rest.join(":").trim();
    value = value.replace(/^['"]|['"]$/g, ""); // Remove surrounding quotes

    // Handle boolean values
    if (value === "true") value = true;
    else if (value === "false") value = false;

    frontmatter[key.trim()] = value;
  });

  return frontmatter;
}

export function injectTitleToMarkdown(content, defaultTitle) {
  // Check if the file starts with frontmatter
  if (content.startsWith("---")) {
    // Check if a title property already exists
    if (/^---\r?\n.*?\btitle\s*:/s.test(content)) {
      return content;
    }

    // Find the end of the first line (the opening '---')
    const firstNewline = content.indexOf("\n");
    if (firstNewline !== -1) {
      const insertIndex = firstNewline + 1;
      // Insert the title right after the opening '---'
      return (
        content.slice(0, insertIndex) +
        `title: "${defaultTitle}"\n` +
        content.slice(insertIndex)
      );
    }
  }

  // If the note has no frontmatter, create one at the top
  return `---\ntitle: "${defaultTitle}"\n---\n\n${content}`;
}

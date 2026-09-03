import path from "node:path";
import { findWikilinks, resolveWikiLink } from "./links.js";

export function convertMarkdown(note, context) {
  const { index, config, backlinks } = context;
  let markdown = note.content;

  markdown = convertCallouts(markdown, config);
  markdown = convertWikilinks(markdown, note, index, config);

  if (config.backlinks?.enabled) {
    markdown = appendBacklinks(markdown, note, backlinks, config);
  }

  return markdown;
}

export function collectBacklinks(notes, index, config) {
  const backlinks = new Map();

  for (const sourceNote of notes) {
    for (const link of findWikilinks(sourceNote.content)) {
      if (link.isEmbed) continue;

      const resolved = resolveWikiLink(link, sourceNote, index, {
        ...config,
        brokenLinks:
          config.brokenLinks === "fail" ? "route" : config.brokenLinks,
      });

      if (!resolved.exists) continue;

      const existing = backlinks.get(resolved.note.route) ?? [];
      existing.push({
        source: sourceNote,
        label: sourceNote.basename,
      });
      backlinks.set(resolved.note.route, existing);
    }
  }

  return backlinks;
}

function convertWikilinks(markdown, note, index, config) {
  return markdown.replace(
    /(!)?\[\[([^\]\n]+)\]\]/g,
    (raw, embedMarker, rawTarget) => {
      const link = {
        raw,
        isEmbed: Boolean(embedMarker),
        ...parseInlineTarget(rawTarget),
      };
      const resolved = resolveWikiLink(link, note, index, config);

      if (resolved.preserve) return raw;

      if (link.isEmbed) {
        return convertEmbed(link, resolved, note);
      }

      return `[${escapeMarkdownLinkText(resolved.label)}](${resolved.route})`;
    },
  );
}

function convertEmbed(link, resolved, sourceNote) {
  if (isAssetTarget(link.target)) {
    const label = path.basename(link.target);
    return `![${escapeMarkdownLinkText(link.alias || label)}](${resolved.route})`;
  }

  if (!resolved.exists) {
    return `[${escapeMarkdownLinkText(resolved.label)}](${resolved.route})`;
  }

  return `<div class="obsidian-note-embed" data-source="${escapeHtml(sourceNote.relativePath)}"><a href="${resolved.route}">${escapeHtml(resolved.label)}</a></div>`;
}

/** CALLOUTS **/

function convertCallouts(markdown, config) {
  const document = parseCalloutDocument(markdown);
  return renderCalloutDocument(document, config);
}

/**
 * Parse Obsidian callouts into a nested document tree.
 *
 * A callout node contains an ordered `content` array which can contain
 * both normal Markdown lines and nested callout nodes. This preserves
 * the original position of nested callouts.
 */
function parseCalloutDocument(markdown) {
  const lines = markdown.split("\n");
  const document = [];
  const stack = [];

  let skippedSecretDepth = null;

  for (const line of lines) {
    const blockquoteDepth = getBlockquoteDepth(line);
    const callout = parseCalloutLine(line);

    /*
     * Secret callouts and everything nested inside them are skipped.
     *
     * We stop skipping once the blockquote depth becomes shallower
     * than the secret callout.
     */
    if (skippedSecretDepth !== null) {
      if (blockquoteDepth >= skippedSecretDepth) {
        continue;
      }

      skippedSecretDepth = null;
    }

    /*
     * A callout starts a new node.
     */
    if (callout) {
      closeCalloutsForNewCallout(stack, callout.depth);

      /*
       * Secret callouts are never added to the document tree.
       */
      if (callout.type.toLowerCase() === "secret") {
        skippedSecretDepth = callout.depth;
        continue;
      }

      const node = createCalloutNode(callout);

      appendNode(stack, document, node);
      stack.push(node);

      continue;
    }

    /*
     * Remove callouts whose blockquote depth is deeper than
     * the current line.
     *
     * Important: use `>` here, not `>=`.
     *
     * A line at the same depth still belongs to the current callout.
     */
    closeCalloutsForContent(stack, blockquoteDepth);

    /*
     * No active callout means this is normal document content.
     */
    if (stack.length === 0) {
      document.push(line);
      continue;
    }

    /*
     * The current line belongs to the active callout.
     *
     * Remove the blockquote prefixes belonging to the current
     * callout hierarchy while preserving any deeper blockquote
     * that is actual Markdown content.
     */
    const current = stack.at(-1);

    current.content.push(stripBlockquotes(line, current.depth));
  }

  return document;
}

/**
 * Parse an Obsidian callout declaration.
 *
 * Examples:
 *
 * > [!story] Story
 * > > [!musicbox] Music
 * > > > [!warning]- Warning
 */
function parseCalloutLine(line) {
  const match = line.match(
    /^(?<prefix>(?:>\s*)+)\[!(?<type>[\w-]+)\](?<marker>[+-])?\s*(?<title>.*)$/,
  );

  if (!match) {
    return null;
  }

  return {
    depth: getBlockquoteDepth(match.groups.prefix),
    type: match.groups.type,
    marker: match.groups.marker ?? "",
    title: match.groups.title.trim(),
  };
}

function createCalloutNode(callout) {
  return {
    kind: "callout",
    depth: callout.depth,
    type: callout.type,
    marker: callout.marker,
    title: callout.title,
    content: [],
  };
}

/**
 * Add a node to either the current callout or the document.
 */
function appendNode(stack, document, node) {
  if (stack.length === 0) {
    document.push(node);
    return;
  }

  stack.at(-1).content.push(node);
}

/**
 * When a new callout starts, anything at the same or deeper
 * nesting level is no longer its parent.
 *
 * Example:
 *
 * depth 1: Story
 * depth 2: Note
 * depth 2: Warning
 *
 * When Warning starts, Note is popped.
 */
function closeCalloutsForNewCallout(stack, depth) {
  while (stack.length > 0 && stack.at(-1).depth >= depth) {
    stack.pop();
  }
}

/**
 * When processing normal content, only pop callouts that are
 * deeper than the current line.
 *
 * Example:
 *
 * depth 1: Story
 * depth 2: Note
 * depth 1: Back to story
 *
 * Note is popped, but Story remains open.
 */
function closeCalloutsForContent(stack, depth) {
  while (stack.length > 0 && stack.at(-1).depth > depth) {
    stack.pop();
  }
}

function getBlockquoteDepth(value) {
  return (value.match(/>/g) ?? []).length;
}

/**
 * Remove `count` blockquote prefixes.
 *
 * For example:
 *
 * stripBlockquotes("> > Hello", 2)
 * -> "Hello"
 *
 * stripBlockquotes("> > > Hello", 2)
 * -> "> Hello"
 */
function stripBlockquotes(line, count) {
  let result = line;

  for (let i = 0; i < count; i++) {
    result = result.replace(/^>\s?/, "");
  }

  return result;
}

/**
 * Render all document nodes.
 */
function renderCalloutDocument(document, config) {
  return document
    .map((node) => {
      if (typeof node === "string") {
        return node;
      }

      return renderCallout(node, config);
    })
    .join("\n");
}

/**
 * Render a single callout.
 */
function renderCallout(node, config) {
  const fenceLength = getFenceLength(node);
  const fence = createFence(fenceLength);

  const content = renderCalloutContent(node, config);

  const callout = [
    `${fence} ${createCalloutType(node, config)}`,
    content,
    fence,
  ]
    .filter((line, index, array) => {
      return index === 0 || index === array.length - 1 || line !== "";
    })
    .join("\n");

  if (!config?.callouts?.wrap) {
    return callout;
  }

  return wrapCallout(callout, node);
}

/**
 * Render the contents of a callout while preserving the original
 * ordering of normal lines and nested callouts.
 */
function renderCalloutContent(node, config) {
  return node.content
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      return renderCallout(item, config);
    })
    .join("\n")
    .trim();
}

/**
 * Determine the VitePress callout type and label.
 */
function createCalloutType(node, config) {
  const foldable = node.marker === "-" || node.marker === "+";

  const vpType = foldable ? "details" : calloutType(node.type, config);

  const label = createCalloutLabel(node.type, node.title, foldable, config);

  return `${vpType}${label}`;
}

/**
 * Calculate the required VitePress fence length.
 *
 * The deepest callout uses :::
 * Its parent uses ::::
 * Its parent uses :::::
 * etc.
 */
function getFenceLength(node) {
  if (node.content.every((item) => typeof item === "string")) {
    return 3;
  }

  const childFenceLengths = node.content
    .filter((item) => typeof item !== "string")
    .map(getFenceLength);

  if (childFenceLengths.length === 0) {
    return 3;
  }

  return Math.max(...childFenceLengths) + 1;
}

function createFence(length) {
  return ":".repeat(length);
}

function createCalloutLabel(type, title, foldable, config) {
  const { typeAsLabelFallback, prettifyLabels = true } = config?.callouts ?? {};

  if (title) {
    return ` ${title}`;
  }

  if (foldable || typeAsLabelFallback) {
    return ` ${labelFromType(type, prettifyLabels)}`;
  }

  if (isKnownCalloutType(type, config)) {
    return "";
  }

  return ` ${labelFromType(type, prettifyLabels)}`;
}

function wrapCallout(content, node) {
  const classes = ["callout", `callout-${node.type}`];

  if (node.marker === "+") {
    classes.push("open");
  }

  return [`<div class="${classes.join(" ")}">`, "", content, "", "</div>"].join(
    "\n",
  );
}

function calloutTypeMapping() {
  return {
    note: "info",
    info: "info",
    todo: "info",
    tip: "tip",
    success: "tip",
    question: "details",
    warning: "warning",
    failure: "danger",
    danger: "danger",
    bug: "danger",
    example: "details",
    quote: "details",
  };
}

function labelFromType(type, prettify) {
  return prettify ? prettifyType(type) : type;
}

function calloutType(type, config) {
  const fallbackCalloutType = config?.callouts?.fallbackType ?? "info";

  return calloutTypeMapping()[type.toLowerCase()] ?? fallbackCalloutType;
}

function isKnownCalloutType(type, config) {
  const mapping = calloutTypeMapping();

  return Object.prototype.hasOwnProperty.call(mapping, type.toLowerCase());
}

function prettifyType(type) {
  // 'musicbox' -> 'Musicbox', 'my-cool-type' -> 'My Cool Type'
  return type
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/** BACKLINKS **/

function appendBacklinks(markdown, note, backlinks, config) {
  const links = backlinks.get(note.route) ?? [];
  if (links.length === 0) return markdown;

  const uniqueLinks = [
    ...new Map(links.map((link) => [link.source.route, link])).values(),
  ].sort((a, b) => a.label.localeCompare(b.label));

  const heading = config.backlinks?.heading ?? "Backlinks";
  const section = [
    "",
    `## ${heading}`,
    "",
    ...uniqueLinks.map(
      (link) =>
        `- [${escapeMarkdownLinkText(link.label)}](${link.source.route})`,
    ),
  ].join("\n");

  return `${markdown.trimEnd()}\n${section}\n`;
}

function parseInlineTarget(rawTarget) {
  const [targetAndAnchor, alias] = rawTarget.split("|");
  const [target, anchor] = targetAndAnchor.split("#");

  return {
    target: target.trim(),
    anchor: anchor?.trim() || "",
    alias: alias?.trim() || "",
  };
}

function isAssetTarget(target) {
  return /\.(png|jpe?g|gif|webp|svg|pdf|mp3|mp4|wav|mov)$/i.test(target);
}

function escapeMarkdownLinkText(value) {
  return String(value).replace(/[[\]]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

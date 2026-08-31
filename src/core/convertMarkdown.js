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

function convertCallouts(markdown, config) {
  const calloutConfig = config?.callouts ?? {};
  const wrap = !!calloutConfig.wrap;
  const lines = markdown.split("\n");
  const output = [];
  let inCallout = false;

  const openWrapper = (rawType, marker) => {
    if (!wrap) return;
    const classes = ["callout", `callout-${rawType}`];
    if (marker === "+") classes.push("open"); // + -> expanded-but-collapsible
    output.push(`<div class="${classes.join(" ")}">`);
    output.push(""); // blank line after opening wrapper
  };

  const closeWrapper = () => {
    if (!wrap) return;
    output.push(""); // blank line before closing wrapper
    output.push("</div>");
  };

  for (const line of lines) {
    // Capture: 1=type, 2=collapsible marker (+ or -), 3=title
    const callout = line.match(/^>\s*\[!([\w-]+)\]([+-])?\s*(.*)$/);

    if (callout) {
      if (inCallout) {
        output.push(":::");
        closeWrapper();
      }

      const rawType = callout[1];
      const marker = callout[2]; // "+" | "-" | undefined
      const title = callout[3].trim();

      // A marker (+ or -) always forces a foldable 'details' container,
      // regardless of the type. No marker -> use the normal type mapping.
      const foldable = marker === "-" || marker === "+";
      const vpType = foldable ? "details" : calloutType(rawType, config);
      const label = title ? ` ${title}` : "";

      openWrapper(rawType, marker);
      output.push(`::: ${vpType}${label}`);

      inCallout = true;
      continue;
    }

    if (inCallout && line.startsWith(">")) {
      output.push(line.replace(/^>\s?/, ""));
      continue;
    }

    if (inCallout) {
      output.push(":::");
      closeWrapper();
      inCallout = false;
    }

    output.push(line);
  }

  if (inCallout) {
    output.push(":::");
    closeWrapper();
  }

  return output.join("\n");
}

function calloutType(type) {
  const mapping = {
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

  const fallbackCalloutType = config?.callouts?.fallbackType ?? "info";

  return mapping[type.toLowerCase()] ?? fallbackCalloutType;
}

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

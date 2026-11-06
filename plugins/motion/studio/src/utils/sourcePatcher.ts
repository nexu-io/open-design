import {
  scanHtmlOpeningTags,
  decodeAuthoredAttribute,
  HTML_ATTRIBUTE_ENTITIES,
} from "@hyperframes/parsers";

/**
 * Source Patcher — Maps visual property edits back to source HTML files.
 * Handles inline style updates, attribute changes, and text content.
 */

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tagAttribute(tag: string, name: string) {
  return scanHtmlOpeningTags(tag)[0]?.attributes.find((attr) => attr.name === name.toLowerCase());
}

type AttributeEdit = { kind: "remove" } | { kind: "boolean" } | { kind: "value"; value: string };

function patchTagAttribute(tag: string, name: string, edit: AttributeEdit): string {
  if (edit.kind === "remove") {
    const attributes =
      scanHtmlOpeningTags(tag)[0]?.attributes.filter((attr) => attr.name === name.toLowerCase()) ??
      [];
    const parts: string[] = [];
    let cursor = 0;
    for (const attribute of attributes) {
      let start = attribute.start;
      while (start > cursor && /[\t\n\f\r ]/.test(tag[start - 1]!)) start--;
      parts.push(tag.slice(cursor, start));
      cursor = attribute.end;
    }
    parts.push(tag.slice(cursor));
    return parts.join("");
  }
  const attr = tagAttribute(tag, name);
  const replacement =
    edit.kind === "boolean" ? name : `${name}="${escapeHtmlAttribute(edit.value)}"`;
  if (attr) return tag.slice(0, attr.start) + replacement + tag.slice(attr.end);
  return tag.endsWith("/")
    ? `${tag.slice(0, -1).trimEnd()} ${replacement} /`
    : `${tag} ${replacement}`;
}

function escapeStyleAttributeValue(value: string, quote: string): string {
  return quote === '"' ? value.replace(/"/g, "&quot;") : value.replace(/'/g, "&#39;");
}

/** Escape a string for safe use inside a double-quoted HTML attribute. */
export function escapeHtmlAttribute(value: string): string {
  return value.replace(/[&"<>]/g, (char) => HTML_ATTRIBUTE_ENTITIES[char]![0]!);
}

function splitInlineStyleDeclarations(style: string): string[] {
  const declarations: string[] = [];
  let current = "";
  let quote: string | null = null;
  let entity = false;
  let parenDepth = 0;

  for (const char of style) {
    if (entity) {
      current += char;
      if (char === ";") entity = false;
      continue;
    }

    if (char === "&") {
      entity = true;
      current += char;
      continue;
    }

    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (char === "(") {
      parenDepth += 1;
      current += char;
      continue;
    }

    if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      current += char;
      continue;
    }

    if (char === ";" && parenDepth === 0) {
      declarations.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  if (current) declarations.push(current);
  return declarations;
}

export interface PatchOperation {
  // `rich-text` is the only member that carries markup. It is deliberately
  // separate from `text-content`, whose contract is "this value is text": the
  // design panel and every other caller rely on that, and widening it would
  // have turned all of them into markup sinks at once.
  type: "inline-style" | "attribute" | "text-content" | "html-attribute" | "rich-text";
  property: string;
  value: string | null;
  childSelector?: string;
  childIndex?: number;
}

export interface PatchTarget {
  id?: string | null;
  hfId?: string;
  selector?: string;
  selectorIndex?: number;
}

/**
 * Find which source file contains an element by its ID.
 */
export function resolveSourceFile(
  elementId: string | null,
  selector: string,
  files: Record<string, string>,
): string | null {
  if (!elementId && !selector) return null;

  // Strategy 1: Search by id attribute
  if (elementId) {
    for (const [path, content] of Object.entries(files)) {
      if (findTagByAttribute(content, "id", elementId)) {
        return path;
      }
    }
  }

  // Strategy 2: Search by data-composition-id from the selector
  const compIdMatch = selector.match(/data-composition-id="([^"]+)"/);
  if (compIdMatch) {
    const compId = compIdMatch[1];
    for (const [path, content] of Object.entries(files)) {
      if (findTagByAttribute(content, "data-composition-id", compId!)) {
        return path;
      }
    }
  }

  // Strategy 3: Search by class from the selector
  const classMatch = selector.match(/^\.([a-zA-Z0-9_-]+)/);
  if (classMatch) {
    const cls = classMatch[1];
    for (const [path, content] of Object.entries(files)) {
      if (findTagByClass(content, { selector: `.${cls}` })) {
        return path;
      }
    }
  }

  // Fallback: index.html
  if ("index.html" in files) return "index.html";
  return null;
}

/**
 * Apply a style property change to an element's inline style in the HTML source.
 */
function patchInlineStyle(
  html: string,
  elementId: string,
  prop: string,
  value: string | null,
): string {
  return patchInlineStyleByTarget(html, { id: elementId }, prop, value);
}

function patchInlineStyleInTag(tag: string, prop: string, value: string | null): string {
  if (!tag) return tag;

  // Check if there's an existing style attribute
  const styleMatch = tagAttribute(tag, "style");
  if (styleMatch?.kind === "value") {
    const existingStyle = styleMatch.value;
    const quote = styleMatch.quote || '"';
    // Parse existing properties
    const props = new Map<string, string>();
    for (const part of splitInlineStyleDeclarations(existingStyle)) {
      const colon = part.indexOf(":");
      if (colon < 0) continue;
      const key = part.slice(0, colon).trim();
      const val = part.slice(colon + 1).trim();
      if (key) props.set(key, val);
    }
    // Update/add or remove the property
    if (value === null) {
      props.delete(prop);
    } else {
      props.set(prop, value);
    }
    // Rebuild style string; keep style="" if empty (harmless)
    const newStyle = Array.from(props.entries())
      .map(([k, v]) => `${k}: ${escapeStyleAttributeValue(v, quote)}`)
      .join("; ");
    const newTag =
      tag.slice(0, styleMatch.start) +
      `style=${quote}${newStyle}${quote}` +
      tag.slice(styleMatch.end);
    return newTag;
  } else {
    // No existing style attribute
    if (value === null) return tag; // nothing to remove
    const selfClosing = tag.endsWith("/");
    const base = selfClosing ? tag.slice(0, -1).trimEnd() : tag;
    const newTag = `${base} style="${prop}: ${escapeStyleAttributeValue(value, '"')}"${selfClosing ? " /" : ""}`;
    return newTag;
  }
}

function patchInlineStyleByTarget(
  html: string,
  target: PatchTarget,
  prop: string,
  value: string | null,
): string {
  const match = findTagByTarget(html, target);
  if (!match) return html;
  const newTag = patchInlineStyleInTag(match.tag, prop, value);
  return replaceTagAtMatch(html, match, newTag);
}

interface TagMatch {
  tag: string;
  start: number;
  end: number;
}

function replaceTagAtMatch(html: string, match: TagMatch, newTag: string): string {
  return `${html.slice(0, match.start)}${newTag}${html.slice(match.end)}`;
}

function findTagByAttribute(html: string, name: string, value: string): TagMatch | null {
  const found = scanHtmlOpeningTags(html).find((tag) => {
    const attr = tag.attributes.find((attr) => attr.name === name);
    return tag.closed && attr?.kind === "value" && decodeAuthoredAttribute(attr.value) === value;
  });
  return found
    ? { tag: html.slice(found.start, found.bodyEnd), start: found.start, end: found.bodyEnd }
    : null;
}

function findTagByClass(html: string, target: PatchTarget): TagMatch | null {
  const classMatch = target.selector?.match(/^\.([a-zA-Z0-9_-]+)$/);
  if (!classMatch) return null;
  const found = scanHtmlOpeningTags(html).filter((tag) => {
    const attr = tag.attributes.find((attr) => attr.name === "class");
    return (
      tag.closed &&
      attr?.kind === "value" &&
      decodeAuthoredAttribute(attr.value).split(/\s+/).includes(classMatch[1]!)
    );
  })[target.selectorIndex ?? 0];
  return found
    ? { tag: html.slice(found.start, found.bodyEnd), start: found.start, end: found.bodyEnd }
    : null;
}

export function findTagByTarget(html: string, target: PatchTarget): TagMatch | null {
  if (target.hfId) {
    const result = findTagByAttribute(html, "data-hf-id", target.hfId);
    if (result) return result;
  }

  if (target.id) {
    const result = findTagByAttribute(html, "id", target.id);
    if (result) return result;
  }

  if (!target.selector) return null;

  const compositionIdMatch = target.selector.match(/^\[data-composition-id="([^"]+)"\]$/);
  if (compositionIdMatch) {
    const result = findTagByAttribute(html, "data-composition-id", compositionIdMatch[1]);
    if (result) return result;
  }

  return findTagByClass(html, target);
}

export function readAttributeByTarget(
  html: string,
  target: PatchTarget,
  attr: string,
): string | undefined {
  const match = findTagByTarget(html, target);
  if (!match) return undefined;

  return readTagAttribute(match.tag, attr.startsWith("data-") ? attr : `data-${attr}`);
}

export function readTagAttribute(tag: string, attr: string): string | undefined {
  const value = tagAttribute(tag, attr);
  return value?.kind === "value" ? decodeAuthoredAttribute(value.value) : undefined;
}

export function readTagSnippetByTarget(html: string, target: PatchTarget): string | undefined {
  const match = findTagByTarget(html, target);
  return match?.tag;
}

function patchAttributeByTarget(
  html: string,
  target: PatchTarget,
  attr: string,
  value: string | null,
): string {
  const match = findTagByTarget(html, target);
  if (!match) return html;
  const name = attr.startsWith("data-") ? attr : `data-${attr}`;
  const edit: AttributeEdit = value === null ? { kind: "remove" } : { kind: "value", value };
  return replaceTagAtMatch(html, match, patchTagAttribute(match.tag, name, edit));
}

function patchAttribute(
  html: string,
  elementId: string,
  attr: string,
  value: string | null,
): string {
  return patchAttributeByTarget(html, { id: elementId }, attr, value);
}

/**
 * Apply a text content change to an element.
 */
function patchTextContent(html: string, elementId: string, value: string): string {
  return patchTextContentByTarget(html, { id: elementId }, value);
}

function findMatchingClosingTagIndex(html: string, tagName: string, contentStart: number): number {
  const tagPattern = new RegExp(`</?${escapeRegex(tagName)}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = contentStart;
  let depth = 1;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(html)) !== null) {
    const tag = match[0];
    if (tag.startsWith("</")) {
      depth -= 1;
      if (depth === 0) return match.index;
      continue;
    }
    if (!tag.endsWith("/>")) depth += 1;
  }

  return -1;
}

export const HTML_BOOLEAN_ATTRIBUTES = new Set([
  "loop",
  "muted",
  "autoplay",
  "playsinline",
  "controls",
  "default",
  "defer",
  "disabled",
  "hidden",
  "nomodule",
  "open",
  "readonly",
  "required",
  "reversed",
  "selected",
]);

function patchHtmlAttributeInTag(tag: string, attr: string, value: string | null): string {
  if (!tag) return tag;
  let edit: AttributeEdit;
  if (HTML_BOOLEAN_ATTRIBUTES.has(attr)) {
    if (value === null || value === "" || value === "false") edit = { kind: "remove" };
    else {
      if (tagAttribute(tag, attr)) return tag;
      edit = { kind: "boolean" };
    }
  } else edit = value === null ? { kind: "remove" } : { kind: "value", value };
  const newTag = patchTagAttribute(tag, attr, edit);
  return newTag;
}

function patchHtmlAttribute(
  html: string,
  elementId: string,
  attr: string,
  value: string | null,
): string {
  return patchHtmlAttributeByTarget(html, { id: elementId }, attr, value);
}

function patchHtmlAttributeByTarget(
  html: string,
  target: PatchTarget,
  attr: string,
  value: string | null,
): string {
  const match = findTagByTarget(html, target);
  if (!match) return html;
  const newTag = patchHtmlAttributeInTag(match.tag, attr, value);
  return replaceTagAtMatch(html, match, newTag);
}

function patchTextContentByTarget(html: string, target: PatchTarget, value: string): string {
  const match = findTagByTarget(html, target);
  if (!match) return html;

  const tagNameMatch = /^<([a-z0-9-]+)/i.exec(match.tag);
  const tagName = tagNameMatch?.[1];
  if (!tagName) return html;

  const closingIndex = findMatchingClosingTagIndex(html, tagName, match.end + 1);
  if (closingIndex < 0) return html;

  return `${html.slice(0, match.end + 1)}${value}${html.slice(closingIndex)}`;
}

/**
 * Apply a patch operation to an HTML source file.
 */
export function applyPatch(html: string, elementId: string, op: PatchOperation): string {
  switch (op.type) {
    case "inline-style":
      return patchInlineStyle(html, elementId, op.property, op.value);
    case "attribute":
      return patchAttribute(html, elementId, op.property, op.value);
    case "html-attribute":
      return patchHtmlAttribute(html, elementId, op.property, op.value);
    case "text-content":
      return op.value !== null ? patchTextContent(html, elementId, op.value) : html;
    default:
      return html;
  }
}

export function applyPatchByTarget(html: string, target: PatchTarget, op: PatchOperation): string {
  if (target.id) {
    const patchedById = applyPatch(html, target.id, op);
    if (patchedById !== html || !target.selector) {
      return patchedById;
    }
  }

  switch (op.type) {
    case "inline-style":
      return patchInlineStyleByTarget(html, target, op.property, op.value);
    case "attribute":
      return patchAttributeByTarget(html, target, op.property, op.value);
    case "html-attribute":
      return patchHtmlAttributeByTarget(html, target, op.property, op.value);
    case "text-content":
      return op.value !== null ? patchTextContentByTarget(html, target, op.value) : html;
    default:
      return html;
  }
}

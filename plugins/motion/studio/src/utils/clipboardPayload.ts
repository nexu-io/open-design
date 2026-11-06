import { COMPOSITION_ROOT_OPEN_TAG_RE } from "./compositionPatterns";

const CLIPBOARD_MARKER = "hyperframes-clipboard:v1";

/** One clip's copied markup plus the original placement needed to preserve
 *  relative offsets and tracks across a group paste. */
export interface TimelineClipboardClip {
  html: string;
  start: number;
  duration: number;
  track: number;
}

export type ClipboardPayload =
  | {
      kind: "timeline-clip";
      clips: TimelineClipboardClip[];
      sourceFile: string;
      projectId?: string;
      copiedInComposition?: string;
    }
  | {
      kind: "dom-element";
      html: string;
      sourceFile: string;
      projectId?: string;
      originSelector?: string;
      originSelectorIndex?: number;
    };

type SerializedPayload = { _marker: string } & ClipboardPayload;

export function serializeClipboardPayload(payload: ClipboardPayload): string {
  const data: SerializedPayload = { _marker: CLIPBOARD_MARKER, ...payload };
  return JSON.stringify(data);
}

// Each branch validates one wire shape at the trust boundary; splitting further
// would fragment one parse into partial validators with no independent reuse.
// fallow-ignore-next-line complexity
export function deserializeClipboardPayload(json: string): ClipboardPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (obj._marker !== CLIPBOARD_MARKER) return null;
  if (typeof obj.sourceFile !== "string") return null;
  if (obj.kind === "timeline-clip") {
    if (!Array.isArray(obj.clips)) return null;
    const clips = obj.clips.filter((c): c is TimelineClipboardClip => {
      const clip = c as Partial<TimelineClipboardClip> | null;
      return (
        !!clip &&
        typeof clip === "object" &&
        typeof clip.html === "string" &&
        typeof clip.start === "number" &&
        typeof clip.duration === "number" &&
        typeof clip.track === "number"
      );
    });
    if (clips.length === 0) return null;
    const projectId = typeof obj.projectId === "string" ? obj.projectId : undefined;
    const copiedInComposition =
      typeof obj.copiedInComposition === "string" ? obj.copiedInComposition : undefined;
    return {
      kind: "timeline-clip",
      clips,
      sourceFile: obj.sourceFile,
      projectId,
      copiedInComposition,
    };
  }
  if (obj.kind === "dom-element") {
    if (typeof obj.html !== "string") return null;
    return {
      kind: "dom-element",
      html: obj.html,
      sourceFile: obj.sourceFile,
      projectId: typeof obj.projectId === "string" ? obj.projectId : undefined,
      originSelector: typeof obj.originSelector === "string" ? obj.originSelector : undefined,
      originSelectorIndex:
        typeof obj.originSelectorIndex === "number" ? obj.originSelectorIndex : undefined,
    };
  }
  return null;
}

/**
 * Insert `newHtml` as a sibling immediately after the element matched by
 * `selector` (at `selectorIndex`) in `source`. Falls back to inserting after
 * the composition root if the selector doesn't match — so paste never silently
 * drops the content.
 */
// fallow-ignore-next-line complexity
export function insertAsSibling(
  source: string,
  newHtml: string,
  selector: string | undefined,
  selectorIndex: number | undefined,
): string {
  if (selector) {
    const idx = selectorIndex ?? 0;
    let matchCount = 0;

    // Find the element by searching for its opening tag pattern.
    // For id selectors like #foo, search for id="foo".
    // For class selectors like .name-text, search for class="...name-text...".
    // For attribute selectors like [data-composition-id="x"], search literally.

    let searchPattern: RegExp | null = null;
    if (selector.startsWith("#")) {
      const id = selector.slice(1);
      searchPattern = new RegExp(`<[a-z][^>]*\\bid="${id}"[^>]*>`, "gi");
    } else if (selector.startsWith(".")) {
      const cls = selector.slice(1);
      searchPattern = new RegExp(`<[a-z][^>]*\\bclass="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, "gi");
    } else if (selector.startsWith("[")) {
      const inner = selector.slice(1, -1);
      searchPattern = new RegExp(`<[a-z][^>]*\\b${inner}[^>]*>`, "gi");
    }

    if (searchPattern) {
      let match: RegExpExecArray | null;
      while ((match = searchPattern.exec(source)) !== null) {
        if (matchCount === idx) {
          const insertPos = findClosingTagPosition(source, match.index);
          if (insertPos > 0) {
            return source.slice(0, insertPos) + "\n" + newHtml + source.slice(insertPos);
          }
        }
        matchCount++;
      }
    }
  }

  // Fallback: insert after composition root opening tag (same as timeline clips)
  const rootMatch = COMPOSITION_ROOT_OPEN_TAG_RE.exec(source);
  if (rootMatch && rootMatch.index != null) {
    const insertAt = rootMatch.index + rootMatch[0].length;
    return source.slice(0, insertAt) + newHtml + source.slice(insertAt);
  }

  return source + newHtml;
}

// fallow-ignore-next-line complexity
function findClosingTagPosition(html: string, openTagStart: number): number {
  // Find the end of the opening tag
  const openTagEnd = html.indexOf(">", openTagStart);
  if (openTagEnd < 0) return -1;

  // Self-closing tag?
  if (html[openTagEnd - 1] === "/") return openTagEnd + 1;

  // Extract the tag name
  const tagNameMatch = html.slice(openTagStart).match(/^<([a-z][a-z0-9]*)/i);
  if (!tagNameMatch) return -1;
  const tagName = tagNameMatch[1]!;

  // Walk forward counting open/close tags of the same name
  let depth = 1;
  let pos = openTagEnd + 1;
  const openRe = new RegExp(`<${tagName}(?:\\s|>|/>)`, "gi");
  const closeRe = new RegExp(`</${tagName}\\s*>`, "gi");

  while (depth > 0 && pos < html.length) {
    openRe.lastIndex = pos;
    closeRe.lastIndex = pos;

    const nextOpen = openRe.exec(html);
    const nextClose = closeRe.exec(html);

    if (!nextClose) return -1;

    if (nextOpen && nextOpen.index < nextClose.index) {
      // Check if it's self-closing
      const selfCloseCheck = html.lastIndexOf("/", html.indexOf(">", nextOpen.index));
      if (selfCloseCheck > nextOpen.index) {
        pos = html.indexOf(">", nextOpen.index) + 1;
      } else {
        depth++;
        pos = html.indexOf(">", nextOpen.index) + 1;
      }
    } else {
      depth--;
      if (depth === 0) return nextClose.index + nextClose[0].length;
      pos = nextClose.index + nextClose[0].length;
    }
  }
  return -1;
}

/** An `id="..."` attribute, not `data-id="..."` or similar — only matches
 *  when preceded by whitespace, the way every generated attribute is. */
export const ID_ATTR_RE = /(?<=\s)id="([^"]+)"/;

export function deduplicateIds(html: string, existingIds: string[]): string {
  const existingSet = new Set(existingIds);
  return html.replace(new RegExp(ID_ATTR_RE.source, "g"), (full, id: string) => {
    if (!existingSet.has(id)) return full;
    let counter = 2;
    while (existingSet.has(`${id}-${counter}`)) counter++;
    const newId = `${id}-${counter}`;
    existingSet.add(newId);
    return `id="${newId}"`;
  });
}

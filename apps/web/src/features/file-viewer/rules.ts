// Pure rules for the file-viewer slice: string/geometry/number transforms with
// no React, transport, or DOM dependency. They test with zero doubles, and the
// boundary guard (ADR 0002) forbids any `fetch`/`window`/`document` reach here.
import type { DeployProviderId, DeploymentInfo, ProjectFileVersion } from '@open-design/contracts';
import type { TrackingFileVersionSource } from '@open-design/contracts/analytics';
import type { ManualEditStyles, ManualEditTarget } from '../../edit-mode/types';
import { MANUAL_EDIT_STYLE_PROPS } from '../../edit-mode/types';
import type { LiveArtifact, LiveArtifactRefreshLogEntry, PreviewComment, PreviewCommentMember } from '../../types';
import { sourceLooksLikeExportableDeck } from '../../runtime/exports';
import {
  overlayBoundsFromSnapshot,
  type PreviewCommentSnapshot,
} from '../../comments';
import {
  ANNOTATION_STYLE_KEYS,
  CLOUDFLARE_PAGES_PROVIDER_ID,
  COMMENT_SIDE_DOCK_GAP,
  COMMENT_SIDE_DOCK_MIN_CANVAS_WIDTH,
  COMMENT_SIDE_DOCK_NON_DESKTOP_PADDING,
  COMMENT_SIDE_DOCK_PADDING,
  COMMENT_SIDE_DOCK_RAIL_WIDTH,
  COMMENT_SIDE_DOCK_STACKED_COLLAPSED_HEIGHT_DEDUCTION,
  COMMENT_SIDE_DOCK_STACKED_HEIGHT_DEDUCTION,
  COMMENT_SIDE_DOCK_WIDTH,
  DEPLOY_PROVIDER_OPTIONS,
  EXPORT_READY_NUDGE_STORAGE_PREFIX,
  MARKDOWN_CODE_BLOCK_ATTR,
  MARKDOWN_CODE_LANGUAGE_ATTR,
  MAX_BRIDGE_COORDINATE,
  PREVIEW_VIEWPORT_PRESETS,
} from './constants';
import type {
  CommentPreviewCanvasOptions,
  CommentSideDropEdge,
  DeployProviderOption,
  InspectOverrideMap,
  InspectOverridePayload,
  InspectSpliceScan,
  LiveArtifactRefreshEvent,
  ManualEditPendingStyleSave,
  MarkdownCodeLanguage,
  PreviewCanvasSize,
  PreviewOverlayTransform,
  PreviewScaleOptions,
  PreviewViewportId,
  RefreshStatusDescriptor,
  StrokePoint,
  TranslateFn,
} from './types';
import { LiveArtifactRefreshFailure } from './types';

// Allow-list of CSS properties the host will persist on Save. Mirrors the
// in-iframe ALLOWED_PROPS list so the host doesn't accept properties that
// the bridge itself would reject.
const HOST_ALLOWED_INSPECT_PROPS = new Set([
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'font-family',
  'line-height',
  'text-align',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-radius',
]);

// Reject values that could break out of `prop: value` and into the
// surrounding <style> block — semicolons, braces, angle brackets, and
// newlines. Mirrors the bridge's UNSAFE_VALUE regex.
const HOST_UNSAFE_INSPECT_VALUE = /[;{}<>\n\r]/;

// Reject elementIds whose characters could break out of `[attr="..."]`
// inside a <style> block. Forbidden:
//   - `"` and `\` would close the attribute string or smuggle CSS
//     escapes the host didn't pre-process;
//   - `<` and `>` would close the surrounding <style> tag;
//   - C0/C1 controls (newline, etc.) end the CSS rule under string
//     tokenization — kept in as defense-in-depth against parser quirks.
// Everything else — including ASCII whitespace and leading digits — is
// allowed, so deck labels like `01 Cover` survive instead of being
// dropped on the way to the persisted overrides block.
const HOST_UNSAFE_INSPECT_ID = /["\\<>\u0000-\u001f\u007f]/;

// Build the inspect overrides CSS body the host will persist, from the
// structured `overrides` field of an od:inspect-overrides message. The host
// MUST NOT trust the sibling `css` string — it is attacker-controlled when
// artifact JS forges the message. The selector is re-derived from each
// elementId; only allow-listed properties with safe values survive.
//
// Exported so unit tests can exercise the validator with hostile payloads.
export function serializeInspectOverrides(overrides: unknown): string {
  if (!overrides || typeof overrides !== 'object') return '';
  const map = overrides as Record<string, unknown>;
  const lines: string[] = [];
  for (const elementId of Object.keys(map)) {
    if (!elementId || HOST_UNSAFE_INSPECT_ID.test(elementId)) continue;
    const entry = map[elementId] as InspectOverridePayload | null | undefined;
    if (!entry || typeof entry !== 'object') continue;
    const props = entry.props;
    if (!props || typeof props !== 'object') continue;
    // Trust only the *kind* of selector the bridge built, not the value
    // it carried. The bridge runs CSS.escape over the elementId, so a raw
    // equality check against `[data-screen-label="${elementId}"]` would
    // miss legitimate deck labels like `01 Cover` (whitespace, leading
    // digit) and silently downgrade them to `[data-od-id="..."]`. The
    // elementId itself was sanitized above, so embedding it verbatim into
    // the re-derived selector is safe inside an attribute value string.
    const inboundSelector = typeof entry.selector === 'string' ? entry.selector : '';
    const attr = inboundSelector.startsWith('[data-screen-label="')
      ? 'data-screen-label'
      : 'data-od-id';
    const safeSelector = `[${attr}="${elementId}"]`;
    const decls: string[] = [];
    for (const [rawName, rawValue] of Object.entries(props as Record<string, unknown>)) {
      if (typeof rawName !== 'string' || typeof rawValue !== 'string') continue;
      const name = rawName.toLowerCase();
      if (!HOST_ALLOWED_INSPECT_PROPS.has(name)) continue;
      const value = rawValue.trim();
      if (!value || HOST_UNSAFE_INSPECT_VALUE.test(value)) continue;
      decls.push(`${name}: ${value} !important`);
    }
    if (!decls.length) continue;
    lines.push(`${safeSelector} { ${decls.join('; ')} }`);
  }
  return lines.join('\n');
}

// Apply a single host-driven prop change to the authoritative override map.
// Returns a new map (or the same reference if no-op so React skips renders).
// Empty value clears the prop; clearing the last prop drops the elementId.
// Mirrors the iframe bridge's applyOverride sanitization so the host map and
// the live preview stay in lock-step under the same rules.
export function updateInspectOverride(
  map: InspectOverrideMap,
  elementId: string,
  selector: string,
  prop: string,
  value: string,
): InspectOverrideMap {
  if (!elementId || HOST_UNSAFE_INSPECT_ID.test(elementId)) return map;
  const propName = String(prop || '').toLowerCase();
  if (!HOST_ALLOWED_INSPECT_PROPS.has(propName)) return map;
  const trimmed = String(value ?? '').trim();
  if (trimmed && HOST_UNSAFE_INSPECT_VALUE.test(trimmed)) return map;
  const existing = map[elementId];
  const nextProps: Record<string, string> = { ...(existing?.props ?? {}) };
  if (!trimmed) {
    if (!(propName in nextProps)) return map;
    delete nextProps[propName];
  } else if (nextProps[propName] === trimmed && existing?.selector === selector) {
    return map;
  } else {
    nextProps[propName] = trimmed;
  }
  const nextMap: InspectOverrideMap = { ...map };
  if (Object.keys(nextProps).length === 0) {
    delete nextMap[elementId];
  } else {
    nextMap[elementId] = { selector: selector || existing?.selector || '', props: nextProps };
  }
  return nextMap;
}

// Parse any persisted <style data-od-inspect-overrides> blocks in the
// artifact source into the host's authoritative override map. The host owns
// this map and only mutates it from onApply / reset actions plus this
// initial hydration step — inbound iframe od:inspect-overrides messages are
// not ingested. Without this step, opening a file that already carries an
// override block would leave the host map empty, so a Save-to-source after
// any subsequent edit could splice a CSS body that drops every previously
// saved rule for elements the user did not touch in this session.
//
// Mirrors the iframe bridge's hydrateOverridesFromDom: same allow-list,
// same value sanitizer, same selector kinds, so what the iframe applies and
// what the host persists stay in lock-step. Pure string transform; no DOM.
//
// HTML-aware: enumerates `<style data-od-inspect-overrides>` elements via
// the same walker used by the splicer, so a `<style data-od-inspect-overrides>`
// literal living inside a `<script>`, `<style>` (e.g. CSS comment), `<textarea>`,
// `<title>`, or HTML comment is not mistaken for a real override block. Without
// that exclusion, useEffect would seed the host map from forged/quoted text and
// a later Save-to-source would persist phantom CSS the user never created.
export function parseInspectOverridesFromSource(source: string): InspectOverrideMap {
  const map: InspectOverrideMap = {};
  if (!source) return map;
  for (const body of stripInspectOverridesAndIndex(source).bodies) {
    const ruleRe = /(\[data-(?:od-id|screen-label)="([^"]*)"\])\s*\{\s*([^}]*)\}/g;
    let ruleMatch: RegExpExecArray | null;
    while ((ruleMatch = ruleRe.exec(body)) !== null) {
      const selector = ruleMatch[1] ?? '';
      const elementId = ruleMatch[2] ?? '';
      const declBody = ruleMatch[3] ?? '';
      if (!selector || !elementId || HOST_UNSAFE_INSPECT_ID.test(elementId)) continue;
      const props: Record<string, string> = {};
      for (const raw of declBody.split(';')) {
        if (!raw) continue;
        const colon = raw.indexOf(':');
        if (colon <= 0) continue;
        const name = raw.slice(0, colon).trim().toLowerCase();
        if (!HOST_ALLOWED_INSPECT_PROPS.has(name)) continue;
        const value = raw.slice(colon + 1).replace(/!important/gi, '').trim();
        if (!value || HOST_UNSAFE_INSPECT_VALUE.test(value)) continue;
        props[name] = value;
      }
      if (Object.keys(props).length) {
        map[elementId] = { selector, props };
      }
    }
  }
  return map;
}

// HTML5 raw-text and escapable-raw-text elements: the parser does not
// interpret markup inside their contents, so a literal `</head>` or
// `<style data-od-inspect-overrides>` written as text inside one of them
// must NOT be treated as a real tag. Without this exclusion, a regex-only
// splicer can match `</head>` inside an inline <script> string literal or
// a CSS comment and inject the override block into the middle of
// JavaScript/CSS instead of the actual document head, corrupting the
// artifact on Save to source.
const RAW_TEXT_INSPECT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title']);

// Decide whether a `<style ...>` opening tag actually carries a real
// `data-od-inspect-overrides` attribute, as opposed to merely mentioning
// the marker text inside another attribute name or value. The naive
// `\bdata-od-inspect-overrides\b` test against the whole tag text is
// over-broad in two cases:
//
//   1. A longer attribute name that has the marker as a prefix, e.g.
//      `<style data-od-inspect-overrides-note="docs">`. The `-` after
//      `overrides` is a non-word character, so `\b` matches and the tag
//      gets mis-stripped on save / mis-parsed on hydration.
//   2. The marker spelled inside an attribute value, e.g.
//      `<style title="data-od-inspect-overrides">`. The whole tag text
//      contains the literal, so the regex matches even though the actual
//      attribute names are `title` only.
//
// Both shapes occur in real artifacts (notes, documentation, fixtures)
// and would either silently drop the user's CSS on save or seed phantom
// overrides into the host map even though the artifact has no real
// override block. So we walk attributes proper, lower-casing each name
// and skipping any quoted value, and report a hit only when one of those
// names is exactly `data-od-inspect-overrides` (boolean attribute or
// assigned value, both legal HTML for our marker).
function styleTagIsInspectOverrideBlock(tagText: string): boolean {
  const start = /^<style/i.exec(tagText);
  if (!start) return false;
  let i = start[0].length;
  const end = tagText.length;
  while (i < end) {
    const ch = tagText.charAt(i);
    if (ch === '>') return false;
    if (ch === '/' || /\s/.test(ch)) {
      i++;
      continue;
    }
    const nameStart = i;
    while (i < end) {
      const c = tagText.charAt(i);
      if (c === '=' || c === '/' || c === '>' || /\s/.test(c)) break;
      i++;
    }
    const name = tagText.slice(nameStart, i).toLowerCase();
    while (i < end && /\s/.test(tagText.charAt(i))) i++;
    if (i < end && tagText.charAt(i) === '=') {
      i++;
      while (i < end && /\s/.test(tagText.charAt(i))) i++;
      const quote = tagText.charAt(i);
      if (quote === '"' || quote === "'") {
        i++;
        const close = tagText.indexOf(quote, i);
        i = close < 0 ? end : close + 1;
      } else {
        while (i < end) {
          const c = tagText.charAt(i);
          if (c === '>' || /\s/.test(c)) break;
          i++;
        }
      }
    }
    if (name === 'data-od-inspect-overrides') return true;
  }
  return false;
}

// Find the start (`<` position) of the matching close tag for a raw-text
// element, scanning case-insensitively. The close tag must be followed by
// a tag-name boundary (whitespace, `/`, or `>`) so a longer name like
// `</scripted>` doesn't accidentally close a `<script>`.
function findInspectRawTextEnd(source: string, start: number, name: string): number {
  const lower = source.toLowerCase();
  const needle = '</' + name.toLowerCase();
  let p = start;
  while (p < source.length) {
    const idx = lower.indexOf(needle, p);
    if (idx < 0) return -1;
    const after = source.charAt(idx + needle.length);
    if (after === '' || after === '>' || after === '/' || /\s/.test(after)) return idx;
    p = idx + needle.length;
  }
  return -1;
}

// Walk `source` and produce a copy with every existing
// `<style data-od-inspect-overrides>...</style>` block removed, while
// remembering where the real (non-raw-text) `<head>` boundaries land in
// the output. The walker honours HTML comment, doctype/processing
// instruction, and raw-text element boundaries so the splicer can ignore
// tag-shaped literals inside scripts/styles/textareas/titles. Pure string
// transform — no DOM dependency, safe to run during SSR/tests.
function stripInspectOverridesAndIndex(source: string): InspectSpliceScan {
  const parts: string[] = [];
  const bodies: string[] = [];
  let outLen = 0;
  let headOpenEnd = -1;
  let headCloseStart = -1;
  let i = 0;
  function emit(text: string): void {
    if (!text) return;
    parts.push(text);
    outLen += text.length;
  }
  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt < 0) {
      emit(source.slice(i));
      break;
    }
    if (lt > i) emit(source.slice(i, lt));
    i = lt;
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4);
      const stop = end < 0 ? source.length : end + 3;
      emit(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (source.startsWith('<!', i) || source.startsWith('<?', i)) {
      const end = source.indexOf('>', i + 2);
      const stop = end < 0 ? source.length : end + 1;
      emit(source.slice(i, stop));
      i = stop;
      continue;
    }
    const tagEnd = source.indexOf('>', i + 1);
    if (tagEnd < 0) {
      emit(source.slice(i));
      break;
    }
    const tagText = source.slice(i, tagEnd + 1);
    const closeMatch = /^<\/([a-zA-Z][a-zA-Z0-9-]*)/.exec(tagText);
    if (closeMatch) {
      const name = closeMatch[1]!.toLowerCase();
      if (name === 'head' && headCloseStart < 0) headCloseStart = outLen;
      emit(tagText);
      i = tagEnd + 1;
      continue;
    }
    const openMatch = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(tagText);
    if (!openMatch) {
      emit(tagText);
      i = tagEnd + 1;
      continue;
    }
    const name = openMatch[1]!.toLowerCase();
    const isSelfClose = /\/\s*>$/.test(tagText);
    if (name === 'head' && headOpenEnd < 0) headOpenEnd = outLen + tagText.length;
    if (name === 'style' && styleTagIsInspectOverrideBlock(tagText)) {
      // Strip the entire override block. A self-closing <style /> is a
      // degenerate authoring case; treat it as nothing to skip past.
      if (isSelfClose) {
        i = tagEnd + 1;
        continue;
      }
      const closeStart = findInspectRawTextEnd(source, tagEnd + 1, 'style');
      if (closeStart < 0) {
        // Unterminated override block — drop the rest of the document
        // rather than silently reflowing later content into a dangling
        // <style>. Matches the "stop" behaviour of the previous regex.
        i = source.length;
        continue;
      }
      bodies.push(source.slice(tagEnd + 1, closeStart));
      const closeEnd = source.indexOf('>', closeStart);
      let stop = closeEnd < 0 ? source.length : closeEnd + 1;
      while (stop < source.length && /\s/.test(source.charAt(stop))) stop++;
      i = stop;
      continue;
    }
    if (!isSelfClose && RAW_TEXT_INSPECT_ELEMENTS.has(name)) {
      const closeStart = findInspectRawTextEnd(source, tagEnd + 1, name);
      if (closeStart < 0) {
        emit(source.slice(i));
        i = source.length;
        continue;
      }
      const closeEnd = source.indexOf('>', closeStart);
      const stop = closeEnd < 0 ? source.length : closeEnd + 1;
      // Copy the entire raw-text element (open tag, body, close tag) to
      // the output verbatim so its contents pass through unmodified.
      emit(source.slice(i, stop));
      i = stop;
      continue;
    }
    emit(tagText);
    i = tagEnd + 1;
  }
  return { out: parts.join(''), headOpenEnd, headCloseStart, bodies };
}

// Splice (or remove) the inspect overrides <style> block in an HTML
// document. Idempotent: calling with the same css produces the same
// document. Empty css strips the block entirely.
//
// HTML-aware: the underlying scan ignores comments and raw-text element
// contents (script / style / textarea / title), so a literal `</head>` or
// `<style data-od-inspect-overrides>` written inside an inline script or
// style block does not trick the splicer into stripping user code or
// inserting the override block in the middle of JavaScript/CSS.
//
// Exported (via the module) so a unit test can drive it without a live
// browser. Pure string transform — no DOM, no parser dependency.
export function applyInspectOverridesToSource(source: string, css: string): string {
  const trimmed = css.trim();
  const { out, headOpenEnd, headCloseStart } = stripInspectOverridesAndIndex(source);
  if (!trimmed) return out;
  const block = `<style data-od-inspect-overrides>\n${trimmed}\n</style>\n`;
  if (headCloseStart >= 0) {
    return out.slice(0, headCloseStart) + block + out.slice(headCloseStart);
  }
  if (headOpenEnd >= 0) {
    return out.slice(0, headOpenEnd) + block + out.slice(headOpenEnd);
  }
  return block + out;
}

// ---------------------------------------------------------------------------
// Geometry + CSS-length helpers for the board/inspect overlays. All pure math
// over plain point/rect records (no DOM), so they test with zero doubles.
// ---------------------------------------------------------------------------

// Parse an `rgb()`/`rgba()`/`#rgb`/`#rrggbb` value into a `#rrggbb` string,
// defaulting to black when the value is missing or unrecognized.
export function rgbToHex(value: string | undefined): string {
  if (!value) return '#000000';
  const v = value.trim();
  if (v.startsWith('#') && (v.length === 7 || v.length === 4)) {
    if (v.length === 4) {
      return '#' + [1, 2, 3].map((i) => {
        const c = v.charAt(i);
        return c + c;
      }).join('');
    }
    return v;
  }
  const m = v.match(/rgba?\(\s*([0-9.]+)[ ,]+([0-9.]+)[ ,]+([0-9.]+)/i);
  if (!m) return '#000000';
  const toHex = (n: string) => {
    const x = Math.max(0, Math.min(255, Math.round(Number(n))));
    return x.toString(16).padStart(2, '0');
  };
  return '#' + toHex(m[1] ?? '0') + toHex(m[2] ?? '0') + toHex(m[3] ?? '0');
}

// Parse a CSS length to a number. Inspect's current sliders all clamp to a
// non-negative range (padding, font-size, border-radius), so we reject
// negatives at parse time too — otherwise a `-12px` source value would be
// silently floored to 0 by the slider clamp without the regex agreeing.
// If a future control needs negative values (e.g. margin), thread an
// explicit `allowNegative` flag rather than reintroducing `-?` here.
export function pxToNumber(value: string | undefined): number {
  if (!value) return 0;
  const m = value.trim().match(/^(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function isClosedLoop(points: StrokePoint[]): boolean {
  if (points.length < 4) return false;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return Math.hypot(first.x - last.x, first.y - last.y) <= 28;
}

export function rectContains(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.width >= inner.x + inner.width &&
    outer.y + outer.height >= inner.y + inner.height
  );
}

export function pathIntersectsRect(
  points: StrokePoint[],
  rect: { left: number; top: number; width: number; height: number },
): boolean {
  if (points.length === 0) return false;
  const x1 = rect.left;
  const y1 = rect.top;
  const x2 = rect.left + rect.width;
  const y2 = rect.top + rect.height;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    if (point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2) {
      return true;
    }
    const next = points[index + 1];
    if (!next) continue;
    if (
      lineIntersectsLine(point, next, { x: x1, y: y1 }, { x: x2, y: y1 }) ||
      lineIntersectsLine(point, next, { x: x2, y: y1 }, { x: x2, y: y2 }) ||
      lineIntersectsLine(point, next, { x: x2, y: y2 }, { x: x1, y: y2 }) ||
      lineIntersectsLine(point, next, { x: x1, y: y2 }, { x: x1, y: y1 })
    ) {
      return true;
    }
  }
  return false;
}

export function pointInPolygon(point: StrokePoint, polygon: StrokePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    const intersects =
      pi.y > point.y !== pj.y > point.y &&
      point.x <
        ((pj.x - pi.x) * (point.y - pi.y)) / ((pj.y - pi.y) || Number.EPSILON) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function lineIntersectsLine(a1: StrokePoint, a2: StrokePoint, b1: StrokePoint, b2: StrokePoint): boolean {
  const denominator =
    (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (denominator === 0) return false;
  const ua =
    ((b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x)) / denominator;
  const ub =
    ((a2.x - a1.x) * (a1.y - b1.y) - (a2.y - a1.y) * (a1.x - b1.x)) / denominator;
  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
}

// ---------------------------------------------------------------------------
// Preview viewport + scale rules. Pure math over the viewport preset table
// and a measured canvas size — no DOM, so the viewport switcher's framing
// math tests without a live iframe.
// ---------------------------------------------------------------------------

export function previewViewportIcon(viewport: PreviewViewportId): string {
  if (viewport === 'tablet') return 'tablet-line';
  if (viewport === 'mobile') return 'smartphone-line';
  return 'computer-line';
}

export function previewViewportStyle(
  viewport: PreviewViewportId,
  previewScale = 1,
  canvasSize?: PreviewCanvasSize,
  options?: PreviewScaleOptions,
): Record<string, string | number> {
  const preset = PREVIEW_VIEWPORT_PRESETS.find((item) => item.id === viewport) ?? PREVIEW_VIEWPORT_PRESETS[0]!;
  if (!preset.width) return {};
  const effectiveScale = effectivePreviewScale(viewport, previewScale, canvasSize, options);
  return {
    '--preview-viewport-width': `${preset.width}px`,
    '--preview-viewport-height': `${preset.height}px`,
    '--preview-scale': effectiveScale,
    '--preview-user-scale': previewScale,
  };
}

export function commentPreviewCanvasSize(
  canvasSize: PreviewCanvasSize | undefined,
  options: CommentPreviewCanvasOptions,
): PreviewCanvasSize | undefined {
  if (!canvasSize || !options.boardMode) return canvasSize;
  const dockPadding = options.viewport && options.viewport !== 'desktop'
    ? COMMENT_SIDE_DOCK_NON_DESKTOP_PADDING
    : COMMENT_SIDE_DOCK_PADDING;
  const sideDockWidth = options.sidePanelCollapsed ? COMMENT_SIDE_DOCK_RAIL_WIDTH : COMMENT_SIDE_DOCK_WIDTH;
  const dockedWidth = canvasSize.width - (dockPadding * 2) - COMMENT_SIDE_DOCK_GAP - sideDockWidth;
  if (usesStackedCommentSideDock(canvasSize, options)) {
    const stackedHeightDeduction = options.sidePanelCollapsed
      ? COMMENT_SIDE_DOCK_STACKED_COLLAPSED_HEIGHT_DEDUCTION
      : COMMENT_SIDE_DOCK_STACKED_HEIGHT_DEDUCTION;
    return {
      width: Math.max(1, canvasSize.width - (COMMENT_SIDE_DOCK_PADDING * 2)),
      height: Math.max(1, canvasSize.height - stackedHeightDeduction),
    };
  }
  return {
    width: Math.max(1, dockedWidth),
    height: Math.max(1, canvasSize.height - (dockPadding * 2)),
  };
}

export function usesStackedCommentSideDock(
  canvasSize: PreviewCanvasSize | undefined,
  options: CommentPreviewCanvasOptions,
): boolean {
  if (!canvasSize || !options.boardMode) return false;
  const dockPadding = options.viewport && options.viewport !== 'desktop'
    ? COMMENT_SIDE_DOCK_NON_DESKTOP_PADDING
    : COMMENT_SIDE_DOCK_PADDING;
  const sideDockWidth = options.sidePanelCollapsed ? COMMENT_SIDE_DOCK_RAIL_WIDTH : COMMENT_SIDE_DOCK_WIDTH;
  const dockedWidth = canvasSize.width - (dockPadding * 2) - COMMENT_SIDE_DOCK_GAP - sideDockWidth;
  return dockedWidth < COMMENT_SIDE_DOCK_MIN_CANVAS_WIDTH;
}

export function effectivePreviewScale(
  viewport: PreviewViewportId,
  previewScale: number,
  canvasSize?: PreviewCanvasSize,
  options?: PreviewScaleOptions,
): number {
  if (viewport === 'desktop') return previewScale;
  const preset = PREVIEW_VIEWPORT_PRESETS.find((item) => item.id === viewport);
  if (!preset?.width || !preset.height || !canvasSize?.width || !canvasSize.height) return previewScale;
  const canvasPadding = options?.canvasPadding ?? 48;
  const availableWidth = Math.max(1, canvasSize.width - canvasPadding);
  const availableHeight = Math.max(1, canvasSize.height - canvasPadding);
  const fitScale = Math.min(1, availableWidth / preset.width, availableHeight / preset.height);
  return Math.min(previewScale, fitScale);
}

export function previewOverlayTransform(
  viewport: PreviewViewportId,
  previewScale: number,
  canvasSize?: PreviewCanvasSize,
): PreviewOverlayTransform {
  const scale = effectivePreviewScale(viewport, previewScale, canvasSize);
  if (viewport === 'desktop') return { scale, offsetX: 0, offsetY: 0 };
  const preset = PREVIEW_VIEWPORT_PRESETS.find((item) => item.id === viewport);
  const pad = 24;
  if (!preset?.width || !preset.height) return { scale, offsetX: pad, offsetY: pad };
  const availableWidth = Math.max(1, (canvasSize?.width ?? preset.width * scale + pad * 2) - pad * 2);
  const scaledWidth = preset.width * scale;
  return {
    scale,
    offsetX: pad + Math.max(0, (availableWidth - scaledWidth) / 2),
    offsetY: pad,
  };
}

export function previewScaleShellStyle(
  viewport: PreviewViewportId,
  previewScale: number,
): Record<string, string> {
  if (viewport === 'desktop') {
    return {
      width: `${100 / previewScale}%`,
      height: `${100 / previewScale}%`,
      transform: `scale(${previewScale})`,
      transformOrigin: '0 0',
    };
  }
  return {
    width: 'var(--preview-viewport-width)',
    height: 'var(--preview-viewport-height)',
    transform: 'scale(var(--preview-scale, 1))',
    transformOrigin: '0 0',
  };
}

export function manualEditPreviewShellStyle(
  viewport: PreviewViewportId,
  previewScale: number,
  frozenWidth: number | null,
): Record<string, string> {
  if (viewport === 'desktop' && frozenWidth) {
    return {
      width: `${frozenWidth / previewScale}px`,
      height: `${100 / previewScale}%`,
      transform: `scale(${previewScale})`,
      transformOrigin: '0 0',
    };
  }
  return previewScaleShellStyle(viewport, previewScale);
}

export function manualEditFloatingPanelStyle(
  target: ManualEditTarget,
  previewScale: number,
  canvasSize: PreviewCanvasSize | undefined,
): { left: number; top: number; width: number; maxHeight: number } {
  const scale = Number.isFinite(previewScale) && previewScale > 0 ? previewScale : 1;
  const panelWidth = 320;
  const preferredPanelHeight = 380;
  const pad = 12;
  const canvasWidth = canvasSize?.width ?? 1200;
  const canvasHeight = canvasSize?.height ?? 800;
  const panelHeight = Math.min(preferredPanelHeight, Math.max(260, canvasHeight - pad * 2));
  const targetLeft = target.rect.x * scale;
  const targetTop = target.rect.y * scale;
  const targetRight = (target.rect.x + target.rect.width) * scale;
  let left = targetRight + pad;
  if (left + panelWidth > canvasWidth - pad) {
    left = Math.max(pad, targetLeft - panelWidth - pad);
  }
  const top = Math.max(
    pad,
    Math.min(targetTop, Math.max(pad, canvasHeight - panelHeight - pad)),
  );
  // Height is left to the content (auto): a short inspector (e.g. typography
  // only) should be a compact card, not a tall half-empty panel. The cap only
  // engages for long inspectors, at which point the scroll body takes over.
  return {
    left,
    top,
    width: panelWidth,
    maxHeight: panelHeight,
  };
}

// Anchors the hover "edit params" affordance to the top-right corner of the
// hovered element, just inside its bounds so moving the cursor from the
// element onto the icon does not drop the hover. Uses the same iframe→canvas
// coordinate basis as the floating inspector panel.
export function manualEditHoverIconStyle(
  target: ManualEditTarget,
  previewScale: number,
  canvasSize: PreviewCanvasSize | undefined,
): { left: number; top: number; width: number; height: number } {
  const scale = Number.isFinite(previewScale) && previewScale > 0 ? previewScale : 1;
  const iconSize = 26;
  const inset = 4;
  const canvasWidth = canvasSize?.width ?? 1200;
  const canvasHeight = canvasSize?.height ?? 800;
  const targetTop = target.rect.y * scale;
  const targetRight = (target.rect.x + target.rect.width) * scale;
  const left = Math.max(
    inset,
    Math.min(targetRight - iconSize - inset, canvasWidth - iconSize - inset),
  );
  const top = Math.max(
    inset,
    Math.min(targetTop + inset, canvasHeight - iconSize - inset),
  );
  return { left, top, width: iconSize, height: iconSize };
}

// ---------------------------------------------------------------------------
// Deploy + share rules. Pure lookups/derivations over deploy provider config
// and deployment records — no DOM, no transport.
// ---------------------------------------------------------------------------

export function getDeployProviderOption(providerId: DeployProviderId): DeployProviderOption {
  return DEPLOY_PROVIDER_OPTIONS.find((option) => option.id === providerId) ?? DEPLOY_PROVIDER_OPTIONS[0]!;
}

export function normalizeCloudflareDomainPrefixInput(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidCloudflareDomainPrefixInput(raw: string): boolean {
  const prefix = normalizeCloudflareDomainPrefixInput(raw);
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(prefix);
}

export function deployResultState(status?: string): 'ready' | 'delayed' | 'protected' | 'failed' {
  if (status === 'protected') return 'protected';
  if (status === 'failed' || status === 'conflict') return 'failed';
  if (status === 'link-delayed' || status === 'pending') return 'delayed';
  return 'ready';
}

export function publicShareUrlForDeployment(deployment?: DeploymentInfo | null): string {
  if (!deployment) return '';
  const cloudflare = deployment.cloudflarePages;
  const customDomainUrl = cloudflare?.customDomain?.status === 'ready'
    ? cloudflare.customDomain.url?.trim()
    : '';
  if (customDomainUrl) return customDomainUrl;
  const pagesDevUrl = cloudflare?.pagesDev?.status === 'ready'
    ? cloudflare.pagesDev.url?.trim()
    : '';
  if (pagesDevUrl) return pagesDevUrl;
  return deployResultState(deployment.status) === 'ready'
    ? deployment.url?.trim() || ''
    : '';
}

export function deploymentTimestamp(deployment: DeploymentInfo): number {
  const maybeDeployedAt = (deployment as DeploymentInfo & { deployedAt?: number | string }).deployedAt;
  const candidates = [maybeDeployedAt, deployment.updatedAt, deployment.createdAt];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === 'string') {
      const parsed = Date.parse(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

export function compareDeploymentsByNewest(a: DeploymentInfo, b: DeploymentInfo): number {
  return deploymentTimestamp(b) - deploymentTimestamp(a);
}

export function shareUrlForDeployment(deployment: DeploymentInfo): string {
  const customDomain = deployment.providerId === CLOUDFLARE_PAGES_PROVIDER_ID
    ? deployment.cloudflarePages?.customDomain
    : undefined;
  if (customDomain?.status === 'ready' && customDomain.url?.trim()) {
    return customDomain.url.trim();
  }
  return deployment.url?.trim() || '';
}

export function pickLatestShareDeployment(
  deploymentsByProvider: Partial<Record<DeployProviderId, DeploymentInfo>>,
): DeploymentInfo | null {
  return Object.values(deploymentsByProvider)
    .filter((deployment): deployment is DeploymentInfo =>
      Boolean(deployment && shareUrlForDeployment(deployment) && deployResultState(deployment.status) !== 'failed'))
    .sort(compareDeploymentsByNewest)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Manual-edit inspector style rules. Pure normalization/merge over the
// element style snapshot the inspector reads back from the iframe bridge.
// ---------------------------------------------------------------------------

export function mergeManualEditInspectorStyles(
  sourceStyles: ManualEditStyles,
  previewStyles: ManualEditStyles,
): ManualEditStyles {
  return MANUAL_EDIT_STYLE_PROPS.reduce<ManualEditStyles>((acc, key) => {
    const sourceValue = sourceStyles[key]?.trim();
    const previewValue = previewStyles[key]?.trim();
    const value = sourceValue || previewValue || '';
    acc[key] = manualEditInspectorStyleValue(key, value);
    return acc;
  }, {} as ManualEditStyles);
}

export function manualEditInspectorStyleValue(key: keyof ManualEditStyles, value: string): string {
  if (!value) return '';
  if (key === 'color' || key === 'backgroundColor' || key === 'borderColor') {
    return normalizeManualEditInspectorColor(value);
  }
  return value;
}

export function normalizeManualEditInspectorColor(value: string): string {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const r = trimmed[1]!, g = trimmed[2]!, b = trimmed[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const rgba = trimmed.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (!rgba) return trimmed;
  if (rgba[4] !== undefined && Number(rgba[4]) === 0) return '';
  const toHex = (raw: string) => Math.max(0, Math.min(255, Math.round(Number(raw))))
    .toString(16)
    .padStart(2, '0');
  return `#${toHex(rgba[1]!)}${toHex(rgba[2]!)}${toHex(rgba[3]!)}`;
}

export function manualEditPersistedValueMatchesSavedSnapshot(
  key: keyof ManualEditStyles,
  persistedValue: string,
  savedValue: string,
): boolean {
  return canonicalManualEditStyleValue(key, persistedValue) === canonicalManualEditStyleValue(key, savedValue);
}

export function canonicalManualEditStyleValue(key: keyof ManualEditStyles, value: string): string {
  const normalized = manualEditInspectorStyleValue(key, value).trim();
  if (!normalized) return '';
  return normalized.toLowerCase();
}

export function cancelManualEditPendingStyleSnapshot(
  pending: ManualEditPendingStyleSave | null,
  id: string,
  keys: Array<keyof ManualEditStyles>,
): ManualEditPendingStyleSave | null {
  if (!pending || pending.id !== id || keys.length === 0) return pending;
  const nextStyles = { ...pending.styles };
  for (const key of keys) delete nextStyles[key];
  if (Object.keys(nextStyles).length === 0) return null;
  return { ...pending, styles: nextStyles };
}

// ---------------------------------------------------------------------------
// Markdown source-path + code-block rules. Pure string transforms — no DOM,
// no transport (the transport-touching URL resolver stays with the
// orchestrator until the markdown viewer gets its own provider seam).
// ---------------------------------------------------------------------------

export function markdownDirectory(path: string): string {
  const normalized = normalizeMarkdownProjectPath(path);
  const slash = normalized.lastIndexOf('/');
  return slash > 0 ? normalized.slice(0, slash) : '';
}

export function normalizeMarkdownProjectPath(path: string): string {
  const parts: string[] = [];
  for (const raw of path.replace(/\\/g, '/').split('/')) {
    const part = raw.trim();
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}

export function markdownRelativeProjectPath(fromPath: string, targetPath: string): string {
  const fromDir = markdownDirectory(fromPath);
  const target = normalizeMarkdownProjectPath(targetPath);
  if (!fromDir) return target;
  if (target.startsWith(`${fromDir}/`)) return target.slice(fromDir.length + 1);
  const fromParts = fromDir.split('/').filter(Boolean);
  const targetParts = target.split('/').filter(Boolean);
  let common = 0;
  while (common < fromParts.length && common < targetParts.length && fromParts[common] === targetParts[common]) {
    common += 1;
  }
  const up = Array.from({ length: fromParts.length - common }, () => '..');
  const down = targetParts.slice(common);
  return [...up, ...down].join('/') || target;
}

export function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function markdownCodeBlockLanguage(content: string): MarkdownCodeLanguage | null {
  const codeMatch = content.match(/<code\b([^>]*)>/);
  if (!codeMatch) return null;
  const classMatch = codeMatch[1]?.match(/\bclass=(["'])(.*?)\1/);
  const className = classMatch?.[2] ?? '';
  const languageClass = className
    .split(/\s+/)
    .map((item) => item.trim())
    .find((item) => /^(?:language|lang)-/i.test(item));
  if (!languageClass) return null;
  const raw = languageClass.replace(/^(?:language|lang)-/i, '').replace(/[^a-z0-9+#.-]/gi, '');
  if (!raw) return null;
  const aliases: Record<string, MarkdownCodeLanguage> = {
    bash: { lang: 'bash', label: 'Bash' },
    c: { lang: 'c', label: 'C' },
    cpp: { lang: 'cpp', label: 'C++' },
    css: { lang: 'css', label: 'CSS' },
    diff: { lang: 'diff', label: 'Diff' },
    dockerfile: { lang: 'dockerfile', label: 'Dockerfile' },
    go: { lang: 'go', label: 'Go' },
    graphql: { lang: 'graphql', label: 'GraphQL' },
    html: { lang: 'html', label: 'HTML' },
    java: { lang: 'java', label: 'Java' },
    js: { lang: 'javascript', label: 'JS' },
    javascript: { lang: 'javascript', label: 'JS' },
    json: { lang: 'json', label: 'JSON' },
    jsx: { lang: 'jsx', label: 'JSX' },
    markdown: { lang: 'markdown', label: 'Markdown' },
    md: { lang: 'markdown', label: 'Markdown' },
    php: { lang: 'php', label: 'PHP' },
    py: { lang: 'python', label: 'Python' },
    python: { lang: 'python', label: 'Python' },
    rb: { lang: 'ruby', label: 'Ruby' },
    ruby: { lang: 'ruby', label: 'Ruby' },
    rust: { lang: 'rust', label: 'Rust' },
    shell: { lang: 'shell', label: 'Shell' },
    sh: { lang: 'shell', label: 'Shell' },
    sql: { lang: 'sql', label: 'SQL' },
    swift: { lang: 'swift', label: 'Swift' },
    toml: { lang: 'toml', label: 'TOML' },
    ts: { lang: 'typescript', label: 'TS' },
    tsx: { lang: 'tsx', label: 'TSX' },
    typescript: { lang: 'typescript', label: 'TS' },
    xml: { lang: 'xml', label: 'XML' },
    yaml: { lang: 'yaml', label: 'YAML' },
    yml: { lang: 'yaml', label: 'YAML' },
  };
  return aliases[raw.toLowerCase()] ?? { lang: raw.toLowerCase(), label: raw.toUpperCase() };
}

export function decorateMarkdownCodeBlocks(html: string): string {
  let blockIndex = 0;
  return html.replace(/<pre\b([^>]*)>([\s\S]*?)<\/pre>/g, (_match, attrs: string, content: string) => {
    const blockId = String(blockIndex++);
    const language = markdownCodeBlockLanguage(content);
    const languageAttr = language ? ` ${MARKDOWN_CODE_LANGUAGE_ATTR}="${escapeHtmlAttribute(language.label)}"` : '';
    return `<div class="markdown-code-block" ${MARKDOWN_CODE_BLOCK_ATTR}="${blockId}"${languageAttr}><pre${attrs}>${content}</pre></div>`;
  });
}

export function markdownScrollRange(element: { scrollHeight: number; clientHeight: number }): number {
  return Math.max(0, element.scrollHeight - element.clientHeight);
}

export function markdownScrollRatio(element: { scrollHeight: number; clientHeight: number; scrollTop: number }): number {
  const range = markdownScrollRange(element);
  return range > 0 ? element.scrollTop / range : 0;
}

export function markdownScrollTopForRatio(
  element: { scrollHeight: number; clientHeight: number },
  ratio: number,
): number {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  return markdownScrollRange(element) * clamped;
}

export interface MarkdownSaveOptions {
  refreshFiles?: boolean;
  showSaving?: boolean;
}

export function mergeMarkdownSaveOptions(a: MarkdownSaveOptions, b: MarkdownSaveOptions): MarkdownSaveOptions {
  return {
    refreshFiles: a.refreshFiles !== false || b.refreshFiles !== false,
    showSaving: a.showSaving !== false || b.showSaving !== false,
  };
}

export function isMarkdownImageFile(file: { type: string; name: string }): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
}

export function markdownImageAlt(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'image';
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Pure URL-path builder for a project's raw file bytes. Structurally identical
// to `providers/registry`'s `projectFileUrl`/`projectRawUrl` — duplicated here
// (rather than imported) because it is pure string-building with no transport
// or DOM dependency, so it belongs in the slice per ADR 0002 (the guard treats
// any `providers/` import as a transport reach regardless of the export's own
// purity).
export function fileRawUrl(projectId: string, filePath: string): string {
  const safePath = filePath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `/api/projects/${encodeURIComponent(projectId)}/raw/${safePath}`;
}

// ---------------------------------------------------------------------------
// HTML preview asset-path rules. Pure path resolution for the same-project
// relative asset references (`<link>`/`<script src>`) an HTML artifact can
// reference — no DOM, no fetch (the actual asset fetch stays with the
// orchestrator's transport call).
// ---------------------------------------------------------------------------

export function baseDirFor(fileName: string): string {
  const idx = fileName.lastIndexOf('/');
  return idx >= 0 ? fileName.slice(0, idx + 1) : '';
}

export function toOwnerRelativePath(ownerFileName: string, targetPath: string): string {
  const normalize = (value: string) => decodeURIComponent(value).replace(/^\/+/, '');
  const squash = (parts: string[]) => {
    const out: string[] = [];
    for (const part of parts) {
      if (!part || part === '.') continue;
      if (part === '..') {
        if (out.length > 0) out.pop();
        continue;
      }
      out.push(part);
    }
    return out;
  };
  const ownerDirPath = normalize(baseDirFor(ownerFileName));
  const targetFilePath = normalize(targetPath);
  const ownerParts = squash(ownerDirPath.split('/'));
  const targetParts = squash(targetFilePath.split('/'));

  let common = 0;
  while (
    common < ownerParts.length &&
    common < targetParts.length &&
    ownerParts[common] === targetParts[common]
  ) {
    common += 1;
  }

  const up = new Array(ownerParts.length - common).fill('..');
  const down = targetParts.slice(common);
  const rel = [...up, ...down].join('/');
  return rel || '.';
}

// Whitespace, C0 controls, DEL, and C1 controls — stripped before the scheme
// check so a hostile `java\tscript:` / embedded-control-char payload can't
// dodge the `javascript:`/`data:` block by splitting the token.
function isAsciiWhitespaceOrControl(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code <= 31 || (code >= 127 && code <= 159) || /\s/.test(ch);
}

export function isBlockedPreviewAssetScheme(assetRef: string): boolean {
  let clean = '';
  for (const ch of assetRef) {
    if (!isAsciiWhitespaceOrControl(ch)) clean += ch;
  }
  return /^(?:javascript|data):/i.test(clean);
}

export function hasRelativeAssetRefs(html: string): boolean {
  const attr = /\s(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = attr.exec(html)) !== null) {
    const value = match[1]?.trim();
    if (!value) continue;
    if (/^(?:https?:|data:|blob:|mailto:|tel:|#|\/)/i.test(value)) continue;
    return true;
  }
  return false;
}

export function resolveProjectRelativePath(ownerFileName: string, assetRef: string): string | null {
  if (isBlockedPreviewAssetScheme(assetRef)) return null;
  if (/^(?:https?:|data:|blob:|mailto:|tel:|#|\/)/i.test(assetRef)) return null;
  try {
    const url = new URL(assetRef, `https://od.local/${baseDirFor(ownerFileName)}`);
    if (url.origin !== 'https://od.local') return null;
    const decodedPath = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    const parts = decodedPath.split(/[/\\]/);
    if (parts.some((part) => part === '..' || part.trim() === '..')) return null;
    return decodedPath;
  } catch {
    return null;
  }
}

export function readHtmlAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(['"])([\\s\\S]*?)\\1`, 'i'));
  return match?.[2] ?? null;
}

export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// File-version rules. Pure label/class/tracking derivations over a version
// record — no DOM, no transport.
// ---------------------------------------------------------------------------

export function isHtmlVersionableFile(file: { kind: string; name: string }): boolean {
  return file.kind === 'html' || /\.html?$/i.test(file.name);
}

export function fileVersionSourceClassName(version: { source: string }): string {
  if (version.source === 'manual') return 'manual';
  if (version.source === 'restore') return 'restore';
  return 'ai';
}

// ---------------------------------------------------------------------------
// Comment rules. Pure derivations over `PreviewComment`/`PreviewCommentSnapshot`
// records — no DOM, no transport.
// ---------------------------------------------------------------------------

export function commentActivityAt(comment: PreviewComment): number {
  return Math.max(
    Number.isFinite(comment.updatedAt) ? comment.updatedAt : 0,
    Number.isFinite(comment.createdAt) ? comment.createdAt : 0,
  );
}

export function commentCreatedAt(comment: PreviewComment): number {
  return Number.isFinite(comment.createdAt) ? comment.createdAt : commentActivityAt(comment);
}

export function commentTargetIntersectsPreview(
  target: PreviewCommentSnapshot | null,
  scale: number,
  offset: { x: number; y: number },
  bounds?: PreviewCanvasSize,
): boolean {
  if (!target || !bounds?.width || !bounds.height) return true;
  const rect = overlayBoundsFromSnapshot(target, scale, offset);
  const margin = 8;
  return (
    rect.left + rect.width > margin &&
    rect.top + rect.height > margin &&
    rect.left < bounds.width - margin &&
    rect.top < bounds.height - margin
  );
}

export function commentSideDropEdgeForEvent(event: {
  currentTarget: { getBoundingClientRect(): { top: number; height: number } };
  clientY: number;
}): CommentSideDropEdge {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

export function reorderPreviewCommentIds(
  comments: PreviewComment[],
  draggingId: string,
  targetId: string,
  edge: CommentSideDropEdge,
): string[] {
  const ids = comments.map((comment) => comment.id);
  const from = ids.indexOf(draggingId);
  if (from < 0) return ids;
  const [draggedId] = ids.splice(from, 1);
  const targetIndex = ids.indexOf(targetId);
  if (targetIndex < 0 || !draggedId) return comments.map((comment) => comment.id);
  ids.splice(edge === 'after' ? targetIndex + 1 : targetIndex, 0, draggedId);
  return ids;
}

export function appendSavedPreviewCommentOrder(
  currentOrderIds: string[],
  visibleComments: Array<Pick<PreviewComment, 'id'>>,
  savedId: string,
): string[] {
  if (!savedId) return currentOrderIds;
  const visibleIds = visibleComments.map((comment) => comment.id);
  if (currentOrderIds.includes(savedId) || visibleIds.includes(savedId)) {
    return currentOrderIds;
  }
  const visibleIdSet = new Set(visibleIds);
  const kept = currentOrderIds.filter((id) => visibleIdSet.has(id));
  const missingVisibleIds = visibleIds.filter((id) => !kept.includes(id));
  const base = currentOrderIds.length > 0 ? [...kept, ...missingVisibleIds] : visibleIds;
  const next = [...base, savedId];
  return next.join('\0') === currentOrderIds.join('\0') ? currentOrderIds : next;
}

// ---------------------------------------------------------------------------
// Pod (multi-element selection) rules. Pure geometry/summary derivations over
// a set of `PreviewCommentSnapshot` targets — no DOM, no transport. `Date.now()`
// is used only as an id seed, not a side effect the guard cares about.
// ---------------------------------------------------------------------------

export function podDisplayMembers(snapshot: PreviewCommentSnapshot): PreviewCommentSnapshot[] {
  if (snapshot.selectionKind !== 'pod' || !Array.isArray(snapshot.podMembers)) return [];
  const memberSnapshots = snapshot.podMembers.map((member) => ({
    filePath: snapshot.filePath,
    elementId: member.elementId,
    selector: member.selector,
    label: member.label,
    text: member.text,
    position: member.position,
    htmlHint: member.htmlHint,
    selectionKind: 'element' as const,
  }));
  const refined = pruneContainerSelections(memberSnapshots);
  return refined.length > 0 ? refined : memberSnapshots;
}

export function podOverlayWeights(
  members: PreviewCommentSnapshot[],
): Array<{ backgroundOpacity: number; outlineOpacity: number; ringOpacity: number }> {
  const areas = members.map((member) =>
    Math.max(1, member.position.width * member.position.height),
  );
  const maxArea = Math.max(...areas);
  const minArea = Math.min(...areas);
  return areas.map((area) => {
    const normalized =
      maxArea === minArea ? 1 : 1 - (area - minArea) / (maxArea - minArea);
    const emphasis = Math.pow(normalized, 0.9);
    return {
      backgroundOpacity: roundOverlayOpacity(0.1 + emphasis * 0.6),
      outlineOpacity: roundOverlayOpacity(0.34 + emphasis * 0.36),
      ringOpacity: roundOverlayOpacity(0.08 + emphasis * 0.18),
    };
  });
}

export function roundOverlayOpacity(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildPodSnapshot(input: {
  filePath: string;
  strokePoints: StrokePoint[];
  liveTargets: Map<string, PreviewCommentSnapshot>;
}): PreviewCommentSnapshot | null {
  if (input.strokePoints.length < 2) return null;
  const closedLoop = isClosedLoop(input.strokePoints);
  const intersected = Array.from(input.liveTargets.values()).filter((snapshot) =>
    selectionHitsSnapshot({
      points: input.strokePoints,
      snapshot,
      closedLoop,
    }),
  );
  const refined = pruneContainerSelections(intersected);
  const selected = refined.length > 0 ? refined : intersected;
  if (selected.length === 0) return null;
  const bounds = selected.reduce(
    (acc, snapshot) => {
      const rect = snapshot.position;
      return {
        left: Math.min(acc.left, rect.x),
        top: Math.min(acc.top, rect.y),
        right: Math.max(acc.right, rect.x + rect.width),
        bottom: Math.max(acc.bottom, rect.y + rect.height),
      };
    },
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY,
    },
  );
  const podMembers: PreviewCommentMember[] = selected.map((snapshot) => ({
    elementId: snapshot.elementId,
    selector: snapshot.selector,
    label: snapshot.label,
    text: snapshot.text,
    position: snapshot.position,
    htmlHint: snapshot.htmlHint,
    style: snapshot.style,
  }));
  const summary = selected
    .slice(0, 3)
    .map((snapshot) => summarizeSnapshot(snapshot))
    .join(' · ');
  const htmlHint = selected
    .slice(0, 4)
    .map((snapshot) => snapshot.htmlHint)
    .filter(Boolean)
    .join(' ');
  const combinedSelector = selected
    .slice(0, 8)
    .map((snapshot) => snapshot.selector)
    .filter(Boolean)
    .join(', ');
  return {
    filePath: input.filePath,
    elementId: `pod-${Date.now()}`,
    selector: combinedSelector || 'body *',
    label: summary || `Pod of ${intersected.length} items`,
    text: intersected
      .slice(0, 4)
      .map((snapshot) => snapshot.text)
      .filter(Boolean)
      .join(' · '),
    position: {
      x: Math.round(bounds.left),
      y: Math.round(bounds.top),
      width: Math.max(1, Math.round(bounds.right - bounds.left)),
      height: Math.max(1, Math.round(bounds.bottom - bounds.top)),
    },
    htmlHint: htmlHint.slice(0, 180),
    selectionKind: 'pod',
    memberCount: selected.length,
    podMembers,
  };
}

export function pruneContainerSelections(
  snapshots: PreviewCommentSnapshot[],
): PreviewCommentSnapshot[] {
  if (snapshots.length < 2) return snapshots;
  return snapshots.filter((candidate) => {
    const candidateArea = Math.max(1, candidate.position.width * candidate.position.height);
    const contained = snapshots.filter(
      (other) =>
        other.elementId !== candidate.elementId &&
        rectContains(candidate.position, other.position),
    );
    if (contained.length === 0) return true;
    const union = contained.reduce(
      (acc, other) => ({
        left: Math.min(acc.left, other.position.x),
        top: Math.min(acc.top, other.position.y),
        right: Math.max(acc.right, other.position.x + other.position.width),
        bottom: Math.max(acc.bottom, other.position.y + other.position.height),
      }),
      {
        left: Number.POSITIVE_INFINITY,
        top: Number.POSITIVE_INFINITY,
        right: Number.NEGATIVE_INFINITY,
        bottom: Number.NEGATIVE_INFINITY,
      },
    );
    const unionArea = Math.max(1, (union.right - union.left) * (union.bottom - union.top));
    return !(contained.length >= 2 && candidateArea > unionArea * 2.4);
  });
}

export function summarizeSnapshot(snapshot: PreviewCommentSnapshot): string {
  const text = snapshot.text.trim();
  if (text) {
    const trimmed = text.length > 28 ? `${text.slice(0, 25)}...` : text;
    return `${snapshot.label || snapshot.elementId} · ${trimmed}`;
  }
  return snapshot.label || snapshot.elementId;
}

export function selectionHitsSnapshot(input: {
  points: StrokePoint[];
  snapshot: PreviewCommentSnapshot;
  closedLoop: boolean;
}): boolean {
  const bounds = {
    left: input.snapshot.position.x,
    top: input.snapshot.position.y,
    width: input.snapshot.position.width,
    height: input.snapshot.position.height,
  };
  if (pathIntersectsRect(input.points, bounds)) return true;
  if (!input.closedLoop) return false;
  const center = {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  };
  if (pointInPolygon(center, input.points)) return true;
  const corners = [
    { x: bounds.left, y: bounds.top },
    { x: bounds.left + bounds.width, y: bounds.top },
    { x: bounds.left + bounds.width, y: bounds.top + bounds.height },
    { x: bounds.left, y: bounds.top + bounds.height },
  ];
  return corners.some((corner) => pointInPolygon(corner, input.points));
}

export function finiteBridgeInteger(value: unknown): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  return clampBridgeCoordinate(value);
}

export function normalizeAnnotationStyle(input: unknown): PreviewCommentSnapshot['style'] {
  if (!input || typeof input !== 'object') return undefined;
  const raw = input as Record<string, unknown>;
  const style: NonNullable<PreviewCommentSnapshot['style']> = {};
  for (const key of ANNOTATION_STYLE_KEYS) {
    const value = raw[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (trimmed) style[key] = trimmed.slice(0, 120);
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

export function clampBridgeCoordinate(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(-MAX_BRIDGE_COORDINATE, Math.min(MAX_BRIDGE_COORDINATE, Math.round(numeric)));
}

/** Position for the active (in-progress, not-yet-saved) comment pin overlay. */
export function activeCommentPinStyle(
  target: PreviewCommentSnapshot,
  scale: number,
  offset: { x: number; y: number } = { x: 0, y: 0 },
): { left: number; top: number } {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const anchor = target.hoverPoint ?? {
    x: target.position.x,
    y: target.position.y,
  };
  return {
    left: Math.round(offset.x + anchor.x * safeScale),
    top: Math.round(offset.y + anchor.y * safeScale),
  };
}

// ---------------------------------------------------------------------------
// Live-artifact rules. Pure key/summary builders — no DOM, no transport.
// ---------------------------------------------------------------------------

export function exportReadyNudgeKey(projectId: string, fileName: string): string {
  return `${EXPORT_READY_NUDGE_STORAGE_PREFIX}${projectId}:${fileName}`;
}

// Structurally identical to `providers/registry`'s `liveArtifactPreviewUrl`,
// duplicated because it is a pure string builder with no transport/DOM
// dependency, so it belongs in the slice per ADR 0002 (the guard treats any
// `providers/` import as a transport reach regardless of the export's own
// purity).
export function liveArtifactPreviewUrl(
  projectId: string,
  artifactId: string,
  variant: 'rendered' | 'template' | 'rendered-source' = 'rendered',
): string {
  const variantQuery = variant === 'rendered' ? '' : `&variant=${encodeURIComponent(variant)}`;
  return `/api/live-artifacts/${encodeURIComponent(artifactId)}/preview?projectId=${encodeURIComponent(projectId)}${variantQuery}`;
}

export function liveArtifactViewerTabs(
  t: TranslateFn,
): Array<{ id: 'preview' | 'code' | 'data' | 'refresh-history'; label: string }> {
  return [
    { id: 'preview', label: t('liveArtifact.viewer.tabPreview') },
    { id: 'code', label: t('liveArtifact.viewer.tabCode') },
    { id: 'data', label: t('liveArtifact.viewer.tabData') },
    { id: 'refresh-history', label: t('liveArtifact.viewer.tabRefreshHistory') },
  ];
}

export function liveArtifactMetadataPayload(liveArtifact: LiveArtifact): unknown {
  return {
    artifact: {
      id: liveArtifact.id,
      title: liveArtifact.title,
      slug: liveArtifact.slug,
      status: liveArtifact.status,
      pinned: liveArtifact.pinned,
      preview: liveArtifact.preview,
      refreshStatus: liveArtifact.refreshStatus,
      createdAt: liveArtifact.createdAt,
      updatedAt: liveArtifact.updatedAt,
      lastRefreshedAt: liveArtifact.lastRefreshedAt,
    },
    document: liveArtifact.document
      ? {
          format: liveArtifact.document.format,
          templatePath: liveArtifact.document.templatePath,
          generatedPreviewPath: liveArtifact.document.generatedPreviewPath,
          dataPath: liveArtifact.document.dataPath,
          dataSchemaJson: liveArtifact.document.dataSchemaJson,
          sourceJson: liveArtifact.document.sourceJson,
        }
      : null,
  };
}

export function liveArtifactProvenancePayload(liveArtifact: LiveArtifact): unknown {
  return {
    documentSource: liveArtifact.document?.sourceJson ?? null,
  };
}

export function liveArtifactRefreshPayload(liveArtifact: LiveArtifact): unknown {
  return {
    refreshStatus: liveArtifact.refreshStatus,
    lastRefreshedAt: liveArtifact.lastRefreshedAt ?? null,
  };
}

// Capped at 25 entries to keep the session-refresh-events panel lightweight.
const MAX_LIVE_ARTIFACT_REFRESH_EVENTS = 25;

export function appendRefreshEvent(
  prev: LiveArtifactRefreshEvent[],
  next: Omit<LiveArtifactRefreshEvent, 'id' | 'at' | 'durationMs'>,
  nextId: number,
  at: number,
): LiveArtifactRefreshEvent[] {
  const event: LiveArtifactRefreshEvent = { ...next, id: nextId, at };
  if (next.phase !== 'started') {
    // Pair with the most recent 'started' to compute duration.
    for (let i = prev.length - 1; i >= 0; i -= 1) {
      const candidate = prev[i];
      if (candidate && candidate.phase === 'started') {
        event.durationMs = Math.max(0, at - candidate.at);
        break;
      }
    }
  }
  const combined = [...prev, event];
  return combined.length > MAX_LIVE_ARTIFACT_REFRESH_EVENTS
    ? combined.slice(combined.length - MAX_LIVE_ARTIFACT_REFRESH_EVENTS)
    : combined;
}

export function describeRefreshStatus(
  status: LiveArtifact['refreshStatus'],
  t: TranslateFn,
): RefreshStatusDescriptor {
  switch (status) {
    case 'running':
      return {
        label: t('liveArtifact.refresh.statusRunning'),
        tone: 'running',
        description: t('liveArtifact.refresh.statusRunningDescription'),
      };
    case 'succeeded':
      return {
        label: t('liveArtifact.refresh.statusSucceeded'),
        tone: 'success',
        description: t('liveArtifact.refresh.statusSucceededDescription'),
      };
    case 'failed':
      return {
        label: t('liveArtifact.refresh.statusFailed'),
        tone: 'error',
        description: t('liveArtifact.refresh.statusFailedDescription'),
      };
    case 'idle':
      return {
        label: t('liveArtifact.refresh.statusReady'),
        tone: 'neutral',
        description: t('liveArtifact.refresh.statusReadyDescription'),
      };
    case 'never':
    default:
      return {
        label: t('liveArtifact.refresh.statusNever'),
        tone: 'warning',
        description: t('liveArtifact.refresh.statusNeverDescription'),
      };
  }
}

export function describeEventPhase(
  event: LiveArtifactRefreshEvent,
  t: TranslateFn,
): { label: string; tone: 'running' | 'success' | 'error' } {
  if (event.phase === 'started')
    return { label: t('liveArtifact.refresh.eventStarted'), tone: 'running' };
  if (event.phase === 'succeeded')
    return { label: t('liveArtifact.refresh.eventSucceeded'), tone: 'success' };
  return { label: t('liveArtifact.refresh.eventFailed'), tone: 'error' };
}

export function describePersistedStatus(
  status: LiveArtifactRefreshLogEntry['status'],
  t: TranslateFn,
): string {
  switch (status) {
    case 'succeeded':
      return t('liveArtifact.refresh.persistedStatusSucceeded');
    case 'running':
      return t('liveArtifact.refresh.persistedStatusRunning');
    case 'failed':
      return t('liveArtifact.refresh.persistedStatusFailed');
    case 'cancelled':
      return t('liveArtifact.refresh.persistedStatusCancelled');
    case 'skipped':
      return t('liveArtifact.refresh.persistedStatusSkipped');
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function refreshErrorMessage(error: unknown, t: TranslateFn): string {
  if (error instanceof LiveArtifactRefreshFailure && error.status === 0) {
    return t('liveArtifact.refresh.networkFailure');
  }
  if (error instanceof LiveArtifactRefreshFailure && error.code === 'LIVE_ARTIFACT_REFRESH_UNAVAILABLE') {
    return t('liveArtifact.refresh.noSourceTitle');
  }
  if (error instanceof Error && error.message.length > 0) return error.message;
  return t('liveArtifact.refresh.genericFailure');
}

// ---------------------------------------------------------------------------
// File-version-manager rules. Pure label/tracking/preview-option builders for
// the version history modal — no DOM, no transport.
// ---------------------------------------------------------------------------

export function fileVersionSourceLabel(version: ProjectFileVersion, t: TranslateFn): string {
  if (version.source === 'manual') return t('fileViewer.versions.sourceManual');
  if (version.source === 'restore') return t('fileViewer.versions.sourceRestore');
  return t('fileViewer.versions.sourceAi');
}

// Any unknown/legacy source value counts as 'ai', matching the label and
// class-name fallbacks above.
export function fileVersionSourceToTracking(version: ProjectFileVersion): TrackingFileVersionSource {
  if (version.source === 'manual') return 'manual';
  if (version.source === 'restore') return 'restore';
  return 'ai';
}

export function fileVersionPreviewOptions(
  projectId: string,
  fileName: string,
  source: string | null | undefined,
): { deck: boolean; baseHref: string } {
  return {
    deck: sourceLooksLikeExportableDeck(source),
    baseHref: fileRawUrl(projectId, baseDirFor(fileName)),
  };
}

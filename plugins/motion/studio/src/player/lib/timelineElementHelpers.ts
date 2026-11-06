/**
 * Low-level helpers for building and identifying TimelineElement objects.
 *
 * Covers: duration reading, media-element metadata extraction, selector/key/
 * identity builders, and DOM node lookup. These are
 * intentionally dependency-free (no store, no hooks) so they can be used in
 * both the React hook and test environments.
 */

import type { TimelineElement } from "../store/playerStore";
import { readTimelineText } from "./timelineText";
import type { ClipManifestClip } from "./playbackTypes";
import { isFinitePositive } from "./playbackAdapter";
import { getSourceScopedSelectorIndex } from "../../utils/sourceScopedSelectorIndex";
import { HF_AUDIO_GROUP_TAG } from "@hyperframes/core/audio-groups";
import { readElementFades } from "@hyperframes/core/audio-fade";
import { isHtmlElement, isImageElement, isMediaElement } from "@hyperframes/core/runtime/dom-realm";
import { elementVolume } from "./storedVolume";
import {
  type AttrReader,
  clampPlaybackRate,
  readMediaOffsetSeconds,
} from "@hyperframes/parsers/media-duration";

// ---------------------------------------------------------------------------
// Layer-reveal lift transparency
// ---------------------------------------------------------------------------

/**
 * Attributes carrying the pre-lift state of a Layers-panel selection reveal
 * (useLayerRevealOverride): while a layer is selected it PAINTS on top via a
 * temporary inline z-index, but the lift is a purely visual, ephemeral studio
 * affordance — every z reader must keep reporting the element's TRUE z
 * (stored here) so menus, badges, the lane mirror, and the panel sort never
 * reason on the lifted value. A z-reorder commit removes the attributes (the
 * commit is the new truth).
 */
export const LAYER_REVEAL_PRIOR_Z_ATTR = "data-hf-reveal-prior-z";
export const LAYER_REVEAL_PRIOR_POSITION_ATTR = "data-hf-reveal-prior-pos";

/** The lifted element's true (pre-lift) z, or null when no lift is active. */
export function readLayerRevealPriorZ(el: Element): number | null {
  const raw = el.getAttribute(LAYER_REVEAL_PRIOR_Z_ATTR);
  if (raw == null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Duration attribute helpers
// ---------------------------------------------------------------------------

/**
 * Read a host element's effective CSS stacking order for the timeline's reverse
 * z→lane mapping. Prefers the inline `style.zIndex` (what the canvas context
 * menu and LayersPanel z-edits write via handleDomZIndexReorderCommit), falls
 * back to computed style; "auto" / empty / unparseable ⇒ 0. Works with a
 * detached parse Document (no defaultView) as well as a live iframe. Mirrors
 * canvasContextMenuZOrder.parseZIndex semantics so the two directions agree.
 * Reveal-lift transparent: an active lift reports the stored TRUE z.
 */
export function readTimelineElementZIndex(el: Element): number {
  const prior = readLayerRevealPriorZ(el);
  if (prior != null) return prior;
  const html = el as HTMLElement;
  const parseZ = (value: string | null | undefined): number | null => {
    if (value == null || value === "" || value === "auto") return null;
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
  };
  const fromInline = parseZ(html.style?.zIndex);
  if (fromInline != null) return fromInline;
  const view = el.ownerDocument?.defaultView;
  if (view?.getComputedStyle) {
    const fromComputed = parseZ(view.getComputedStyle(html).zIndex);
    if (fromComputed != null) return fromComputed;
  }
  return 0;
}

function readDurationAttribute(el: Element | null | undefined): number {
  if (!el) return 0;
  const duration =
    Number.parseFloat(el.getAttribute("data-duration") ?? "") ||
    Number.parseFloat(el.getAttribute("data-hf-authored-duration") ?? "");
  return isFinitePositive(duration) ? duration : 0;
}

export function isTimelineIgnoredElement(el: Element): boolean {
  // An `<hf-audio-group>` is a mixer bus with no timing of its own, drawn as a group row, never a clip.
  if (el.tagName.toLowerCase() === HF_AUDIO_GROUP_TAG) return true;
  return Boolean(
    el.closest(
      [
        "[data-hyperframes-ignore]",
        "[data-hyperframes-picker-ignore]",
        "[data-hf-ignore]",
        "[data-hf-color-grading-canvas]",
      ].join(","),
    ),
  );
}

/**
 * Furthest clip end (start + RAW `data-duration`) over every non-root clip in the
 * document. Reads the authored attribute, NOT any runtime-computed value — so it
 * is immune to the runtime's clamp that truncates a clip's live duration to the
 * composition length. This is the source of truth for content-driven duration:
 * computing it from the store instead would feed the truncated value back in and
 * make the composition length ratchet down (research HANDOFF-3 §6.1 feedback loop).
 */
export function furthestClipEndFromDocument(doc: Document | null | undefined): number {
  if (!doc) return 0;
  const root = doc.querySelector("[data-composition-id]");
  let maxEnd = 0;
  for (const node of Array.from(doc.querySelectorAll("[data-start]"))) {
    if (node === root || isTimelineIgnoredElement(node)) continue;
    const start = Number.parseFloat(node.getAttribute("data-start") ?? "");
    const duration = readDurationAttribute(node);
    if (!Number.isFinite(start) || start < 0 || duration <= 0) continue;
    maxEnd = Math.max(maxEnd, start + duration);
  }
  return maxEnd;
}

export function readTimelineDurationFromDocument(doc: Document | null | undefined): number {
  if (!doc) return 0;
  const rootDuration = readDurationAttribute(doc.querySelector("[data-composition-id]"));
  if (rootDuration > 0) return rootDuration;
  return furthestClipEndFromDocument(doc);
}

// ---------------------------------------------------------------------------
// DOM element type guards
// ---------------------------------------------------------------------------

function isCompositionHost(el: Element): boolean {
  return (
    el.hasAttribute("data-composition-id") ||
    el.hasAttribute("data-composition-src") ||
    el.hasAttribute("data-composition-file")
  );
}

export function resolveMediaElement(el: Element): HTMLMediaElement | HTMLImageElement | null {
  if (isMediaElement(el) || isImageElement(el)) return el;
  // A composition's media belongs to its own timeline, not the clip's: its length would cap a trim.
  if (isCompositionHost(el)) return null;
  const candidate = el.querySelector("video, audio, img");
  return isMediaElement(candidate) || isImageElement(candidate) ? candidate : null;
}

/** The in-point as playback reads it, and the attribute holding it; empty when neither is authored. */
export function readPlaybackStartAttributes(
  getAttr: AttrReader,
): Pick<TimelineElement, "playbackStart" | "playbackStartAttr"> {
  const playbackStartAttr =
    getAttr("data-playback-start") != null
      ? "playback-start"
      : getAttr("data-media-start") != null
        ? "media-start"
        : undefined;
  return playbackStartAttr
    ? { playbackStart: readMediaOffsetSeconds(getAttr), playbackStartAttr }
    : {};
}

export function playbackStartAttributeForElement(
  element: Pick<TimelineElement, "kind" | "playbackStartAttr">,
): "data-media-start" | "data-playback-start" {
  return element.playbackStartAttr === "playback-start" || element.kind === "composition"
    ? "data-playback-start"
    : "data-media-start";
}

function applyPlaybackMetadataFromElement(entry: TimelineElement, el: Element): void {
  Object.assign(
    entry,
    readPlaybackStartAttributes((n) => el.getAttribute(n)),
  );

  const authoredPlaybackRate = Number.parseFloat(el.getAttribute("data-playback-rate") ?? "");
  if (Number.isFinite(authoredPlaybackRate) && authoredPlaybackRate > 0) {
    entry.playbackRate = clampPlaybackRate(authoredPlaybackRate);
  }
}

/** Sets or clears an optional field, so a re-parse after the attribute is removed drops it. */
function setOptional<K extends keyof TimelineElement>(
  entry: TimelineElement,
  key: K,
  value: TimelineElement[K] | undefined,
): void {
  if (value === undefined) delete entry[key];
  else entry[key] = value;
}

/** The compiler's rule (timingCompiler): explicit data-has-audio wins; otherwise an unmuted <video> is audible. */
export function isVideoAudible(opts: {
  tag: string;
  hasAudioAttr: string | null | undefined;
  muted: boolean;
}): boolean {
  if (opts.hasAudioAttr === "true") return true;
  if (opts.hasAudioAttr === "false" || opts.hasAudioAttr === "") return false;
  return opts.tag.toLowerCase() === "video" && !opts.muted;
}

export function isAudibleVideoNode(el: Element): boolean {
  if (el.tagName.toLowerCase() !== "video" || el.hasAttribute("muted")) return false;
  return isVideoAudible({
    tag: "video",
    hasAudioAttr: el.getAttribute("data-has-audio"),
    muted: false,
  });
}

/** What the mixer gets: the compiler's `data-has-audio` rule, muted and volume. */
function applyAudioMetadataFromElement(entry: TimelineElement, el: Element): void {
  const media = resolveMediaElement(el) ?? el;
  const muted = el.hasAttribute("muted") || media.hasAttribute("muted");
  const sound = isVideoAudible({
    tag: el.tagName,
    hasAudioAttr: el.getAttribute("data-has-audio"),
    muted,
  });
  setOptional(entry, "hasAudio", sound ? true : undefined);
  setOptional(entry, "muted", muted ? true : undefined);
  setOptional(entry, "volume", elementVolume(el, media));
}

function applyFadeMetadataFromElement(entry: TimelineElement, el: Element): void {
  const fades = readElementFades(el);
  setOptional(entry, "fadeIn", fades.fadeIn > 0 ? fades.fadeIn : undefined);
  setOptional(entry, "fadeOut", fades.fadeOut > 0 ? fades.fadeOut : undefined);
}

export function applyMediaMetadataFromElement(entry: TimelineElement, el: Element): void {
  setOptional(entry, "text", readTimelineText(el));
  applyPlaybackMetadataFromElement(entry, el);
  applyAudioMetadataFromElement(entry, el);
  applyFadeMetadataFromElement(entry, el);

  const mediaEl = resolveMediaElement(el);
  if (!mediaEl) return;

  entry.tag = mediaEl.tagName.toLowerCase();
  const src = mediaEl.getAttribute("src");
  if (src) entry.src = src;

  if (!isMediaElement(mediaEl)) return;

  const sourceDurationAttr =
    el.getAttribute("data-source-duration") ?? mediaEl.getAttribute("data-source-duration");
  const sourceDuration = sourceDurationAttr ? parseFloat(sourceDurationAttr) : mediaEl.duration;
  if (Number.isFinite(sourceDuration) && sourceDuration > 0) {
    entry.sourceDuration = sourceDuration;
  }

  const playbackRate = mediaEl.defaultPlaybackRate;
  if (entry.playbackRate == null && Number.isFinite(playbackRate) && playbackRate > 0) {
    entry.playbackRate = clampPlaybackRate(playbackRate);
  }
}

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

export function getTimelineElementDisplayLabel(input: {
  id?: string | null;
  label?: string | null;
  tag?: string | null;
}): string {
  const label = input.label?.trim();
  if (label) return label;
  const id = input.id?.trim();
  if (id) return id;
  const tag = input.tag?.trim().toLowerCase();
  return tag ? `${tag} clip` : "Timeline clip";
}

// ---------------------------------------------------------------------------
// Selector / identity / key builders
// ---------------------------------------------------------------------------

export function getTimelineElementSelector(el: Element): string | undefined {
  if (isHtmlElement(el) && el.id) return `#${CSS.escape(el.id)}`;
  const compId = el.getAttribute("data-composition-id");
  if (compId) return `[data-composition-id="${CSS.escape(compId)}"]`;
  if (isHtmlElement(el)) {
    const classes = el.className.split(/\s+/).filter(Boolean);
    const firstClass = classes.find((className) => className !== "clip") ?? classes[0];
    if (firstClass) return `.${CSS.escape(firstClass)}`;
  }
  return undefined;
}

export function getTimelineElementSourceFile(el: Element): string | undefined {
  const ownerRoot = el.parentElement?.closest("[data-composition-id]");
  return (
    ownerRoot?.getAttribute("data-composition-file") ??
    ownerRoot?.getAttribute("data-composition-src") ??
    undefined
  );
}

export function getTimelineElementSelectorIndex(
  doc: Document,
  el: Element,
  selector: string | undefined,
): number | undefined {
  return getSourceScopedSelectorIndex(
    doc,
    el,
    selector,
    getTimelineElementSourceFile(el),
    getTimelineElementSourceFile,
  );
}

export function buildTimelineElementKey(params: {
  id: string;
  fallbackIndex: number;
  domId?: string;
  selector?: string;
  selectorIndex?: number;
  sourceFile?: string;
}): string {
  const scope = params.sourceFile ?? "index.html";
  if (params.domId) return `${scope}#${params.domId}`;
  if (params.selector) return `${scope}:${params.selector}:${params.selectorIndex ?? 0}`;
  return `${scope}:${params.id}:${params.fallbackIndex}`;
}

/**
 * Inverse of {@link buildTimelineElementKey} for the `sourceFile#domId` form.
 * A key with no `#` is a bare dom id and carries no source file of its own, so
 * the caller supplies the scope it wants to look that id up in.
 */
export function splitTimelineElementKey(key: string): {
  sourceFile: string | null;
  domId: string;
} {
  const hashIndex = key.lastIndexOf("#");
  if (hashIndex < 0) return { sourceFile: null, domId: key };
  return { sourceFile: key.slice(0, hashIndex), domId: key.slice(hashIndex + 1) };
}

export function buildTimelineElementIdentity(params: {
  preferredId?: string | null;
  label: string;
  fallbackIndex: number;
  domId?: string;
  selector?: string;
  selectorIndex?: number;
  sourceFile?: string;
}): { id: string; key: string } {
  const id =
    params.preferredId?.trim() ||
    buildTimelineElementKey({
      id: params.label,
      fallbackIndex: params.fallbackIndex,
      domId: params.domId,
      selector: params.selector,
      selectorIndex: params.selectorIndex,
      sourceFile: params.sourceFile,
    });
  const key = buildTimelineElementKey({
    id,
    fallbackIndex: params.fallbackIndex,
    domId: params.domId,
    selector: params.selector,
    selectorIndex: params.selectorIndex,
    sourceFile: params.sourceFile,
  });
  return { id, key };
}

export function getTimelineElementIdentity(element: { key?: string | null; id: string }): string {
  return element.key ?? element.id;
}

/**
 * The id space the RUNTIME matches on — a bare DOM id, never a store key.
 *
 * Studio addresses rows by `buildTimelineElementKey`'s composite
 * `<sourceFile>#<domId>`, but everything audio in `@hyperframes/core` keys off
 * the live document: `resolveAudioGroups` collects `member.id`,
 * `resolveCarveSourceIds` goes through `getElementById`. Anything crossing into
 * that space — a group membership list, a carve source — has to be
 * converted here first; a composite key silently matches nothing.
 *
 * `null` for a row with no DOM id at all (selector-addressed elements): such an
 * element cannot be grouped, because `resolveAudioGroups` skips
 * members without an `id` and would build a group that is half there.
 */
export function runtimeAudioId(element: { domId?: string | null }): string | null {
  return element.domId || null;
}

/**
 * Timeline store key for a z-reorder entry built OUTSIDE the timeline
 * expansion (canvas context menu / LayersPanel), so the reorder commit can
 * update the store's zIndex synchronously. Matches buildTimelineElementKey's
 * stable branches (`sourceFile#domId`, else the selector-based key). Undefined
 * when the element has neither a DOM id nor a selector — the timeline's
 * fallback branch needs its own fallbackIndex, which these callers don't have,
 * so such an entry simply skips the synchronous store update.
 */
export function deriveTimelineStoreKey(params: {
  domId?: string;
  selector?: string;
  selectorIndex?: number;
  sourceFile?: string;
}): string | undefined {
  if (!params.domId && !params.selector) return undefined;
  return buildTimelineElementKey({ id: "", fallbackIndex: 0, ...params });
}

/**
 * {@link deriveTimelineStoreKey} for a caller that already has a DOM id in
 * hand (e.g. one it just minted), so the undefined branch never applies.
 */
export function deriveTimelineStoreKeyForDomId(domId: string, sourceFile?: string): string {
  return deriveTimelineStoreKey({ domId, sourceFile })!;
}

// ---------------------------------------------------------------------------
// DOM node querying
// ---------------------------------------------------------------------------

function getTimelineDomNodes(doc: Document): Element[] {
  const rootComp = doc.querySelector("[data-composition-id]");
  return Array.from(doc.querySelectorAll("[data-start]")).filter(
    (node) => node !== rootComp && !isTimelineIgnoredElement(node),
  );
}

function numbersNearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001;
}

const MANIFEST_CLIP_ATTRS: ReadonlyArray<[string, (clip: ClipManifestClip) => number]> = [
  ["data-start", (clip) => clip.start],
  ["data-duration", (clip) => clip.duration],
  ["data-track-index", (clip) => clip.track],
];

function nodeMatchesClipTag(node: Element, clip: ClipManifestClip): boolean {
  return !clip.tagName || node.tagName.toLowerCase() === clip.tagName.toLowerCase();
}

function nodeMatchesManifestClip(node: Element, clip: ClipManifestClip): boolean {
  if (!nodeMatchesClipTag(node, clip)) return false;
  // An attribute only constrains the match when it parses to a finite number:
  // missing or garbled reads as "unknown", not "mismatch".
  return MANIFEST_CLIP_ATTRS.every(([attr, expected]) => {
    const actual = Number.parseFloat(node.getAttribute(attr) ?? "");
    return !Number.isFinite(actual) || numbersNearlyEqual(actual, expected(clip));
  });
}

/** Whether `node` sits in the composition the clip was read from, the chain the runtime records outermost first
 * (`resolveNearestCompositionContext` in core's runtime/timeline.ts). A clip without that scope accepts any node. */
function nodeInClipScope(node: Element, clip: ClipManifestClip): boolean {
  const scope = clip.compositionAncestors;
  if (!scope) return true;
  const ids: string[] = [];
  for (let cursor = node.parentElement; cursor; cursor = cursor.parentElement) {
    const id = cursor.getAttribute("data-composition-id");
    if (id) ids.unshift(id);
  }
  return ids.length === scope.length && ids.every((id, index) => id === scope[index]);
}

/** The first match in the clip's composition across `selectors`; a lone match stands only when none is in scope, as a
 * healed host can stale the clip's chain for a pass. An id can repeat in a sub-composition earlier in the document. */
function findInClipScope(
  doc: Document,
  clip: ClipManifestClip,
  selectors: string[],
): Element | null {
  let lone: Element | null = null;
  for (const selector of selectors) {
    const nodes = Array.from(doc.querySelectorAll(selector));
    const scoped = nodes.find((node) => nodeInClipScope(node, clip));
    if (scoped) return scoped;
    if (nodes.length === 1) lone ??= nodes[0];
  }
  return lone;
}

export type PreviewTarget = Pick<TimelineElement, "hfId" | "domId" | "id" | "sourceFile">;

/** Finds a row's preview element by `data-hf-id`, then id, preferring one in the row's own file: both repeat across
 * files. Indexes the document once, so a pass over every row costs one scan. */
export function previewElementFinder(
  doc: Document,
  selector = "[data-hf-id], [id]",
): (target: PreviewTarget) => Element | null {
  const byKey = new Map<string, Element[]>();
  const add = (key: string, node: Element) => {
    const nodes = byKey.get(key);
    if (nodes) nodes.push(node);
    else byKey.set(key, [node]);
  };
  for (const node of doc.querySelectorAll(selector)) {
    const hfId = node.getAttribute("data-hf-id");
    const id = node.getAttribute("id");
    if (hfId) add(`hf:${hfId}`, node);
    if (id) add(`id:${id}`, node);
  }
  return (target) => {
    const matches = [
      ...((target.hfId && byKey.get(`hf:${target.hfId}`)) || []),
      ...(byKey.get(`id:${target.domId ?? target.id}`) ?? []),
    ];
    return (
      matches.find((node) => getTimelineElementSourceFile(node) === target.sourceFile) ??
      matches[0] ??
      null
    );
  };
}

export function findClipElementById(doc: Document, clip: ClipManifestClip): Element | null {
  if (!clip.id) return null;
  const first = doc.getElementById(clip.id);
  if (!first || nodeInClipScope(first, clip)) return first;
  return findInClipScope(doc, clip, [`[id="${CSS.escape(clip.id)}"]`]);
}

function findTimelineDomNode(doc: Document, clip: ClipManifestClip): Element | null {
  if (!clip.id) return null;
  const first = doc.getElementById(clip.id);
  if (first && nodeInClipScope(first, clip)) return first;
  const id = CSS.escape(clip.id);
  const byOtherKeys = [`[data-hf-id="${id}"]`, `[data-composition-id="${id}"]`, `.${id}`];
  return findInClipScope(doc, clip, first ? [`[id="${id}"]`, ...byOtherKeys] : byOtherKeys);
}

export function findTimelineDomNodeForClip(
  doc: Document,
  clip: ClipManifestClip,
  fallbackIndex: number,
  usedNodes = new Set<Element>(),
  getCandidates = () => getTimelineDomNodes(doc),
): Element | null {
  const byIdentity = findTimelineDomNode(doc, clip);
  if (byIdentity && !usedNodes.has(byIdentity) && nodeMatchesClipTag(byIdentity, clip))
    return byIdentity;

  const candidates = getCandidates().filter((node) => !usedNodes.has(node));
  const exact = candidates.find((node) => nodeMatchesManifestClip(node, clip));
  if (exact) return exact;

  const positional = candidates[fallbackIndex];
  return positional && nodeMatchesClipTag(positional, clip) ? positional : null;
}

/** One synchronous hydration pass: snapshot only on a miss, never across reloads. */
export function createTimelineDomNodeResolver(doc: Document) {
  let candidates: Element[] | undefined;
  const usedNodes = new Set<Element>();
  const getCandidates = () => (candidates ??= getTimelineDomNodes(doc));
  return (clip: ClipManifestClip, index: number): Element | null => {
    const node = findTimelineDomNodeForClip(doc, clip, index, usedNodes, getCandidates);
    if (node) usedNodes.add(node);
    return node;
  };
}

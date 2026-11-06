/**
 * The pure half of the timeline's preview sync: reading a runtime clip manifest
 * and a live preview DOM into `TimelineElement`s, and the steps that hydrate a
 * freshly-loaded adapter.
 *
 * Split out of `useTimelineSyncCallbacks.ts`, which held all of this inline
 * inside `processTimelineMessage` and `initializeAdapter` and stood at 642 lines
 * against the studio's 600-line cap. Every function here takes what it needs as
 * an argument, so each is callable — and readable — on its own.
 */

import { withSelectorIndexPass } from "../../utils/sourceScopedSelectorIndex";
import { createTimelineDomNodeResolver, findClipElementById } from "../lib/timelineElementHelpers";
import { usePlayerStore } from "../store/playerStore";
import type { TimelineElement, DomClipChild, SubCompositionHostState } from "../store/playerStore";
import { resolveCssStackingContextId } from "@hyperframes/core/runtime/stacking-context";
import { LOOP_INFLATED_TIMELINE_SECONDS } from "@hyperframes/core/runtime/composition-length";
import type { ClipTree } from "@hyperframes/core/runtime/clipTree";
import { HF_AUDIO_GROUP_ATTR } from "@hyperframes/core/audio-groups";
import { groupInfoFor } from "../lib/timelineGroupInfo";
import type { PlaybackAdapter, ClipManifestClip, IframeWindow } from "../lib/playbackTypes";
import {
  buildStandaloneRootTimelineElement,
  createTimelineElementFromManifestClip,
  getTimelineElementSelector,
  parseTimelineFromDOM,
} from "../lib/timelineDOM";
import {
  autoHealMissingCompositionIds,
  normalizePreviewViewport,
} from "../lib/timelineIframeHelpers";
import { inspectStudioRuntimeMessage } from "../lib/runtimeProtocol";

/** Reject non-finite, non-positive, and absurdly large (loop-inflated) values. */
export function sanitizeDurationSeconds(value: number): number {
  return Number.isFinite(value) && value > 0 && value < LOOP_INFLATED_TIMELINE_SECONDS ? value : 0;
}

/**
 * A sub-comp child's audio-group membership, read off its live element.
 *
 * Captured during the DOM walk because that walk holds the only reference to
 * the element. A sub-composition that declares both a group and its members
 * keeps those members out of the flat store entirely, so an expanded child has
 * no flat twin to inherit membership from later — without this, a group defined
 * inside a sub-composition produced no group row at all.
 */
function readChildAudioGroupState(child: Element): Partial<DomClipChild> {
  const audioGroup = child.getAttribute(HF_AUDIO_GROUP_ATTR);
  if (!audioGroup) return {};
  const info = groupInfoFor(child.ownerDocument, audioGroup);
  return {
    audioGroup,
    audioGroupLabel: info.label,
    audioGroupVolume: info.volume,
    audioGroupHidden: info.hidden,
    ...(info.fxChain ? { audioGroupFxChain: info.fxChain } : {}),
    ...(info.automation ? { audioGroupAutomation: info.automation } : {}),
  };
}

/**
 * The runtime's clip tree as a child-id -> parent-id map.
 *
 * Empty when the tree is absent (cross-origin, or the runtime has not published
 * it yet), which the caller treats the same as "no nesting".
 */
export function clipTreeParentMap(win: Window | null): Map<string, string> {
  const parentMap = new Map<string, string>();
  const clipTree = (win as (Window & { __clipTree?: ClipTree }) | null)?.__clipTree;
  if (!clipTree) return parentMap;
  const walk = (nodes: ClipTree["roots"]) => {
    for (const node of nodes) {
      if (node.id && node.parentId) parentMap.set(node.id, node.parentId);
      if (node.children.length > 0) walk(node.children);
    }
  };
  walk(clipTree.roots);
  return parentMap;
}

/**
 * One sub-composition host's id'd descendants, as timeline-expandable rows.
 *
 * Descends through id-less structural wrappers (the inlined sub-comp body) and
 * one level into groups for drill-in. Also records each child's parent in
 * `parentMap`, which it mutates: the walk is the only place both ends of the
 * link are in hand.
 */
function collectHostDomChildren(
  hostId: string,
  parentEl: Element,
  parentId: string,
  parentMap: Map<string, string>,
  out: DomClipChild[],
): void {
  for (const child of Array.from(parentEl.children)) {
    if (!child.id) {
      collectHostDomChildren(hostId, child, parentId, parentMap, out); // id-less wrapper
      continue;
    }
    const isGroup = child.hasAttribute("data-hf-group");
    out.push({
      id: child.id,
      parentId,
      hostId,
      label: isGroup ? child.getAttribute("data-hf-group") || child.id : child.id,
      stackingContextId: resolveCssStackingContextId(child),
      ...readChildAudioGroupState(child),
    });
    parentMap.set(child.id, parentId);
    if (isGroup) collectHostDomChildren(hostId, child, child.id, parentMap, out);
  }
}

type SceneMarkupWindow = Window & {
  __hfParkedSceneMarkup?: (placeholder: Element) => Element | null;
};

/** A clip's host; for a scene the preview unmounted, the markup it mounts with. */
function clipHostOf(iframeDoc: Document, clip: ClipManifestClip): Element | null {
  const host = findClipElementById(iframeDoc, clip);
  const view = iframeDoc.defaultView as SceneMarkupWindow | null;
  return (host && view?.__hfParkedSceneMarkup?.(host)) ?? host;
}

/**
 * Every sub-composition's internal elements, across the whole manifest.
 *
 * Those elements (group wrappers + their children) carry no `data-start`, so the
 * clip tree and the manifest never enumerate them. Surfacing them studio-side
 * as DOM children + parent links is what lets the timeline expand a
 * sub-comp/group row; the manifest stays lean (timed clips only).
 */
export function collectSubCompositionDomChildren(
  iframeDoc: Document | null,
  clips: readonly ClipManifestClip[],
  parentMap: Map<string, string>,
): DomClipChild[] {
  const out: DomClipChild[] = [];
  if (!iframeDoc) return out;
  for (const clip of clips) {
    if (clip.kind !== "composition" || !clip.id) continue;
    const hostEl = clipHostOf(iframeDoc, clip);
    if (!hostEl) continue;
    const innerRoot = hostEl.querySelector("[data-hf-inner-root]") ?? hostEl;
    collectHostDomChildren(clip.id, innerRoot, clip.id, parentMap, out);
  }
  return out;
}

/** The host-element `data-*` state one element carries, or null when it has none. */
function readSubCompositionHostState(el: Element): SubCompositionHostState | null {
  const state: SubCompositionHostState = {};
  if (el.hasAttribute("data-hidden")) state.hidden = true;
  if (el.hasAttribute("data-timeline-locked")) state.timelineLocked = true;
  const timelineRole = el.getAttribute("data-timeline-role");
  if (timelineRole) state.timelineRole = timelineRole;
  const fxChain = el.getAttribute("data-fx-chain");
  if (fxChain) state.fxChain = fxChain;
  const automation = el.getAttribute("data-automation");
  if (automation) state.automation = automation;
  return Object.keys(state).length > 0 ? state : null;
}

/**
 * Host-element state for every id'd element inside every sub-composition.
 *
 * This walk exists because nothing else in the pipeline can see these
 * attributes. A clip whose parent composition is itself in the manifest is
 * filtered out before the flat store is built, so an expanded child has no twin
 * to inherit from, and the manifest carries timing rather than attributes.
 *
 * Deliberately separate from {@link collectSubCompositionDomChildren}: that walk
 * defines which rows exist and writes `parentMap`, and it stops at the first
 * id'd descendant. Scene footage commonly sits one level below an id'd region
 * wrapper, so it is never reached there. This one descends the whole subtree and
 * touches neither rows nor parentage.
 */
export function collectSubCompositionHostState(
  iframeDoc: Document | null,
  clips: readonly ClipManifestClip[],
): Map<string, SubCompositionHostState> {
  const out = new Map<string, SubCompositionHostState>();
  if (!iframeDoc) return out;
  for (const clip of clips) {
    if (clip.kind !== "composition" || !clip.id) continue;
    const hostEl = clipHostOf(iframeDoc, clip);
    if (!hostEl) continue;
    for (const el of Array.from(hostEl.querySelectorAll("[id]"))) {
      const state = readSubCompositionHostState(el);
      if (state) out.set(el.id, state);
    }
  }
  return out;
}

/** An iframe's document, or null when reading it throws (cross-origin, or the
 *  frame is mid-navigation). */
export function safeContentDocument(iframe: HTMLIFrameElement | null): Document | null {
  try {
    return iframe?.contentDocument ?? null;
  } catch {
    return null;
  }
}

/**
 * The manifest's root clips as TimelineElements, each bound to the live DOM node
 * it was authored as. The pass-scoped resolver makes the binding one-to-one: two clips with
 * the same shape must not both claim the same element.
 */
export function buildTimelineElementsFromClips(
  clips: readonly ClipManifestClip[],
  iframeDoc: Document | null,
): TimelineElement[] {
  const resolveHost = iframeDoc ? createTimelineDomNodeResolver(iframeDoc) : null;
  const build = () =>
    clips.map((clip, index) => {
      const hostEl = resolveHost?.(clip, index) ?? null;
      return createTimelineElementFromManifestClip({
        clip,
        fallbackIndex: index,
        doc: iframeDoc,
        hostEl,
      });
    });
  return iframeDoc ? withSelectorIndexPass(iframeDoc, build) : build();
}

/**
 * Drop elements that start past the composition's end and trim the ones that
 * straddle it. A non-positive duration means "not known yet" — pass through
 * untouched rather than clamping everything to nothing.
 */
/** Commits the manifest elements, including none. An empty manifest carries a 1s floor, not a duration. */
export function syncManifestTimeline(
  els: readonly TimelineElement[],
  manifestDuration: number,
  storeDuration: number,
  sync: (els: TimelineElement[], duration?: number) => void,
): void {
  const hasDuration = manifestDuration > 0 && els.length > 0;
  sync(
    clampElementsToDuration(els, hasDuration ? manifestDuration : storeDuration),
    hasDuration ? manifestDuration : undefined,
  );
}

function clampElementsToDuration(
  els: readonly TimelineElement[],
  effectiveDuration: number,
): TimelineElement[] {
  if (effectiveDuration <= 0) return [...els];
  return els
    .filter((element) => element.start < effectiveDuration)
    .map((element) => ({
      ...element,
      duration: Math.min(element.duration, effectiveDuration - element.start),
    }))
    .filter((element) => element.duration > 0);
}

/**
 * Seek a freshly-loaded adapter to the playhead the session should resume at,
 * and return it.
 *
 * Honors a seek requested before the adapter was ready. It may sit in either
 * place: `pendingSeekRef` if the store subscription was mounted when requestSeek
 * fired, or only in the store's `requestedSeekTime` if it fired earlier still
 * (deep-link hydration runs before the player subscription mounts, so the
 * request never reaches pendingSeekRef). Reconciling with the store here is what
 * makes a deep-linked `?t=` land instead of starting at 0.
 *
 * The double seek forces a REAL render, not a no-op. After a post-edit reload the
 * freshly rebuilt GSAP timeline can already report being at `startTime`
 * internally (the reload restores the same playhead), so a single
 * `adapter.seek(startTime)` is a GSAP no-op — `tl.seek(t)` at the current time
 * doesn't re-evaluate. That's why a just-dropped clip stayed invisible until the
 * user nudged the playhead: its element's state was never applied at the restore
 * position. Seeking to a DIFFERENT guard value first (a hair off, or 0 when
 * startTime is already ~0) guarantees the follow-up seek crosses a time boundary
 * and re-renders every clip — including the new one.
 */
export function resolveReloadSeekTime(input: {
  pendingSeek: number | null;
  requestedSeek: number | null;
  storeCurrentTime: number;
  duration: number;
}): number {
  const target = input.pendingSeek ?? input.requestedSeek ?? input.storeCurrentTime;
  if (!Number.isFinite(target) || target <= 0) return 0;
  // Only clamp to duration when it's a usable positive number. A non-finite or
  // non-positive duration (e.g. the adapter reports NaN mid-reload) would turn
  // Math.min(target, NaN) into NaN and seek(NaN); return the guarded target
  // unclamped instead so the playhead lands at the intended position.
  if (!Number.isFinite(input.duration) || input.duration <= 0) return target;
  return Math.min(target, input.duration);
}

type SeekablePreview = Pick<PlaybackAdapter, "seek">;

/** Re-run the current frame even when the runtime already reports that time. */
export function reseekPreviewAtTime(preview: SeekablePreview, time: number): void {
  const target = Number.isFinite(time) && time > 0 ? time : 0;
  preview.seek(target > 0.001 ? Math.max(0, target - 0.001) : 0.001);
  preview.seek(target);
}

export function seekAdapterToRestorePoint(
  adapter: PlaybackAdapter,
  pendingSeekRef: { current: number | null },
): number {
  const storeSeek = usePlayerStore.getState().requestedSeekTime;
  const startTime = resolveReloadSeekTime({
    pendingSeek: pendingSeekRef.current,
    requestedSeek: storeSeek,
    storeCurrentTime: usePlayerStore.getState().currentTime,
    duration: adapter.getDuration(),
  });
  pendingSeekRef.current = null;
  if (storeSeek != null) usePlayerStore.getState().clearSeekRequest();
  reseekPreviewAtTime(adapter, startTime);
  return startTime;
}

/** Push the adapter's own duration into the store, ignoring the values
 *  `sanitizeDurationSeconds` rejects and a value already in place. */
export function syncAdapterDuration(
  adapter: PlaybackAdapter,
  setDuration: (d: number) => void,
): void {
  const adapterDur = sanitizeDurationSeconds(adapter.getDuration());
  if (adapterDur > 0 && adapterDur !== usePlayerStore.getState().duration) {
    setDuration(adapterDur);
  }
}

/**
 * Last-resort timeline for a preview whose manifest produced nothing: parse the
 * DOM, and failing that stand the root composition up as a single element.
 * Without it a composition the runtime never enumerated shows an empty timeline
 * rather than one row spanning its own duration.
 */
function syncFallbackTimelineFromDom(
  doc: Document,
  iframe: HTMLIFrameElement | null,
  rootDuration: number,
  syncTimelineElements: (els: TimelineElement[], duration?: number) => void,
): void {
  const els = parseTimelineFromDOM(doc, rootDuration);
  if (els.length > 0) {
    syncTimelineElements(els);
    return;
  }
  const rootComp = doc.querySelector("[data-composition-id]");
  if (!rootComp || rootDuration <= 0) return;
  const fallbackElement = buildStandaloneRootTimelineElement({
    compositionId: rootComp.getAttribute("data-composition-id") || "composition",
    tagName: (rootComp as HTMLElement).tagName || "div",
    rootDuration,
    iframeSrc: iframe?.src || "",
    selector: getTimelineElementSelector(rootComp),
  });
  if (fallbackElement) syncTimelineElements([fallbackElement]);
}

/** The runtime's timeline message, as the preview posts it. */
export interface RuntimeTimelineMessage {
  clips: ClipManifestClip[];
  durationInFrames: number;
  scenes?: Array<{ id: string; label: string; start: number; duration: number }>;
  protocolVersion?: unknown;
  capabilities?: unknown;
  fps?: unknown;
}

/** Whether a window message came from the preview iframe we are watching.
 *  A message with no `source` (jsdom, synthetic dispatch) is not rejected. */
function isFromPreviewFrame(e: MessageEvent, iframe: HTMLIFrameElement | null): boolean {
  if (!e.source || !iframe) return true;
  return e.source === iframe.contentWindow;
}

/**
 * Whether a message is a preview readiness signal this listener should act on.
 *
 * The main message handler owns protocol-error diagnostics. This readiness-only
 * listener mirrors its acceptance gate without dispatching a duplicate event: an
 * unsupported runtime must not make the iframe appear successfully settled.
 */
export function isPreviewReadinessMessage(
  e: MessageEvent,
  iframe: HTMLIFrameElement | null,
): boolean {
  if (!isFromPreviewFrame(e, iframe)) return false;
  const data = e.data;
  if (data?.source !== "hf-preview") return false;
  if (data?.type !== "state" && data?.type !== "timeline") return false;
  return inspectStudioRuntimeMessage(data).status !== "unsupported";
}

export interface HydrateTimelineFromPreviewInput {
  iframe: HTMLIFrameElement | null;
  adapter: PlaybackAdapter;
  processTimelineMessage: (manifest: RuntimeTimelineMessage) => void;
  enrichMissingCompositions: () => void;
  applyPreviewAudioState: () => void;
  attachIframeShortcutListeners: () => void;
  syncTimelineElements: (els: TimelineElement[], duration?: number) => void;
}

/**
 * Everything the timeline reads off a newly-loaded preview: viewport
 * normalisation, the runtime's own clip manifest, composition enrichment, audio
 * state, and the DOM fallbacks when none of that produced a row.
 *
 * Wrapped in one try, as it always was: any of these can throw on a
 * cross-origin or mid-navigation frame, and none of them is worth failing the
 * adapter's initialisation over.
 */
function normalizePreviewDom(
  doc: Document | null,
  iframeWin: IframeWindow | null,
  attachIframeShortcutListeners: () => void,
): void {
  if (!doc || !iframeWin) return;
  normalizePreviewViewport(doc, iframeWin);
  autoHealMissingCompositionIds(doc);
  attachIframeShortcutListeners();
}

/** Hand the runtime's own clip manifest to the timeline, if it published one. */
function applyRuntimeClipManifest(
  iframeWin: IframeWindow | null,
  processTimelineMessage: (manifest: RuntimeTimelineMessage) => void,
): void {
  const manifest = iframeWin?.__clipManifest;
  if (manifest && manifest.clips.length > 0) processTimelineMessage(manifest);
}

export function hydrateTimelineFromPreview(input: HydrateTimelineFromPreviewInput): void {
  const { iframe, adapter, syncTimelineElements } = input;
  try {
    const doc = safeContentDocument(iframe);
    const iframeWin = (iframe?.contentWindow as IframeWindow | null) ?? null;
    normalizePreviewDom(doc, iframeWin, input.attachIframeShortcutListeners);
    applyRuntimeClipManifest(iframeWin, input.processTimelineMessage);
    input.enrichMissingCompositions();
    input.applyPreviewAudioState();
    if (doc && usePlayerStore.getState().elements.length === 0) {
      syncFallbackTimelineFromDom(doc, iframe, adapter.getDuration(), syncTimelineElements);
    }
  } catch {
    // Cross-origin or mid-navigation preview — the adapter is still initialised.
  }
}

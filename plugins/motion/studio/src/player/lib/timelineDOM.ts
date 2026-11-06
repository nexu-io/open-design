/**
 * Higher-level timeline DOM operations: element factories, DOM-to-element
 * parsing, timeline merging, and standalone composition helpers.
 *
 * Preview iframe utilities (normaliseViewport, autoHeal, audio controls, resolveIframe,
 * buildMissingCompositionElements) live in timelineIframeHelpers.ts.
 *
 * Pure functions (no React, no store reads) — testable in isolation.
 */

import type { TimelineElement } from "../store/playerStore";
import type { ClipManifestClip, IframeWindow, TimelineLike } from "./playbackTypes";
import { withSelectorIndexPass } from "../../utils/sourceScopedSelectorIndex";
import { resolveCssStackingContextId } from "@hyperframes/core/runtime/stacking-context";
import { readClipTiming } from "@hyperframes/core/composition-contract";
import { readMasterFxChain } from "@hyperframes/core/audio-groups";
import { linkScopeOf } from "@hyperframes/core/media-link";
import { createRuntimeStartTimeResolver } from "@hyperframes/core/runtime/start-resolver";
import { groupInfoFor } from "./timelineGroupInfo";
import { transitionLabelsForDocument } from "./timelineTransitionMetadata";
import {
  resolveMediaElement,
  applyMediaMetadataFromElement,
  getTimelineElementDisplayLabel,
  getTimelineElementSelector,
  getTimelineElementSourceFile,
  getTimelineElementSelectorIndex,
  buildTimelineElementKey,
  buildTimelineElementIdentity,
  getTimelineElementIdentity,
  isTimelineIgnoredElement,
  readTimelineElementZIndex,
} from "./timelineElementHelpers";

// Re-export helpers that were previously public from this module so that
// existing import sites (hook + tests) don't need to change.
// fallow-ignore-next-line unused-exports
export {
  readTimelineDurationFromDocument,
  // fallow-ignore-next-line unused-exports
  resolveMediaElement,
  // fallow-ignore-next-line unused-exports
  applyMediaMetadataFromElement,
  getTimelineElementSelector,
  // fallow-ignore-next-line unused-exports
  getTimelineElementSourceFile,
  // fallow-ignore-next-line unused-exports
  getTimelineElementSelectorIndex,
  // fallow-ignore-next-line unused-exports
  buildTimelineElementIdentity,
  // fallow-ignore-next-line unused-exports
  getTimelineElementIdentity,
  findTimelineDomNodeForClip,
} from "./timelineElementHelpers";

// Re-export iframe helpers so the hook can keep a single import source.
export {
  normalizePreviewViewport,
  autoHealMissingCompositionIds,
  setPreviewMediaMuted,
  setPreviewPlaybackRate,
  resolveIframe,
  buildMissingCompositionElements,
} from "./timelineIframeHelpers";

// ---------------------------------------------------------------------------
// TimelineElement factories
// ---------------------------------------------------------------------------

function resolveClipTag(clip: ClipManifestClip): string {
  return clip.tagName || clip.kind || "div";
}

// fallow-ignore-next-line complexity
export function createTimelineElementFromManifestClip(params: {
  clip: ClipManifestClip;
  fallbackIndex: number;
  doc?: Document | null;
  hostEl?: Element | null;
}): TimelineElement {
  const { clip, fallbackIndex, doc } = params;
  let hostEl = params.hostEl ?? null;
  const transitionLabels = doc
    ? transitionLabelsForDocument(doc, (doc.defaultView as IframeWindow | null)?.__timelines)
    : new Map<Element, string>();
  const label = getTimelineElementDisplayLabel({
    id: clip.id,
    label: clip.label,
    tag: resolveClipTag(clip),
  });

  let domId: string | undefined;
  let selector: string | undefined;
  let selectorIndex: number | undefined;
  let sourceFile: string | undefined;

  let hfId: string | undefined;
  if (hostEl) {
    domId = hostEl.id || undefined;
    hfId = hostEl.getAttribute("data-hf-id") || undefined;
    selector = getTimelineElementSelector(hostEl);
    selectorIndex =
      doc && selector ? getTimelineElementSelectorIndex(doc, hostEl, selector) : undefined;
    sourceFile = getTimelineElementSourceFile(hostEl);
  }

  const identity = buildTimelineElementIdentity({
    preferredId: clip.id,
    label,
    fallbackIndex,
    domId,
    selector,
    selectorIndex,
    sourceFile,
  });
  const entry: TimelineElement = {
    id: identity.id,
    label,
    transitionLabel:
      (hostEl && transitionLabels.get(hostEl)) ||
      hostEl?.getAttribute("data-transition-label") ||
      undefined,
    key: identity.key,
    kind: clip.kind,
    tag: resolveClipTag(clip),
    start: clip.start,
    duration: clip.duration,
    track: clip.track,
    // clip.track IS the authored data-track-index verbatim (the runtime honors
    // it; see parseAuthoredTrack in core/runtime/timeline.ts). Record it at this
    // translation boundary so later display-lane remaps (normalizeToZones,
    // expanded-child rows) can persist in AUTHORED space instead of
    // reconstructing it from lane occupants.
    authoredTrack: clip.track,
    // Runtime-computed stacking context — authoritative; helpers read it, never
    // re-derive it.
    stackingContextId: clip.stackingContextId ?? null,
    domId,
    hfId,
    selector,
    selectorIndex,
    sourceFile,
    playbackStart: clip.playbackStart,
    playbackRate: clip.playbackRate,
  };

  if (hostEl) {
    applyMediaMetadataFromElement(entry, hostEl);
    if (!entry.src) {
      const rawSrc = hostEl.getAttribute("src");
      if (rawSrc) entry.src = new URL(rawSrc, hostEl.baseURI).href;
    }
    if (hostEl.hasAttribute("data-hidden")) entry.hidden = true;
    const timelineRole = hostEl.getAttribute("data-timeline-role");
    if (timelineRole) entry.timelineRole = timelineRole;
    const link = hostEl.getAttribute("data-link");
    if (link) entry.link = link;
    const compositionScope = linkScopeOf(hostEl)?.getAttribute("data-composition-id");
    if (compositionScope) entry.compositionScope = compositionScope;
    const syncOrigin = hostEl.getAttribute("data-sync-origin");
    if (syncOrigin) entry.syncOrigin = syncOrigin;
    const audioGroup = hostEl.getAttribute("data-audio-group");
    if (audioGroup) {
      entry.audioGroup = audioGroup;
      const info = groupInfoFor(doc ?? hostEl.ownerDocument, audioGroup);
      entry.audioGroupLabel = info.label;
      entry.audioGroupVolume = info.volume;
      entry.audioGroupHidden = info.hidden;
      if (info.fxChain) entry.audioGroupFxChain = info.fxChain;
      if (info.automation) entry.audioGroupAutomation = info.automation;
    }
    const masterChain = readMasterFxChain(doc ?? hostEl.ownerDocument);
    if (masterChain) entry.masterChain = masterChain;
    const fxChain = hostEl.getAttribute("data-fx-chain");
    if (fxChain) entry.fxChain = fxChain;
    const automation = hostEl.getAttribute("data-automation");
    if (automation) entry.automation = automation;
    entry.zIndex = readTimelineElementZIndex(hostEl);
  }
  if (clip.assetUrl) entry.src = clip.assetUrl;
  if (clip.kind === "composition" && clip.compositionId) {
    entry.playbackStart ??= 0;
    entry.playbackRate ??= 1;
    let resolvedSrc = clip.compositionSrc;
    if (!resolvedSrc) {
      if (hostEl?.getAttribute("data-composition-id") !== clip.compositionId) {
        hostEl =
          doc?.querySelector(`[data-composition-id="${CSS.escape(clip.compositionId)}"]`) ?? hostEl;
      }
      resolvedSrc =
        hostEl?.getAttribute("data-composition-src") ??
        hostEl?.getAttribute("data-composition-file") ??
        null;
    }
    if (resolvedSrc) {
      entry.compositionSrc = resolvedSrc;
    } else if (hostEl) {
      const innerVideo = hostEl.querySelector("video[src]");
      if (innerVideo) {
        entry.src = innerVideo.getAttribute("src") || undefined;
        entry.tag = "video";
      }
    }
    if (hostEl) {
      entry.domId = hostEl.id || undefined;
      entry.hfId = hostEl.getAttribute("data-hf-id") || undefined;
      entry.selector = getTimelineElementSelector(hostEl);
      entry.selectorIndex =
        doc && entry.selector
          ? getTimelineElementSelectorIndex(doc, hostEl, entry.selector)
          : undefined;
      entry.sourceFile = getTimelineElementSourceFile(hostEl);
      const nextIdentity = buildTimelineElementIdentity({
        preferredId: clip.id,
        label,
        fallbackIndex,
        domId: entry.domId,
        selector: entry.selector,
        selectorIndex: entry.selectorIndex,
        sourceFile: entry.sourceFile,
      });
      entry.id = nextIdentity.id;
      entry.key = nextIdentity.key;
    }
  }

  return entry;
}

/**
 * Parse [data-start] elements from a Document into TimelineElement[].
 * Shared helper — used by onIframeLoad fallback, handleMessage, and enrichMissingCompositions.
 */
export function parseTimelineFromDOM(
  doc: Document,
  rootDuration: number,
  timelines?: Readonly<Record<string, TimelineLike>>,
): TimelineElement[] {
  return withSelectorIndexPass(doc, () => scanTimelineFromDOM(doc, rootDuration, timelines));
}

function scanTimelineFromDOM(
  doc: Document,
  rootDuration: number,
  timelines?: Readonly<Record<string, TimelineLike>>,
): TimelineElement[] {
  const rootComp = doc.querySelector("[data-composition-id]");
  const nodes = doc.querySelectorAll("[data-start]");
  const els: TimelineElement[] = [];
  let trackCounter = 0;
  const timelineRegistry = timelines ?? (doc.defaultView as IframeWindow | null)?.__timelines;
  const transitionLabels = transitionLabelsForDocument(doc, timelineRegistry);
  const masterStart = createRuntimeStartTimeResolver({
    timelineRegistry,
    includeAuthoredTimingAttrs: true,
    documentRef: doc,
  });

  // fallow-ignore-next-line complexity
  nodes.forEach((node) => {
    if (node === rootComp) return;
    if (isTimelineIgnoredElement(node)) return;
    const el = node as HTMLElement;
    const timing = readClipTiming(el);
    if (timing.start == null) return;
    const tagLower = el.tagName.toLowerCase();
    const start =
      tagLower === "video" || tagLower === "audio"
        ? masterStart.resolveMediaStartForElement(el)
        : masterStart.resolveStartForElement(el);
    if (Number.isFinite(rootDuration) && rootDuration > 0 && start >= rootDuration) return;

    let dur = timing.duration ?? 0;
    if (dur <= 0) dur = Math.max(0, rootDuration - start);
    if (Number.isFinite(rootDuration) && rootDuration > 0) {
      dur = Math.min(dur, Math.max(0, rootDuration - start));
    }
    if (!Number.isFinite(dur) || dur <= 0) return;

    const track = timing.trackSource === "default" ? trackCounter++ : timing.trackIndex;
    // fallow-ignore-next-line code-duplication
    const compId = el.getAttribute("data-composition-id");
    const selector = getTimelineElementSelector(el);
    const sourceFile = getTimelineElementSourceFile(el);
    const selectorIndex = getTimelineElementSelectorIndex(doc, el, selector);
    const label = getTimelineElementDisplayLabel({
      id: el.id || el.getAttribute("data-hf-original-composition-id") || compId || null,
      label: el.getAttribute("data-timeline-label") ?? el.getAttribute("data-label"),
      tag: tagLower,
    });
    const identity = buildTimelineElementIdentity({
      preferredId: el.id || compId || null,
      label,
      fallbackIndex: els.length,
      domId: el.id || undefined,
      selector,
      selectorIndex,
      sourceFile,
    });
    const entry: TimelineElement = {
      id: identity.id,
      label,
      transitionLabel:
        transitionLabels.get(el) ?? el.getAttribute("data-transition-label") ?? undefined,
      key: identity.key,
      kind:
        compId && compId !== rootComp?.getAttribute("data-composition-id")
          ? "composition"
          : tagLower === "video" || tagLower === "audio"
            ? tagLower
            : tagLower === "img"
              ? "image"
              : "element",
      tag: tagLower,
      start,
      parentCompositionStart: masterStart.resolveHostStartForElement(el),
      ...(masterStart.isRootGlobalMediaStartForElement(el) && { authoredStartIsMasterTime: true }),
      duration: dur,
      track,
      domId: el.id || undefined,
      hfId: el.getAttribute("data-hf-id") || undefined,
      selector,
      selectorIndex,
      sourceFile,
      stackingContextId: resolveCssStackingContextId(el),
      zIndex: readTimelineElementZIndex(el),
    };

    const mediaEl = resolveMediaElement(el);
    applyMediaMetadataFromElement(entry, el);
    if (mediaEl) {
      if (mediaEl.tagName === "IMG") {
        entry.tag = "img";
      }
      // Override AFTER the helper (which sets the raw relative attribute) so the
      // resolved absolute URL wins — the Studio can then fetch the asset
      // regardless of whether the attribute value was relative or absolute.
      const resolvedSrc = (mediaEl as HTMLMediaElement | HTMLImageElement).src || undefined;
      if (resolvedSrc) entry.src = resolvedSrc;
    }

    // Read from the element, like the manifest path does: without these an audio
    // clip parsed straight from the DOM reserved no automation height and drew no
    // lanes, while the property panel still showed its chain.
    const domMasterChain = readMasterFxChain(doc);
    if (domMasterChain) entry.masterChain = domMasterChain;
    const domFxChain = el.getAttribute("data-fx-chain");
    if (domFxChain) entry.fxChain = domFxChain;
    const domAutomation = el.getAttribute("data-automation");
    if (domAutomation) entry.automation = domAutomation;

    if (el.hasAttribute("data-timeline-locked")) {
      entry.timelineLocked = true;
    }
    if (el.hasAttribute("data-hidden")) {
      entry.hidden = true;
    }

    const timelineRole = el.getAttribute("data-timeline-role");
    if (timelineRole) entry.timelineRole = timelineRole;
    const domLink = el.getAttribute("data-link");
    if (domLink) entry.link = domLink;
    const domCompositionScope = linkScopeOf(el)?.getAttribute("data-composition-id");
    if (domCompositionScope) entry.compositionScope = domCompositionScope;
    const domSyncOrigin = el.getAttribute("data-sync-origin");
    if (domSyncOrigin) entry.syncOrigin = domSyncOrigin;

    const domAudioGroup = el.getAttribute("data-audio-group");
    if (domAudioGroup) {
      entry.audioGroup = domAudioGroup;
      const domGroupInfo = groupInfoFor(doc, domAudioGroup);
      entry.audioGroupLabel = domGroupInfo.label;
      entry.audioGroupVolume = domGroupInfo.volume;
      entry.audioGroupHidden = domGroupInfo.hidden;
      if (domGroupInfo.fxChain) entry.audioGroupFxChain = domGroupInfo.fxChain;
      if (domGroupInfo.automation) entry.audioGroupAutomation = domGroupInfo.automation;
    }

    // Sub-compositions
    const compSrc =
      el.getAttribute("data-composition-src") || el.getAttribute("data-composition-file");
    if (compSrc) {
      entry.compositionSrc = compSrc;
    } else if (compId && compId !== rootComp?.getAttribute("data-composition-id")) {
      // Inline composition — expose inner video or image for thumbnails
      const innerMedia = el.querySelector("video[src], img[src]");
      if (innerMedia) {
        entry.src = innerMedia.getAttribute("src") || undefined;
        entry.tag = innerMedia.tagName === "IMG" ? "img" : "video";
      }
    }
    if (entry.kind === "composition") {
      entry.playbackStart ??= 0;
      entry.playbackRate ??= 1;
    }

    els.push(entry);
  });

  return els;
}

// ---------------------------------------------------------------------------
// Merge helpers
// ---------------------------------------------------------------------------

export function mergeTimelineElementsPreservingDowngrades(
  currentElements: TimelineElement[],
  nextElements: TimelineElement[],
  currentDuration: number,
  nextDuration: number,
  stillInPreview: (element: TimelineElement) => boolean = () => true,
): TimelineElement[] {
  const safeCurrentDuration = Number.isFinite(currentDuration) ? currentDuration : 0;
  const safeNextDuration = Number.isFinite(nextDuration) ? nextDuration : 0;

  if (
    currentElements.length === 0 ||
    nextElements.length >= currentElements.length ||
    safeNextDuration > safeCurrentDuration
  ) {
    return nextElements;
  }

  const nextIdentities = new Set(nextElements.map(getTimelineElementIdentity));
  const preserved = currentElements.filter(
    (element) =>
      !nextIdentities.has(getTimelineElementIdentity(element)) &&
      // Only preserve enriched sub-composition children (compositionSrc set),
      // which a bare DOM re-scan legitimately drops and enrichMissingCompositions
      // re-adds. A TOP-LEVEL element missing from the fresh scan was genuinely
      // removed (undo of a split, a delete), so let it go — otherwise undoing a
      // split leaves a ghost clip in the timeline even though the file is reverted.
      element.compositionSrc != null &&
      stillInPreview(element),
  );
  if (preserved.length === 0) return nextElements;
  return [...nextElements, ...preserved];
}

// ---------------------------------------------------------------------------
// Standalone composition helpers
// ---------------------------------------------------------------------------

export function resolveStandaloneRootCompositionSrc(iframeSrc: string): string | undefined {
  const compPathMatch = iframeSrc.match(/\/preview\/comp\/(.+?)(?:\?|$)/);
  return compPathMatch ? decodeURIComponent(compPathMatch[1]) : undefined;
}

export function buildStandaloneRootTimelineElement(params: {
  compositionId: string;
  tagName: string;
  rootDuration: number;
  iframeSrc: string;
  selector?: string;
  selectorIndex?: number;
}): TimelineElement | null {
  if (!Number.isFinite(params.rootDuration) || params.rootDuration <= 0) return null;

  const compositionSrc = resolveStandaloneRootCompositionSrc(params.iframeSrc);

  return {
    id: params.compositionId,
    label: getTimelineElementDisplayLabel({
      id: params.compositionId,
      tag: params.tagName,
    }),
    key: buildTimelineElementKey({
      id: params.compositionId,
      fallbackIndex: 0,
      selector: params.selector,
      selectorIndex: params.selectorIndex,
      sourceFile: compositionSrc,
    }),
    tag: params.tagName.toLowerCase() || "div",
    start: 0,
    duration: params.rootDuration,
    track: 0,
    compositionSrc,
    selector: params.selector,
    selectorIndex: params.selectorIndex,
    sourceFile: compositionSrc,
  };
}

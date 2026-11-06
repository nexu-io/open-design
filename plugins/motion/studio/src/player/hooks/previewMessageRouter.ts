/**
 * The `window.message` router for the preview iframe.
 *
 * Extracted from `useTimelinePlayer`, which had grown past the studio's 600-line
 * file cap and carried a `fallow-ignore-next-line complexity` on this function
 * admitting the same thing. Nothing here is new logic — it is the same three
 * branches (accept-gate, state, timeline) against the same refs, with the
 * suppression retired rather than moved. The group-levels branch went with the
 * level meter it fed (see the group volume/meter removal).
 */

import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import type { ClipManifestClip, IframeWindow, PlaybackAdapter } from "../lib/playbackTypes";
import { hasTimelinePerformanceFixtureLease } from "../lib/timelinePerformanceFixture";
import { acceptStudioRuntimeMessage, postRuntimeControlMessage } from "../lib/runtimeProtocol";
import {
  parseMediaLoadFailure,
  RUNTIME_MEDIA_LOAD_FAILED,
} from "@hyperframes/core/runtime/protocol";
import {
  parsePlaybackHealth,
  parsePreviewCopies,
  parsePreviewFacts,
} from "../store/previewQualitySlice";
import { parseTimelineFromDOM } from "../lib/timelineDOM";

/** What `processTimelineMessage` accepts — the clip-manifest postMessage. */
export interface ClipManifestMessage {
  clips: ClipManifestClip[];
  durationInFrames: number;
  scenes?: Array<{ id: string; label: string; start: number; duration: number }>;
  protocolVersion?: unknown;
  capabilities?: unknown;
  fps?: unknown;
}

interface PreviewMessage {
  source?: string;
  type?: string;
  clips?: unknown;
  isPlaying?: unknown;
  copies?: unknown;
  health?: unknown;
  facts?: unknown;
  code?: unknown;
  details?: unknown;
}

export interface PreviewMessageRouterDeps {
  iframeRef: { current: HTMLIFrameElement | null };
  /** Kept as refs by the caller so the listener can be registered once. */
  processTimelineMessageRef: { current: (data: ClipManifestMessage) => void };
  enrichMissingCompositionsRef: { current: () => void };
  lastTimelineMessageRef: { current: number };
  getAdapter: () => PlaybackAdapter | null;
  syncTimelineElements: (elements: TimelineElement[]) => void;
}

/** True when the message did not come from OUR preview iframe. */
function isForeignSource(e: MessageEvent, iframe: HTMLIFrameElement | null): boolean {
  return Boolean(e.source && iframe && e.source !== iframe.contentWindow);
}

/** A preview message worth acting on, or null: the fixture lease, the sender
 *  check and the protocol accept-gate collapsed into one answer so the listener
 *  below stays a flat dispatch. */
function acceptedPreviewMessage(
  e: MessageEvent,
  iframe: HTMLIFrameElement | null,
): PreviewMessage | null {
  if (hasTimelinePerformanceFixtureLease()) return null;
  if (isForeignSource(e, iframe)) return null;
  const data = e.data as PreviewMessage | null;
  if (data?.source !== "hf-preview") return null;
  return acceptStudioRuntimeMessage(data) ? data : null;
}

/** Whether enrichment is due: no timeline message and no enrichment of ours for 500 ms. Marks it run. */
function enrichDue(lastTimelineMessage: number, enriched: { at: number }): boolean {
  const now = Date.now();
  if (now - lastTimelineMessage <= 500 || now - enriched.at <= 500) return false;
  enriched.at = now;
  return true;
}

/**
 * A `state` tick doubles as a recovery hook: if the store still has no
 * elements, read the manifest straight off the iframe, and if no `timeline`
 * message has arrived recently, re-run enrichment (at most every 500 ms: it queries the whole document).
 */
function handleStateMessage(
  deps: PreviewMessageRouterDeps,
  iframe: HTMLIFrameElement | null,
  playingHoldsClipListPosts: boolean,
  enriched: { at: number },
): void {
  try {
    if (usePlayerStore.getState().elements.length === 0) {
      const manifest = (iframe?.contentWindow as IframeWindow | null)?.__clipManifest;
      if (manifest && manifest.clips.length > 0) {
        deps.processTimelineMessageRef.current(manifest);
      }
    }
    if (!playingHoldsClipListPosts && enrichDue(deps.lastTimelineMessageRef.current, enriched)) {
      deps.enrichMissingCompositionsRef.current();
    }
  } catch {}
}

/**
 * The clip list. When it arrives empty-handed — the store still has nothing —
 * fall back to parsing the live DOM, which is the only source left before the
 * next tick.
 */
function handleTimelineMessage(
  deps: PreviewMessageRouterDeps,
  iframe: HTMLIFrameElement | null,
  data: ClipManifestMessage,
): void {
  deps.lastTimelineMessageRef.current = Date.now();
  deps.processTimelineMessageRef.current(data);
  deps.enrichMissingCompositionsRef.current();
  if (usePlayerStore.getState().elements.length > 0) return;
  try {
    const doc = iframe?.contentDocument;
    const adapter = deps.getAdapter();
    if (!doc || !adapter) return;
    const els = parseTimelineFromDOM(doc, adapter.getDuration());
    if (els.length > 0) deps.syncTimelineElements(els);
  } catch {}
}

function applyStoreReport(data: PreviewMessage): boolean {
  const store = usePlayerStore.getState();
  switch (data.type) {
    case "preview-copies":
      store.setPreviewCopies(parsePreviewCopies(data.copies));
      return true;
    case "preview-health":
      store.setPlaybackHealth(parsePlaybackHealth(data.health));
      return true;
    case "preview-facts":
      store.setPreviewFacts(parsePreviewFacts(data.facts));
      return true;
    case "diagnostic": {
      if (data.code !== RUNTIME_MEDIA_LOAD_FAILED) return false;
      const failure = parseMediaLoadFailure(data.details);
      if (failure) store.setMediaLoadFailure(failure);
      return true;
    }
    default:
      return false;
  }
}

export function createPreviewMessageHandler(
  deps: PreviewMessageRouterDeps,
): (e: MessageEvent) => void {
  const enriched = { at: 0 };
  return (e: MessageEvent) => {
    const iframe = deps.iframeRef.current;
    const data = acceptedPreviewMessage(e, iframe);
    if (!data) return;
    if (data.type === "state")
      return handleStateMessage(deps, iframe, data.isPlaying === true, enriched);
    if (applyStoreReport(data)) return;
    if (data.type === "ready") {
      const level = usePlayerStore.getState().previewQuality;
      postRuntimeControlMessage(iframe?.contentWindow, "set-preview-quality", { level });
      return;
    }
    if (data.type === "timeline" && Array.isArray(data.clips)) {
      handleTimelineMessage(deps, iframe, data as unknown as ClipManifestMessage);
    }
  };
}

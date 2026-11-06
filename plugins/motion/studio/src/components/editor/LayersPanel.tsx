import { useI18n } from "../../i18n/I18n";
import { useLivePreviewIframe } from "../../player/store/previewIframeStore";
import { onPreviewContentReplaced } from "../../player/sceneSwap";
import { memo, useState, useCallback, useEffect, useRef } from "react";
import {
  collectDomEditLayerItems,
  getDomEditLayerKey,
  liveLayerElement,
  resolveDomEditSelection,
  type DomEditLayerItem,
} from "./domEditing";
import {
  useStudioPlaybackContextOptional,
  useStudioShellContextOptional,
  type StudioPlaybackValue,
  type StudioShellValue,
} from "../../contexts/StudioContext";
import { useDomEditContext } from "../../contexts/DomEditContext";
import { usePlayerStore, liveTime } from "../../player";
import {
  findMatchingTimelineElementId,
  resolveTimelineSelectionSeekTime,
} from "../../utils/studioHelpers";
import {
  Film,
  Folder,
  ImageIcon,
  Layers,
  Music,
  Square,
  Type,
  Vector,
} from "../../icons/SystemIcons";
import { isCompositionHost, layerKindOf } from "./layerKind";
import { useLayerDrag, isLayerDraggable, type LayerReorderEvent } from "./useLayerDrag";
import { getVisibleLayers, sortLayersByZIndex } from "./layersPanelSort";
import { deriveTimelineStoreKey } from "../../player/lib/timelineElementHelpers";
import { resolveZOrderReposition } from "./canvasContextMenuZOrder";
import { buildStableSelector } from "./domEditingDom";
import { zReorderCoalesceKey } from "../../hooks/useElementLifecycleOps";
import { useLayerReorderTimelineMirror } from "../nle/useCanvasZOrderTimelineMirror";
import { runZLaneGesture } from "../nle/zLaneGesture";
import { useLayerRevealOverride } from "./useLayerRevealOverride";

// Rows this panel renders before it stops. A display budget, not a document limit.
const LAYERS_PANEL_MAX_ROWS = 80;

const [CARET, ICON, GAP] = [16, 20, 6];
const CHILD_INDENT = CARET + GAP + ICON + GAP;

const KIND_ICON = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  vector: Vector,
  group: Folder,
  text: Type,
  shape: Square,
} as const;

/**
 * A trailing-rAF + cooldown throttle: `invoke` runs `run` at most once per
 * animation frame and no more often than `throttleMs`. `cancel` clears any
 * pending frame (call on cleanup). Extracted so the throttle can be exercised
 * directly in tests instead of being reconstructed there.
 */
export function createRafThrottle(
  run: () => void,
  throttleMs = 100,
): { invoke: () => void; cancel: () => void } {
  let rafId: number | null = null;
  let lastFired = 0;
  return {
    invoke: () => {
      const now = performance.now();
      if (rafId !== null || now - lastFired < throttleMs) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        lastFired = performance.now();
        run();
      });
    },
    cancel: () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    },
  };
}

interface CollapsedState {
  [key: string]: boolean;
}

/** Studio state the panel reads; passed by hosts outside Studio's providers. Keep previewIframeRef stable;
 * a host with its own player calls announcePreviewDocumentLoaded on each new page, or bumps refreshKey. */
export type LayersPanelHost = Pick<
  StudioShellValue,
  "previewIframeRef" | "activeCompPath" | "showToast"
> &
  Pick<StudioPlaybackValue, "timelineElements" | "isPlaying"> &
  Partial<Pick<StudioPlaybackValue, "refreshKey" | "compositionLoading">>;

function useLayersPanelHost(host: LayersPanelHost | undefined): LayersPanelHost {
  const shell = useStudioShellContextOptional();
  const playback = useStudioPlaybackContextOptional();
  if (host) return host;
  if (!shell || !playback) {
    throw new Error("LayersPanel needs a host prop outside Studio's shell and playback providers");
  }
  return { ...shell, ...playback };
}

// fallow-ignore-next-line complexity
export const LayersPanel = memo(function LayersPanel({ host }: { host?: LayersPanelHost }) {
  const { t } = useI18n();
  const {
    previewIframeRef,
    activeCompPath,
    showToast,
    refreshKey,
    compositionLoading,
    timelineElements,
    isPlaying,
  } = useLayersPanelHost(host);
  const currentTime = usePlayerStore((s) => s.currentTime);
  // Flashless z commits (canvas menu, timeline lane-drag z-sync) mutate iframe
  // z-indexes with no reload and no refreshKey bump — while paused, nothing
  // else re-collects, so the panel's z-sorted order would go stale.
  const zEditVersion = usePlayerStore((s) => s.zEditVersion);
  const {
    domEditSelection,
    activeGroupElement,
    applyDomSelection,
    updateDomEditHoverSelection,
    handleDomZIndexReorderCommit,
    setActiveGroupElement,
  } = useDomEditContext();

  const [layers, setLayers] = useState<DomEditLayerItem[]>([]);
  const [collapsed, setCollapsed] = useState<CollapsedState>({});
  const prevDocVersionRef = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const mirrorLayerReorderToTimeline = useLayerReorderTimelineMirror();
  const { scheduleReveal } = useLayerRevealOverride({
    isPlaying,
    selectedElement: domEditSelection?.element ?? null,
  });

  const isMasterView = !activeCompPath || activeCompPath === "index.html";

  const livePreviewIframe = useLivePreviewIframe();
  const collectLayers = useCallback(() => {
    const iframe = previewIframeRef.current;
    if (!iframe) return;
    let doc: Document | null = null;
    try {
      doc = iframe.contentDocument;
    } catch {
      return;
    }
    if (!doc) return;

    const root =
      doc.querySelector<HTMLElement>("[data-composition-id]") ?? doc.documentElement ?? null;
    if (!root) return;

    // A preview reload detaches the drilled-into wrapper; exit drill-in if so.
    if (activeGroupElement && !activeGroupElement.isConnected) setActiveGroupElement(null);

    const items = collectDomEditLayerItems(
      root,
      { activeCompositionPath: activeCompPath, isMasterView, activeGroupElement },
      // How many rows this panel is willing to render, nothing more. Hit-testing
      // callers deliberately take the whole document instead.
      LAYERS_PANEL_MAX_ROWS,
    );
    setLayers(sortLayersByZIndex(items));
  }, [previewIframeRef, activeCompPath, isMasterView, activeGroupElement, setActiveGroupElement]);

  useEffect(() => {
    collectLayers();
  }, [collectLayers, refreshKey, zEditVersion, livePreviewIframe]);

  useEffect(() => {
    const iframe = previewIframeRef.current;
    if (!iframe) return;
    const handleLoad = () => {
      prevDocVersionRef.current += 1;
      collectLayers();
    };
    return onPreviewContentReplaced(iframe, handleLoad);
  }, [previewIframeRef, livePreviewIframe, collectLayers]);

  useEffect(() => {
    if (!compositionLoading) {
      const timer = setTimeout(collectLayers, 100);
      return () => clearTimeout(timer);
    }
  }, [compositionLoading, collectLayers]);

  // Subscribe to liveTime so the panel refreshes during scrubbing.
  // liveTime bypasses React state (no re-renders per frame), so a plain
  // usePlayerStore(s => s.currentTime) subscription never fires while the
  // RAF loop is running.  Throttle with a trailing rAF + 100 ms cooldown to
  // avoid a collectLayers call on every animation frame.
  useEffect(() => {
    const throttle = createRafThrottle(collectLayers, 100);
    const unsubscribe = liveTime.subscribe(throttle.invoke);
    return () => {
      unsubscribe();
      throttle.cancel();
    };
  }, [collectLayers]);

  const resolveSelection = useCallback(
    (layer: DomEditLayerItem) => {
      const doc = previewIframeRef.current?.contentDocument;
      const el = liveLayerElement(layer, doc, activeCompPath);
      return resolveDomEditSelection(el, {
        activeCompositionPath: activeCompPath,
        isMasterView,
        preferClipAncestor: false,
        activeGroupElement,
      });
    },
    [activeCompPath, isMasterView, previewIframeRef, activeGroupElement],
  );

  const seekToLayer = useCallback(
    async (layer: DomEditLayerItem) => {
      const selection = await resolveSelection(layer);
      if (!selection) return;

      let matchedId = findMatchingTimelineElementId(selection, timelineElements);

      if (!matchedId) {
        const sourceFile = selection.sourceFile ?? "index.html";
        let ancestor = layer.element.parentElement;
        while (ancestor && !matchedId) {
          const elId = ancestor.id;
          if (elId) {
            const found = timelineElements.find(
              (e) => e.domId === elId && (e.sourceFile ?? "index.html") === sourceFile,
            );
            if (found) matchedId = found.key ?? found.id;
          }
          ancestor = ancestor.parentElement;
        }
      }

      if (matchedId) {
        const el = timelineElements.find((e) => (e.key ?? e.id) === matchedId);
        if (el) {
          const nextTime = resolveTimelineSelectionSeekTime(currentTime, el);
          if (nextTime != null) usePlayerStore.getState().requestSeek(nextTime);
        }
      }
    },
    [currentTime, resolveSelection, timelineElements],
  );

  const handleSelectLayer = useCallback(
    async (layer: DomEditLayerItem) => {
      const selection = await resolveSelection(layer);
      if (!selection) return;
      applyDomSelection(selection);
      await seekToLayer(layer);
      // Force-reveal AFTER the seek's runtime visibility sync has had a beat:
      // a clip made active by the seek shows naturally and needs no override,
      // so the reveal only touches nodes that REMAIN hidden (animation-parked
      // opacity, non-clip display/visibility hides, hidden ancestors).
      scheduleReveal(selection.element, 150);
    },
    [resolveSelection, applyDomSelection, seekToLayer, scheduleReveal],
  );

  // Double-click a group row → drill into it; any other row → select it.
  const handleLayerDoubleClick = useCallback(
    async (layer: DomEditLayerItem) => {
      const selection = await resolveSelection(layer);
      if (selection?.element.hasAttribute("data-hf-group")) {
        setActiveGroupElement(selection.element);
      } else {
        await handleSelectLayer(layer);
      }
    },
    [resolveSelection, setActiveGroupElement, handleSelectLayer],
  );

  const handleLayerHover = useCallback(
    async (layer: DomEditLayerItem | null) => {
      if (!layer) {
        updateDomEditHoverSelection(null);
        return;
      }
      const selection = await resolveSelection(layer);
      updateDomEditHoverSelection(selection);
    },
    [resolveSelection, updateDomEditHoverSelection],
  );

  const toggleCollapse = useCallback((key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // fallow-ignore-next-line complexity
  const handleReorder = useCallback(
    (event: LayerReorderEvent) => {
      const { siblingLayers, fromIndex, toIndex } = event;
      const reordered = [...siblingLayers];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);

      // Panel order is top-first (sortLayersByZIndex: z desc, later-DOM-first),
      // so the desired RENDER order (bottom→top) is the reverse. The minimal
      // resolver (shared with the canvas z-menu) then writes one between-z
      // value when a strict gap exists, band-safe renumber otherwise — instead
      // of the old computeReorderZValues stamp of every sibling.
      const desiredBottomToTop = [...reordered].reverse();
      const patches = resolveZOrderReposition(
        moved.element,
        desiredBottomToTop.map((l) => l.element),
      );
      if (!patches || patches.length === 0) return; // paint order unchanged

      const layerByElement = new Map(siblingLayers.map((l) => [l.element, l]));
      const entries: Array<{
        element: HTMLElement;
        zIndex: number;
        id?: string;
        selector?: string;
        selectorIndex?: number;
        sourceFile: string;
        key?: string;
      }> = [];
      for (const patch of patches) {
        // The renumber fallback can patch a painting sibling the panel didn't
        // list (non-collected family member): derive its identity from the DOM
        // node, exactly like the canvas menu's siblingZIndexEntry. Un-targetable
        // nodes get a live-only style write (reverts on reload).
        const layer = layerByElement.get(patch.element);
        const id = layer?.id ?? (patch.element.id || undefined);
        const selector = layer?.selector ?? buildStableSelector(patch.element);
        if (!id && !selector) {
          patch.element.style.zIndex = String(patch.zIndex);
          continue;
        }
        const sourceFile = layer?.sourceFile ?? moved.sourceFile;
        entries.push({
          element: patch.element,
          zIndex: patch.zIndex,
          id,
          selector,
          selectorIndex: layer?.selectorIndex,
          sourceFile,
          key: deriveTimelineStoreKey({
            domId: id,
            selector,
            selectorIndex: layer?.selectorIndex,
            sourceFile,
          }),
        });
      }
      if (entries.length === 0) return;

      // ONE undo entry for the whole gesture: the z persist and the timeline
      // lane mirror below share this per-gesture-unique key (same contract as
      // the canvas menu's wiring in ConnectedDomEditOverlay).
      const coalesceKey = zReorderCoalesceKey(entries, "layer-drag");
      const desiredOrderKeys = desiredBottomToTop.map(
        (l) =>
          deriveTimelineStoreKey({
            domId: l.id,
            selector: l.selector,
            selectorIndex: l.selectorIndex,
            sourceFile: l.sourceFile,
          }) ?? null,
      );
      const movedKey = deriveTimelineStoreKey({
        domId: moved.id,
        selector: moved.selector,
        selectorIndex: moved.selectorIndex,
        sourceFile: moved.sourceFile,
      });
      // One serialized z→lane transaction (shared queue with the canvas
      // z-order menu): the mirror runs only after a DURABLE z persist, and
      // rapid successive gestures cannot interleave phases — see
      // runZLaneGesture.
      runZLaneGesture({
        commitZ: () => handleDomZIndexReorderCommit(entries, coalesceKey, "layer-drag"),
        mirror: () =>
          mirrorLayerReorderToTimeline({ selectionKey: movedKey, desiredOrderKeys, coalesceKey }),
      }).catch(() => undefined);
    },
    [handleDomZIndexReorderCommit, mirrorLayerReorderToTimeline],
  );

  const selectedKey = domEditSelection ? getDomEditLayerKey(domEditSelection) : null;
  const visibleLayers = getVisibleLayers(layers, collapsed);

  const handleSingleSibling = useCallback(() => {
    showToast("Only one layer at this level", "info");
  }, [showToast]);

  const {
    dragKey,
    insertionLineY,
    handleRowPointerDown,
    handleContainerPointerMove,
    handleContainerPointerUp,
  } = useLayerDrag({
    visibleLayers,
    scrollContainerRef,
    onReorder: handleReorder,
    onSingleSibling: handleSingleSibling,
  });

  if (layers.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-panel-bg px-6 text-center">
        <Layers size={18} className="mb-3 text-panel-text-5" />
        <p className="text-sm font-medium text-panel-text-1">{t("No layers")}</p>
        <p className="mt-1 text-xs text-neutral-500">{t("Load a composition to see its element tree")}</p>
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-panel-bg"
      onPointerLeave={() => handleLayerHover(null)}
    >
      <div className="border-b border-panel-border px-3 py-2 text-[11px] text-panel-text-3">
        {t("{count} layers", { count: layers.length })}
      </div>
      <div
        ref={scrollContainerRef}
        className="relative min-h-0 flex-1 select-none overflow-y-auto py-1"
        onPointerMove={handleContainerPointerMove}
        onPointerUp={handleContainerPointerUp}
        onPointerCancel={handleContainerPointerUp}
      >
        {activeGroupElement && (
          <button
            type="button"
            onClick={() => setActiveGroupElement(null)}
            className="mx-1 flex w-[calc(100%-0.5rem)] items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] text-panel-text-3 hover:bg-panel-hover/40 hover:text-panel-text-1"
          >
            <span aria-hidden="true">←</span>
            <span className="truncate">
              {activeGroupElement.getAttribute("data-hf-group") || "Group"}
            </span>
          </button>
        )}
        {visibleLayers.map((layer, index) => {
          const selected = layer.key === selectedKey;
          const isDragged = layer.key === dragKey;
          const draggable = isLayerDraggable(layer);
          const isCollapsed = collapsed[layer.key] ?? false;
          const hasChildren = layer.childCount > 0;
          const isCompHost = isCompositionHost(layer.element);
          const kind = layerKindOf(layer.element, hasChildren);
          const KindIcon = KIND_ICON[kind];
          const kindName = kind[0].toUpperCase() + kind.slice(1);
          const hint = draggable
            ? layer.element.hasAttribute("data-hf-group")
              ? "Double-click to enter group"
              : undefined
            : "This layer can't be reordered";

          return (
            <div
              key={layer.key}
              data-layer-index={index}
              role="button"
              tabIndex={0}
              onClick={() => !dragKey && handleSelectLayer(layer)}
              onDoubleClick={() => !dragKey && handleLayerDoubleClick(layer)}
              onPointerDown={(e) => handleRowPointerDown(index, e)}
              onPointerEnter={() => !dragKey && handleLayerHover(layer)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelectLayer(layer);
                }
              }}
              className={`group mx-1 flex items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors ${
                isDragged
                  ? "opacity-40"
                  : selected
                    ? "bg-panel-accent/14 text-accent-ink"
                    : "text-panel-text-2 hover:bg-panel-hover/40 hover:text-panel-text-1"
              } ${dragKey ? "cursor-grabbing" : "cursor-pointer"}`}
              style={{ paddingLeft: 8 + layer.depth * CHILD_INDENT }}
              title={hint}
            >
              {hasChildren ? (
                <button
                  type="button"
                  onClick={(e) => toggleCollapse(layer.key, e)}
                  aria-expanded={!isCollapsed}
                  aria-label={isCollapsed ? t("Expand children") : t("Collapse children")}
                  className="relative flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-neutral-500 hover:text-neutral-300 before:absolute before:-inset-1.5 before:content-['']"
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 8 8"
                    fill="currentColor"
                    className={`transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                  >
                    <path d="M2 1l4 3-4 3z" />
                  </svg>
                </button>
              ) : null}
              <span
                data-layer-kind={kind}
                title={hint ? `${kindName} · ${hint}` : kindName}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${
                  selected
                    ? "bg-panel-accent/18 text-accent-ink"
                    : isCompHost
                      ? "bg-on text-accent-ink"
                      : "bg-panel-hover text-panel-text-4"
                }`}
              >
                <KindIcon size={12} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px]">{layer.label}</span>
              {hasChildren && (
                <span className="text-[9px] tabular-nums text-panel-text-5">
                  {layer.childCount}
                </span>
              )}
            </div>
          );
        })}
        {insertionLineY != null && (
          <div
            className="pointer-events-none absolute left-2 right-2 h-0.5 bg-studio-accent"
            style={{ top: insertionLineY }}
          />
        )}
      </div>
    </div>
  );
});

// The sort helper lives in layersPanelSort.ts (600-line studio cap);
// re-exported so existing imports from "./LayersPanel" still resolve.
export { sortLayersByZIndex } from "./layersPanelSort";

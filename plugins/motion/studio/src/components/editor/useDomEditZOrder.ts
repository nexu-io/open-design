import { trackPreviewFeatureUsed } from "../../utils/previewFeatureUsage";
import { useCallback, useMemo } from "react";
import { useDomEditActionsContext } from "../../contexts/DomEditContext";
import { readHfId, type DomEditSelection } from "./domEditing";
import { buildStableSelector, getSelectorIndex } from "./domEditingDom";
import { usePreviewReadOnly } from "./previewReadOnlyContext";
import { useStudioShellContextOptional } from "../../contexts/StudioContext";
import { deriveTimelineStoreKey } from "../../player/lib/timelineElementHelpers";
import { zReorderCoalesceKey } from "../../hooks/useElementLifecycleOps";
import { useCanvasZOrderTimelineMirror } from "../nle/useCanvasZOrderTimelineMirror";
import { runZLaneGesture } from "../nle/zLaneGesture";
import {
  isZOrderActionEnabled,
  resolveZOrderStep,
  type ZOrderAction,
  type ZOrderPatch,
} from "./canvasContextMenuZOrder";

type ZIndexReorderEntry = {
  element: HTMLElement;
  zIndex: number;
  id?: string;
  selector?: string;
  selectorIndex?: number;
  sourceFile: string;
  /** Timeline store key — lets the commit update the store zIndex synchronously. */
  key?: string;
};

/** Can this element be robustly re-targeted for a persisted z change? */
function canTargetZIndexElement(
  element: HTMLElement,
  id: string | undefined,
  selector: string | undefined,
): boolean {
  return Boolean(id || selector || readHfId(element));
}

/** The selected element carries its full selection identity. */
function selectedZIndexEntry(sel: DomEditSelection, zIndex: number): ZIndexReorderEntry {
  return {
    element: sel.element,
    zIndex,
    id: sel.id ?? undefined,
    selector: sel.selector,
    selectorIndex: sel.selectorIndex,
    sourceFile: sel.sourceFile,
    key: deriveTimelineStoreKey({
      domId: sel.id ?? undefined,
      selector: sel.selector,
      selectorIndex: sel.selectorIndex,
      sourceFile: sel.sourceFile,
    }),
  };
}

/** A raw iframe sibling in the selection's file; null with no id or selector (z stays live). Its selector index
 * picks it among same-class siblings, the way the lane mirror keys `crossed`. */
function siblingZIndexEntry(
  element: HTMLElement,
  zIndex: number,
  sourceFile: string,
  activeCompPath: string | null,
): ZIndexReorderEntry | null {
  const id = element.id || undefined;
  const selector = buildStableSelector(element);
  if (!canTargetZIndexElement(element, id, selector)) return null;
  const selectorIndex = id
    ? undefined
    : getSelectorIndex(element.ownerDocument, element, selector, sourceFile, activeCompPath);
  return {
    element,
    zIndex,
    id,
    selector,
    selectorIndex,
    sourceFile,
    key: deriveTimelineStoreKey({ domId: id, selector, selectorIndex, sourceFile }),
  };
}

/** Short human-readable label for a dropped sibling, for the console warning below. */
function describeZIndexElement(element: HTMLElement): string {
  if (element.id) return `#${element.id}`;
  const firstClass = element.classList.item(0);
  return firstClass
    ? `${element.tagName.toLowerCase()}.${firstClass}`
    : element.tagName.toLowerCase();
}

// Patches as commit entries; a sibling with no id or selector is `dropped` and reverts on reload.
export function resolveZIndexEntries(
  sel: DomEditSelection,
  patches: ReadonlyArray<{ element: HTMLElement; zIndex: number }>,
  activeCompPath: string | null,
): { entries: ZIndexReorderEntry[]; dropped: Array<{ element: HTMLElement; zIndex: number }> } {
  const entries: ZIndexReorderEntry[] = [];
  const dropped: Array<{ element: HTMLElement; zIndex: number }> = [];
  for (const patch of patches) {
    if (patch.element === sel.element) {
      entries.push(selectedZIndexEntry(sel, patch.zIndex));
      continue;
    }
    const entry = siblingZIndexEntry(patch.element, patch.zIndex, sel.sourceFile, activeCompPath);
    if (entry) entries.push(entry);
    else dropped.push(patch);
  }
  return { entries, dropped };
}

export interface DomEditZOrder {
  /** False in a read-only preview, for an element no longer in the live preview, or at that end of its stacking set. */
  enabled: (sel: DomEditSelection, action: ZOrderAction) => boolean;
  /** Resolve and commit one step; false when nothing is sent to be saved. */
  apply: (sel: DomEditSelection, action: ZOrderAction) => boolean;
  /** Commit patches already resolved (the canvas menu resolves its own); false when none could be sent to be saved. */
  commit: (
    sel: DomEditSelection,
    patches: ReadonlyArray<ZOrderPatch>,
    action: ZOrderAction,
    crossed: HTMLElement | null,
  ) => boolean;
}

/** A selection from before a preview reload holds an element of a document no window shows, with stale z values. */
const isLive = (element: HTMLElement) =>
  element.isConnected && element.ownerDocument.defaultView !== null;

// The canvas menu's z-order (write, undo, lane mirror) for any caller in DomEditProvider.
export function useDomEditZOrder(): DomEditZOrder {
  const { handleDomZIndexReorderCommit } = useDomEditActionsContext();
  const mirrorZOrderToTimeline = useCanvasZOrderTimelineMirror();
  const readOnly = usePreviewReadOnly();
  const activeCompPath = useStudioShellContextOptional()?.activeCompPath ?? null;

  const enabled = useCallback<DomEditZOrder["enabled"]>(
    (sel, action) => !readOnly && isLive(sel.element) && isZOrderActionEnabled(sel.element, action),
    [readOnly],
  );

  const commit = useCallback<DomEditZOrder["commit"]>(
    (sel, patches, action, crossed) => {
      if (readOnly) return false;
      const { entries, dropped } = resolveZIndexEntries(sel, patches, activeCompPath);
      if (dropped.length > 0) {
        // Not writable to source: their live z still applies, so the order renders, until a reload.
        for (const patch of dropped) patch.element.style.zIndex = String(patch.zIndex);
        console.warn(
          "[studio] z-index reorder: dropping sibling(s) with no stable id/selector " +
            "(will revert on reload):",
          dropped.map((patch) => describeZIndexElement(patch.element)).join(", "),
        );
      }
      if (entries.length === 0) return false;
      // One coalesce key for the z write and the lane mirror: one undo entry.
      const coalesceKey = zReorderCoalesceKey(entries, action);
      // One serialized z→lane transaction: the mirror runs only AFTER a durable z commit and
      // no second gesture interleaves (see runZLaneGesture). A failed z commit has already
      // toasted and rolled back, so the catch only keeps its rejection from going unhandled.
      let changed = false;
      runZLaneGesture({
        commitZ: async () => {
          const result = await handleDomZIndexReorderCommit(entries, coalesceKey, action);
          changed = result?.durable === true && result.changed;
          return result;
        },
        mirror: () =>
          mirrorZOrderToTimeline({
            selectionKey: entries.find((e) => e.element === sel.element)?.key,
            action,
            crossed,
            sourceFile: sel.sourceFile,
            coalesceKey,
          }),
      })
        .then(() => {
          if (changed) trackPreviewFeatureUsed("z_order", "button");
        })
        .catch(() => undefined);
      return true;
    },
    [activeCompPath, handleDomZIndexReorderCommit, mirrorZOrderToTimeline, readOnly],
  );

  const apply = useCallback<DomEditZOrder["apply"]>(
    (sel, action) => {
      if (!isLive(sel.element)) return false;
      const step = resolveZOrderStep(sel.element, action);
      return step !== null && commit(sel, step.patches, action, step.crossed);
    },
    [commit],
  );

  return useMemo(() => ({ enabled, apply, commit }), [enabled, apply, commit]);
}

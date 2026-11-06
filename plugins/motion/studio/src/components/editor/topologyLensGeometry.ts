import { resolveElementHandle } from "../../webmcp/handles";
import { collectStudioLookScene } from "../../webmcp/tools/lookTools";
import type { DomEditLayerItem } from "./domEditingTypes";
import { toVisibleOverlayRects, type OverlayRect } from "./domEditOverlayGeometry";

export interface TopologyLensNode {
  label: string;
  rect: OverlayRect;
}

export interface TopologyLensGeometry {
  field: TopologyLensNode;
  target: TopologyLensNode;
  contours: TopologyLensNode[];
}

function findSourceContextIndex(items: readonly DomEditLayerItem[], targetIndex: number): number {
  const target = items[targetIndex]!;
  let contextIndex = targetIndex;
  let parentDepth = target.depth - 1;
  for (let index = targetIndex - 1; index >= 0 && parentDepth >= 0; index--) {
    const item = items[index]!;
    if (item.depth !== parentDepth) continue;
    if (item.sourceFile !== target.sourceFile) break;
    contextIndex = index;
    parentDepth -= 1;
  }
  return contextIndex;
}

function collectSourceContours(
  items: readonly DomEditLayerItem[],
  contextIndex: number,
  target: DomEditLayerItem,
): HTMLElement[] {
  const context = items[contextIndex]!;
  const contours: HTMLElement[] = [];
  for (let index = contextIndex + 1; index < items.length; index++) {
    const item = items[index]!;
    if (item.depth <= context.depth) break;
    if (item.sourceFile === target.sourceFile && item.element !== target.element) {
      contours.push(item.element);
    }
  }
  return contours;
}

/**
 * Resolve the same nested preorder used by studio_look. This keeps the lens on
 * the agent's source-safe scene model instead of guessing hierarchy from an
 * unrelated presentation selector.
 */
export function resolveTopologyLensElements(
  doc: Document,
  activeCompositionPath: string | null,
  handle: string,
): { context: HTMLElement; target: HTMLElement; contours: HTMLElement[] } | null {
  const target = resolveElementHandle(doc, handle);
  if (!target) return null;
  const scene = collectStudioLookScene(doc, activeCompositionPath, null);
  if (scene.status === "loading") return null;
  const targetIndex = scene.items.findIndex((item) => item.element === target);
  if (targetIndex < 0) return { context: target, target, contours: [] };

  const targetItem = scene.items[targetIndex]!;
  const contextIndex = findSourceContextIndex(scene.items, targetIndex);
  const contextItem = scene.items[contextIndex]!;
  const sourceContext = target.closest<HTMLElement>(
    "[data-composition-file], [data-composition-src]",
  );
  return {
    context: sourceContext ?? contextItem.element,
    target,
    contours: collectSourceContours(scene.items, contextIndex, targetItem),
  };
}

function isRenderableRect(rect: OverlayRect | null | undefined): rect is OverlayRect {
  return Boolean(rect && rect.width > 0 && rect.height > 0);
}

export function measureTopologyLensGeometry(input: {
  overlay: HTMLDivElement;
  iframe: HTMLIFrameElement;
  activeCompositionPath: string | null;
  handle: string;
}): TopologyLensGeometry | null {
  const doc = input.iframe.contentDocument;
  if (!doc) return null;
  const elements = resolveTopologyLensElements(doc, input.activeCompositionPath, input.handle);
  if (!elements) return null;
  const sharedField = elements.context === elements.target;
  const measured = toVisibleOverlayRects(
    input.overlay,
    input.iframe,
    sharedField
      ? [elements.target, ...elements.contours]
      : [elements.context, elements.target, ...elements.contours],
  );
  const target = measured[sharedField ? 0 : 1];
  if (!isRenderableRect(target)) return null;
  const measuredField = measured[0];
  const fieldUsesContext = !sharedField && isRenderableRect(measuredField);
  const contourOffset = sharedField ? 1 : 2;
  return {
    field: {
      label: (fieldUsesContext ? elements.context : elements.target).tagName.toLowerCase(),
      rect: fieldUsesContext ? measuredField : target,
    },
    target: { label: elements.target.tagName.toLowerCase(), rect: target },
    contours: measured
      .slice(contourOffset)
      .map((rect, index) => ({
        label: elements.contours[index]!.tagName.toLowerCase(),
        rect,
      }))
      .filter((item): item is TopologyLensNode => isRenderableRect(item.rect)),
  };
}

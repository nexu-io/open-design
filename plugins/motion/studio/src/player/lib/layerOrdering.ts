import { readLayerRevealPriorZ } from "./timelineElementHelpers";

export interface StackingContextDescriptor {
  parentCompositionId: string | null;
  compositionAncestors: readonly string[];
  stackingContextId?: string | null;
}

export interface ContextOrderItem extends StackingContextDescriptor {
  zIndex: number;
}

// fallow-ignore-next-line complexity
export function getElementZIndex(element: HTMLElement): number {
  try {
    // An active Layers-panel reveal lift reports the element's TRUE z.
    const prior = readLayerRevealPriorZ(element);
    if (prior != null) return prior;
    const inline = element.style?.zIndex;
    if (inline && inline !== "auto") {
      const parsed = parseInt(inline, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
    const win = element.ownerDocument?.defaultView;
    if (!win) return 0;
    const value = win.getComputedStyle(element).zIndex;
    if (value === "auto" || value === "") return 0;
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

export function resolveStackingContextKey(item: StackingContextDescriptor): string {
  return item.stackingContextId ?? item.parentCompositionId ?? item.compositionAncestors[0] ?? "";
}

function resolveStackingContextDepth(item: StackingContextDescriptor): number {
  const contextKey = resolveStackingContextKey(item);
  if (!contextKey) return 0;
  const index = item.compositionAncestors.indexOf(contextKey);
  return index >= 0 ? index : 0;
}

export function resolveContextOrder<T extends ContextOrderItem>(items: readonly T[]): T[] {
  if (items.length === 0) return [];

  const groups = new Map<
    string,
    { firstIndex: number; depth: number; entries: Array<{ item: T; index: number }> }
  >();

  items.forEach((item, index) => {
    const key = resolveStackingContextKey(item);
    const group = groups.get(key);
    if (group) {
      group.entries.push({ item, index });
      return;
    }
    groups.set(key, {
      firstIndex: index,
      depth: resolveStackingContextDepth(item),
      entries: [{ item, index }],
    });
  });

  return [...groups.values()]
    .sort((a, b) => a.depth - b.depth || a.firstIndex - b.firstIndex)
    .flatMap((group) =>
      group.entries
        .sort((a, b) => b.item.zIndex - a.item.zIndex || a.index - b.index)
        .map((entry) => entry.item),
    );
}

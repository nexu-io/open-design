import type { DomEditLayerItem } from "./domEditingTypes";
import { getElementZIndex } from "../../player/lib/layerOrdering";

interface CollapsedState {
  [key: string]: boolean;
}

// ── Pure helpers ──────────────────────────────────────────────────────

// fallow-ignore-next-line complexity
export function sortLayersByZIndex(layers: DomEditLayerItem[]): DomEditLayerItem[] {
  if (layers.length <= 1) return layers;

  const minDepth = layers[0].depth;
  for (let i = 1; i < layers.length; i++) {
    if (layers[i].depth < minDepth) return layers;
  }

  const chunks: Array<{ root: DomEditLayerItem; children: DomEditLayerItem[]; domIndex: number }> =
    [];

  for (let i = 0; i < layers.length; i++) {
    if (layers[i].depth === minDepth) {
      const children: DomEditLayerItem[] = [];
      let j = i + 1;
      while (j < layers.length && layers[j].depth > minDepth) {
        children.push(layers[j]);
        j++;
      }
      chunks.push({ root: layers[i], children, domIndex: chunks.length });
    }
  }

  if (chunks.length <= 1) {
    if (chunks.length === 1 && chunks[0].children.length > 0) {
      const sorted = sortLayersByZIndex(chunks[0].children);
      return [chunks[0].root, ...sorted];
    }
    return layers;
  }

  chunks.sort((a, b) => {
    const zA = getElementZIndex(a.root.element);
    const zB = getElementZIndex(b.root.element);
    if (zA !== zB) return zB - zA;
    return b.domIndex - a.domIndex;
  });

  const result: DomEditLayerItem[] = [];
  for (const chunk of chunks) {
    result.push(chunk.root);
    if (chunk.children.length > 0) {
      result.push(...sortLayersByZIndex(chunk.children));
    }
  }
  return result;
}

export function getVisibleLayers(
  layers: DomEditLayerItem[],
  collapsed: CollapsedState,
): DomEditLayerItem[] {
  if (Object.keys(collapsed).length === 0) return layers;

  const result: DomEditLayerItem[] = [];
  let skipDepth = -1;

  for (const layer of layers) {
    if (skipDepth >= 0 && layer.depth > skipDepth) continue;
    skipDepth = -1;

    result.push(layer);

    if (collapsed[layer.key] && layer.childCount > 0) {
      skipDepth = layer.depth;
    }
  }

  return result;
}

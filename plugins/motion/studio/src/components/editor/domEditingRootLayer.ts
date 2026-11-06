import { parsePx } from "./domEditingDom";

const COMPOSITION_ROOT_LAYER_EPSILON_PX = 1;

function readPositiveDimension(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function approximatelyEqual(a: number, b: number) {
  return Math.abs(a - b) <= COMPOSITION_ROOT_LAYER_EPSILON_PX;
}

function getCompositionRootBounds(doc: Document) {
  const root =
    doc.querySelector<HTMLElement>("[data-composition-id]") ?? doc.documentElement ?? null;
  const rootWidth = readPositiveDimension(root?.getAttribute("data-width") ?? null);
  const rootHeight = readPositiveDimension(root?.getAttribute("data-height") ?? null);
  if (!root || !rootWidth || !rootHeight) return null;
  return { rect: root.getBoundingClientRect(), width: rootWidth, height: rootHeight };
}

function getRenderedLayerSize(element: HTMLElement, computedStyles: Record<string, string>) {
  const rect = element.getBoundingClientRect();
  const width = rect.width || parsePx(computedStyles.width);
  const height = rect.height || parsePx(computedStyles.height);
  return width && height ? { width, height } : null;
}

function matchesCompositionRootBounds(
  elementRect: DOMRect,
  elementSize: { width: number; height: number },
  rootBounds: { rect: DOMRect; width: number; height: number },
) {
  return (
    approximatelyEqual(elementRect.left, rootBounds.rect.left) &&
    approximatelyEqual(elementRect.top, rootBounds.rect.top) &&
    approximatelyEqual(elementSize.width, rootBounds.width) &&
    approximatelyEqual(elementSize.height, rootBounds.height)
  );
}

function isExplicitFullBleedLayer(computedStyles: Record<string, string>) {
  return computedStyles.position === "absolute" || computedStyles.position === "fixed";
}

export function isCompositionRootLayer(
  element: HTMLElement,
  doc: Document,
  computedStyles: Record<string, string>,
) {
  if (element.parentElement !== doc.body) return false;
  if (element.hasAttribute("data-hf-allow-root-edit")) return false;
  if (isExplicitFullBleedLayer(computedStyles)) return false;

  const rootBounds = getCompositionRootBounds(doc);
  const elementSize = getRenderedLayerSize(element, computedStyles);
  return Boolean(
    rootBounds &&
    elementSize &&
    matchesCompositionRootBounds(element.getBoundingClientRect(), elementSize, rootBounds),
  );
}

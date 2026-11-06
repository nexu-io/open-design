import type { DomEditSelection } from "./domEditing";

export interface DomEditSelectionShapeStyles {
  borderRadius: string | number;
  clipPath?: string;
}

export function readDomEditSelectionShapeStyles(
  selection: DomEditSelection | null,
): DomEditSelectionShapeStyles {
  const fallback = {
    borderRadius: 8,
    clipPath: undefined,
  };
  if (!selection?.element) return fallback;
  try {
    const tag = selection.element.tagName.toLowerCase();
    if (tag === "svg" || tag === "img" || tag === "video" || tag === "canvas") return fallback;
    const win = selection.element.ownerDocument.defaultView;
    if (!win) return fallback;
    const cs = win.getComputedStyle(selection.element);
    const borderRadius = cs.borderRadius;
    const clipPath = cs.clipPath;
    return {
      borderRadius: borderRadius && borderRadius !== "0px" ? borderRadius : 4,
      clipPath: clipPath && clipPath !== "none" ? clipPath : undefined,
    };
  } catch {
    return fallback;
  }
}

/** Selection-box chrome: none when the crop-outline child draws it, inset
 *  shadow for clip-mirrored shapes, plain border otherwise. */
export function resolveBoxChromeClass(hasCropOutline: boolean, boxClipPath?: string): string {
  if (hasCropOutline) return "";
  if (boxClipPath) return "shadow-[inset_0_0_0_2px_rgba(60,230,172,0.6)]";
  return "border border-studio-accent/80 shadow-[0_0_0_1px_rgba(60,230,172,0.25)]";
}

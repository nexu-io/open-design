import { CLIP_TRIM_HIT_PX } from "./timelineTheme";

export type FadeEdge = "in" | "out";

export const FADE_TAB_WIDTH = 4;
const FADE_HANDLE_HIT = 24;
export const FADE_TAB_CENTER_IN_HIT = 8;
const TAB_INSET = 7;

/** The clip as drawn; `toolsLeft` is where its FX badge starts, null when it has none. */
export interface FadeHandleClipBox {
  width: number;
  height: number;
  radius: number;
  toolsLeft: number | null;
}

/** A fade handle's hit box in px from the clip's top left; `tabLeft` is its tab's centre within it. */
export interface FadeHandleBox {
  left: number;
  width: number;
  height: number;
  tabLeft: number;
  top: number;
}

function topEdgeY(x: number, widthPx: number, heightPx: number, radiusPx: number): number {
  const r = Math.min(radiusPx, widthPx / 2, heightPx / 2);
  const d = x < r ? r - x : x > widthPx - r ? x - (widthPx - r) : 0;
  return d > 0 ? r - Math.sqrt(Math.max(0, r * r - d * d)) : 0;
}

/**
 * Where the fade handles sit on a clip `widthPx` wide: each centred on its fade's end, inside the
 * clip and left of its tools; two drawn handles that would overlap split at the midpoint.
 */
export function fadeHandleBoxes(input: {
  widthPx: number;
  inPx: number;
  outPx: number;
  clipBox: FadeHandleClipBox;
  drawn: Record<FadeEdge, boolean>;
}): Record<FadeEdge, FadeHandleBox> {
  const { widthPx, inPx, outPx, clipBox, drawn } = input;
  const clipWidth = clipBox.toolsLeft === null ? widthPx : clipBox.width;
  const edgeInset = clipBox.toolsLeft === null ? 0 : CLIP_TRIM_HIT_PX;
  // Reserve FX horizontally so fades keep their top-edge lane above compact keyframe centres.
  const rightEdge =
    clipBox.toolsLeft === null ? clipWidth : Math.min(clipWidth - edgeInset, clipBox.toolsLeft);
  const hitWidth = Math.min(FADE_HANDLE_HIT, (rightEdge - edgeInset) / 2);
  const tabX = (edge: FadeEdge) => {
    const knee = edge === "in" ? inPx : clipWidth - outPx;
    const tabInset = edgeInset === 0 ? TAB_INSET : FADE_TAB_WIDTH;
    const inset = Math.min(tabInset, (rightEdge - edgeInset) / 2);
    return Math.min(rightEdge - inset, Math.max(edgeInset + inset, knee));
  };
  const boxLeft = (x: number) =>
    Math.min(rightEdge - hitWidth, Math.max(edgeInset, x - hitWidth / 2));
  const [inX, outX] = [tabX("in"), tabX("out")];
  const mid = (inX + outX) / 2;
  const overlap = drawn.in && drawn.out && boxLeft(inX) + hitWidth > boxLeft(outX);
  const box = (edge: FadeEdge): FadeHandleBox => {
    const x = edge === "in" ? inX : outX;
    const [left, right] = !overlap
      ? [boxLeft(x), boxLeft(x) + hitWidth]
      : edge === "in"
        ? [Math.max(edgeInset, mid - hitWidth), mid]
        : [mid, Math.min(rightEdge, mid + hitWidth)];
    const edgeY = topEdgeY(x, clipWidth, clipBox.height, clipBox.radius);
    const top = edgeY + 1 - FADE_TAB_CENTER_IN_HIT;
    return { left, width: right - left, height: FADE_HANDLE_HIT, tabLeft: x - left, top };
  };
  return { in: box("in"), out: box("out") };
}

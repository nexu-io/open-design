type Point = { x: number; y: number };

const LAYER_BOX = '[data-dom-edit-selection-box="true"]';
export const SELECTION_CHROME = `${LAYER_BOX}, [data-dom-edit-chrome="true"], [data-dom-edit-crop-frame="true"]`;

/** How far a node's dot reaches; a selected node draws it larger. */
export const dotRadius = (r: number, selected: boolean) => (selected ? r * 1.5 : r);

export function controlUnder(e: React.PointerEvent): Element | null {
  const path = e.currentTarget.closest("svg");
  const hits = e.currentTarget.ownerDocument.elementsFromPoint(e.clientX, e.clientY);
  const hit = hits.find((el) => !path?.contains(el));
  return hit?.closest(SELECTION_CHROME) ? hit : null;
}

/** The handle or box above a node, else the box if the layer sits at the node; null: the node. */
export function controlForNode(
  e: React.PointerEvent,
  pressed: Point,
  live: Point | null,
): Element | null {
  const atLayer = live && Math.abs(pressed.x - live.x) < 0.5 && Math.abs(pressed.y - live.y) < 0.5;
  return (
    controlUnder(e) ?? (atLayer ? e.currentTarget.ownerDocument.querySelector(LAYER_BOX) : null)
  );
}

/** Hands a press to `control`; true when it started a gesture with it. */
export function pressControl(e: React.PointerEvent, control: Element | null): boolean {
  if (!control || getComputedStyle(control).pointerEvents === "none") return false;
  return !control.dispatchEvent(new PointerEvent("pointerdown", e.nativeEvent));
}

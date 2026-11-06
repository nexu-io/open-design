// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { controlForNode, controlUnder, pressControl } from "./motionPathLayerNode";

// Keyframe nodes at x 60 and 120 (y 30); GSAP renders the layer at the first.
const atLayer = { x: 60, y: 30 };
const other = { x: 120, y: 30 };
const live = { x: 60, y: 30 };

// The editor overlay: the selection's chrome (box and a handle) and another layer's off-canvas marker.
const overlay = document.createElement("div");
const chrome = document.createElement("div");
chrome.setAttribute("data-dom-edit-chrome", "true");
const box = document.createElement("div");
box.setAttribute("data-dom-edit-selection-box", "true");
const handle = document.createElement("button");
const marker = document.createElement("div");
chrome.append(box, handle);
overlay.append(chrome, marker);
const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
svg.append(line, circle);
document.body.append(overlay, svg);

/** A press on `circle`, with `under` what the document hit-tests below it. */
function press(under: Element[]) {
  document.elementsFromPoint = () => [circle, line, ...under];
  return { currentTarget: circle, clientX: 0, clientY: 0 } as unknown as React.PointerEvent;
}

it("the node GSAP renders the layer at is the layer, inside the box or out", () => {
  expect(controlForNode(press([box, overlay]), atLayer, live)).toBe(box);
  expect(controlForNode(press([overlay]), atLayer, live)).toBe(box);
});

it("inside the layer's box any other node is the layer's, so a drag from its middle moves it", () => {
  expect(controlForNode(press([box, overlay]), other, live)).toBe(box);
  expect(controlForNode(press([box, overlay]), other, null)).toBe(box);
});

it("a handle above the box under a node takes the press, not the box or the node", () => {
  expect(controlForNode(press([handle, box, overlay]), other, live)).toBe(handle);
  expect(controlForNode(press([handle, box, overlay]), atLayer, live)).toBe(handle);
  expect(controlUnder(press([handle, overlay]))).toBe(handle);
});

it("outside the layer's box and its handles a node is the node's", () => {
  expect(controlForNode(press([overlay]), other, live)).toBeNull();
  expect(controlForNode(press([marker, overlay]), other, live)).toBeNull();
  expect(controlForNode(press([document.body]), other, live)).toBeNull();
});

it("hands a press to the control with its pointer and position", () => {
  const got: number[][] = [];
  const listen = (e: Event) => {
    const p = e as PointerEvent;
    got.push([p.pointerId, p.clientX, p.clientY, p.button]);
    e.preventDefault();
  };
  handle.addEventListener("pointerdown", listen);
  const nativeEvent = new PointerEvent("pointerdown", {
    pointerId: 7,
    clientX: 12,
    clientY: 34,
    button: 0,
    bubbles: true,
    cancelable: true,
  });
  const down = { currentTarget: circle, nativeEvent } as unknown as React.PointerEvent;
  expect(pressControl(down, handle)).toBe(true);
  expect(got).toEqual([[7, 12, 34, 0]]);
  expect(pressControl(down, null)).toBe(false);
  handle.removeEventListener("pointerdown", listen);
});

it("keeps the press when the control does not start a gesture with it, or takes no pointer", () => {
  let got = 0;
  const listen = () => void got++;
  box.addEventListener("pointerdown", listen);
  const nativeEvent = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
  const down = { currentTarget: circle, nativeEvent } as unknown as React.PointerEvent;
  expect(pressControl(down, box)).toBe(false);
  expect(got).toBe(1);
  box.style.pointerEvents = "none";
  expect(pressControl(down, box)).toBe(false);
  expect(got).toBe(1);
  box.style.pointerEvents = "";
  box.removeEventListener("pointerdown", listen);
});

import { isHtmlElement } from "./domEditingDom";

// `data-hf-group` selection semantics: a group wrapper is selected as one unit
// until the user drills into it; once drilled in, clicks resolve to its children
// (or to the next nested group inside it). One level of drill-in at a time keeps
// nested groups navigable.

export type GroupCapture =
  | { kind: "unit"; element: HTMLElement } // select this group wrapper as one unit
  | { kind: "child" } // resolve the clicked element normally
  | { kind: "out-of-scope" }; // clicked outside the drilled-into group → select nothing

// Layer-tree roots: the drilled-into group's element children, else the doc root.
export function groupScopedLayerRoots(
  root: HTMLElement,
  activeGroupElement: HTMLElement | null,
): HTMLElement[] {
  const els = activeGroupElement?.isConnected ? Array.from(activeGroupElement.children) : [root];
  return els.filter(isHtmlElement);
}

export function resolveGroupCapture(
  startEl: HTMLElement,
  activeGroupElement: HTMLElement | null,
): GroupCapture {
  const groups: HTMLElement[] = [];
  for (let n: HTMLElement | null = startEl; n; n = n.parentElement) {
    if (n.hasAttribute("data-hf-group")) groups.push(n);
  }
  const result = ((): GroupCapture => {
    if (!activeGroupElement) {
      const outermost = groups[groups.length - 1];
      return outermost ? { kind: "unit", element: outermost } : { kind: "child" };
    }
    const idx = groups.indexOf(activeGroupElement);
    if (idx === -1) return { kind: "out-of-scope" };
    const nestedInside = groups[idx - 1];
    return nestedInside ? { kind: "unit", element: nestedInside } : { kind: "child" };
  })();
  return result;
}

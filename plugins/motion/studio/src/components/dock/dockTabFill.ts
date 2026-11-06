import type { DockviewApi } from "dockview-react";

const TAB_FILL_CLASS = "hf-dock-tab-fill";

/** The strip's one fill, created on first use. Dockview inserts tabs before tabs, so it stays first. */
function fillOf(list: HTMLElement): HTMLElement {
  const existing = list.querySelector<HTMLElement>(`:scope > .${TAB_FILL_CLASS}`);
  if (existing) return existing;
  const fill = document.createElement("span");
  fill.className = TAB_FILL_CLASS;
  fill.setAttribute("aria-hidden", "true");
  list.prepend(fill);
  // Placed once without motion; only later moves slide.
  requestAnimationFrame(() => fill.setAttribute("data-ready", ""));
  return fill;
}

/** A strip's width and where its shown tab sits, as of the last pass. */
type StripShape = { width: number; tab: HTMLElement | null; left: number; size: number };

/**
 * True when the strip narrowed or its shown tab moved or resized since it was last visible. dockview
 * reveals a tab only when it is activated, and the user's own scrolling changes none of these.
 */
function reshaped(before: StripShape | undefined, now: StripShape) {
  if (!before || now.width === 0) return false;
  if (now.width < before.width) return true;
  return now.tab !== before.tab || now.left !== before.left || now.size !== before.size;
}

/** The scroll that shows the whole shown tab, e.g. after the strip narrows because its actions appeared. */
function revealedScroll(shape: StripShape, scrollLeft: number) {
  if (shape.left < scrollLeft) return shape.left;
  // Offset sizes are rounded while the tab's edge is fractional; a pixel over is clamped at the end.
  return Math.max(scrollLeft, shape.left + shape.size + 1 - shape.width);
}

/** Reads where the shown tab sits; the write happens after every strip is read, so layout runs once. */
function measureFill(list: HTMLElement, shapes: WeakMap<HTMLElement, StripShape>): () => void {
  const fill = fillOf(list);
  const tab = list.querySelector<HTMLElement>(":scope > .dv-active-tab");
  const shape = {
    width: list.clientWidth,
    tab,
    left: tab?.offsetLeft ?? 0,
    size: tab?.offsetWidth ?? 0,
  };
  const reveal = tab !== null && reshaped(shapes.get(list), shape);
  // A hidden strip (another group maximised) keeps its scroll, so it is compared with its last visible shape.
  if (shape.width > 0) shapes.set(list, shape);
  const scrollLeft = list.scrollLeft;
  const target = reveal ? revealedScroll(shape, scrollLeft) : scrollLeft;
  return () => {
    fill.hidden = !tab;
    if (!tab) return;
    fill.style.width = `${shape.size}px`;
    fill.style.transform = `translateX(${shape.left}px)`;
    if (target !== scrollLeft) list.scrollLeft = target;
  };
}

/** Marks which edges of a scrolled strip are clipped, for the CSS edge fade. */
function markClippedEdges(list: HTMLElement) {
  const edges = [];
  if (list.scrollLeft > 0) edges.push("start");
  if (list.scrollLeft + list.clientWidth < list.scrollWidth - 1) edges.push("end");
  const value = edges.join(" ");
  if (value) list.setAttribute("data-clipped", value);
  else list.removeAttribute("data-clipped");
}

/**
 * Slides one fill per tab strip under its shown tab, keeps that tab in view, and keeps the
 * clipped-edge marks current.
 * Returns a disposer.
 */
export function installTabFill(api: DockviewApi, root: HTMLElement): () => void {
  const lists = () => root.querySelectorAll<HTMLElement>(".dv-tabs-container");
  // Tab widths also change with no dockview event: a renamed title, a late web font.
  const resizeObserver = new ResizeObserver(() => placeAll());
  const observed = new Set<Element>();
  function observe(elements: Iterable<Element>) {
    for (const element of observed) {
      if (element.isConnected) continue;
      resizeObserver.unobserve(element);
      observed.delete(element);
    }
    for (const element of elements) {
      if (observed.has(element)) continue;
      resizeObserver.observe(element);
      observed.add(element);
    }
  }
  const shapes = new WeakMap<HTMLElement, StripShape>();
  function placeAll() {
    const strips = [...lists()];
    const writes = strips.map((list) => measureFill(list, shapes));
    for (const write of writes) write();
    for (const list of strips) markClippedEdges(list);
    observe(strips.flatMap((list) => [list, ...list.querySelectorAll(":scope > .dv-tab")]));
  }
  const onScroll = (event: Event) => {
    const list = event.target;
    if (list instanceof HTMLElement && list.classList.contains("dv-tabs-container")) {
      markClippedEdges(list);
    }
  };
  const subscriptions = [
    api.onDidActivePanelChange(placeAll),
    api.onDidAddPanel(placeAll),
    api.onDidRemovePanel(placeAll),
    api.onDidMovePanel(placeAll),
    api.onDidLayoutChange(placeAll),
    api.onDidLayoutFromJSON(placeAll),
  ];
  // Scroll does not bubble; a capturing listener still sees every strip's.
  root.addEventListener("scroll", onScroll, true);
  placeAll();
  return () => {
    root.removeEventListener("scroll", onScroll, true);
    for (const subscription of subscriptions) subscription.dispose();
    resizeObserver.disconnect();
  };
}

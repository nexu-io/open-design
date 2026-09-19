/**
 * Whether a captured `scroll` event moved `anchor` on screen — and so should
 * dismiss a floating menu positioned against it.
 *
 * A menu anchored to a button has to close when that button scrolls away from
 * under it: the document (window) scrolling, or any scroll container the
 * button sits inside. A scroll anywhere else on the page leaves the anchor
 * exactly where it was, and the menu must stay. The chat transcript is the
 * case that matters (OPEND-3283): under a running turn it auto-scrolls every
 * few hundred milliseconds, and a document-wide capturing listener closed the
 * project switcher's row menu before it could be used.
 *
 * With no anchor to compare against, every scroll counts as movement — the
 * conservative answer for a menu whose trigger was never recorded.
 */
export function scrollMovesAnchor(event: Event, anchor: Element | null | undefined): boolean {
  if (!anchor) return true;
  const target = event.target;
  if (target === document || target === window || target === document.documentElement) return true;
  return target instanceof Node && target !== anchor && target.contains(anchor);
}

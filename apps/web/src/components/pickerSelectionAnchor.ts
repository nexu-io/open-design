/**
 * Opening a picker must land on the choice already in effect.
 *
 * Every model list in the app caps its height and scrolls — the compact home
 * list at six rows, the searchable popover at 280px — so a catalog longer than
 * the cap opens on its first row with the model actually running below the
 * fold. The user then hunts for a selection the list has already made
 * (OPEND-2812). `anchorSelectionInView` puts the rows the list itself marks as
 * selected back inside their scroller the moment the list appears.
 *
 * It reads the selection off the rendered DOM instead of taking an element:
 * "which row is selected" is decided exactly once, by the same attribute the
 * accessibility tree exposes (`aria-checked` / `aria-selected` / a mirroring
 * `data-selected`), so there is no second copy of that state to drift out of
 * sync. Nothing marked selected means nothing moves — a list with no choice in
 * effect must not be scrolled anywhere.
 *
 * `block: 'nearest'` keeps the movement minimal: a row already visible stays
 * put, and no scroller beyond the list's own is disturbed. `scrollIntoView` is
 * called optionally because layout-free environments (jsdom) do not implement
 * it.
 */
export function anchorSelectionInView(
  container: HTMLElement | null | undefined,
  selectedSelector: string,
): void {
  if (!container) return;
  for (const row of Array.from(
    container.querySelectorAll<HTMLElement>(selectedSelector),
  )) {
    row.scrollIntoView?.({ block: 'nearest' });
  }
}

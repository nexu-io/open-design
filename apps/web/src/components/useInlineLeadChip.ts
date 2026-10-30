import { useEffect, type RefObject } from 'react';

/**
 * Seats a template chip at the start of a prompt's first line, the way Home's
 * composer does: the chip row is taken out of flow (`is-chip-inline` on the
 * flow element) and the editor indents its first line by the chip's measured
 * width. Writes `${varPrefix}-w`, `${varPrefix}-text-left` and
 * `${varPrefix}-lead` on the flow element for the CSS to consume.
 */
export function useInlineLeadChip(
  flowRef: RefObject<HTMLElement | null>,
  chipRowRef: RefObject<HTMLElement | null>,
  active: boolean,
  varPrefix: string,
) {
  useEffect(() => {
    const flow = flowRef.current;
    if (!flow) return;
    const clear = () => {
      flow.classList.remove('is-chip-inline');
      flow.style.removeProperty(`${varPrefix}-w`);
      flow.style.removeProperty(`${varPrefix}-text-left`);
      flow.style.removeProperty(`${varPrefix}-lead`);
    };
    const row = chipRowRef.current;
    if (!active || !row) {
      clear();
      return;
    }
    if (typeof ResizeObserver === 'undefined') return;
    const apply = () => {
      const rect = row.getBoundingClientRect();
      // Inline mode only fits a SINGLE line of chips: the row is taken out of
      // flow there, so a wrapped (multi-line) row would overlap the prompt text
      // instead of pushing it down. Anything taller falls back to the stacked
      // row above the editor.
      if (rect.width <= 0 || rect.height > 36) {
        clear();
        return;
      }
      // Wrapped lines align with the chip's own content edge (its icon), not
      // its border box — measured so a padding/border change can't desync it.
      const content = row.querySelector('.home-hero__active-icon, .home-hero__active-label');
      const textLeft = content ? content.getBoundingClientRect().left - rect.left : 0;
      // The chip is taller than one line of prompt text, so both starting at the
      // flow's top would leave the first line riding high against it. Drop the
      // text by half the difference instead of lifting the chip: a negative
      // offset would be clipped by this flow's own `overflow`.
      const editable = flow.querySelector('.composer-editable, [contenteditable="true"]');
      const lineHeight = editable ? parseFloat(getComputedStyle(editable).lineHeight) : Number.NaN;
      const lead = Number.isFinite(lineHeight) ? Math.max(0, (rect.height - lineHeight) / 2) : 0;
      flow.style.setProperty(`${varPrefix}-w`, `${rect.width}px`);
      flow.style.setProperty(`${varPrefix}-text-left`, `${Math.max(0, textLeft)}px`);
      flow.style.setProperty(`${varPrefix}-lead`, `${lead}px`);
      flow.classList.add('is-chip-inline');
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(row);
    return () => {
      observer.disconnect();
      clear();
    };
  }, [flowRef, chipRowRef, active, varPrefix]);
}

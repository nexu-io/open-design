export const QUOTE_POPOVER_GAP_PX = 7;
export const QUOTE_POPOVER_SAFE_INSET_PX = 12;

/**
 * Space available above the quote chip, inside the ChatPanel boundary.
 * The popover is anchored above the chip, so a viewport-relative constant
 * cannot keep it inside shorter or vertically-offset panels.
 */
export function quotePopoverMaxHeight(input: {
  anchorTop: number;
  panelTop: number;
  gap?: number;
  safeInset?: number;
}): number {
  const gap = input.gap ?? QUOTE_POPOVER_GAP_PX;
  const safeInset = input.safeInset ?? QUOTE_POPOVER_SAFE_INSET_PX;
  return Math.max(0, Math.floor(input.anchorTop - input.panelTop - gap - safeInset));
}

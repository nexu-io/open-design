// Pure side-placement decision for the composer "+" submenu flyout.
//
// Extracted from getFlyoutPlacement so the boundary arithmetic is
// unit-testable without a DOM. The key invariant: `flyoutWidth` must be the
// ACTUAL rendered flyout width, or a pane that could fit the side-by-side
// layout silently falls back to the stacked "contained" layout (this is the
// bug the plugins-flyout width over-reserve caused — see PLUS_MENU_PLUGIN_FLYOUT_WIDTH).

export type FlyoutSide = 'right' | 'left' | 'contained';

export interface FlyoutPlacementInput {
  /** Left edge of the parent "+" menu popup (viewport px). */
  menuLeft: number;
  /** Width of the parent "+" menu popup (px). */
  menuWidth: number;
  /** Rendered flyout width (px) — must match the CSS box. */
  flyoutWidth: number;
  /** Gap between the popup and the flyout (px). */
  gap: number;
  /** Left/right bounds the flyout must stay within (viewport or pane). */
  boundaryLeft: number;
  boundaryRight: number;
}

export function resolveFlyoutSide({
  menuLeft,
  menuWidth,
  flyoutWidth,
  gap,
  boundaryLeft,
  boundaryRight,
}: FlyoutPlacementInput): FlyoutSide {
  if (menuLeft + menuWidth + gap + flyoutWidth <= boundaryRight) return 'right';
  if (menuLeft - gap - flyoutWidth >= boundaryLeft) return 'left';
  return 'contained';
}

// Adobe Premiere default: action-safe and title-safe margins are 10% and 20% total (5% and 10% per edge).
export const ACTION_SAFE_PERCENT = 90;
export const TITLE_SAFE_PERCENT = 80;

export const SAFE_BOX_PERCENTS = [ACTION_SAFE_PERCENT, TITLE_SAFE_PERCENT] as const;

/** Inset from each frame edge, as a percent of the frame. */
export function safeBoxInsetPercent(boxPercent: number): number {
  return (100 - boxPercent) / 2;
}

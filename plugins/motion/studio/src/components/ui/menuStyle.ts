/** The one owner of context menu spacing: rows touch the panel, which clips to its rounded corners. */
export const menuClasses = {
  panel: "overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 shadow-lg",
  group: "empty:hidden border-b border-neutral-700/60",
  divider: "border-t border-neutral-700/60",
  row: "w-full px-3 py-1.5 text-left text-xs outline-hidden",
  rowEnabled: "text-neutral-300 hover:bg-neutral-800 focus-visible:bg-neutral-800 cursor-pointer",
  rowDanger: "text-danger-ink hover:bg-danger/25 focus-visible:bg-danger/25 cursor-pointer",
  rowDisabled: "text-neutral-600 cursor-not-allowed",
} as const;

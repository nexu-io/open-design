// Browser-bridge home for the project-view slice's capture-phase keyboard
// shortcuts (currently just Continue in CLI's ⌘/Ctrl+Shift+K). The DOM
// registration lives here; the key-combo decision is pure and lives in
// `rules.ts` (`isContinueInCliShortcut`).
export function subscribeCapturedKeyDown(
  onKeyDown: (event: KeyboardEvent) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('keydown', onKeyDown, { capture: true });
  return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
}

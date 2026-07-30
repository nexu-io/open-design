/**
 * Keyboard-shortcut hints for manual edit chrome. Every button whose action
 * also has a keyboard shortcut shows it inside the hover tooltip, formatted
 * for the current platform (⌘Z on Apple platforms, Ctrl+Z elsewhere).
 */

export type ManualEditShortcutAction =
  | 'undo'
  | 'redo'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'duplicate'
  | 'delete';

export function isApplePlatform(
  nav: { platform?: string; userAgent?: string } | undefined = typeof navigator !== 'undefined' ? navigator : undefined,
): boolean {
  const probe = `${nav?.platform ?? ''} ${nav?.userAgent ?? ''}`;
  return /mac|iphone|ipad|ipod/i.test(probe);
}

const APPLE_HINTS: Record<ManualEditShortcutAction, string> = {
  undo: '⌘Z',
  redo: '⇧⌘Z',
  bold: '⌘B',
  italic: '⌘I',
  underline: '⌘U',
  duplicate: '⌘D',
  delete: '⌫',
};

const GENERIC_HINTS: Record<ManualEditShortcutAction, string> = {
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Shift+Z',
  bold: 'Ctrl+B',
  italic: 'Ctrl+I',
  underline: 'Ctrl+U',
  duplicate: 'Ctrl+D',
  delete: 'Delete',
};

export function manualEditShortcutHint(
  action: ManualEditShortcutAction,
  apple: boolean = isApplePlatform(),
): string {
  return (apple ? APPLE_HINTS : GENERIC_HINTS)[action];
}

/** Tooltip text: the localized label plus the shortcut when one exists. */
export function manualEditTooltip(
  label: string,
  action?: ManualEditShortcutAction,
  apple?: boolean,
): string {
  if (!action) return label;
  return `${label} (${manualEditShortcutHint(action, apple)})`;
}

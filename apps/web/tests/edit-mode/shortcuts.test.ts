import { describe, expect, it } from 'vitest';
import { isApplePlatform, manualEditShortcutHint, manualEditTooltip } from '../../src/edit-mode/shortcuts';

describe('manual edit shortcut hints', () => {
  it('detects Apple platforms from platform or userAgent', () => {
    expect(isApplePlatform({ platform: 'MacIntel' })).toBe(true);
    expect(isApplePlatform({ platform: '', userAgent: 'Mozilla/5.0 (iPhone; ...)' })).toBe(true);
    expect(isApplePlatform({ platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })).toBe(false);
    expect(isApplePlatform({})).toBe(false);
  });

  it('formats platform-appropriate shortcut hints', () => {
    expect(manualEditShortcutHint('undo', true)).toBe('⌘Z');
    expect(manualEditShortcutHint('undo', false)).toBe('Ctrl+Z');
    expect(manualEditShortcutHint('redo', true)).toBe('⇧⌘Z');
    expect(manualEditShortcutHint('redo', false)).toBe('Ctrl+Shift+Z');
    expect(manualEditShortcutHint('delete', true)).toBe('⌫');
    expect(manualEditShortcutHint('delete', false)).toBe('Delete');
  });

  it('appends the hint to the localized label only when an action is given', () => {
    expect(manualEditTooltip('Undo', 'undo', true)).toBe('Undo (⌘Z)');
    expect(manualEditTooltip('Bold', 'bold', false)).toBe('Bold (Ctrl+B)');
    expect(manualEditTooltip('Strikethrough')).toBe('Strikethrough');
  });
});

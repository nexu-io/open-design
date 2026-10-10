// @vitest-environment jsdom
//
// The theme is a preference again: `light` / `dark` / `system` all paint the
// document, and the only invariant left is that `data-theme` is ALWAYS
// stamped — every install that ever used the old picker still has a theme in
// localStorage, and a stored value must now reach the document instead of
// being coerced away. These specs pin the preference at all three places a
// theme can reach the document: the config parser, the runtime appearance
// applier, and the pre-hydration inline script that paints before React mounts.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyAppearanceToDocument } from '../../src/state/appearance';
import { DEFAULT_CONFIG, loadConfig } from '../../src/state/config';
import type { AppConfig, AppTheme } from '../../src/types';

const STORAGE_KEY = 'open-design:config';
const store = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    store.delete(key);
  }),
  clear: vi.fn(() => {
    store.clear();
  }),
});

function persist(config: Partial<AppConfig>): void {
  store.set(STORAGE_KEY, JSON.stringify(config));
}

/** Pretend the OS is (or is not) in dark mode, the way a user's browser is. */
function stubSystemPrefersDark(prefersDark: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: prefersDark && query.includes('prefers-color-scheme: dark'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('theme preference — persisted config', () => {
  beforeEach(() => {
    store.clear();
  });

  it('defaults a fresh install to the light theme', () => {
    expect(DEFAULT_CONFIG.theme).toBe('light');
    expect(loadConfig().theme).toBe('light');
  });

  it('keeps an already-persisted dark theme on read', () => {
    persist({ theme: 'dark', accentColor: '#4F46E5' });

    const config = loadConfig();

    expect(config.theme).toBe('dark');
    // Unrelated preferences must survive alongside the theme.
    expect(config.accentColor).toBe('#4f46e5');
  });

  it('keeps a persisted system theme on read, even when the OS prefers dark', () => {
    stubSystemPrefersDark(true);
    persist({ theme: 'system' });

    expect(loadConfig().theme).toBe('system');
  });

  it('normalizes an unrecognized persisted theme back to the default', () => {
    persist({ theme: 'purple' as AppTheme });

    expect(loadConfig().theme).toBe('light');
  });
});

describe('theme preference — document', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('stamps the light theme on the root element', () => {
    applyAppearanceToDocument({ theme: 'light', accentColor: '#059669' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('stamps the dark theme on the root element', () => {
    applyAppearanceToDocument({ theme: 'dark', accentColor: '#059669' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('overwrites a stale theme stamp when a different theme is applied', () => {
    document.documentElement.setAttribute('data-theme', 'dark');

    applyAppearanceToDocument({ theme: 'light', accentColor: '#059669' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('resolves a system theme against the OS preference (dark)', () => {
    stubSystemPrefersDark(true);

    applyAppearanceToDocument({ theme: 'system' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('resolves a system theme against the OS preference (light)', () => {
    stubSystemPrefersDark(false);

    applyAppearanceToDocument({ theme: 'system' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  // Every JS theme reader in apps/web (shiki, ConnectorLogo, SketchEditor,
  // TerminalViewer, connectorBrandColor…) checks `data-theme` first and only
  // falls back to `prefers-color-scheme` when the attribute is ABSENT, and
  // every `@media (prefers-color-scheme: dark)` CSS block is gated on
  // `html:not([data-theme])`. So the attribute always being present is what
  // keeps every surface reading the same theme, including for `system`.
  it('never leaves the root element without an explicit theme', () => {
    stubSystemPrefersDark(true);

    applyAppearanceToDocument({ theme: 'system', accentColor: '#10B981' });

    expect(document.documentElement.hasAttribute('data-theme')).toBe(true);
  });

  it('still stamps light when the persisted theme is missing', () => {
    applyAppearanceToDocument({ accentColor: '#10B981' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

describe('theme preference — pre-hydration script', () => {
  const layoutPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../app/layout.tsx',
  );

  function runThemeInitScript(): void {
    const source = readFileSync(layoutPath, 'utf8');
    const match = /const themeInitScript = `([^`]*)`;/.exec(source);
    if (!match?.[1]) throw new Error('themeInitScript not found in app/layout.tsx');
    // eslint-disable-next-line no-new-func
    new Function(match[1])();
  }

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    store.clear();
  });

  it('paints dark before hydration when the stored theme is dark', () => {
    persist({ theme: 'dark' });

    runThemeInitScript();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('resolves a stored system theme before hydration on a dark OS', () => {
    stubSystemPrefersDark(true);
    persist({ theme: 'system' });

    runThemeInitScript();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('resolves a stored system theme before hydration on a light OS', () => {
    stubSystemPrefersDark(false);
    persist({ theme: 'system' });

    runThemeInitScript();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('paints light when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => {
        throw new Error('storage disabled');
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });

    runThemeInitScript();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

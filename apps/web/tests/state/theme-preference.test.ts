// @vitest-environment jsdom
//
// The app ships a theme preference (`light` / `dark` / `system`). These specs
// pin the invariant at all three places a persisted theme can reach the
// document: the config parser, the runtime appearance applier, and the
// pre-hydration inline script that paints before React mounts.
//
// Representation: `light` / `dark` are stamped as `data-theme`; `system`
// removes the attribute so the `@media (prefers-color-scheme: dark)`
// `html:not([data-theme])` rules follow the OS.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyAppearanceToDocument } from '../../src/state/appearance';
import { DEFAULT_CONFIG, loadConfig } from '../../src/state/config';
import type { AppConfig } from '../../src/types';

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

/** Pretend the OS is in dark mode, the way a dark-desktop user's browser is. */
function stubSystemPrefersDark(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-color-scheme: dark'),
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

  it('round-trips a persisted dark theme on read', () => {
    persist({ theme: 'dark', accentColor: '#4F46E5' });

    const config = loadConfig();

    expect(config.theme).toBe('dark');
    // Unrelated preferences must survive alongside the theme.
    expect(config.accentColor).toBe('#4f46e5');
  });

  it('round-trips a persisted system theme without resolving it', () => {
    stubSystemPrefersDark();
    persist({ theme: 'system' });

    expect(loadConfig().theme).toBe('system');
  });

  it('coerces an unknown stored value to light and rewrites it back to storage', () => {
    persist({ theme: 'midnight' as AppConfig['theme'] });

    const config = loadConfig();

    expect(config.theme).toBe('light');
    const written = JSON.parse(store.get(STORAGE_KEY) ?? '{}') as Partial<AppConfig>;
    expect(written.theme).toBe('light');
  });
});

describe('theme preference — document', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('stamps data-theme=light for the light choice', () => {
    applyAppearanceToDocument({ theme: 'light', accentColor: '#059669' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('stamps data-theme=dark for the dark choice', () => {
    applyAppearanceToDocument({ theme: 'dark', accentColor: '#059669' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  // Every JS theme reader in apps/web (shiki, ConnectorLogo, SketchEditor,
  // TerminalViewer, connectorBrandColor…) checks `data-theme` first and only
  // falls back to `prefers-color-scheme` when the attribute is ABSENT, and
  // every `@media (prefers-color-scheme: dark)` CSS block is gated on
  // `html:not([data-theme])`. So `system` MUST remove the attribute — stamping
  // anything would pin the theme instead of following the OS.
  it('removes data-theme for the system choice so the OS decides', () => {
    document.documentElement.setAttribute('data-theme', 'light');

    applyAppearanceToDocument({ theme: 'system', accentColor: '#10B981' });

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
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

  it('paints the stored dark theme before hydration', () => {
    persist({ theme: 'dark' });

    runThemeInitScript();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('leaves the document unstamped for a stored system theme on a dark OS', () => {
    stubSystemPrefersDark();
    persist({ theme: 'system' });

    runThemeInitScript();

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('paints light before hydration for an unknown stored value', () => {
    persist({ theme: 'midnight' as AppConfig['theme'] });

    runThemeInitScript();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

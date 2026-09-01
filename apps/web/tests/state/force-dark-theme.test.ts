// @vitest-environment jsdom
//
// LeastGen Studio ships dark-only: the workspace is themed dark-first (dark
// shell + bridge-gradient brand accents), and the old theme picker is gone.
// Removing the picker is not enough — every install that ever touched it
// still has `theme: 'light'` (or `'system'`, which resolves light on a light
// OS) sitting in localStorage, and a stored value does not change just
// because the default did. These specs pin the coerce-on-read invariant at
// all three places a persisted theme can reach the document: the config
// parser, the runtime appearance applier, and the pre-hydration inline
// script that paints before React mounts.

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

/** Pretend the OS is in light mode, the way a light-desktop user's browser is. */
function stubSystemPrefersLight(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-color-scheme: light'),
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

describe('forced dark theme — persisted config', () => {
  beforeEach(() => {
    store.clear();
  });

  it('defaults a fresh install to the dark theme', () => {
    expect(DEFAULT_CONFIG.theme).toBe('dark');
    expect(loadConfig().theme).toBe('dark');
  });

  it('coerces an already-persisted light theme back to dark on read', () => {
    persist({ theme: 'light', accentColor: '#4F46E5' });

    const config = loadConfig();

    expect(config.theme).toBe('dark');
    // Unrelated preferences must survive the coercion.
    expect(config.accentColor).toBe('#4f46e5');
  });

  it('coerces a persisted system theme to dark even when the OS prefers light', () => {
    stubSystemPrefersLight();
    persist({ theme: 'system' });

    expect(loadConfig().theme).toBe('dark');
  });

  it('rewrites the coerced theme back to storage so the light value stops existing', () => {
    persist({ theme: 'light' });

    loadConfig();

    const written = JSON.parse(store.get(STORAGE_KEY) ?? '{}') as Partial<AppConfig>;
    expect(written.theme).toBe('dark');
  });
});

describe('forced dark theme — document', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('stamps data-theme=dark on the root element', () => {
    applyAppearanceToDocument({ accentColor: '#059669' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('overwrites a light data-theme left on the root element', () => {
    document.documentElement.setAttribute('data-theme', 'light');

    applyAppearanceToDocument({ accentColor: '#059669' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  // Every JS theme reader in apps/web (shiki, ConnectorLogo, SketchEditor,
  // TerminalViewer, connectorBrandColor…) checks `data-theme` first and only
  // falls back to `prefers-color-scheme` when the attribute is ABSENT. So the
  // attribute always being present is what closes the OS-light leak: stray
  // light-era fallbacks can never resolve against the OS preference.
  it('never leaves the root element without an explicit theme', () => {
    stubSystemPrefersLight();

    applyAppearanceToDocument({ accentColor: '#10B981' });

    expect(document.documentElement.hasAttribute('data-theme')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).not.toBe('light');
  });
});

describe('forced dark theme — pre-hydration script', () => {
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

  it('paints dark before hydration even when the stored theme is light', () => {
    persist({ theme: 'light' });

    runThemeInitScript();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('paints dark before hydration for a legacy system theme on a light OS', () => {
    stubSystemPrefersLight();
    persist({ theme: 'system' });

    runThemeInitScript();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('resolves a legacy OpenDesign accent back to the brand cyan', () => {
    persist({ theme: 'dark', accentColor: '#87ea5c' });

    runThemeInitScript();

    const accent = document.documentElement.style.getPropertyValue('--accent');
    expect(accent).toBe('#22d3ee');
  });
});

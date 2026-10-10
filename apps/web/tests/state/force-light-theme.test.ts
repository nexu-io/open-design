// @vitest-environment jsdom
//
// These specs cover supported saved light/dark/system preferences at all
// three boundaries: config loading, runtime document appearance, and the
// pre-hydration inline script that paints before React mounts.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyAppearanceToDocument,
  subscribeToSystemThemeChanges,
} from '../../src/state/appearance';
import { DEFAULT_CONFIG, loadConfig } from '../../src/state/config';
import type { AppConfig } from '../../src/types';

const STORAGE_KEY = 'open-design:config';
const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal('matchMedia', undefined);
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
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
  for (const name of ['--accent', '--accent-strong', '--accent-soft', '--accent-tint', '--accent-hover']) {
    document.documentElement.style.removeProperty(name);
  }
});

function persist(config: Partial<AppConfig>): void {
  store.set(STORAGE_KEY, JSON.stringify(config));
}

function stubSystemTheme(initialDark: boolean, legacy = false) {
  let dark = initialDark;
  const listeners = new Set<() => void>();
  const mediaQuery = {
    get matches() {
      return dark;
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: legacy
      ? undefined
      : vi.fn((_event: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: legacy
      ? undefined
      : vi.fn((_event: string, listener: () => void) => listeners.delete(listener)),
    addListener: vi.fn((listener: () => void) => listeners.add(listener)),
    removeListener: vi.fn((listener: () => void) => listeners.delete(listener)),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery));
  return {
    change(nextDark: boolean) {
      dark = nextDark;
      for (const listener of listeners) listener();
    },
  };
}

describe('theme preference — persisted config', () => {
  it('defaults a fresh install to the light theme', () => {
    expect(DEFAULT_CONFIG.theme).toBe('light');
    expect(loadConfig().theme).toBe('light');
  });

  it('preserves a persisted dark theme and unrelated preferences', () => {
    persist({ theme: 'dark', accentColor: '#4F46E5' });

    const config = loadConfig();

    expect(config.theme).toBe('dark');
    expect(config.accentColor).toBe('#4f46e5');
  });

  it('preserves a persisted system theme even when the OS prefers dark', () => {
    stubSystemTheme(true);
    persist({ theme: 'system' });

    expect(loadConfig().theme).toBe('system');
  });

  it('does not rewrite valid saved theme values', () => {
    persist({ theme: 'dark' });

    loadConfig();

    const written = JSON.parse(store.get(STORAGE_KEY) ?? '{}') as Partial<AppConfig>;
    expect(written.theme).toBe('dark');
  });
});

describe('theme preference — document', () => {
  it('stamps an explicit dark or light preference on the root element', () => {
    applyAppearanceToDocument({ theme: 'dark', accentColor: '#059669' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    applyAppearanceToDocument({ theme: 'light', accentColor: '#059669' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it.each([true, false])('stamps the effective system theme when dark preference is %s', (dark) => {
    stubSystemTheme(dark);

    applyAppearanceToDocument({ theme: 'system', accentColor: '#10B981' });

    expect(document.documentElement.getAttribute('data-theme')).toBe(dark ? 'dark' : 'light');
  });

  it('falls back to light when matchMedia is unavailable', () => {
    applyAppearanceToDocument({ theme: 'system' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(() => subscribeToSystemThemeChanges(vi.fn())()).not.toThrow();
  });

  it.each([false, true])('updates with system changes and unsubscribes (legacy API: %s)', (legacy) => {
    const system = stubSystemTheme(false, legacy);
    const apply = vi.fn(() => applyAppearanceToDocument({ theme: 'system' }));
    apply();
    const unsubscribe = subscribeToSystemThemeChanges(apply);

    system.change(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    system.change(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(apply).toHaveBeenCalledTimes(3);

    unsubscribe();
    system.change(true);
    expect(apply).toHaveBeenCalledTimes(3);
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

  it('paints a persisted dark preference before hydration', () => {
    persist({ theme: 'dark' });

    runThemeInitScript();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it.each([true, false])('paints the effective system theme before hydration (dark: %s)', (dark) => {
    stubSystemTheme(dark);
    persist({ theme: 'system' });

    runThemeInitScript();

    expect(document.documentElement.getAttribute('data-theme')).toBe(dark ? 'dark' : 'light');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');
  });

  it('falls back to light before hydration without matchMedia', () => {
    persist({ theme: 'system' });

    runThemeInitScript();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it.each([undefined, 'invalid'])('paints light for a missing or invalid saved theme (%s)', (theme) => {
    store.set(STORAGE_KEY, JSON.stringify({ theme }));

    runThemeInitScript();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it.each(['missing', 'malformed', 'inaccessible'])('paints light when storage is %s', (state) => {
    document.documentElement.setAttribute('data-theme', 'dark');
    if (state === 'malformed') store.set(STORAGE_KEY, '{');
    if (state === 'inaccessible') {
      vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Storage unavailable'); } });
    }

    runThemeInitScript();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

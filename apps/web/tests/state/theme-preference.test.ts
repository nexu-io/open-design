// @vitest-environment jsdom
//
// Themes are a live preference again (system / light / dark). These specs pin
// the contract at the three places a persisted theme reaches the document:
// the config parser, the runtime appearance applier, and the pre-hydration
// inline script that paints before React mounts. System mode is expressed by
// the data-theme attribute being ABSENT — that is the CSS contract every
// `@media (prefers-color-scheme: dark) html:not([data-theme])` block and
// attribute reader (shiki, ConnectorLogo, SketchEditor, TerminalViewer,
// MentionNode) is built on.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyAppearanceToDocument } from '../../src/state/appearance';
import { loadConfig } from '../../src/state/config';
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

  it('keeps a stored dark preference on read', () => {
    persist({ theme: 'dark', accentColor: '#4F46E5' });

    const config = loadConfig();

    expect(config.theme).toBe('dark');
    // Unrelated preferences must survive the parse.
    expect(config.accentColor).toBe('#4f46e5');
  });

  it('keeps a stored system preference on read', () => {
    persist({ theme: 'system' });

    expect(loadConfig().theme).toBe('system');
  });

  it('drops an unknown theme value instead of pinning it', () => {
    persist({ theme: 'sepia' } as unknown as Partial<AppConfig>);

    expect(loadConfig().theme).toBeUndefined();
  });
});

describe('theme preference — document', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('stamps data-theme=dark for the dark preference', () => {
    applyAppearanceToDocument({ accentColor: '#059669', theme: 'dark' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('stamps data-theme=light for the light preference', () => {
    document.documentElement.setAttribute('data-theme', 'dark');

    applyAppearanceToDocument({ accentColor: '#059669', theme: 'light' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('removes the attribute for system mode so the CSS OS media query applies', () => {
    document.documentElement.setAttribute('data-theme', 'light');

    applyAppearanceToDocument({ accentColor: '#10B981', theme: 'system' });

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('falls back to system when no theme is supplied', () => {
    applyAppearanceToDocument({ accentColor: '#10B981' });

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

  it('paints dark before hydration when the stored theme is dark', () => {
    persist({ theme: 'dark' });

    runThemeInitScript();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('removes the attribute for a stored system theme (the OS media query decides)', () => {
    stubSystemPrefersDark();
    persist({ theme: 'system' });

    runThemeInitScript();

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('defaults to system when nothing is stored', () => {
    runThemeInitScript();

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('pins light when the storage read throws (broken localStorage must not blank the page)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage broken');
      },
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    });

    runThemeInitScript();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

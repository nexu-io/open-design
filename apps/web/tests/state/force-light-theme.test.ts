// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyAppearanceToDocument, resolveAppTheme } from '../../src/state/appearance';
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

describe('App Theme state and persistence', () => {
  beforeEach(() => {
    store.clear();
  });

  it('defaults a fresh install to light theme', () => {
    expect(DEFAULT_CONFIG.theme).toBe('light');
    expect(loadConfig().theme).toBe('light');
  });

  it('preserves persisted theme (light, dark, system)', () => {
    persist({ theme: 'dark', accentColor: '#4F46E5' });
    expect(loadConfig().theme).toBe('dark');
    expect(loadConfig().accentColor).toBe('#4f46e5');

    persist({ theme: 'system' });
    expect(loadConfig().theme).toBe('system');
  });

  it('resolves invalid theme values to light default', () => {
    expect(resolveAppTheme('invalid' as any)).toBe('light');
    expect(resolveAppTheme(null)).toBe('light');
    expect(resolveAppTheme(undefined)).toBe('light');
  });
});

describe('App Theme — document data-theme attribute', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('stamps data-theme=light when theme is light', () => {
    applyAppearanceToDocument({ accentColor: '#059669', theme: 'light' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('stamps data-theme=dark when theme is dark', () => {
    applyAppearanceToDocument({ accentColor: '#059669', theme: 'dark' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('stamps data-theme=system when theme is system', () => {
    stubSystemPrefersDark();
    applyAppearanceToDocument({ accentColor: '#10B981', theme: 'system' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('system');
  });
});

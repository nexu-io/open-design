// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PetOverlay } from '../../src/components/pet/PetOverlay';
import type { PetConfig } from '../../src/types';
import { DEFAULT_PET } from '../../src/state/config';

// Node 26 exposes `localStorage` as a global (but returns undefined) which
// prevents vitest's jsdom populateGlobal from overriding it. Stub it so the
// config persistence tests can call loadConfig/saveConfig normally.
const store = new Map<string, string>();
beforeAll(() => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
  });
});

function makePet(overrides?: Partial<PetConfig>): PetConfig {
  return {
    adopted: true,
    enabled: true,
    petId: 'custom',
    corner: 'bottom-right',
    custom: {
      name: 'Tester',
      glyph: '🐱',
      accent: '#c96442',
      greeting: 'Hi!',
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('pet corner anchor — default behavior', () => {
  it('DEFAULT_PET has corner set to bottom-right', () => {
    expect(DEFAULT_PET.corner).toBe('bottom-right');
  });

  it('renders overlay with bottom/right inline styles when corner is bottom-right', () => {
    const { container } = render(<PetOverlay pet={makePet({ corner: 'bottom-right' })} />);
    const overlay = container.querySelector('.pet-overlay') as HTMLElement | null;
    expect(overlay).not.toBeNull();
    // bottom/right should be set (truthy numeric or px value); top/left should not be set
    expect(overlay!.style.bottom).not.toBe('');
    expect(overlay!.style.right).not.toBe('');
    expect(overlay!.style.top).toBe('');
    expect(overlay!.style.left).toBe('');
  });
});

describe('pet corner anchor — corner changes', () => {
  it('applies top/right styles for top-right corner', () => {
    const { container } = render(<PetOverlay pet={makePet({ corner: 'top-right' })} />);
    const overlay = container.querySelector('.pet-overlay') as HTMLElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay!.style.top).not.toBe('');
    expect(overlay!.style.right).not.toBe('');
    expect(overlay!.style.bottom).toBe('');
    expect(overlay!.style.left).toBe('');
  });

  it('applies top/left styles for top-left corner', () => {
    const { container } = render(<PetOverlay pet={makePet({ corner: 'top-left' })} />);
    const overlay = container.querySelector('.pet-overlay') as HTMLElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay!.style.top).not.toBe('');
    expect(overlay!.style.left).not.toBe('');
    expect(overlay!.style.bottom).toBe('');
    expect(overlay!.style.right).toBe('');
  });

  it('applies bottom/left styles for bottom-left corner', () => {
    const { container } = render(<PetOverlay pet={makePet({ corner: 'bottom-left' })} />);
    const overlay = container.querySelector('.pet-overlay') as HTMLElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay!.style.bottom).not.toBe('');
    expect(overlay!.style.left).not.toBe('');
    expect(overlay!.style.top).toBe('');
    expect(overlay!.style.right).toBe('');
  });
});

describe('pet corner anchor — config persistence', () => {
  it('normalizePet preserves a stored corner value', async () => {
    // Dynamic import so we can test the normalizer in isolation
    const { loadConfig, saveConfig } = await import('../../src/state/config');

    // Seed localStorage with a stored config that has corner: top-left
    const stored = {
      ...DEFAULT_PET,
      corner: 'top-left' as const,
    };
    localStorage.setItem(
      'open-design:config',
      JSON.stringify({ pet: stored }),
    );

    const loaded = loadConfig();
    expect(loaded.pet?.corner).toBe('top-left');

    // Confirm saveConfig round-trips the corner field
    const next = { ...loaded, pet: { ...loaded.pet!, corner: 'top-right' as const } };
    saveConfig(next);
    const reloaded = loadConfig();
    expect(reloaded.pet?.corner).toBe('top-right');

    localStorage.removeItem('open-design:config');
  });

  it('normalizePet defaults corner to bottom-right when absent from stored config', async () => {
    const { loadConfig } = await import('../../src/state/config');

    localStorage.setItem(
      'open-design:config',
      JSON.stringify({ pet: { adopted: true, enabled: true, petId: 'mochi' } }),
    );

    const loaded = loadConfig();
    expect(loaded.pet?.corner).toBe('bottom-right');

    localStorage.removeItem('open-design:config');
  });
});

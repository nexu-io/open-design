// @vitest-environment jsdom

// A fresh composer exposes unselected entry pills after the catalog loads.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface PickerRender {
  activeChipId: string | null;
  disabled: boolean;
}

const pickerRenders: PickerRender[] = [];

vi.mock('../../src/components/home-hero/TypePillRow', () => ({
  TypePillRow: ({ activeChipId, disabled = false }: PickerRender) => {
    pickerRenders.push({ activeChipId, disabled });
    return <div data-testid="home-hero-type-pills" data-type={activeChipId ?? ''} />;
  },
}));

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: () => null,
}));

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>()),
  useWorkspaceContext: () => ({ context: null, loading: false, failure: 'unsupported' as const }),
}));

import { HomeView } from '../../src/components/HomeView';

const PROTOTYPE_PLUGIN = {
  id: 'example-web-prototype',
  title: 'Web Prototype',
  version: '0.1.0',
  trust: 'bundled' as const,
  sourceKind: 'bundled' as const,
  source: '/tmp/example-web-prototype',
  capabilitiesGranted: ['prompt:inject'],
  fsPath: '/tmp/example-web-prototype',
  installedAt: 0,
  updatedAt: 0,
  marketplaceTrust: 'official' as const,
  manifest: {
    name: 'example-web-prototype',
    title: 'Web Prototype',
    version: '0.1.0',
    tags: ['prototype'],
    od: { kind: 'scenario', taskKind: 'new-generation', mode: 'prototype' },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  pickerRenders.length = 0;
});

describe('HomeView — task-type picker readiness', () => {
  it('enables the entry pills without implicitly selecting a type', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (url) => {
      const body = url === '/api/plugins' ? { plugins: [PROTOTYPE_PLUGIN] } : {};
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }));

    render(<HomeView projects={[]} onSubmit={() => undefined} onOpenProject={() => undefined} />);
    await waitFor(() => {
      expect(pickerRenders.some((props) => !props.disabled)).toBe(true);
    });

    expect(pickerRenders[0]?.disabled).toBe(true);
    const enabled = pickerRenders.filter((props) => !props.disabled);
    expect(enabled.length).toBeGreaterThan(0);
    expect(enabled.every((props) => props.activeChipId === null)).toBe(true);
  });
});

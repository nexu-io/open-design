// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useDesignKit } from '../../src/runtime/design-kit';

describe('useDesignKit package fallback', () => {
  const PACKAGE_BRAND = JSON.stringify({
    name: 'Stale Package Name',
    logo: { primary: 'logos/mark.svg', alternates: [] },
    colors: [{ role: 'accent', name: 'Old Accent', hex: '#000000', usage: '' }],
  });
  const DESIGN_MD = [
    '# Renamed System',
    '',
    '## Color Palette',
    '',
    '| Role | Name | Hex | Usage |',
    '| --- | --- | --- | --- |',
    '| accent | New Accent | #ff0000 | buttons |',
    '',
  ].join('\n');

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds package assets to the DESIGN.md kit without a project, and never overwrites its text', async () => {
    const fetchMock = vi.fn(async () => new Response(PACKAGE_BRAND, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    // Stable source object: `packageInfo` is an effect dependency, so a fresh
    // object per render would re-run the resolver forever.
    const source = {
      designSystemId: 'user:acme',
      category: 'Brands',
      title: 'Renamed System',
      body: DESIGN_MD,
      editable: false,
      packageInfo: { availableFiles: ['DESIGN.md', 'brand.json'] },
    };
    const hook = renderHook(() => useDesignKit(source));

    // First paint comes straight from DESIGN.md — the package read only adds.
    expect(hook.result.current.kit?.name).toBe('Renamed System');

    await waitFor(() =>
      expect(hook.result.current.kit?.logoSrc).toContain(encodeURIComponent('logos/mark.svg')),
    );
    expect(hook.result.current.kit?.name).toBe('Renamed System');
    expect(hook.result.current.kit?.colors.map((c) => c.hex)).toContain('#ff0000');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks for nothing when the system is not a brand package', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const source = {
      designSystemId: 'tom-modern',
      category: 'Starter',
      title: 'Tom Modern',
      body: '# Tom Modern',
      editable: false,
      packageInfo: { availableFiles: ['DESIGN.md', 'tokens.css'] },
    };
    const hook = renderHook(() => useDesignKit(source));

    await waitFor(() => expect(hook.result.current.kit?.name).toBe('Tom Modern'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

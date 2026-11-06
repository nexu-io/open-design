// @vitest-environment jsdom

// Regression for the broken-thumbnail bug on the "Create design system" flow
// when assets are seeded from the Library multi-select hand-off.
//
// The dropzone builds image previews with URL.createObjectURL and must revoke
// them. The previous shape created the URLs in a useMemo and revoked them in a
// separate empty-deps cleanup effect. Under React StrictMode (which the web app
// enables) the mount runs setup -> cleanup -> setup, so the cleanup revoked the
// freshly-created object URLs while the memo (deps unchanged) kept handing back
// those now-dead blob: links. Any asset present at first mount — exactly the
// Library "create design system" hand-off — therefore rendered as a broken
// image. Creation and revocation must be paired in one files-keyed effect.

import { StrictMode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DesignSystemAssetDropzone } from '../src/components/DesignSystemAssetDropzone';

describe('DesignSystemAssetDropzone — seeded preview lifecycle', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let revoked: Set<string>;

  beforeEach(() => {
    revoked = new Set();
    let counter = 0;
    URL.createObjectURL = vi.fn(() => `blob:mock/${counter++}`) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn((url: string) => {
      revoked.add(url);
    }) as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    cleanup();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.restoreAllMocks();
  });

  it('renders a live (non-revoked) preview URL for an asset staged at first mount under StrictMode', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'future-state.webp', {
      type: 'image/webp',
    });
    const noop = () => {};

    render(
      <StrictMode>
        <DesignSystemAssetDropzone
          files={[file]}
          onAddFiles={noop}
          onDrop={noop}
          onRemove={noop}
          onSelectFromLibrary={noop}
        />
      </StrictMode>,
    );

    const img = await waitFor(() => {
      const el = document.querySelector('ul[aria-label="Staged assets"] img');
      if (!el) throw new Error('preview image not rendered yet');
      return el as HTMLImageElement;
    });

    const src = img.getAttribute('src') ?? '';
    expect(src).toMatch(/^blob:mock\//);
    // The crux: the URL the thumbnail points at must still be live, not one the
    // StrictMode cleanup already revoked.
    expect(revoked.has(src)).toBe(false);
  });

  it('does not show the library picker affordance while the Library UI is gated off', () => {
    const noop = () => {};

    render(
      <DesignSystemAssetDropzone
        files={[]}
        onAddFiles={noop}
        onDrop={noop}
        onRemove={noop}
        onSelectFromLibrary={noop}
      />,
    );

    expect(screen.queryByTestId('ds-asset-library')).toBeNull();
    expect(screen.queryByText(/reuse an asset/i)).toBeNull();
  });
});

// @vitest-environment jsdom

// Plugins-home HTML preview surface — reachability fallback.
//
// The home gallery used to render a permanently-blank tile when a
// plugin declared an `od.preview.entry` that 404'd on the daemon
// (the iframe quietly painted the JSON error envelope as white).
// The HtmlSurface now probes the URL once per session and swaps
// in a typographic fallback tile when the URL is unreachable.
//
// This file:
//   - asserts the iframe is mounted when the probe succeeds;
//   - asserts the typographic fallback renders (and the iframe is
//     skipped) when the probe reports the URL is unreachable.

import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import {
  HtmlSurface,
  __resetHtmlSurfaceProbeCacheForTests,
} from '../../src/components/plugins-home/cards/HtmlSurface';
import type { HtmlPreviewSpec } from '../../src/components/plugins-home/preview';

const PREVIEW: HtmlPreviewSpec = {
  kind: 'html',
  src: '/api/plugins/example-html-ppt/preview',
  label: 'index.html',
  source: 'preview',
};

const okResponse = (): Response =>
  ({ ok: true, status: 200 } as unknown as Response);
const notFoundResponse = (): Response =>
  ({ ok: false, status: 404 } as unknown as Response);

beforeEach(() => {
  __resetHtmlSurfaceProbeCacheForTests();
});

afterEach(() => {
  cleanup();
  __resetHtmlSurfaceProbeCacheForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HtmlSurface reachability probe', () => {
  it('renders the iframe once the URL probes OK and the auto-arm window elapses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse()));
    const { container } = render(
      <HtmlSurface
        preview={PREVIEW}
        pluginId="example-html-ppt"
        pluginTitle="Html Ppt"
        inView
      />,
    );
    // First the skeleton frame should appear, then after the 280ms
    // arm timer the iframe should mount.
    await waitFor(
      () => {
        expect(container.querySelector('iframe')).toBeTruthy();
      },
      { timeout: 2000 },
    );
    expect(
      container.querySelector('[data-testid="plugins-home-html-fallback"]'),
    ).toBeNull();
  });

  it('renders the typographic fallback (no iframe) when the URL 404s', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(notFoundResponse()));
    const { container } = render(
      <HtmlSurface
        preview={PREVIEW}
        pluginId="example-html-ppt"
        pluginTitle="Html Ppt"
        inView
      />,
    );
    await waitFor(
      () => {
        expect(
          container.querySelector('[data-testid="plugins-home-html-fallback"]'),
        ).toBeTruthy();
      },
      { timeout: 2000 },
    );
    expect(container.querySelector('iframe')).toBeNull();
    expect(
      container.querySelector('.plugins-home__html-fallback-glyph')?.textContent,
    ).toBe('H');
  });
});

// @vitest-environment jsdom

import { act } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: () => null,
}));

import { HomeView, seedHomeComposerPrompt } from '../../src/components/HomeView';
import { homeHeroPromptText } from '../helpers/home-hero-lexical';

// Regression coverage for a real bug: Community's "使用提示词"/Prompt button
// calls `seedHomeComposerPrompt` then navigates to Home, but `EntryShell`
// keeps `HomeView` permanently mounted (visibility-toggled) across view
// switches instead of unmounting it — so the old localStorage-read-on-mount
// seed mechanism never fired for an already-mounted instance, and the
// composer stayed empty. Fixed by also dispatching a live event HomeView
// listens for while mounted.
describe('HomeView seedHomeComposerPrompt while already mounted', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('updates the composer of an already-mounted HomeView instance', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }));

    render(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await screen.findByTestId('home-hero-input');

    // Simulate Community's "使用提示词" handler firing while HomeView is
    // already mounted in the background (the exact scenario the old
    // draft-key-on-mount mechanism could not handle).
    act(() => {
      seedHomeComposerPrompt('像顶级加速器合伙人一样写 Demo Day 路演');
    });

    await waitFor(() => {
      expect(homeHeroPromptText()).toBe('像顶级加速器合伙人一样写 Demo Day 路演');
    });
  });
});

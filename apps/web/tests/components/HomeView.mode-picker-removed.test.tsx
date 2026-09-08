// @vitest-environment jsdom
//
// Home's composer no longer mounts the session-mode picker chip.
//
// The chip sat in the composer footer immediately left of the model switcher
// and the send button: a mode glyph + the mode name (「设计」) + an × that
// cleared it. The project composer already dropped it (2026-08-19, product —
// see the comment at the mode-picker's old slot in `ChatComposer.tsx`, and
// `ChatComposer.mode-picker-removal.test.tsx`); Home is the last surface that
// still carried it, so this pins the same removal at the Home mount point.
//
// The component itself (`ComposerModePicker`) stays in the tree as a dormant
// part — see its file header. This spec is about the ENTRY, not the part:
// nothing on Home may mount it.
//
// Two things are deliberately pinned alongside the removal, because the risk
// here is removing more than was asked for:
//   1. Home still submits `conversationMode: 'design'`. Design was always the
//      app default; taking away the chip must change what the user SEES, not
//      what the request DOES.
//   2. The send button that sat directly right of the chip survives.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: () => null,
}));

import { HomeView } from '../../src/components/HomeView';
import { I18nProvider } from '../../src/i18n';
import { setHomeHeroPrompt } from '../helpers/home-hero-lexical';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch() {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const href = typeof url === 'string' ? url : String(url);
    if (href === '/api/plugins') return json({ plugins: [] });
    if (href === '/api/mcp/servers') return json({ servers: [], templates: [] });
    if (href === '/api/workspace/directory') return json({ items: [], activeWorkspaceId: null });
    return json({});
  }));
}

function renderHome(overrides: Partial<React.ComponentProps<typeof HomeView>> = {}) {
  return render(
    <I18nProvider initial="en">
      <HomeView
        projects={[] as never}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
        {...overrides}
      />
    </I18nProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('HomeView — composer session-mode picker', () => {
  it('does not render the mode chip anywhere in the Home composer', async () => {
    stubFetch();
    renderHome();

    // The composer is really painted, so the negative assertions below cannot
    // pass for the wrong reason (an empty render would satisfy them too).
    await waitFor(() => expect(screen.getByTestId('home-hero-input')).toBeTruthy());
    expect(screen.getByTestId('home-hero-submit')).toBeTruthy();

    expect(screen.queryByTestId('composer-mode-trigger')).toBeNull();
    expect(screen.queryByTestId('composer-mode-clear')).toBeNull();
    expect(screen.queryByTestId('composer-mode-menu')).toBeNull();
    // The chip's own class, in case the test hooks ever move.
    expect(document.querySelector('.composer-mode')).toBeNull();
    // The label the chip rendered when Design was the selection.
    expect(screen.queryByLabelText('Mode: Design')).toBeNull();
    expect(screen.queryByLabelText('Choose a mode')).toBeNull();
  });

  it('still submits Design as the conversation mode', async () => {
    stubFetch();
    const onSubmit = vi.fn();
    renderHome({ onSubmit });

    await waitFor(() => expect(screen.getByTestId('home-hero-input')).toBeTruthy());

    setHomeHeroPrompt('Create a clean loading animation');
    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() =>
      expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      prompt: 'Create a clean loading animation',
      conversationMode: 'design',
    });
  });
});

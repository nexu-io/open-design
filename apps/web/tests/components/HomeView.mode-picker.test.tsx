// @vitest-environment jsdom
//
// Home's composer mounts the session-mode picker chip.
//
// The chip sits in the composer footer left of the model switcher: a mode
// glyph + the mode name (「设计」) + an × that clears it back to the neutral
// trigger. The project composer carries the same chip (see
// `ChatComposer.mode-picker.test.tsx`); Home was the last surface to get it
// back, and every Home request defaults to Design.
//
// This spec pins the mount at the Home entry point, plus the payload half of
// the pair:
//   1. The chip renders (`composer-mode-trigger`).
//   2. Home still submits `conversationMode: 'design'` by default — the chip
//      changes what the user SEES, and picking another mode changes what the
//      request DOES (both flow through `conversationMode`).
//   3. The send button that sits right of the chip survives.

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

describe('HomeView — composer session-mode picker (restored)', () => {
  it('renders the mode chip in the Home composer', async () => {
    stubFetch();
    renderHome();

    // The composer is really painted, so the assertions below cannot
    // pass for the wrong reason (an empty render would fail them too).
    await waitFor(() => expect(screen.getByTestId('home-hero-input')).toBeTruthy());
    expect(screen.getByTestId('home-hero-submit')).toBeTruthy();

    expect(screen.getByTestId('composer-mode-trigger')).toBeTruthy();
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

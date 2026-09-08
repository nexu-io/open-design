// @vitest-environment jsdom
//
// Home no longer mounts the onboarding "recommended start" strip.
//
// The strip sat directly below the composer and read: sparkle icon, 「Start
// with your first project」 + "Describe what you want and we'll generate an
// editable first version.", with 「All types」 and 「Start creating ›」. Home
// already asks for a first request in the composer immediately above it, and
// the 「Start with a template… / start a blank project」 line immediately below
// it already covers the pick-a-shape path — so the strip was a third way to
// say the same thing, wedged between the two.
//
// This test pins the removal at the mount point that matters: even when the
// caller supplies a live recommendation AND both handlers (the exact condition
// that used to render it), nothing from the strip reaches the screen. It also
// pins the two neighbours that must SURVIVE, since the risk here is deleting
// more than was asked for.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: () => null,
}));

import { HomeView } from '../../src/components/HomeView';
import { I18nProvider } from '../../src/i18n';
import { buildRecommendation } from '../../src/onboarding/recommendation';

function stubPluginsFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    if (typeof url === 'string' && url === '/api/plugins') {
      return new Response(JSON.stringify({ plugins: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  }));
}

function renderHomeWithRecommendation() {
  const recommendation = buildRecommendation({ role: 'designer', useCases: ['prototype'] });
  return render(
    <I18nProvider initial="en">
      <HomeView
        projects={[] as never}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
        recommendation={recommendation}
        onRecommendationStart={() => true}
        onRecommendationDismiss={() => undefined}
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

describe('HomeView — recommended-start strip', () => {
  it('does not render the strip even when a recommendation and both handlers are supplied', async () => {
    stubPluginsFetch();
    renderHomeWithRecommendation();

    // The composer is up, so this is a real paint of Home and not an empty
    // render that would pass the negative assertions for the wrong reason.
    await waitFor(() =>
      expect(screen.getByTestId('home-hero-type-pills')).toBeTruthy(),
    );

    expect(screen.queryByTestId('home-recommendation-start')).toBeNull();
    expect(screen.queryByText('Start with your first project')).toBeNull();
    expect(screen.queryByText('Start creating')).toBeNull();
    expect(screen.queryByText('All types')).toBeNull();
  });

  it('keeps the template control that sat below it', async () => {
    stubPluginsFetch();
    renderHomeWithRecommendation();

    // 「Start with a template…」 is a DIFFERENT control from the strip and must
    // survive its removal — the strip was the row ABOVE it.
    const trigger = await screen.findByTestId('home-hero-type-pill-prototype');
    expect(trigger).toBeTruthy();
    expect(screen.getByTestId('home-hero-type-pills')).toBeTruthy();
    await waitFor(() => expect((trigger as HTMLButtonElement).disabled).toBe(false));
  });
});

// @vitest-environment jsdom

// A rolling model-window rejection must read as a wait on the Home composer.
//
// Home's send path fails before a run exists, so it never reaches the chat's
// failure-UI mapping — its catch-all prints `err.message` verbatim. For every
// other business failure that is the right call (the daemon's message is
// already the specific thing to say), but the hosted gateway answers a
// per-model window with an English sentence written for API callers:
//
//   You have reached the 5-hour usage limit for X. Try again after <instant>.
//   This request was not charged to Wallet Credits.
//
// Printed as-is on a localized Home screen, that reads to a user as "something
// broke and I may have been charged" — the opposite of what happened. These
// specs pin the localized wait copy, and pin that the verbatim path still
// applies to everything else.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: () => null,
}));

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>();
  return {
    ...actual,
    useWorkspaceContext: () => ({
      context: null,
      loading: false,
      failure: 'unsupported' as const,
    }),
  };
});

import { HomeView } from '../../src/components/HomeView';
import { I18nProvider } from '../../src/i18n';
import { ProjectCreateError } from '../../src/state/projects';
import { writeHomeGuideStage } from '../../src/components/home-hero/firstRunGuide';
import { setHomeHeroPrompt } from '../helpers/home-hero-lexical';

const WINDOW_LIMIT_MESSAGE =
  'You have reached the 5-hour usage limit for Kimi K2.6. Try again after 2026-08-12T06:34:47Z. This request was not charged to Wallet Credits.';

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  window.localStorage.clear();
});

function renderHome(
  onSubmit: (payload: unknown) => Promise<boolean> | void,
  locale: 'en' | 'zh-CN' = 'en',
) {
  writeHomeGuideStage('done');
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    if (typeof url === 'string' && url === '/api/plugins') {
      return new Response(JSON.stringify({ plugins: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  }));
  return render(
    <I18nProvider initial={locale}>
      <HomeView
        projects={[]}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />
    </I18nProvider>,
  );
}

async function submitAndReadAlert(
  message: string,
  locale: 'en' | 'zh-CN' = 'en',
): Promise<HTMLElement> {
  const onSubmit = vi.fn().mockRejectedValue(
    new ProjectCreateError(message, 400, null, false, 'request-1'),
  );
  renderHome(onSubmit, locale);
  await screen.findByTestId('home-hero-input');
  setHomeHeroPrompt('Build a landing page');
  fireEvent.click(await screen.findByTestId('home-hero-submit'));
  return screen.findByRole('alert');
}

describe('home composer model window limit', () => {
  it('states the wait instead of printing the gateway sentence', async () => {
    const alert = await submitAndReadAlert(WINDOW_LIMIT_MESSAGE);
    expect(alert).toHaveTextContent('High demand right now');
    // The point of the fix: none of the raw upstream wording survives.
    expect(alert).not.toHaveTextContent('5-hour usage limit');
    expect(alert).not.toHaveTextContent('Wallet Credits');
  });

  it('keeps the "not charged" reassurance, which the raw sentence buried', async () => {
    const alert = await submitAndReadAlert(WINDOW_LIMIT_MESSAGE);
    expect(alert).toHaveTextContent('not charged');
  });

  it('localizes the wait, including the instant', async () => {
    const alert = await submitAndReadAlert(WINDOW_LIMIT_MESSAGE, 'zh-CN');
    expect(alert).toHaveTextContent('高峰期繁忙');
    expect(alert).toHaveTextContent('未扣费');
    // Rendered for the reader's clock, not echoed as the gateway's UTC string.
    expect(alert).not.toHaveTextContent('2026-08-12T06:34:47Z');
  });

  it('still prints other business failures verbatim', async () => {
    const alert = await submitAndReadAlert(
      'Workspace membership authority is temporarily unavailable',
    );
    expect(alert).toHaveTextContent(
      'Workspace membership authority is temporarily unavailable',
    );
    expect(alert).not.toHaveTextContent('High demand');
  });
});

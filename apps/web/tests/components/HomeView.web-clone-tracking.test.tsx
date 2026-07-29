// @vitest-environment jsdom
//
// Web-clone example-card analytics (埋点文档 row 116, element=example_prompt).
// The Website-clone examples are plain text prompt cards (no embedded HTML / no
// Remix — dropped to avoid reproducing copyrighted site markup). Picking one must
// still fire a home chat_composer ui_click with chip_id=web-clone so the
// site-clone funnel entry is tracked, complementing the created project's
// project_kind=web_clone on project_create_result.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { HomeView } from '../../src/components/HomeView';
import { I18nProvider } from '../../src/i18n';
import { writeHomeGuideStage } from '../../src/components/home-hero/firstRunGuide';

const analyticsMocks = vi.hoisted(() => ({ track: vi.fn() }));

// `send()` forwards a trailing request-id arg, so match on (event, props) and
// ignore any extra positional args rather than asserting exact arity.
function lastClickProps(element: string): Record<string, unknown> | undefined {
  const call = [...analyticsMocks.track.mock.calls]
    .reverse()
    .find((args) => args[0] === 'ui_click' && (args[1] as { element?: string })?.element === element);
  return call?.[1] as Record<string, unknown> | undefined;
}

vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return {
    ...actual,
    useAnalytics: () => ({
      track: analyticsMocks.track,
      newRequestId: () => 'request-1',
      setConfigureGlobals: vi.fn(),
      setConsent: vi.fn(),
      setIdentity: vi.fn(),
    }),
  };
});

// The Website-clone chip's base scenario (its action.pluginId). It only needs to
// exist so clicking the chip binds; the site examples themselves are static text
// prompt cards from HOME_PROMPT_EXAMPLES, not plugins.
const WEB_CLONE_BASE = {
  id: 'example-web-clone',
  title: 'Website clone',
  version: '0.1.0',
  trust: 'bundled' as const,
  sourceKind: 'bundled' as const,
  source: '/tmp/web-clone',
  capabilitiesGranted: ['prompt:inject'],
  fsPath: '/tmp/web-clone',
  installedAt: 0,
  updatedAt: 0,
  manifest: {
    name: 'example-web-clone',
    title: 'Website clone',
    version: '0.1.0',
    description: 'Recreate an existing website.',
    tags: ['web-clone', 'website-clone'],
    od: {
      kind: 'scenario',
      taskKind: 'new-generation',
      useCase: { query: 'Recreate the website at {{targetUrl}}.' },
    },
  },
};

function stubPlugins() {
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const href = typeof url === 'string' ? url : url.toString();
    if (href === '/api/plugins') {
      return new Response(JSON.stringify({ plugins: [WEB_CLONE_BASE] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }));
}

function renderHome() {
  return render(
    <I18nProvider initial="en">
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />
    </I18nProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  analyticsMocks.track.mockClear();
  cleanup();
  window.localStorage.clear();
});

describe('web-clone example-card tracking', () => {
  it('renders the Website-clone examples as text prompt cards (no plugin preview / no remix)', async () => {
    writeHomeGuideStage('done');
    stubPlugins();
    renderHome();

    fireEvent.click(await screen.findByTestId('home-hero-rail-web-clone'));
    // Text prompt cards (site variant: logo tile + bare domain), not plugin cards.
    const textCards = await screen.findAllByTestId('home-hero-prompt-example');
    expect(textCards.length).toBeGreaterThan(0);
    expect(screen.queryByTestId('home-hero-plugin-presets')).toBeNull();
    // No remix/duplicate affordance on the web-clone rail.
    expect(document.querySelector('[data-testid^="home-hero-plugin-preset-duplicate"]')).toBeNull();
    // Site cards show the bare domain (e.g. open-design.ai), not the raw prompt line.
    expect(textCards.some((c) => (c.textContent ?? '').includes('open-design.ai'))).toBe(true);
    expect(textCards.every((c) => !(c.textContent ?? '').includes('https://'))).toBe(true);
    expect(document.querySelector('.home-hero__prompt-example--site')).not.toBeNull();
  });

  // Contract lock: the shipped Website-clone example set is intentionally
  // narrowed to the first-party Open Design site to avoid shipping third-party
  // brand copies. Assert the exact count + domain so the rail can't silently
  // drift back to the old multi-site set without updating this contract.
  it('resolves exactly the contracted Open Design Website-clone site card', async () => {
    writeHomeGuideStage('done');
    stubPlugins();
    renderHome();

    fireEvent.click(await screen.findByTestId('home-hero-rail-web-clone'));
    const siteCards = await screen.findAllByTestId('home-hero-prompt-example');
    const domains = siteCards.map((c) => (c.textContent ?? '').trim());
    expect(domains).toEqual(['open-design.ai']);
    // Every card must be the site variant (favicon tile + bare domain).
    expect(
      siteCards.every((c) => c.classList.contains('home-hero__prompt-example--site')),
    ).toBe(true);
  });

  it('renders the contracted Open Design site card with a local eager logo', async () => {
    writeHomeGuideStage('done');
    stubPlugins();
    renderHome();

    fireEvent.click(await screen.findByTestId('home-hero-rail-web-clone'));
    const siteCard = (await screen.findAllByTestId('home-hero-prompt-example'))[0]!;
    const logo = siteCard.querySelector<HTMLImageElement>('.home-hero__site-badge img');
    expect(logo?.getAttribute('src')).toBe('/logo.svg');
    expect(logo?.getAttribute('loading')).toBe('eager');
    expect(logo?.getAttribute('fetchpriority')).toBe('high');
  });

  it('falls back when the local Open Design site card logo cannot load', async () => {
    writeHomeGuideStage('done');
    stubPlugins();
    renderHome();

    fireEvent.click(await screen.findByTestId('home-hero-rail-web-clone'));
    const siteCard = (await screen.findAllByTestId('home-hero-prompt-example'))[0]!;
    const localLogo = siteCard.querySelector<HTMLImageElement>('.home-hero__site-badge img');
    expect(localLogo?.getAttribute('src')).toBe('/logo.svg');

    fireEvent.error(localLogo!);
    const remoteFallback = siteCard.querySelector<HTMLImageElement>('.home-hero__site-badge img');
    expect(remoteFallback?.getAttribute('src')).toBe(
      'https://www.google.com/s2/favicons?sz=128&domain=open-design.ai',
    );

    fireEvent.error(remoteFallback!);
    expect(siteCard.querySelector('.home-hero__site-monogram')?.textContent).toBe('O');
  });

  it('fires element=example_prompt with chip_id=web-clone when a text example is picked', async () => {
    writeHomeGuideStage('done');
    stubPlugins();
    renderHome();

    fireEvent.click(await screen.findByTestId('home-hero-rail-web-clone'));
    const textCards = await screen.findAllByTestId('home-hero-prompt-example');
    analyticsMocks.track.mockClear(); // ignore the chip-pick ui_click; assert the card event
    fireEvent.click(textCards[0]!);

    await waitFor(() => {
      expect(lastClickProps('example_prompt')).toMatchObject({
        page_name: 'home',
        area: 'chat_composer',
        element: 'example_prompt',
        chip_id: 'web-clone',
      });
    });
  });
});

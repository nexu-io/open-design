// @vitest-environment jsdom

// First-run guidance trail (home-hero/firstRunGuide.ts).
//
// A brand-new user (no projects, fresh storage) gets a sheen pulse on the
// Prototype type chip; picking any type chip advances the persisted stage
// so the first example card can pulse next, and the trail never replays.
// Users with existing projects have the trail completed silently.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: () => null,
}));

import { HomeView } from '../../src/components/HomeView';
import { I18nProvider } from '../../src/i18n';
import {
  readHomeGuideStage,
  writeHomeGuideStage,
} from '../../src/components/home-hero/firstRunGuide';

const SAMPLE_PROJECT = {
  id: 'p1',
  name: 'existing project',
  createdAt: 0,
  updatedAt: 0,
};

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

function renderHome(projects: unknown[] = []) {
  return render(
    <I18nProvider initial="en">
      <HomeView
        projects={projects as never}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />
    </I18nProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  window.localStorage.clear();
});

describe('Home first-run guide trail', () => {
  it('pulses the Prototype chip for a fresh user and advances on chip pick', async () => {
    stubPluginsFetch();
    renderHome([]);

    expect(readHomeGuideStage()).toBe('chip');
    const chip = await screen.findByTestId('home-hero-rail-prototype');
    await waitFor(
      () => {
        expect(chip.className).toContain('home-hero__attention-sheen');
      },
      { timeout: 3000 },
    );

    fireEvent.click(chip);
    expect(readHomeGuideStage()).not.toBe('chip');
    expect(chip.className).not.toContain('home-hero__attention-sheen');
  });

  it('completes the trail silently for users who already have projects', async () => {
    stubPluginsFetch();
    renderHome([SAMPLE_PROJECT]);

    await screen.findByTestId('home-hero-input');
    await waitFor(() => {
      expect(readHomeGuideStage()).toBe('done');
    });
    const chip = screen.queryByTestId('home-hero-rail-prototype');
    expect(chip?.className ?? '').not.toContain('home-hero__attention-sheen');
  });

  it('stays inert while projects are still loading', async () => {
    stubPluginsFetch();
    render(
      <I18nProvider initial="en">
        <HomeView
          projects={[] as never}
          projectsLoading
          onSubmit={() => undefined}
          onOpenProject={() => undefined}
          onViewAllProjects={() => undefined}
        />
      </I18nProvider>,
    );

    const chip = await screen.findByTestId('home-hero-rail-prototype');
    await new Promise((resolve) => setTimeout(resolve, 1200));
    // Unknown projects state: no pulse, and crucially the stage is NOT
    // silently completed — a brand-new user still gets the trail once
    // loading resolves.
    expect(chip.className).not.toContain('home-hero__attention-sheen');
    expect(readHomeGuideStage()).toBe('chip');
  });

  it('closes an in-flight stage when projects resolve to an existing user', async () => {
    stubPluginsFetch();
    const { rerender } = render(
      <I18nProvider initial="en">
        <HomeView
          projects={[] as never}
          projectsLoading
          onSubmit={() => undefined}
          onOpenProject={() => undefined}
          onViewAllProjects={() => undefined}
        />
      </I18nProvider>,
    );

    // The user clicks a chip while projects are still loading — the stage
    // moves to 'card' before we know whether they are new.
    fireEvent.click(await screen.findByTestId('home-hero-rail-prototype'));
    expect(readHomeGuideStage()).toBe('card');

    // Loading resolves: existing user. The stage must close so no chip's
    // example cards ever show the first-preset sheen.
    rerender(
      <I18nProvider initial="en">
        <HomeView
          projects={[SAMPLE_PROJECT] as never}
          projectsLoading={false}
          onSubmit={() => undefined}
          onOpenProject={() => undefined}
          onViewAllProjects={() => undefined}
        />
      </I18nProvider>,
    );
    await waitFor(() => {
      expect(readHomeGuideStage()).toBe('done');
    });
  });

  it('carries beat 2 through the static prompt-example fallback', async () => {
    // The chip's default plugin exists (so the chip binds) but nothing
    // matches the example filter — the chip renders static prompt-example
    // cards, and the guide's beat 2 must land on the first of those.
    const WEB_PROTOTYPE_PLUGIN = {
      id: 'example-web-prototype',
      title: 'Web Prototype',
      version: '0.1.0',
      trust: 'bundled' as const,
      sourceKind: 'bundled' as const,
      source: '/tmp/web-prototype',
      capabilitiesGranted: ['prompt:inject'],
      fsPath: '/tmp/web-prototype',
      installedAt: 0,
      updatedAt: 0,
      manifest: {
        name: 'example-web-prototype',
        title: 'Web Prototype',
        version: '0.1.0',
        description: 'General-purpose desktop web prototype.',
        od: { kind: 'scenario', taskKind: 'new-generation' },
      },
    };
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [WEB_PROTOTYPE_PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }));
    renderHome([]);

    fireEvent.click(await screen.findByTestId('home-hero-rail-prototype'));
    expect(readHomeGuideStage()).toBe('card');

    const exampleCards = await screen.findAllByTestId('home-hero-prompt-example');
    await waitFor(
      () => {
        expect(exampleCards[0]?.className).toContain('home-hero__attention-sheen');
      },
      { timeout: 3000 },
    );
    expect(readHomeGuideStage()).toBe('done');
  });

  it('never replays once done', async () => {
    writeHomeGuideStage('done');
    stubPluginsFetch();
    renderHome([]);

    const chip = await screen.findByTestId('home-hero-rail-prototype');
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(chip.className).not.toContain('home-hero__attention-sheen');
  });
});

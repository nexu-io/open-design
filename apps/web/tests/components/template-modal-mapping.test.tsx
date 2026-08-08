// @vitest-environment jsdom
//
// Entry → template-detail-modal mapping (飞书 recvqxDuYM6Uxk).
//
// Two template detail surfaces exist:
//   • the FULL plugin details modal (PluginDetailsModal → PreviewModal):
//     top-right Use split action + Share menu + close;
//   • the LIGHTWEIGHT template preview (TemplatePreviewModal): header
//     title/category + close, footer category + Remix.
//
// Product mapping: the Community gallery card opens the FULL modal, and the
// creation page's active template chip opens the LIGHTWEIGHT preview. This
// suite locks that mapping plus the two adjacent interactions that must NOT
// regress while swapping: the example prompt card keeps filling the composer
// directly (no hover Use/Remix buttons, no modal).

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: () => null,
}));

import { CommunityView } from '../../src/components/CommunityView';
import { HomeView } from '../../src/components/HomeView';
import { HomeHero } from '../../src/components/HomeHero';
import { createPluginUseHandoff } from '../../src/components/home-hero/plugin-authoring';

const DECK_PLUGIN = {
  id: 'example-fundraising-deck',
  title: 'Seed Round Pitch',
  version: '1.0.0',
  trust: 'bundled' as const,
  sourceKind: 'bundled' as const,
  source: '/plugins/_official/example-fundraising-deck',
  fsPath: '/tmp/example-fundraising-deck',
  installedAt: 0,
  updatedAt: 0,
  capabilitiesGranted: [],
  manifest: {
    name: 'example-fundraising-deck',
    title: 'Seed Round Pitch',
    version: '1.0.0',
    description: 'A decision-grade seed round narrative.',
    tags: ['deck'],
    od: {
      kind: 'scenario',
      taskKind: 'new-generation',
      mode: 'deck',
      category: 'fundraising-pitch',
      preview: { type: 'html', entry: './example.html' },
      useCase: { query: 'Create a seed round pitch deck.' },
    },
  },
};

const DECK_APPLY_RESULT = {
  query: 'Create a seed round pitch deck.',
  contextItems: [],
  inputs: [],
  assets: [],
  mcpServers: [],
  trust: 'trusted',
  capabilitiesGranted: [],
  capabilitiesRequired: [],
  appliedPlugin: {
    snapshotId: 'snap-deck',
    pluginId: 'example-fundraising-deck',
    pluginVersion: '1.0.0',
    manifestSourceDigest: 'a'.repeat(64),
    inputs: {},
    resolvedContext: { items: [] },
    capabilitiesGranted: [],
    capabilitiesRequired: [],
    assetsStaged: [],
    taskKind: 'new-generation',
    appliedAt: 0,
    connectorsRequired: [],
    connectorsResolved: [],
    mcpServers: [],
    status: 'fresh',
  },
  projectMetadata: {},
};

function stubFetch() {
  const fetchMock = vi.fn(async (url: unknown) => {
    if (url === '/api/plugins') {
      return new Response(JSON.stringify({ plugins: [DECK_PLUGIN] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (typeof url === 'string' && url === '/api/plugins/example-fundraising-deck/preview') {
      return new Response('<!doctype html><html><body>deck preview</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }
    if (typeof url === 'string' && url.includes('/api/plugins/example-fundraising-deck/apply')) {
      return new Response(JSON.stringify(DECK_APPLY_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${String(url)}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function stubAnimationFrame() {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    return window.setTimeout(() => cb(window.performance.now()), 0);
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    window.clearTimeout(id);
  });
}

beforeEach(() => {
  stubFetch();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('Community template card → full details modal', () => {
  it('opens the full plugin details modal (Use split action + Share + close), not the lightweight preview', async () => {
    render(<CommunityView />);
    await waitFor(() => {
      expect(document.querySelector('.community-template-card')).not.toBeNull();
    });

    fireEvent.click(document.querySelector('.community-template-card')!);

    // Full modal chrome: the Use split action (main face + caret), the
    // template Share menu trigger, and the shared ds-modal backdrop.
    await waitFor(() => {
      expect(screen.queryByTestId('plugin-details-use-example-fundraising-deck')).not.toBeNull();
    });
    expect(screen.getByTestId('plugin-details-use-example-fundraising-deck-menu')).toBeTruthy();
    expect(document.querySelector('.template-share-trigger')).not.toBeNull();
    expect(document.querySelector('.ds-modal-backdrop')).not.toBeNull();

    // The lightweight footer-Remix preview must NOT be what this card opens.
    expect(document.querySelector('.community-template-preview')).toBeNull();
  });
});

describe('creation page active template chip → lightweight preview', () => {
  it('opens the lightweight template preview (footer category + Remix), not the full details modal', async () => {
    stubAnimationFrame();
    render(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
        promptHandoff={createPluginUseHandoff(1, 'example-fundraising-deck')}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('home-hero-active-plugin')).toBeTruthy();
    });

    fireEvent.click(screen.getByTitle('Plugin: Seed Round Pitch'));

    // Lightweight preview: header + footer category with the Remix action.
    await waitFor(() => {
      expect(document.querySelector('.community-template-preview')).not.toBeNull();
    });
    const foot = document.querySelector('.community-template-preview__foot');
    expect(foot?.textContent).toContain('Slides');
    expect(foot?.textContent).toContain('Remix');

    // The full modal's Use split action + Share menu must NOT appear here.
    expect(screen.queryByTestId('plugin-details-use-example-fundraising-deck')).toBeNull();
    expect(document.querySelector('.template-share-trigger')).toBeNull();
  });
});

describe('creation page lightweight preview escapes the home stacking context', () => {
  // `.home-view` carries `isolation: isolate` (home-hero.css) to contain its
  // kinetic-grid canvas, which makes it a stacking context: any fixed-position
  // scrim rendered INSIDE that subtree has its z-index resolved locally, so the
  // entry rail (z-index 30) and the workspace tab chrome paint on top of the
  // backdrop — the exact "modal only dims the center pane" regression. The
  // overlay must portal to document.body (the PluginDetailsModal convention)
  // so its z-index participates in the root stacking context.
  it('portals the preview overlay to document.body so the scrim covers the rail and tab strip', async () => {
    stubAnimationFrame();
    render(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
        promptHandoff={createPluginUseHandoff(1, 'example-fundraising-deck')}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('home-hero-active-plugin')).toBeTruthy();
    });

    fireEvent.click(screen.getByTitle('Plugin: Seed Round Pitch'));

    await waitFor(() => {
      expect(document.querySelector('.community-template-preview')).not.toBeNull();
    });
    const overlay = document.querySelector('.community-template-preview')!;

    // The symptom: trapped inside the home-view subtree, the fixed scrim is
    // clipped to the home stacking context and never covers the shell chrome.
    expect(overlay.closest('[data-testid="home-view"]')).toBeNull();

    // The contract: direct child of <body>, exactly like PluginDetailsModal.
    expect(overlay.parentElement).toBe(document.body);
  });
});

const HERO_PROPS = {
  prompt: '',
  onPromptChange: () => undefined,
  onSubmit: () => undefined,
  activePluginTitle: null,
  activeChipId: 'prototype',
  onClearActivePlugin: () => undefined,
  pluginOptions: [],
  pluginsLoading: false,
  pendingPluginId: null,
  pendingChipId: null,
  onPickPlugin: () => undefined,
  onPickChip: () => undefined,
  contextItemCount: 0,
  error: null,
};

describe('example prompt cards keep their confirmed interactions', () => {
  it('does not resurrect hover Use/Remix buttons on the example card', async () => {
    render(<HomeHero {...(HERO_PROPS as any)} />);
    const cards = screen.queryAllByTestId('home-hero-prompt-example');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      fireEvent.mouseEnter(card);
      // The card is itself the button; it must contain no nested action
      // buttons (the removed hover Use/Remix pair) and no overlay icon.
      expect(card.querySelector('button')).toBeNull();
      expect(card.querySelector('svg')).toBeNull();
    }
  });

  it('clicking an example prompt card fills the composer directly without opening any modal', async () => {
    const onPromptChange = vi.fn();
    render(<HomeHero {...(HERO_PROPS as any)} onPromptChange={onPromptChange} />);
    const card = screen.queryAllByTestId('home-hero-prompt-example')[0]!;
    const text = card.textContent ?? '';

    fireEvent.click(card);

    expect(onPromptChange).toHaveBeenCalledWith(text);
    expect(document.querySelector('.community-template-preview')).toBeNull();
    expect(document.querySelector('.ds-modal-backdrop')).toBeNull();
  });
});

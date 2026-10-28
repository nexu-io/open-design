// @vitest-environment jsdom
//
// Community is the plugin catalogue rendered as a template gallery. Its cards,
// facet badges, thumbnails, and composer seeds must all resolve from the one
// live source — GET /api/plugins — so the page can never drift back to a
// hand-written demo array that shows 24 templates while the daemon serves ~300.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityView, communityTypeForChip } from '../src/components/CommunityView';

const analytics = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('../src/analytics/provider', () => ({
  useAnalytics: () => ({ track: analytics.track }),
}));

type PluginFixture = {
  id: string;
  title: string;
  manifest: Record<string, unknown>;
};

function plugin(fixture: PluginFixture) {
  return {
    id: fixture.id,
    title: fixture.title,
    version: '1.0.0',
    capabilitiesGranted: [],
    updatedAt: 0,
    installedAt: 0,
    fsPath: `/plugins/_official/${fixture.id}`,
    trust: 'bundled' as const,
    sourceKind: 'bundled' as const,
    source: `/plugins/_official/${fixture.id}`,
    manifest: { name: fixture.id, version: '1.0.0', title: fixture.title, ...fixture.manifest },
  };
}

const PITCH_DECK = plugin({
  id: 'example-fundraising-deck',
  title: 'Seed Round Pitch',
  manifest: {
    description: 'A decision-grade seed round narrative.',
    author: { name: 'Zara Zhang' },
    tags: ['deck'],
    od: {
      mode: 'deck',
      category: 'fundraising-pitch',
      preview: { type: 'html', entry: './example.html' },
      // Shape the daemon actually attaches (plugin-preview-bakes.ts): poster +
      // clip + the leading in-place span the tile loops while idle.
      bakedPreview: {
        poster: 'https://assets.test/fundraising/poster.jpg',
        video: 'https://assets.test/fundraising/preview.mp4',
        holdMs: 2500,
      },
    },
  },
});

const SALES_DECK = plugin({
  id: 'example-b2b-deck',
  title: 'Enterprise Sales Deck',
  manifest: {
    description: 'A B2B sales narrative built for procurement.',
    tags: ['deck'],
    od: { mode: 'deck', category: 'b2b-sales', preview: { type: 'html', entry: './example.html' } },
  },
});

const LANDING_PROTOTYPE = plugin({
  id: 'example-landing-prototype',
  title: 'SaaS Landing Page',
  manifest: {
    description: 'A conversion-focused SaaS landing page.',
    tags: ['landing'],
    od: { mode: 'prototype', preview: { type: 'html', entry: './example.html' } },
  },
});

const IMAGE_TEMPLATE = plugin({
  id: 'image-template-poster',
  title: 'Typographic Poster',
  manifest: {
    description: 'A typography-led key art poster.',
    tags: ['poster'],
    od: { mode: 'image', preview: { type: 'image', poster: 'https://assets.test/poster.jpg' } },
  },
});

// Neither of these belongs in the gallery: hidden plugins are filtered by
// listPlugins(), and design-system plugins resolve to no artifact category.
const HIDDEN_PLUGIN = plugin({
  id: 'hidden-utility',
  title: 'Hidden Utility',
  manifest: { od: { mode: 'deck', hidden: true } },
});

const DESIGN_SYSTEM_PLUGIN = plugin({
  id: 'design-system-airbnb',
  title: 'Airbnb',
  manifest: { od: { mode: 'design-system' } },
});

const CATALOGUE = [PITCH_DECK, SALES_DECK, LANDING_PROTOTYPE, IMAGE_TEMPLATE, HIDDEN_PLUGIN, DESIGN_SYSTEM_PLUGIN];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  analytics.track.mockReset();
  fetchMock = vi.fn(async (url: unknown) => {
    if (url === '/api/plugins') {
      return new Response(JSON.stringify({ plugins: CATALOGUE }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    // The card's full details modal (PluginDetailsModal) loads the plugin's
    // real daemon-served page for html-preview plugins.
    if (typeof url === 'string' && /^\/api\/plugins\/[^/]+\/preview$/.test(url)) {
      return new Response('<!doctype html><html><body>plugin preview</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }
    throw new Error(`unexpected fetch ${String(url)}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  // jsdom implements no media playback, and MediaSurface starts a baked clip as
  // soon as the tile is visible. Stub the transport so the virtual console stays
  // clean; the assertions below are about what gets mounted, not about decoding.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

afterEach(() => {
  // Unmount first: the media stubs must outlive teardown, otherwise a clip that
  // is still settling when the tree unmounts reaches jsdom's unimplemented
  // transport and noises up the run.
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Read every type tab as { label } plus the cards currently gridded. */
function readFacets() {
  const tabs = Array.from(
    document.querySelectorAll('.community-template-view__type-tabs button'),
  ) as HTMLButtonElement[];
  return tabs.map((tab) => ({
    tab,
    label: tab.querySelector('span')?.textContent?.trim() ?? '',
  }));
}

/**
 * Each type's share of the catalogue, in tab order.
 *
 * #6156 replaced the tabs' `<small>` count badges with type icons, so a
 * facet's size is no longer advertised anywhere in the markup. Drive each tab
 * and count the grid instead — that is the same array the badges used to be
 * derived from, so the catalogue-fidelity invariant survives the badge's
 * removal. Leaves the last tab active; re-click if the caller needs another.
 */
function readFacetCardCounts(): number[] {
  return readFacets().map(({ tab }) => {
    fireEvent.click(tab);
    return renderedCards().length;
  });
}

function renderedCards() {
  return Array.from(
    document.querySelectorAll('.community-template-grid .community-template-card'),
  ) as HTMLElement[];
}

async function renderCommunity(props: Parameters<typeof CommunityView>[0] = {}) {
  render(<CommunityView {...props} />);
  // The tab row is fixed (it renders before the catalogue arrives), so readiness
  // is the grid: the default Prototype tab grids its one fixture card once
  // GET /api/plugins resolves.
  await waitFor(() => expect(renderedCards().length).toBeGreaterThan(0));
}

/** Activate the tab whose (English) label matches, e.g. 'Slides'. */
function clickTab(label: string) {
  fireEvent.click(readFacets().find((facet) => facet.label === label)!.tab);
}

describe('CommunityView analytics', () => {
  it('embeds the same catalogue without tabs and follows the composer type', () => {
    const onUsePrompt = vi.fn();
    // Home passes the visible catalogue, just like listPlugins does.
    const catalog = [PITCH_DECK, SALES_DECK, LANDING_PROTOTYPE, IMAGE_TEMPLATE, DESIGN_SYSTEM_PLUGIN];
    const { rerender } = render(
      <CommunityView contentOnly catalog={catalog} selectedType={communityTypeForChip('prototype')} />,
    );
    expect(renderedCards().map((card) => card.dataset.templateType)).toEqual(['Prototype']);
    expect(document.querySelector('.community-template-view__header')).toBeNull();
    expect(readFacets()).toHaveLength(0);

    rerender(<CommunityView contentOnly catalog={catalog} selectedType={communityTypeForChip('deck')} onUsePrompt={onUsePrompt} />);
    expect(renderedCards().map((card) => card.dataset.templateType)).toEqual(['Slides', 'Slides']);
    fireEvent.click(renderedCards()[0]!.querySelector('.community-template-card__prompt-btn')!);
    expect(onUsePrompt).toHaveBeenCalledWith(expect.objectContaining({
      templateId: PITCH_DECK.id, chipId: 'deck', projectKind: 'deck',
    }));

    rerender(<CommunityView contentOnly catalog={catalog} selectedType={communityTypeForChip('image')} />);
    expect(renderedCards().map((card) => card.dataset.templateType)).toEqual(['Image']);
    expect(document.querySelector('.community-template-grid')?.getAttribute('data-layout')).toBe('masonry');
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/plugins')).toBe(false);
    expect(analytics.track.mock.calls.some(([event]) => event === 'page_view')).toBe(false);
  });

  it('shows the full community catalogue for the type on Home', () => {
    const extraDecks = Array.from({ length: 4 }, (_, index) => plugin({
      id: `example-extra-deck-${index}`,
      title: `Extra Deck ${index}`,
      manifest: { od: { mode: 'deck', preview: { type: 'html', entry: './example.html' } } },
    }));
    const catalog = [PITCH_DECK, SALES_DECK, ...extraDecks];
    const { rerender } = render(
      <CommunityView contentOnly catalog={catalog} selectedType="Slides" />,
    );
    expect(renderedCards()).toHaveLength(6);

    rerender(<CommunityView catalog={catalog} />);
    clickTab('Slides');
    expect(renderedCards()).toHaveLength(6);
  });

  it('records one page exposure when StrictMode replays mount effects', async () => {
    render(
      <StrictMode>
        <CommunityView />
      </StrictMode>,
    );
    await waitFor(() => expect(readFacets().length).toBeGreaterThan(0));

    expect(analytics.track).toHaveBeenCalledTimes(1);
    expect(analytics.track).toHaveBeenCalledWith(
      'page_view',
      expect.objectContaining({ page_name: 'community' }),
      undefined,
    );
  });
});

describe('CommunityView catalogue source', () => {
  it('builds the grid from GET /api/plugins', async () => {
    await renderCommunity();

    expect(fetchMock).toHaveBeenCalledWith('/api/plugins', undefined);

    // The row mirrors the Home type row's taxonomy and order — Prototype leads
    // — and renders every kind even though the fixture catalogue has no
    // Document or media template yet.
    const facets = readFacets();
    expect(facets.map((facet) => facet.label)).toEqual([
      'Prototype', 'Slides', 'Document', 'Image', 'HyperFrames', 'Live Artifact', 'Video', 'Audio',
    ]);

    // The card caption is the template's own title now — the type line it used
    // to carry is what the filters above the grid already say. Asserted before
    // the tab walk below, which leaves a different facet active.
    expect(renderedCards().map((card) => card.querySelector('.community-template-card__foot span')?.textContent))
      .toEqual(['SaaS Landing Page']);

    // Each tab grids exactly the plugins the daemon served for its kind — not
    // a bundled demo array. Document is empty until document templates ship.
    expect(readFacetCardCounts()).toEqual([1, 2, 0, 1, 0, 0, 0, 0]);
  });

  it('leaves hidden and design-system plugins out of the gallery', async () => {
    await renderCommunity();

    // Neither plugin has a home in the artifact taxonomy, so no tab may render
    // them — the four eligible plugins are the whole gallery.
    const total = readFacetCardCounts().reduce((sum, count) => sum + count, 0);
    expect(total).toBe(4);
    expect(screen.queryByText(/Airbnb/)).toBeNull();
    expect(screen.queryByText(/Hidden Utility/)).toBeNull();
  });

  it('renders no sub-facet pill row — the type tabs are the whole filter surface', async () => {
    await renderCommunity();

    expect(document.querySelector('.community-template-view__subtabs')).toBeNull();
  });
});

describe('CommunityView previews', () => {
  it('shows the plugin\'s own poster on the card and its live page in the full details modal', async () => {
    await renderCommunity();
    clickTab('Slides');

    // Card thumbnail: the daemon-baked poster for that plugin.
    const thumb = renderedCards()[0]!.querySelector('img.plugins-home__media-img');
    expect(thumb?.getAttribute('src')).toBe('https://assets.test/fundraising/poster.jpg');

    // Card body → the FULL plugin details modal (飞书 recvqxDuYM6Uxk): the
    // Use split action + Share chrome, loading the plugin's real preview
    // endpoint — not the lightweight footer-Remix preview, which now belongs
    // to the creation page's template chip.
    fireEvent.click(renderedCards()[0]!);
    await waitFor(() => {
      expect(screen.queryByTestId('plugin-details-use-example-fundraising-deck')).not.toBeNull();
    });
    expect(document.querySelector('.template-share-trigger')).not.toBeNull();
    expect(document.querySelector('.community-template-preview')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/plugins/example-fundraising-deck/preview');
  });

  it('plays the daemon-baked clip on the card instead of freezing it into a poster', async () => {
    // Regression: the card kept only `poster` out of the baked media spec and
    // rendered a bare <img>, so the gallery every tile went static — the short
    // looping screen recording the shipped gallery plays was dropped on the
    // floor even though the daemon still attached it and the classifier still
    // resolved it.
    await renderCommunity();
    clickTab('Slides');

    const card = renderedCards()[0]!;
    expect(card.querySelector('img.community-template-thumb__image')).toBeNull();

    const video = card.querySelector('video.plugins-home__media-video');
    expect(video).not.toBeNull();
    expect(video!.getAttribute('src')).toBe('https://assets.test/fundraising/preview.mp4');
    // The poster stays the first paint, so the tile never flashes empty.
    expect(video!.getAttribute('poster')).toBe('https://assets.test/fundraising/poster.jpg');
    // A baked clip carries `holdMs`, which is what makes the tile loop its
    // in-place span while idle rather than waiting for hover.
    expect(video!.getAttribute('loop')).not.toBeNull();
  });

  it('leaves a still-image template on its poster, with no clip to play', async () => {
    // Only baked previews ship a clip; an image-template plugin must not grow a
    // <video> just because the tile now routes through the shared surface.
    await renderCommunity();

    fireEvent.click(readFacets().find((facet) => facet.label === 'Image')!.tab);
    const card = renderedCards()[0]!;
    expect(card.querySelector('img.plugins-home__media-img')?.getAttribute('src'))
      .toBe('https://assets.test/poster.jpg');
    expect(card.querySelector('video')).toBeNull();
  });

  it('keeps the typographic paper thumb for records with no poster at all', async () => {
    // The B2B deck ships an html preview and no bake, so there is no media spec
    // to mount — that card must still fall back to the stylized paper tile.
    await renderCommunity();
    clickTab('Slides');

    const card = renderedCards()[1]!;
    expect(card.querySelector('.community-template-thumb__paper')).not.toBeNull();
    expect(card.querySelector('.community-template-thumb__media')).toBeNull();
  });

  it('carries a media template\'s poster into the full details modal stage', async () => {
    await renderCommunity();

    fireEvent.click(readFacets().find((facet) => facet.label === 'Image')!.tab);
    fireEvent.click(renderedCards()[0]!);

    // Image templates dispatch to the media detail surface of the full
    // modal, which stages the plugin's own poster.
    await waitFor(() => {
      expect(document.querySelector('img.plugin-media-stage__image')).not.toBeNull();
    });
    expect(document.querySelector('img.plugin-media-stage__image')?.getAttribute('src'))
      .toBe('https://assets.test/poster.jpg');
    expect(document.querySelector('.community-template-preview')).toBeNull();
  });
});

describe('CommunityView remix', () => {
  it('threads the real plugin id + its curated seed prompt into onRemixTemplate', async () => {
    // The primary "Remix" CTA must not drop the selected template, and it must
    // hand over the plugin's own curated seed rather than a synthesized
    // "Remix the ... community template" sentence.
    const onRemix = vi.fn();
    await renderCommunity({ onRemixTemplate: onRemix });
    clickTab('Slides');

    const remixButtons = screen.getAllByRole('button', { name: 'Remix' });
    expect(remixButtons.length).toBeGreaterThan(0);
    fireEvent.click(remixButtons[0]!);

    expect(onRemix).toHaveBeenCalledTimes(1);
    expect(onRemix.mock.calls[0]![0]).toEqual({
      templateId: 'example-fundraising-deck',
      prompt: 'A decision-grade seed round narrative.',
    });
  });

  it('drops repeat Remix clicks that land before React re-renders (rapid click race)', async () => {
    // Regression for a bug that survived an earlier "fix": a `useState`-only
    // in-flight guard (`if (remixingId) return; setRemixingId(id);`) reads
    // `remixingId` from the closure of whichever render is currently
    // mounted. `setRemixingId` does not update that closure synchronously,
    // so a burst of clicks that all fire before React commits the first
    // state update all read the same stale (pre-click) `remixingId` and all
    // sail past the guard. Real double-account browser verification with 5
    // rapid clicks on this exact button produced 5 `POST /api/projects`.
    //
    // `fireEvent.click(...)` called 5x in a row does NOT reproduce this:
    // Testing Library wraps every `fireEvent` call in its own `act()`, which
    // flushes a full render between each call, so by click #2 the component
    // already has the updated (post-click #1) closure and the guard works
    // "by accident" in the test even though it is broken in the browser.
    // Dispatching the raw native events directly, back to back with no
    // await/act boundary between them, reproduces the same same-tick burst
    // a real fast click produces: React's automatic batching only commits
    // once the whole synchronous burst finishes, so every handler
    // invocation still observes the pre-click state -- exactly the failure
    // mode a synchronous ref does not have.
    const onRemix = vi.fn();
    await renderCommunity({ onRemixTemplate: onRemix });
    clickTab('Slides');

    const remixButton = screen.getAllByRole('button', { name: 'Remix' })[0]!;
    for (let i = 0; i < 5; i += 1) {
      remixButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }

    await waitFor(() => expect(onRemix).toHaveBeenCalled());
    expect(onRemix).toHaveBeenCalledTimes(1);
  });

  it('drops repeat clicks on the details modal\'s Remix menu item under the same race', async () => {
    // The full modal's Remix menu item routes through handleTemplateAction —
    // the same synchronous lock as the grid card — not a second,
    // independently-racy copy of the guard. The 5 raw dispatches all land in
    // one tick, before React commits the popover-close state update, so every
    // handler invocation really runs (see the rapid-click note above).
    const onRemix = vi.fn();
    await renderCommunity({ onRemixTemplate: onRemix });
    clickTab('Slides');

    fireEvent.click(renderedCards()[0]!);
    await waitFor(() => {
      expect(screen.queryByTestId('plugin-details-use-example-fundraising-deck-menu')).not.toBeNull();
    });
    fireEvent.click(screen.getByTestId('plugin-details-use-example-fundraising-deck-menu'));
    const remixItem = await screen.findByTestId('plugin-details-duplicate-example-fundraising-deck');

    for (let i = 0; i < 5; i += 1) {
      remixItem.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }

    await waitFor(() => expect(onRemix).toHaveBeenCalled());
    expect(onRemix).toHaveBeenCalledTimes(1);
    expect(onRemix.mock.calls[0]![0]).toEqual({
      templateId: 'example-fundraising-deck',
      prompt: 'A decision-grade seed round narrative.',
    });
  });

  it('still fires on a single, ordinary click (the fix must not swallow real clicks)', async () => {
    const onRemix = vi.fn();
    await renderCommunity({ onRemixTemplate: onRemix });

    const remixButton = screen.getAllByRole('button', { name: 'Remix' })[0]!;
    fireEvent.click(remixButton);

    expect(onRemix).toHaveBeenCalledTimes(1);
  });
});

describe('CommunityView use handoff', () => {
  it('carries the selected Community type with the card prompt action', async () => {
    const onUsePrompt = vi.fn();
    await renderCommunity({ onUsePrompt });
    clickTab('Slides');

    fireEvent.click(screen.getAllByRole('button', { name: 'Try it now' })[0]!);

    expect(onUsePrompt).toHaveBeenCalledWith({
      templateId: 'example-fundraising-deck',
      prompt: 'A decision-grade seed round narrative.',
      chipId: 'deck',
      projectKind: 'deck',
    });
  });

  it('carries Prototype through the details modal Use action', async () => {
    const onUsePlugin = vi.fn();
    await renderCommunity({ onUsePlugin });
    const prototypeTab = readFacets().find(({ label }) => label === 'Prototype')!.tab;
    fireEvent.click(prototypeTab);
    fireEvent.click(renderedCards()[0]!);

    fireEvent.click(await screen.findByTestId('plugin-details-use-example-landing-prototype'));

    expect(onUsePlugin).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'example-landing-prototype' }),
      'use',
      {
        templateId: 'example-landing-prototype',
        prompt: 'A conversion-focused SaaS landing page.',
        chipId: 'prototype',
        projectKind: 'prototype',
      },
    );
  });
});

describe('CommunityView facet counts', () => {
  it('grids only the cards belonging to the active type', async () => {
    // Regression: the badges were a hand-written lookup table unrelated to the
    // catalogue, so Slides advertised 80 while rendering 2 cards, and Live
    // Artifact advertised 5 while rendering 8. #6156 dropped the badges
    // themselves (type icons took their place), so what survives is the
    // invariant that always mattered: a tab may only grid cards of its own
    // type, straight from the array the grid maps over.
    await renderCommunity();

    const facets = readFacets();
    expect(facets.length).toBeGreaterThan(0);

    for (const { tab, label } of facets) {
      fireEvent.click(tab);
      // The caption is the template name now, so the type it was gridded under
      // is read off the card itself rather than parsed out of the caption.
      const types = renderedCards().map((card) => card.getAttribute('data-template-type') ?? '');
      // The row is fixed to the Home taxonomy, so a tab may legitimately grid
      // nothing (Document has no published templates yet) — but every card it
      // does grid must be its own type. `TemplateType` and its English tab
      // label are the same string ('Slides', 'Prototype', …) and this suite
      // renders in English, so the tab's own label is the expected value
      // without a lookup table.
      for (const type of types) expect(type).toBe(label);
    }
  });

  it('never grids more templates than the whole catalogue', async () => {
    // The old badge table summed to 269 across 24 templates. With the badges
    // gone (#6156) the tabs can still over-report by gridding the same plugin
    // under several types, so pin the walked total to the eligible catalogue.
    await renderCommunity();

    const renderedTotal = readFacetCardCounts().reduce((sum, count) => sum + count, 0);

    expect(renderedTotal).toBe(4);
  });
});

describe('CommunityView header', () => {
  it('ships no header search — the tab row is the whole filter surface', async () => {
    await renderCommunity();

    expect(document.querySelector('.community-template-view__search')).toBeNull();
  });
});

describe('CommunityView tab signal', () => {
  // The docked composer at the foot of this view folds back to its collapsed
  // default on every tab change (per product: tab 之间的切换的时候这个输入框
  // 默认是收起来的). EntryShell turns each call into a counter bump that reaches
  // HomeHero; this pins the signal at its source.
  it('reports a tab change for the type row', async () => {
    const onTabsChange = vi.fn();
    await renderCommunity({ onTabsChange });
    onTabsChange.mockClear();

    // Prototype is the default, so switching AWAY from it is what re-fires
    // the signal.
    clickTab('Slides');

    expect(onTabsChange).toHaveBeenCalled();
  });
});

describe('CommunityView card byline', () => {
  it('names the publisher from the catalogue and keeps the type line under the caption', async () => {
    await renderCommunity();
    // Prototype leads the row now, and its one card is not the fixture pair
    // this spec is about — the two Slides decks are (one with a manifest
    // author, one without).
    clickTab('Slides');
    const [pitch, sales] = renderedCards();

    // Manifest author wins outright.
    expect(pitch!.querySelector('.community-template-card__author')?.textContent).toBe('Zara Zhang');
    expect(pitch!.querySelector('.community-template-card__avatar')?.textContent).toBe('Z');
    // No manifest author: every fixture here is `sourceKind: 'bundled'`, i.e.
    // shipped by the daemon, so the source answers it. Never a made-up handle.
    expect(sales!.querySelector('.community-template-card__author')?.textContent).toBe('Open Design');

    // The `type · sub-facet` line the caption gave up when it became the title
    // rides the byline instead of disappearing.
    expect(sales!.querySelector('.community-template-card__meta')?.textContent)
      .toBe('Slides \u00b7 B2B sales');
  });
});

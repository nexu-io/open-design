// @vitest-environment jsdom
//
// Community is the plugin catalogue rendered as a template gallery. Its cards,
// facet badges, thumbnails, and composer seeds must all resolve from the one
// live source — GET /api/plugins — so the page can never drift back to a
// hand-written demo array that shows 24 templates while the daemon serves ~300.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityView } from '../src/components/CommunityView';

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
    trust: 'bundled' as const,
    sourceKind: 'bundled' as const,
    source: `/plugins/_official/${fixture.id}`,
    manifest: { name: fixture.id, title: fixture.title, ...fixture.manifest },
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

// A kind outside the four fixed tabs: reachable through the row's 更多 popover
// only, and only mixed into the catalogue by the specs that exercise it.
const VIDEO_TEMPLATE = plugin({
  id: 'video-template-teaser',
  title: 'Product Teaser',
  manifest: {
    description: 'A fifteen-second product teaser.',
    tags: ['teaser'],
    od: { mode: 'video', preview: { type: 'image', poster: 'https://assets.test/teaser.jpg' } },
  },
});

const CATALOGUE = [PITCH_DECK, SALES_DECK, LANDING_PROTOTYPE, IMAGE_TEMPLATE, HIDDEN_PLUGIN, DESIGN_SYSTEM_PLUGIN];

function serveCatalogue(plugins: unknown[]) {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ plugins }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }));
}

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

/** Read every inline type tab as { label } plus the cards currently gridded.
 *  The 更多 trigger (when the catalogue has overflow kinds) is not a tab. */
function readFacets() {
  const tabs = Array.from(
    document.querySelectorAll('.community-template-view__type-tabs button.home-hero__type-pill:not(.home-hero__type-pills-more-btn)'),
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
    // — and renders all four kinds even though the fixture catalogue has no
    // Document template yet. Each tab wears the Home pill and its hue hook.
    const facets = readFacets();
    expect(facets.map((facet) => facet.label)).toEqual(['Prototype', 'Slides', 'Document', 'Image']);
    expect(facets.map((facet) => facet.tab.getAttribute('data-chip'))).toEqual(['prototype', 'deck', 'document', 'image']);
    expect(facets[0]!.tab.classList.contains('is-active')).toBe(true);
    expect(facets[0]!.tab.getAttribute('aria-pressed')).toBe('true');

    // The card caption is the template's own title now — the type line it used
    // to carry rides the byline. Asserted before the tab walk below, which
    // leaves a different facet active.
    expect(renderedCards().map((card) => card.querySelector('.community-template-card__title')?.textContent))
      .toEqual(['SaaS Landing Page']);
    expect(renderedCards().map((card) => card.querySelector('.community-template-card__meta')?.textContent))
      .toEqual(['Prototype · Landing / marketing']);

    // Each tab grids exactly the plugins the daemon served for its kind — not
    // a bundled demo array. Document is empty until document templates ship.
    expect(readFacetCardCounts()).toEqual([1, 2, 0, 1]);
  });

  it('keeps Prototype as the lead tab and shows the empty state when the catalogue has none', async () => {
    serveCatalogue([PITCH_DECK, SALES_DECK]);

    render(<CommunityView />);
    await waitFor(() => expect(screen.getByTestId('community-empty-state')).toBeTruthy());

    // The row is fixed to the Home taxonomy, so it does not fall through to
    // the first kind that happens to have cards.
    const facets = readFacets();
    expect(facets.map((facet) => facet.label)).toEqual(['Prototype', 'Slides', 'Document', 'Image']);
    expect(facets[0]!.tab.classList.contains('is-active')).toBe(true);
    expect(renderedCards()).toHaveLength(0);
    expect(screen.getByText('No Prototype templates yet')).toBeTruthy();
    expect(screen.getByText('Templates published to the community will show up here.')).toBeTruthy();
    expect(document.querySelector('img.community-template-view__no-results-mark')?.getAttribute('src'))
      .toBe('/community-empty-mark.svg');

    // The empty state clears as soon as a tab with cards is picked.
    clickTab('Slides');
    expect(screen.queryByTestId('community-empty-state')).toBeNull();
    expect(renderedCards()).toHaveLength(2);
  });

  it('holds the empty state back until the catalogue has answered', async () => {
    let resolveCatalogue: (response: Response) => void = () => {};
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => { resolveCatalogue = resolve; }));

    render(<CommunityView />);

    // Every tab is empty before GET /api/plugins lands; painting "no templates
    // yet" for the length of the fetch would flash on every visit.
    expect(screen.queryByTestId('community-empty-state')).toBeNull();
    resolveCatalogue(new Response(JSON.stringify({ plugins: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    await waitFor(() => expect(screen.getByTestId('community-empty-state')).toBeTruthy());
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

  it('renders no sub-facet pill row and no header search — the type tabs are the whole filter surface', async () => {
    await renderCommunity();

    expect(document.querySelector('.community-template-view__subtabs')).toBeNull();
    expect(document.querySelector('.community-template-view__search')).toBeNull();
  });

  it('keeps kinds outside the fixed row reachable through the 更多 popover', async () => {
    serveCatalogue([...CATALOGUE, VIDEO_TEMPLATE]);
    await renderCommunity();

    // The four fixed tabs are unchanged; Video is not one of them.
    expect(readFacets().map((facet) => facet.label)).toEqual(['Prototype', 'Slides', 'Document', 'Image']);
    expect(screen.queryByTestId('community-type-tabs-popover')).toBeNull();

    fireEvent.click(screen.getByTestId('community-type-tabs-more'));
    const popover = screen.getByTestId('community-type-tabs-popover');
    expect(Array.from(popover.querySelectorAll('button')).map((button) => button.textContent?.trim()))
      .toEqual(['Video']);

    fireEvent.click(screen.getByTestId('community-type-tab-video-more'));

    // Picking it closes the popover and promotes the kind to an inline, lit
    // pill after 图片 so the selection is always visible.
    expect(screen.queryByTestId('community-type-tabs-popover')).toBeNull();
    expect(readFacets().map((facet) => facet.label)).toEqual(['Prototype', 'Slides', 'Document', 'Image', 'Video']);
    expect(readFacets()[4]!.tab.classList.contains('is-active')).toBe(true);
    // Video was the only overflow kind, so nothing is left for 更多 to show.
    expect(screen.queryByTestId('community-type-tabs-more')).toBeNull();
    expect(renderedCards().map((card) => card.getAttribute('data-template-type'))).toEqual(['Video']);
    expect(document.querySelector('.community-template-grid')?.getAttribute('data-layout')).toBe('masonry');

    // Back on a fixed tab the promoted pill retires and 更多 returns.
    clickTab('Slides');
    expect(readFacets().map((facet) => facet.label)).toEqual(['Prototype', 'Slides', 'Document', 'Image']);
    expect(screen.getByTestId('community-type-tabs-more')).toBeTruthy();
  });

  it('lays the media tabs out as a masonry and every other tab as the shared grid', async () => {
    await renderCommunity();
    const grid = () => document.querySelector('.community-template-grid');

    expect(grid()?.getAttribute('data-layout')).toBeNull();
    clickTab('Image');
    expect(grid()?.getAttribute('data-layout')).toBe('masonry');
    clickTab('Slides');
    expect(grid()?.getAttribute('data-layout')).toBeNull();
  });
});

describe('CommunityView previews', () => {
  it('centres deck media in the 16:9 preview crop while legacy bakes are being replaced', async () => {
    await renderCommunity();
    clickTab('Slides');

    expect(renderedCards()[0]!.querySelector('.community-template-card__preview.is-deck'))
      .not.toBeNull();
  });

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

    clickTab('Image');
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

    clickTab('Image');
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
  it('shows Remix + Try it now for duplicable decks, but only Try it now for prompt-driven media', async () => {
    await renderCommunity();

    const actions = () => Array.from(
      renderedCards()[0]!.querySelectorAll<HTMLButtonElement>('.community-template-card__actions button'),
    );
    expect(actions().map((button) => button.textContent?.trim())).toEqual(['Remix', 'Try it now']);
    // Icon leads the label on both pills; the glyph is decorative.
    for (const button of actions()) expect(button.querySelector('svg')).not.toBeNull();
    // The actions overlay the plate (outside the aria-hidden preview) so
    // assistive tech keeps both controls.
    const plate = renderedCards()[0]!.querySelector('.community-template-card__plate');
    expect(plate?.querySelector('.community-template-card__preview')).not.toBeNull();
    expect(plate?.querySelector('.community-template-card__actions')).not.toBeNull();
    expect(renderedCards()[0]!.querySelector('[aria-hidden] .community-template-card__actions')).toBeNull();

    clickTab('Image');
    expect(actions().map((button) => button.textContent?.trim())).toEqual(['Try it now']);
    expect(screen.queryByRole('button', { name: 'Copy prompt' })).toBeNull();
  });

  it('applies a media template as the active composer driver when Use is clicked', async () => {
    const onUsePlugin = vi.fn();
    const onUsePrompt = vi.fn();
    await renderCommunity({ onUsePlugin, onUsePrompt });

    clickTab('Image');
    fireEvent.click(screen.getByRole('button', { name: 'Try it now' }));

    expect(onUsePlugin).toHaveBeenCalledWith(IMAGE_TEMPLATE, 'use-with-query', {
      templateId: 'image-template-poster',
      prompt: 'A typography-led key art poster.',
      chipId: 'image',
      projectKind: 'image',
    });
    expect(onUsePrompt).not.toHaveBeenCalled();
  });

  it('threads the real plugin id + its curated seed prompt into onRemixTemplate', async () => {
    // The primary "Remix" CTA must not drop the selected template, and it must
    // hand over the plugin's own curated seed rather than a synthesized
    // "Remix the ... community template" sentence.
    const onRemix = vi.fn();
    await renderCommunity({ onRemixTemplate: onRemix });

    const remixButtons = screen.getAllByRole('button', { name: 'Remix' });
    expect(remixButtons.length).toBeGreaterThan(0);
    fireEvent.click(remixButtons[0]!);

    expect(onRemix).toHaveBeenCalledTimes(1);
    expect(onRemix.mock.calls[0]![0]).toEqual({
      templateId: 'example-landing-prototype',
      prompt: 'A conversion-focused SaaS landing page.',
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
  it('carries the selected Community type with the card Use action', async () => {
    const onUsePrompt = vi.fn();
    await renderCommunity({ onUsePrompt });

    fireEvent.click(screen.getAllByRole('button', { name: 'Try it now' })[0]!);

    expect(onUsePrompt).toHaveBeenCalledWith({
      templateId: 'example-landing-prototype',
      prompt: 'A conversion-focused SaaS landing page.',
      chipId: 'prototype',
      projectKind: 'prototype',
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

describe('CommunityView card byline', () => {
  it('names the publisher from the catalogue and keeps the type line under the caption', async () => {
    await renderCommunity();
    // Prototype leads the row, and its one card is not the fixture pair this
    // spec is about — the two Slides decks are (one with a manifest author,
    // one without).
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

// @vitest-environment jsdom
//
// Stage B of plugin-driven-flow-plan — Home intent tabs / shortcuts.
// Covers:
//   - Every chip in the catalog renders with its test id.
//   - Clicking a chip forwards the full chip descriptor to onPickChip
//     so the dispatcher in HomeView can route to the right flow.
//   - The active + pending UI states light up the right chip and
//     disable all chips while a plugin is mid-apply.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InstalledPluginRecord } from '@open-design/contracts';

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: () => null,
}));

import { HomeHero, homeHeroExamplePluginsForChip } from '../../src/components/HomeHero';
import {
  HOME_HERO_CHIPS,
  HOME_TYPE_ROW_IDS,
  HOME_TYPE_ROW_MORE_IDS,
  findChip,
} from '../../src/components/home-hero/chips';

afterEach(() => {
  cleanup();
});

function makePlugin(
  id: string,
  mode: string,
  title = id,
  extraTags: string[] = [],
  options: { query?: string | null } = {},
): InstalledPluginRecord {
  return {
    id,
    title,
    version: '1.0.0',
    sourceKind: 'bundled',
    source: '/tmp',
    trust: 'bundled',
    capabilitiesGranted: ['prompt:inject'],
    manifest: {
      name: id,
      version: '1.0.0',
      title,
      description: 'Plugin preset fixture',
      tags: [mode, ...extraTags],
      od: {
        mode,
        useCase: {
          ...(options.query !== null
            ? { query: options.query ?? `Create with {{topic}} using ${title}` }
            : {}),
        },
        inputs: [
          {
            name: 'topic',
            label: 'Topic',
            type: 'text',
            default: 'a focused brief',
          },
        ],
        preview: { type: 'image', poster: '/preview.png' },
      },
    },
    fsPath: '/tmp',
    installedAt: 0,
    updatedAt: 0,
  };
}

function renderHero(overrides: Partial<React.ComponentProps<typeof HomeHero>> = {}) {
  const onPickChip = vi.fn();
  const onPickPlugin = vi.fn();
  const onPickExamplePlugin = vi.fn();
  const onOpenPluginDetails = vi.fn();
  const onClearActiveChip = vi.fn();
  render(
    <HomeHero
      prompt=""
      onPromptChange={() => undefined}
      onSubmit={() => undefined}
      activePluginTitle={null}
      activeChipId={null}
      onClearActivePlugin={() => undefined}
      pluginOptions={[]}
      pluginsLoading={false}
      pendingPluginId={null}
      pendingChipId={null}
      onPickPlugin={onPickPlugin}
      onPickExamplePlugin={onPickExamplePlugin}
      onOpenPluginDetails={onOpenPluginDetails}
      onPickChip={onPickChip}
      onClearActiveChip={onClearActiveChip}
      contextItemCount={0}
      error={null}
      {...overrides}
    />,
  );
  return { onPickChip, onPickPlugin, onPickExamplePlugin, onOpenPluginDetails, onClearActiveChip };
}

// Main types use cards; the remaining types stay available beside them.
function typePill(chipId: string): HTMLElement | null {
  return screen.queryByTestId(`home-hero-type-card-${chipId}`)
    ?? screen.queryByTestId(`home-hero-type-pill-${chipId}-more`);
}

function pickTemplate(chipId: string) {
  const pill = typePill(chipId);
  if (!pill) throw new Error(`No type pill for ${chipId}`);
  fireEvent.click(pill);
}

describe('HomeHero intent rail', () => {
  it('replaces starter recommendations with the selected community gallery', () => {
    renderHero({
      activeChipId: 'prototype',
      pluginOptions: [makePlugin('example-prototype', 'prototype')],
      templateGallery: <section aria-label="Community templates">Shared gallery</section>,
    });
    expect(screen.getByRole('region', { name: 'Community templates' })).toBeTruthy();
    expect(document.querySelector('.home-hero__plugin-presets-wrap')).toBeNull();
    expect(screen.queryByTestId('home-hero-prompt-examples')).toBeNull();
    expect(screen.getByTestId('home-hero-composer-card')).toBeTruthy();
  });

  it('shows the creation modules in the browser with all existing types reachable', () => {
    renderHero();
    expect(screen.getByTestId('home-hero-type-cards')).toBeTruthy();
    expect(screen.queryByTestId('home-hero-type-pills')).toBeNull();
    const reachable = new Set([
      'prototype', 'deck', 'document', 'image', 'web-clone',
      'hyperframes', 'webgl', 'live-artifact', 'video', 'audio',
    ]);
    for (const chip of HOME_HERO_CHIPS) {
      const wedge = typePill(chip.id);
      if (reachable.has(chip.id)) {
        expect(wedge).toBeTruthy();
      } else {
        expect(wedge).toBeNull();
      }
    }
  });

  it('no longer renders the inline template rail below the composer', () => {
    renderHero({ onStartBlankProject: vi.fn() });

    expect(screen.queryByTestId('home-hero-template-section')).toBeNull();
    expect(screen.queryByTestId('home-hero-template-toggle')).toBeNull();
    expect(screen.queryByTestId('home-hero-blank-project')).toBeNull();
    expect(screen.queryByTestId('home-hero-type-tabs')).toBeNull();
    expect(screen.queryByTestId('home-hero-shortcuts-trigger')).toBeNull();
    for (const chip of HOME_HERO_CHIPS) {
      expect(screen.queryByTestId(`home-hero-rail-${chip.id}`)).toBeNull();
    }
  });

  it('renders execution switcher inside the input footer when provided', () => {
    renderHero({
      executionSwitcher: (
        <button type="button" data-testid="home-execution-switcher">
          Local CLI
        </button>
      ),
    });

    const switcher = screen.getByTestId('home-execution-switcher');
    const footer = switcher.closest('.home-hero__input-foot');
    expect(footer).toBeTruthy();
  });

  it('forwards the matching chip descriptor when clicked', () => {
    const { onPickChip } = renderHero();
    pickTemplate('image');
    expect(onPickChip).toHaveBeenCalledTimes(1);
    expect(onPickChip).toHaveBeenCalledWith(findChip('image'));
  });

  it('moves the active creation chip into the composer and hides the tab row', () => {
    renderHero({ activeChipId: 'video' });
    expect(screen.queryByTestId('home-hero-type-tabs')).toBeNull();
    expect(screen.queryByTestId('home-hero-rail-video')).toBeNull();
    const node = screen.getByTestId('home-hero-template-trigger');
    expect(node.textContent).toContain('Video');
  });

  it('does not reserve an empty active-context row for a hidden chip-bound plugin', () => {
    renderHero({
      activeChipId: 'wireframe',
      activePluginTitle: 'Wireframe',
      showActivePluginChip: false,
      contextItemCount: 3,
    });

    expect(document.querySelector('.home-hero__active')).toBeNull();
    expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Wireframe');
  });

  it('clears the creation type from the pill, not from a row in the menu', () => {
    // The pill keeps its leading type icon and a trailing clear button.
    const onClearActiveChip = vi.fn();
    renderHero({ activeChipId: 'prototype', onClearActiveChip });
    expect(screen.queryByTestId('home-hero-template-reset')).toBeNull();

    fireEvent.click(screen.getByTestId('home-hero-template-clear'));
    expect(onClearActiveChip).toHaveBeenCalledTimes(1);

    // …and the type row below carries no clear of its own: re-picking the lit
    // pill is how it is undone there.
    expect(screen.queryByTestId('home-hero-template-radial-clear')).toBeNull();
  });

  it('tracks the committed template on the footer pill and resets it on clear', () => {
    // The pill mirrors the committed chip: it must pick the label up when a
    // template becomes active and fall back to the empty "Template" kicker the
    // moment the chip is cleared (issue: the pill stayed "Slide deck").
    const baseProps = {
      prompt: '',
      onPromptChange: () => undefined,
      onSubmit: () => undefined,
      activePluginTitle: null,
      activeChipId: null,
      onClearActivePlugin: () => undefined,
      pluginOptions: [],
      pluginsLoading: false,
      pendingPluginId: null,
      pendingChipId: null,
      onPickPlugin: vi.fn(),
      onPickExamplePlugin: vi.fn(),
      onPickChip: vi.fn(),
      onClearActiveChip: vi.fn(),
      contextItemCount: 0,
      error: null,
    } as React.ComponentProps<typeof HomeHero>;

    // Nothing picked → no pill at all; the type row below still offers them.
    const { rerender } = render(<HomeHero {...baseProps} activeChipId={null} />);
    expect(screen.queryByTestId('home-hero-template-trigger')).toBeNull();
    expect(typePill('deck')).toBeTruthy();

    // Picking a template from the menu commits the chip through the host.
    rerender(<HomeHero {...baseProps} activeChipId="deck" />);
    expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Slide deck');

    // Clear nulls the active chip — the pill goes away again rather than
    // falling back to an empty placeholder.
    rerender(<HomeHero {...baseProps} activeChipId={null} />);
    expect(screen.queryByTestId('home-hero-template-trigger')).toBeNull();
  });

  it('uses the active creation chip as the only clear control for a chip-bound plugin', () => {
    const activePlugin = makePlugin('example-image-a', 'image', 'Product image');
    renderHero({
      activeChipId: 'image',
      activePluginTitle: 'Product image',
      activePluginRecord: activePlugin,
      showActivePluginChip: true,
    });

    expect(screen.getByTestId('home-hero-active-plugin')).toBeTruthy();
    expect(screen.getByTestId('home-hero-template-trigger').textContent).not.toContain('None');
    expect(screen.queryByLabelText('Clear active plugin')).toBeNull();
  });

  it('keeps the active plugin clear control when no creation chip is active', () => {
    const activePlugin = makePlugin('example-image-a', 'image', 'Product image');
    const onClearActivePlugin = vi.fn();
    renderHero({
      activeChipId: null,
      activePluginTitle: 'Product image',
      activePluginRecord: activePlugin,
      onClearActivePlugin,
      showActivePluginChip: true,
    });

    const clear = screen.getByLabelText('Clear active plugin');
    fireEvent.click(clear);

    expect(onClearActivePlugin).toHaveBeenCalledTimes(1);
  });

  it('shows prompt examples below the composer for the selected tab', () => {
    const onPromptChange = vi.fn();
    renderHero({ activeChipId: 'deck', onPromptChange });

    expect(screen.getByTestId('home-hero-prompt-examples')).toBeTruthy();
    const examples = screen.getAllByTestId('home-hero-prompt-example');
    expect(examples).toHaveLength(4);

    fireEvent.click(examples[0]!);
    expect(onPromptChange).toHaveBeenCalledWith(
      'Research the market opportunity for a product launch, including competitors, target users, pricing hypotheses, and launch narrative',
    );
    // The top "selected example" pill was removed from the composer; picking an
    // example still seeds the prompt but no longer surfaces a dismissible chip.
    expect(screen.queryByTestId('home-hero-active-example')).toBeNull();
  });

  it('shows matching plugin presets in the example prompt area for the selected tab', () => {
    const deckPlugin = makePlugin('example-deck-a', 'deck', 'Investor deck');
    const imagePlugin = makePlugin('example-image-a', 'image', 'Product image');
    const { onPickExamplePlugin, onOpenPluginDetails } = renderHero({
      activeChipId: 'deck',
      pluginOptions: [deckPlugin, imagePlugin],
    });

    const presets = screen.getAllByTestId('home-hero-plugin-preset');
    expect(presets).toHaveLength(1);
    // Non-image/document types retain their original text list.
    expect(presets[0]?.textContent).toContain('Investor deck');

    // The whole card is the single click-to-use affordance (2026-07 removed
    // the hover-revealed Use/Remix overlay and the card-click-opens-details
    // behavior, restoring the #5517 baseline) — clicking it directly seeds
    // the composer with the preset's brief.
    fireEvent.click(presets[0]!);
    expect(onPickExamplePlugin).toHaveBeenCalledWith(
      deckPlugin,
      'deck',
      'Create with a focused brief using Investor deck',
    );
    expect(onOpenPluginDetails).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Preview$/ }));
    expect(onOpenPluginDetails).toHaveBeenCalledWith(deckPlugin);
  });

  it.each(['image', 'document'])('shows %s presets without visible text', (mode) => {
    const plugin = makePlugin('example-visual', mode, 'Visual preset');
    renderHero({ activeChipId: mode, pluginOptions: [plugin] });
    const card = screen.getByTestId('home-hero-plugin-preset');
    expect(card.textContent).toBe('');
    expect(card.getAttribute('aria-label')).toBe('Visual preset');
    expect(card.closest('.home-hero__plugin-presets--masonry')).toBeTruthy();
  });

  it('maps powered WebGL presets to the WebGL chip without exposing a Worker chip', () => {
    const webgl = makePlugin('example-webgl-experience', 'prototype', 'WebGL Experience', [
      'webgl',
      'webgl2',
      'shader',
      'gpu',
      'powered-preview',
    ]);
    const worker = makePlugin('example-worker-visualizer', 'prototype', 'Worker Visualizer', [
      'web-worker',
      'worker',
      'sharedarraybuffer',
      'offscreencanvas',
      'powered-preview',
    ]);
    const unrelated = makePlugin('example-web-prototype', 'prototype', 'Prototype');

    expect(homeHeroExamplePluginsForChip('webgl', [webgl, unrelated, worker], 'en')).toEqual([webgl]);
    expect(findChip('worker')).toBeUndefined();
  });

  it('orders curated example presets first for the selected artifact type', () => {
    const ordinaryDeck = makePlugin('example-ordinary-deck', 'deck', 'Ordinary deck');
    const capsule = makePlugin(
      'example-html-ppt-zhangzara-capsule',
      'deck',
      'Html Ppt Zhangzara Capsule',
    );
    const creativeMode = makePlugin(
      'example-html-ppt-zhangzara-creative-mode',
      'deck',
      'Html Ppt Zhangzara Creative Mode',
    );
    renderHero({
      activeChipId: 'deck',
      pluginOptions: [ordinaryDeck, capsule, creativeMode],
    });

    const presets = screen.getAllByTestId('home-hero-plugin-preset');
    expect(presets.map((preset) => preset.getAttribute('data-plugin-id'))).toEqual([
      'example-html-ppt-zhangzara-creative-mode',
      'example-html-ppt-zhangzara-capsule',
      'example-ordinary-deck',
    ]);
  });

  it('keeps curated presets even when they rely on fallback prompt text', () => {
    const otakuDance = makePlugin(
      'image-template-infographic-otaku-dance-choreography-breakdown-gokurakujodo-16-panels',
      'image',
      'Infographic - Otaku Dance Choreography Breakdown (Gokuraku Jodo, 16 Panels)',
      ['image-template'],
      { query: null },
    );
    const ordinaryImage = makePlugin(
      'image-template-ordinary',
      'image',
      'Ordinary image',
      ['image-template'],
    );
    renderHero({
      activeChipId: 'image',
      pluginOptions: [ordinaryImage, otakuDance],
    });

    const presets = screen.getAllByTestId('home-hero-plugin-preset');
    expect(presets[0]?.getAttribute('data-plugin-id')).toBe(
      'image-template-infographic-otaku-dance-choreography-breakdown-gokurakujodo-16-panels',
    );
  });

  it('keeps Hatch Pet at the end of the image example presets', () => {
    const hatchPet = makePlugin('example-hatch-pet', 'image', 'Hatch Pet');
    const imagePoster = makePlugin('image-template-poster', 'image', 'Image Poster');
    const stoneInfographic = makePlugin('image-template-stone', 'image', 'Stone Infographic');
    renderHero({
      activeChipId: 'image',
      pluginOptions: [hatchPet, imagePoster, stoneInfographic],
    });

    const presets = screen.getAllByTestId('home-hero-plugin-preset');
    expect(presets.map((preset) => preset.getAttribute('aria-label'))).toEqual([
      expect.stringContaining('Image Poster'),
      expect.stringContaining('Stone Infographic'),
      expect.stringContaining('Hatch Pet'),
    ]);
  });

  it('moves live artifact presets out of Image and into Live artifact examples', () => {
    const imagePoster = makePlugin('image-template-poster', 'image', 'Image Poster');
    const liveDashboard = makePlugin(
      'example-live-dashboard',
      'prototype',
      'Live Dashboard',
      ['live-dashboard'],
    );
    const notionDashboard = makePlugin(
      'image-template-notion-team-dashboard-live-artifact',
      'image',
      'Notion-style Team Dashboard (Live Artifact)',
      ['live-artifact'],
    );
    const socialTracker = makePlugin(
      'example-social-media-matrix-tracker-template',
      'template',
      'Social Media Matrix Tracker Template',
      ['live-artifacts'],
    );
    const tradingDashboard = makePlugin(
      'example-trading-analysis-dashboard-template',
      'template',
      'Trading Analysis Dashboard Template',
      ['live-artifacts'],
    );
    const liveArtifact = makePlugin(
      'example-live-artifact',
      'prototype',
      'Live Artifact',
      ['live-artifact'],
    );
    renderHero({
      activeChipId: 'image',
      pluginOptions: [imagePoster, liveDashboard, notionDashboard],
    });

    let presets = screen.getAllByTestId('home-hero-plugin-preset');
    expect(presets).toHaveLength(1);
    expect(presets[0]?.getAttribute('aria-label')).toContain('Image Poster');

    cleanup();
    renderHero({
      activeChipId: 'live-artifact',
      pluginOptions: [
        imagePoster,
        liveArtifact,
        tradingDashboard,
        notionDashboard,
        socialTracker,
        liveDashboard,
      ],
    });

    presets = screen.getAllByTestId('home-hero-plugin-preset');
    // Order within a facet is now usage/sink-driven (OPEND-449); this test is
    // about which presets route into Live Artifact, so assert membership only.
    expect(presets.map((preset) => preset.getAttribute('data-plugin-id')).sort()).toEqual([
      'example-live-artifact',
      'example-live-dashboard',
      'example-social-media-matrix-tracker-template',
      'example-trading-analysis-dashboard-template',
      'image-template-notion-team-dashboard-live-artifact',
    ]);
  });

  it('disables every template while a plugin apply is in flight', () => {
    const { onPickChip } = renderHero({
      pendingPluginId: 'od-figma-migration',
      pendingChipId: 'figma',
    });
    for (const id of [...HOME_TYPE_ROW_IDS, ...HOME_TYPE_ROW_MORE_IDS]) {
      expect((typePill(id) as HTMLButtonElement).disabled).toBe(true);
    }
    pickTemplate(HOME_TYPE_ROW_IDS[0]!);
    expect(onPickChip).not.toHaveBeenCalled();
  });

  it('keeps the generic fallback in the free-form prompt instead of an Other chip', () => {
    renderHero();

    expect(findChip('other')).toBeUndefined();
    expect(screen.queryByTestId('home-hero-rail-other')).toBeNull();
  });

  it('migration chips carry the right action discriminator', () => {
    expect(findChip('create-plugin')?.action).toMatchObject({ kind: 'create-plugin' });
    expect(findChip('figma')?.action).toMatchObject({ kind: 'apply-figma-migration' });
    expect(findChip('folder')).toBeUndefined();
    expect(findChip('template')?.action).toMatchObject({ kind: 'open-template-picker' });
  });

  it('leads the create group with the Brand Kit chip and its own action discriminator', () => {
    const createChips = HOME_HERO_CHIPS.filter((chip) => chip.group === 'create');
    expect(createChips[0]?.id).toBe('create-brand-kit');
    expect(findChip('create-brand-kit')?.action).toMatchObject({ kind: 'create-brand-kit' });
    expect(findChip('create-brand-kit')?.icon).toBe('swatchbook');
  });

  it('media chips route to od-media-generation with the matching project kind', () => {
    expect(findChip('image')?.action).toMatchObject({
      kind: 'apply-scenario',
      pluginId: 'od-media-generation',
      projectKind: 'image',
    });
    expect(findChip('video')?.action).toMatchObject({ pluginId: 'od-media-generation', projectKind: 'video' });
    expect(findChip('audio')?.action).toMatchObject({ pluginId: 'od-media-generation', projectKind: 'audio' });
  });

  it('prototype and slide-deck chips route to their specialised bundled scenario plugin', () => {
    // Prototype now binds to web-prototype's seed template instead of
    // the generic od-new-generation router. Same for Slide deck →
    // simple-deck. See packages/contracts/src/plugins/scenario-defaults.ts
    // for the rationale (battle-tested seed + layouts + checklist).
    expect(findChip('prototype')?.action).toMatchObject({ pluginId: 'example-web-prototype', projectKind: 'prototype' });
    expect(findChip('deck')?.action).toMatchObject({ pluginId: 'example-simple-deck', projectKind: 'deck' });
  });

  it('specialised category chips route to their bundled scenario plugin', () => {
    // HyperFrames is the motion-graphics specialisation of Video,
    // surfaced as a separate chip so users can target it directly
    // instead of routing through the generic Video chip.
    expect(findChip('hyperframes')?.action).toMatchObject({
      kind: 'apply-scenario',
      pluginId: 'example-hyperframes',
      projectKind: 'video',
    });
    expect(findChip('live-artifact')?.action).toMatchObject({
      kind: 'apply-scenario',
      pluginId: 'example-live-artifact',
      projectKind: 'prototype',
      projectMetadata: {
        kind: 'prototype',
        intent: 'live-artifact',
        fidelity: 'high-fidelity',
      },
    });
  });
});

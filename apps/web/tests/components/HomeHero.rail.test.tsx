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

describe('HomeHero intent rail', () => {
  it('renders creation chips as composer tabs and collapses shortcuts behind More', () => {
    renderHero();
    const tabs = screen.getByTestId('home-hero-type-tabs');
    for (const chip of HOME_HERO_CHIPS) {
      if (chip.group === 'create') {
        const node = screen.getByTestId(`home-hero-rail-${chip.id}`);
        expect(node).toBeTruthy();
        expect(tabs.contains(node)).toBe(true);
      } else {
        expect(screen.queryByTestId(`home-hero-rail-${chip.id}`)).toBeNull();
      }
    }
    fireEvent.click(screen.getByTestId('home-hero-shortcuts-trigger'));
    const menu = screen.getByTestId('home-hero-shortcuts-menu');
    for (const chip of HOME_HERO_CHIPS.filter((item) => item.group === 'migrate')) {
      const node = screen.getByTestId(`home-hero-rail-${chip.id}`);
      expect(node).toBeTruthy();
      expect(menu.contains(node)).toBe(true);
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
    fireEvent.click(screen.getByTestId('home-hero-rail-image'));
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

  it('keeps the blank project entry visible after a template is selected', () => {
    const onStartBlankProject = vi.fn();
    renderHero({ activeChipId: 'deck', onStartBlankProject });

    expect(screen.queryByTestId('home-hero-template-section')).toBeNull();
    const promptExamples = screen.getByTestId('home-hero-prompt-examples');
    const blankProject = screen.getByTestId('home-hero-blank-project');
    expect(blankProject.textContent).toContain('start a blank project');
    expect(
      promptExamples.compareDocumentPosition(blankProject) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(blankProject);
    expect(onStartBlankProject).toHaveBeenCalledTimes(1);
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

  it('lets the active creation chip be removed from the composer', () => {
    const { onClearActiveChip } = renderHero({ activeChipId: 'prototype' });
    fireEvent.click(screen.getByTestId('home-hero-template-trigger'));
    fireEvent.click(screen.getByTestId('home-hero-template-clear'));
    expect(onClearActiveChip).toHaveBeenCalledTimes(1);
  });

  it('clears the template pill to None even after a hovered rail card was picked', () => {
    // The rail owns the hover-preview and unmounts the instant a template
    // becomes active, so its mouseleave never fires — the preview must not
    // outlive the committed selection or Clear leaves a stale pill (issue: the
    // pill stayed "Slide deck" after Clear).
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

    const { rerender } = render(<HomeHero {...baseProps} activeChipId={null} />);

    // Hover the Slide deck card → the footer pill previews it.
    fireEvent.mouseEnter(screen.getByTestId('home-hero-rail-deck'));
    expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Slide deck');

    // Pick commits the chip; the rail unmounts without firing mouseleave.
    rerender(<HomeHero {...baseProps} activeChipId="deck" />);
    expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Slide deck');

    // Clear nulls the active chip — the pill must fall back to None.
    rerender(<HomeHero {...baseProps} activeChipId={null} />);
    const trigger = screen.getByTestId('home-hero-template-trigger');
    expect(trigger.textContent).toContain('None');
    expect(trigger.textContent).not.toContain('Slide deck');
  });

  it('clears the template pill to None when Clear is pressed on a stale hover-preview', () => {
    // Hovering a rail card previews it in the footer pill while the active chip
    // is still null. The reset that drops the preview keys on the *committed*
    // chip changing, so when the pointer never leaves the card (or the rail
    // unmounts mid-hover) the preview outlives the hover with activeChipId still
    // null. Pressing Clear there is a no-op on the active chip, so the pill must
    // drop the preview itself or it stays stuck on the hovered template.
    // (Reported: pill stayed on the picked template after Clear.)
    const { onClearActiveChip } = renderHero({ activeChipId: null });

    fireEvent.mouseEnter(screen.getByTestId('home-hero-rail-deck'));
    expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Slide deck');

    fireEvent.click(screen.getByTestId('home-hero-template-trigger'));
    fireEvent.click(screen.getByTestId('home-hero-template-clear'));

    expect(onClearActiveChip).toHaveBeenCalledTimes(1);
    const trigger = screen.getByTestId('home-hero-template-trigger');
    expect(trigger.textContent).toContain('None');
    expect(trigger.textContent).not.toContain('Slide deck');
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
    // The preset card is now a thumbnail + name only; the prompt blurb was
    // dropped from the card face but is still passed through on Use below.
    expect(presets[0]?.textContent).toContain('Investor deck');

    // Clicking the card body opens the preview (detail modal), not the seed.
    fireEvent.click(presets[0]!);
    expect(onOpenPluginDetails).toHaveBeenCalledWith(deckPlugin);
    expect(onPickExamplePlugin).not.toHaveBeenCalled();

    // The Use button is what seeds the composer with the preset's brief.
    fireEvent.click(screen.getByTestId('home-hero-plugin-preset-use-example-deck-a'));
    expect(onPickExamplePlugin).toHaveBeenCalledWith(
      deckPlugin,
      'deck',
      'Create with a focused brief using Investor deck',
    );
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
    expect(presets.map((preset) => preset.textContent)).toEqual([
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
    expect(presets[0]?.textContent).toContain('Image Poster');

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
    expect(presets.map((preset) => preset.getAttribute('data-plugin-id'))).toEqual([
      'example-live-dashboard',
      'image-template-notion-team-dashboard-live-artifact',
      'example-social-media-matrix-tracker-template',
      'example-trading-analysis-dashboard-template',
      'example-live-artifact',
    ]);
  });

  it('disables every visible chip while a plugin apply is in flight', () => {
    renderHero({ pendingPluginId: 'od-figma-migration', pendingChipId: 'figma' });
    for (const chip of HOME_HERO_CHIPS.filter((item) => item.group === 'create')) {
      const node = screen.getByTestId(`home-hero-rail-${chip.id}`);
      expect((node as HTMLButtonElement).disabled).toBe(true);
    }
    const trigger = screen.getByTestId('home-hero-shortcuts-trigger') as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
    expect(trigger.className).toContain('is-pending');
  });

  it('shows plugin authoring with the starter shortcuts after More opens', () => {
    renderHero();
    fireEvent.click(screen.getByTestId('home-hero-shortcuts-trigger'));
    const createPluginGroup = screen
      .getByTestId('home-hero-rail-create-plugin')
      .closest('[data-rail-group]');

    expect(createPluginGroup?.getAttribute('data-rail-group')).toBe('migrate');
    for (const id of ['figma', 'template']) {
      expect(screen.getByTestId(`home-hero-rail-${id}`).closest('[data-rail-group]'))
        .toBe(createPluginGroup);
    }
    expect(screen.queryByTestId('home-hero-rail-folder')).toBeNull();
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

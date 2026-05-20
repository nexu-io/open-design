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

import { HomeHero } from '../../src/components/HomeHero';
import {
  HOME_HERO_CHIPS,
  findChip,
} from '../../src/components/home-hero/chips';

afterEach(() => {
  cleanup();
});

function makePlugin(id: string, mode: string, title = id): InstalledPluginRecord {
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
      tags: [mode],
      od: {
        mode,
        useCase: {
          query: `Create with {{topic}} using ${title}`,
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
      onPickChip={onPickChip}
      onClearActiveChip={onClearActiveChip}
      contextItemCount={0}
      error={null}
      {...overrides}
    />,
  );
  return { onPickChip, onPickPlugin, onPickExamplePlugin, onClearActiveChip };
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
      expect(menu.contains(node)).toBe(true);
    }
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
    const node = screen.getByTestId('home-hero-active-type-chip');
    expect(node.getAttribute('data-chip-id')).toBe('video');
    expect(node.textContent).toContain('Video');
  });

  it('lets the active creation chip be removed from the composer', () => {
    const { onClearActiveChip } = renderHero({ activeChipId: 'prototype' });
    fireEvent.click(screen.getByTestId('home-hero-active-type-chip'));
    expect(onClearActiveChip).toHaveBeenCalledTimes(1);
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
  });

  it('shows matching plugin presets in the example prompt area for the selected tab', () => {
    const deckPlugin = makePlugin('example-deck-a', 'deck', 'Investor deck');
    const imagePlugin = makePlugin('example-image-a', 'image', 'Product image');
    const { onPickExamplePlugin } = renderHero({
      activeChipId: 'deck',
      pluginOptions: [deckPlugin, imagePlugin],
    });

    const presets = screen.getAllByTestId('home-hero-plugin-preset');
    expect(presets).toHaveLength(1);
    expect(presets[0]?.textContent).toContain('Investor deck');
    expect(presets[0]?.textContent).toContain('a focused brief');

    fireEvent.click(presets[0]!);
    expect(onPickExamplePlugin).toHaveBeenCalledWith(
      deckPlugin,
      'deck',
      'Create with a focused brief using Investor deck',
    );
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
    for (const id of ['figma', 'folder', 'template']) {
      expect(screen.getByTestId(`home-hero-rail-${id}`).closest('[data-rail-group]'))
        .toBe(createPluginGroup);
    }
  });

  it('keeps the generic fallback in the free-form prompt instead of an Other chip', () => {
    renderHero();

    expect(findChip('other')).toBeUndefined();
    expect(screen.queryByTestId('home-hero-rail-other')).toBeNull();
  });

  it('migration chips carry the right action discriminator', () => {
    expect(findChip('create-plugin')?.action).toMatchObject({ kind: 'create-plugin' });
    expect(findChip('figma')?.action).toMatchObject({ kind: 'apply-figma-migration' });
    expect(findChip('folder')?.action).toMatchObject({ kind: 'import-folder' });
    expect(findChip('template')?.action).toMatchObject({ kind: 'open-template-picker' });
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
    expect(findChip('live-artifact')).toBeUndefined();
  });
});

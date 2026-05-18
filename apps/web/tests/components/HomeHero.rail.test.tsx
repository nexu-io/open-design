// @vitest-environment jsdom
//
// Stage B of plugin-driven-flow-plan — Home intent rail interactions.
// Covers:
//   - Every chip in the catalog renders with its test id.
//   - Clicking a chip forwards the full chip descriptor to onPickChip
//     so the dispatcher in HomeView can route to the right flow.
//   - The active + pending UI states light up the right chip and
//     disable all chips while a plugin is mid-apply.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HomeHero } from '../../src/components/HomeHero';
import {
  HOME_HERO_CHIPS,
  findChip,
} from '../../src/components/home-hero/chips';

afterEach(() => {
  cleanup();
});

function renderHero(overrides: Partial<React.ComponentProps<typeof HomeHero>> = {}) {
  const onPickChip = vi.fn();
  const onPickPlugin = vi.fn();
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
      onPickChip={onPickChip}
      contextItemCount={0}
      error={null}
      {...overrides}
    />,
  );
  return { onPickChip, onPickPlugin };
}

describe('HomeHero intent rail', () => {
  it('renders one chip per HOME_HERO_CHIPS entry', () => {
    renderHero();
    const rail = screen.getByTestId('home-hero-rail');
    for (const chip of HOME_HERO_CHIPS) {
      const node = screen.getByTestId(`home-hero-rail-${chip.id}`);
      expect(node).toBeTruthy();
      expect(rail.contains(node)).toBe(true);
    }
  });

  it('forwards the matching chip descriptor when clicked', () => {
    const { onPickChip } = renderHero();
    fireEvent.click(screen.getByTestId('home-hero-rail-image'));
    expect(onPickChip).toHaveBeenCalledTimes(1);
    expect(onPickChip).toHaveBeenCalledWith(findChip('image'));
  });

  it('marks the active chip with aria-pressed=true and the is-active class', () => {
    renderHero({ activeChipId: 'video' });
    const node = screen.getByTestId('home-hero-rail-video');
    expect(node.getAttribute('aria-pressed')).toBe('true');
    expect(node.className).toContain('is-active');
  });

  it('disables every chip while a plugin apply is in flight', () => {
    renderHero({ pendingPluginId: 'od-figma-migration', pendingChipId: 'figma' });
    for (const chip of HOME_HERO_CHIPS) {
      const node = screen.getByTestId(`home-hero-rail-${chip.id}`);
      expect((node as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.getByTestId('home-hero-rail-figma').className).toContain('is-pending');
  });

  it('groups plugin authoring with the lower starter shortcuts', () => {
    renderHero();
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
    // Live artifact shares web-prototype's seed (interactive HTML/CSS/JS
    // is a flavour of prototype) but keeps a distinct chip id + label
    // so the rail's active state tracks user intent independently from
    // the Prototype chip.
    expect(findChip('live-artifact')?.action).toMatchObject({
      kind: 'apply-scenario',
      pluginId: 'example-web-prototype',
      projectKind: 'prototype',
    });
  });
});

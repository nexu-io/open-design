// @vitest-environment jsdom
//
// Home rail visibility policy — bodoc three-channel focus.
//
// The chip catalog keeps every chip, but the rail only SHOWS the chips
// whose `hidden` flag is unset: Braze IAM, Card News, Naver Blog. This
// suite owns that policy; the flow suites (rail / prefill / media-options
// / first-run-guide / …) mock `chipsForGroup` back to the full catalog so
// the hidden flows keep their coverage for when chips return.
//
// Covers:
//   - Only the three visible create chips render, in catalog order, so
//     the first-run guide (which pulses `chipsForGroup('create')[0]`)
//     targets a chip that is actually on screen.
//   - The migrate group is fully hidden, so the "..." shortcuts trigger
//     unmounts instead of opening an empty menu.
//   - Hidden chips stay in the catalog: `findChip` still resolves them,
//     which keeps prefill / deep-link resume of existing projects alive.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { HomeHero } from '../../src/components/HomeHero';
import {
  HOME_HERO_CHIPS,
  chipsForGroup,
  findChip,
} from '../../src/components/home-hero/chips';

afterEach(() => {
  cleanup();
});

function renderHero() {
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
      onPickPlugin={() => undefined}
      onPickExamplePlugin={() => undefined}
      onPickChip={() => undefined}
      onClearActiveChip={() => undefined}
      contextItemCount={0}
      error={null}
    />,
  );
}

const VISIBLE_CREATE_IDS = ['braze-iam', 'cardnews-instagram', 'naver-blog'];

describe('Home rail visibility (bodoc channel focus)', () => {
  it('renders only the visible create chips, in catalog order', () => {
    renderHero();

    const tabs = screen.getByTestId('home-hero-type-tabs');
    const renderedIds = Array.from(tabs.querySelectorAll('[data-chip-id]')).map(
      (el) => el.getAttribute('data-chip-id'),
    );
    expect(renderedIds).toEqual(VISIBLE_CREATE_IDS);

    // The derivation the first-run guide relies on: the pulse targets the
    // first VISIBLE create chip, never a hidden one.
    expect(chipsForGroup('create').map((c) => c.id)).toEqual(VISIBLE_CREATE_IDS);
  });

  it('unmounts the shortcuts trigger while every migrate chip is hidden', () => {
    renderHero();

    expect(chipsForGroup('migrate')).toEqual([]);
    expect(screen.queryByTestId('home-hero-shortcuts-trigger')).toBeNull();
    expect(screen.queryByTestId('home-hero-shortcuts')).toBeNull();
  });

  it('keeps hidden chips in the catalog for prefill and deep-link resume', () => {
    const hiddenIds = HOME_HERO_CHIPS.filter((c) => c.hidden).map((c) => c.id);
    expect(hiddenIds).toEqual([
      'prototype',
      'deck',
      'hyperframes',
      'live-artifact',
      'image',
      'video',
      'audio',
      'create-plugin',
      'figma',
      'template',
    ]);
    for (const id of hiddenIds) {
      expect(findChip(id)?.id).toBe(id);
    }
  });
});

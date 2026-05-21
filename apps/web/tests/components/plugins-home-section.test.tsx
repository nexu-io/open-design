// @vitest-environment jsdom

// Plugins home section — UI contract.
//
// The section renders artifact-kind filters for the starter grid:
// Prototype / Slides / Image / Video / HyperFrames / Audio. Prototype,
// Slides, Image, and Video expose a second row of scene buckets; the
// smaller HyperFrames and Audio slices stay flat. Saved is an
// orthogonal user collection override, and sparse buckets should fall
// back to the normal empty-filter state rather than rendering synthetic
// cards.

import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import type { ComponentProps } from 'react';
import { PluginsHomeSection } from '../../src/components/PluginsHomeSection';

function makePlugin(overrides: {
  id: string;
  title?: string;
  tags?: string[];
  featured?: boolean;
  mode?: string;
  kind?: 'scenario' | 'atom';
}): InstalledPluginRecord {
  return {
    id: overrides.id,
    title: overrides.title ?? overrides.id,
    version: '0.1.0',
    sourceKind: 'bundled',
    source: '/tmp',
    trust: 'bundled',
    capabilitiesGranted: ['prompt:inject'],
    manifest: {
      name: overrides.id,
      version: '0.1.0',
      title: overrides.title ?? overrides.id,
      ...(overrides.tags ? { tags: overrides.tags } : {}),
      od: {
        kind: overrides.kind ?? 'scenario',
        ...(overrides.mode ? { mode: overrides.mode } : {}),
        ...(overrides.featured ? { featured: true } : {}),
      },
    },
    fsPath: '/tmp',
    installedAt: 0,
    updatedAt: 0,
  };
}

function renderSection(
  plugins: InstalledPluginRecord[] = sample,
  props: Partial<ComponentProps<typeof PluginsHomeSection>> = {},
) {
  return render(
    <PluginsHomeSection
      plugins={plugins}
      loading={false}
      activePluginId={null}
      pendingApplyId={null}
      onUse={() => {}}
      onOpenDetails={() => {}}
      {...props}
    />,
  );
}

function pluginIds(): Array<string | null> {
  return within(screen.getByRole('list'))
    .getAllByRole('listitem')
    .map((i) => i.getAttribute('data-plugin-id'));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const sample: InstalledPluginRecord[] = [
  makePlugin({ id: 'prototype-dashboard', mode: 'prototype', tags: ['dashboard'] }),
  makePlugin({ id: 'prototype-app', mode: 'prototype', tags: ['mobile-app'] }),
  makePlugin({ id: 'deck-pitch', mode: 'deck', tags: ['pitch-deck'], featured: true }),
  makePlugin({ id: 'image-logo', mode: 'image', tags: ['logo'] }),
  makePlugin({ id: 'video-short', mode: 'video', tags: ['short-form'] }),
  makePlugin({ id: 'video-cinematic', mode: 'video', tags: ['cinematic'] }),
  makePlugin({ id: 'hyperframes-composition', mode: 'video', tags: ['hyperframes'] }),
  makePlugin({ id: 'audio-voice', mode: 'audio' }),
  makePlugin({ id: 'hidden-atom', mode: 'prototype', tags: ['dashboard'], kind: 'atom' }),
];

describe('PluginsHomeSection (category bar)', () => {
  it('frames the home shelf as community and can jump to registry', () => {
    const onBrowseRegistry = vi.fn();
    renderSection(sample, { onBrowseRegistry });

    expect(screen.getByText('Community')).toBeTruthy();
    fireEvent.click(screen.getByTestId('plugins-home-browse-registry'));
    expect(onBrowseRegistry).toHaveBeenCalledTimes(1);
  });

  it('renders the artifact category row and the default Prototype scene row', () => {
    renderSection();

    expect(screen.getByTestId('plugins-home-row-category')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-chip-saved').textContent).toContain('Saved');
    expect(screen.getByTestId('plugins-home-pill-category-all')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-category-prototype')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-category-deck')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-category-image')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-category-video')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-category-hyperframes')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-category-audio')).toBeTruthy();
    expect(screen.queryByTestId('plugins-home-pill-category-import')).toBeNull();
    expect(screen.queryByTestId('plugins-home-pill-category-create')).toBeNull();
    expect(screen.queryByTestId('plugins-home-pill-category-export')).toBeNull();

    expect(screen.getByTestId('plugins-home-row-subcategory-prototype')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-subcategory-prototype-business-dashboards')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-subcategory-prototype-app-prototypes')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-subcategory-prototype-developer-tools')).toBeTruthy();
  });

  it('filters Video separately from HyperFrames', () => {
    renderSection();

    fireEvent.click(screen.getByTestId('plugins-home-pill-category-video'));
    expect(pluginIds().sort()).toEqual(['video-cinematic', 'video-short']);
    expect(screen.getByTestId('plugins-home-row-subcategory-video')).toBeTruthy();

    fireEvent.click(screen.getByTestId('plugins-home-pill-category-hyperframes'));
    expect(pluginIds()).toEqual(['hyperframes-composition']);
    expect(screen.queryByTestId('plugins-home-row-subcategory-hyperframes')).toBeNull();
  });

  it('keeps sparse subcategories as real filters without adding contribution cards', () => {
    renderSection();

    fireEvent.click(screen.getByTestId('plugins-home-pill-category-video'));
    fireEvent.click(screen.getByTestId('plugins-home-pill-subcategory-video-social-short-form'));

    expect(pluginIds()).toEqual(['video-short']);
    expect(screen.queryByTestId('plugins-home-contribution-card')).toBeNull();
    expect(screen.queryByText(/Contribute a/i)).toBeNull();
  });

  it('saves a plugin, updates the Saved chip, and shows a toast', () => {
    renderSection();

    fireEvent.click(screen.getByTestId('plugins-home-save-prototype-dashboard'));

    expect(screen.getByTestId('plugins-home-save-prototype-dashboard').textContent).toContain('Saved');
    expect(screen.getByTestId('plugins-home-chip-saved').textContent).toContain('1');
    expect(screen.getByRole('status').textContent).toContain('Saved prototype-dashboard.');

    fireEvent.click(screen.getByTestId('plugins-home-chip-saved'));
    expect(pluginIds()).toEqual(['prototype-dashboard']);
  });

  it('shows the normal empty-filter state for planned empty buckets', () => {
    renderSection();

    fireEvent.click(screen.getByTestId('plugins-home-pill-category-video'));
    fireEvent.click(screen.getByTestId('plugins-home-pill-subcategory-video-data-explainers'));

    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText(/No plugins match the current filters/i)).toBeTruthy();
    expect(screen.queryByTestId('plugins-home-contribution-card')).toBeNull();
  });

  it('keeps HyperFrames and Audio flat', () => {
    renderSection();

    fireEvent.click(screen.getByTestId('plugins-home-pill-category-hyperframes'));
    expect(pluginIds()).toEqual(['hyperframes-composition']);
    expect(screen.queryByTestId('plugins-home-row-subcategory-hyperframes')).toBeNull();

    fireEvent.click(screen.getByTestId('plugins-home-pill-category-audio'));
    expect(pluginIds()).toEqual(['audio-voice']);
    expect(screen.queryByTestId('plugins-home-row-subcategory-audio')).toBeNull();
  });

  it('All pill clears the category filter and only shows user-facing plugins', () => {
    renderSection();

    fireEvent.click(screen.getByTestId('plugins-home-pill-category-all'));
    expect(pluginIds().sort()).toEqual([
      'audio-voice',
      'deck-pitch',
      'hyperframes-composition',
      'image-logo',
      'prototype-app',
      'prototype-dashboard',
      'video-cinematic',
      'video-short',
    ]);
  });

  it('Saved chip overrides the category selection and shows only saved plugins', () => {
    renderSection();

    fireEvent.click(screen.getByTestId('plugins-home-save-prototype-dashboard'));
    fireEvent.click(screen.getByTestId('plugins-home-pill-category-video'));
    fireEvent.click(screen.getByTestId('plugins-home-chip-saved'));

    expect(pluginIds()).toEqual(['prototype-dashboard']);
  });

  it('Clear filters from the Saved empty state escapes Saved mode back to the full catalog', () => {
    // Fresh browser, no saved plugins yet. Clicking Saved lands the
    // user on the empty filter state — the recovery CTA must take
    // them all the way back to the catalog, not just re-render the
    // same Saved empty view.
    renderSection();

    fireEvent.click(screen.getByTestId('plugins-home-chip-saved'));
    expect(screen.queryByRole('list')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Clear filters/i }));

    expect(pluginIds().sort()).toEqual([
      'audio-voice',
      'deck-pitch',
      'hyperframes-composition',
      'image-logo',
      'prototype-app',
      'prototype-dashboard',
      'video-cinematic',
      'video-short',
    ]);
  });
});

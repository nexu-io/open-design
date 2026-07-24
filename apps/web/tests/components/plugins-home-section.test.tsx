// @vitest-environment jsdom

// Plugins home section — UI contract.
//
// The section renders artifact-kind filters for the starter grid:
// Slides / Prototype / Live Artifact / Image / Video / HyperFrames / Audio.
// Prototype, Slides, Image, and Video expose a second row of scene buckets;
// the smaller Live Artifact, HyperFrames, and Audio slices stay flat. Saved is an
// orthogonal user collection override, and sparse buckets should fall
// back to the normal empty-filter state rather than rendering synthetic
// cards.

import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import type { ComponentProps } from 'react';
import { PluginsHomeSection } from '../../src/components/PluginsHomeSection';
import { I18nProvider } from '../../src/i18n';

function makePlugin(overrides: {
  id: string;
  title?: string;
  titleI18n?: Record<string, string>;
  description?: string;
  descriptionI18n?: Record<string, string>;
  tags?: string[];
  featured?: boolean;
  mode?: string;
  kind?: 'scenario' | 'atom';
  preview?: Record<string, unknown>;
  assets?: string[];
  exampleOutputs?: Array<{ path: string; title?: string }>;
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
      ...(overrides.titleI18n ? { title_i18n: overrides.titleI18n } : {}),
      ...(overrides.description ? { description: overrides.description } : {}),
      ...(overrides.descriptionI18n ? { description_i18n: overrides.descriptionI18n } : {}),
      ...(overrides.tags ? { tags: overrides.tags } : {}),
      od: {
        kind: overrides.kind ?? 'scenario',
        ...(overrides.mode ? { mode: overrides.mode } : {}),
        ...(overrides.preview ? { preview: overrides.preview } : {}),
        ...(overrides.featured ? { featured: true } : {}),
        ...(overrides.assets ? { context: { assets: overrides.assets } } : {}),
        ...(overrides.exampleOutputs ? { useCase: { exampleOutputs: overrides.exampleOutputs } } : {}),
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

function renderSectionInChinese(
  plugins: InstalledPluginRecord[] = sample,
  props: Partial<ComponentProps<typeof PluginsHomeSection>> = {},
) {
  return render(
    <I18nProvider initial="zh-CN">
      <PluginsHomeSection
        plugins={plugins}
        loading={false}
        activePluginId={null}
        pendingApplyId={null}
        onUse={() => {}}
        onOpenDetails={() => {}}
        {...props}
      />
    </I18nProvider>,
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
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const sample: InstalledPluginRecord[] = [
  makePlugin({ id: 'prototype-dashboard', mode: 'prototype', tags: ['dashboard'] }),
  makePlugin({ id: 'prototype-app', mode: 'prototype', tags: ['mobile-app'] }),
  makePlugin({ id: 'example-live-dashboard', mode: 'prototype', tags: ['live-dashboard'] }),
  makePlugin({
    id: 'image-template-notion-team-dashboard-live-artifact',
    mode: 'image',
    tags: ['live-artifact'],
  }),
  makePlugin({
    id: 'example-social-media-matrix-tracker-template',
    mode: 'template',
    tags: ['live-artifacts'],
  }),
  makePlugin({
    id: 'example-trading-analysis-dashboard-template',
    mode: 'template',
    tags: ['live-artifacts'],
  }),
  makePlugin({ id: 'example-live-artifact', mode: 'prototype', tags: ['live-artifact'] }),
  makePlugin({ id: 'deck-pitch', mode: 'deck', tags: ['fundraising-pitch'], featured: true }),
  makePlugin({ id: 'image-logo', mode: 'image', tags: ['logo'] }),
  makePlugin({ id: 'video-short', mode: 'video', tags: ['short-form'] }),
  makePlugin({ id: 'video-cinematic', mode: 'video', tags: ['cinematic'] }),
  makePlugin({ id: 'hyperframes-composition', mode: 'video', tags: ['hyperframes'] }),
  makePlugin({ id: 'audio-voice', mode: 'audio' }),
  makePlugin({ id: 'hidden-atom', mode: 'prototype', tags: ['dashboard'], kind: 'atom' }),
];

describe('PluginsHomeSection (community gallery)', () => {
  it('caps the initial gallery render so template loading does not mount the full catalog at once', () => {
    class MockIntersectionObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      takeRecords = () => [];
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    const manyPlugins = Array.from({ length: 30 }, (_value, index) =>
      makePlugin({
        id: `prototype-gallery-${index + 1}`,
        mode: 'prototype',
        tags: ['dashboard'],
        preview: { type: 'html', entry: './example.html' },
      }),
    );

    renderSection(manyPlugins, {
      cardLayout: 'gallery',
      preferDefaultFacet: false,
    });

    expect(pluginIds()).toHaveLength(12);
    expect(screen.getByRole('list').querySelector('.plugins-home__load-more-sentinel')).toBeTruthy();
  });

  it('surfaces gallery tile actions without restoring the heavier split Use menu', () => {
    const onUse = vi.fn();
    const onDuplicate = vi.fn();
    const onOpenDetails = vi.fn();
    renderSection([
      makePlugin({
        id: 'prototype-dashboard',
        mode: 'prototype',
        tags: ['dashboard'],
        preview: { type: 'html', entry: './example.html' },
      }),
      makePlugin({
        id: 'image-logo',
        mode: 'image',
        tags: ['logo'],
        preview: { type: 'image', entry: './final/logo.png', poster: './final/logo.png' },
      }),
    ], {
      cardLayout: 'gallery',
      preferDefaultFacet: false,
      onUse,
      onDuplicate,
      onOpenDetails,
    });

    // The tile overlay exposes direct actions, but keeps the richer
    // split-menu affordance in the detail modal/rich management surface.
    expect(screen.getByTestId('plugins-home-details-prototype-dashboard')).toBeTruthy();
    fireEvent.click(screen.getByTestId('plugins-home-use-prototype-dashboard'));
    expect(onUse).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'prototype-dashboard' }),
      'use',
    );
    expect(onOpenDetails).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('plugins-home-duplicate-prototype-dashboard'));
    expect(onDuplicate).toHaveBeenCalledWith(expect.objectContaining({ id: 'prototype-dashboard' }));
    expect(onOpenDetails).not.toHaveBeenCalled();
    expect(screen.queryByTestId('plugins-home-duplicate-image-logo')).toBeNull();

    expect(screen.queryByTestId('plugins-home-use-menu-prototype-dashboard')).toBeNull();
    expect(screen.queryByTestId('plugins-home-use-with-query-prototype-dashboard')).toBeNull();
  });

  it('keeps the inline Use menu on the rich management layout (PluginsView)', () => {
    renderSection(sample, { cardLayout: 'rich' });

    fireEvent.click(screen.getByTestId('plugins-home-pill-category-prototype'));
    expect(screen.getByTestId('plugins-home-use-prototype-dashboard')).toBeTruthy();
  });

  it('shows all Community types by default on the lightweight gallery layout', () => {
    const first = renderSection(sample, { cardLayout: 'gallery' });

    expect(screen.getByTestId('plugins-home-pill-category-all').getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByTestId('plugins-home-pill-category-deck').getAttribute('aria-selected')).toBe(
      'false',
    );
    expect(screen.queryByTestId('plugins-home-row-subcategory-deck')).toBeNull();

    fireEvent.click(screen.getByTestId('plugins-home-pill-category-deck'));
    expect(screen.getByTestId('plugins-home-pill-category-all').getAttribute('aria-selected')).toBe(
      'false',
    );
    expect(screen.getByTestId('plugins-home-pill-category-deck').getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(pluginIds()).toEqual(['deck-pitch']);

    first.unmount();
    renderSection(sample, { cardLayout: 'gallery' });

    expect(screen.getByTestId('plugins-home-pill-category-all').getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByTestId('plugins-home-pill-category-deck').getAttribute('aria-selected')).toBe(
      'false',
    );
  });
});

describe('PluginsHomeSection (category bar)', () => {
  it('frames the home shelf as community and can jump to registry', () => {
    const onBrowseRegistry = vi.fn();
    renderSection(sample, { onBrowseRegistry });

    expect(screen.getByText('Community')).toBeTruthy();
    fireEvent.click(screen.getByTestId('plugins-home-browse-registry'));
    expect(onBrowseRegistry).toHaveBeenCalledTimes(1);
  });

  it('renders the artifact category row and the default Slides scene row', () => {
    renderSection();

    expect(screen.getByTestId('plugins-home-row-category')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-chip-saved').textContent).toContain('Saved');
    expect(screen.getByTestId('plugins-home-pill-category-all')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-category-prototype')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-category-live-artifact')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-category-deck')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-category-image')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-category-video')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-category-hyperframes')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-category-audio')).toBeTruthy();
    expect(screen.queryByTestId('plugins-home-pill-category-import')).toBeNull();
    expect(screen.queryByTestId('plugins-home-pill-category-create')).toBeNull();
    expect(screen.queryByTestId('plugins-home-pill-category-export')).toBeNull();

    expect(screen.getByTestId('plugins-home-row-subcategory-deck')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-subcategory-deck-fundraising-pitch')).toBeTruthy();
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

  it('groups Live Artifact as its own flat Community category', () => {
    renderSection();

    fireEvent.click(screen.getByTestId('plugins-home-pill-category-live-artifact'));

    // Order is now usage/sink-driven (OPEND-449); assert grouping membership.
    expect(pluginIds().sort()).toEqual([
      'example-live-artifact',
      'example-live-dashboard',
      'example-social-media-matrix-tracker-template',
      'example-trading-analysis-dashboard-template',
      'image-template-notion-team-dashboard-live-artifact',
    ]);
    expect(screen.queryByTestId('plugins-home-row-subcategory-live-artifact')).toBeNull();
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

    fireEvent.click(screen.getByTestId('plugins-home-pill-category-prototype'));
    fireEvent.click(screen.getByTestId('plugins-home-save-prototype-dashboard'));

    expect(screen.getByTestId('plugins-home-save-prototype-dashboard').textContent).toContain('Saved');
    expect(screen.getByTestId('plugins-home-chip-saved').textContent).toContain('1');
    expect(screen.getByRole('status').textContent).toContain('Saved prototype-dashboard.');

    fireEvent.click(screen.getByTestId('plugins-home-chip-saved'));
    expect(pluginIds()).toEqual(['prototype-dashboard']);
  });

  it('localizes plugin card titles, descriptions, search, and save toast', () => {
    renderSectionInChinese([
      makePlugin({
        id: 'localized-deck',
        title: 'Swiss International Deck',
        titleI18n: { en: 'Swiss International Deck', 'zh-CN': '瑞士国际主义 Deck' },
        description: '16-column grid.',
        descriptionI18n: { en: '16-column grid.', 'zh-CN': '16 列网格。' },
        mode: 'deck',
        tags: ['grid'],
      }),
    ], { preferDefaultFacet: false });

    expect(screen.getAllByText('瑞士国际主义 Deck').length).toBeGreaterThan(0);
    expect(screen.queryByText('Swiss International Deck')).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('搜索插件…'), {
      target: { value: '瑞士' },
    });
    expect(pluginIds()).toEqual(['localized-deck']);

    fireEvent.click(screen.getByTestId('plugins-home-save-localized-deck'));
    expect(screen.getByRole('status').textContent).toContain('Saved 瑞士国际主义 Deck.');
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
      'example-live-artifact',
      'example-live-dashboard',
      'example-social-media-matrix-tracker-template',
      'example-trading-analysis-dashboard-template',
      'hyperframes-composition',
      'image-logo',
      'image-template-notion-team-dashboard-live-artifact',
      'prototype-app',
      'prototype-dashboard',
      'video-cinematic',
      'video-short',
    ]);
  });

  it('Saved chip overrides the category selection and shows only saved plugins', () => {
    renderSection();

    fireEvent.click(screen.getByTestId('plugins-home-pill-category-prototype'));
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
      'example-live-artifact',
      'example-live-dashboard',
      'example-social-media-matrix-tracker-template',
      'example-trading-analysis-dashboard-template',
      'hyperframes-composition',
      'image-logo',
      'image-template-notion-team-dashboard-live-artifact',
      'prototype-app',
      'prototype-dashboard',
      'video-cinematic',
      'video-short',
    ]);
  });
});

describe('PluginsHomeSection (sort toggle)', () => {
  // Distinct timestamps so "newest" produces an observable re-order:
  // visual appeal would lead with the poster-preview tile, freshness
  // leads with the most recently updated record.
  const timestamped: InstalledPluginRecord[] = [
    {
      ...makePlugin({
        id: 'shiny-but-old',
        mode: 'image',
        tags: ['logo'],
        preview: { type: 'image', entry: './final/logo.png', poster: './final/logo.png' },
      }),
      installedAt: 100,
      updatedAt: 100,
    },
    {
      ...makePlugin({ id: 'plain-but-fresh', mode: 'prototype', tags: ['dashboard'] }),
      installedAt: 300,
      updatedAt: 300,
    },
    {
      ...makePlugin({ id: 'plain-and-mid', mode: 'prototype', tags: ['dashboard'] }),
      installedAt: 200,
      updatedAt: 200,
    },
  ];

  it('defaults to hot and re-ranks by freshness when Newest is picked', () => {
    renderSection(timestamped, { preferDefaultFacet: false });

    // Hot (default): the poster-preview tile outranks the text-only ones.
    expect(pluginIds()[0]).toBe('shiny-but-old');
    expect(screen.getByTestId('plugins-home-sort-hot').getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByTestId('plugins-home-sort-newest'));

    expect(pluginIds()).toEqual(['plain-but-fresh', 'plain-and-mid', 'shiny-but-old']);
    expect(screen.getByTestId('plugins-home-sort-newest').getAttribute('aria-checked')).toBe('true');
  });

  it('remembers the picked order across remounts', () => {
    const first = renderSection(timestamped, { preferDefaultFacet: false });
    fireEvent.click(screen.getByTestId('plugins-home-sort-newest'));
    first.unmount();

    renderSection(timestamped, { preferDefaultFacet: false });

    expect(screen.getByTestId('plugins-home-sort-newest').getAttribute('aria-checked')).toBe('true');
    expect(pluginIds()).toEqual(['plain-but-fresh', 'plain-and-mid', 'shiny-but-old']);
  });
});

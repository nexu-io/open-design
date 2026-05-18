// @vitest-environment jsdom

// Plugins home section — UI contract.
//
// The section renders a curated workflow bar (Import / Create / Export /
// Refine / Extend) plus a scoped child row for the active lane. Picking
// a category filters the grid; the All pill clears the category filter.
// A Featured chip sits orthogonal to the row and overrides the category
// selection. This suite locks in:
//
//   1. The category row renders with All + the curated buckets that
//      have at least one plugin.
//   2. Picking a category filters the grid to plugins in that
//      bucket.
//   3. Concrete create types appear in the scoped child row, not as
//      peers of Create.
//   4. Featured chip overrides the category selection and only shows
//      curator-promoted plugins.

import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { PluginsHomeSection } from '../../src/components/PluginsHomeSection';

function makePlugin(overrides: {
  id: string;
  title?: string;
  tags?: string[];
  featured?: boolean;
  mode?: string;
  taskKind?: 'new-generation' | 'code-migration' | 'figma-migration' | 'tune-collab';
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
        kind: 'scenario',
        ...(overrides.taskKind ? { taskKind: overrides.taskKind } : {}),
        ...(overrides.mode ? { mode: overrides.mode } : {}),
        ...(overrides.featured ? { featured: true } : {}),
      },
    },
    fsPath: '/tmp',
    installedAt: 0,
    updatedAt: 0,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const sample: InstalledPluginRecord[] = [
  makePlugin({ id: 'a', mode: 'design-system' }),
  makePlugin({ id: 'b', mode: 'prototype' }),
  makePlugin({ id: 'c', mode: 'image' }),
  makePlugin({ id: 'd', mode: 'video' }),
  makePlugin({ id: 'e', mode: 'video', tags: ['hyperframes'] }),
  makePlugin({ id: 'f', mode: 'deck' }),
  makePlugin({ id: 'g', mode: 'scenario', taskKind: 'figma-migration' }),
  makePlugin({ id: 'h', mode: 'export', tags: ['export', 'react'] }),
  makePlugin({ id: 'k', mode: 'export', tags: ['export', 'nextjs', 'react'] }),
  makePlugin({ id: 'l', mode: 'export', tags: ['export', 'vuejs'] }),
  makePlugin({ id: 'm', mode: 'export', tags: ['export', 'sveltejs'] }),
  makePlugin({ id: 'n', mode: 'utility', tags: ['html-to-pptx'] }),
  makePlugin({ id: 'o', mode: 'utility', tags: ['pdf-guide'] }),
  makePlugin({ id: 'i', mode: 'scenario', taskKind: 'tune-collab' }),
  makePlugin({ id: 'j', mode: 'scenario', taskKind: 'new-generation', tags: ['plugin-authoring'] }),
];

describe('PluginsHomeSection (category bar)', () => {
  it('frames the home shelf as official starters and can jump to registry', () => {
    const onBrowseRegistry = vi.fn();
    render(
      <PluginsHomeSection
        plugins={sample}
        loading={false}
        activePluginId={null}
        pendingApplyId={null}
        onUse={() => {}}
        onOpenDetails={() => {}}
        onBrowseRegistry={onBrowseRegistry}
      />,
    );
    expect(screen.getByText('Official starters')).toBeTruthy();
    fireEvent.click(screen.getByTestId('plugins-home-browse-registry'));
    expect(onBrowseRegistry).toHaveBeenCalledTimes(1);
  });

  it('renders a single category row with All + curated buckets', () => {
    render(
      <PluginsHomeSection
        plugins={sample}
        loading={false}
        activePluginId={null}
        pendingApplyId={null}
        onUse={() => {}}
        onOpenDetails={() => {}}
      />,
    );
    expect(screen.getByTestId('plugins-home-row-category')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-category-all')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-category-import')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-category-create')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-category-export')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-category-share')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-category-deploy')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-category-refine')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-category-extend')).toBeTruthy();
    expect(screen.queryByTestId('plugins-home-pill-category-from-figma')).toBeNull();
    expect(screen.queryByTestId('plugins-home-pill-category-deck')).toBeNull();
    expect(screen.queryByTestId('plugins-home-pill-category-prototype')).toBeNull();
    expect(screen.queryByTestId('plugins-home-pill-category-design-system')).toBeNull();
    expect(screen.queryByTestId('plugins-home-pill-category-hyperframes')).toBeNull();
    expect(screen.queryByTestId('plugins-home-pill-category-video')).toBeNull();
    expect(screen.queryByTestId('plugins-home-pill-category-image')).toBeNull();
    expect(screen.queryByTestId('plugins-home-pill-category-reactjs')).toBeNull();
    expect(screen.getByTestId('plugins-home-row-subcategory-create')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-subcategory-create-prototype')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-subcategory-create-deck')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-subcategory-create-design-system')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-subcategory-create-hyperframes')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-subcategory-create-image')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-subcategory-create-video')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-subcategory-create-audio')).toBeTruthy();
    // Surface / Type / Scenario rows and the More disclosure are gone.
    expect(screen.queryByTestId('plugins-home-row-surface')).toBeNull();
    expect(screen.queryByTestId('plugins-home-row-type')).toBeNull();
    expect(screen.queryByTestId('plugins-home-row-scenario')).toBeNull();
    expect(screen.queryByTestId('plugins-home-more')).toBeNull();
  });

  it('keeps planned subcategory buckets visible even when they have zero plugins', () => {
    render(
      <PluginsHomeSection
        plugins={sample}
        loading={false}
        activePluginId={null}
        pendingApplyId={null}
        onUse={() => {}}
        onOpenDetails={() => {}}
      />,
    );
    expect(screen.getByTestId('plugins-home-pill-subcategory-create-audio')).toBeTruthy();
  });

  it('filters by a category pill when clicked', () => {
    render(
      <PluginsHomeSection
        plugins={sample}
        loading={false}
        activePluginId={null}
        pendingApplyId={null}
        onUse={() => {}}
        onOpenDetails={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('plugins-home-pill-category-all'));
    fireEvent.click(screen.getByTestId('plugins-home-pill-category-create'));
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((i) => i.getAttribute('data-plugin-id')).sort()).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
    ]);
  });

  it('workflow pills filter source and export plugins', () => {
    render(
      <PluginsHomeSection
        plugins={sample}
        loading={false}
        activePluginId={null}
        pendingApplyId={null}
        onUse={() => {}}
        onOpenDetails={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('plugins-home-pill-category-export'));
    let items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((i) => i.getAttribute('data-plugin-id')).sort()).toEqual([
      'h',
      'k',
      'l',
      'm',
      'n',
      'o',
    ]);
    expect(screen.getByTestId('plugins-home-row-subcategory-export')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-subcategory-export-pptx')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-subcategory-export-pdf')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-subcategory-export-nextjs')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-subcategory-export-reactjs')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-subcategory-export-vuejs')).toBeTruthy();
    expect(screen.getByTestId('plugins-home-pill-subcategory-export-sveltejs')).toBeTruthy();

    fireEvent.click(screen.getByTestId('plugins-home-pill-subcategory-export-pptx'));
    items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((i) => i.getAttribute('data-plugin-id'))).toEqual(['n']);

    fireEvent.click(screen.getByTestId('plugins-home-pill-category-import'));
    items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((i) => i.getAttribute('data-plugin-id'))).toEqual(['g']);
  });

  it('shows a contribution card for sparse workflow lanes and starts plugin creation', () => {
    const onCreatePlugin = vi.fn();
    render(
      <PluginsHomeSection
        plugins={sample}
        loading={false}
        activePluginId={null}
        pendingApplyId={null}
        onUse={() => {}}
        onOpenDetails={() => {}}
        onCreatePlugin={onCreatePlugin}
      />,
    );
    fireEvent.click(screen.getByTestId('plugins-home-pill-category-import'));
    expect(screen.getByTestId('plugins-home-contribution-card')).toBeTruthy();
    fireEvent.click(screen.getByTestId('plugins-home-contribution-create'));
    expect(onCreatePlugin).toHaveBeenCalledWith(
      expect.stringContaining('imports a source into a project'),
    );
  });

  it('shows contribution placeholders for planned empty lanes', () => {
    const onCreatePlugin = vi.fn();
    render(
      <PluginsHomeSection
        plugins={sample}
        loading={false}
        activePluginId={null}
        pendingApplyId={null}
        onUse={() => {}}
        onOpenDetails={() => {}}
        onCreatePlugin={onCreatePlugin}
      />,
    );
    fireEvent.click(screen.getByTestId('plugins-home-pill-category-deploy'));
    expect(screen.getByTestId('plugins-home-contribution-card').textContent).toContain(
      'Contribute a Deploy plugin',
    );
    expect(screen.getByTestId('plugins-home-pill-subcategory-deploy-vercel')).toBeTruthy();

    fireEvent.click(screen.getByTestId('plugins-home-pill-subcategory-deploy-vercel'));
    expect(screen.getByTestId('plugins-home-contribution-card').textContent).toContain(
      'Contribute a Vercel plugin',
    );
    fireEvent.click(screen.getByTestId('plugins-home-contribution-create'));
    expect(onCreatePlugin).toHaveBeenCalledWith(
      expect.stringContaining('deploys an accepted web artifact to Vercel'),
    );
  });

  it('subcategory pills filter within the active workflow lane', () => {
    render(
      <PluginsHomeSection
        plugins={sample}
        loading={false}
        activePluginId={null}
        pendingApplyId={null}
        onUse={() => {}}
        onOpenDetails={() => {}}
      />,
    );
    let items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((i) => i.getAttribute('data-plugin-id'))).toEqual(['f']);
    expect(screen.getByTestId('plugins-home-pill-subcategory-create-deck').getAttribute('aria-selected'))
      .toBe('true');

    fireEvent.click(screen.getByTestId('plugins-home-pill-subcategory-create-all'));
    fireEvent.click(screen.getByTestId('plugins-home-pill-subcategory-create-hyperframes'));
    items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((i) => i.getAttribute('data-plugin-id'))).toEqual(['e']);
  });

  it('Extend separates plugin authoring from normal creation', () => {
    render(
      <PluginsHomeSection
        plugins={sample}
        loading={false}
        activePluginId={null}
        pendingApplyId={null}
        onUse={() => {}}
        onOpenDetails={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('plugins-home-pill-category-extend'));
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((i) => i.getAttribute('data-plugin-id'))).toEqual(['j']);
  });

  it('All pill clears the category filter', () => {
    render(
      <PluginsHomeSection
        plugins={sample}
        loading={false}
        activePluginId={null}
        pendingApplyId={null}
        onUse={() => {}}
        onOpenDetails={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('plugins-home-pill-category-create'));
    fireEvent.click(screen.getByTestId('plugins-home-pill-category-all'));
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((i) => i.getAttribute('data-plugin-id')).sort()).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
      'i',
      'j',
      'k',
      'l',
      'm',
      'n',
      'o',
    ]);
  });

  it('Featured chip overrides the category selection and shows only featured plugins', () => {
    const plugins = [
      makePlugin({ id: 'star', mode: 'design-system', featured: true }),
      ...sample,
    ];
    render(
      <PluginsHomeSection
        plugins={plugins}
        loading={false}
        activePluginId={null}
        pendingApplyId={null}
        onUse={() => {}}
        onOpenDetails={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('plugins-home-pill-category-create'));
    fireEvent.click(screen.getByTestId('plugins-home-chip-featured'));
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((i) => i.getAttribute('data-plugin-id'))).toEqual(['star']);
  });
});

// @vitest-environment jsdom

// Red spec for the example-chip ↔ Community filter decoupling.
//
// The hero chip rail (Prototype / Slide deck / ...) and the Community
// grid expose the same artifact taxonomy, but they are independent
// surfaces: picking a chip drives what the composer will generate,
// while the Community pills only filter the gallery the user is
// browsing. Binding them means any chip interaction (including the
// default active chip on first paint) silently rewrites the user's
// browsing filter — so the gallery must stay on its own selection.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { PluginsHomeSection } from '../../src/components/PluginsHomeSection';
import { I18nProvider } from '../../src/i18n';

function makeHomePlugin(
  id: string,
  mode: string,
  preview?: Record<string, unknown>,
): InstalledPluginRecord {
  return {
    id,
    title: id,
    version: '1.0.0',
    trust: 'bundled' as const,
    sourceKind: 'bundled' as const,
    source: `/tmp/${id}`,
    capabilitiesGranted: ['prompt:inject'],
    fsPath: `/tmp/${id}`,
    installedAt: 0,
    updatedAt: 0,
    manifest: {
      name: id,
      title: id,
      version: '1.0.0',
      description: `${id} fixture`,
      od: {
        kind: 'scenario',
        taskKind: 'new-generation',
        mode,
        ...(preview ? { preview } : {}),
      },
    },
  };
}

const PLUGINS = [
  makeHomePlugin('example-web-prototype', 'prototype'),
  makeHomePlugin('example-simple-deck', 'deck'),
];

const DUPLICABLE_PLUGINS = [
  makeHomePlugin('example-html-prototype', 'prototype', {
    type: 'html',
    entry: './example.html',
  }),
];

function ariaSelected(testId: string): string | null {
  return screen.getByTestId(testId).getAttribute('aria-selected');
}

describe('HomeView community filter decoupling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('keeps the Community category selection independent from the hero type chips', async () => {
    render(
      <I18nProvider initial="en">
        <PluginsHomeSection
          plugins={PLUGINS}
          loading={false}
          activePluginId={null}
          pendingApplyId={null}
          onUse={() => undefined}
          onOpenDetails={() => undefined}
          preferDefaultFacet={false}
        />
      </I18nProvider>,
    );

    // The gallery surface owns its facet state; it should boot unfiltered
    // even though Home's hero chip rail has its own default selection.
    await waitFor(() => {
      expect(screen.getByTestId('plugins-home-pill-category-deck')).toBeTruthy();
    });
    expect(ariaSelected('plugins-home-pill-category-all')).toBe('true');
    expect(ariaSelected('plugins-home-pill-category-prototype')).toBe('false');

    // The gallery's own pills still work locally.
    fireEvent.click(screen.getByTestId('plugins-home-pill-category-deck'));
    expect(ariaSelected('plugins-home-pill-category-deck')).toBe('true');
  });

  it('opens duplicated gallery examples at the copied entry file', async () => {
    const onOpenProject = vi.fn();
    const onDuplicate = vi.fn((record: InstalledPluginRecord) => {
      if (
        record.id === 'example-html-prototype'
      ) {
        onOpenProject('duplicated-project', 'index.html');
      }
    });

    render(
      <I18nProvider initial="en">
        <PluginsHomeSection
          plugins={DUPLICABLE_PLUGINS}
          loading={false}
          activePluginId={null}
          pendingApplyId={null}
          onUse={() => undefined}
          onDuplicate={onDuplicate}
          onOpenDetails={() => undefined}
          preferDefaultFacet={false}
          cardLayout="gallery"
        />
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByTestId('plugins-home-duplicate-example-html-prototype'));

    await waitFor(() => {
      expect(onOpenProject).toHaveBeenCalledWith('duplicated-project', 'index.html');
    });
  });
});

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
import { HomeView } from '../../src/components/HomeView';
import { I18nProvider } from '../../src/i18n';

function makeHomePlugin(
  id: string,
  mode: string,
  preview?: Record<string, unknown>,
) {
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
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: PLUGINS }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <I18nProvider initial="en">
        <HomeView
          projects={[]}
          onSubmit={() => undefined}
          onOpenProject={() => undefined}
          onViewAllProjects={() => undefined}
        />
      </I18nProvider>,
    );

    // Home boots with a default active type chip and the Community grid now
    // leads with Slides directly instead of a generic All bucket.
    await waitFor(() => {
      expect(screen.getByTestId('plugins-home-pill-category-deck')).toBeTruthy();
    });
    expect(screen.queryByTestId('plugins-home-pill-category-all')).toBeNull();
    expect(ariaSelected('plugins-home-pill-category-deck')).toBe('true');
    expect(ariaSelected('plugins-home-pill-category-prototype')).toBe('false');

    // Picking another chip drives the composer, not the gallery filter.
    fireEvent.click(await screen.findByTestId('home-hero-rail-deck'));
    await waitFor(() => {
      expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Slide deck');
    });
    expect(ariaSelected('plugins-home-pill-category-deck')).toBe('true');

    // And the gallery's own pills still work locally.
    fireEvent.click(screen.getByTestId('plugins-home-pill-category-prototype'));
    expect(ariaSelected('plugins-home-pill-category-prototype')).toBe('true');
  });

  it('opens duplicated gallery examples at the copied entry file', async () => {
    const onOpenProject = vi.fn();
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: DUPLICABLE_PLUGINS }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (
        typeof url === 'string' &&
        url === '/api/plugins/example-html-prototype/duplicate-project' &&
        init?.method === 'POST'
      ) {
        return new Response(
          JSON.stringify({
            ok: true,
            projectId: 'duplicated-project',
            conversationId: 'duplicated-conversation',
            relPath: 'index.html',
            project: { id: 'duplicated-project', name: 'Duplicated' },
            sourcePluginId: 'example-html-prototype',
            sourceEntry: 'example.html',
            copiedFiles: 1,
            skippedFiles: 0,
            warnings: [],
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <I18nProvider initial="en">
        <HomeView
          projects={[]}
          onSubmit={() => undefined}
          onOpenProject={onOpenProject}
          onViewAllProjects={() => undefined}
        />
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByTestId('plugins-home-duplicate-example-html-prototype'));

    await waitFor(() => {
      expect(onOpenProject).toHaveBeenCalledWith('duplicated-project', 'index.html');
    });
  });
});

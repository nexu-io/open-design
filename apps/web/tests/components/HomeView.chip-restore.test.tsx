// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: () => null,
}));

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>();
  return {
    ...actual,
    useWorkspaceContext: () => ({
      context: null,
      loading: false,
      failure: 'unsupported' as const,
    }),
  };
});

import { HomeView } from '../../src/components/HomeView';
import type { PromptTemplateSummary } from '../../src/types';

// Regression coverage for 飞书 recvqg21bqVuvE (P0): the selected creation-type
// chip and its bound example-prompt plugin were lost whenever the user
// visited Settings and came back. Settings is a standalone page — App.tsx
// swaps the whole `appMain` slot — so `EntryView` (and the `HomeView` inside
// it) really unmounts and remounts, unlike the visibility-toggled
// Home<->Community/... switches EntryShell otherwise uses (covered by
// HomeView.seed-while-mounted.test.tsx). The prompt text and design-system
// pick already survived that round trip via their own localStorage draft;
// the chip/plugin selection (`active` in HomeView) did not, because `active`
// holds a live `InstalledPluginRecord` + apply result that cannot round-trip
// through JSON. This test drives a REAL `unmount()` + fresh `render()` (not
// just a re-render) to reproduce the actual teardown Settings causes.
const DEFAULT_PLUGIN = {
  id: 'od-new-generation',
  title: 'New generation',
  version: '0.1.0',
  trust: 'bundled' as const,
  sourceKind: 'bundled' as const,
  source: '/tmp/new-generation',
  capabilitiesGranted: ['prompt:inject'],
  fsPath: '/tmp/new-generation',
  installedAt: 0,
  updatedAt: 0,
  manifest: {
    name: 'od-new-generation',
    title: 'New generation',
    version: '0.1.0',
    description: 'Create new design artifacts',
    od: {
      kind: 'scenario',
      taskKind: 'new-generation',
      useCase: { query: 'Create a plugin.' },
    },
  },
};

// The Prototype chip binds to the bundled `example-web-prototype` plugin
// (mirrors HomeView.prefill.test.tsx's fixture of the same name).
const WEB_PROTOTYPE_PLUGIN = {
  ...DEFAULT_PLUGIN,
  id: 'example-web-prototype',
  title: 'Web Prototype',
  source: '/tmp/web-prototype',
  fsPath: '/tmp/web-prototype',
  manifest: {
    ...DEFAULT_PLUGIN.manifest,
    name: 'example-web-prototype',
    title: 'Web Prototype',
    description: 'General-purpose desktop web prototype.',
    od: {
      kind: 'scenario',
      taskKind: 'new-generation',
      useCase: {
        query: 'Build a {{fidelity}} {{artifactKind}} for {{audience}} using {{designSystem}} from {{template}}.',
      },
      inputs: [
        { name: 'artifactKind', type: 'string', required: true, default: 'web prototype', label: 'Artifact kind' },
        {
          name: 'fidelity',
          type: 'select',
          required: true,
          options: ['wireframe', 'high-fidelity'],
          default: 'high-fidelity',
          label: 'Fidelity',
        },
        { name: 'audience', type: 'string', required: true, default: 'product evaluators', label: 'Audience' },
        {
          name: 'designSystem',
          type: 'string',
          default: 'the active project design system',
          label: 'Design system',
        },
        { name: 'template', type: 'string', default: 'the bundled web prototype seed', label: 'Template' },
      ],
    },
  },
};

const WEB_PROTOTYPE_APPLY_RESULT = {
  query: WEB_PROTOTYPE_PLUGIN.manifest.od.useCase.query,
  contextItems: [],
  inputs: WEB_PROTOTYPE_PLUGIN.manifest.od.inputs,
  assets: [],
  mcpServers: [],
  trust: 'trusted',
  capabilitiesGranted: ['prompt:inject'],
  capabilitiesRequired: ['prompt:inject'],
  appliedPlugin: {
    snapshotId: 'snap-web-prototype',
    pluginId: 'example-web-prototype',
    pluginVersion: '0.1.0',
    manifestSourceDigest: 'a'.repeat(64),
    inputs: {
      artifactKind: 'web prototype',
      fidelity: 'high-fidelity',
      audience: 'product evaluators',
      designSystem: 'the active project design system',
      template: 'the bundled web prototype seed',
    },
    resolvedContext: { items: [] },
    capabilitiesGranted: ['prompt:inject'],
    capabilitiesRequired: ['prompt:inject'],
    assetsStaged: [],
    taskKind: 'new-generation',
    appliedAt: 0,
    connectorsRequired: [],
    connectorsResolved: [],
    mcpServers: [],
    status: 'fresh',
  },
};

const MEDIA_PLUGIN = {
  ...DEFAULT_PLUGIN,
  id: 'od-media-generation',
  title: 'Media generation',
  source: '/tmp/media-generation',
  fsPath: '/tmp/media-generation',
  manifest: {
    ...DEFAULT_PLUGIN.manifest,
    name: 'od-media-generation',
    title: 'Media generation',
    description: 'Generate media artifacts.',
    od: {
      kind: 'scenario',
      taskKind: 'media-generation',
      useCase: { query: 'Generate media.' },
      inputs: [],
    },
  },
};

const PORTRAIT_TEMPLATE: PromptTemplateSummary = {
  id: 'image-product',
  surface: 'image',
  title: 'Image product concept',
  summary: 'A polished product image prompt.',
  category: 'product',
  model: 'gpt-image-2',
  aspect: '3:4',
  source: { repo: 'open-design/image-prompts', license: 'MIT' },
};

const LANDSCAPE_TEMPLATE: PromptTemplateSummary = {
  ...PORTRAIT_TEMPLATE,
  id: 'image-landscape',
  title: 'Image landscape concept',
  model: 'gpt-image-1',
  aspect: '16:9',
};

function stubAnimationFrame() {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = window.setTimeout(() => cb(window.performance.now()), 0);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    window.clearTimeout(id);
  });
}

// Mirrors HomeView.prefill.test.tsx's local helper: the inline template rail
// was replaced by the composer footer's radial Template picker (#5517).
async function pickHomeTemplate(id: string) {
  const trigger = await screen.findByTestId('home-hero-template-trigger');
  await waitFor(() => expect((trigger as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(trigger);
  const wedge = await screen.findByTestId(`home-hero-template-wedge-${id}`);
  await waitFor(() =>
    expect(screen.getByTestId(`home-hero-template-wedge-${id}`).getAttribute('aria-disabled')).not.toBe('true'),
  );
  fireEvent.click(wedge);
}

function fetchMockFor(plugins: unknown[]) {
  return vi.fn<typeof fetch>(async (url, init) => {
    if (typeof url === 'string' && url === '/api/plugins') {
      return new Response(JSON.stringify({ plugins }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (typeof url === 'string' && url.includes('/api/plugins/example-web-prototype/apply')) {
      return new Response(JSON.stringify(WEB_PROTOTYPE_APPLY_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (typeof url === 'string' && url.includes('/api/plugins/od-media-generation/apply')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        inputs?: Record<string, unknown>;
      };
      return new Response(JSON.stringify({
        query: 'Generate media.',
        contextItems: [],
        inputs: [],
        assets: [],
        mcpServers: [],
        trust: 'trusted',
        capabilitiesGranted: ['prompt:inject'],
        capabilitiesRequired: ['prompt:inject'],
        appliedPlugin: {
          snapshotId: 'snap-media',
          pluginId: 'od-media-generation',
          pluginVersion: '0.1.0',
          manifestSourceDigest: 'b'.repeat(64),
          inputs: body.inputs ?? {},
          resolvedContext: { items: [] },
          capabilitiesGranted: ['prompt:inject'],
          capabilitiesRequired: ['prompt:inject'],
          assetsStaged: [],
          taskKind: 'media-generation',
          appliedAt: 0,
          connectorsRequired: [],
          connectorsResolved: [],
          mcpServers: [],
          status: 'fresh',
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}

describe('HomeView chip/plugin selection survives a real unmount+remount', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('restores the selected creation-type chip and its bound plugin after Home fully unmounts and remounts', async () => {
    const fetchMock = fetchMockFor([WEB_PROTOTYPE_PLUGIN]);
    vi.stubGlobal('fetch', fetchMock);
    stubAnimationFrame();

    const { unmount } = render(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await screen.findByTestId('home-hero-input');
    await pickHomeTemplate('prototype');

    // The trigger resolves the localized `homeHero.chip.prototype` label.
    await waitFor(() => {
      expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Prototype');
    });

    // Real teardown — the same kind of unmount App.tsx performs when
    // `route.view === 'settings'` replaces the whole `appMain` slot (a
    // distinct scenario from EntryShell's visibility-toggled tab switches,
    // which never unmount HomeView at all).
    unmount();

    render(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await screen.findByTestId('home-hero-input');
    await waitFor(() => {
      expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Prototype');
    });
    // Restoring a persisted type is background hydration, not a submit. Keep
    // the type rail interactive and defer the plugin apply until the user
    // actually sends; otherwise a slow local apply washes out and disables
    // every type pill while Home is loading.
    expect(
      (screen.getByTestId('home-hero-type-pill-prototype') as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(
        ([url]) => typeof url === 'string' && url.includes('/api/plugins/example-web-prototype/apply'),
      ),
    ).toBe(false);
  });

  it('waits for template hydration before restoring a rejected image create', async () => {
    const fetchMock = fetchMockFor([MEDIA_PLUGIN]);
    vi.stubGlobal('fetch', fetchMock);
    stubAnimationFrame();
    window.localStorage.setItem(
      'open-design:home-composer:prompt',
      'Create a retryable portrait image.',
    );
    let unmountFirst = () => {};
    const rejectedSubmit = vi.fn<React.ComponentProps<typeof HomeView>['onSubmit']>(
      async () => {
        // App optimistically leaves Home while project creation is in flight,
        // then mounts a fresh Home after a typed rejection.
        unmountFirst();
        return false;
      },
    );
    const first = render(
      <HomeView
        projects={[]}
        onSubmit={rejectedSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
        promptTemplates={[PORTRAIT_TEMPLATE]}
      />,
    );
    unmountFirst = first.unmount;

    await screen.findByTestId('home-hero-input');
    await pickHomeTemplate('image');
    await waitFor(() => {
      expect(JSON.parse(
        window.localStorage.getItem('open-design:home-composer:chip') ?? '{}',
      )).toMatchObject({
        chipId: 'image',
        mediaSelection: {
          template: 'image-product',
          model: 'gpt-image-2',
          aspect: '3:4',
        },
      });
    });
    fireEvent.click(screen.getByTestId('home-hero-submit'));
    await waitFor(() => expect(rejectedSubmit).toHaveBeenCalledTimes(1));

    const acceptedSubmit = vi.fn<React.ComponentProps<typeof HomeView>['onSubmit']>(
      async () => true,
    );
    const retryPromptTemplates = vi.fn();
    const retry = render(
      <HomeView
        projects={[]}
        onSubmit={acceptedSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
        promptTemplates={[]}
        promptTemplatesLoaded={false}
        promptTemplatesLoadFailed
        onPromptTemplatesRetry={retryPromptTemplates}
      />,
    );

    await screen.findByTestId('home-hero-input');
    await waitFor(() => {
      expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(true);
      expect(JSON.parse(
        window.localStorage.getItem('open-design:home-composer:chip') ?? '{}',
      )).toMatchObject({
        chipId: 'image',
        mediaSelection: {
          template: 'image-product',
          model: 'gpt-image-2',
          aspect: '3:4',
        },
      });
    });
    fireEvent.click(screen.getByTestId('home-hero-error-action'));
    expect(retryPromptTemplates).toHaveBeenCalledTimes(1);

    retry.rerender(
      <HomeView
        projects={[]}
        onSubmit={acceptedSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
        promptTemplates={[]}
        promptTemplatesLoaded={false}
        promptTemplatesLoading
      />,
    );
    expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('home-hero-error-action')).toBeNull();

    retry.rerender(
      <HomeView
        projects={[]}
        onSubmit={acceptedSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
        promptTemplates={[LANDSCAPE_TEMPLATE, PORTRAIT_TEMPLATE]}
        promptTemplatesLoaded
        promptTemplatesLoading={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Image');
      expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByTestId('home-hero-submit'));
    await waitFor(() => expect(acceptedSubmit).toHaveBeenCalledTimes(1));

    const expectedProjectMetadata = {
      kind: 'image',
      imageModel: 'gpt-image-2',
      imageAspect: '3:4',
      promptTemplate: {
        id: 'image-product',
        surface: 'image',
        title: 'Image product concept',
        prompt: 'A polished product image prompt.',
        summary: 'A polished product image prompt.',
        category: 'product',
        model: 'gpt-image-2',
        aspect: '3:4',
        source: { repo: 'open-design/image-prompts', license: 'MIT' },
      },
    };
    for (const submit of [rejectedSubmit, acceptedSubmit]) {
      expect(submit.mock.calls[0]?.[0].projectMetadata).toEqual(expectedProjectMetadata);
    }
  });

  it.each(['mobile', 'wireframe'])('migrates the legacy top-level %s chip into a nested Prototype scene', async (legacyChipId) => {
    window.localStorage.setItem(
      'open-design:home-composer:chip',
      JSON.stringify({
        chipId: legacyChipId,
        pluginId: 'example-web-prototype',
        projectKind: 'prototype',
      }),
    );
    const fetchMock = fetchMockFor([WEB_PROTOTYPE_PLUGIN]);
    vi.stubGlobal('fetch', fetchMock);
    stubAnimationFrame();

    render(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await screen.findByTestId('home-hero-input');
    await waitFor(() => {
      expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Prototype');
      expect(screen.getByTestId(`home-hero-subtype-${legacyChipId}`).getAttribute('aria-selected'))
        .toBe('true');
      expect(JSON.parse(window.localStorage.getItem('open-design:home-composer:chip') ?? '{}'))
        .toMatchObject({ chipId: 'prototype', prototypeSubtypeId: legacyChipId });
    });
    expect(fetchMock.mock.calls.some(
      ([url]) => typeof url === 'string' && url.includes('/api/plugins/example-web-prototype/apply'),
    )).toBe(false);
  });

  it('silently drops a persisted chip pointing at a since-uninstalled plugin', async () => {
    // Seed localStorage as if a prior mount had bound the Prototype chip,
    // then remount with a catalog that no longer has that plugin installed.
    window.localStorage.setItem(
      'open-design:home-composer:chip',
      JSON.stringify({ chipId: 'prototype', pluginId: 'example-web-prototype', projectKind: 'prototype' }),
    );
    const fetchMock = fetchMockFor([]);
    vi.stubGlobal('fetch', fetchMock);
    stubAnimationFrame();

    render(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await screen.findByTestId('home-hero-input');

    // No crash, no error banner, and the stale pointer is cleared so it does
    // not keep retrying on every future mount.
    await waitFor(() => {
      expect(window.localStorage.getItem('open-design:home-composer:chip')).toBeNull();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

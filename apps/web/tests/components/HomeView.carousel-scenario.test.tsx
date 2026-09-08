// @vitest-environment jsdom
//
// One-click create from the placeholder carousel with a second-level Prototype
// scene selected.
//
// Picking a scene narrows the carousel to that scene's own curated lines, and
// Send on an empty composer creates from the showing line. The scene is a
// metadata refinement of Prototype rather than a template of its own, so this
// create must carry the scene's platform targets / lo-fi fidelity AND stay on
// the Prototype OD Next route — the same result as typing a prompt by hand.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const carouselMock = vi.hoisted(() => ({
  targetScenarioId: null as string | null,
  reportedScenarioId: null as string | null,
}));

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: ({
    scenarios,
    active,
    onScenarioChange,
  }: {
    scenarios: Array<{ id: string }>;
    active: boolean;
    onScenarioChange: (scenario: { id: string }) => void;
  }) => {
    const scenario = scenarios.find((item) => item.id === carouselMock.targetScenarioId);
    if (active && scenario && carouselMock.reportedScenarioId !== scenario.id) {
      carouselMock.reportedScenarioId = scenario.id;
      queueMicrotask(() => onScenarioChange(scenario));
    }
    return null;
  },
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
import { requestHomeChip } from '../../src/runtime/home-intent';

const WEB_PROTOTYPE_PLUGIN = {
  id: 'example-web-prototype',
  title: 'Web Prototype',
  version: '0.1.0',
  trust: 'bundled' as const,
  sourceKind: 'bundled' as const,
  source: '/tmp/web-prototype',
  capabilitiesGranted: ['prompt:inject'],
  fsPath: '/tmp/web-prototype',
  installedAt: 0,
  updatedAt: 0,
  manifest: {
    name: 'example-web-prototype',
    title: 'Web Prototype',
    version: '0.1.0',
    description: 'General-purpose desktop web prototype.',
    od: {
      kind: 'scenario',
      taskKind: 'new-generation',
      useCase: { query: 'Build a web prototype.' },
    },
  },
};

const APPLY_RESULT = {
  query: 'Build a web prototype.',
  contextItems: [],
  inputs: [],
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
    inputs: {},
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

function stubAnimationFrame() {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(window.performance.now()), 0),
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
}

function fetchMock() {
  return vi.fn<typeof fetch>(async (url) => {
    if (typeof url === 'string' && url === '/api/plugins') {
      return new Response(JSON.stringify({ plugins: [WEB_PROTOTYPE_PLUGIN] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (typeof url === 'string' && url.includes('/apply')) {
      return new Response(JSON.stringify(APPLY_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}

describe('HomeView one-click create from a scene-specific carousel line', () => {
  afterEach(() => {
    carouselMock.targetScenarioId = null;
    carouselMock.reportedScenarioId = null;
    vi.unstubAllGlobals();
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it.each([
    {
      scenarioId: 'app-idea',
      scene: 'mobile',
      metadata: {
        kind: 'prototype',
        platform: 'auto',
        platformTargets: ['mobile-ios', 'mobile-android'],
      },
    },
    {
      scenarioId: 'product-detail',
      scene: 'wireframe',
      metadata: { kind: 'prototype', fidelity: 'wireframe' },
    },
  ])('creates on the Prototype route with the $scene refinement intact', async ({
    scenarioId,
    scene,
    metadata,
  }) => {
    carouselMock.targetScenarioId = scenarioId;
    vi.stubGlobal('fetch', fetchMock());
    stubAnimationFrame();
    const onSubmit = vi.fn();

    render(
      <HomeView
        projects={[]}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await screen.findByTestId('home-hero-input');
    // Home starts typeless and the hero no longer renders a scene row, so the
    // scene arrives the way other surfaces hand one off: a queued chip intent
    // naming the retired top-level id, which HomeView folds onto 原型 + scene.
    await act(async () => {
      requestHomeChip(scene);
    });
    await waitFor(() => {
      expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Prototype');
    });

    // The scene's own line is now what the carousel offers, so Send lights up
    // on a composer the user never typed into.
    const submit = await screen.findByTestId('home-hero-submit');
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    expect(carouselMock.reportedScenarioId).toBe(scenarioId);
    fireEvent.click(submit);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const [submitted] = onSubmit.mock.calls[0] as [Record<string, unknown>];
    expect(submitted).toMatchObject({
      pluginId: null,
      automaticStrategyTaskProfile: 'prototype',
      projectKind: 'prototype',
    });
    expect(submitted.projectMetadata).toEqual(metadata);
  });
});

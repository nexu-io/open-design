// @vitest-environment jsdom
//
// One-click create from the placeholder carousel with a second-level Prototype
// scene selected.
//
// Two contracts, one per scene flavor: mobile-apps curates a line of its own
// ('app-idea'), so selecting it narrows the carousel to that line and Send
// carries the scene's mobile refinement into the create. web-landing curates
// none, so it keeps the parent's lines showing and a create made from a
// parent line binds bare Prototype (the line's own scope) — the same result
// as typing that brief by hand with only the task type picked.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    cleanup();
    // jsdom teardown in this file can drop the storage globals before the
    // last afterEach runs; clearing is best-effort hygiene, not an assertion.
    window.localStorage?.clear();
    window.sessionStorage?.clear();
    vi.unstubAllGlobals();
  });

  it.each([
    {
      scenarioId: 'app-idea',
      scene: 'mobile-apps',
      expectedMetadata: {
        kind: 'prototype',
        platform: 'auto',
        platformTargets: ['mobile-ios', 'mobile-android'],
      },
    },
    {
      scenarioId: 'signup-flow',
      scene: 'web-landing',
      expectedMetadata: { kind: 'prototype' },
    },
  ])('creates from the showing line on the Prototype route with the $scene scene selected', async ({
    scenarioId,
    scene,
    expectedMetadata,
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
    // The composer seeds 原型 by default; pick the scene under it.
    fireEvent.click(await screen.findByTestId(`home-hero-subtype-${scene}`));
    await waitFor(() => {
      expect(screen.getByTestId(`home-hero-subtype-${scene}`).getAttribute('aria-selected'))
        .toBe('true');
    });

    // mobile-apps narrows to its own curated line; web-landing curates none
    // and keeps the parent's. Either way Send lights up on a composer the
    // user never typed into.
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
    // A line binds its own scope: a scene-scoped line carries the scene's
    // refinement; a parent line stays bare even with a scene selected.
    expect(submitted.projectMetadata).toEqual(expectedMetadata);
  });
});

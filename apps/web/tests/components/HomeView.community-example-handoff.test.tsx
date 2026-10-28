// @vitest-environment jsdom
//
// Community 「做同款」 on a motion design template must produce the same run as
// picking that template from Home's motion design example list: the example
// route (OD Next motion-design task, example identity instead of a plugin pin).
// Other Community picks keep pinning the plugin. The Community surface records
// its own use click, so the hand-off must not count again as a Home click.

import { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: () => null,
}));

const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return { ...actual, useAnalytics: () => ({ ...actual.useAnalytics?.(), track: analytics.track }) };
});

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>();
  return {
    ...actual,
    useWorkspaceContext: () => ({ context: null, loading: false, failure: 'unsupported' as const }),
  };
});

import { HomeView } from '../../src/components/HomeView';
import { createPluginUseHandoff } from '../../src/components/home-hero/plugin-authoring';
import type { PluginLoopSubmit } from '../../src/components/PluginLoopHome';
import { homeHeroPromptText } from '../helpers/home-hero-lexical';

function pluginRecord(id: string, title: string, tags: string[], od: Record<string, unknown>) {
  return {
    id,
    title,
    version: '0.1.0',
    trust: 'bundled' as const,
    sourceKind: 'bundled' as const,
    source: `/tmp/${id}`,
    capabilitiesGranted: ['prompt:inject'],
    fsPath: `/tmp/${id}`,
    installedAt: 0,
    updatedAt: 0,
    marketplaceTrust: 'official' as const,
    manifest: {
      name: id,
      title,
      version: '0.1.0',
      description: `${title} description.`,
      tags,
      od: {
        kind: 'scenario',
        taskKind: 'new-generation',
        useCase: { query: `Seeded brief for ${title}.` },
        ...od,
      },
    },
  };
}

const CATALOG = [
  pluginRecord('example-web-prototype', 'Web Prototype', ['prototype'], { mode: 'prototype' }),
  pluginRecord('od-new-generation', 'New generation', [], {}),
  pluginRecord('od-media-generation', 'Media generation', [], {}),
  pluginRecord('example-motion-showreel', 'Motion Designer Showreel', ['motion-design', 'showreel'], { mode: 'video' }),
  pluginRecord('example-social-carousel', 'Social Carousel', ['prototype', 'marketing', 'social-carousel'], {
    mode: 'prototype',
    scenario: 'marketing',
  }),
];

const APPLY_RESULT = {
  query: 'applied',
  contextItems: [],
  inputs: [],
  assets: [],
  mcpServers: [],
  trust: 'trusted',
  capabilitiesGranted: [],
  capabilitiesRequired: [],
  appliedPlugin: {
    snapshotId: 'snap',
    pluginId: 'example-motion-showreel',
    pluginVersion: '0.1.0',
    manifestSourceDigest: 'a'.repeat(64),
    inputs: {},
    resolvedContext: { items: [] },
    capabilitiesGranted: [],
    capabilitiesRequired: [],
    assetsStaged: [],
    taskKind: 'new-generation',
    appliedAt: 0,
    connectorsRequired: [],
    connectorsResolved: [],
    mcpServers: [],
    status: 'fresh',
  },
  projectMetadata: {},
};

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (url) => {
    if (url === '/api/plugins') {
      return new Response(JSON.stringify({ plugins: CATALOG }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (typeof url === 'string' && url.includes('/apply')) {
      return new Response(JSON.stringify(APPLY_RESULT), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(window.performance.now()), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
}

async function handOffAndSubmit(options: Parameters<typeof createPluginUseHandoff>[2], pluginId: string) {
  const onSubmit = vi.fn<(payload: PluginLoopSubmit) => void>();
  render(
    <HomeView
      projects={[]}
      onSubmit={onSubmit}
      onOpenProject={() => undefined}
      promptHandoff={createPluginUseHandoff(1, pluginId, options)}
    />,
  );
  await waitFor(() => expect(screen.queryByTestId('home-hero-active-plugin')).toBeTruthy());
  await waitFor(() => expect(homeHeroPromptText().trim().length).toBeGreaterThan(0));
  fireEvent.click(screen.getByTestId('home-hero-submit'));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  return onSubmit.mock.calls[0]![0] as unknown as Record<string, unknown>;
}

function homeUseClicks() {
  return analytics.track.mock.calls.filter(
    ([event, props]) => event === 'ui_click' && (props as { area?: string }).area === 'community_gallery',
  );
}

describe('HomeView — Community template hand-off', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    analytics.track.mockClear();
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('routes a motion design template exactly like its Home example card', async () => {
    stubFetch();
    const payload = await handOffAndSubmit(
      { action: 'use-with-query', chipId: 'motion-design', projectKind: 'video', asExample: true, useTracked: true },
      'example-motion-showreel',
    );
    expect(payload).toMatchObject({
      pluginId: null,
      automaticStrategyTaskProfile: 'motion-design',
      appliedPluginSnapshotId: null,
      exampleReference: { pluginId: 'example-motion-showreel', source: '/tmp/example-motion-showreel' },
      projectKind: 'video',
    });
    // The daemon re-derives the route from this metadata; without the type's
    // own intent the run silently falls back to a plain video task.
    expect(payload.projectMetadata).toMatchObject({ kind: 'video', intent: 'motion-design' });
    // Community already recorded this click.
    expect(homeUseClicks()).toHaveLength(0);
  });

  it('keeps pinning the plugin for Community templates of other types', async () => {
    stubFetch();
    const payload = await handOffAndSubmit(
      { action: 'use-with-query', chipId: 'prototype', projectKind: 'prototype', asExample: false, useTracked: true },
      'example-social-carousel',
    );
    expect(payload).not.toHaveProperty('exampleReference');
    expect(payload.automaticStrategyTaskProfile ?? null).toBeNull();
    expect(homeUseClicks()).toHaveLength(0);
  });

  it('still records hand-offs from surfaces that do not track their own use click', async () => {
    stubFetch();
    await handOffAndSubmit({ action: 'use-with-query', chipId: 'prototype', projectKind: 'prototype' }, 'example-social-carousel');
    expect(homeUseClicks()).toHaveLength(1);
  });
});

// @vitest-environment jsdom

import { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import { HOME_APPLY_TEMPLATE_EVENT } from '../../src/components/home-hero/chips';
import { requestHomeChip } from '../../src/runtime/home-intent';
import type { PluginLoopSubmit } from '../../src/components/PluginLoopHome';
import { homeHeroPromptText } from '../helpers/home-hero-lexical';

function submitSpy() {
  return vi.fn<(payload: PluginLoopSubmit) => void>();
}
type SubmitSpy = ReturnType<typeof submitSpy>;

// Ids, tags and `od.mode`/`od.category` mirror the shipped manifests under
// `plugins/_official/`, so the Community facet taxonomy buckets these fixtures
// into the same scenes it buckets the real bundled catalog into.
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

// The scenario each first-level task type binds (`home-hero/chips.ts`).
const CHIP_DEFAULTS = [
  pluginRecord('example-web-prototype', 'Web Prototype', ['prototype'], { mode: 'prototype' }),
  pluginRecord('example-simple-deck', 'Simple Deck', ['deck'], { mode: 'deck' }),
  pluginRecord('example-hyperframes', 'HyperFrames', ['hyperframes'], { mode: 'video' }),
  pluginRecord('example-live-artifact', 'Live Artifact', ['live-artifact'], { mode: 'prototype' }),
  pluginRecord('od-new-generation', 'New generation', [], {}),
  pluginRecord('od-media-generation', 'Media generation', [], {}),
];

// One official example card per task type under test. `example-social-carousel`
// is the reported card: `od.mode: 'prototype'` + the `social-carousel` tag put
// it in 原型's 落地页 / 营销 scene.
const EXAMPLE_CARDS = [
  pluginRecord('example-social-carousel', 'Social Carousel', ['prototype', 'marketing', 'social-carousel'], {
    mode: 'prototype',
    scenario: 'marketing',
  }),
  pluginRecord('example-mobile-app', 'Mobile App', ['prototype', 'mobile', 'app-ui'], { mode: 'prototype' }),
  pluginRecord('example-pitch-deck', 'Pitch Deck', ['deck'], { mode: 'deck', category: 'fundraising-pitch' }),
  pluginRecord('example-frame-glitch-title', 'Glitch Title', ['hyperframes'], { mode: 'video' }),
  pluginRecord('example-eng-runbook', 'Eng Runbook', ['document', 'runbook'], { mode: 'document' }),
  pluginRecord('example-live-dashboard', 'Live Dashboard', ['live-artifact'], { mode: 'prototype' }),
  pluginRecord('example-image-template', 'Image Template', ['image', 'image-template'], { mode: 'image' }),
];

const CATALOG = [...CHIP_DEFAULTS, ...EXAMPLE_CARDS];

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
    pluginId: 'example-web-prototype',
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
  const fetchMock = vi.fn<typeof fetch>(async (url) => {
    if (typeof url === 'string' && url === '/api/plugins') {
      return new Response(JSON.stringify({ plugins: CATALOG }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (typeof url === 'string' && url.includes('/apply-local')) {
      return new Response(JSON.stringify(APPLY_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function stubAnimationFrame() {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(window.performance.now()), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
}

async function pickHomeTemplate(id: string) {
  // A type already picked retires the row, and the pill has no menu — so
  // switching means clearing back to the empty state first.
  const clear = screen.queryByTestId('home-hero-template-clear');
  if (clear) fireEvent.click(clear);
  const lead = await screen.findByTestId('home-hero-type-pill-prototype');
  await waitFor(() => expect((lead as HTMLButtonElement).disabled).toBe(false));
  let pill = screen.queryByTestId(`home-hero-type-pill-${id}`);
  if (!pill) {
    // Types behind 更多 mount only while its popover is open.
    fireEvent.click(screen.getByTestId('home-hero-type-pills-more'));
    pill = screen.queryByTestId(`home-hero-type-pill-${id}-more`);
  }
  if (pill) {
    fireEvent.click(pill);
    return;
  }
  // Types outside the fixed row (media, HyperFrames, …) are reached the way
  // the workspace tabs-bar hands one off: the apply-template window event,
  // which HomeHero applies exactly as a row click.
  fireEvent.keyDown(document, { key: 'Escape' });
  await act(async () => {
    window.dispatchEvent(
      new CustomEvent(HOME_APPLY_TEMPLATE_EVENT, { detail: { chipId: id } }),
    );
  });
}


// The hero no longer renders a second-level scene row; a Prototype scene is
// reached the way other surfaces hand one off — a queued chip intent naming the
// retired top-level id, which HomeView folds onto 原型 + that scene.
async function pickPrototypeScene(scene: string) {
  await act(async () => {
    requestHomeChip(scene);
  });
  await waitFor(() => {
    expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Prototype');
    expect(JSON.parse(window.localStorage.getItem('open-design:home-composer:chip') ?? '{}'))
      .toMatchObject({ chipId: 'prototype', prototypeSubtypeId: scene });
  });
}

async function pickExampleCard(pluginId: string) {
  let card: HTMLElement | undefined;
  await waitFor(() => {
    card = screen.queryAllByTestId('home-hero-plugin-preset')
      .find((item) => item.getAttribute('data-plugin-id') === pluginId);
    expect(card).toBeTruthy();
  });
  fireEvent.click(card!);
  await waitFor(() => expect(homeHeroPromptText().trim().length).toBeGreaterThan(0));
}

function renderHome(onSubmit: SubmitSpy) {
  return render(
    <HomeView
      projects={[]}
      onSubmit={onSubmit}
      onOpenProject={() => undefined}
      onViewAllProjects={() => undefined}
    />,
  );
}

async function submitAndRead(onSubmit: SubmitSpy) {
  fireEvent.click(screen.getByTestId('home-hero-submit'));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  return onSubmit.mock.calls[0]![0] as unknown as Record<string, unknown>;
}

interface DismissCase {
  name: string;
  chipId: string;
  scene?: string;
  cardId: string;
  /** What the BARE task type routes to — dismissing must land back here. */
  automaticStrategyTaskProfile: string | null;
  projectKind: string;
  projectMetadata: Record<string, unknown>;
  /** Pinned plugin for the task types that own no automatic route. */
  pluginId: string | null;
}

const DISMISS_CASES: DismissCase[] = [
  {
    name: '原型, no scene',
    chipId: 'prototype',
    cardId: 'example-social-carousel',
    automaticStrategyTaskProfile: 'prototype',
    projectKind: 'prototype',
    projectMetadata: { kind: 'prototype' },
    pluginId: null,
  },
  {
    // The reported combination.
    name: '原型 + 落地页 / 营销',
    chipId: 'prototype',
    scene: 'landing-marketing',
    cardId: 'example-social-carousel',
    automaticStrategyTaskProfile: 'prototype',
    projectKind: 'prototype',
    projectMetadata: { kind: 'prototype' },
    pluginId: null,
  },
  {
    // A scene that stamps its own refinement must keep it through the dismiss.
    name: '原型 + 移动应用',
    chipId: 'prototype',
    scene: 'mobile',
    cardId: 'example-mobile-app',
    automaticStrategyTaskProfile: 'prototype',
    projectKind: 'prototype',
    projectMetadata: {
      kind: 'prototype',
      platform: 'auto',
      platformTargets: ['mobile-ios', 'mobile-android'],
    },
    pluginId: null,
  },
  {
    name: '原型 + 线框图',
    chipId: 'prototype',
    scene: 'wireframe',
    cardId: 'example-social-carousel',
    automaticStrategyTaskProfile: 'prototype',
    projectKind: 'prototype',
    projectMetadata: { kind: 'prototype', fidelity: 'wireframe' },
    pluginId: null,
  },
  {
    name: '幻灯片, no scene',
    chipId: 'deck',
    cardId: 'example-pitch-deck',
    automaticStrategyTaskProfile: 'ppt',
    projectKind: 'deck',
    projectMetadata: { kind: 'deck' },
    pluginId: null,
  },
  {
    // 幻灯片's second-level rail is a pure card filter — it never reaches
    // `onPickPrototypeSubtype`, so the dismiss has only the chip to return to.
    name: '幻灯片 + 融资路演',
    chipId: 'deck',
    scene: 'fundraising-pitch',
    cardId: 'example-pitch-deck',
    automaticStrategyTaskProfile: 'ppt',
    projectKind: 'deck',
    projectMetadata: { kind: 'deck' },
    pluginId: null,
  },
  {
    name: 'HyperFrames (no second-level rail)',
    chipId: 'hyperframes',
    cardId: 'example-frame-glitch-title',
    automaticStrategyTaskProfile: 'hyperframes',
    projectKind: 'video',
    projectMetadata: { kind: 'video', intent: 'hyperframes', videoModel: 'hyperframes-html' },
    pluginId: null,
  },
  {
    // Task types with no automatic route still have a task type to return to:
    // the dismiss must land on their own scenario, not on a blank composer.
    name: '文档 (no OD Next route)',
    chipId: 'document',
    cardId: 'example-eng-runbook',
    automaticStrategyTaskProfile: null,
    projectKind: 'other',
    projectMetadata: { kind: 'other', intent: 'document' },
    pluginId: 'od-new-generation',
  },
  {
    name: '图片 (media surface, no OD Next route)',
    chipId: 'image',
    cardId: 'example-image-template',
    automaticStrategyTaskProfile: null,
    projectKind: 'image',
    projectMetadata: { kind: 'image' },
    pluginId: 'od-media-generation',
  },
  {
    name: 'Live artifact (no OD Next route)',
    chipId: 'live-artifact',
    cardId: 'example-live-dashboard',
    automaticStrategyTaskProfile: null,
    projectKind: 'prototype',
    projectMetadata: { kind: 'prototype', intent: 'live-artifact', fidelity: 'high-fidelity' },
    pluginId: 'example-live-artifact',
  },
];

describe('HomeView — dismissing a picked example card', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  // `remount` is the load-bearing half: `EntryShell` really unmounts HomeView on
  // an EntryView ↔ ProjectView swap, so a pick the user made before opening a
  // project / Settings comes back through the persisted composer draft. The
  // composer looks identical either way, so the dismiss must behave identically.
  it.each(
    DISMISS_CASES.flatMap((testCase) => [
      { ...testCase, remount: false },
      { ...testCase, remount: true, name: `${testCase.name} — after a Home remount` },
    ]),
  )('$name: dismissing the example returns the composer to its task type', async (testCase) => {
    stubFetch();
    stubAnimationFrame();
    const onSubmit = submitSpy();

    const mounted = renderHome(onSubmit);
    await pickHomeTemplate(testCase.chipId);
    // Only the Prototype scenes carry state; the other slugs were example
    // filters on the retired sub-type row, and the rail now lists the type's
    // curated set directly.
    if (testCase.scene === 'mobile' || testCase.scene === 'wireframe') {
      await pickPrototypeScene(testCase.scene);
    }
    await pickExampleCard(testCase.cardId);
    const seededPrompt = homeHeroPromptText();

    if (testCase.remount) {
      mounted.unmount();
      renderHome(onSubmit);
      await waitFor(() => expect(homeHeroPromptText()).toBe(seededPrompt));
    }

    const pill = await screen.findByTestId('home-hero-active-plugin');
    fireEvent.click(within(pill).getByLabelText('Clear active plugin'));
    await act(async () => {
      await Promise.resolve();
    });

    // The pick is gone; the brief the user is about to send is not.
    expect(screen.queryByTestId('home-hero-active-plugin')).toBeNull();
    expect(homeHeroPromptText()).toBe(seededPrompt);
    expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false);

    const payload = await submitAndRead(onSubmit);
    expect(payload).toMatchObject({
      prompt: seededPrompt.trim(),
      pluginId: testCase.pluginId,
      projectKind: testCase.projectKind,
    });
    expect(payload.automaticStrategyTaskProfile ?? null)
      .toBe(testCase.automaticStrategyTaskProfile);
    expect(payload.projectMetadata).toEqual(testCase.projectMetadata);
    // The dismissed example must not smuggle its identity into the run.
    expect(payload).not.toHaveProperty('exampleReference');
  });

  it('keeps an UNdismissed example card pinned to its route across a Home remount', async () => {
    // Same root cause seen from the other side: the persisted composer draft is
    // the pick's only survivor, so it has to carry how the pick was made. A
    // restored example card is still an example card.
    stubFetch();
    stubAnimationFrame();
    const onSubmit = submitSpy();

    const mounted = renderHome(onSubmit);
    await pickHomeTemplate('prototype');
    await pickExampleCard('example-social-carousel');
    const seededPrompt = homeHeroPromptText();

    mounted.unmount();
    renderHome(onSubmit);
    await waitFor(() => expect(homeHeroPromptText()).toBe(seededPrompt));
    expect((await screen.findByTestId('home-hero-active-plugin')).textContent)
      // The lead chip cuts the title to eight code points, then an ellipsis.
      .toContain('Social C…');

    const payload = await submitAndRead(onSubmit);
    expect(payload).toMatchObject({
      pluginId: null,
      automaticStrategyTaskProfile: 'prototype',
      appliedPluginSnapshotId: null,
      exampleReference: {
        pluginId: 'example-social-carousel',
        source: '/tmp/example-social-carousel',
      },
      projectKind: 'prototype',
    });
  });
});

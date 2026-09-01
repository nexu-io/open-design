// @vitest-environment jsdom

import { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SkillSummary } from '@open-design/contracts';

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
import type { PluginLoopSubmit } from '../../src/components/PluginLoopHome';
import { homeHeroPromptText, setHomeHeroPrompt } from '../helpers/home-hero-lexical';

function submitSpy() {
  return vi.fn<(payload: PluginLoopSubmit) => void>();
}
type SubmitSpy = ReturnType<typeof submitSpy>;

// Mirrors the shipped `plugins/_official/` manifests closely enough for the
// task-type wedges to resolve their bound scenario plugin (an unresolvable
// wedge renders `aria-disabled`).
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
  pluginRecord('example-simple-deck', 'Simple Deck', ['deck'], { mode: 'deck' }),
  pluginRecord('od-new-generation', 'New generation', [], {}),
  pluginRecord('od-media-generation', 'Media generation', [], {}),
];

const BASE_SKILL: SkillSummary = {
  id: 'prototype-lab',
  name: 'Prototype Lab',
  description: 'Create a focused prototype.',
  triggers: ['prototype', 'flow'],
  mode: 'prototype',
  previewType: 'html',
  designSystemRequired: false,
  defaultFor: [],
  upstream: null,
  hasBody: true,
  examplePrompt: 'Design a focused onboarding prototype.',
  aggregatesExamples: false,
};

// `od.mode: 'prototype'` — deliberately DIFFERENT from the 幻灯片 chip below.
const PROTOTYPE_SKILL: SkillSummary = BASE_SKILL;

// `od.mode: 'deck'` — deliberately DIFFERENT from the 原型 chip below.
const DECK_SKILL: SkillSummary = {
  ...BASE_SKILL,
  id: 'deck-lab',
  name: 'Deck Lab',
  description: 'Create a focused slide deck.',
  triggers: ['deck', 'slides'],
  mode: 'deck',
  examplePrompt: 'Design a focused investor deck.',
};

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
    if (typeof url === 'string' && url === '/api/mcp/servers') {
      return new Response(JSON.stringify({ servers: [], templates: [] }), {
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

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function pickHomeTemplate(id: string) {
  const trigger = await screen.findByTestId('home-hero-template-trigger');
  await waitFor(() => expect((trigger as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(trigger);
  const wedge = await screen.findByTestId(`home-hero-template-wedge-${id}`);
  await waitFor(() =>
    expect(screen.getByTestId(`home-hero-template-wedge-${id}`).getAttribute('aria-disabled'))
      .not.toBe('true'));
  fireEvent.click(wedge);
}

// The @-mention popover's own pick path: type an `@query` into the live Lexical
// editor, then mouseDown the listed option. This is exactly what
// `HomeHero.pickSkill` (HomeHero.tsx:991) is wired to, which forwards to
// `HomeView.useSkill` (HomeView.tsx:2361).
async function mentionSkill(query: string, label: RegExp) {
  screen.getByTestId('home-hero-input');
  setHomeHeroPrompt(query);
  await settle();
  fireEvent.mouseDown(await screen.findByRole('option', { name: label }));
  await waitFor(() => expect(screen.getByTestId('home-hero-active-skill')).toBeTruthy());
}

function renderHome(onSubmit: SubmitSpy) {
  return render(
    <HomeView
      projects={[]}
      skills={[PROTOTYPE_SKILL, DECK_SKILL]}
      onSubmit={onSubmit}
      onOpenProject={() => undefined}
      onViewAllProjects={() => undefined}
    />,
  );
}

async function submitAndRead(onSubmit: SubmitSpy) {
  await waitFor(() => expect(homeHeroPromptText().trim().length).toBeGreaterThan(0));
  fireEvent.click(screen.getByTestId('home-hero-submit'));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  return onSubmit.mock.calls[0]![0] as unknown as Record<string, unknown>;
}

describe('HomeView — @-mentioning a Skill on top of a picked task type', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('keeps the 幻灯片 task type when a prototype-mode Skill is mentioned', async () => {
    stubFetch();
    stubAnimationFrame();
    const onSubmit = submitSpy();
    renderHome(onSubmit);

    // 1. The user picks the task type they want to build.
    await pickHomeTemplate('deck');
    await waitFor(() =>
      expect(screen.getByTestId('home-hero-template-trigger').textContent)
        .toContain('Slide deck'));

    // 2. Then they @-mention a Skill to shape HOW it is built. The Skill's
    //    `od.mode` is `prototype`; it is not a second task-type pick.
    await mentionSkill('@proto', /prototype lab/i);

    const payload = await submitAndRead(onSubmit);

    // The chip the user picked still owns the route and the product kind…
    expect(payload.automaticStrategyTaskProfile ?? null).toBe('ppt');
    expect(payload.projectKind).toBe('deck');
    expect(payload.projectMetadata).toEqual({ kind: 'deck' });
    // …and the Skill still rides along.
    expect(payload.skillId).toBe(PROTOTYPE_SKILL.id);
  });

  it('keeps the 原型 + 移动应用 scene refinement when a deck-mode Skill is mentioned', async () => {
    stubFetch();
    stubAnimationFrame();
    const onSubmit = submitSpy();
    renderHome(onSubmit);

    // 1. Task type, then its second-level scene.
    await pickHomeTemplate('prototype');
    const scene = await screen.findByTestId('home-hero-subtype-mobile');
    fireEvent.click(scene);
    await waitFor(() => expect(scene.getAttribute('aria-selected')).toBe('true'));

    // 2. A Skill whose `od.mode` is `deck` — again, not a task-type pick.
    await mentionSkill('@deck', /deck lab/i);

    const payload = await submitAndRead(onSubmit);

    expect(payload.automaticStrategyTaskProfile ?? null).toBe('prototype');
    expect(payload.projectKind).toBe('prototype');
    // The scene's refinement is the whole reason the user picked it.
    expect(payload.projectMetadata).toEqual({
      kind: 'prototype',
      platform: 'auto',
      platformTargets: ['mobile-ios', 'mobile-android'],
    });
    expect(payload.skillId).toBe(DECK_SKILL.id);
  });
});

// @vitest-environment jsdom

import { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: () => null,
}));

import { HomeView } from '../../src/components/HomeView';
import {
  createPluginAuthoringHandoff,
  createPluginUseHandoff,
  PLUGIN_AUTHORING_DEFAULT_GOAL,
  PLUGIN_AUTHORING_PROMPT,
} from '../../src/components/home-hero/plugin-authoring';
// HomeHero's `home-hero-input` is now the project composer's Lexical
// contenteditable, not a <textarea>. These helpers drive/read it through the
// live editor instead of synthetic `fireEvent.change` / `.value` (which are
// no-ops on a contenteditable).
import {
  homeHeroPromptText,
  setHomeHeroPrompt,
} from '../helpers/home-hero-lexical';

const AUTHORING_PLUGIN = {
  id: 'od-plugin-authoring',
  title: 'Plugin authoring',
  version: '0.1.0',
  trust: 'bundled' as const,
  sourceKind: 'bundled' as const,
  source: '/tmp/plugin-authoring',
  capabilitiesGranted: ['prompt:inject'],
  fsPath: '/tmp/plugin-authoring',
  installedAt: 0,
  updatedAt: 0,
  manifest: {
    name: 'od-plugin-authoring',
    title: 'Plugin authoring',
    version: '0.1.0',
    description: 'Create plugins',
    od: {
      kind: 'scenario',
      taskKind: 'new-generation',
      useCase: { query: 'Create an Open Design plugin for {{pluginGoal}}.' },
      inputs: [
        {
          name: 'pluginGoal',
          type: 'string',
          required: false,
          default: PLUGIN_AUTHORING_DEFAULT_GOAL,
          label: 'Plugin goal',
        },
      ],
    },
  },
};

const DEFAULT_PLUGIN = {
  ...AUTHORING_PLUGIN,
  id: 'od-new-generation',
  title: 'New generation',
  source: '/tmp/new-generation',
  fsPath: '/tmp/new-generation',
  manifest: {
    ...AUTHORING_PLUGIN.manifest,
    name: 'od-new-generation',
    title: 'New generation',
    description: 'Create new design artifacts',
    od: {
      kind: 'scenario',
      taskKind: 'new-generation',
      useCase: { query: 'Create a plugin.' },
    },
  },
};

const DOCUMENT_NEW_GENERATION_PLUGIN = {
  ...DEFAULT_PLUGIN,
  manifest: {
    ...DEFAULT_PLUGIN.manifest,
    od: {
      ...DEFAULT_PLUGIN.manifest.od,
      useCase: {
        query: 'Generate a {{artifactKind}} for {{audience}} on {{topic}}.',
      },
      inputs: [
        {
          name: 'artifactKind',
          type: 'string',
          required: true,
          label: 'Artifact kind',
        },
        {
          name: 'audience',
          type: 'string',
          required: true,
          label: 'Audience',
        },
        {
          name: 'topic',
          type: 'string',
          required: true,
          label: 'Topic',
        },
      ],
    },
  },
};

const HIDDEN_DEFAULT_PLUGIN = {
  ...DEFAULT_PLUGIN,
  id: 'od-default',
  title: 'Default design router',
  source: '/tmp/default-router',
  fsPath: '/tmp/default-router',
  manifest: {
    ...DEFAULT_PLUGIN.manifest,
    name: 'od-default',
    title: 'Default design router',
    od: {
      ...DEFAULT_PLUGIN.manifest.od,
      hidden: true,
    },
  },
};

// The Prototype chip binds to the bundled `example-web-prototype`
// plugin (which ships its own seed + layouts + checklist) instead of
// the generic od-new-generation router. Mirror that here so the
// chip-applies test can find a matching plugin record and the apply
// call resolves to the new id.
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
        {
          name: 'artifactKind',
          type: 'string',
          required: true,
          default: 'web prototype',
          label: 'Artifact kind',
        },
        {
          name: 'fidelity',
          type: 'select',
          required: true,
          options: ['wireframe', 'high-fidelity'],
          default: 'high-fidelity',
          label: 'Fidelity',
        },
        {
          name: 'audience',
          type: 'string',
          required: true,
          default: 'product evaluators',
          label: 'Audience',
        },
        {
          name: 'designSystem',
          type: 'string',
          default: 'the active project design system',
          label: 'Design system',
        },
        {
          name: 'template',
          type: 'string',
          default: 'the bundled web prototype seed',
          label: 'Template',
        },
      ],
    },
  },
};

const SIMPLE_DECK_PLUGIN = {
  ...DEFAULT_PLUGIN,
  id: 'example-simple-deck',
  title: 'Simple Deck',
  source: '/tmp/simple-deck',
  fsPath: '/tmp/simple-deck',
  manifest: {
    ...DEFAULT_PLUGIN.manifest,
    name: 'example-simple-deck',
    title: 'Simple Deck',
    description: 'Single-file horizontal-swipe HTML deck.',
    od: {
      kind: 'scenario',
      taskKind: 'new-generation',
      useCase: {
        query: 'Create a {{deckType}} for {{audience}} about {{topic}} with {{slideCount}}. Speaker notes: {{speakerNotes}}. Use {{designSystem}}.',
      },
      inputs: [
        {
          name: 'deckType',
          type: 'select',
          required: true,
          options: ['pitch deck', 'product overview', 'study deck'],
          default: 'pitch deck',
          label: 'Deck type',
        },
        {
          name: 'topic',
          type: 'string',
          required: true,
          default: 'the user brief',
          label: 'Topic',
        },
        {
          name: 'audience',
          type: 'string',
          required: true,
          default: 'decision makers',
          label: 'Audience',
        },
        {
          name: 'slideCount',
          type: 'select',
          required: true,
          options: ['5-10 pages', '10-15 pages', '15-20 pages', '20-25 pages', '25-30 pages'],
          default: '10-15 pages',
          label: 'Pages',
        },
        {
          name: 'speakerNotes',
          type: 'select',
          options: ['include speaker notes', 'no speaker notes'],
          default: 'include speaker notes',
          label: 'Speaker notes',
        },
        {
          name: 'designSystem',
          type: 'string',
          default: 'the active project design system',
          label: 'Design system',
        },
      ],
    },
  },
};

const LIVE_ARTIFACT_PLUGIN = {
  ...DEFAULT_PLUGIN,
  id: 'example-live-artifact',
  title: 'Live Artifact',
  source: '/tmp/live-artifact',
  fsPath: '/tmp/live-artifact',
  manifest: {
    ...DEFAULT_PLUGIN.manifest,
    name: 'example-live-artifact',
    title: 'Live Artifact',
    description: 'Create refreshable, auditable Open Design artifacts.',
    od: {
      kind: 'scenario',
      taskKind: 'new-generation',
      mode: 'prototype',
      scenario: 'live',
      useCase: {
        query: 'Create refreshable, auditable Open Design artifacts backed by connector or local data.',
      },
      context: {
        skills: [{ path: './SKILL.md' }],
      },
      pipeline: {
        stages: [{ id: 'generate', atoms: ['file-write', 'live-artifact'] }],
      },
    },
  },
};

const LIVE_ARTIFACT_IMAGE_TEMPLATE_PLUGIN = {
  ...LIVE_ARTIFACT_PLUGIN,
  id: 'image-template-notion-team-dashboard-live-artifact',
  title: 'Notion live artifact',
  source: '/tmp/notion-live-artifact',
  fsPath: '/tmp/notion-live-artifact',
  manifest: {
    ...LIVE_ARTIFACT_PLUGIN.manifest,
    name: 'image-template-notion-team-dashboard-live-artifact',
    title: 'Notion live artifact',
    description: 'Create a live Notion dashboard artifact.',
    od: {
      ...LIVE_ARTIFACT_PLUGIN.manifest.od,
      mode: 'image',
      surface: 'image',
      useCase: {
        query: 'Create a refreshable Notion dashboard live artifact.',
      },
    },
  },
};

const AUTHORING_DEFAULT_SCENARIO_INPUTS = {
  artifactKind: 'Open Design plugin',
  audience: 'Open Design plugin authors',
  topic: 'packaging a reusable workflow as an Open Design plugin',
};

const REFLY_DESIGN_SYSTEM = {
  id: 'ds-refly',
  title: 'Refly Design System',
  category: 'Productivity & SaaS',
  summary: 'Refly defaults',
  source: 'user' as const,
  status: 'published' as const,
  isEditable: true,
};

const AUTHORING_APPLY_RESULT = {
  query: 'Create a plugin.',
  contextItems: [],
  inputs: AUTHORING_PLUGIN.manifest.od.inputs,
  assets: [],
  mcpServers: [],
  trust: 'trusted',
  capabilitiesGranted: ['prompt:inject'],
  capabilitiesRequired: ['prompt:inject'],
  appliedPlugin: {
    snapshotId: 'snap-authoring',
    pluginId: 'od-plugin-authoring',
    pluginVersion: '0.1.0',
    manifestSourceDigest: 'a'.repeat(64),
    inputs: { pluginGoal: PLUGIN_AUTHORING_DEFAULT_GOAL },
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
  projectMetadata: {},
};

const DEFAULT_APPLY_RESULT = {
  ...AUTHORING_APPLY_RESULT,
  inputs: [],
  appliedPlugin: {
    ...AUTHORING_APPLY_RESULT.appliedPlugin,
    snapshotId: 'snap-default',
    pluginId: 'od-new-generation',
    inputs: AUTHORING_DEFAULT_SCENARIO_INPUTS,
  },
};

const DOCUMENT_NEW_GENERATION_APPLY_RESULT = {
  ...AUTHORING_APPLY_RESULT,
  query: DOCUMENT_NEW_GENERATION_PLUGIN.manifest.od.useCase.query,
  inputs: DOCUMENT_NEW_GENERATION_PLUGIN.manifest.od.inputs,
  appliedPlugin: {
    ...AUTHORING_APPLY_RESULT.appliedPlugin,
    snapshotId: 'snap-document-new-generation',
    pluginId: 'od-new-generation',
    inputs: {
      artifactKind: 'document',
      audience: 'readers',
      topic: 'the user brief',
    },
  },
};

const WEB_PROTOTYPE_APPLY_RESULT = {
  ...AUTHORING_APPLY_RESULT,
  query: WEB_PROTOTYPE_PLUGIN.manifest.od.useCase.query,
  inputs: WEB_PROTOTYPE_PLUGIN.manifest.od.inputs,
  appliedPlugin: {
    ...AUTHORING_APPLY_RESULT.appliedPlugin,
    snapshotId: 'snap-web-prototype',
    pluginId: 'example-web-prototype',
    inputs: {
      artifactKind: 'web prototype',
      fidelity: 'high-fidelity',
      audience: 'product evaluators',
      designSystem: 'the active project design system',
      template: 'the bundled web prototype seed',
    },
  },
};

// A plugin whose useCase.query is a generator-facing meta-instruction (not a
// human-readable brief). use-with-query must surface the description instead,
// matching the Home example-prompt cards.
const META_INSTRUCTION_PLUGIN = {
  ...DEFAULT_PLUGIN,
  id: 'example-meta-landing',
  title: 'Meta Landing',
  source: '/tmp/meta-landing',
  fsPath: '/tmp/meta-landing',
  manifest: {
    ...DEFAULT_PLUGIN.manifest,
    name: 'example-meta-landing',
    title: 'Meta Landing',
    description: 'Cinematic parallax landing page.',
    od: {
      kind: 'scenario',
      taskKind: 'new-generation',
      useCase: {
        query: 'Follow the en field verbatim; start from the bundled example.html.',
      },
    },
  },
};

const META_INSTRUCTION_APPLY_RESULT = {
  ...WEB_PROTOTYPE_APPLY_RESULT,
  query: META_INSTRUCTION_PLUGIN.manifest.od.useCase.query,
  inputs: [],
  appliedPlugin: {
    ...WEB_PROTOTYPE_APPLY_RESULT.appliedPlugin,
    snapshotId: 'snap-meta-landing',
    pluginId: 'example-meta-landing',
    inputs: {},
  },
};

const SIMPLE_DECK_APPLY_RESULT = {
  ...AUTHORING_APPLY_RESULT,
  query: SIMPLE_DECK_PLUGIN.manifest.od.useCase.query,
  inputs: SIMPLE_DECK_PLUGIN.manifest.od.inputs,
  appliedPlugin: {
    ...AUTHORING_APPLY_RESULT.appliedPlugin,
    snapshotId: 'snap-simple-deck',
    pluginId: 'example-simple-deck',
    inputs: {
      deckType: 'pitch deck',
      topic: 'the user brief',
      audience: 'decision makers',
      slideCount: '10-15 pages',
      speakerNotes: 'include speaker notes',
      designSystem: 'the active project design system',
    },
  },
};

const LIVE_ARTIFACT_APPLY_RESULT = {
  ...AUTHORING_APPLY_RESULT,
  query: LIVE_ARTIFACT_PLUGIN.manifest.od.useCase.query,
  inputs: [],
  appliedPlugin: {
    ...AUTHORING_APPLY_RESULT.appliedPlugin,
    snapshotId: 'snap-live-artifact',
    pluginId: 'example-live-artifact',
    inputs: {},
  },
  projectMetadata: {
    skillId: 'live-artifact',
  },
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

describe('HomeView prompt handoff', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('consumes a plugin authoring handoff once and focuses the textarea', async () => {
    let resolveApply: (response: Response) => void = () => undefined;
    const applyResponse = new Promise<Response>((resolve) => {
      resolveApply = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [AUTHORING_PLUGIN, WEB_PROTOTYPE_PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.includes('/api/plugins/od-plugin-authoring/apply')) {
        return applyResponse;
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    stubAnimationFrame();

    const { rerender } = render(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
        promptHandoff={createPluginAuthoringHandoff(1)}
      />,
    );

    const input = await screen.findByTestId('home-hero-input');
    await waitFor(() => {
      expect(homeHeroPromptText()).toBe(PLUGIN_AUTHORING_PROMPT);
      expect(document.activeElement).toBe(input);
    });
    const inputCard = input.closest('.home-hero__input-card') as HTMLElement | null;
    expect(inputCard?.classList.contains('home-hero__input-card--compact-authoring')).toBe(true);
    expect(inputCard?.style.getPropertyValue('--home-hero-prompt-max-height')).toBe('132px');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/od-plugin-authoring/apply',
      expect.anything(),
    ));
    resolveApply(new Response(JSON.stringify(AUTHORING_APPLY_RESULT), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    await waitFor(() => {
      expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false);
    });

    await setPromptAndSettle('User edited prompt');

    rerender(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
        promptHandoff={createPluginAuthoringHandoff(1)}
      />,
    );

    expect(homeHeroPromptText()).toBe('User edited prompt');
  });

  it('uses the same authoring prompt from the Home rail chip', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [AUTHORING_PLUGIN, WEB_PROTOTYPE_PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.includes('/api/plugins/od-plugin-authoring/apply')) {
        return new Response(JSON.stringify(AUTHORING_APPLY_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }));
    stubAnimationFrame();

    render(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await clearActiveTypeChip();
    await clickHomeShortcut('create-plugin');

    const input = await screen.findByTestId('home-hero-input');
    await waitFor(() => {
      expect(homeHeroPromptText()).toBe(PLUGIN_AUTHORING_PROMPT);
      expect(document.activeElement).toBe(input);
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('asks before replacing an edited Home draft with the rail create-plugin prompt', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [AUTHORING_PLUGIN, WEB_PROTOTYPE_PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.includes('/api/plugins/od-plugin-authoring/apply')) {
        return new Response(JSON.stringify(AUTHORING_APPLY_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
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
    await setPromptAndSettle('Keep my custom plugin brief');
    await clickHomeShortcut('create-plugin');

    const dialog = await screen.findByRole('dialog', { name: /replace current prompt/i });
    expect(homeHeroPromptText()).toBe('Keep my custom plugin brief');
    expect(fetchMock.mock.calls.some(([url]) => (
      typeof url === 'string' && url.includes('/api/plugins/od-plugin-authoring/apply')
    ))).toBe(false);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Replace' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/od-plugin-authoring/apply',
      expect.anything(),
    ));
    await waitFor(() => expect(homeHeroPromptText()).toBe(PLUGIN_AUTHORING_PROMPT));
    expect(screen.queryByRole('dialog', { name: /replace current prompt/i })).toBeNull();
  });

  it('routes a plugin-use handoff from the Plugins page as the active driver and submits it as the run driver', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [WEB_PROTOTYPE_PLUGIN] }), {
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
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    stubAnimationFrame();
    const onSubmit = vi.fn();

    render(
      <HomeView
        projects={[]}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
        promptHandoff={createPluginUseHandoff(1, 'example-web-prototype')}
      />,
    );

    // "Use" now routes the picked plugin as the active driver (so its own
    // pipeline + context apply on submit), not merely as background context.
    // The active-plugin badge surfaces and the plugin is applied; a plain
    // `use` leaves the draft empty (suppressPromptUpdate).
    await waitFor(() => {
      expect(screen.getByTestId('home-hero-active-plugin')).toBeTruthy();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/example-web-prototype/apply',
      expect.anything(),
    ));
    await screen.findByTestId('home-hero-input');
    expect(homeHeroPromptValue()).toBe('');

    // The user types their own brief over the empty draft, then submits — the
    // routed plugin (not od-default) must drive the created run. Mirrors the
    // P0 e2e "direct Use ... keeps the prompt freeform" flow.
    await setPromptAndSettle('Use the selected starter as the driver');
    await waitFor(() => {
      expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Use the selected starter as the driver',
      pluginId: 'example-web-prototype',
      appliedPluginSnapshotId: 'snap-web-prototype',
    })));
  });

  it('routes free-form submits through the hidden default plugin without applying a visible chip', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [HIDDEN_DEFAULT_PLUGIN, DEFAULT_PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
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
    await setPromptAndSettle('Make a launch page for a robotics studio');
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    expect(screen.queryByTestId('home-hero-active-plugin')).toBeNull();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Make a launch page for a robotics studio',
      pluginId: 'od-default',
      appliedPluginSnapshotId: null,
      pluginInputs: { prompt: 'Make a launch page for a robotics studio' },
      projectKind: 'other',
    }));
  });

  it('falls back to od-new-generation when od-plugin-authoring is not registered yet', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [DEFAULT_PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.includes('/apply')) {
        return new Response(JSON.stringify(DEFAULT_APPLY_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
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

    await clickHomeShortcut('create-plugin');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/od-new-generation/apply',
      expect.anything(),
    ));
    const applyCall = fetchMock.mock.calls.find(([url]) => (
      typeof url === 'string' && url.includes('/api/plugins/od-new-generation/apply')
    ));
    expect(JSON.parse(String((applyCall?.[1] as RequestInit).body))).toMatchObject({
      inputs: {
        artifactKind: 'Open Design plugin',
        audience: 'Open Design plugin authors',
        topic: 'packaging a reusable workflow as an Open Design plugin',
      },
    });
    await waitFor(() => {
      expect(homeHeroPromptText()).toBe(PLUGIN_AUTHORING_PROMPT);
      expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: PLUGIN_AUTHORING_PROMPT,
      pluginId: 'od-new-generation',
      appliedPluginSnapshotId: 'snap-default',
      pluginInputs: {
        artifactKind: 'Open Design plugin',
        audience: 'Open Design plugin authors',
        topic: 'packaging a reusable workflow as an Open Design plugin',
      },
      projectKind: 'other',
    }));
  });

  it('binds the Home rail Prototype chip locally and applies it on submit', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [WEB_PROTOTYPE_PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.includes('/apply')) {
        return new Response(JSON.stringify(WEB_PROTOTYPE_APPLY_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    stubAnimationFrame();
    const onSubmit = vi.fn();

    render(
      <HomeView
        projects={[]}
        designSystems={[REFLY_DESIGN_SYSTEM]}
        defaultDesignSystemId="ds-refly"
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await clearActiveTypeChip();
    fireEvent.click(await screen.findByTestId('home-hero-rail-prototype'));

    await waitFor(() => {
      expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Prototype');
    });
    expect(fetchMock.mock.calls.some(([url]) => (
      typeof url === 'string' && url.includes('/api/plugins/example-web-prototype/apply')
    ))).toBe(false);
    // The design-system picker is now a persistent control in the row below the
    // composer (next to the working-directory picker), available for every
    // product kind rather than gated on the prototype/deck footer.
    expect(
      screen.getByTestId('home-hero-design-system-trigger').textContent,
    ).toContain('Refly Design System');
    // Fidelity is no longer a prototype footer control — the agent asks for it
    // in discovery instead.
    expect(screen.queryByTestId('home-hero-footer-option-fidelity')).toBeNull();
    // The design-system footer pill is gone; the persistent picker replaces it.
    expect(screen.queryByTestId('home-hero-footer-option-designSystem')).toBeNull();
    expect(screen.getByTestId('home-hero-design-system-trigger')).toBeTruthy();
    expect(homeHeroPromptValue()).toBe('');
    expect(screen.getByTestId('home-hero-plugin-presets')).toBeTruthy();
    // Inline `{{slot}}` prompt widgets were removed in the Lexical migration;
    // these null checks now confirm the migrated editor never renders them.
    expect(screen.queryByTestId('home-hero-prompt-slot-fidelity')).toBeNull();
    expect(screen.queryByTestId('home-hero-prompt-slot-artifactKind')).toBeNull();
    expect(screen.queryByTestId('home-hero-prompt-slot-designSystem')).toBeNull();
    expect(screen.queryByTestId('home-hero-prompt-slot-template')).toBeNull();
    // The inline plugin inputs form was removed from the Home composer, so the
    // non-footer inputs (artifactKind / audience / template) no longer render.
    expect(screen.queryByTestId('plugin-inputs-form')).toBeNull();

    await setPromptAndSettle('Build a pricing-page prototype.');
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/example-web-prototype/apply',
      expect.anything(),
    ));
    const applyCall = fetchMock.mock.calls.find(([url]) => (
      typeof url === 'string' && url.includes('/api/plugins/example-web-prototype/apply')
    ));
    const protoApplyInputs = JSON.parse(String((applyCall?.[1] as RequestInit).body)).inputs;
    expect(protoApplyInputs).toMatchObject({
      artifactKind: 'web prototype',
      audience: 'product evaluators',
      designSystem: 'Refly Design System',
      template: 'the bundled web prototype seed',
    });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: 'example-web-prototype',
      projectKind: 'prototype',
      prompt: 'Build a pricing-page prototype.',
      designSystemId: 'ds-refly',
      projectMetadata: expect.objectContaining({
        kind: 'prototype',
      }),
    })));
    // Fidelity is deferred to first-turn discovery: the plugin is still applied
    // with its full inputs, but its default must NOT be forwarded to the run, so
    // the question-form flow collects it instead of inheriting a baked-in value.
    const [{ pluginInputs: protoSubmittedInputs }] = onSubmit.mock.calls[0] as [
      { pluginInputs?: Record<string, unknown> },
    ];
    expect(protoSubmittedInputs).not.toHaveProperty('fidelity');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps Document prompt entry submittable even when od-new-generation has required inputs', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [DOCUMENT_NEW_GENERATION_PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.includes('/api/plugins/od-new-generation/apply')) {
        return new Response(JSON.stringify(DOCUMENT_NEW_GENERATION_APPLY_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
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

    await clearActiveTypeChip();
    fireEvent.click(await screen.findByTestId('home-hero-rail-document'));

    await waitFor(() => {
      expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Document');
    });
    await setPromptAndSettle('Write a crisp launch memo for the new analytics product.');
    const submit = screen.getByTestId('home-hero-submit') as HTMLButtonElement;
    await waitFor(() => expect(submit.disabled).toBe(false));

    fireEvent.click(submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/od-new-generation/apply',
      expect.anything(),
    ));
    const applyCall = fetchMock.mock.calls.find(([url]) => (
      typeof url === 'string' && url.includes('/api/plugins/od-new-generation/apply')
    ));
    expect(JSON.parse(String((applyCall?.[1] as RequestInit).body))).toMatchObject({
      inputs: {
        artifactKind: 'document',
        audience: 'readers',
        topic: 'the user brief',
      },
    });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: 'od-new-generation',
      appliedPluginSnapshotId: 'snap-document-new-generation',
      projectKind: 'other',
      prompt: 'Write a crisp launch memo for the new analytics product.',
    })));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('defaults to "No design system" (不指定) when the user has no personal default and submits a null designSystemId', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [WEB_PROTOTYPE_PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.includes('/apply')) {
        return new Response(JSON.stringify(WEB_PROTOTYPE_APPLY_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    stubAnimationFrame();
    const onSubmit = vi.fn();

    // A preset is offered (REFLY) but it is NOT the user's personal default, so
    // the composer must default to "No design system" rather than a preset.
    render(
      <HomeView
        projects={[]}
        designSystems={[REFLY_DESIGN_SYSTEM]}
        defaultDesignSystemId={null}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await clearActiveTypeChip();
    fireEvent.click(await screen.findByTestId('home-hero-rail-prototype'));

    await waitFor(() => {
      expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Prototype');
    });
    expect(
      screen.getByTestId('home-hero-design-system-trigger').textContent,
    ).toContain('No design system');

    await setPromptAndSettle('Build a pricing-page prototype.');
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/example-web-prototype/apply',
      expect.anything(),
    ));
    const applyCall = fetchMock.mock.calls.find(([url]) => (
      typeof url === 'string' && url.includes('/api/plugins/example-web-prototype/apply')
    ));
    const protoApplyInputs = JSON.parse(String((applyCall?.[1] as RequestInit).body)).inputs;
    expect(protoApplyInputs).toMatchObject({ designSystem: 'No design system' });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: 'example-web-prototype',
      projectKind: 'prototype',
      designSystemId: null,
    })));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lets the user explicitly pick "No design system" to override a personal default and submit a null designSystemId', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [WEB_PROTOTYPE_PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.includes('/apply')) {
        return new Response(JSON.stringify(WEB_PROTOTYPE_APPLY_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    stubAnimationFrame();
    const onSubmit = vi.fn();

    render(
      <HomeView
        projects={[]}
        designSystems={[REFLY_DESIGN_SYSTEM]}
        defaultDesignSystemId="ds-refly"
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await clearActiveTypeChip();
    fireEvent.click(await screen.findByTestId('home-hero-rail-prototype'));

    // The personal default pre-selects, as before.
    await waitFor(() => {
      expect(
        screen.getByTestId('home-hero-design-system-trigger').textContent,
      ).toContain('Refly Design System');
    });

    // Open the shared design-system picker popover and pick the explicit
    // "No design system" row.
    fireEvent.click(screen.getByTestId('home-hero-design-system-trigger'));
    const popover = await screen.findByTestId('project-ds-picker-popover');
    const noneOption = await within(popover).findByText('No design system');
    fireEvent.mouseDown(noneOption);
    await waitFor(() => {
      expect(
        screen.getByTestId('home-hero-design-system-trigger').textContent,
      ).toContain('No design system');
    });

    await setPromptAndSettle('Build a pricing-page prototype.');
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: 'example-web-prototype',
      designSystemId: null,
    })));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('uses example preset cards as plain-text prompt fillers while preserving selected chip inputs', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [WEB_PROTOTYPE_PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.includes('/apply')) {
        return new Response(JSON.stringify(WEB_PROTOTYPE_APPLY_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    stubAnimationFrame();
    const onSubmit = vi.fn();

    render(
      <HomeView
        projects={[]}
        designSystems={[REFLY_DESIGN_SYSTEM]}
        defaultDesignSystemId="ds-refly"
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await clearActiveTypeChip();
    fireEvent.click(await screen.findByTestId('home-hero-rail-prototype'));
    fireEvent.click(await screen.findByTestId('home-hero-plugin-preset'));

    screen.getByTestId('home-hero-input');
    await waitFor(() => {
      expect(homeHeroPromptText()).toBe(
        'Build a high-fidelity web prototype for product evaluators using the active project design system from the bundled web prototype seed.',
      );
    });
    expect(fetchMock.mock.calls.some(([url]) => (
      typeof url === 'string' && url.includes('/api/plugins/example-web-prototype/apply')
    ))).toBe(false);
    expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Prototype');
    // The design-system picker is now the persistent control below the composer.
    expect(
      screen.getByTestId('home-hero-design-system-trigger').textContent,
    ).toContain('Refly Design System');
    // Fidelity is no longer a prototype footer control (asked in discovery).
    expect(screen.queryByTestId('home-hero-footer-option-fidelity')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-designSystem')).toBeNull();
    // Inline `{{slot}}` prompt widgets were removed in the Lexical migration.
    expect(screen.queryByTestId('home-hero-prompt-slot-fidelity')).toBeNull();
    expect(screen.queryByTestId('home-hero-prompt-slot-artifactKind')).toBeNull();
    expect(screen.queryByTestId('home-hero-prompt-slot-designSystem')).toBeNull();
    expect(screen.queryByTestId('home-hero-prompt-slot-template')).toBeNull();
    // The inline plugin inputs form was removed from the Home composer; the
    // preset card still seeds the prompt and keeps the chip's structured inputs
    // in state (submitted below), but no inputs form renders.
    expect(screen.queryByTestId('plugin-inputs-form')).toBeNull();

    fireEvent.click(screen.getByTestId('home-hero-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/example-web-prototype/apply',
      expect.anything(),
    ));
    const applyCall = fetchMock.mock.calls.find(([url]) => (
      typeof url === 'string' && url.includes('/api/plugins/example-web-prototype/apply')
    ));
    // The preset card seeds the prompt as plain text while preserving the
    // chip's structured inputs (artifactKind / fidelity / audience /
    // designSystem / template all round-trip). Seeding the editor does NOT
    // re-run the host's prompt-extraction (HomeHero suppresses the seed echo
    // in onChange), so designSystem keeps the chip/footer default rather than
    // being re-read from the prompt text.
    expect(JSON.parse(String((applyCall?.[1] as RequestInit).body))).toMatchObject({
      inputs: {
        artifactKind: 'web prototype',
        audience: 'product evaluators',
        designSystem: 'Refly Design System',
        template: 'the bundled web prototype seed',
      },
    });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: 'example-web-prototype',
      projectKind: 'prototype',
      prompt: 'Build a high-fidelity web prototype for product evaluators using the active project design system from the bundled web prototype seed.',
      designSystemId: 'ds-refly',
      projectMetadata: expect.objectContaining({
        kind: 'prototype',
      }),
    })));
  });

  it('binds the picked preset plugin on submit while preserving the chip metadata', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({
          plugins: [LIVE_ARTIFACT_PLUGIN, LIVE_ARTIFACT_IMAGE_TEMPLATE_PLUGIN],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.includes('/apply')) {
        return new Response(JSON.stringify(LIVE_ARTIFACT_APPLY_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
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

    await clearActiveTypeChip();
    fireEvent.click(await screen.findByTestId('home-hero-rail-live-artifact'));

    await waitFor(() => {
      expect(screen.getAllByTestId('home-hero-plugin-preset').length).toBeGreaterThan(0);
    });
    const liveArtifactTemplatePreset = screen.getAllByTestId('home-hero-plugin-preset')
      .find((item) => item.getAttribute('data-plugin-id') === LIVE_ARTIFACT_IMAGE_TEMPLATE_PLUGIN.id);
    if (!liveArtifactTemplatePreset) {
      throw new Error('expected live artifact image template preset to render');
    }
    fireEvent.click(liveArtifactTemplatePreset);

    screen.getByTestId('home-hero-input');
    // The composer seed prefers the curated description over the query head
    // (the query is generator-facing; it still reaches the agent as plugin
    // context on apply).
    await waitFor(() => {
      expect(homeHeroPromptText()).toBe('Create a live Notion dashboard artifact.');
    });
    expect(fetchMock.mock.calls.some(([url]) => (
      typeof url === 'string' && url.includes('/apply')
    ))).toBe(false);
    expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Live artifact');
    expect(screen.queryByTestId('plugin-inputs-form')).toBeNull();

    fireEvent.click(screen.getByTestId('home-hero-submit'));

    // Picking a preset binds the preset's OWN plugin (so its SKILL.md /
    // example.html become generation context and the output recreates that
    // reference), while the live-artifact chip's project kind + metadata are
    // carried forward. Submit resolves the snapshot for the preset plugin.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/image-template-notion-team-dashboard-live-artifact/apply',
      expect.anything(),
    ));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: 'image-template-notion-team-dashboard-live-artifact',
      appliedPluginSnapshotId: 'snap-live-artifact',
      projectKind: 'prototype',
      projectMetadata: expect.objectContaining({
        kind: 'prototype',
        intent: 'live-artifact',
        fidelity: 'high-fidelity',
      }),
      prompt: 'Create a live Notion dashboard artifact.',
    })));
  });

  it('binds the Home rail Live artifact chip with live-artifact metadata and applies it on submit', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [WEB_PROTOTYPE_PLUGIN, LIVE_ARTIFACT_PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.includes('/api/plugins/example-live-artifact/apply')) {
        return new Response(JSON.stringify(LIVE_ARTIFACT_APPLY_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
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

    await clearActiveTypeChip();
    fireEvent.click(await screen.findByTestId('home-hero-rail-live-artifact'));

    await waitFor(() => {
      expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Live artifact');
    });
    expect(fetchMock.mock.calls.some(([url]) => (
      typeof url === 'string' && url.includes('/api/plugins/example-live-artifact/apply')
    ))).toBe(false);
    await setPromptAndSettle('Build a refreshable Stripe revenue dashboard.');
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/example-live-artifact/apply',
      expect.anything(),
    ));
    const applyCall = fetchMock.mock.calls.find(([url]) => (
      typeof url === 'string' && url.includes('/api/plugins/example-live-artifact/apply')
    ));
    expect(JSON.parse(String((applyCall?.[1] as RequestInit).body))).toMatchObject({
      inputs: {},
    });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: 'example-live-artifact',
      appliedPluginSnapshotId: 'snap-live-artifact',
      projectKind: 'prototype',
      projectMetadata: expect.objectContaining({
        kind: 'prototype',
        intent: 'live-artifact',
        fidelity: 'high-fidelity',
      }),
      prompt: 'Build a refreshable Stripe revenue dashboard.',
    })));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('binds the deck chip and keeps only the design-system picker in the footer', async () => {
    // Slide count + speaker-notes footer controls were removed from the deck
    // composer; the agent asks for them in the first-turn discovery flow. The
    // deck footer now mirrors the prototype footer — design system only.
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [SIMPLE_DECK_PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.includes('/api/plugins/example-simple-deck/apply')) {
        return new Response(JSON.stringify(SIMPLE_DECK_APPLY_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    stubAnimationFrame();
    const onSubmit = vi.fn();

    render(
      <HomeView
        projects={[]}
        designSystems={[REFLY_DESIGN_SYSTEM]}
        defaultDesignSystemId="ds-refly"
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await clearActiveTypeChip();
    fireEvent.click(await screen.findByTestId('home-hero-rail-deck'));

    await waitFor(() => {
      expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Slide deck');
    });
    expect(screen.queryByTestId('home-hero-footer-option-speakerNotes')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-slideCount')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-designSystem')).toBeNull();
    // The design-system picker is the persistent control below the composer.
    expect(screen.getByTestId('home-hero-design-system-trigger')).toBeTruthy();

    await setPromptAndSettle('Create an investor deck for a local-first design tool.');
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: 'example-simple-deck',
      projectKind: 'deck',
      projectMetadata: expect.objectContaining({
        kind: 'deck',
      }),
    })));
  });

  it('switches output-type chips without replacing an existing prompt', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [WEB_PROTOTYPE_PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.includes('/apply')) {
        return new Response(JSON.stringify(DEFAULT_APPLY_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
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
    await setPromptAndSettle('Keep my current brief');
    await clearActiveTypeChip();
    fireEvent.click(await screen.findByTestId('home-hero-rail-prototype'));

    await waitFor(() => {
      expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Prototype');
    });
    expect(fetchMock.mock.calls.some(([url]) => (
      typeof url === 'string' && url.includes('/api/plugins/example-web-prototype/apply')
    ))).toBe(false);
    expect(homeHeroPromptText()).toBe('Keep my current brief');
    expect(screen.queryByRole('dialog', { name: /replace current prompt/i })).toBeNull();
  });

  it('lets selected chips seed the hero through preset cards', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [WEB_PROTOTYPE_PLUGIN, SIMPLE_DECK_PLUGIN] }), {
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
      if (typeof url === 'string' && url.includes('/api/plugins/example-simple-deck/apply')) {
        return new Response(JSON.stringify(SIMPLE_DECK_APPLY_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    stubAnimationFrame();

    render(
      <HomeView
        projects={[]}
        designSystems={[REFLY_DESIGN_SYSTEM]}
        defaultDesignSystemId="ds-refly"
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await clearActiveTypeChip();
    fireEvent.click(await screen.findByTestId('home-hero-rail-deck'));
    await waitFor(() => {
      expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Slide deck');
    });
    expect(screen.getByTestId('home-hero-plugin-presets')).toBeTruthy();
    expect(screen.getByTestId('home-hero-plugin-presets').textContent).toContain('Simple Deck');
    fireEvent.click(screen.getAllByTestId('home-hero-plugin-preset')[0]!);
    expect(fetchMock.mock.calls.some(([url]) => (
      typeof url === 'string' && url.includes('/api/plugins/example-simple-deck/apply')
    ))).toBe(false);
    await waitFor(() => {
      expect(homeHeroPromptText()).toBe(
        'Create a pitch deck for decision makers about the user brief with 10-15 pages. Speaker notes: include speaker notes. Use the active project design system.',
      );
    });

    await clearActiveTypeChip();
    fireEvent.click(await screen.findByTestId('home-hero-rail-prototype'));
    await waitFor(() => {
      expect(screen.getByTestId('home-hero-plugin-presets')).toBeTruthy();
    });
    fireEvent.click(screen.getAllByTestId('home-hero-plugin-preset')[0]!);
    expect(fetchMock.mock.calls.some(([url]) => (
      typeof url === 'string' && url.includes('/api/plugins/example-web-prototype/apply')
    ))).toBe(false);
    await waitFor(() => {
      expect(homeHeroPromptText()).toBe(
        'Build a high-fidelity web prototype for product evaluators using the active project design system from the bundled web prototype seed.',
      );
    });
  });

  it('appends a plugin-use query handoff without replacing an existing prompt', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [WEB_PROTOTYPE_PLUGIN] }), {
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
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    stubAnimationFrame();

    const { rerender } = render(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await screen.findByTestId('home-hero-input');
    await setPromptAndSettle('Keep my current brief');

    rerender(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
        promptHandoff={createPluginUseHandoff(2, 'example-web-prototype', {
          action: 'use-with-query',
        })}
      />,
    );

    const expectedPrompt = [
      'Keep my current brief',
      '',
      'Build a high-fidelity web prototype for product evaluators using the active project design system from the bundled web prototype seed.',
    ].join('\n');
    // `use-with-query` must APPEND the plugin query to the user's existing
    // draft, never replace it — this is the regression the reviewer flagged.
    await waitFor(() => {
      expect(homeHeroPromptText()).toBe(expectedPrompt);
    });
    expect(screen.queryByRole('dialog', { name: /replace current prompt/i })).toBeNull();
    // The plugin is now routed as the active driver (active-plugin badge),
    // and applied so its pipeline/context bind on submit.
    await waitFor(() => {
      expect(screen.getByTestId('home-hero-active-plugin')).toBeTruthy();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/example-web-prototype/apply',
      expect.anything(),
    ));
  });

  it('seeds the rendered query on use-with-query and writes placeholder edits back into inputs', async () => {
    // For a plugin whose query is already human-readable, use-with-query seeds
    // the rendered query itself. Because the seed came from the query (not a
    // description/meta-instruction fallback), the raw `{{...}}` template is kept
    // so editing a hydrated value in the composer flows back into pluginInputs
    // and submit resolves the snapshot from what the user sees.
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [WEB_PROTOTYPE_PLUGIN] }), {
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
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    stubAnimationFrame();
    const onSubmit = vi.fn();

    const { rerender } = render(
      <HomeView
        projects={[]}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await screen.findByTestId('home-hero-input');
    // Empty draft + use-with-query seeds the example-preset text into the editor.
    rerender(
      <HomeView
        projects={[]}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
        promptHandoff={createPluginUseHandoff(3, 'example-web-prototype', {
          action: 'use-with-query',
        })}
      />,
    );

    const seed =
      'Build a high-fidelity web prototype for product evaluators using the active project design system from the bundled web prototype seed.';
    await waitFor(() => expect(homeHeroPromptText()).toBe(seed));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/example-web-prototype/apply',
      expect.anything(),
    ));

    // The user edits the seeded audience; the placeholder edit flows back into
    // the submitted pluginInputs (not the stale applied default).
    const edited = seed.replace('product evaluators', 'enterprise architects');
    await setPromptAndSettle(edited);
    await waitFor(() => {
      expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: 'example-web-prototype',
      pluginInputs: expect.objectContaining({ audience: 'enterprise architects' }),
    })));
  });

  it('extracts a placeholder edit even after the use-with-query draft prefix is also edited', async () => {
    // The "tweak a preset before running" case: with an existing draft,
    // use-with-query appends the rendered query; the user then edits BOTH the
    // prefix and a hydrated placeholder. `queryTemplateAllowsPrefix` matches the
    // query as a suffix after any prefix, so the placeholder edit still reaches
    // pluginInputs and submit resolves the snapshot from the visible prompt.
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [WEB_PROTOTYPE_PLUGIN] }), {
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
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    stubAnimationFrame();
    const onSubmit = vi.fn();

    const { rerender } = render(
      <HomeView
        projects={[]}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await screen.findByTestId('home-hero-input');
    await setPromptAndSettle('Keep my current brief');

    rerender(
      <HomeView
        projects={[]}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
        promptHandoff={createPluginUseHandoff(4, 'example-web-prototype', {
          action: 'use-with-query',
        })}
      />,
    );

    const query =
      'Build a high-fidelity web prototype for product evaluators using the active project design system from the bundled web prototype seed.';
    const appended = `Keep my current brief\n\n${query}`;
    await waitFor(() => expect(homeHeroPromptText()).toBe(appended));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/example-web-prototype/apply',
      expect.anything(),
    ));

    const edited = appended
      .replace('Keep my current brief', 'Rewritten brief for the board')
      .replace('product evaluators', 'enterprise architects');
    await setPromptAndSettle(edited);
    await waitFor(() => {
      expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: 'example-web-prototype',
      pluginInputs: expect.objectContaining({ audience: 'enterprise architects' }),
    })));
  });

  it('extracts a placeholder edit after the user prepends an intro to an empty-draft use-with-query seed', async () => {
    // The empty-draft → add-prefix → edit-placeholder case: the seed lands in an
    // empty composer, then the user prepends an intro AND edits a hydrated value.
    // queryTemplateAllowsPrefix must stay on (we have a query template) so the
    // extractor matches the query as a suffix after the freshly-added prefix and
    // the placeholder edit still flows into pluginInputs.
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [WEB_PROTOTYPE_PLUGIN] }), {
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
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    stubAnimationFrame();
    const onSubmit = vi.fn();

    const { rerender } = render(
      <HomeView
        projects={[]}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await screen.findByTestId('home-hero-input');
    // Empty draft + use-with-query seeds the rendered query into the editor.
    rerender(
      <HomeView
        projects={[]}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
        promptHandoff={createPluginUseHandoff(6, 'example-web-prototype', {
          action: 'use-with-query',
        })}
      />,
    );

    const seed =
      'Build a high-fidelity web prototype for product evaluators using the active project design system from the bundled web prototype seed.';
    await waitFor(() => expect(homeHeroPromptText()).toBe(seed));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/example-web-prototype/apply',
      expect.anything(),
    ));

    // The user now PREPENDS an intro above the seed and edits the audience.
    const edited = `My intro for the board\n\n${seed.replace('product evaluators', 'enterprise architects')}`;
    await setPromptAndSettle(edited);
    await waitFor(() => {
      expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: 'example-web-prototype',
      pluginInputs: expect.objectContaining({ audience: 'enterprise architects' }),
    })));
  });

  it('seeds the plugin description, not the raw meta-instruction query, on use-with-query', async () => {
    // The plugin's useCase.query is a generator-facing meta-instruction
    // ("follow the en field verbatim; start from example.html"). The Home
    // example-prompt cards surface the description instead; the detail modal's
    // "Replicate this content" (use-with-query) must do the same rather than
    // dumping the meta-instruction into the composer.
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [META_INSTRUCTION_PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.includes('/api/plugins/example-meta-landing/apply')) {
        return new Response(JSON.stringify(META_INSTRUCTION_APPLY_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    stubAnimationFrame();
    const onSubmit = vi.fn();

    const { rerender } = render(
      <HomeView
        projects={[]}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await screen.findByTestId('home-hero-input');
    rerender(
      <HomeView
        projects={[]}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
        promptHandoff={createPluginUseHandoff(5, 'example-meta-landing', {
          action: 'use-with-query',
        })}
      />,
    );

    await waitFor(() => expect(homeHeroPromptText()).toBe('Cinematic parallax landing page.'));
    expect(homeHeroPromptText()).not.toContain('verbatim');
    expect(homeHeroPromptText()).not.toContain('example.html');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/example-meta-landing/apply',
      expect.anything(),
    ));
  });

  it('binds od-plugin-authoring before submitting the rail create-plugin prompt', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [AUTHORING_PLUGIN, WEB_PROTOTYPE_PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.includes('/apply')) {
        return new Response(JSON.stringify(AUTHORING_APPLY_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
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

    await clearActiveTypeChip();
    await clickHomeShortcut('create-plugin');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/od-plugin-authoring/apply',
      expect.anything(),
    ));
    await waitFor(() => {
      const badge = screen.getByTestId('home-hero-active-plugin');
      expect(badge.textContent).toContain('Create plugin');
      expect(badge.textContent).not.toContain('Plugin authoring');
    });
    const input = screen.getByTestId('home-hero-input');
    const inputCard = input.closest('.home-hero__input-card') as HTMLElement | null;
    expect(homeHeroPromptText()).toBe(PLUGIN_AUTHORING_PROMPT);
    expect(inputCard?.classList.contains('home-hero__input-card--compact-authoring')).toBe(true);
    expect(inputCard?.style.getPropertyValue('--home-hero-prompt-max-height')).toBe('132px');
    fireEvent.click(await screen.findByTestId('home-hero-submit'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: PLUGIN_AUTHORING_PROMPT,
      pluginId: 'od-plugin-authoring',
      appliedPluginSnapshotId: 'snap-authoring',
      pluginInputs: { pluginGoal: PLUGIN_AUTHORING_DEFAULT_GOAL },
      projectKind: 'other',
    }));
  });

  it('keeps the authoring goal input linked to the prompt and submit payload', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [AUTHORING_PLUGIN, WEB_PROTOTYPE_PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.includes('/apply')) {
        return new Response(JSON.stringify(AUTHORING_APPLY_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
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

    await clearActiveTypeChip();
    await clickHomeShortcut('create-plugin');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/od-plugin-authoring/apply',
      expect.anything(),
    ));

    const rewrittenGoal = 'catalog internal research notes into a reusable knowledge workflow';
    screen.getByTestId('home-hero-input');
    await setPromptAndSettle(
      homeHeroPromptText().replace(PLUGIN_AUTHORING_DEFAULT_GOAL, rewrittenGoal),
    );
    await waitFor(() => {
      expect(homeHeroPromptText()).toContain(rewrittenGoal);
    });
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining(rewrittenGoal),
      pluginId: 'od-plugin-authoring',
      pluginInputs: {
        pluginGoal: rewrittenGoal,
      },
    })));
  });

  it('does not submit the create-plugin prompt before the authoring scenario is applied', async () => {
    let resolveApply: (response: Response) => void = () => undefined;
    const applyResponse = new Promise<Response>((resolve) => {
      resolveApply = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [AUTHORING_PLUGIN, WEB_PROTOTYPE_PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.includes('/apply')) {
        return applyResponse;
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
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

    await clearActiveTypeChip();
    await clickHomeShortcut('create-plugin');
    const input = screen.getByTestId('home-hero-input');
    const inputCard = input.closest('.home-hero__input-card') as HTMLElement | null;
    expect(homeHeroPromptText()).toBe(PLUGIN_AUTHORING_PROMPT);
    expect(inputCard?.classList.contains('home-hero__input-card--compact-authoring')).toBe(true);
    expect(inputCard?.style.getPropertyValue('--home-hero-prompt-max-height')).toBe('132px');
    fireEvent.click(await screen.findByTestId('home-hero-submit'));
    expect(onSubmit).not.toHaveBeenCalled();

    resolveApply(new Response(JSON.stringify(AUTHORING_APPLY_RESULT), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    await waitFor(() => {
      expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: 'od-plugin-authoring',
      appliedPluginSnapshotId: 'snap-authoring',
    }));
  });
});

// An empty Lexical editor renders `<p><br></p>` (a placeholder break node), so
// the DOM serializer in `homeHeroPromptText()` reads that lone `<br>` back as
// `'\n'`. The editor's real text is empty — `.textContent` is `''` — so this
// reads the empty case precisely without weakening the genuine-content path.
function homeHeroPromptValue(): string {
  const text = homeHeroPromptText();
  if (text === '\n' && (screen.getByTestId('home-hero-input').textContent ?? '') === '') {
    return '';
  }
  return text;
}

// Replace the Lexical editor's text the way a user edit would, then let the
// editor's OnChange → host `onPromptChange` React state update flush a
// microtask (mirrors lexical-composer's `typeAndSettle`) so flows that submit
// right after editing read the latest draft.
async function setPromptAndSettle(value: string): Promise<void> {
  setHomeHeroPrompt(value);
  await act(async () => {
    await Promise.resolve();
  });
}

async function clearActiveTypeChip() {
  // Reset the Template selection back to "None" via the dropdown's Clear.
  const trigger = screen.queryByTestId('home-hero-template-trigger');
  if (!trigger) return;
  fireEvent.click(trigger);
  const clear = screen.queryByTestId('home-hero-template-clear');
  if (clear) fireEvent.click(clear);
  fireEvent.keyDown(document, { key: 'Escape' });
}

async function clickHomeShortcut(id: string) {
  const trigger = await screen.findByTestId('home-hero-shortcuts-trigger');
  await waitFor(() => expect((trigger as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByTestId(`home-hero-rail-${id}`));
}

// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID,
  type InstalledPluginRecord,
  type ConnectorDetail,
  type McpServerConfig,
  type SkillSummary,
} from '@open-design/contracts';
import { HomeView } from '../../src/components/HomeView';
import { homeHeroPromptText, setHomeHeroPrompt } from '../helpers/home-hero-lexical';

// HomeHero's prompt input migrated from a <textarea>+highlight overlay to the
// same Lexical contenteditable the project composer uses. The `home-hero-input`
// hook is now a contenteditable <div> with no `.value`, so:
//   - driving text uses `setHomeHeroPrompt(...)` (a real `editor.update`) where
//     the old tests did `fireEvent.change(input, { target: { value } })`.
//   - reading text uses `homeHeroPromptText()` where they read `input.value`.
// Picking from the @-picker still inserts an atomic mention PILL whose literal
// text is `@<token>`, and the editor appends a trailing space — so serialized
// editor text carries that space (the host trims it before submit).

// Settle the Lexical update listener's onChange/onTrigger React state updates
// (they flush a microtask after the discrete editor update) before asserting,
// mirroring the project composer's `typeAndSettle`.
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

const SKILL: SkillSummary = {
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

const DECK_SKILL: SkillSummary = {
  ...SKILL,
  id: 'deck-lab',
  name: 'Deck Lab',
  description: 'Create a focused slide deck.',
  triggers: ['deck', 'slides'],
  mode: 'deck',
  examplePrompt: 'Design a focused investor deck.',
};

const WEB_PROTOTYPE_PLUGIN = makePlugin('example-web-prototype', 'Web Prototype');
const MCP_SERVER: McpServerConfig = {
  id: 'linear',
  label: 'Linear',
  transport: 'stdio',
  enabled: true,
  command: 'npx',
};
const CONNECTOR: ConnectorDetail = {
  id: 'slack',
  name: 'Slack',
  provider: 'Composio',
  category: 'Communication',
  status: 'connected',
  tools: [],
};

function makePlugin(id: string, title: string): InstalledPluginRecord {
  return {
    id,
    title,
    version: '1.0.0',
    sourceKind: 'bundled',
    source: `/tmp/${id}`,
    trust: 'bundled',
    capabilitiesGranted: ['prompt:inject'],
    fsPath: `/tmp/${id}`,
    installedAt: 0,
    updatedAt: 0,
    manifest: {
      name: id,
      title,
      version: '1.0.0',
      description: `${title} fixture`,
      tags: ['fixture'],
      od: {
        kind: 'scenario',
        taskKind: 'new-generation',
        useCase: {
          query: `Hydrated query from ${title}`,
        },
      },
    },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HomeView context picker', () => {
  it('stages pasted files on Home and submits them as first-turn context', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [] }), {
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
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const onSubmit = vi.fn();
    const file = new File(['brief'], 'brief.pdf', { type: 'application/pdf' });

    render(
      <HomeView
        projects={[]}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    const input = await screen.findByTestId('home-hero-input');
    fireEvent.click(screen.getByTestId('home-hero-plus-trigger'));
    expect(screen.getByTestId('composer-plus-attach')).toBeTruthy();
    // Lexical's PastePlugin reads `clipboardData.files` (the old textarea path
    // read `clipboardData.items[].getAsFile()`); the staged-file outcome is
    // identical, only the clipboard shape the handler inspects changed.
    fireEvent.paste(input, {
      clipboardData: {
        files: [file],
        items: [
          {
            kind: 'file',
            getAsFile: () => file,
          },
        ],
      },
    });

    await waitFor(() => expect(screen.getByText('brief.pdf')).toBeTruthy());
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: '',
      pluginId: DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID,
      attachments: [file],
    }));
  });

  it('adds multiple @ plugins as context without applying or hydrating their query', async () => {
    const plugins = [
      makePlugin('chart-plugin', 'Chart Plugin'),
      makePlugin('deck-plugin', 'Deck Plugin'),
    ];
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins }), {
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
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
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
    setHomeHeroPrompt('Build @chart');
    await settle();
    fireEvent.mouseDown(await screen.findByRole('option', { name: /chart plugin/i }));

    // Picking inserts an atomic plugin mention pill (`@Chart Plugin`) plus a
    // trailing space, and stages the plugin as context in HomeView state. The
    // inline pill is now the only on-screen representation of the staged context
    // (the duplicate top context-badge row was removed), so the submit payload
    // below is the authoritative check that the plugin was staged.
    await waitFor(() => {
      expect(homeHeroPromptText().trim()).toBe('Build @Chart Plugin');
    });

    // Re-seed the draft with a fresh `@deck` trigger appended after the first
    // mention (the old test did the equivalent full-value replace). Picking the
    // second plugin reconstructs both mention pills via the host's draft sync.
    setHomeHeroPrompt('Build @Chart Plugin @deck');
    await settle();
    fireEvent.mouseDown(await screen.findByRole('option', { name: /deck plugin/i }));

    await waitFor(() => {
      expect(homeHeroPromptText().trim()).toBe('Build @Chart Plugin @Deck Plugin');
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/apply'))).toBe(false);
    expect(homeHeroPromptText()).not.toContain('Hydrated query');

    fireEvent.click(screen.getByTestId('home-hero-submit'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Build @Chart Plugin @Deck Plugin',
      pluginId: DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID,
      contextPlugins: [
        expect.objectContaining({ id: 'chart-plugin', title: 'Chart Plugin' }),
        expect.objectContaining({ id: 'deck-plugin', title: 'Deck Plugin' }),
      ],
    }));
  });

  it('binds a selected home skill to the created project payload', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [] }), {
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
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const onSubmit = vi.fn();

    render(
      <HomeView
        projects={[]}
        skills={[SKILL]}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await screen.findByTestId('home-hero-input');
    setHomeHeroPrompt('@proto');
    await settle();
    fireEvent.mouseDown(await screen.findByRole('option', { name: /prototype lab/i }));

    await waitFor(() => {
      expect(homeHeroPromptText().trim()).toBe('@Prototype Lab');
      expect(screen.getByTestId('home-hero-active-skill')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('home-hero-submit'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: '@Prototype Lab',
      pluginId: DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID,
      skillId: SKILL.id,
      projectKind: 'prototype',
    }));
  });

  it('clears an active type chip when the user picks a skill (#2972)', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [WEB_PROTOTYPE_PLUGIN] }), {
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
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const onSubmit = vi.fn();

    render(
      <HomeView
        projects={[]}
        skills={[DECK_SKILL, SKILL]}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    fireEvent.click(await screen.findByTestId('home-hero-rail-prototype'));
    await waitFor(() => {
      expect(screen.getByTestId('home-hero-active-type-chip').textContent).toContain('Prototype');
    });

    screen.getByTestId('home-hero-input');
    setHomeHeroPrompt('@deck');
    await settle();
    fireEvent.mouseDown(await screen.findByRole('option', { name: /deck lab/i }));

    await waitFor(() => {
      expect(screen.getByTestId('home-hero-active-skill')).toBeTruthy();
      expect(screen.queryByTestId('home-hero-active-type-chip')).toBeNull();
    });

    fireEvent.click(screen.getByTestId('home-hero-submit'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID,
      skillId: DECK_SKILL.id,
      projectKind: 'deck',
    }));
    expect(onSubmit.mock.calls[0]?.[0]?.pluginId).not.toBe('example-web-prototype');
  });

  it('clears an active skill when the user picks a type chip (#2972)', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [WEB_PROTOTYPE_PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.includes('/apply')) {
        return new Response(JSON.stringify({
          appliedPlugin: {
            snapshotId: 'snap-web-prototype',
            pluginId: 'example-web-prototype',
            pluginVersion: '1.0.0',
            inputs: {},
          },
          contextItems: [],
        }), {
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
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const onSubmit = vi.fn();

    render(
      <HomeView
        projects={[]}
        skills={[SKILL]}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await screen.findByTestId('home-hero-input');
    setHomeHeroPrompt('@proto');
    await settle();
    fireEvent.mouseDown(await screen.findByRole('option', { name: /prototype lab/i }));
    await waitFor(() => {
      expect(screen.getByTestId('home-hero-active-skill')).toBeTruthy();
    });

    fireEvent.click(await screen.findByTestId('home-hero-rail-prototype'));
    await waitFor(() => {
      expect(screen.getByTestId('home-hero-active-type-chip').textContent).toContain('Prototype');
      expect(screen.queryByTestId('home-hero-active-skill')).toBeNull();
    });

    setHomeHeroPrompt('Build a pricing-page prototype.');
    await settle();
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: 'example-web-prototype',
      skillId: null,
      projectKind: 'prototype',
    })));
  });

  it('submits selected MCP servers and connectors as first-turn context', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url === '/api/mcp/servers') {
        return new Response(JSON.stringify({ servers: [MCP_SERVER], templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const onSubmit = vi.fn();

    render(
      <HomeView
        projects={[]}
        connectors={[CONNECTOR]}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await screen.findByTestId('home-hero-input');
    setHomeHeroPrompt('@lin');
    fireEvent.mouseDown(screen.getByRole('option', { name: /linear/i }));

    await waitFor(() => {
      expect(homeHeroPromptText().trim()).toBe('@Linear');
    });

    setHomeHeroPrompt('@Linear @sla');
    fireEvent.mouseDown(screen.getByRole('option', { name: /slack/i }));

    await waitFor(() => {
      expect(homeHeroPromptText().trim()).toBe('@Linear @Slack');
    });

    fireEvent.click(screen.getByTestId('home-hero-submit'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: '@Linear @Slack',
      pluginId: DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID,
      contextMcpServers: [
        expect.objectContaining({ id: 'linear', label: 'Linear', transport: 'stdio' }),
      ],
      contextConnectors: [
        expect.objectContaining({
          id: 'slack',
          name: 'Slack',
          provider: 'Composio',
          category: 'Communication',
          status: 'connected',
        }),
      ],
    }));
  });

  it('keeps a connector context when the prompt has punctuation right after the pill', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [] }), {
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
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const onSubmit = vi.fn();

    render(
      <HomeView
        projects={[]}
        connectors={[CONNECTOR]}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await screen.findByTestId('home-hero-input');
    setHomeHeroPrompt('@sla');
    fireEvent.mouseDown(screen.getByRole('option', { name: /slack/i }));

    await waitFor(() => {
      expect(homeHeroPromptText().trim()).toBe('@Slack');
    });

    // The user types a comma right after the (still-visible) connector pill and
    // keeps writing — the pill was never deleted, so the connector must still be
    // sent. Reconciliation must not drop it just because the serialized text is
    // `@Slack,` rather than `@Slack`.
    setHomeHeroPrompt('Summarize @Slack, then draft follow-ups');
    await settle();

    fireEvent.click(screen.getByTestId('home-hero-submit'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Summarize @Slack, then draft follow-ups',
      pluginId: DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID,
      contextConnectors: [
        expect.objectContaining({ id: 'slack', name: 'Slack' }),
      ],
    }));
  });
});

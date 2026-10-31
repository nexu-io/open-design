// @vitest-environment jsdom
import { useEffect } from 'react';
import { pickHomeTemplate } from '../helpers/home-template-picker';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID,
  type DesignSystemSummary,
  type InstalledPluginRecord,
  type ConnectorDetail,
  type McpServerConfig,
  type SkillSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';

const workspaceA: WorkspaceCollabContext = {
  workspaceId: 'workspace-a',
  workspaceType: 'team',
  workspaceMemberId: 'member-a',
  role: 'member',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'active',
  planId: 'team_plus',
  providerMode: 'platform_credits',
  seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
  permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
};
let workspaceContextState: {
  context: WorkspaceCollabContext | null;
  loading: boolean;
  failure?: 'unsupported';
  identityChangePending?: boolean;
} = { context: workspaceA, loading: false };

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: () => null,
}));

// Team plugin projections load after stream activation. This suite exercises
// context serialization; supply the same readiness signal as a live workspace.
vi.mock('../../src/collab/workspace-events', () => ({
  useWorkspaceInvalidation: (
    _handlers: unknown,
    options?: { onActive?: () => void; enabled?: boolean; workspaceContext?: WorkspaceCollabContext | null },
  ) => {
    const identity = options?.workspaceContext?.workspaceId;
    useEffect(() => {
      if (options?.enabled && identity) options.onActive?.();
    }, [identity, options?.enabled]);
    return { connected: false };
  },
}));

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>();
  return {
    ...actual,
    useWorkspaceContext: () => workspaceContextState,
  };
});

import { HomeView } from '../../src/components/HomeView';
import { HOME_APPLY_TEMPLATE_EVENT } from '../../src/components/home-hero/chips';
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
const WORKSPACE_DESIGN_SYSTEM: DesignSystemSummary = {
  id: 'user:workspace-brand',
  title: 'Workspace Brand',
  category: 'brand',
  summary: 'Workspace-scoped brand system.',
  source: 'user',
  status: 'published',
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
  workspaceContextState = { context: workspaceA, loading: false };
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

// #5517 removed the inline template rail from Home; scenario templates are
// picked from the composer footer's radial Template picker instead.


describe('HomeView context picker', () => {
  it('preserves selected local catalog provenance while Workspace identity transitions', async () => {
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
    const view = render(
      <HomeView
        projects={[]}
        skills={[SKILL]}
        designSystems={[WORKSPACE_DESIGN_SYSTEM]}
        defaultDesignSystemId={WORKSPACE_DESIGN_SYSTEM.id}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
      />,
    );

    await screen.findByTestId('home-hero-input');
    setHomeHeroPrompt('@proto');
    await settle();
    fireEvent.mouseDown(await screen.findByRole('option', { name: /prototype lab/i }));
    await waitFor(() => expect(screen.getByTestId('home-hero-active-skill')).toBeTruthy());

    workspaceContextState = {
      context: null,
      loading: true,
      identityChangePending: true,
    };
    view.rerender(
      <HomeView
        projects={[]}
        skills={[SKILL]}
        skillsLoading
        designSystems={[WORKSPACE_DESIGN_SYSTEM]}
        designSystemsLoading
        defaultDesignSystemId={WORKSPACE_DESIGN_SYSTEM.id}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
      />,
    );
    await waitFor(() => expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      skillId: SKILL.id,
      skillCatalogScope: {
        workspaceId: workspaceA.workspaceId,
        workspaceMemberId: workspaceA.workspaceMemberId,
      },
      designSystemId: WORKSPACE_DESIGN_SYSTEM.id,
      designSystemCatalogScope: {
        workspaceId: workspaceA.workspaceId,
        workspaceMemberId: workspaceA.workspaceMemberId,
      },
    }));
  });

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
    await waitFor(() => expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: '',
      pluginId: DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID,
      attachments: [file],
    }));
  });

  // OPEND-3085: the Home Add menu carries the same rows as the project
  // composer's — the context actions sit flat below "Attach files" and the
  // resource submenus follow, while the working directory keeps its own row
  // under the input instead of a submenu group.
  it('lists the Demo Add-menu rows on Home', async () => {
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

    render(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onBrowseRegistry={() => undefined}
      />,
    );

    await screen.findByTestId('home-hero-input');
    fireEvent.click(screen.getByTestId('home-hero-plus-trigger'));
    const menu = screen.getAllByRole('menu')[0] as HTMLElement;
    const rows = Array.from(
      menu.querySelectorAll<HTMLElement>(
        ':scope > .plus-menu__item, :scope > .plus-menu__submenu-row > .plus-menu__parent',
      ),
    ).map((row) => row.getAttribute('data-testid'));
    expect(rows).toEqual([
      'composer-plus-attach',
      'composer-plus-reference-project',
      'composer-plus-local-code',
      'composer-plus-plugins',
      'composer-plus-figma',
      'composer-plus-connectors',
      'composer-plus-mcp',
    ]);
    expect(screen.queryByTestId('composer-plus-working-dir')).toBeNull();
    // The working directory stays on its own row under the input.
    expect(screen.getByTestId('working-dir-trigger')).toBeTruthy();
  });

  // OPEND-3126: the two context actions are reachable from the Add menu ONLY.
  // The working-directory menu under the input is back to its folder rows, so
  // "Reference another project" and "Link local code" are not offered twice.
  it('keeps reference-project and local-code out of the working-directory menu (OPEND-3126)', async () => {
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

    render(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onBrowseRegistry={() => undefined}
      />,
    );

    await screen.findByTestId('home-hero-input');
    fireEvent.click(screen.getByTestId('working-dir-trigger'));
    const panel = await screen.findByTestId('working-dir-panel');
    expect(screen.getByTestId('working-dir-pick')).toBeTruthy();
    expect(screen.queryByTestId('working-dir-reference-project')).toBeNull();
    expect(screen.queryByTestId('working-dir-local-code')).toBeNull();
    expect(panel.textContent).not.toContain('Reference another project');
    expect(panel.textContent).not.toContain('Link local code');
    // No stray separator either: the panel is one group of folder rows again.
    expect(panel.querySelector('[role="separator"]')).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });

    // …and the Add menu still carries both, unchanged.
    fireEvent.click(screen.getByTestId('home-hero-plus-trigger'));
    expect(screen.getByTestId('composer-plus-reference-project')).toBeTruthy();
    expect(screen.getByTestId('composer-plus-local-code')).toBeTruthy();
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

    await waitFor(() => expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false));
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

    await waitFor(() => expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: '@Prototype Lab',
      pluginId: DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID,
      skillId: SKILL.id,
      projectKind: 'prototype',
    }));
  });

  it('keeps the active type chip when the user picks a skill (#2972)', async () => {
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
      />,
    );

    await pickHomeTemplate('prototype');
    await waitFor(() => {
      expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Prototype');
    });

    screen.getByTestId('home-hero-input');
    setHomeHeroPrompt('@deck');
    await settle();
    fireEvent.mouseDown(await screen.findByRole('option', { name: /deck lab/i }));

    await waitFor(() => {
      expect(screen.getByTestId('home-hero-active-skill')).toBeTruthy();
    });
    // #2972 asked for a defined, explainable rule when the prompt's intent and
    // the picked card disagree. The rule used to be "the Skill wins, drop the
    // card", which routed a user who picked Prototype into a deck project
    // behind their back. The task type now owns the route and the Skill rides
    // along inside it, so the answer to the conflict is "both survive" — the
    // strategy's own conflict order ranks the user-selected Skill above its
    // task-type Skill in the prompt.
    expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Prototype');

    await waitFor(() => expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: null,
      automaticStrategyTaskProfile: 'prototype',
      skillId: DECK_SKILL.id,
      projectKind: 'prototype',
    }));
    expect(onSubmit.mock.calls[0]?.[0]?.pluginId).not.toBe('example-web-prototype');
  });

  it('hands a supported automatic type entirely to OD Next without applying its legacy plugin', async () => {
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
        skills={[SKILL]}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
      />,
    );

    await screen.findByTestId('home-hero-input');
    setHomeHeroPrompt('@proto');
    await settle();
    fireEvent.mouseDown(await screen.findByRole('option', { name: /prototype lab/i }));
    await waitFor(() => {
      expect(screen.getByTestId('home-hero-active-skill')).toBeTruthy();
    });

    await pickHomeTemplate('prototype');
    await waitFor(() => {
      expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Prototype');
      // The mention the user typed is still in their prompt, so the Skill it
      // named stays selected too — picking a task type decides the route, not
      // what material the turn carries.
      expect(screen.getByTestId('home-hero-active-skill')).toBeTruthy();
    });

    setHomeHeroPrompt('Build a pricing-page prototype.');
    await settle();
    await waitFor(() => expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: null,
      pluginSelectionProvenance: 'automatic-default',
      automaticStrategyTaskProfile: 'prototype',
      skillId: SKILL.id,
      projectKind: 'prototype',
      appliedPluginSnapshotId: null,
      pluginTitle: null,
      taskKind: null,
    })));
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('pluginSource');
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('pluginInputs');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/apply'))).toBe(false);
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

    await waitFor(() => expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false));
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

  it('blocks submit when referenced project context folder is missing', async () => {
    const referenceProject = {
      id: 'reference-a',
      name: 'Reference A',
      skillId: null,
      designSystemId: null,
      createdAt: 1,
      updatedAt: 1,
      metadata: { kind: 'prototype' },
    };
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
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
      // These cases render HomeView with an active Workspace context, so the
      // reference-project picker reads the workspace-scoped catalog. The
      // unscoped `/api/projects` route only ever serves unbound projects
      // (OPEND-2370), which is why it cannot stand in for this one.
      if (typeof url === 'string' && url.startsWith('/api/workspaces/workspace-a/projects')) {
        return new Response(JSON.stringify({
          projects: [
            { project: referenceProject, workspaceId: 'workspace-a', visibility: 'personal' },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url === '/api/projects') {
        return new Response(JSON.stringify({ projects: [referenceProject] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && (url === '/api/projects/reference-a' || url.startsWith('/api/projects/reference-a?'))) {
        return new Response(JSON.stringify({
          project: referenceProject,
          resolvedDir: '/tmp/open-design/missing-reference-a',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url === '/api/dir-exists' && init?.method === 'POST') {
        return new Response(JSON.stringify({ exists: false }), {
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
      />,
    );

    await screen.findByTestId('home-hero-input');
    // 引用其它项目 lives in the "+" menu only (OPEND-3126); the pick still
    // lands on the working-directory trigger below.
    fireEvent.click(screen.getByTestId('home-hero-plus-trigger'));
    fireEvent.click(await screen.findByTestId('composer-plus-reference-project'));
    await screen.findByText('Reference A');
    fireEvent.click(screen.getByRole('button', { name: 'Reference project' }));

    // The TRIGGER takes the reference's name and the prompt is left alone (per
    // product: 工作目录会换成后边的文件名，不要在上边的输入框展示).
    await waitFor(() => {
      expect(screen.getByTestId('working-dir-trigger').textContent).toContain('Reference A');
    });
    expect(homeHeroPromptText().trim()).toBe('');
    // A reference on its own is not a request; type first, then submit.
    setHomeHeroPrompt('Describe this');
    await settle();
    await waitFor(() => expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('selected reference folder');
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(homeHeroPromptText().trim()).toBe('Describe this');
    expect(screen.getByTestId('working-dir-trigger').textContent).toContain('Reference A');
  });

  it('keeps referenced project context visible after its inline mention is deleted', async () => {
    const referenceProject = {
      id: 'reference-a',
      name: 'Reference A',
      skillId: null,
      designSystemId: null,
      createdAt: 1,
      updatedAt: 1,
      metadata: { kind: 'prototype' },
    };
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
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
      // These cases render HomeView with an active Workspace context, so the
      // reference-project picker reads the workspace-scoped catalog. The
      // unscoped `/api/projects` route only ever serves unbound projects
      // (OPEND-2370), which is why it cannot stand in for this one.
      if (typeof url === 'string' && url.startsWith('/api/workspaces/workspace-a/projects')) {
        return new Response(JSON.stringify({
          projects: [
            { project: referenceProject, workspaceId: 'workspace-a', visibility: 'personal' },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url === '/api/projects') {
        return new Response(JSON.stringify({ projects: [referenceProject] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && (url === '/api/projects/reference-a' || url.startsWith('/api/projects/reference-a?'))) {
        return new Response(JSON.stringify({
          project: referenceProject,
          resolvedDir: '/tmp/open-design/reference-a',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url === '/api/dir-exists' && init?.method === 'POST') {
        return new Response(JSON.stringify({ exists: true }), {
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
      />,
    );

    await screen.findByTestId('home-hero-input');
    // 引用其它项目 lives in the "+" menu only (OPEND-3126); the pick still
    // lands on the working-directory trigger below.
    fireEvent.click(screen.getByTestId('home-hero-plus-trigger'));
    fireEvent.click(await screen.findByTestId('composer-plus-reference-project'));
    await screen.findByText('Reference A');
    fireEvent.click(screen.getByRole('button', { name: 'Reference project' }));

    // Nothing lands in the prompt — the working-directory trigger is the only
    // place the reference shows, exactly like a picked folder.
    await waitFor(() => {
      expect(screen.getByTestId('working-dir-trigger').textContent).toContain('Reference A');
    });
    expect(homeHeroPromptText()).not.toContain('@Reference A');
    setHomeHeroPrompt('Describe this');
    await settle();

    expect(screen.getByTestId('working-dir-trigger').textContent).toContain('Reference A');
    await waitFor(() => expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Describe this',
      initialRunContext: {
        workspaceItems: [
          expect.objectContaining({
            id: 'project:reference-a',
            kind: 'project',
            label: 'Reference A',
            absolutePath: '/tmp/open-design/reference-a',
          }),
        ],
      },
      linkedDirs: ['/tmp/open-design/reference-a'],
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

    await waitFor(() => expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false));
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

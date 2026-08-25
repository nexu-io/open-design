// @vitest-environment jsdom

import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryShell } from '../../src/components/EntryShell';
import {
  AMR_LOGIN_POLL_INTERVAL_MS,
  AMR_LOGIN_STATUS_EVENT,
  AMR_LOGIN_TIMEOUT_MS,
} from '../../src/components/amrLoginPolling';
import { I18nProvider } from '../../src/i18n';
import { fetchProjectFiles } from '../../src/providers/registry';
import type { AgentInfo, AppConfig } from '../../src/types';
import { setHomeHeroPrompt } from '../helpers/home-hero-lexical';

const analyticsMocks = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return {
    ...actual,
    useAnalytics: () => ({
      newRequestId: vi.fn(() => 'request-1'),
      setConfigureGlobals: vi.fn(),
      setConsent: vi.fn(),
      setIdentity: vi.fn(),
      track: analyticsMocks.track,
    }),
    useAppVersion: () => null,
  };
});

const originalFetch = globalThis.fetch;
const originalResizeObserver = globalThis.ResizeObserver;

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function amrAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'amr',
    name: 'AMR',
    bin: 'amr',
    available: true,
    models: [{ id: 'amr-model', label: 'AMR Model' }],
    ...overrides,
  };
}

function cliAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'claude-code',
    name: 'Claude Code',
    bin: 'claude',
    available: true,
    version: '1.0.0',
    models: [{ id: 'sonnet', label: 'Sonnet' }],
    ...overrides,
  };
}

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    mode: 'daemon',
    agentId: null,
    agentModels: {},
    apiProtocol: 'anthropic',
    apiProtocolConfigs: {},
    apiKey: '',
    baseUrl: '',
    model: '',
    ...overrides,
  } as AppConfig;
}

function renderOnboarding(
  overrides: Partial<React.ComponentProps<typeof EntryShell>> = {},
) {
  window.history.replaceState(null, '', '/onboarding');
  const props: React.ComponentProps<typeof EntryShell> = {
    skills: [],
    designTemplates: [],
    designSystems: [],
    projects: [],
    templates: [],
    promptTemplates: [],
    defaultDesignSystemId: null,
    connectors: [],
    connectorsLoading: false,
    config: baseConfig(),
    agents: [amrAgent(), cliAgent()],
    daemonLive: true,
    onModeChange: vi.fn(),
    onAgentChange: vi.fn(),
    onAgentModelChange: vi.fn(),
    onApiProtocolChange: vi.fn(),
    onApiModelChange: vi.fn(),
    onConfigPersist: vi.fn(),
    onRefreshAgents: vi.fn(() => [amrAgent(), cliAgent()]),
    onCreateProject: vi.fn(),
    onCreatePluginShareProject: vi.fn(),
    onImportClaudeDesign: vi.fn(),
    onOpenProject: vi.fn(),
    onOpenLiveArtifact: vi.fn(),
    onDeleteProject: vi.fn(),
    onRenameProject: vi.fn(),
    onChangeDefaultDesignSystem: vi.fn(),
    onPersistComposioKey: vi.fn(),
    onOpenSettings: vi.fn(),
    onCompleteOnboarding: vi.fn(),
    ...overrides,
  };

  function Harness() {
    const [config, setConfig] = useState(props.config);
    return (
      <I18nProvider initial="en">
        <EntryShell
          {...props}
          config={config}
          onConfigPersist={(next) => {
            props.onConfigPersist(next);
            setConfig(next as AppConfig);
          }}
        />
      </I18nProvider>
    );
  }

  render(
    <Harness />,
  );

  return props;
}

function renderHome(
  overrides: Partial<React.ComponentProps<typeof EntryShell>> = {},
  path = '/',
) {
  window.history.replaceState(null, '', path);
  const props: React.ComponentProps<typeof EntryShell> = {
    skills: [],
    designTemplates: [],
    designSystems: [],
    projects: [],
    templates: [],
    promptTemplates: [],
    defaultDesignSystemId: null,
    connectors: [],
    connectorsLoading: false,
    config: baseConfig({
      agentId: 'claude-code',
      agentModels: { 'claude-code': { model: 'sonnet' } },
    }),
    agents: [cliAgent()],
    daemonLive: true,
    onModeChange: vi.fn(),
    onAgentChange: vi.fn(),
    onAgentModelChange: vi.fn(),
    onApiProtocolChange: vi.fn(),
    onApiModelChange: vi.fn(),
    onConfigPersist: vi.fn(),
    onRefreshAgents: vi.fn(() => [cliAgent()]),
    onCreateProject: vi.fn(),
    onCreatePluginShareProject: vi.fn(),
    onImportClaudeDesign: vi.fn(),
    onOpenProject: vi.fn(),
    onOpenLiveArtifact: vi.fn(),
    onDeleteProject: vi.fn(),
    onRenameProject: vi.fn(),
    onChangeDefaultDesignSystem: vi.fn(),
    onPersistComposioKey: vi.fn(),
    onOpenSettings: vi.fn(),
    onCompleteOnboarding: vi.fn(),
    ...overrides,
  };

  render(
    <I18nProvider initial="en">
      <EntryShell {...props} />
    </I18nProvider>,
  );

  return props;
}

function trackedEvents(name: string) {
  return analyticsMocks.track.mock.calls.filter(([eventName]) => eventName === name);
}

function latestTrackedEvent<T extends Record<string, unknown>>(name: string): T {
  const calls = trackedEvents(name);
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1]?.[1] as T;
}

function findTrackedEvent<T extends Record<string, unknown>>(
  name: string,
  predicate: (payload: T) => boolean,
): T {
  const payload = trackedEvents(name)
    .map(([, eventPayload]) => eventPayload as T)
    .find(predicate);
  expect(payload).toBeTruthy();
  return payload as T;
}

function chooseOnboardingOption(label: string, option: string | RegExp) {
  const chipField = screen
    .getAllByText(label)
    .map((node) => node.closest('.onboarding-chip-field'))
    .find((node): node is HTMLElement => node instanceof HTMLElement);
  if (chipField) {
    const matcher = option instanceof RegExp ? option : new RegExp(option, 'i');
    const chip = Array.from(chipField.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      matcher.test(button.textContent ?? ''),
    );
    if (!(chip instanceof HTMLButtonElement)) {
      throw new Error(`profile chip not found: ${label} / ${String(option)}`);
    }
    fireEvent.click(chip);
    return;
  }

  const dropdownField = screen
    .getAllByText(label)
    .map((node) => node.closest('.onboarding-view__select-field'))
    .find((node): node is HTMLElement => node instanceof HTMLElement);
  if (!dropdownField) throw new Error(`profile field not found: ${label}`);
  const trigger = dropdownField.querySelector('button');
  if (!(trigger instanceof HTMLButtonElement)) {
    throw new Error(`profile field trigger not found: ${label}`);
  }
  fireEvent.click(trigger);
  fireEvent.click(
    screen.getByRole('option', {
      name: option instanceof RegExp ? option : new RegExp(option, 'i'),
    }),
  );
}

async function clickSignedInCloudContinue() {
  const continueButton = await screen.findByRole('button', { name: /Continue \(signed in\)/i });
  fireEvent.click(continueButton);
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Choose your model source' })).toBeTruthy();
  });
}

async function clickCloudSignIn() {
  const signIn = await findCloudSignInButton();
  fireEvent.click(signIn);
  return signIn;
}

async function findCloudSignInButton() {
  return screen.findByRole('button', { name: /Sign in to OpenDesign/i });
}

async function openLocalRuntimeSetup() {
  await clickSignedInCloudContinue();
  fireEvent.click(screen.getByRole('radio', { name: /Local Agent/i }));
  fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
  expect(await screen.findByText('Local CLI')).toBeTruthy();
}

async function openByokRuntimeSetup() {
  await clickSignedInCloudContinue();
  fireEvent.click(screen.getByRole('radio', { name: /Bring Your Own Key/i }));
  fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
  expect(await screen.findByRole('heading', { name: 'Bring Your Own Key' })).toBeTruthy();
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  globalThis.ResizeObserver = originalResizeObserver;
  vi.useRealTimers();
  analyticsMocks.track.mockReset();
  window.sessionStorage.clear();
});

beforeEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  analyticsMocks.track.mockReset();
});

describe('EntryShell settings menu', () => {
  it('opens settings from the signed-out rail without duplicating the footer action', async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.endsWith('/api/community/discord')) {
        return jsonResponse({
          inviteCode: 'mHAjSMV6gz',
          inviteUrl: 'https://discord.gg/mHAjSMV6gz',
          onlineCount: 1234,
          memberCount: 4321,
          fetchedAt: Date.now(),
          stale: false,
        });
      }
      if (url.endsWith('/api/github/open-design')) {
        return jsonResponse({
          repo: 'nexu-io/open-design',
          stargazers_count: 56100,
          fetchedAt: Date.now(),
          stale: false,
        });
      }
      return jsonResponse({});
    }) as typeof fetch;
    const props = renderHome();

    // The signed-out rail's own settings item (below 扩展) is the single
    // settings entry — the #5517 footer carries none.
    fireEvent.click(await screen.findByTestId('entry-settings-button'));

    expect(props.onOpenSettings).toHaveBeenCalledWith();
    expect(screen.getAllByTestId('entry-settings-button')).toHaveLength(1);
  });
});

describe('EntryShell navigation shortcuts', () => {
  afterEach(() => {
    window.localStorage.removeItem('od.entry.railOpen');
  });

  it('leaves the rail unchanged when the composer owns Cmd/Ctrl+B', async () => {
    window.localStorage.setItem('od.entry.railOpen', 'false');
    renderHome();

    const entry = document.querySelector('.entry');
    expect(entry).toBeInstanceOf(HTMLElement);
    expect(entry?.classList.contains('entry--rail-open')).toBe(false);

    const editor = await screen.findByTestId('home-hero-input');
    fireEvent.keyDown(editor, {
      key: 'b',
      ...(/Mac|iPod|iPhone|iPad/.test(navigator.platform)
        ? { metaKey: true }
        : { ctrlKey: true }),
    });

    expect(entry?.classList.contains('entry--rail-open')).toBe(false);
  });
});

describe('EntryShell design systems view', () => {
  it('leaves workspace-scoped design-system activation to the mounted tab', async () => {
    const onDesignSystemsRefresh = vi.fn();
    renderHome({ onDesignSystemsRefresh }, '/design-systems');

    expect(await screen.findByTestId('entry-view-design-systems')).toHaveAttribute(
      'data-active',
      'true',
    );
    // DesignSystemsTab owns its Team SSE activation and fallback snapshot.
    // Calling the App-level catalog refresh here as well creates a duplicate,
    // differently-scoped request every time the route becomes active.
    expect(onDesignSystemsRefresh).not.toHaveBeenCalled();
  });
});

describe('EntryShell route scroll isolation', () => {
  afterEach(() => {
    window.localStorage.removeItem('od.entry.railOpen');
  });

  function entryScrollContainer(): HTMLElement {
    const scrollContainer = document.querySelector('.entry-main--scroll');
    expect(scrollContainer).toBeInstanceOf(HTMLElement);
    if (!(scrollContainer instanceof HTMLElement)) {
      throw new Error('entry scroll container not found');
    }
    return scrollContainer;
  }

  // #5517 reshaped the rail: the flat `entry-nav-projects` button is gone, and
  // its Drafts / All-projects replacements only mount under a workspace
  // context this render has none of. Design systems is the nearest rail
  // destination that survives in every state, and the reset it exercises is the
  // same shared `.entry-main--scroll` element, so the spec's subject is intact.
  it('resets the shared scroll offset when navigating away from Home', async () => {
    window.localStorage.setItem('od.entry.railOpen', 'true');
    renderHome();

    const scrollContainer = entryScrollContainer();
    scrollContainer.scrollTop = 280;
    fireEvent.click(screen.getByTestId('entry-nav-design-systems'));

    await waitFor(() => {
      expect(
        screen.getByTestId('entry-view-design-systems').getAttribute('data-active'),
      ).toBe('true');
    });
    expect(scrollContainer.scrollTop).toBe(0);
  });

  it('resets the shared scroll offset when navigating from Projects to Home', async () => {
    window.localStorage.setItem('od.entry.railOpen', 'true');
    renderHome({}, '/projects');

    const scrollContainer = entryScrollContainer();
    scrollContainer.scrollTop = 360;
    fireEvent.click(screen.getByTestId('entry-nav-home'));

    await waitFor(() => {
      expect(screen.getByTestId('entry-view-home').getAttribute('data-active')).toBe('true');
    });
    expect(scrollContainer.scrollTop).toBe(0);
  });
});

describe('EntryShell project reopen request priority', () => {
  it('aborts Home cover work, keeps hidden Projects idle, and lets the foreground files read finish', async () => {
    const files = [{
      name: 'index.html',
      path: 'index.html',
      kind: 'html' as const,
      mtime: 1,
      size: 1,
      mime: 'text/html',
    }];
    const fileRequests: Array<RequestInit | undefined> = [];
    const fetchMock = vi.fn(
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
        if (url === '/api/projects/project-reopen/files') {
          // Single-flight (`lib/shared-cancellable-get`) gives every `/files`
          // reader — cancellable or not — one shared request carrying the
          // shared AbortSignal, so "is this the background scan?" is the
          // request ordinal, not the presence of a signal. Request #1 is
          // Home's cover scan and must hang until it is aborted; the
          // foreground read that follows it must be answered.
          const isBackgroundCoverScan = fileRequests.length === 0;
          fileRequests.push(init);
          if (isBackgroundCoverScan) {
            return new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener(
                'abort',
                () => reject(new DOMException('Aborted', 'AbortError')),
                { once: true },
              );
            });
          }
          return jsonResponse({ files });
        }
        if (url.includes('/api/live-artifacts?projectId=project-reopen')) {
          return jsonResponse({ liveArtifacts: [] });
        }
        if (url.endsWith('/api/community/discord')) {
          return jsonResponse({
            inviteCode: 'mHAjSMV6gz',
            inviteUrl: 'https://discord.gg/mHAjSMV6gz',
            onlineCount: 0,
            memberCount: 0,
            fetchedAt: Date.now(),
            stale: false,
          });
        }
        if (url.endsWith('/api/github/open-design')) {
          return jsonResponse({
            repo: 'nexu-io/open-design',
            stargazers_count: 0,
            fetchedAt: Date.now(),
            stale: false,
          });
        }
        return jsonResponse({});
      },
    );
    globalThis.fetch = fetchMock as typeof fetch;
    const onOpenProject = vi.fn((projectId: string) => {
      expect(projectId).toBe('project-reopen');
      // App leaves EntryShell when it opens ProjectView. Model that boundary
      // directly so the mounted Home strip must cancel its background probe.
      cleanup();
    });

    renderHome({
      projects: [{
        id: 'project-reopen',
        name: 'Reopen project',
        skillId: null,
        designSystemId: null,
        createdAt: 1,
        updatedAt: 2,
        status: { value: 'not_started' },
      }],
      onOpenProject,
    });

    await waitFor(() => expect(fileRequests).toHaveLength(1));
    const homeSignal = fileRequests[0]?.signal;
    expect(homeSignal).toBeDefined();
    // DesignsTab is mounted under EntryShell's hidden Projects pane, but its
    // own background files/live-artifact scans must remain dormant.
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).includes('/api/live-artifacts?projectId=project-reopen'),
      ),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /Reopen project/ }));

    expect(onOpenProject).toHaveBeenCalledTimes(1);
    expect(homeSignal?.aborted).toBe(true);
    await expect(fetchProjectFiles('project-reopen')).resolves.toEqual(files);
    expect(fileRequests).toHaveLength(2);
    // The foreground read must own a live request of its own: it neither joins
    // the abandoned scan's dead entry nor inherits its aborted signal.
    const foregroundSignal = fileRequests[1]?.signal;
    expect(foregroundSignal).toBeDefined();
    expect(foregroundSignal).not.toBe(homeSignal);
    expect(foregroundSignal?.aborted).toBe(false);
  });
});

describe('EntryShell new project rail', () => {
  // The rail's "+ New project" button (`entry-nav-new-project`) is gone in
  // #5517's rail: `EntryShell` still passes `onNewProject` — with its
  // `new_project_plus` ui_click — to `EntryNavRail`, but the rail never renders
  // a control that calls it, so the button and that analytics event are both
  // unreachable. The spec that drove it is therefore removed; opening the
  // new-project modal is still covered by the Projects-view CTA below, which is
  // the surviving entry point.

  it('opens the new project modal from the Projects view new-project button', async () => {
    const fetchMock = vi.fn(
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url === '/api/projects' && init?.method === 'POST') {
          return jsonResponse({
            project: {
              id: 'blank-project-from-projects',
              name: 'Untitled',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            conversationId: 'conversation-2',
          });
        }
        if (url.endsWith('/api/projects/project-existing/files')) {
          return jsonResponse({ files: [] });
        }
        if (url.endsWith('/api/live-artifacts?projectId=project-existing')) {
          return jsonResponse({ liveArtifacts: [] });
        }
        if (url.endsWith('/api/community/discord')) {
          return jsonResponse({
            inviteCode: 'mHAjSMV6gz',
            inviteUrl: 'https://discord.gg/mHAjSMV6gz',
            onlineCount: 0,
            memberCount: 0,
            fetchedAt: Date.now(),
            stale: false,
          });
        }
        if (url.endsWith('/api/github/open-design')) {
          return jsonResponse({
            repo: 'nexu-io/open-design',
            stargazers_count: 0,
            fetchedAt: Date.now(),
            stale: false,
          });
        }
        return jsonResponse({});
      });
    globalThis.fetch = fetchMock as typeof fetch;
    // Start directly on the Projects view (/projects). The nav rail no longer
    // has a single "Projects" button — the projects list is its own route,
    // reachable via /projects or Home's "view all" — so drive the DesignsTab's
    // own new-project CTA rather than a removed rail button.
    const props = renderHome({
      projects: [
        {
          id: 'project-existing',
          name: 'Existing project',
          skillId: null,
          designSystemId: null,
          createdAt: 1,
          updatedAt: 2,
          status: { value: 'not_started' },
        },
      ],
    }, '/projects');

    fireEvent.click(screen.getByTestId('designs-new-project'));

    await waitFor(() => {
      expect(screen.getByTestId('new-project-modal')).toBeTruthy();
    });
    expect(screen.getByTestId('new-project-panel')).toBeTruthy();
    expect(props.onOpenProject).not.toHaveBeenCalled();
    expect(props.onCreateProject).not.toHaveBeenCalled();
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) => input === '/api/projects' && init?.method === 'POST',
    );
    expect(createCall).toBeUndefined();
    expect(analyticsMocks.track).toHaveBeenCalledWith(
      'ui_click',
      expect.objectContaining({
        page_name: 'projects',
        area: 'list_controls',
        element: 'create_project',
      }),
      undefined,
    );
  });

  it('does not persist the modal hidden default Skill on an automatic OD Next route', async () => {
    const onCreateProject = vi.fn(() => true);
    renderHome({
      skills: [{
        id: 'agent-browser',
        name: 'agent-browser',
        description: 'Inspect rendered prototypes',
        mode: 'prototype',
        surface: 'web',
        previewType: 'html',
        designSystemRequired: true,
        defaultFor: ['prototype'],
        triggers: [],
        upstream: null,
        hasBody: true,
        examplePrompt: '',
        aggregatesExamples: false,
      }],
      projects: [{
        id: 'project-existing',
        name: 'Existing project',
        skillId: null,
        designSystemId: null,
        createdAt: 1,
        updatedAt: 2,
        status: { value: 'not_started' },
      }],
      onCreateProject,
    }, '/projects');

    fireEvent.click(screen.getByTestId('designs-new-project'));
    await screen.findByTestId('new-project-panel');
    fireEvent.click(screen.getByTestId('create-project'));

    await waitFor(() => expect(onCreateProject).toHaveBeenCalledTimes(1));
    expect(onCreateProject).toHaveBeenCalledWith(expect.objectContaining({
      skillId: null,
      metadata: expect.objectContaining({ kind: 'prototype' }),
    }));
  });
});

describe('EntryShell Home submit handoff', () => {
  it('keeps the Home run button in sending state until project creation resolves', async () => {
    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.endsWith('/api/plugins')) return jsonResponse({ plugins: [] });
      if (url.endsWith('/api/mcp/servers')) return jsonResponse({ servers: [] });
      if (url.endsWith('/api/community/discord')) return jsonResponse({ stale: true });
      if (url.endsWith('/api/github/open-design')) return jsonResponse({ stale: true });
      return jsonResponse({});
    }) as typeof fetch;
    let resolveCreate: (accepted: boolean) => void = () => undefined;
    const onCreateProject = vi.fn(
      (_input: { pluginId?: string }) => new Promise<boolean>((resolve) => { resolveCreate = resolve; }),
    );
    renderHome({ onCreateProject });

    await screen.findByTestId('home-hero-input');
    setHomeHeroPrompt('Build a landing page');
    const submit = await screen.findByTestId('home-hero-submit') as HTMLButtonElement;
    fireEvent.click(submit);

    await waitFor(() => expect(onCreateProject).toHaveBeenCalledTimes(1));
    expect(onCreateProject).toHaveBeenCalledWith(expect.objectContaining({
      pendingPrompt: 'Build a landing page',
      conversationMode: 'design',
    }));
    // HomeView's hidden default-router identity is provenance, not an
    // explicit user plugin choice on the public create contract.
    expect(onCreateProject.mock.calls[0]?.[0]?.pluginId).toBeUndefined();
    expect(submit.disabled).toBe(true);
    // #5517: the submit is icon-only (spinner while sending) — assert the
    // busy state through aria instead of the removed label text.
    expect(submit.getAttribute('aria-busy')).toBe('true');

    resolveCreate(true);
    await waitFor(() => expect(submit.disabled).toBe(false));
  });
});

describe('EntryShell onboarding OpenDesign AMR runtime', () => {
  it('gates Home on an authoritative signed-out Cloud session without clearing saved setup', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', configPath: '/x', user: null }),
    ) as typeof fetch;
    const config = baseConfig({
      onboardingCompleted: true,
      mode: 'daemon',
      agentId: 'amr',
      model: 'claude-opus-4-5',
    });
    const props = renderHome({ config, amrLoggedIn: false });

    expect(
      await screen.findByRole('heading', { name: 'Sign in to OpenDesign' }),
    ).toBeTruthy();
    expect(window.location.pathname).toBe('/onboarding');
    expect(props.onConfigPersist).not.toHaveBeenCalled();
    expect(props.onModeChange).not.toHaveBeenCalled();
    expect(props.onAgentChange).not.toHaveBeenCalled();
  });

  it.each([
    ['Local CLI', baseConfig({ mode: 'daemon', agentId: 'claude-code' })],
    ['BYOK', baseConfig({
      mode: 'api',
      agentId: 'amr',
      apiKey: 'persisted-key',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
    })],
  ])('keeps Home available for signed-out %s execution', async (_label, config) => {
    globalThis.fetch = vi.fn(async () => jsonResponse({})) as typeof fetch;

    renderHome({ config, amrLoggedIn: false });

    expect(await screen.findByTestId('home-hero-input')).toBeTruthy();
    expect(window.location.pathname).toBe('/');
    expect(
      screen.queryByRole('heading', { name: 'Sign in to OpenDesign' }),
    ).toBeNull();
  });

  it('shows the model-source chooser after Cloud sign-in without exposing legacy onboarding steps', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        loggedIn: true,
        profile: 'prod',
        configPath: '/x',
        user: { id: 'u', email: 'user@example.com' },
      }),
    ) as typeof fetch;
    renderOnboarding();

    fireEvent.click(
      await screen.findByRole('button', { name: /Continue \(signed in\)/i }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Choose your model source' }),
    ).toBeTruthy();
    expect(screen.getByRole('radio', { name: /OpenDesign Hosted/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Local Agent/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Bring Your Own Key/i })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'About you' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Stay in the loop' })).toBeNull();
    expect(
      screen.queryByRole('heading', { name: 'Create once, build everywhere' }),
    ).toBeNull();
  });

  it('supports arrow-key selection and focus within the model-source radio group', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        loggedIn: true,
        profile: 'prod',
        configPath: '/x',
        user: { id: 'u', email: 'user@example.com' },
      }),
    ) as typeof fetch;
    renderOnboarding();

    fireEvent.click(
      await screen.findByRole('button', { name: /Continue \(signed in\)/i }),
    );
    const hosted = await screen.findByRole('radio', { name: /OpenDesign Hosted/i });
    const local = screen.getByRole('radio', { name: /Local Agent/i });
    hosted.focus();
    fireEvent.keyDown(hosted, { key: 'ArrowDown' });

    expect(local.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(local);
    fireEvent.keyDown(local, { key: 'ArrowUp' });
    expect(hosted.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(hosted);
  });

  it('completes Hosted onboarding once with model-source analytics', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        loggedIn: true,
        profile: 'prod',
        configPath: '/x',
        user: { id: 'u', email: 'user@example.com' },
      }),
    ) as typeof fetch;
    const props = renderOnboarding();

    fireEvent.click(
      await screen.findByRole('button', { name: /Continue \(signed in\)/i }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /^Continue$/i }));

    await waitFor(() => {
      expect(props.onCompleteOnboarding).toHaveBeenCalledTimes(1);
    });
    expect(props.onModeChange).toHaveBeenCalledWith('daemon');
    expect(props.onAgentChange).toHaveBeenCalledWith('amr');
    expect(
      findTrackedEvent<Record<string, unknown>>(
        'ui_click',
        (payload) => payload.element === 'amr_cloud',
      ),
    ).toMatchObject({
      area: 'model_source',
      action: 'select_runtime',
      step_index: '2',
      step_name: 'model_source',
      runtime_type: 'amr_cloud',
      is_recommended: true,
    });
    expect(latestTrackedEvent('onboarding_complete_result')).toMatchObject({
      result: 'completed',
      exit_step_name: 'model_source',
      completion_type: 'completed_without_design_system',
      runtime_type: 'amr_cloud',
      has_about_you: false,
      has_design_system_request: false,
      source_count: 0,
    });
    expect(trackedEvents('onboarding_complete_result')).toHaveLength(1);
  });

  it('resumes a completed setup after passive reauthentication without changing its model source', async () => {
    const onAmrLoginStatusChange = vi.fn();
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        loggedIn: true,
        profile: 'prod',
        configPath: '/x',
        user: { id: 'u', email: 'user@example.com' },
      }),
    ) as typeof fetch;
    const props = renderOnboarding({
      config: baseConfig({
        onboardingCompleted: true,
        mode: 'api',
        apiKey: 'persisted-key',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
      }),
      onAmrLoginStatusChange,
    });

    await waitFor(() => {
      expect(props.onCompleteOnboarding).toHaveBeenCalledTimes(1);
    });
    expect(props.onModeChange).not.toHaveBeenCalled();
    expect(props.onAgentChange).not.toHaveBeenCalled();
    expect(onAmrLoginStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ loggedIn: true }),
    );
    expect(screen.queryByRole('heading', { name: 'Choose your model source' })).toBeNull();
    expect(
      trackedEvents('page_view').filter(([, payload]) =>
        (payload as Record<string, unknown>).page_name === 'onboarding',
      ),
    ).toHaveLength(0);
    expect(trackedEvents('onboarding_complete_result')).toHaveLength(0);
  });

  it('returns a completed but invalid setup to the model-source chooser after sign-in', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        loggedIn: true,
        profile: 'prod',
        configPath: '/x',
        user: { id: 'u', email: 'user@example.com' },
      }),
    ) as typeof fetch;
    const props = renderOnboarding({
      config: baseConfig({
        onboardingCompleted: true,
        mode: 'api',
        apiKey: '',
        baseUrl: '',
        model: '',
      }),
    });

    fireEvent.click(
      await screen.findByRole('button', { name: /Continue \(signed in\)/i }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Choose your model source' }),
    ).toBeTruthy();
    expect(props.onCompleteOnboarding).not.toHaveBeenCalled();
    expect(props.onModeChange).not.toHaveBeenCalled();
    expect(props.onAgentChange).not.toHaveBeenCalled();
  });

  it('tests Local Agent on Continue, stays on failure, and retries on the next click', async () => {
    let testCalls = 0;
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          loggedIn: true,
          profile: 'prod',
          configPath: '/x',
          user: { id: 'u', email: 'user@example.com' },
        });
      }
      if (url.endsWith('/api/test/connection') && init?.method === 'POST') {
        testCalls += 1;
        return testCalls === 1
          ? jsonResponse({
              ok: false,
              kind: 'agent_spawn_failed',
              latencyMs: 12,
              model: 'sonnet',
              agentName: 'Claude Code',
              detail: 'process exited before responding',
            })
          : jsonResponse({
              ok: true,
              kind: 'success',
              latencyMs: 12,
              model: 'sonnet',
              sample: 'pong',
              agentName: 'Claude Code',
            });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    const props = renderOnboarding({
      config: baseConfig({
        agentId: 'claude-code',
        agentModels: { 'claude-code': { model: 'sonnet' } },
      }),
    });

    await openLocalRuntimeSetup();
    const continueButton = screen.getByRole('button', { name: /^Continue$/i });
    expect(continueButton.getAttribute('aria-disabled')).toBeNull();

    fireEvent.click(continueButton);
    expect(await screen.findByText(/Could not start Claude Code/i)).toBeTruthy();
    expect(props.onCompleteOnboarding).not.toHaveBeenCalled();

    fireEvent.click(continueButton);
    await waitFor(() => {
      expect(testCalls).toBe(2);
      expect(props.onCompleteOnboarding).toHaveBeenCalledTimes(1);
    });
    expect(props.onConfigPersist).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'daemon', agentId: 'claude-code' }),
    );
    expect(latestTrackedEvent('onboarding_complete_result')).toMatchObject({
      result: 'completed',
      exit_step_name: 'runtime_setup',
      runtime_type: 'local_cli',
    });
  });

  it('drops a Local Agent validation that lands after the user goes Back', async () => {
    // Continue awaits a network round trip before it persists. Back stays
    // enabled through that wait, so a late success must not resurrect the
    // configuration the user just walked away from.
    let releaseTest: ((value: Response) => void) | undefined;
    let testCalls = 0;
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          loggedIn: true,
          profile: 'prod',
          configPath: '/x',
          user: { id: 'u', email: 'user@example.com' },
        });
      }
      if (url.endsWith('/api/test/connection') && init?.method === 'POST') {
        testCalls += 1;
        return new Promise<Response>((resolve) => {
          releaseTest = resolve;
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const props = renderOnboarding({
      config: baseConfig({
        agentId: 'claude-code',
        agentModels: { 'claude-code': { model: 'sonnet' } },
      }),
    });

    await openLocalRuntimeSetup();
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(testCalls).toBe(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /^Back$/i }));
    expect(await screen.findByRole('radio', { name: /Local Agent/i })).toBeTruthy();

    await act(async () => {
      releaseTest?.(
        jsonResponse({
          ok: true,
          kind: 'success',
          latencyMs: 12,
          model: 'sonnet',
          sample: 'pong',
          agentName: 'Claude Code',
        }),
      );
      await Promise.resolve();
    });

    expect(props.onConfigPersist).not.toHaveBeenCalled();
    expect(props.onCompleteOnboarding).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: /Local Agent/i })).toBeTruthy();
  });

  it('does not auto-select OpenDesign AMR when the AMR runtime is unavailable', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    const props = renderOnboarding({
      agents: [cliAgent()],
      onRefreshAgents: vi.fn(() => [cliAgent()]),
    });

    expect(await screen.findByRole('heading', { name: 'Sign in to OpenDesign' })).toBeTruthy();
    expect(await findCloudSignInButton()).toBeTruthy();
    expect(screen.queryByRole('button', { name: /OpenDesign AMR/i })).toBeNull();

    await waitFor(() => {
      expect(props.onAgentChange).not.toHaveBeenCalledWith('amr');
    });
    expect(screen.queryByRole('button', { name: /Local Agent/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Bring Your Own Key/i })).toBeNull();
    expect(screen.queryByText('Sign in to continue')).toBeNull();
  });

  it('shows OpenDesign Cloud as the default connect surface when AMR is available', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    renderOnboarding();

    expect(screen.getByRole('heading', { name: 'Sign in to OpenDesign' })).toBeTruthy();
    expect(await findCloudSignInButton()).toBeTruthy();
    // No runtime card, no AMR version text, no "Sign in to continue" CTA.
    expect(screen.queryByRole('button', { name: /OpenDesign AMR/i })).toBeNull();
    expect(screen.queryByText('AMR v0.1.0')).toBeNull();
    expect(screen.queryByRole('button', { name: /Sign in to continue/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /Authorize AMR/i })).toBeNull();
    // Model-source choices stay behind the mandatory identity gate.
    expect(screen.queryByRole('button', { name: /Local Agent/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Bring Your Own Key/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /OpenDesign AMR/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /Authorize AMR/i })).toBeNull();
    expect(screen.queryByText('Not signed in')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Sign in$/i })).toBeNull();
  });

  it('excludes AMR from the Local CLI agent list', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        loggedIn: true,
        profile: 'prod',
        user: { id: 'u', email: 'user@example.com' },
        configPath: '/x',
      }),
    ) as typeof fetch;
    renderOnboarding();

    await openLocalRuntimeSetup();

    const localPanel = screen.getByText('Local CLI').closest('.onboarding-view__setup-panel');
    expect(localPanel?.textContent).toContain('Claude Code');
    expect(localPanel?.textContent).not.toContain('AMR');
  });

  it('tests the selected Local CLI agent from onboarding', async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          loggedIn: true,
          profile: 'prod',
          configPath: '/x',
          user: { id: 'u', email: 'user@example.com' },
        });
      }
      if (url.endsWith('/api/test/connection') && init?.method === 'POST') {
        return jsonResponse({
          ok: true,
          kind: 'success',
          latencyMs: 12,
          model: 'sonnet',
          sample: 'pong',
          agentName: 'Claude Code',
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    renderOnboarding({
      config: baseConfig({
        agentId: 'claude-code',
        agentCliEnv: { 'claude-code': { OPEN_DESIGN_TEST: '1' } },
        agentModels: { 'claude-code': { model: 'sonnet', reasoning: 'high' } },
      }),
      agents: [amrAgent(), cliAgent()],
      onRefreshAgents: vi.fn(() => [amrAgent(), cliAgent()]),
    });

    await openLocalRuntimeSetup();
    fireEvent.click(screen.getByRole('button', { name: /^Test$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Claude Code replied in 12 ms/i)).toBeTruthy();
    });
    const connectionTestCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/api/test/connection'),
    );
    expect(connectionTestCalls).toHaveLength(1);
    expect(JSON.parse(String(connectionTestCalls[0]?.[1]?.body))).toMatchObject({
      mode: 'agent',
      agentId: 'claude-code',
      model: 'sonnet',
      reasoning: 'high',
      agentCliEnv: { 'claude-code': { OPEN_DESIGN_TEST: '1' } },
    });
  });

  it('renders Local CLI test failures as alerts in onboarding', async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          loggedIn: true,
          profile: 'prod',
          user: { id: 'u', email: 'user@example.com' },
          configPath: '/x',
        });
      }
      if (url.endsWith('/api/test/connection') && init?.method === 'POST') {
        return jsonResponse({
          ok: false,
          kind: 'agent_not_installed',
          latencyMs: 0,
          agentName: 'Claude Code',
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    renderOnboarding({
      config: baseConfig({ agentId: 'claude-code' }),
      agents: [amrAgent(), cliAgent()],
      onRefreshAgents: vi.fn(() => [amrAgent(), cliAgent()]),
    });

    await openLocalRuntimeSetup();
    fireEvent.click(screen.getByRole('button', { name: /^Test$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Claude Code is not installed or not in PATH.');
  });

  it('keeps AMR login pending while device authorization is waiting', async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' });
      }
      if (url.endsWith('/api/integrations/vela/login') && init?.method === 'POST') {
        return jsonResponse({ pid: 123 }, 202);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    const props = renderOnboarding();

    const signIn = await findCloudSignInButton();
    vi.useFakeTimers();
    fireEvent.click(signIn);
    await act(async () => {});

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/integrations/vela/login',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.any(String),
        }),
      );
    });
    const loginInit = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/api/integrations/vela/login'),
    )?.[1] as RequestInit;
    expect(JSON.parse(String(loginInit.body))).toMatchObject({
      attribution: {
        entryId: expect.stringMatching(/^od-amr-/u),
        sourceProduct: 'open_design',
        sourceDetail: 'onboarding_amr_card',
      },
    });
    expect(screen.getByText('Signing in…')).toBeTruthy();
    expect(screen.queryByText('Not signed in')).toBeNull();
    expect(signIn.hasAttribute('disabled')).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(screen.getByText('Signing in…')).toBeTruthy();
    expect(props.onCompleteOnboarding).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Cancel sign-in/i })).toBeTruthy();
  });

  it('shows daemon startup errors when AMR sign-in fails immediately', async () => {
    const startupError = 'profile "prod" api URL: is not configured';
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' });
      }
      if (url.endsWith('/api/integrations/vela/login') && init?.method === 'POST') {
        return jsonResponse({ error: startupError }, 500);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    renderOnboarding();

    await clickCloudSignIn();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(startupError);
    });
    expect(screen.queryByText('Sign-in failed.')).toBeNull();
    expect(screen.queryByText('Signing in…')).toBeNull();
  });

  it('clears AMR login pending when canceled and allows a fresh sign-in attempt', async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' });
      }
      if (url.endsWith('/api/integrations/vela/login') && init?.method === 'POST') {
        return jsonResponse({ pid: 123 }, 202);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    renderOnboarding();

    const signIn = await findCloudSignInButton();
    fireEvent.click(signIn);
    await act(async () => {});
    expect(screen.getByText('Signing in…')).toBeTruthy();
    expect(signIn.hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Cancel sign-in/i }));
    await act(async () => {});

    expect(screen.queryByText('Signing in…')).toBeNull();
    // The landing CTA returns to its signed-out copy and is enabled again.
    const cloudButton = await screen.findByRole('button', {
      name: /Sign in to OpenDesign/i,
    });
    expect(cloudButton.hasAttribute('disabled')).toBe(false);
    expect(screen.queryByRole('button', { name: /Local Agent/i })).toBeNull();

    fireEvent.click(cloudButton);
    await act(async () => {});
    expect(screen.getByText('Signing in…')).toBeTruthy();
    const loginCalls = fetchMock.mock.calls.filter(
      ([input, init]) =>
        String(input).endsWith('/api/integrations/vela/login') && init?.method === 'POST',
    );
    expect(loginCalls).toHaveLength(2);
  });

  it('preserves a pre-start cancel when the status refresh rejects', async () => {
    const canonicalAuthAttemptId = '22222222-2222-4222-8222-222222222222';
    const newerAuthAttemptId = '33333333-3333-4333-8333-333333333333';
    let releaseLogin!: (response: Response) => void;
    const heldLoginResponse = new Promise<Response>((resolve) => {
      releaseLogin = resolve;
    });
    let statusCalls = 0;
    const cancelAttemptIds: string[] = [];
    const statusEvents: string[] = [];
    const onStatusEvent = ((event: CustomEvent) => {
      statusEvents.push(event.detail?.reason);
    }) as EventListener;
    window.addEventListener(AMR_LOGIN_STATUS_EVENT, onStatusEvent);
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        statusCalls += 1;
        if (cancelAttemptIds.length === 1) {
          throw new Error('status unavailable');
        }
        const newerAttemptVisible = cancelAttemptIds.length >= 2;
        return jsonResponse({
          loggedIn: false,
          loginInFlight: newerAttemptVisible,
          authAttemptId: newerAttemptVisible ? newerAuthAttemptId : undefined,
          profile: 'prod',
          user: null,
          configPath: '/x',
        });
      }
      if (url.endsWith('/api/integrations/vela/login') && init?.method === 'POST') {
        return heldLoginResponse;
      }
      if (url.endsWith('/api/integrations/vela/login/cancel') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { authAttemptId: string };
        cancelAttemptIds.push(body.authAttemptId);
        return jsonResponse({ canceled: false, pids: [] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    renderOnboarding();

    const signIn = await findCloudSignInButton();
    vi.useFakeTimers();
    fireEvent.click(signIn);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/integrations/vela/login',
      expect.objectContaining({ method: 'POST' }),
    );

    fireEvent.click(screen.getByRole('button', { name: /Cancel sign-in/i }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(cancelAttemptIds).toHaveLength(1);
    const statusCallsAfterEarlyCancel = statusCalls;

    releaseLogin(jsonResponse({
      pid: 123,
      authAttemptId: canonicalAuthAttemptId,
    }, 202));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);
    window.removeEventListener(AMR_LOGIN_STATUS_EVENT, onStatusEvent);

    expect(cancelAttemptIds).toEqual([
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      canonicalAuthAttemptId,
    ]);
    expect(statusCalls).toBeGreaterThan(statusCallsAfterEarlyCancel + 1);
    expect(screen.getByText('Signing in…')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Cancel sign-in/i })).toBeTruthy();
    expect(statusEvents).not.toContain('login-canceled');
    expect(analyticsMocks.track).not.toHaveBeenCalledWith(
      'amr_auth_result',
      expect.objectContaining({ result: 'cancelled' }),
      expect.anything(),
    );
  });

  it('cancels AMR login and re-enables onboarding after the login timeout', async () => {
    let loginStarted = false;
    let authAttemptId: string | null = null;
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          loggedIn: false,
          loginInFlight: loginStarted,
          profile: 'prod',
          user: null,
          configPath: '/x',
        });
      }
      if (url.endsWith('/api/integrations/vela/login') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { authAttemptId?: string };
        authAttemptId = body.authAttemptId ?? null;
        expect(authAttemptId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
        loginStarted = true;
        return jsonResponse({ pid: 123, authAttemptId }, 202);
      }
      if (url.endsWith('/api/integrations/vela/login/cancel') && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ authAttemptId });
        loginStarted = false;
        return jsonResponse({ canceled: true, pids: [123] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    const props = renderOnboarding();

    const signIn = await findCloudSignInButton();
    vi.useFakeTimers();
    fireEvent.click(signIn);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/integrations/vela/login',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String),
      }),
    );
    expect(screen.getByText('Signing in…')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_TIMEOUT_MS);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/integrations/vela/login/cancel',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ authAttemptId }),
      }),
    );
    expect(screen.getByText('Sign-in failed.')).toBeTruthy();
    expect(screen.queryByText('Signing in…')).toBeNull();
    expect(
      screen
        .getByRole('button', { name: /Sign in to OpenDesign/i })
        .hasAttribute('disabled'),
    ).toBe(false);
    expect(props.onCompleteOnboarding).not.toHaveBeenCalled();
  });

  it('continues after AMR device authorization completes during polling', async () => {
    let statusCalls = 0;
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        statusCalls += 1;
        return jsonResponse(
          statusCalls >= 3
            ? {
                loggedIn: true,
                profile: 'prod',
                user: { id: 'u', email: 'user@example.com' },
                configPath: '/x',
              }
            : { loggedIn: false, profile: 'prod', user: null, configPath: '/x' },
        );
      }
      if (url.endsWith('/api/integrations/vela/login') && init?.method === 'POST') {
        return jsonResponse({ pid: 123 }, 202);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    renderOnboarding();

    const signIn = await findCloudSignInButton();
    vi.useFakeTimers();
    fireEvent.click(signIn);
    await act(async () => {});

    expect(screen.getByText('Signing in…')).toBeTruthy();
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Choose your model source' })).toBeTruthy();
    });
  });

  it('refreshes workspace context, billing, and team projects as soon as onboarding sign-in completes', async () => {
    // Onboarding's embedded AMR sign-in step (pollAmrLoginCompletion) used to
    // fire only notifyAmrLoginStatusChanged() on success — unlike
    // CloudSignInTip's finishSignedIn() and refreshWorkspaceSurfacesAfterOnboarding()
    // (the two other places a sign-in completes), which fire all three
    // workspace-refresh notifications. That gap left workspaceContext stale
    // until finishOnboarding fired it later, so Home's rail briefly rendered
    // in its signed-out shape (still showing "Sign in to use OpenDesign
    // Cloud") right after a successful onboarding sign-in.
    const { WORKSPACE_CONTEXT_REFRESH_EVENT, WORKSPACE_BILLING_REFRESH_EVENT, TEAM_PROJECTS_CHANGED_EVENT } =
      await import('../../src/collab/useWorkspaceContext');
    const contextRefresh = vi.fn();
    const billingRefresh = vi.fn();
    const teamProjectsChanged = vi.fn();
    window.addEventListener(WORKSPACE_CONTEXT_REFRESH_EVENT, contextRefresh);
    window.addEventListener(WORKSPACE_BILLING_REFRESH_EVENT, billingRefresh);
    window.addEventListener(TEAM_PROJECTS_CHANGED_EVENT, teamProjectsChanged);
    try {
      let statusCalls = 0;
      const fetchMock = vi.fn(async (input, init) => {
        const url = String(input);
        if (url.endsWith('/api/integrations/vela/status')) {
          statusCalls += 1;
          return jsonResponse(
            statusCalls >= 3
              ? {
                  loggedIn: true,
                  profile: 'prod',
                  user: { id: 'u', email: 'user@example.com' },
                  configPath: '/x',
                }
              : { loggedIn: false, profile: 'prod', user: null, configPath: '/x' },
          );
        }
        if (url.endsWith('/api/integrations/vela/login') && init?.method === 'POST') {
          return jsonResponse({ pid: 123 }, 202);
        }
        throw new Error(`unexpected fetch: ${url}`);
      });
      globalThis.fetch = fetchMock as typeof fetch;
      renderOnboarding();

      const signIn = await findCloudSignInButton();
      vi.useFakeTimers();
      fireEvent.click(signIn);
      await act(async () => {});
      expect(contextRefresh).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(2000);
      await vi.waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Choose your model source' })).toBeTruthy();
      });

      expect(contextRefresh).toHaveBeenCalled();
      expect(billingRefresh).toHaveBeenCalled();
      expect(teamProjectsChanged).toHaveBeenCalled();
    } finally {
      window.removeEventListener(WORKSPACE_CONTEXT_REFRESH_EVENT, contextRefresh);
      window.removeEventListener(WORKSPACE_BILLING_REFRESH_EVENT, billingRefresh);
      window.removeEventListener(TEAM_PROJECTS_CHANGED_EVENT, teamProjectsChanged);
    }
  });

  it('recovers from a transient status failure during login polling and still continues after authorization completes', async () => {
    let statusCalls = 0;
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        statusCalls += 1;
        if (statusCalls === 2) throw new Error('temporary network failure');
        return jsonResponse(
          statusCalls >= 4
            ? {
                loggedIn: true,
                profile: 'prod',
                user: { id: 'u', email: 'user@example.com' },
                configPath: '/x',
              }
            : { loggedIn: false, profile: 'prod', user: null, configPath: '/x' },
        );
      }
      if (url.endsWith('/api/integrations/vela/login') && init?.method === 'POST') {
        return jsonResponse({ pid: 123 }, 202);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    renderOnboarding();

    const signIn = await findCloudSignInButton();
    vi.useFakeTimers();
    fireEvent.click(signIn);
    await act(async () => {});

    expect(screen.getByText('Signing in…')).toBeTruthy();
    await vi.advanceTimersByTimeAsync(2000);
    expect(screen.getByText('Signing in…')).toBeTruthy();

    await vi.advanceTimersByTimeAsync(4000);
    await vi.waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Choose your model source' })).toBeTruthy();
    });
  });

  it('continues normally when OpenDesign AMR is signed in', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        loggedIn: true,
        profile: 'prod',
        configPath: '/x',
        user: { id: 'u', email: 'user@example.com' },
      }),
    ) as typeof fetch;
    renderOnboarding();

    expect(await screen.findByRole('button', { name: /Continue \(signed in\)/i })).toBeTruthy();
    expect(screen.queryByText('user@example.com')).toBeNull();
    expect(screen.queryByText('Authorized')).toBeNull();
    expect(screen.queryByRole('link', { name: /Authorize AMR/i })).toBeNull();

    await clickSignedInCloudContinue();
  });

  it('uses provider preferences instead of the first upstream model during BYOK onboarding', async () => {
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          loggedIn: true,
          profile: 'prod',
          user: { id: 'u', email: 'user@example.com' },
          configPath: '/x',
        });
      }
      if (url.endsWith('/api/provider/models') && init?.method === 'POST') {
        return jsonResponse({
          ok: true,
          kind: 'success',
          latencyMs: 10,
          models: [
            { id: 'upstream-first', label: 'Upstream First' },
            { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
          ],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const props = renderOnboarding({
      config: baseConfig({
        apiProtocol: 'anthropic',
        apiKey: 'test-api-key',
        baseUrl: 'https://api.anthropic.com',
        model: '',
        apiProviderBaseUrl: 'https://api.anthropic.com',
      }),
    });

    await openByokRuntimeSetup();
    fireEvent.click(screen.getByRole('button', { name: /Fetch models/i }));

    await waitFor(() => {
      expect(props.onApiModelChange).toHaveBeenCalledWith('claude-sonnet-4-5');
    });
    expect(props.onApiModelChange).not.toHaveBeenCalledWith('upstream-first');
  });

  it('tests BYOK on Continue, stays on rate limit, and retries on the next click', async () => {
    let testCalls = 0;
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          loggedIn: true,
          profile: 'prod',
          configPath: '/x',
          user: { id: 'u', email: 'user@example.com' },
        });
      }
      if (url.endsWith('/api/provider/models') && init?.method === 'POST') {
        return jsonResponse({
          ok: true,
          kind: 'success',
          latencyMs: 10,
          models: [{ id: 'gpt-test', label: 'GPT Test' }],
        });
      }
      if (url.endsWith('/api/test/connection') && init?.method === 'POST') {
        testCalls += 1;
        return testCalls === 1
          ? jsonResponse({
              ok: false,
              kind: 'rate_limited',
              latencyMs: 12,
              model: 'gpt-test',
              status: 429,
            })
          : jsonResponse({
              ok: true,
              kind: 'success',
              latencyMs: 12,
              model: 'gpt-test',
              sample: 'Connected',
            });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const props = renderOnboarding({
      config: baseConfig({
        mode: 'api',
        apiProtocol: 'openai',
        apiKey: 'test-api-key',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-test',
        apiProviderBaseUrl: 'https://api.openai.com/v1',
      }),
    });

    await openByokRuntimeSetup();
    const continueButton = screen.getByRole('button', { name: /^Continue$/i });
    expect(continueButton.getAttribute('aria-disabled')).toBeNull();

    fireEvent.click(continueButton);
    expect(await screen.findByText(/rate-limited the test/i)).toBeTruthy();
    expect(props.onCompleteOnboarding).not.toHaveBeenCalled();

    fireEvent.click(continueButton);
    await waitFor(() => {
      expect(testCalls).toBe(2);
      expect(props.onCompleteOnboarding).toHaveBeenCalledTimes(1);
    });
  });

  it('drops a BYOK validation that lands after its inputs changed', async () => {
    // The inputs stay editable while the test is in flight. A success for the
    // key the user has already replaced must not complete onboarding.
    let releaseTest: ((value: Response) => void) | undefined;
    let testCalls = 0;
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          loggedIn: true,
          profile: 'prod',
          configPath: '/x',
          user: { id: 'u', email: 'user@example.com' },
        });
      }
      if (url.endsWith('/api/provider/models') && init?.method === 'POST') {
        return jsonResponse({
          ok: true,
          kind: 'success',
          latencyMs: 10,
          models: [{ id: 'gpt-test', label: 'GPT Test' }],
        });
      }
      if (url.endsWith('/api/test/connection') && init?.method === 'POST') {
        testCalls += 1;
        return new Promise<Response>((resolve) => {
          releaseTest = resolve;
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const props = renderOnboarding({
      config: baseConfig({
        mode: 'api',
        apiProtocol: 'openai',
        apiKey: 'test-api-key',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-test',
        apiProviderBaseUrl: 'https://api.openai.com/v1',
      }),
    });

    await openByokRuntimeSetup();
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(testCalls).toBe(1);
    });

    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'rotated-api-key' },
    });

    await act(async () => {
      releaseTest?.(
        jsonResponse({
          ok: true,
          kind: 'success',
          latencyMs: 12,
          model: 'gpt-test',
          sample: 'Connected',
        }),
      );
      await Promise.resolve();
    });

    expect(props.onCompleteOnboarding).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Bring Your Own Key' })).toBeTruthy();
  });

  it('persists the BYOK config before finishing onboarding', async () => {
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          loggedIn: true,
          profile: 'prod',
          configPath: '/x',
          user: { id: 'u', email: 'user@example.com' },
        });
      }
      if (url.endsWith('/api/provider/models') && init?.method === 'POST') {
        return jsonResponse({
          ok: true,
          kind: 'success',
          latencyMs: 10,
          models: [
            { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
            { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
          ],
        });
      }
      if (url.endsWith('/api/test/connection') && init?.method === 'POST') {
        return jsonResponse({
          ok: true,
          kind: 'success',
          latencyMs: 12,
          model: 'claude-opus-4-8',
          sample: 'Connected',
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const props = renderOnboarding();

    fireEvent.click(
      await screen.findByRole('button', { name: /Continue \(signed in\)/i }),
    );
    fireEvent.click(await screen.findByRole('radio', { name: /Bring Your Own Key/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    expect(await screen.findByRole('heading', { name: 'Bring Your Own Key' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'test-api-key' } });
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://api.anthropic.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Fetch models/i }));
    await waitFor(() => {
      expect(screen.getByText('Fetched 2 models.')).toBeTruthy();
    });
    chooseOnboardingOption('Model', /claude-opus-4-8/i);
    fireEvent.click(screen.getByRole('button', { name: /^Test$/i }));
    await waitFor(() => {
      expect(screen.getByText(/Connected\. Replied in 12 ms/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));

    expect(props.onModeChange).not.toHaveBeenCalled();
    expect(props.onApiModelChange).toHaveBeenCalledWith('claude-opus-4-8');
    expect(props.onConfigPersist).toHaveBeenCalled();
    await waitFor(() => {
      expect(props.onCompleteOnboarding).toHaveBeenCalledTimes(1);
    });
    expect((props.onConfigPersist as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]).toMatchObject({
      mode: 'api',
      apiProtocol: 'anthropic',
      apiKey: 'test-api-key',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-opus-4-8',
      apiProviderBaseUrl: null,
    });
    expect(latestTrackedEvent('onboarding_complete_result')).toMatchObject({
      result: 'completed',
      exit_step_name: 'runtime_setup',
      runtime_type: 'byok',
    });
  });

  it('lets Azure BYOK onboarding enter a custom deployment directly', async () => {
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          loggedIn: true,
          profile: 'prod',
          user: { id: 'u', email: 'user@example.com' },
          configPath: '/x',
        });
      }
      if (url.endsWith('/api/test/connection') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body ?? '{}'));
        expect(body).toMatchObject({
          protocol: 'azure',
          apiKey: 'azure-key',
          baseUrl: 'https://example.openai.azure.com',
          model: 'deployment-one',
        });
        return jsonResponse({
          ok: true,
          kind: 'success',
          latencyMs: 11,
          model: 'deployment-one',
          sample: 'Connected',
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const props = renderOnboarding({
      config: baseConfig({
        mode: 'api',
        apiProtocol: 'azure',
        apiProviderBaseUrl: '',
      }),
    });

    await openByokRuntimeSetup();

    expect(screen.getByRole('tab', { name: 'Azure OpenAI' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect((screen.getByRole('button', { name: /Fetch models/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getAllByRole('button', { name: 'Azure OpenAI' }).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'azure-key' } });
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://example.openai.azure.com' },
    });
    fireEvent.change(screen.getByLabelText('Deployment name'), {
      target: { value: 'deployment-one' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Test$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Connected\. Replied in 11 ms/i)).toBeTruthy();
    });
    expect(props.onApiModelChange).toHaveBeenCalledWith('deployment-one');
    expect((props.onConfigPersist as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]).toMatchObject({
      mode: 'api',
      apiProtocol: 'azure',
      apiKey: 'azure-key',
      apiProviderBaseUrl: '',
      baseUrl: 'https://example.openai.azure.com',
      model: 'deployment-one',
    });
  });

  it('keeps the cloud sign-in landing stable while AMR detection is still in flight', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    renderOnboarding({
      agents: [cliAgent()], // AMR has not surfaced from the stream yet
      agentsLoading: true, // cold-start detection stream still running
      onRefreshAgents: vi.fn(() => [cliAgent()]),
    });

    expect(screen.getByRole('heading', { name: 'Sign in to OpenDesign' })).toBeTruthy();
    const primary = screen.getByRole('button', { name: /Loading/i });
    expect(primary).toBeTruthy();
    expect(primary.getAttribute('aria-busy')).toBe('true');
    expect((primary as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('.onboarding-view__card--skeleton')).toBeNull();
    expect(screen.queryByRole('button', { name: /OpenDesign AMR/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Local Agent/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Bring Your Own Key/i })).toBeNull();
  });

  it('renders the cloud sign-in CTA and no legacy AMR card once AMR is available', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    renderOnboarding({ agentsLoading: false });

    expect(await findCloudSignInButton()).toBeTruthy();
    expect(screen.queryByRole('button', { name: /OpenDesign AMR/i })).toBeNull();
    expect(document.querySelector('.onboarding-view__card--skeleton')).toBeNull();
  });

  it('keeps the cloud sign-in CTA visible after detection settles without surfacing AMR', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    renderOnboarding({
      agents: [cliAgent()],
      agentsLoading: false,
      onRefreshAgents: vi.fn(() => [cliAgent()]),
    });

    expect(
      await screen.findByRole('button', { name: /Sign in to OpenDesign/i }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /OpenDesign AMR/i })).toBeNull();
    expect(document.querySelector('.onboarding-view__card--skeleton')).toBeNull();
  });

  it('shows no Skip affordance on the Connect step', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    );
    globalThis.fetch = fetchMock as typeof fetch;
    const props = renderOnboarding();
    await act(async () => {});

    // "Skip for now" was removed — Connect is a required step. The Connect
    // step exposes no secondary Skip/Back button, onboarding is not completed
    // from here, and no skip telemetry fires.
    expect(screen.queryByRole('button', { name: /Skip/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Back$/i })).toBeNull();
    expect(props.onCompleteOnboarding).not.toHaveBeenCalled();
    const skipClicks = trackedEvents('ui_click')
      .map(([, payload]) => payload as Record<string, unknown>)
      .filter((payload) => payload.element === 'skip');
    expect(skipClicks).toHaveLength(0);
    expect(trackedEvents('onboarding_complete_result')).toHaveLength(0);
  });
});

// @vitest-environment jsdom

import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryShell } from '../../src/components/EntryShell';
import { AMR_LOGIN_TIMEOUT_MS } from '../../src/components/amrLoginPolling';
import { I18nProvider } from '../../src/i18n';
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
    onThemeChange: vi.fn(),
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
      theme: 'system',
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
    onThemeChange: vi.fn(),
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
    expect(screen.getByRole('heading', { name: 'About you' })).toBeTruthy();
  });
}

async function clickCloudSignIn() {
  const signIn = await findCloudSignInButton();
  fireEvent.click(signIn);
  return signIn;
}

async function findCloudSignInButton() {
  return screen.findByRole('button', { name: /Sign in to Open Design/i });
}

function openLocalRuntimeSetup() {
  expect(screen.getByRole('heading', { name: 'Sign in to Open Design' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Local coding agent/i }));
  expect(screen.getByText('Local CLI')).toBeTruthy();
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
  it('opens quick actions before opening the full settings dialog', async () => {
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

    await waitFor(() => {
      expect(screen.getByText('1.2k online')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('entry-settings-menu-trigger'));

    expect(props.onOpenSettings).not.toHaveBeenCalled();
    expect(screen.getByTestId('entry-settings-menu')).toBeTruthy();
    expect(screen.getByText('Language')).toBeTruthy();
    expect(screen.getByText('Appearance')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Join Discord/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /1.2k online/i })).toBeTruthy();
    expect(
      screen.getByRole('menuitem', { name: /Follow @OpenDesignHQ on X/i }).getAttribute('href'),
    ).toBe('https://x.com/OpenDesignHQ');
    expect(
      screen.getByRole('menuitem', { name: /Follow Open Design on Threads/i }).getAttribute('href'),
    ).toBe('https://www.threads.com/@opendesign.ai');
    expect(
      screen.getByRole('menuitem', { name: /Open Design on YouTube/i }).getAttribute('href'),
    ).toBe('https://www.youtube.com/@Open-Design-ai');

    fireEvent.click(screen.getByTestId('entry-settings-open-details'));

    expect(props.onOpenSettings).toHaveBeenCalledWith();
  });
});

describe('EntryShell design systems view', () => {
  it('refreshes the design-system catalog when the view is active', async () => {
    const onDesignSystemsRefresh = vi.fn();
    renderHome({ onDesignSystemsRefresh }, '/design-systems');

    await waitFor(() => expect(onDesignSystemsRefresh).toHaveBeenCalledTimes(1));
  });
});

describe('EntryShell new project rail', () => {
  it('creates a blank project directly from the rail plus', async () => {
    window.localStorage.setItem('od.entry.railOpen', 'false');
    const fetchMock = vi.fn(
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url.endsWith('/api/projects') && init?.method === 'POST') {
          return jsonResponse({
            project: {
              id: 'blank-project-1',
              name: 'Untitled',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            conversationId: 'conversation-1',
          });
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
    const props = renderHome();

    fireEvent.click(screen.getByTestId('entry-rail-toggle'));
    fireEvent.click(screen.getByTestId('entry-nav-new-project'));

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
        page_name: 'home',
        area: 'nav',
        element: 'new_project_plus',
      }),
      undefined,
    );
  });

  it('opens the new project modal from the Projects tab button', async () => {
    window.localStorage.setItem('od.entry.railOpen', 'false');
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
    });

    fireEvent.click(screen.getByTestId('entry-rail-toggle'));
    fireEvent.click(screen.getByTestId('entry-nav-projects'));
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
      () => new Promise<boolean>((resolve) => { resolveCreate = resolve; }),
    );
    renderHome({ onCreateProject });

    await screen.findByTestId('home-hero-input');
    setHomeHeroPrompt('Build a landing page');
    const submit = await screen.findByTestId('home-hero-submit') as HTMLButtonElement;
    fireEvent.click(submit);

    await waitFor(() => expect(onCreateProject).toHaveBeenCalledTimes(1));
    expect(submit.disabled).toBe(true);
    expect(submit.textContent).toContain('Sending…');

    resolveCreate(true);
    await waitFor(() => expect(submit.disabled).toBe(false));
  });
});

describe('EntryShell onboarding Open Design AMR runtime', () => {
  it('does not auto-select Open Design AMR when the AMR runtime is unavailable', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    const props = renderOnboarding({
      agents: [cliAgent()],
      onRefreshAgents: vi.fn(() => [cliAgent()]),
    });

    expect(await screen.findByRole('heading', { name: 'Sign in to Open Design' })).toBeTruthy();
    expect(await findCloudSignInButton()).toBeTruthy();
    openLocalRuntimeSetup();
    expect(screen.queryByRole('button', { name: /Open Design AMR/i })).toBeNull();

    await waitFor(() => {
      expect(props.onAgentChange).not.toHaveBeenCalledWith('amr');
    });
    expect(screen.getByText('Local CLI')).toBeTruthy();
    expect(screen.queryByText('Sign in to continue')).toBeNull();
  });

  it('shows Open Design Cloud as the default connect surface when AMR is available', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    renderOnboarding();

    expect(screen.getByRole('heading', { name: 'Sign in to Open Design' })).toBeTruthy();
    expect(await findCloudSignInButton()).toBeTruthy();
    // No runtime card, no AMR version text, no "Sign in to continue" CTA.
    expect(screen.queryByRole('button', { name: /Open Design AMR/i })).toBeNull();
    expect(screen.queryByText('AMR v0.1.0')).toBeNull();
    expect(screen.queryByRole('button', { name: /Sign in to continue/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /Authorize AMR/i })).toBeNull();
    // The secondary runtime links remain available on the landing.
    expect(screen.getByRole('button', { name: /Local coding agent/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Bring your own key/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Open Design AMR/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /Authorize AMR/i })).toBeNull();
    expect(screen.queryByText('Not signed in')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Sign in$/i })).toBeNull();
  });

  it('excludes AMR from the Local CLI agent list', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    renderOnboarding();

    openLocalRuntimeSetup();
    await vi.advanceTimersByTimeAsync(300);

    const localPanel = screen.getByText('Local CLI').closest('.onboarding-view__setup-panel');
    expect(localPanel?.textContent).toContain('Claude Code');
    expect(localPanel?.textContent).not.toContain('AMR');
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

  it('shows a friendly error (not the raw daemon message) when AMR sign-in fails immediately', async () => {
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
      expect(screen.getByRole('alert').textContent).toBe(
        'Cloud sign-in is temporarily unavailable. Please try again later.',
      );
    });
    // The raw daemon error must never be surfaced to the user.
    expect(screen.queryByText(startupError)).toBeNull();
    expect(screen.queryByText('Signing in…')).toBeNull();
  });

  // The cloud sign-in error is page-level state that belongs to the cloud path
  // only. Switching to a different runtime must clear it so a stale cloud error
  // does not bleed onto the Local CLI or BYOK setup sub-page.
  it.each([
    { label: 'Local coding agent', button: /Local coding agent/i },
    { label: 'BYOK', button: /Bring your own key/i },
  ])('clears the cloud sign-in error when switching to $label', async ({ button }) => {
    const startupError = 'vela binary not found; install vela or configure VELA_BIN';
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
      expect(
        screen.getByText('Cloud sign-in is temporarily unavailable. Please try again later.'),
      ).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: button }));

    // Moving to another runtime path drops the cloud error entirely: neither the
    // friendly copy nor the raw daemon message may follow the user onto the
    // Local CLI / BYOK sub-page.
    await waitFor(() => {
      expect(
        screen.queryByText('Cloud sign-in is temporarily unavailable. Please try again later.'),
      ).toBeNull();
    });
    expect(screen.queryByText(startupError)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears AMR login pending when the cloud sign-in is canceled', async () => {
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
    // The landing CTA returns to its signed-out copy and is enabled again,
    // and the secondary runtime links are available once more.
    const cloudButton = await screen.findByRole('button', {
      name: /Sign in to Open Design/i,
    });
    expect(cloudButton.hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: /Local coding agent/i })).toBeTruthy();
  });

  it('cancels AMR login and re-enables onboarding after the login timeout', async () => {
    let loginStarted = false;
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
        loginStarted = true;
        return jsonResponse({ pid: 123 }, 202);
      }
      if (url.endsWith('/api/integrations/vela/login/cancel') && init?.method === 'POST') {
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
    expect(fetchMock).toHaveBeenCalledWith('/api/integrations/vela/login/cancel', { method: 'POST' });
    expect(screen.getByText('Cloud sign-in is temporarily unavailable. Please try again later.')).toBeTruthy();
    expect(screen.queryByText('Signing in…')).toBeNull();
    expect(
      screen
        .getByRole('button', { name: /Sign in to Open Design/i })
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
      expect(screen.getByRole('heading', { name: 'About you' })).toBeTruthy();
    });
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
      expect(screen.getByRole('heading', { name: 'About you' })).toBeTruthy();
    });
  });

  it('continues normally when Open Design AMR is signed in', async () => {
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

  it('does not show a memory-saved callout on the About you step before choices are submitted', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        loggedIn: true,
        profile: 'prod',
        configPath: '/x',
        user: { id: 'u', email: 'user@example.com' },
      }),
    ) as typeof fetch;
    renderOnboarding();

    await clickSignedInCloudContinue();
    expect(screen.queryByText('Saved to your Memory')).toBeNull();
  });

  it('shows a Back control on the brand extraction onboarding step', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        loggedIn: true,
        profile: 'prod',
        configPath: '/x',
        user: { id: 'u', email: 'user@example.com' },
      }),
    ) as typeof fetch;
    renderOnboarding();

    await clickSignedInCloudContinue();
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Stay in the loop' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Create once, build everywhere' })).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: /^Back$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Build a design system' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Skip for now/i })).toBeNull();
  });

  it('tracks onboarding page views and about-you submission payload on completion', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        loggedIn: true,
        profile: 'prod',
        configPath: '/x',
        user: { id: 'u', email: 'user@example.com' },
      }),
    ) as typeof fetch;
    const props = renderOnboarding();

    await clickSignedInCloudContinue();

    chooseOnboardingOption('Your role', 'Engineer');
    chooseOnboardingOption('Organization size', /Growth company/i);
    chooseOnboardingOption('Use case', /Product design/i);
    chooseOnboardingOption('Where did you hear about us?', /Search/i);
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Stay in the loop' })).toBeTruthy();
    });
    await waitFor(() => {
      expect(document.querySelector('.onboarding-view__email-input')).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Create once, build everywhere' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build a design system' }));

    await waitFor(() => {
      expect(props.onCompleteOnboarding).toHaveBeenCalledTimes(1);
    });

    const pageViews = trackedEvents('page_view').map(([, payload]) => payload);
    expect(pageViews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          page_name: 'onboarding',
          area: 'runtime',
          step_index: '1',
          step_name: 'connect',
        }),
        expect.objectContaining({
          page_name: 'onboarding',
          area: 'about_you',
          step_index: '2',
          step_name: 'about_you',
        }),
        expect.objectContaining({
          page_name: 'onboarding',
          area: 'newsletter',
          step_index: '3',
          step_name: 'newsletter',
        }),
        expect.objectContaining({
          page_name: 'onboarding',
          area: 'design_system',
          step_index: '4',
          step_name: 'design_system',
        }),
      ]),
    );

    // The About-you survey snapshot fires when the user continues past
    // the About-you step and carries the role/org/use-case/source picks.
    expect(findTrackedEvent('ui_click', (payload) => payload.element === 'about_you_submit')).toMatchObject({
      page_name: 'onboarding',
      area: 'about_you',
      element: 'about_you_submit',
      action: 'continue',
      role: 'engineer',
      organization_size: 'growth',
      use_cases: ['product'],
      discovery_source: 'search',
    });

    expect(latestTrackedEvent('onboarding_complete_result')).toMatchObject({
      page_name: 'onboarding',
      area: 'onboarding',
      result: 'completed',
      exit_step_name: 'design_system',
      // This flow clicks "Build a design system" at the final step, so the
      // completion records the with-DS fork (C2 — tracking spec §3.1).
      completion_type: 'completed_with_design_system',
      runtime_type: 'amr_cloud',
      has_about_you: true,
      has_design_system_request: false,
      role: 'engineer',
      organization_size: 'growth',
      use_cases: ['product'],
      discovery_source: 'search',
    });
  });

  it('submits the optional newsletter email when finishing onboarding', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          loggedIn: true,
          profile: 'prod',
          configPath: '/x',
          user: { id: 'u', email: 'user@example.com' },
        });
      }
      if (url.endsWith('/subscribe')) {
        return jsonResponse({ ok: true });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    renderOnboarding();

    // Connect -> About you -> Newsletter -> Brand
    await clickSignedInCloudContinue();
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Stay in the loop' })).toBeTruthy();
    });
    await waitFor(() => {
      expect(document.querySelector('.onboarding-view__email-input')).toBeTruthy();
    });

    const emailInput = document.querySelector('.onboarding-view__email-input');
    expect(emailInput).toBeInstanceOf(HTMLInputElement);
    expect((emailInput as HTMLInputElement).placeholder).toBe('you@studio.com');

    fireEvent.change(emailInput as HTMLInputElement, {
      target: { value: '  Tester@Studio.com  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Create once, build everywhere' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build a design system' }));

    const subscribeCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/subscribe'));
    expect(subscribeCall).toBeTruthy();
    expect(JSON.parse(String(subscribeCall?.[1]?.body))).toEqual({
      email: 'tester@studio.com',
      source: 'client',
    });

    expect(findTrackedEvent('ui_click', (payload) => payload.element === 'newsletter_email')).toMatchObject({
      page_name: 'onboarding',
      element: 'newsletter_email',
      action: 'subscribe',
      newsletter_opt_in: true,
    });
  });

  it('skips the newsletter request when the email field is left blank', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          loggedIn: true,
          profile: 'prod',
          configPath: '/x',
          user: { id: 'u', email: 'user@example.com' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    renderOnboarding();

    await clickSignedInCloudContinue();
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(document.querySelector('.onboarding-view__email-input')).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Create once, build everywhere' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build a design system' }));

    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/subscribe'))).toBe(false);
  });

  it('persists about-you selections to the work profile memory', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          loggedIn: true,
          profile: 'prod',
          configPath: '/x',
          user: { id: 'u', email: 'user@example.com' },
        });
      }
      if (url === '/api/memory/user_profile' && init?.method === 'PUT') {
        return jsonResponse({
          entry: {
            id: 'user_profile',
            name: 'Work profile',
            description: 'Role and defaults',
            type: 'profile',
            updatedAt: Date.now(),
            body: JSON.parse(String(init.body)).body,
          },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    renderOnboarding();

    await clickSignedInCloudContinue();
    chooseOnboardingOption('Your role', 'Engineer');
    chooseOnboardingOption('Organization size', 'Growth company');
    chooseOnboardingOption('Use case', 'Product design');
    chooseOnboardingOption('Where did you hear about us?', 'Search');

    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/memory/user_profile')).toBe(true);
    });
    const memoryCall = fetchMock.mock.calls.find(([url]) => String(url) === '/api/memory/user_profile');
    const payload = JSON.parse(String(memoryCall?.[1]?.body));
    expect(memoryCall?.[1]).toMatchObject({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(payload).toMatchObject({
      type: 'profile',
      name: 'Work profile',
    });
    expect(payload.body).toContain('- Role: Engineer');
    expect(payload.body).toContain('- Organization size: Growth company');
    expect(payload.body).toContain('- Use cases: Product design');
    expect(payload.body).toContain('- Discovery source: Search');
    expect(payload.body).not.toContain('user@example.com');
  });

  it('reports about_you_submit exactly once when advancing to the newsletter step', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        loggedIn: true,
        profile: 'prod',
        configPath: '/x',
        user: { id: 'u', email: 'user@example.com' },
      }),
    ) as typeof fetch;
    renderOnboarding();

    await clickSignedInCloudContinue();
    chooseOnboardingOption('Your role', 'Engineer');

    // Advance to the newsletter step via Continue (the stepper no longer
    // allows forward jumps past the current step). The survey snapshot must
    // still fire exactly once — on the final Finish — not zero times.
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Stay in the loop' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Create once, build everywhere' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build a design system' }));

    const aboutYouSubmits = trackedEvents('ui_click')
      .map(([, payload]) => payload as Record<string, unknown>)
      .filter((payload) => payload.element === 'about_you_submit');
    expect(aboutYouSubmits).toHaveLength(1);
    expect(aboutYouSubmits[0]).toMatchObject({ role: 'engineer' });
  });

  it('reports about_you_submit exactly once across a Back-then-Continue detour', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        loggedIn: true,
        profile: 'prod',
        configPath: '/x',
        user: { id: 'u', email: 'user@example.com' },
      }),
    ) as typeof fetch;
    renderOnboarding();

    await clickSignedInCloudContinue();
    chooseOnboardingOption('Your role', 'Engineer');

    // About you -> Newsletter
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Stay in the loop' })).toBeTruthy();
    });
    // Back -> About you
    fireEvent.click(screen.getByRole('button', { name: /^Back$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'About you' })).toBeTruthy();
    });
    // Continue -> Newsletter again, then Brand and finish.
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Stay in the loop' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Create once, build everywhere' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build a design system' }));

    // The detour crosses the About-you step twice, but the snapshot must
    // not double-fire.
    const aboutYouSubmits = trackedEvents('ui_click')
      .map(([, payload]) => payload as Record<string, unknown>)
      .filter((payload) => payload.element === 'about_you_submit');
    expect(aboutYouSubmits).toHaveLength(1);
  });

  it('persists the BYOK config before finishing onboarding', async () => {
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' });
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

    fireEvent.click(screen.getByRole('button', { name: /Bring your own key/i }));
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
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'About you' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(document.querySelector('.onboarding-view__email-input')).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Create once, build everywhere' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build a design system' }));

    expect(props.onModeChange).toHaveBeenCalledWith('api');
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

    expect(screen.getByRole('heading', { name: 'Sign in to Open Design' })).toBeTruthy();
    const primary = screen.getByRole('button', { name: /Loading/i });
    expect(primary).toBeTruthy();
    expect(primary.getAttribute('aria-busy')).toBe('true');
    expect((primary as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('.onboarding-view__card--skeleton')).toBeNull();
    expect(screen.queryByRole('button', { name: /Open Design AMR/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Local coding agent/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Bring your own key/i })).toBeTruthy();
  });

  it('renders the cloud sign-in CTA and no legacy AMR card once AMR is available', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    renderOnboarding({ agentsLoading: false });

    expect(await findCloudSignInButton()).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Open Design AMR/i })).toBeNull();
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
      await screen.findByRole('button', { name: /Sign in to Open Design/i }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Open Design AMR/i })).toBeNull();
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

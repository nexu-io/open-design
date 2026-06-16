// @vitest-environment jsdom

import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryShell } from '../../src/components/EntryShell';
import { AMR_LOGIN_TIMEOUT_MS } from '../../src/components/amrLoginPolling';
import { I18nProvider } from '../../src/i18n';
import type { AgentInfo, AppConfig } from '../../src/types';

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
) {
  window.history.replaceState(null, '', '/');
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

function chooseDropdownOption(label: string, option: string | RegExp) {
  const field = screen
    .getAllByText(label)
    .map((node) => node.closest('.onboarding-view__select-field'))
    .find((node): node is HTMLElement => node instanceof HTMLElement);
  if (!field) throw new Error(`dropdown field not found: ${label}`);
  const trigger = field.querySelector('button');
  if (!(trigger instanceof HTMLButtonElement)) {
    throw new Error(`dropdown trigger not found: ${label}`);
  }
  fireEvent.click(trigger);
  fireEvent.click(
    screen.getByRole('option', {
      name: option instanceof RegExp ? option : new RegExp(option, 'i'),
    }),
  );
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
  analyticsMocks.track.mockReset();
  window.sessionStorage.clear();
});

beforeEach(() => {
  globalThis.fetch = originalFetch;
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
    expect(screen.getByRole('menuitem', { name: /Follow @nexudotio on X/i })).toBeTruthy();

    fireEvent.click(screen.getByTestId('entry-settings-open-details'));

    expect(props.onOpenSettings).toHaveBeenCalledWith();
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

    expect(screen.queryByRole('button', { name: /Open Design AMR/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Local coding agent/i }));

    await waitFor(() => {
      expect(props.onAgentChange).not.toHaveBeenCalledWith('amr');
    });
    expect(screen.getByText('Local CLI')).toBeTruthy();
    expect(screen.queryByText('Sign in to continue')).toBeNull();
  });

  it('shows Open Design AMR as the recommended default when AMR is available', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    const props = renderOnboarding();

    const amrCloud = screen.getByRole('button', { name: /Open Design AMR/i });
    expect(amrCloud.getAttribute('aria-pressed')).toBe('true');
    expect(amrCloud.textContent).toContain('Officially recommended');
    expect(amrCloud.textContent).toContain('No deploy needed');
    expect(amrCloud.textContent).toContain('Supports Claude Opus 4.8');
    expect(amrCloud.textContent).toContain('SOTA Harness');
    expect(amrCloud.textContent).toContain('Coming soon');
    expect(amrCloud.textContent).toContain('AMR v0.1.0');
    expect(screen.queryByRole('link', { name: /Authorize AMR/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Sign in to continue/i })).toBeTruthy();
    expect(screen.queryByText('Not signed in')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Sign in$/i })).toBeNull();
    await waitFor(() => {
      expect(props.onModeChange).toHaveBeenCalledWith('daemon');
      expect(props.onAgentChange).toHaveBeenCalledWith('amr');
    });
  });

  it('excludes AMR from the Local CLI agent list', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    renderOnboarding();

    fireEvent.click(screen.getByRole('button', { name: /Local coding agent/i }));
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

    const signIn = await screen.findByRole('button', { name: /Sign in to continue/i });
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
        sourceDetail: 'onboarding_amr_sign_in_continue',
      },
    });
    expect(screen.getByText('Signing in…')).toBeTruthy();
    expect(screen.queryByText('Not signed in')).toBeNull();
    expect(signIn.hasAttribute('disabled')).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(screen.getByText('Signing in…')).toBeTruthy();
    expect(props.onCompleteOnboarding).not.toHaveBeenCalled();
    expect(screen.getByText('Connect')).toBeTruthy();
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

    fireEvent.click(await screen.findByRole('button', { name: /Sign in to continue/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(startupError);
    });
    expect(screen.queryByText('AMR sign-in failed.')).toBeNull();
    expect(screen.queryByText('Signing in…')).toBeNull();
  });

  it('clears AMR login pending when the user switches to another runtime', async () => {
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

    const signIn = await screen.findByRole('button', { name: /Sign in to continue/i });
    vi.useFakeTimers();
    fireEvent.click(signIn);
    await act(async () => {});
    expect(screen.getByText('Signing in…')).toBeTruthy();
    expect(signIn.hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Local coding agent/i }));
    await act(async () => {});

    expect(screen.queryByText('Signing in…')).toBeNull();
    // Switching to the Local runtime clears the AMR login-pending state. The
    // Connect gate then keeps Continue disabled until a usable local CLI is
    // actually selected — here onAgentChange is mocked and never commits a
    // selection, so no runtime is ready and Continue stays disabled.
    expect(screen.getByRole('button', { name: /^Continue$/i }).hasAttribute('disabled')).toBe(true);
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

    const signIn = await screen.findByRole('button', { name: /Sign in to continue/i });
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
    expect(screen.getByText('AMR sign-in failed.')).toBeTruthy();
    expect(screen.queryByText('Signing in…')).toBeNull();
    expect(screen.getByRole('button', { name: /Sign in to continue/i }).hasAttribute('disabled')).toBe(false);
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

    const signIn = await screen.findByRole('button', { name: /Sign in to continue/i });
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

    const signIn = await screen.findByRole('button', { name: /Sign in to continue/i });
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

    expect(await screen.findByText('AMR v0.1.0')).toBeTruthy();
    expect(screen.queryByText('user@example.com')).toBeNull();
    expect(screen.queryByText('Authorized')).toBeNull();
    expect(screen.queryByRole('link', { name: /Authorize AMR/i })).toBeNull();

    const continueButton = await screen.findByRole('button', { name: /^Continue$/i });
    fireEvent.click(continueButton);

    expect(screen.getByRole('heading', { name: 'About you' })).toBeTruthy();
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

    fireEvent.click(await screen.findByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'About you' })).toBeTruthy();
    });

    chooseDropdownOption('Your role', 'Engineer');
    chooseDropdownOption('Organization size', /Growth company/i);
    chooseDropdownOption('Use case', /Product design/i);
    chooseDropdownOption('Where did you hear about us?', /Search/i);
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Stay in the loop' })).toBeTruthy();
    });
    await waitFor(() => {
      expect(document.querySelector('.onboarding-view__email-input')).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /Finish setup/i }));

    expect(props.onCompleteOnboarding).toHaveBeenCalledTimes(1);

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
      completion_type: 'completed_without_design_system',
      runtime_type: 'amr_cloud',
      has_about_you: true,
      has_design_system_request: false,
      role: 'engineer',
      organization_size: 'growth',
      use_cases: ['product'],
      discovery_source: 'search',
    });
  });

  it('submits the optional newsletter email when finishing the About-you step', async () => {
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

    // Connect -> About you -> Newsletter
    fireEvent.click(await screen.findByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'About you' })).toBeTruthy();
    });
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
    fireEvent.click(screen.getByRole('button', { name: /Finish setup/i }));

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

    fireEvent.click(await screen.findByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'About you' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(document.querySelector('.onboarding-view__email-input')).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /Finish setup/i }));

    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/subscribe'))).toBe(false);
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

    fireEvent.click(await screen.findByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'About you' })).toBeTruthy();
    });
    chooseDropdownOption('Your role', 'Engineer');

    // Advance to the newsletter step via Continue (the stepper no longer
    // allows forward jumps past the current step). The survey snapshot must
    // still fire exactly once — on the final Finish — not zero times.
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Stay in the loop' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /Finish setup/i }));

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

    fireEvent.click(await screen.findByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'About you' })).toBeTruthy();
    });
    chooseDropdownOption('Your role', 'Engineer');

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
    // Continue -> Newsletter again, then finish.
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Stay in the loop' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /Finish setup/i }));

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
    chooseDropdownOption('Model', /claude-opus-4-8/i);
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
    fireEvent.click(screen.getByRole('button', { name: /Finish setup/i }));

    expect(props.onModeChange).toHaveBeenCalledWith('api');
    expect(props.onApiModelChange).toHaveBeenCalledWith('claude-opus-4-8');
    expect(props.onConfigPersist).toHaveBeenCalled();
    expect(props.onCompleteOnboarding).toHaveBeenCalledTimes(1);
    expect((props.onConfigPersist as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]).toMatchObject({
      mode: 'api',
      apiProtocol: 'anthropic',
      apiKey: 'test-api-key',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-opus-4-8',
      apiProviderBaseUrl: null,
    });
  });

  it('shows the AMR cloud card as a skeleton while agent detection is still in flight', async () => {
    // Before this fix, the AMR cloud card was simply absent for the several
    // seconds AMR's probe takes to settle (showAmrCloudOption was false once
    // any non-AMR agent had arrived), then popped in with no loading state.
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    renderOnboarding({
      agents: [cliAgent()], // AMR has not surfaced from the stream yet
      agentsLoading: true, // cold-start detection stream still running
      onRefreshAgents: vi.fn(() => [cliAgent()]),
    });

    const skeleton = document.querySelector('.onboarding-view__card--skeleton');
    expect(skeleton).toBeTruthy();
    // The brand identity is known up-front and rendered solid; only the
    // probe-dependent details shimmer.
    expect(skeleton?.textContent).toContain('Open Design AMR');
    expect(skeleton?.getAttribute('aria-busy')).toBe('true');
    expect(skeleton?.querySelectorAll('.onboarding-view__skeleton-line--benefit').length).toBe(4);
    expect(skeleton?.querySelector('.onboarding-view__skeleton-model-bar')).toBeTruthy();
    // The real, selectable AMR card is not present while detecting.
    expect(screen.queryByRole('button', { name: /Open Design AMR/i })).toBeNull();
    // Alternatives remain available throughout detection.
    expect(screen.getByRole('button', { name: /Local coding agent/i })).toBeTruthy();
  });

  it('renders the real AMR cloud card and no skeleton once AMR is available', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    renderOnboarding({ agentsLoading: false });

    expect(screen.getByRole('button', { name: /Open Design AMR/i })).toBeTruthy();
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

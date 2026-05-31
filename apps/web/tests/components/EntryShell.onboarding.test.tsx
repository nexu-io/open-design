// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryShell } from '../../src/components/EntryShell';
import { AMR_LOGIN_TIMEOUT_MS } from '../../src/components/amrLoginPolling';
import { I18nProvider } from '../../src/i18n';
import type { AgentInfo, AppConfig } from '../../src/types';

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

  render(
    <I18nProvider initial="en">
      <EntryShell {...props} />
    </I18nProvider>,
  );

  return props;
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

beforeEach(() => {
  globalThis.fetch = originalFetch;
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
      expect(fetchMock).toHaveBeenCalledWith('/api/integrations/vela/login', { method: 'POST' });
    });
    expect(screen.getByText('Signing in…')).toBeTruthy();
    expect(screen.queryByText('Not signed in')).toBeNull();
    expect(signIn.hasAttribute('disabled')).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(screen.getByText('Signing in…')).toBeTruthy();
    expect(props.onCompleteOnboarding).not.toHaveBeenCalled();
    expect(screen.getByText('Connect')).toBeTruthy();
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
    expect(screen.getByRole('button', { name: /^Continue$/i }).hasAttribute('disabled')).toBe(false);
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
    expect(fetchMock).toHaveBeenCalledWith('/api/integrations/vela/login', { method: 'POST' });
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

  it('lets Skip exit onboarding without starting AMR login', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    );
    globalThis.fetch = fetchMock as typeof fetch;
    const props = renderOnboarding();

    fireEvent.click(screen.getByRole('button', { name: /Skip/i }));

    expect(props.onCompleteOnboarding).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/integrations/vela/login'))).toBe(false);
  });
});

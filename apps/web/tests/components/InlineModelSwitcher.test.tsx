// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InlineModelSwitcher } from '../../src/components/InlineModelSwitcher';
import { AMR_LOGIN_TIMEOUT_MS } from '../../src/components/amrLoginPolling';
import type { AgentInfo, AppConfig } from '../../src/types';

const baseConfig: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  agentId: 'amr',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  agentModels: {},
  agentCliEnv: {},
};

const amrAgent: AgentInfo = {
  id: 'amr',
  name: 'AMR (vela)',
  bin: 'amr',
  available: true,
  version: '1.0.0',
  models: [
    { id: 'default', label: 'Default' },
    { id: 'amr-cloud-latest', label: 'AMR Cloud Latest' },
  ],
};

const codexAgent: AgentInfo = {
  id: 'codex',
  name: 'Codex CLI',
  bin: 'codex',
  available: true,
  version: '0.133.0-alpha.1',
  models: [{ id: 'default', label: 'Default' }],
};

function renderSwitcher(
  config: Partial<AppConfig> = {},
  agents: AgentInfo[] = [amrAgent],
) {
  const onAgentModelChange = vi.fn();
  const view = render(
    <InlineModelSwitcher
      config={{ ...baseConfig, ...config }}
      agents={agents}
      daemonLive={true}
      onModeChange={vi.fn()}
      onAgentChange={vi.fn()}
      onAgentModelChange={onAgentModelChange}
      onApiProtocolChange={vi.fn()}
      onApiModelChange={vi.fn()}
      onOpenSettings={vi.fn()}
    />,
  );
  return { ...view, onAgentModelChange };
}

describe('InlineModelSwitcher AMR row', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    try {
      window.localStorage.clear();
    } catch {
      // jsdom normally exposes localStorage; keep cleanup tolerant.
    }
  });

  it('shows the AMR reminder dot once when another CLI is selected', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: false,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const view = renderSwitcher(
      { agentId: 'codex' },
      [amrAgent, codexAgent],
    );

    expect(screen.getByTestId('inline-model-switcher-amr-reminder')).toBeTruthy();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    expect(screen.queryByTestId('inline-model-switcher-amr-reminder')).toBeNull();
    const popover = screen.getByTestId('inline-model-switcher-popover');
    expect(
      within(popover).getByTestId('inline-model-switcher-agent-amr-reminder'),
    ).toBeTruthy();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    expect(
      screen.queryByTestId('inline-model-switcher-agent-amr-reminder'),
    ).toBeNull();

    view.unmount();
    renderSwitcher({ agentId: 'codex' }, [amrAgent, codexAgent]);
    expect(screen.queryByTestId('inline-model-switcher-amr-reminder')).toBeNull();
  });

  it('does not show the AMR reminder dot when AMR is already selected', () => {
    renderSwitcher({}, [amrAgent, codexAgent]);

    expect(screen.queryByTestId('inline-model-switcher-amr-reminder')).toBeNull();
  });

  it('labels AMR without vela branding and keeps AMR models from AgentInfo.models', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: false,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher();

    expect(screen.getByTestId('inline-model-switcher-chip').textContent).toContain('AMR');
    expect(screen.getByTestId('inline-model-switcher-chip').textContent).not.toContain(
      'Open Design AMR',
    );

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    const amrButton = await within(popover).findByRole('radio', {
      name: /^AMR\s+Sign in$/i,
    });
    expect(within(amrButton).getByText(/Sign in/i)).toBeTruthy();
    expect(amrButton.querySelector('.inline-switcher__agent-status-icon')).toBeNull();
    expect(amrButton.querySelector('.inline-switcher__agent-action-label')).toBeTruthy();
    expect(within(popover).queryByText(/AMR \(vela\)/i)).toBeNull();
    expect(within(popover).queryByText(/vela/i)).toBeNull();
    expect(within(popover).queryByText(/Not signed in/i)).toBeNull();
    expect(within(popover).queryByRole('button', { name: 'Sign in' })).toBeNull();

    const modelSelect = within(popover).getByTestId(
      'inline-model-switcher-agent-model',
    ) as HTMLSelectElement;
    expect(Array.from(modelSelect.options).map((option) => option.value)).toEqual([
      'default',
      'amr-cloud-latest',
    ]);
  });

  it('persists the live AMR fallback when the saved AMR model is stale', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(
        JSON.stringify({
          loggedIn: true,
          profile: 'default',
          user: null,
          configPath: '/Users/test/.vela/config.json',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ));

    const { onAgentModelChange } = renderSwitcher({
      agentModels: { amr: { model: 'gpt-5.4-mini', reasoning: 'default' } },
    });

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    const modelSelect = within(popover).getByTestId(
      'inline-model-switcher-agent-model',
    ) as HTMLSelectElement;
    expect(modelSelect.value).toBe('default');
    expect(Array.from(modelSelect.options).map((option) => option.value)).toEqual([
      'default',
      'amr-cloud-latest',
    ]);
    await waitFor(() => {
      expect(onAgentModelChange).toHaveBeenCalledWith('amr', {
        model: 'default',
        reasoning: 'default',
      });
    });
  });

  it('shows icon-only signed-in status instead of account information in the AMR button', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: true,
            profile: 'default',
            user: {
              id: 'user-1',
              email: 'manual-amr@example.local',
              name: 'Manual AMR Test User',
            },
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    const amrButton = await within(popover).findByRole('radio', {
      name: /^AMR\s+Signed in$/i,
    });
    expect(within(amrButton).getByText(/Signed in/i)).toBeTruthy();
    expect(within(popover).queryByText(/manual-amr@example\.local/i)).toBeNull();
    expect(within(popover).queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('treats env-backed AMR login as signed in even when no user profile is available', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: true,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    const amrButton = await within(popover).findByRole('radio', {
      name: /^AMR\s+Signed in$/i,
    });
    expect(within(amrButton).getByText(/Signed in/i)).toBeTruthy();
    expect(within(popover).queryByText(/@/i)).toBeNull();
    expect(within(popover).queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('renders daemon-reported in-flight login attempts as cancelable', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: true,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher();
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    const amrButton = await within(popover).findByRole('radio', {
      name: /^AMR\s+Signing in/i,
    });
    expect(within(amrButton).getByText(/Signing in/i)).toBeTruthy();
    expect(within(amrButton).getByText('Cancel sign-in')).toBeTruthy();
  });

  it('refreshes stale signed-in AMR status before starting login', async () => {
    let statusCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        statusCalls += 1;
        return new Response(
          JSON.stringify(
            statusCalls === 1
              ? {
                  loggedIn: true,
                  loginInFlight: false,
                  profile: 'default',
                  user: { id: 'user-1', email: 'manual-amr@example.local' },
                  configPath: '/Users/test/.amr/config.json',
                }
              : {
                  loggedIn: false,
                  loginInFlight: false,
                  profile: 'default',
                  user: null,
                  configPath: '/Users/test/.amr/config.json',
                },
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        return new Response(JSON.stringify({ pid: 123 }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher();
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    const amrButton = await within(popover).findByRole('radio', {
      name: /^AMR\s+Signed in$/i,
    });
    fireEvent.click(amrButton);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/integrations/vela/login', { method: 'POST' });
    expect(
      within(popover).getByRole('radio', { name: /^AMR\s+Signing in/i }),
    ).toBeTruthy();
  });

  it('cancels a timed-out AMR sign-in from the inline switcher', async () => {
    let loginStarted = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: loginStarted,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        loginStarted = true;
        return new Response(JSON.stringify({ pid: 123 }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/integrations/vela/login/cancel' && init?.method === 'POST') {
        loginStarted = false;
        return new Response(JSON.stringify({ canceled: true, pids: [123] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher();
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    const amrButton = await within(popover).findByRole('radio', {
      name: /^AMR\s+Sign in$/i,
    });
    vi.useFakeTimers();
    fireEvent.click(amrButton);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/integrations/vela/login', { method: 'POST' });
    expect(
      within(popover).getByRole('radio', { name: /^AMR\s+Signing in/i }),
    ).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_TIMEOUT_MS);
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/integrations/vela/login/cancel', { method: 'POST' });
    expect(
      within(popover).getByRole('radio', { name: /^AMR\s+AMR sign-in failed\./i }),
    ).toBeTruthy();
    expect(within(popover).getByText('Sign in')).toBeTruthy();
    expect(popover.querySelector('.inline-switcher__agent-status-icon.is-error')).toBeNull();
  });

  it('turns the pending AMR row into a cancel action', async () => {
    let loginStarted = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: loginStarted,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        loginStarted = true;
        return new Response(JSON.stringify({ pid: 123 }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/integrations/vela/login/cancel' && init?.method === 'POST') {
        loginStarted = false;
        return new Response(JSON.stringify({ canceled: true, pids: [123] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher();
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    let amrButton = await within(popover).findByRole('radio', {
      name: /^AMR\s+Sign in$/i,
    });
    vi.useFakeTimers();
    fireEvent.click(amrButton);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    amrButton = within(popover).getByRole('radio', {
      name: /^AMR\s+Signing in/i,
    });
    expect(within(amrButton).getByText(/Signing in/i)).toBeTruthy();
    expect(within(amrButton).getByText('Cancel sign-in')).toBeTruthy();

    fireEvent.click(amrButton);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/integrations/vela/login/cancel', { method: 'POST' });
    expect(
      within(popover).getByRole('radio', { name: /^AMR\s+Sign in$/i }),
    ).toBeTruthy();
  });

  it('re-reads AMR status on reopen and converges from signed-in back to Sign in when later status is loggedOut', async () => {
    let statusCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        statusCalls += 1;
        return new Response(
          JSON.stringify(
            statusCalls === 1
              ? {
                  loggedIn: true,
                  profile: 'default',
                  user: { id: 'user-1', email: 'manual-amr@example.local' },
                  configPath: '/Users/test/.amr/config.json',
                }
              : {
                  loggedIn: false,
                  profile: 'default',
                  user: null,
                  configPath: '/Users/test/.amr/config.json',
                },
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    let popover = screen.getByTestId('inline-model-switcher-popover');
    await within(popover).findByRole('radio', { name: /^AMR\s+Signed in$/i });

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    popover = screen.getByTestId('inline-model-switcher-popover');
    await within(popover).findByRole('radio', { name: /^AMR\s+Sign in$/i });
    expect(within(popover).queryByRole('radio', { name: /^AMR\s+Signed in$/i })).toBeNull();
  });

  it('starts AMR re-login only after the user explicitly clicks the signed-out AMR row', async () => {
    let loginCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: false,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        loginCalls += 1;
        return new Response(JSON.stringify({ pid: 4242 }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const onAgentChange = vi.fn();
    render(
      <InlineModelSwitcher
        config={baseConfig}
        agents={[amrAgent]}
        daemonLive={true}
        onModeChange={vi.fn()}
        onAgentChange={onAgentChange}
        onAgentModelChange={vi.fn()}
        onApiProtocolChange={vi.fn()}
        onApiModelChange={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    const popover = screen.getByTestId('inline-model-switcher-popover');
    await within(popover).findByRole('radio', { name: /^AMR\s+Sign in$/i });
    expect(loginCalls).toBe(0);

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    const reopenedPopover = screen.getByTestId('inline-model-switcher-popover');
    const reopenedAmrButton = await within(reopenedPopover).findByRole('radio', {
      name: /^AMR\s+Sign in$/i,
    });
    expect(loginCalls).toBe(0);

    fireEvent.click(reopenedAmrButton);
    await waitFor(() => {
      expect(loginCalls).toBe(1);
      expect(onAgentChange).toHaveBeenCalledWith('amr');
    });
  });
});

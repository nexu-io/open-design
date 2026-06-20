// @vitest-environment jsdom

import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryShell } from '../../src/components/EntryShell';
import { AMR_LOGIN_TIMEOUT_MS } from '../../src/components/amrLoginPolling';
import { providerModelsCacheKey } from '../../src/components/providerModelsCache';
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
  const props = onboardingProps(overrides);

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

function onboardingProps(
  overrides: Partial<React.ComponentProps<typeof EntryShell>> = {},
): React.ComponentProps<typeof EntryShell> {
  return {
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

// About-you fields are now chip groups (OnboardingChipField), not dropdowns:
// each option is a `button` carrying the option label. Scope to the field's
// chip group so option labels don't collide across fields, then click the chip.
function chooseChipOption(label: string, option: string | RegExp) {
  const field = screen
    .getAllByText(label)
    .map((node) => node.closest('.onboarding-chip-field'))
    .find((node): node is HTMLElement => node instanceof HTMLElement);
  if (!field) throw new Error(`chip field not found: ${label}`);
  const matcher = option instanceof RegExp ? option : new RegExp(option, 'i');
  const chip = Array.from(field.querySelectorAll('button.onboarding-chip')).find(
    (node): node is HTMLButtonElement =>
      node instanceof HTMLButtonElement && matcher.test(node.textContent ?? ''),
  );
  if (!chip) throw new Error(`chip option not found: ${label} / ${String(option)}`);
  fireEvent.click(chip);
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
          inviteCode: '9ptkbbqRu',
          inviteUrl: 'https://discord.gg/9ptkbbqRu',
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

  it('shows the Open Design Cloud sign-in landing as the default Connect face', async () => {
    // The recommended-AMR-card concept is gone. Step 0 now renders a centered
    // cloud sign-in landing: the primary CTA is the cloud sign-in button
    // (signed-out copy), with no runtime card and no agent version text.
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    const props = renderOnboarding();

    const cloudButton = await screen.findByRole('button', {
      name: /Sign in to Open Design Cloud/i,
    });
    expect(cloudButton).toBeTruthy();
    // No runtime card, no AMR version text, no "Sign in to continue" CTA.
    expect(screen.queryByRole('button', { name: /Open Design AMR/i })).toBeNull();
    expect(screen.queryByText('AMR v0.1.0')).toBeNull();
    expect(screen.queryByRole('button', { name: /Sign in to continue/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /Authorize AMR/i })).toBeNull();
    // The secondary runtime links remain available on the landing.
    expect(screen.getByRole('button', { name: /Local coding agent/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Bring your own key/i })).toBeTruthy();
    // The AMR runtime still auto-selects under the hood once detected.
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

  it('reuses cached available CLI agents without refreshing and reports the preserved selection', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    const refreshAgents = vi.fn(() => {
      throw new Error('refresh should not run for cached agents');
    });
    const cursorAgent = cliAgent({
      id: 'cursor-agent',
      name: 'Cursor Agent',
      bin: 'cursor-agent',
    });
    const props = renderOnboarding({
      config: baseConfig({ agentId: 'cursor-agent' }),
      agents: [
        amrAgent(),
        cliAgent({ id: 'codex', name: 'Codex CLI', bin: 'codex' }),
        cursorAgent,
      ],
      onRefreshAgents: refreshAgents,
    });

    fireEvent.click(screen.getByRole('button', { name: /Local coding agent/i }));

    await waitFor(() => {
      expect(trackedEvents('onboarding_runtime_scan_result')).toHaveLength(1);
    });
    expect(refreshAgents).not.toHaveBeenCalled();
    expect(props.onAgentChange).not.toHaveBeenCalledWith('codex');
    expect(latestTrackedEvent('onboarding_runtime_scan_result')).toMatchObject({
      result: 'success',
      detected_cli_count: 3,
      available_cli_count: 2,
      selected_cli_id: 'cursor_agent',
    });
  });

  it('resolves cached CLI reuse through the loading effect without duplicate scan telemetry', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    const refreshAgents = vi.fn(() => {
      throw new Error('refresh should not run while cached agents are still loading');
    });
    const props = onboardingProps({
      agents: [amrAgent()],
      agentsLoading: true,
      onRefreshAgents: refreshAgents,
    });
    const view = render(
      <I18nProvider initial="en">
        <EntryShell {...props} />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Local coding agent/i }));
    await act(async () => {});
    expect(refreshAgents).not.toHaveBeenCalled();
    expect(trackedEvents('onboarding_runtime_scan_result')).toHaveLength(0);

    view.rerender(
      <I18nProvider initial="en">
        <EntryShell
          {...props}
          agents={[amrAgent(), cliAgent({ id: 'codex', name: 'Codex CLI', bin: 'codex' })]}
          agentsLoading={false}
        />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(trackedEvents('onboarding_runtime_scan_result')).toHaveLength(1);
    });
    expect(refreshAgents).not.toHaveBeenCalled();
    expect(latestTrackedEvent('onboarding_runtime_scan_result')).toMatchObject({
      result: 'success',
      detected_cli_count: 2,
      available_cli_count: 1,
      selected_cli_id: 'codex_cli',
    });
  });

  it('refreshes exactly once when the cached CLI list is empty', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    const refreshAgents = vi.fn(() => [
      amrAgent(),
      cliAgent({ id: 'codex', name: 'Codex CLI', bin: 'codex' }),
    ]);
    renderOnboarding({
      agents: [amrAgent()],
      agentsLoading: false,
      onRefreshAgents: refreshAgents,
    });

    fireEvent.click(screen.getByRole('button', { name: /Local coding agent/i }));
    await act(async () => {});

    await waitFor(() => {
      expect(trackedEvents('onboarding_runtime_scan_result')).toHaveLength(1);
    });
    expect(refreshAgents).toHaveBeenCalledTimes(1);
    expect(latestTrackedEvent('onboarding_runtime_scan_result')).toMatchObject({
      result: 'success',
      detected_cli_count: 2,
      available_cli_count: 1,
      selected_cli_id: 'codex_cli',
    });
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

    // The AMR/cloud sign-in is now triggered by the landing primary button.
    const signIn = await screen.findByRole('button', {
      name: /Sign in to Open Design Cloud/i,
    });
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
    // The cloud-landing sign-in records the AMR card entry first, then reuses
    // it for the sign-in-to-continue entry, so the attribution carried into the
    // login request keeps the original `onboarding_amr_card` source detail.
    expect(JSON.parse(String(loginInit.body))).toMatchObject({
      attribution: {
        entryId: expect.stringMatching(/^od-amr-/u),
        sourceProduct: 'open_design',
        sourceDetail: 'onboarding_amr_card',
      },
    });
    // While signing in: the landing button reads "Signing in…" and is disabled,
    // a Cancel sign-in button appears, and onboarding does not advance.
    expect(screen.getByText('Signing in…')).toBeTruthy();
    expect(screen.queryByText('Not signed in')).toBeNull();
    expect(signIn.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /Cancel sign-in/i })).toBeTruthy();
    await vi.advanceTimersByTimeAsync(2000);
    expect(screen.getByText('Signing in…')).toBeTruthy();
    expect(props.onCompleteOnboarding).not.toHaveBeenCalled();
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

    fireEvent.click(
      await screen.findByRole('button', { name: /Sign in to Open Design Cloud/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(startupError);
    });
    expect(screen.queryByText('AMR sign-in failed.')).toBeNull();
    expect(screen.queryByText('Signing in…')).toBeNull();
  });

  it('clears AMR login pending when the user cancels the cloud sign-in', async () => {
    // On the redesigned landing, the "Cancel sign-in" button is the way to
    // back out of an in-flight AMR/cloud login. Cancelling clears the
    // login-pending state, hides the "Signing in…" copy, restores the landing
    // primary CTA, and re-surfaces the secondary runtime links.
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' });
      }
      if (url.endsWith('/api/integrations/vela/login') && init?.method === 'POST') {
        return jsonResponse({ pid: 123 }, 202);
      }
      if (url.endsWith('/api/integrations/vela/login/cancel') && init?.method === 'POST') {
        return jsonResponse({ canceled: true, pids: [123] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    renderOnboarding();

    const signIn = await screen.findByRole('button', {
      name: /Sign in to Open Design Cloud/i,
    });
    fireEvent.click(signIn);
    await waitFor(() => {
      expect(screen.getByText('Signing in…')).toBeTruthy();
    });
    expect(signIn.hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Cancel sign-in/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/integrations/vela/login/cancel', {
        method: 'POST',
      });
    });

    expect(screen.queryByText('Signing in…')).toBeNull();
    // The landing CTA returns to its signed-out copy and is enabled again,
    // and the secondary runtime links are available once more.
    const cloudButton = await screen.findByRole('button', {
      name: /Sign in to Open Design Cloud/i,
    });
    expect(cloudButton.hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: /Local coding agent/i })).toBeTruthy();
  });

  it('surfaces a runtime-specific gate tooltip on the bottom Continue CTA', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    renderOnboarding();

    // Expand the BYOK panel from the landing. With no verified connection,
    // the bottom Continue is gated (aria-disabled) and its tooltip points the
    // user at adding/testing their model key.
    fireEvent.click(await screen.findByRole('button', { name: /Bring your own key/i }));
    await act(async () => {});
    const byokContinue = screen.getByRole('button', { name: /^Continue$/i });
    expect(byokContinue.getAttribute('aria-disabled')).toBe('true');
    expect(byokContinue.getAttribute('data-tooltip')).toMatch(/model key/i);

    // Back to the landing, then expand the Local panel. With no committed
    // agent, Continue is gated and the tooltip points at selecting a local CLI.
    fireEvent.click(screen.getByRole('button', { name: /^Back$/i }));
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /Local coding agent/i }));
    await act(async () => {});
    const localContinue = screen.getByRole('button', { name: /^Continue$/i });
    expect(localContinue.getAttribute('aria-disabled')).toBe('true');
    expect(localContinue.getAttribute('data-tooltip')).toMatch(/local CLI/i);
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

    const signIn = await screen.findByRole('button', {
      name: /Sign in to Open Design Cloud/i,
    });
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
    expect(
      screen
        .getByRole('button', { name: /Sign in to Open Design Cloud/i })
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

    const signIn = await screen.findByRole('button', {
      name: /Sign in to Open Design Cloud/i,
    });
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

    const signIn = await screen.findByRole('button', {
      name: /Sign in to Open Design Cloud/i,
    });
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

    // Signed in: the landing primary CTA reads "Continue (signed in)" and
    // clicking it advances straight to the About-you step. No account email,
    // no authorize affordance, no AMR version text on the landing.
    const continueButton = await screen.findByRole('button', {
      name: /Continue \(signed in\)/i,
    });
    expect(screen.queryByText('user@example.com')).toBeNull();
    expect(screen.queryByText('Authorized')).toBeNull();
    expect(screen.queryByRole('link', { name: /Authorize AMR/i })).toBeNull();

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

    fireEvent.click(
      await screen.findByRole('button', { name: /Continue \(signed in\)/i }),
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'About you' })).toBeTruthy();
    });

    chooseChipOption('Your role', 'Engineer');
    chooseChipOption('Organization size', /Growth company/i);
    chooseChipOption('Use case', /Product design/i);
    chooseChipOption('Where did you hear about us?', /Search/i);
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
    fireEvent.click(
      await screen.findByRole('button', { name: /Continue \(signed in\)/i }),
    );
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

    fireEvent.click(
      await screen.findByRole('button', { name: /Continue \(signed in\)/i }),
    );
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

    fireEvent.click(
      await screen.findByRole('button', { name: /Continue \(signed in\)/i }),
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'About you' })).toBeTruthy();
    });
    chooseChipOption('Your role', 'Engineer');

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

    fireEvent.click(
      await screen.findByRole('button', { name: /Continue \(signed in\)/i }),
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'About you' })).toBeTruthy();
    });
    chooseChipOption('Your role', 'Engineer');

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
            { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
            { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
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

  it('automatically fetches BYOK models and tests the selected model in onboarding', async () => {
    const fetchMock = vi.fn(async (input, init) => {
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
            { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
            { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
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
    });
    globalThis.fetch = fetchMock as typeof fetch;
    renderOnboarding();

    fireEvent.click(screen.getByRole('button', { name: /Bring your own key/i }));
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'test-api-key' } });
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://api.anthropic.com' } });

    await waitFor(() => {
      expect(screen.getByText('Fetched 2 models.')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText(/Connected\. Replied in 12 ms/i)).toBeTruthy();
    });
    const providerModelCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/api/provider/models'),
    );
    const connectionTestCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/api/test/connection'),
    );
    expect(providerModelCalls).toHaveLength(1);
    expect(connectionTestCalls).toHaveLength(1);
    expect(JSON.parse(String(connectionTestCalls[0]?.[1]?.body))).toMatchObject({
      protocol: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'test-api-key',
      model: 'claude-opus-4-8',
    });
  });

  it('automatically selects a cached BYOK model before testing in onboarding', async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' });
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
    });
    globalThis.fetch = fetchMock as typeof fetch;
    const props = renderOnboarding({
      providerModelsCache: {
        [providerModelsCacheKey('anthropic', 'https://api.anthropic.com', 'test-api-key')]: [
          { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
          { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
        ],
      },
      onProviderModelsCacheChange: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: /Bring your own key/i }));
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'test-api-key' } });
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://api.anthropic.com' } });

    await waitFor(() => {
      expect(screen.getByText('Fetched 2 models.')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText(/Connected\. Replied in 12 ms/i)).toBeTruthy();
    });
    const providerModelCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/api/provider/models'),
    );
    const connectionTestCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/api/test/connection'),
    );
    expect(providerModelCalls).toHaveLength(0);
    expect(connectionTestCalls).toHaveLength(1);
    expect(props.onApiModelChange).toHaveBeenCalledWith('claude-opus-4-8');
    expect(JSON.parse(String(connectionTestCalls[0]?.[1]?.body))).toMatchObject({
      protocol: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'test-api-key',
      model: 'claude-opus-4-8',
    });
  });

  it('ignores stale BYOK model fetch responses after onboarding inputs change', async () => {
    let resolveFirstModelFetch: ((response: Response) => void) | null = null;
    let providerModelRequestCount = 0;
    const fetchMock = vi.fn((input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return Promise.resolve(
          jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
        );
      }
      if (url.endsWith('/api/provider/models') && init?.method === 'POST') {
        providerModelRequestCount += 1;
        if (providerModelRequestCount === 1) {
          return new Promise<Response>((resolve) => {
            resolveFirstModelFetch = resolve;
          });
        }
        return new Promise<Response>(() => {});
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    const props = renderOnboarding();

    fireEvent.click(screen.getByRole('button', { name: /Bring your own key/i }));
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'old-api-key' } });
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://api.anthropic.com' } });

    await waitFor(() => {
      expect(providerModelRequestCount).toBe(1);
    });

    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'new-api-key' } });

    await act(async () => {
      resolveFirstModelFetch?.(
        jsonResponse({
          ok: true,
          kind: 'success',
          latencyMs: 10,
          models: [
            { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
            { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
          ],
        }),
      );
      await Promise.resolve();
    });

    expect(props.onApiModelChange).not.toHaveBeenCalled();
    expect((props.onConfigPersist as ReturnType<typeof vi.fn>).mock.calls).not.toContainEqual([
      expect.objectContaining({
        apiKey: 'old-api-key',
        model: 'claude-opus-4-8',
      }),
    ]);
    expect((props.onConfigPersist as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]).toMatchObject({
      apiKey: 'new-api-key',
      model: '',
    });
  });

  it('ignores stale BYOK model fetch responses after switching to Local CLI', async () => {
    let resolveModelFetch: ((response: Response) => void) | null = null;
    let providerModelRequestCount = 0;
    const fetchMock = vi.fn((input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) {
        return Promise.resolve(
          jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
        );
      }
      if (url.endsWith('/api/provider/models') && init?.method === 'POST') {
        providerModelRequestCount += 1;
        return new Promise<Response>((resolve) => {
          resolveModelFetch = resolve;
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    const props = renderOnboarding();

    fireEvent.click(screen.getByRole('button', { name: /Bring your own key/i }));
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'test-api-key' } });
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://api.anthropic.com' } });

    await waitFor(() => {
      expect(providerModelRequestCount).toBe(1);
    });

    // The secondary runtime links only live on the cloud landing, so collapse
    // the BYOK panel via Back before switching to the Local CLI runtime.
    fireEvent.click(screen.getByRole('button', { name: /^Back$/i }));
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /Local coding agent/i }));
    await act(async () => {});

    await act(async () => {
      resolveModelFetch?.(
        jsonResponse({
          ok: true,
          kind: 'success',
          latencyMs: 10,
          models: [
            { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
            { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
          ],
        }),
      );
      await Promise.resolve();
    });

    expect(props.onApiModelChange).not.toHaveBeenCalledWith('claude-opus-4-8');
    expect((props.onConfigPersist as ReturnType<typeof vi.fn>).mock.calls).not.toContainEqual([
      expect.objectContaining({
        mode: 'api',
        model: 'claude-opus-4-8',
      }),
    ]);
    expect(props.onModeChange).toHaveBeenCalledWith('daemon');
  });

  it('keeps the cloud sign-in landing usable while AMR agent detection is still in flight', async () => {
    // The redesigned Connect step no longer renders an AMR runtime card (and
    // therefore no skeleton placeholder). The cloud sign-in landing must still
    // be fully usable while AMR detection lags: the primary cloud CTA and the
    // secondary runtime links render regardless of agent-probe state.
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    renderOnboarding({
      agents: [cliAgent()], // AMR has not surfaced from the stream yet
      agentsLoading: true, // cold-start detection stream still running
      onRefreshAgents: vi.fn(() => [cliAgent()]),
    });

    // No AMR card, no skeleton placeholder during detection.
    expect(screen.queryByRole('button', { name: /Open Design AMR/i })).toBeNull();
    expect(document.querySelector('.onboarding-view__card--skeleton')).toBeNull();
    // The cloud sign-in landing and its alternatives remain available.
    expect(
      await screen.findByRole('button', { name: /Sign in to Open Design Cloud/i }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /Local coding agent/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Bring your own key/i })).toBeTruthy();
  });

  it('renders the cloud sign-in landing and no AMR card once AMR is available', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    renderOnboarding({ agentsLoading: false });

    expect(
      await screen.findByRole('button', { name: /Sign in to Open Design Cloud/i }),
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

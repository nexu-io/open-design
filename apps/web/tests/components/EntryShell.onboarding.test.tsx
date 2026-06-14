// @vitest-environment jsdom

import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryShell } from '../../src/components/EntryShell';
import { AMR_LOGIN_POLL_INTERVAL_MS } from '../../src/components/amrLoginPolling';
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

async function advanceToGenerateStep() {
  fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
  await screen.findByRole('heading', { name: /Give Open Design a little material/i });
  fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
  await screen.findByRole('heading', { name: /Confirm the starter brief/i });
  fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
  await screen.findByRole('heading', { name: /Log in to AMR/i });
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

describe('EntryShell onboarding starter generation flow', () => {
  it('starts with the goal picker and keeps setup work out of the first screen', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    renderOnboarding();

    expect(screen.getByRole('heading', { name: /What do you want to make/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Presentation \/ deck/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Landing pages/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Prototype \/ app UI/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Dashboards \/ internal tools/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ads \/ social content/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Design system/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Open Design AMR/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: /About you/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: /Stay in the loop/i })).toBeNull();
    await waitFor(() => {
      expect(trackedEvents('page_view').map(([, payload]) => payload)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            page_name: 'onboarding',
            area: 'goal',
            step_index: '1',
            step_name: 'goal',
          }),
        ]),
      );
    });
  });

  it('builds a brief, uses signed-in AMR, and creates the first starter project', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        loggedIn: true,
        profile: 'prod',
        configPath: '/x',
        user: { id: 'u', email: 'user@example.com' },
      }),
    ) as typeof fetch;
    const props = renderOnboarding({
      defaultDesignSystemId: 'ds-default',
      onCreateProject: vi.fn(async () => true),
    });

    fireEvent.click(screen.getByRole('button', { name: /Prototype \/ app UI/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await screen.findByRole('heading', { name: /Give Open Design a little material/i });
    fireEvent.click(screen.getByRole('button', { name: /Paste website URL/i }));
    fireEvent.change(screen.getByLabelText('Website URL'), {
      target: { value: 'https://example.com/product' },
    });
    fireEvent.change(screen.getByLabelText('Anything else to include?'), {
      target: { value: 'Create a clean onboarding flow for a B2B product.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));

    await screen.findByRole('heading', { name: /Confirm the starter brief/i });
    expect(screen.getByText('App / product prototype')).toBeTruthy();
    expect(screen.getByText('https://example.com/product')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await screen.findByRole('heading', { name: /Log in to AMR/i });
    expect(screen.getByRole('button', { name: /AMR is connected/i }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /Continue to generation/i }));

    await screen.findByRole('heading', { name: /Start generating/i });
    fireEvent.click(screen.getByRole('button', { name: /Start generating/i }));

    await waitFor(() => {
      expect(props.onCreateProject).toHaveBeenCalledTimes(1);
    });
    expect(props.onCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'App / product prototype for example.com',
        designSystemId: 'ds-default',
        conversationMode: 'design',
        autoSendFirstMessage: true,
        metadata: expect.objectContaining({
          kind: 'prototype',
          nameSource: 'generated',
        }),
        pendingPrompt: expect.stringContaining('App / product prototype'),
      }),
    );
    const createInput = (props.onCreateProject as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(createInput.pendingPrompt).toContain('https://example.com/product');
    expect(createInput.pendingPrompt).toContain('Create a clean onboarding flow');
    expect(createInput.pluginId).toBeTruthy();
    expect(props.onModeChange).toHaveBeenCalledWith('daemon');
    expect(props.onAgentChange).toHaveBeenCalledWith('amr');
    expect(props.onCompleteOnboarding).toHaveBeenCalledTimes(1);
    expect(latestTrackedEvent('onboarding_complete_result')).toMatchObject({
      page_name: 'onboarding',
      area: 'onboarding',
      result: 'completed',
      completion_type: 'completed_without_design_system',
      runtime_type: 'amr_cloud',
      has_about_you: false,
      has_design_system_request: false,
      source_count: 1,
    });
  });

  it('signs into AMR before generation and keeps the user in control of the start', async () => {
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
    const props = renderOnboarding({ onCreateProject: vi.fn(async () => true) });
    await advanceToGenerateStep();
    const signIn = await screen.findByRole('button', {
      name: /Log in to AMR and check credit/i,
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
    expect(JSON.parse(String(loginInit.body))).toMatchObject({
      attribution: {
        entryId: expect.stringMatching(/^od-amr-/u),
        sourceProduct: 'open_design',
        sourceDetail: 'onboarding_amr_sign_in_continue',
      },
    });
    expect(screen.getByText('Signing in…')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);
    });

    await vi.waitFor(() => {
      expect(screen.getByRole('heading', { name: /Start generating/i })).toBeTruthy();
    });
    expect(props.onCreateProject).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Start generating/i }));

    await vi.waitFor(() => {
      expect(props.onCreateProject).toHaveBeenCalledTimes(1);
    });
    expect(props.onCompleteOnboarding).toHaveBeenCalledTimes(1);
  });

  it('keeps AMR out of the local CLI list behind advanced options', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    renderOnboarding();
    await advanceToGenerateStep();

    fireEvent.click(screen.getByRole('button', { name: /Local CLI \/ BYOK backup options/i }));
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /Local coding agent/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const localPanel = screen.getByText('Local CLI').closest('.onboarding-view__setup-panel');
    expect(localPanel?.textContent).toContain('Claude Code');
    expect(localPanel?.textContent).not.toContain('AMR');
    expect(screen.getByRole('button', { name: /Continue to generation/i })).toBeTruthy();
  });

  it('persists the BYOK config before generating the starter project', async () => {
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
    const props = renderOnboarding({ onCreateProject: vi.fn(async () => true) });
    await advanceToGenerateStep();

    fireEvent.click(screen.getByRole('button', { name: /Local CLI \/ BYOK backup options/i }));
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

    fireEvent.click(screen.getByRole('button', { name: /Continue to generation/i }));
    await screen.findByRole('heading', { name: /Start generating/i });
    fireEvent.click(screen.getByRole('button', { name: /Start generating/i }));

    await waitFor(() => {
      expect(props.onCreateProject).toHaveBeenCalledTimes(1);
    });
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

  it('shows the AMR starter credit card as a skeleton while detection is still in flight', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;
    renderOnboarding({
      agents: [cliAgent()],
      agentsLoading: true,
      onRefreshAgents: vi.fn(() => [cliAgent()]),
    });
    await advanceToGenerateStep();

    const skeleton = document.querySelector('.onboarding-view__card--skeleton');
    expect(skeleton).toBeTruthy();
    expect(skeleton?.textContent).toContain('Open Design AMR');
    expect(skeleton?.getAttribute('aria-busy')).toBe('true');
    expect(skeleton?.querySelectorAll('.onboarding-view__skeleton-line--benefit').length).toBe(4);
    expect(skeleton?.querySelector('.onboarding-view__skeleton-model-bar')).toBeTruthy();
    const realAmrCard = document.querySelector(
      '.onboarding-view__amr-cloud-card .onboarding-view__card:not(.onboarding-view__card--skeleton)',
    );
    expect(realAmrCard).toBeNull();
    expect(screen.getByRole('button', { name: /Local CLI \/ BYOK backup options/i })).toBeTruthy();
    const primary = screen.getByRole('button', { name: /Choose AMR, Local CLI, or BYOK/i });
    expect(primary).toBeInstanceOf(HTMLButtonElement);
    expect((primary as HTMLButtonElement).disabled).toBe(true);
  });

  it('lets Skip exit onboarding without starting AMR login', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      jsonResponse({ loggedIn: false, profile: 'prod', user: null, configPath: '/x' }),
    );
    globalThis.fetch = fetchMock as typeof fetch;
    const props = renderOnboarding();

    fireEvent.click(screen.getByRole('button', { name: /Skip/i }));

    expect(props.onCompleteOnboarding).toHaveBeenCalledTimes(1);
    expect(props.onConfigPersist).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/integrations/vela/login'))).toBe(false);
    expect(findTrackedEvent('ui_click', (payload) => payload.element === 'skip')).toMatchObject({
      page_name: 'onboarding',
      area: 'goal',
      element: 'skip',
      action: 'skip',
    });
    expect(latestTrackedEvent('onboarding_complete_result')).toMatchObject({
      page_name: 'onboarding',
      area: 'onboarding',
      result: 'skipped',
      completion_type: 'skipped',
      runtime_type: 'amr_cloud',
    });
  });
});

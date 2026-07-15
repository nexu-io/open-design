// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InlineModelSwitcher } from '../../src/components/InlineModelSwitcher';
import { AMR_LOGIN_TIMEOUT_MS } from '../../src/components/amrLoginPolling';
import { fetchProviderModels } from '../../src/providers/provider-models';
import { providerModelsCacheKey } from '../../src/components/providerModelsCache';
import type { AgentInfo, AppConfig, ProviderModelOption } from '../../src/types';

function optionNames(container: HTMLElement): string[] {
  return within(container).getAllByRole('option').map((option) => {
    const labelledBy = option.getAttribute('aria-labelledby');
    if (!labelledBy) return option.textContent?.trim() ?? '';
    return labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ');
  });
}

vi.mock('../../src/providers/provider-models', () => ({
  fetchProviderModels: vi.fn(),
}));

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
  providerModelsCache: Record<string, ProviderModelOption[]> = {},
  options: { compact?: boolean } = {},
) {
  const onAgentModelChange = vi.fn();
  const view = render(
    <InlineModelSwitcher
      config={{ ...baseConfig, ...config }}
      agents={agents}
      providerModelsCache={providerModelsCache}
      compact={options.compact}
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

function expectVelaLoginWithAttribution(
  fetchMock: ReturnType<typeof vi.fn>,
  sourceDetail: string,
) {
  const loginCall = fetchMock.mock.calls.find(([input, init]) => (
    input.toString() === '/api/integrations/vela/login'
    && (init as RequestInit | undefined)?.method === 'POST'
  ));
  expect(loginCall).toBeDefined();
  const init = loginCall?.[1] as RequestInit | undefined;
  expect(init).toEqual(expect.objectContaining({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: expect.any(String),
  }));
  const body = JSON.parse(String(init?.body)) as {
    attribution?: {
      entryId?: string;
      sourceProduct?: string;
      sourceDetail?: string;
      occurredAt?: string;
    };
  };
  expect(body.attribution).toEqual(expect.objectContaining({
    entryId: expect.stringMatching(/^od-amr-/u),
    sourceProduct: 'open_design',
    sourceDetail,
  }));
  expect(Number.isFinite(Date.parse(body.attribution?.occurredAt ?? ''))).toBe(true);
}

describe('InlineModelSwitcher AMR row', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(fetchProviderModels).mockReset();
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
      within(popover).getByTestId('inline-model-switcher-account-amr-reminder'),
    ).toBeTruthy();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    expect(
      screen.queryByTestId('inline-model-switcher-account-amr-reminder'),
    ).toBeNull();

    view.unmount();
    renderSwitcher({ agentId: 'codex' }, [amrAgent, codexAgent]);
    expect(screen.queryByTestId('inline-model-switcher-amr-reminder')).toBeNull();
  });

  it('keeps an accessible name on the chip when the icon-only treatment hides its text', () => {
    // Regression: in the icon-only topbar treatment `.inline-switcher__chip-text`
    // is `display: none`, so the visible label is removed from the accessibility
    // tree. The button must still expose a real accessible name (CLI/model state)
    // for screen-reader users, not just an icon plus a `data-tooltip` hint.
    renderSwitcher({}, [amrAgent, codexAgent]);

    const chip = screen.getByRole('button', {
      name: /Open Design/i,
    });
    expect(chip).toBe(screen.getByTestId('inline-model-switcher-chip'));
    expect(chip.getAttribute('aria-label')).toMatch(/·/u);
  });

  it('shows an explicit AMR default choice instead of the concrete catalog fallback', () => {
    renderSwitcher(
      {
        agentId: 'amr',
        agentModels: { amr: { model: 'default', reasoning: 'default' } },
      },
      [
        {
          ...amrAgent,
          models: [
            { id: 'kimi-k2.6', label: 'Kimi K2.6', default: true },
            { id: 'glm-5.1', label: 'GLM 5.1' },
          ],
        },
      ],
    );

    const chip = screen.getByTestId('inline-model-switcher-chip');
    expect(chip.getAttribute('aria-label')).toContain('Open Design');
    expect(chip.getAttribute('aria-label')).toContain('default');
    expect(chip.getAttribute('aria-label')).not.toContain('Kimi K2.6');

    fireEvent.click(chip);
    expect(screen.getByTestId('inline-model-switcher-agent-model')).toHaveTextContent('default');
  });

  it('does not show the AMR reminder dot when AMR is already selected', () => {
    renderSwitcher({}, [amrAgent, codexAgent]);

    expect(screen.queryByTestId('inline-model-switcher-amr-reminder')).toBeNull();
  });

  it('can render the compact home-hero chip variant', () => {
    renderSwitcher({}, [amrAgent, codexAgent], {}, { compact: true });

    expect(screen.getByTestId('inline-model-switcher').className).toContain(
      'inline-switcher--compact',
    );
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

    expect(screen.getByTestId('inline-model-switcher-chip').textContent).toContain(
      'Open Design',
    );
    expect(screen.getByTestId('inline-model-switcher-chip').textContent).not.toContain('AMR');

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    expect(within(popover).getByTestId('inline-model-switcher-open-settings')).toBeTruthy();
    expect(within(popover).getByRole('button', { name: /settings/i })).toBeTruthy();
    const amrButton = await within(popover).findByRole('radio', {
      name: /^Open Design\s+Sign in$/i,
    });
    expect(amrButton.querySelector('.inline-switcher__agent-status-icon')).toBeNull();
    expect(
      amrButton.querySelector('.inline-switcher__account-name')?.textContent,
    ).toBe('Open Design');
    expect(within(popover).queryByText(/AMR \(vela\)/i)).toBeNull();
    expect(within(popover).queryByText(/vela/i)).toBeNull();
    expect(within(popover).queryByText(/Not signed in/i)).toBeNull();

    const modelPicker = within(popover).getByTestId(
      'inline-model-switcher-agent-model',
    );
    expect(modelPicker.textContent).toContain('Default');
    fireEvent.click(modelPicker);
    const modelPopover = screen.getByTestId('inline-model-switcher-agent-model-popover');
    expect(optionNames(modelPopover)).toEqual(['Default', 'AMR Cloud Latest']);
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
    const modelPicker = within(popover).getByTestId(
      'inline-model-switcher-agent-model',
    );
    expect(modelPicker.textContent).toContain('Default');
    fireEvent.click(modelPicker);
    const modelPopover = screen.getByTestId('inline-model-switcher-agent-model-popover');
    expect(optionNames(modelPopover)).toEqual(['Default', 'AMR Cloud Latest']);
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
      name: /^Open Design\s+Signed in$/i,
    });
    expect(within(popover).queryByText(/manual-amr@example\.local/i)).toBeNull();
    expect(within(popover).queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('shows wallet balance in the Open Design account row when signed-in status has no account summary', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: true,
            profile: 'test',
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
      if (url === '/api/integrations/vela/wallet') {
        return new Response(
          JSON.stringify({
            status: 'available',
            profile: 'test',
            user: { id: 'user-1', email: 'manual-amr@example.local' },
            balanceUsd: '0.1000',
            updatedAt: '2026-06-23T06:05:18.782Z',
            fetchedAt: '2026-06-23T06:05:19.000Z',
            stale: false,
            source: 'daemon_cache',
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
    await within(popover).findByRole('radio', {
      name: /^Open Design\s+Signed in$/i,
    });
    await waitFor(() => {
      expect(within(popover).getByText('Balance')).toBeTruthy();
      expect(within(popover).getByText('$0.10')).toBeTruthy();
    });
  });

  it('prefers fresh signed-in status balance over an older wallet snapshot', async () => {
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
                  profile: 'test',
                  user: null,
                  configPath: '/Users/test/.amr/config.json',
                }
              : {
                  loggedIn: true,
                  profile: 'test',
                  user: null,
                  account: { plan: 'plus', balanceUsd: '42.0000' },
                  configPath: '/Users/test/.amr/config.json',
                },
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/wallet') {
        return new Response(
          JSON.stringify({
            status: 'available',
            profile: 'test',
            user: null,
            balanceUsd: '0.1000',
            updatedAt: '2026-06-23T06:05:18.782Z',
            fetchedAt: '2026-06-23T06:05:19.000Z',
            stale: false,
            source: 'daemon_cache',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    let popover = screen.getByTestId('inline-model-switcher-popover');
    await waitFor(() => {
      expect(within(popover).getByText('$0.10')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    popover = screen.getByTestId('inline-model-switcher-popover');
    await waitFor(() => {
      expect(within(popover).getByText('$42.00')).toBeTruthy();
    });
    expect(within(popover).queryByText('$0.10')).toBeNull();
  });

  it('routes inline upgrades through the signed-in AMR profile', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: true,
            profile: 'test',
            user: { id: 'user-1', email: 'manual-amr@example.local' },
            account: { plan: 'plus', balanceUsd: '42.0000' },
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher({
      telemetry: { metrics: true },
      installationId: 'od-install-abc',
    });

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    const popover = screen.getByTestId('inline-model-switcher-popover');
    await within(popover).findByText('$42.00');
    fireEvent.click(screen.getByTestId('inline-model-switcher-account-upgrade'));

    const [url, target, features] = openSpy.mock.calls[0] ?? [];
    const parsed = new URL(String(url));
    expect(parsed.origin).toBe('https://vela.powerformer.net');
    expect(parsed.searchParams.get('view')).toBe('plans');
    expect(parsed.searchParams.get('od_entry_source')).toBe('inline_amr_upgrade');
    expect(parsed.searchParams.get('od_device_id')).toBe('od-install-abc');
    expect(target).toBe('_blank');
    expect(features).toBe('noopener,noreferrer');
  });

  it('filters fetched BYOK provider models in the Home switcher search box', async () => {
    renderSwitcher(
      {
        mode: 'api',
        apiProtocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiProviderBaseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-4.1-mini',
      },
      [amrAgent, codexAgent],
      {
        [providerModelsCacheKey(
          'openai',
          'https://api.openai.com/v1',
          'sk-test',
        )]: [
          { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
          { id: 'gpt-4.1', label: 'gpt-4.1' },
          { id: 'gpt-5.5', label: 'gpt-5.5' },
          { id: 'o4-mini', label: 'o4-mini' },
          { id: 'o3', label: 'o3' },
          { id: 'o1', label: 'o1' },
          { id: 'gpt-4o', label: 'gpt-4o' },
          { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
        ],
      },
    );

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const modelPicker = screen.getByTestId('inline-model-switcher-api-model');
    fireEvent.click(modelPicker);

    const searchInput = screen.getByTestId(
      'inline-model-switcher-api-model-search',
    ) as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: '5.5' } });

    const modelPopover = screen.getByTestId('inline-model-switcher-api-model-popover');
    expect(optionNames(modelPopover)).toEqual(['gpt-4.1-mini', 'gpt-5.5']);
  });

  it('prefers fetched BYOK provider models over only showing the currently selected custom model', async () => {
    renderSwitcher(
      {
        mode: 'api',
        apiProtocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiProviderBaseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-4.1-mini',
      },
      [amrAgent, codexAgent],
      {
        [providerModelsCacheKey(
          'openai',
          'https://api.openai.com/v1',
          'sk-test',
        )]: [
          { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
          { id: 'gpt-4.1', label: 'gpt-4.1' },
          { id: 'gpt-5.5', label: 'gpt-5.5' },
        ],
      },
    );

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const modelPicker = screen.getByTestId('inline-model-switcher-api-model');
    fireEvent.click(modelPicker);
    const modelPopover = screen.getByTestId('inline-model-switcher-api-model-popover');
    expect(optionNames(modelPopover)).toEqual(
      expect.arrayContaining(['gpt-4.1-mini', 'gpt-4.1', 'gpt-5.5']),
    );
    expect(within(modelPopover).getAllByRole('option').length).toBeGreaterThan(1);
  });

  it('warms the shared provider-models cache from the home picker for keyless AIHubMix', async () => {
    // Regression: the home picker only READ the cache, so on a fresh load (no
    // Settings/onboarding fetch yet) the AIHubMix BYOK list fell back to the
    // small static seed list. It must fetch the live catalogue itself. AIHubMix
    // is keyless, so the fetch fires with an empty apiKey.
    const fetchMock = vi.mocked(fetchProviderModels);
    fetchMock.mockResolvedValue({
      ok: true,
      kind: 'success',
      latencyMs: 1,
      models: [
        { id: 'claude-opus-4-8', label: 'claude-opus-4-8' },
        { id: 'gemini-3.5-flash', label: 'gemini-3.5-flash' },
        { id: 'minimax-m3', label: 'minimax-m3' },
      ],
    });
    const onProviderModelsCacheChange = vi.fn();
    render(
      <InlineModelSwitcher
        config={{
          ...baseConfig,
          mode: 'api',
          apiProtocol: 'aihubmix',
          baseUrl: 'https://aihubmix.com/v1',
          apiProviderBaseUrl: 'https://aihubmix.com/v1',
          apiKey: '',
          model: 'claude-opus-4-8',
        }}
        agents={[amrAgent, codexAgent]}
        daemonLive={true}
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onApiProtocolChange={vi.fn()}
        onApiModelChange={vi.fn()}
        providerModelsCache={{}}
        onProviderModelsCacheChange={onProviderModelsCacheChange}
        onOpenSettings={vi.fn()}
      />,
    );

    // No fetch until the user opens the switcher panel.
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith({
        protocol: 'aihubmix',
        baseUrl: 'https://aihubmix.com/v1',
        apiKey: '',
      });
      expect(onProviderModelsCacheChange).toHaveBeenCalled();
    });

    // The updater populates the slot under the Settings-shared cache key, so
    // one fetch serves both surfaces.
    const updater = onProviderModelsCacheChange.mock.calls[0]![0] as (
      current: Record<string, ProviderModelOption[]>,
    ) => Record<string, ProviderModelOption[]>;
    const key = providerModelsCacheKey('aihubmix', 'https://aihubmix.com/v1', '', '');
    const next = updater({});
    expect(next[key]?.map((m) => m.id)).toEqual([
      'claude-opus-4-8',
      'gemini-3.5-flash',
      'minimax-m3',
    ]);
  });

  it('does not fetch from the home picker for a keyed protocol with no API key', async () => {
    const fetchMock = vi.mocked(fetchProviderModels);
    render(
      <InlineModelSwitcher
        config={{
          ...baseConfig,
          mode: 'api',
          apiProtocol: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          apiProviderBaseUrl: 'https://api.openai.com/v1',
          apiKey: '',
          model: 'gpt-4.1-mini',
        }}
        agents={[amrAgent, codexAgent]}
        daemonLive={true}
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onApiProtocolChange={vi.fn()}
        onApiModelChange={vi.fn()}
        providerModelsCache={{}}
        onProviderModelsCacheChange={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists AIHubMix as a BYOK provider chip and marks it active when selected', () => {
    const onApiProtocolChange = vi.fn();
    render(
      <InlineModelSwitcher
        config={{
          ...baseConfig,
          mode: 'api',
          apiProtocol: 'aihubmix',
          baseUrl: 'https://aihubmix.com/v1',
          apiProviderBaseUrl: 'https://aihubmix.com/v1',
          apiKey: '',
          model: 'gemini-3.5-flash',
        }}
        agents={[amrAgent, codexAgent]}
        daemonLive={true}
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onApiProtocolChange={onApiProtocolChange}
        onApiModelChange={vi.fn()}
        providerModelsCache={{}}
        onOpenSettings={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    const chip = screen.getByTestId('inline-model-switcher-provider-aihubmix');
    expect(chip.getAttribute('aria-selected')).toBe('true');
  });

  it('keeps the panel open and applies the choice when picking a BYOK model from the portaled list', async () => {
    // Regression: the model list renders in a portal on `document.body`, so a
    // mousedown on an option lands OUTSIDE the switcher's `wrapRef`. The panel's
    // outside-click handler used to close the whole panel on that mousedown,
    // unmounting the picker before its click fired — the model never changed.
    const onApiModelChange = vi.fn();
    render(
      <InlineModelSwitcher
        config={{
          ...baseConfig,
          mode: 'api',
          apiProtocol: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          apiProviderBaseUrl: 'https://api.openai.com/v1',
          apiKey: 'sk-test',
          model: 'gpt-4.1-mini',
        }}
        agents={[amrAgent, codexAgent]}
        daemonLive={true}
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onApiProtocolChange={vi.fn()}
        onApiModelChange={onApiModelChange}
        providerModelsCache={{
          [providerModelsCacheKey('openai', 'https://api.openai.com/v1', 'sk-test', '')]: [
            { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
            { id: 'gpt-4.1', label: 'gpt-4.1' },
            { id: 'gpt-5.5', label: 'gpt-5.5' },
          ],
        }}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-api-model'));

    const modelPopover = screen.getByTestId('inline-model-switcher-api-model-popover');
    const option = within(modelPopover).getByRole('option', { name: 'gpt-5.5' });

    // The real browser fires mousedown before the option's click. The panel's
    // document-level mousedown listener must NOT treat this portal click as
    // "outside" and close the switcher.
    fireEvent.mouseDown(option);
    expect(screen.queryByTestId('inline-model-switcher-popover')).not.toBeNull();
    expect(
      screen.queryByTestId('inline-model-switcher-api-model-popover'),
    ).not.toBeNull();

    fireEvent.click(option);
    expect(onApiModelChange).toHaveBeenCalledWith('gpt-5.5');
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
      name: /^Open Design\s+Signed in$/i,
    });
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
      name: /^Open Design\s+Signing in/i,
    });
    expect(
      within(popover)
        .getByTestId('inline-model-switcher-account-action')
        .getAttribute('title'),
    ).toBe('Cancel sign-in');
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
      name: /^Open Design\s+Signed in$/i,
    });
    fireEvent.click(amrButton);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expectVelaLoginWithAttribution(fetchMock, 'inline_model_switcher_amr_row');
    expect(
      within(popover).getByRole('radio', { name: /^Open Design\s+Signing in/i }),
    ).toBeTruthy();
  });

  it('shows daemon startup errors when AMR sign-in fails immediately', async () => {
    const startupError = 'profile "prod" api URL: is not configured';
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: false,
            profile: 'prod',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: startupError }), {
          status: 500,
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
      name: /^Open Design\s+Sign in$/i,
    });
    fireEvent.click(amrButton);

    await waitFor(() => {
      expect(
        within(popover).getByRole('radio', {
          name: /^Open Design\s+profile "prod" api URL: is not configured/i,
        }),
      ).toBeTruthy();
    });
    expect(
      within(popover).queryByRole('radio', {
        name: /^Open Design\s+Sign-in failed\./i,
      }),
    ).toBeNull();
    expect(
      popover.querySelector('.inline-switcher__account-status.is-error')
        ?.textContent,
    ).toMatch(/api URL: is not configured/i);
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
      name: /^Open Design\s+Sign in$/i,
    });
    vi.useFakeTimers();
    fireEvent.click(amrButton);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expectVelaLoginWithAttribution(fetchMock, 'inline_model_switcher_amr_row');
    expect(
      within(popover).getByRole('radio', { name: /^Open Design\s+Signing in/i }),
    ).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_TIMEOUT_MS);
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/integrations/vela/login/cancel', { method: 'POST' });
    expect(
      within(popover).getByRole('radio', { name: /^Open Design\s+Sign-in failed\./i }),
    ).toBeTruthy();
    expect(
      popover.querySelector('.inline-switcher__account-status.is-error'),
    ).toBeTruthy();
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
      name: /^Open Design\s+Sign in$/i,
    });
    vi.useFakeTimers();
    fireEvent.click(amrButton);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    amrButton = within(popover).getByRole('radio', {
      name: /^Open Design\s+Signing in/i,
    });
    expect(
      within(popover)
        .getByTestId('inline-model-switcher-account-action')
        .getAttribute('title'),
    ).toBe('Cancel sign-in');

    fireEvent.click(amrButton);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/integrations/vela/login/cancel', { method: 'POST' });
    expect(
      within(popover).getByRole('radio', { name: /^Open Design\s+Sign in$/i }),
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
    await within(popover).findByRole('radio', { name: /^Open Design\s+Signed in$/i });

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    popover = screen.getByTestId('inline-model-switcher-popover');
    await within(popover).findByRole('radio', { name: /^Open Design\s+Sign in$/i });
    expect(within(popover).queryByRole('radio', { name: /^Open Design\s+Signed in$/i })).toBeNull();
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
    await within(popover).findByRole('radio', { name: /^Open Design\s+Sign in$/i });
    expect(loginCalls).toBe(0);

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    const reopenedPopover = screen.getByTestId('inline-model-switcher-popover');
    const reopenedAmrButton = await within(reopenedPopover).findByRole('radio', {
      name: /^Open Design\s+Sign in$/i,
    });
    expect(loginCalls).toBe(0);

    fireEvent.click(reopenedAmrButton);
    await waitFor(() => {
      expect(loginCalls).toBe(1);
      expect(onAgentChange).toHaveBeenCalledWith('amr');
    });
  });

  it('lists fetched BYOK provider models from the shared cache', () => {
    const cacheKey = providerModelsCacheKey(
      'anthropic',
      baseConfig.baseUrl,
      'sk-test',
      '',
    );
    renderSwitcher(
      {
        mode: 'api',
        apiKey: 'sk-test',
        model: 'claude-3-5-haiku-latest',
      },
      [amrAgent],
      {
        [cacheKey]: [
          { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
        ],
      },
    );

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const select = screen.getByTestId(
      'inline-model-switcher-api-model',
    );
    fireEvent.click(select);
    const modelPopover = screen.getByTestId(
      'inline-model-switcher-api-model-popover',
    );
    expect(
      within(modelPopover).getByRole('option', { name: 'Claude 3.5 Haiku' }),
    ).toBeTruthy();
  });
});

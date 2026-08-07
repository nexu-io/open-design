// @vitest-environment jsdom
//
// Home compact chip is a split control (#6501):
// - left (CLI icon) opens local CLI agent switching only
// - right (status + model name) opens the model list
// - ≤900px icon-only collapse: the remaining circle opens the model list;
//   CLI switching goes through Settings
// BYOK / provider switching stays in Settings until maintainers decide
// how it should appear on home.
//
// Before the fix both halves were one button that only opened the model list,
// so switching CLI still required Settings.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InlineModelSwitcher } from '../../src/components/InlineModelSwitcher';
import type { AgentInfo, AppConfig } from '../../src/types';

vi.mock('../../src/providers/provider-models', () => ({
  fetchProviderModels: vi.fn(async () => ({ ok: false, models: [] })),
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
  agentModels: { amr: { model: 'claude-opus-4.6' } },
  agentCliEnv: {},
};

const amrAgent: AgentInfo = {
  id: 'amr',
  name: 'AMR (vela)',
  bin: 'amr',
  available: true,
  version: '1.0.0',
  models: [
    { id: 'claude-opus-4.6', label: 'claude-opus-4.6', enabled: true, default: true },
    { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash', enabled: true },
  ],
};

const codexAgent: AgentInfo = {
  id: 'codex',
  name: 'Codex',
  bin: 'codex',
  available: true,
  version: '1.0.0',
  models: [{ id: 'gpt-5', label: 'gpt-5', enabled: true, default: true }],
};

function StatefulCompact({
  initialConfig = baseConfig,
  onAgentChange,
}: {
  initialConfig?: AppConfig;
  onAgentChange?: (id: string) => void;
}) {
  const [config, setConfig] = useState(initialConfig);
  return (
    <InlineModelSwitcher
      config={config}
      agents={[amrAgent, codexAgent]}
      providerModelsCache={{}}
      compact
      daemonLive
      onModeChange={(mode) => setConfig((c) => ({ ...c, mode }))}
      onAgentChange={(id) => {
        onAgentChange?.(id);
        setConfig((c) => ({ ...c, agentId: id, mode: 'daemon' }));
      }}
      onAgentModelChange={vi.fn()}
      onApiProtocolChange={vi.fn()}
      onApiModelChange={vi.fn()}
      onOpenSettings={vi.fn()}
    />
  );
}

function renderCompact(onAgentChange?: (id: string) => void) {
  return render(<StatefulCompact onAgentChange={onAgentChange} />);
}

/** Mirrors `HOME_COMPACT_ICON_ONLY_QUERY` in InlineModelSwitcher (≤900px). */
function stubCompactIconOnlyMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query.includes('max-width: 900px') ? matches : false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as MediaQueryList,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('InlineModelSwitcher compact split chip (#6501)', () => {
  it('exposes separate agent and model hit targets on the compact chip', () => {
    renderCompact();

    expect(screen.getByTestId('inline-model-switcher-chip-agent')).toBeTruthy();
    expect(screen.getByTestId('inline-model-switcher-chip-model')).toBeTruthy();
    expect(screen.getByTestId('inline-model-switcher-chip').textContent).toContain(
      'claude-opus-4.6',
    );
  });

  it('opens the agent/CLI panel from the left icon, not the model list', () => {
    renderCompact();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    const popover = screen.getByTestId('inline-model-switcher-popover');

    expect(within(popover).getByTestId('inline-model-switcher-agent-codex')).toBeTruthy();
    // Home compact defers BYOK / mode tabs to Settings (#6501 scope).
    expect(within(popover).queryByTestId('inline-model-switcher-mode-daemon')).toBeNull();
    expect(within(popover).queryByTestId('inline-model-switcher-mode-api')).toBeNull();
    expect(
      within(popover).queryByTestId('inline-model-switcher-compact-model-claude-opus-4.6'),
    ).toBeNull();
  });

  it('does not list BYOK protocol tabs on the left CLI panel', () => {
    render(
      <InlineModelSwitcher
        config={{
          ...baseConfig,
          mode: 'api',
          apiKey: 'sk-test',
          apiProtocol: 'openai',
          model: 'gpt-4o',
        }}
        agents={[amrAgent, codexAgent]}
        providerModelsCache={{}}
        compact
        daemonLive
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onApiProtocolChange={vi.fn()}
        onApiModelChange={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    const popover = screen.getByTestId('inline-model-switcher-popover');

    expect(within(popover).getByTestId('inline-model-switcher-agent-codex')).toBeTruthy();
    expect(within(popover).queryByTestId('inline-model-switcher-provider-openai')).toBeNull();
    expect(within(popover).queryByTestId('inline-model-switcher-mode-api')).toBeNull();
  });

  it('returns to Local CLI when picking an agent while BYOK is active', () => {
    const onModeChange = vi.fn();
    const onAgentChange = vi.fn();
    render(
      <InlineModelSwitcher
        config={{
          ...baseConfig,
          mode: 'api',
          apiKey: 'sk-test',
          apiProtocol: 'openai',
          model: 'gpt-4o',
        }}
        agents={[amrAgent, codexAgent]}
        providerModelsCache={{}}
        compact
        daemonLive
        onModeChange={onModeChange}
        onAgentChange={onAgentChange}
        onAgentModelChange={vi.fn()}
        onApiProtocolChange={vi.fn()}
        onApiModelChange={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-codex'));

    expect(onModeChange).toHaveBeenCalledWith('daemon');
    expect(onAgentChange).toHaveBeenCalledWith('codex');
  });

  it('opens the model list from the right segment', () => {
    renderCompact();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-model'));
    const popover = screen.getByTestId('inline-model-switcher-popover');

    expect(
      within(popover).getByTestId('inline-model-switcher-compact-model-claude-opus-4.6'),
    ).toBeTruthy();
    expect(within(popover).queryByTestId('inline-model-switcher-agent-codex')).toBeNull();
  });

  it('opens the model list from the icon-only circle at ≤900px', () => {
    // Narrow home hides the model segment in CSS; the remaining logo circle
    // must still open models (CLI switching falls back to Settings).
    stubCompactIconOnlyMedia(true);
    renderCompact();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    const popover = screen.getByTestId('inline-model-switcher-popover');

    expect(
      within(popover).getByTestId('inline-model-switcher-compact-model-claude-opus-4.6'),
    ).toBeTruthy();
    expect(within(popover).queryByTestId('inline-model-switcher-agent-codex')).toBeNull();
  });

  it('switches agents from the left panel without opening Settings', () => {
    const onAgentChange = vi.fn();
    renderCompact(onAgentChange);

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-codex'));

    expect(onAgentChange).toHaveBeenCalledWith('codex');
  });

  it('opens the model list after picking a CLI with no recorded model', () => {
    renderCompact();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-codex'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    expect(
      within(popover).getByTestId('inline-model-switcher-compact-model-gpt-5'),
    ).toBeTruthy();
    expect(within(popover).queryByTestId('inline-model-switcher-agent-codex')).toBeNull();
  });

  it('opens the model list when the saved model is only the CLI default', () => {
    render(
      <StatefulCompact
        initialConfig={{
          ...baseConfig,
          agentModels: { codex: { model: 'default' } },
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-codex'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    expect(
      within(popover).getByTestId('inline-model-switcher-compact-model-gpt-5'),
    ).toBeTruthy();
    expect(within(popover).queryByTestId('inline-model-switcher-agent-codex')).toBeNull();
  });

  it('shows a saved non-catalog CLI model on the chip and in the compact list', () => {
    render(
      <StatefulCompact
        initialConfig={{
          ...baseConfig,
          agentModels: { codex: { model: 'custom-codex-model' } },
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-codex'));

    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();
    expect(screen.getByTestId('inline-model-switcher-chip').textContent).toContain(
      'custom-codex-model',
    );

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-model'));
    expect(
      within(screen.getByTestId('inline-model-switcher-popover')).getByTestId(
        'inline-model-switcher-compact-model-custom-codex-model',
      ),
    ).toBeTruthy();
  });

  it('does not offer a saved custom model for adapters that reject custom ids', () => {
    const noCustomCodex: AgentInfo = { ...codexAgent, supportsCustomModel: false };
    render(
      <InlineModelSwitcher
        config={{
          ...baseConfig,
          agentId: 'codex',
          agentModels: { codex: { model: 'custom-codex-model' } },
        }}
        agents={[amrAgent, noCustomCodex]}
        providerModelsCache={{}}
        compact
        daemonLive
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onApiProtocolChange={vi.fn()}
        onApiModelChange={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-model'));
    const popover = screen.getByTestId('inline-model-switcher-popover');

    expect(
      within(popover).queryByTestId(
        'inline-model-switcher-compact-model-custom-codex-model',
      ),
    ).toBeNull();
    expect(
      within(popover).getByTestId('inline-model-switcher-compact-model-gpt-5'),
    ).toBeTruthy();
  });

  it('keeps the recorded model and closes when the CLI already has a saved choice', () => {
    render(
      <StatefulCompact
        initialConfig={{
          ...baseConfig,
          agentModels: {
            amr: { model: 'claude-opus-4.6' },
            codex: { model: 'gpt-5' },
          },
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-codex'));

    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();
    expect(screen.getByTestId('inline-model-switcher-chip').textContent).toContain('gpt-5');
  });

  it('toggling the same segment closes the panel; the other segment swaps panels', () => {
    renderCompact();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    expect(screen.getByTestId('inline-model-switcher-popover')).toBeTruthy();
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-model'));
    const popover = screen.getByTestId('inline-model-switcher-popover');
    expect(
      within(popover).getByTestId('inline-model-switcher-compact-model-claude-opus-4.6'),
    ).toBeTruthy();
    expect(within(popover).queryByTestId('inline-model-switcher-agent-codex')).toBeNull();
  });

  it('keeps the Model picker out of the left CLI panel', () => {
    renderCompact();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    const popover = screen.getByTestId('inline-model-switcher-popover');

    expect(within(popover).queryByTestId('inline-model-switcher-agent-model')).toBeNull();
    expect(within(popover).queryByText(/^Model$/i)).toBeNull();
  });

  it('lists BYOK provider models on the right segment, not leftover CLI models', () => {
    const onApiModelChange = vi.fn();
    render(
      <InlineModelSwitcher
        config={{
          ...baseConfig,
          mode: 'api',
          apiKey: 'sk-test',
          apiProtocol: 'openai',
          model: 'gpt-4o',
        }}
        agents={[amrAgent, codexAgent]}
        providerModelsCache={{}}
        compact
        daemonLive
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onApiProtocolChange={vi.fn()}
        onApiModelChange={onApiModelChange}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-model'));
    const popover = screen.getByTestId('inline-model-switcher-popover');

    // Seed list for openai includes gpt-4o; must not show the CLI agent catalog.
    fireEvent.click(within(popover).getByTestId('inline-model-switcher-api-model'));
    const modelPopover = screen.getByTestId(
      'inline-model-switcher-api-model-popover',
    );
    expect(
      within(modelPopover).getByRole('option', { name: /^gpt-4o$/ }),
    ).toBeTruthy();
    expect(
      within(modelPopover).queryByText('claude-opus-4.6'),
    ).toBeNull();
    fireEvent.click(
      within(modelPopover).getByRole('option', { name: /^gpt-4o$/ }),
    );
    expect(onApiModelChange).toHaveBeenCalledWith('gpt-4o');
  });
});

// @vitest-environment jsdom
//
// Home compact chip is a split control (#6501):
// - left (CLI icon) opens agent / mode switching
// - right (status + model name) opens the model list
//
// Before the fix both halves were one button that only opened the model list,
// so switching CLI still required Settings.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

function renderCompact(onAgentChange = vi.fn()) {
  return render(
    <InlineModelSwitcher
      config={baseConfig}
      agents={[amrAgent, codexAgent]}
      providerModelsCache={{}}
      compact
      daemonLive
      onModeChange={vi.fn()}
      onAgentChange={onAgentChange}
      onAgentModelChange={vi.fn()}
      onApiProtocolChange={vi.fn()}
      onApiModelChange={vi.fn()}
      onOpenSettings={vi.fn()}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
    expect(within(popover).getByTestId('inline-model-switcher-mode-daemon')).toBeTruthy();
    expect(
      within(popover).queryByTestId('inline-model-switcher-compact-model-claude-opus-4.6'),
    ).toBeNull();
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

  it('switches agents from the left panel without opening Settings', () => {
    const onAgentChange = vi.fn();
    renderCompact(onAgentChange);

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-codex'));

    expect(onAgentChange).toHaveBeenCalledWith('codex');
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
});

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AvatarMenu } from '../../src/components/AvatarMenu';
import type { AgentInfo, AppConfig, ExecMode } from '../../src/types';

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => key,
}));

const codexAgent: AgentInfo = {
  id: 'codex',
  name: 'Codex CLI',
  bin: 'codex',
  available: true,
  version: '0.134.0',
  models: [{ id: 'default', label: 'Default (CLI config)' }],
  reasoningOptions: [
    { id: 'default', label: 'Default' },
    { id: 'high', label: 'High' },
  ],
};

const claudeAgent: AgentInfo = {
  id: 'claude',
  name: 'Claude Code',
  bin: 'claude',
  available: true,
  version: '2.1.131',
  models: [
    { id: 'default', label: 'Default (CLI config)' },
    { id: 'sonnet', label: 'Sonnet (alias)' },
  ],
};

const baseConfig: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  model: 'claude-sonnet-4-5',
  agentId: 'codex',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  agentModels: { codex: { model: 'default', reasoning: 'default' } },
  agentCliEnv: {},
};

type ModeChangeHandler = (mode: ExecMode) => void;
type AgentChangeHandler = (id: string) => void;
type AgentModelChangeHandler = (
  id: string,
  choice: { model?: string; reasoning?: string },
) => void;
type VoidHandler = () => void;

function renderMenu({
  config = baseConfig,
  agents = [codexAgent, claudeAgent],
  daemonLive = true,
  onModeChange = vi.fn<ModeChangeHandler>(),
  onAgentChange = vi.fn<AgentChangeHandler>(),
  onAgentModelChange = vi.fn<AgentModelChangeHandler>(),
  onOpenSettings = vi.fn<VoidHandler>(),
  onRefreshAgents = vi.fn<VoidHandler>(),
}: {
  config?: AppConfig;
  agents?: AgentInfo[];
  daemonLive?: boolean;
  onModeChange?: ReturnType<typeof vi.fn<ModeChangeHandler>>;
  onAgentChange?: ReturnType<typeof vi.fn<AgentChangeHandler>>;
  onAgentModelChange?: ReturnType<typeof vi.fn<AgentModelChangeHandler>>;
  onOpenSettings?: ReturnType<typeof vi.fn<VoidHandler>>;
  onRefreshAgents?: ReturnType<typeof vi.fn<VoidHandler>>;
} = {}) {
  render(
    <AvatarMenu
      config={config}
      agents={agents}
      daemonLive={daemonLive}
      onModeChange={onModeChange}
      onAgentChange={onAgentChange}
      onAgentModelChange={onAgentModelChange}
      onOpenSettings={onOpenSettings}
      onRefreshAgents={onRefreshAgents}
    />,
  );
  return {
    onModeChange,
    onAgentChange,
    onAgentModelChange,
    onOpenSettings,
    onRefreshAgents,
  };
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'avatar.title' }));
  return screen.getByRole('dialog', { name: 'avatar.title' });
}

describe('AvatarMenu', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('opens execution settings when Local CLI is selected while the daemon is offline', () => {
    const onOpenSettings = vi.fn();
    renderMenu({
      daemonLive: false,
      onOpenSettings,
    });

    openMenu();
    fireEvent.click(screen.getByRole('button', { name: /avatar.useLocal/i }));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('rescans agents and re-renders newly available CLI entries', async () => {
    function Harness() {
      const [agents, setAgents] = useState<AgentInfo[]>([
        codexAgent,
        { ...claudeAgent, available: false },
      ]);
      return (
        <AvatarMenu
          config={baseConfig}
          agents={agents}
          daemonLive={true}
          onModeChange={vi.fn()}
          onAgentChange={vi.fn()}
          onAgentModelChange={vi.fn()}
          onOpenSettings={vi.fn()}
          onRefreshAgents={() => {
            setAgents([codexAgent, claudeAgent]);
          }}
        />
      );
    }

    render(<Harness />);

    openMenu();
    expect(screen.queryByRole('button', { name: /Claude Code/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'avatar.rescan' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Claude Code/i })).toBeTruthy();
    });
  });

  it('routes reasoning selection changes through onAgentModelChange', () => {
    const onAgentModelChange = vi.fn();
    renderMenu({ onAgentModelChange });

    openMenu();
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1]!, { target: { value: 'high' } });

    expect(onAgentModelChange).toHaveBeenCalledWith('codex', {
      reasoning: 'high',
    });
  });

  it('keeps a custom saved model visible when it is not in the declared agent model list', () => {
    renderMenu({
      config: {
        ...baseConfig,
        agentModels: { codex: { model: 'custom-codex-model', reasoning: 'default' } },
      },
    });

    openMenu();
    // The model picker is a SearchableModelSelect: a combobox button whose
    // label shows the active selection, backed by a popover listbox. A custom
    // saved model that isn't in the agent's declared list is injected as an
    // additional option so it stays selectable instead of silently dropping.
    const modelCombobox = screen.getAllByRole('combobox')[0] as HTMLButtonElement;
    expect(modelCombobox.textContent).toContain('custom-codex-model');

    fireEvent.click(modelCombobox);
    const popover = screen.getByTestId('avatar-model-popover');
    expect(
      within(popover).getByRole('option', { name: /custom-codex-model/i }),
    ).toBeTruthy();
  });
});

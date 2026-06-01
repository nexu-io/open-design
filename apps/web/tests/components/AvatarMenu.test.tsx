// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AvatarMenu } from '../../src/components/AvatarMenu';
import { I18nProvider } from '../../src/i18n';
import type { AgentInfo, AppConfig } from '../../src/types';

const codexAgent: AgentInfo = {
  id: 'codex',
  name: 'Codex CLI',
  bin: 'codex',
  available: true,
  models: [
    { id: 'default', label: 'Default' },
    {
      id: 'gpt-5.5',
      label: 'GPT-5.5',
      serviceTierOptions: [{ id: 'priority', label: 'Fast' }],
    },
    { id: 'gpt-5.4', label: 'GPT-5.4' },
  ],
  reasoningOptions: [{ id: 'medium', label: 'Medium' }],
};

const baseConfig: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  agentId: 'codex',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  agentModels: { codex: { model: 'gpt-5.5' } },
  agentCliEnv: {},
};

function renderAvatarMenu(
  config: AppConfig = baseConfig,
  onAgentModelChange = vi.fn(),
) {
  render(
    <I18nProvider initial="en">
      <AvatarMenu
        config={config}
        agents={[codexAgent]}
        daemonLive={true}
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={onAgentModelChange}
        onOpenSettings={vi.fn()}
        onRefreshAgents={vi.fn()}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Account & settings' }));
  return { onAgentModelChange };
}

describe('AvatarMenu service tier picker', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows service tier choices only when the selected model supports them', () => {
    const { onAgentModelChange } = renderAvatarMenu();

    const serviceTierSelect = screen.getByRole('combobox', { name: 'Service tier' });
    expect(serviceTierSelect).toBeTruthy();

    fireEvent.change(serviceTierSelect, { target: { value: 'priority' } });
    expect(onAgentModelChange).toHaveBeenCalledWith('codex', {
      serviceTier: 'priority',
    });
  });

  it('hides service tier choices for models without service tiers', () => {
    renderAvatarMenu({
      ...baseConfig,
      agentModels: { codex: { model: 'gpt-5.4' } },
    });

    expect(screen.queryByRole('combobox', { name: 'Service tier' })).toBeNull();
  });
});

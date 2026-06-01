// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InlineModelSwitcher } from '../../src/components/InlineModelSwitcher';
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

function renderSwitcher(
  config: AppConfig = baseConfig,
  onAgentModelChange = vi.fn(),
) {
  render(
    <I18nProvider initial="en">
      <InlineModelSwitcher
        config={config}
        agents={[codexAgent]}
        daemonLive={true}
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={onAgentModelChange}
        onApiProtocolChange={vi.fn()}
        onApiModelChange={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
  return { onAgentModelChange };
}

describe('InlineModelSwitcher service tier picker', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows service tier choices for a model that supports fast tier', () => {
    const { onAgentModelChange } = renderSwitcher();

    const serviceTierSelect = screen.getByTestId('inline-model-switcher-service-tier');
    expect(serviceTierSelect).toBeTruthy();

    fireEvent.change(serviceTierSelect, { target: { value: 'priority' } });
    expect(onAgentModelChange).toHaveBeenCalledWith('codex', {
      serviceTier: 'priority',
    });
  });

  it('hides service tier choices for models without service tiers', () => {
    renderSwitcher({
      ...baseConfig,
      agentModels: { codex: { model: 'gpt-5.4' } },
    });

    expect(screen.queryByTestId('inline-model-switcher-service-tier')).toBeNull();
  });

  it('clears the service tier when the model changes', () => {
    const { onAgentModelChange } = renderSwitcher({
      ...baseConfig,
      agentModels: { codex: { model: 'gpt-5.5', serviceTier: 'priority' } },
    });

    fireEvent.change(screen.getByTestId('inline-model-switcher-agent-model'), {
      target: { value: 'gpt-5.4' },
    });

    expect(onAgentModelChange).toHaveBeenCalledWith('codex', {
      model: 'gpt-5.4',
      serviceTier: undefined,
    });
  });
});

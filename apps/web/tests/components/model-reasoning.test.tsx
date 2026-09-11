// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InlineModelSwitcher } from '../../src/components/InlineModelSwitcher';
import { AvatarMenu } from '../../src/components/AvatarMenu';
import { DEFAULT_CONFIG } from '../../src/state/config';
import { I18nProvider } from '../../src/i18n';
import type { AgentInfo, AppConfig } from '../../src/types';

afterEach(cleanup);

const agent = {
  id: 'codex', name: 'Codex', bin: 'codex', available: true,
  models: [{ id: 'gpt-6-astra', label: 'Astra', defaultReasoning: 'medium',
    reasoningOptions: ['low', 'max', 'ultra', 'deep-v2'].map((id) => ({ id, label: id })) }],
  reasoningOptions: [{ id: 'default', label: 'Default' }, { id: 'minimal', label: 'Minimal' }],
} as AgentInfo;
const config: AppConfig = { ...DEFAULT_CONFIG, mode: 'daemon', agentId: 'codex',
  agentModels: { codex: { model: 'gpt-6-astra', reasoning: 'ultra' } },
};

describe.each(['inline', 'avatar'] as const)('%s reasoning picker', (surface) => {
  it('offers the model catalogue, forwards a future effort and hides fallback options', () => {
    const change = vi.fn();
    const props = { config, agents: [agent], daemonLive: true,
      onModeChange: vi.fn(), onAgentChange: vi.fn(), onAgentModelChange: change,
      onOpenSettings: vi.fn(), onRefreshAgents: vi.fn(),
      onApiProtocolChange: vi.fn(), onApiModelChange: vi.fn(),
    };
    render(<I18nProvider initial="en">{surface === 'inline'
      ? <InlineModelSwitcher {...props} /> : <AvatarMenu {...props} />}</I18nProvider>);
    fireEvent.click(surface === 'inline' ? screen.getByTestId('inline-model-switcher-chip')
      : screen.getByRole('button', { name: 'Account & settings' }));
    const picker = screen.getByRole('combobox', { name: 'Reasoning' });
    expect(within(picker).getAllByRole('option').map((o) => (o as HTMLOptionElement).value))
      .toEqual(['default', 'low', 'max', 'ultra', 'deep-v2']);
    expect((picker as HTMLSelectElement).value).toBe('ultra');
    fireEvent.change(picker, { target: { value: 'deep-v2' } });
    expect(change).toHaveBeenCalledWith('codex', { reasoning: 'deep-v2' });
  });
});

it('keeps the dormant Local CLI reasoning control out of the BYOK picker', () => {
  render(<I18nProvider initial="en"><InlineModelSwitcher
    config={{ ...config, mode: 'api' }} agents={[agent]} daemonLive
    onModeChange={vi.fn()} onAgentChange={vi.fn()} onAgentModelChange={vi.fn()}
    onApiProtocolChange={vi.fn()} onApiModelChange={vi.fn()} onOpenSettings={vi.fn()}
  /></I18nProvider>);
  fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
  expect(screen.queryByTestId('inline-model-switcher-reasoning')).toBeNull();
});

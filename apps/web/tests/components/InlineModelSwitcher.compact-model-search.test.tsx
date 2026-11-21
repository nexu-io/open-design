// @vitest-environment jsdom
//
// Compact home model switcher → search filter. Long provider-prefixed catalogs
// (`opencode-go/…`, `openrouter/…`) ellipsise to a shared prefix, so the list
// must offer a filter that matches both id and label — the same rule the
// shared `SearchableModelSelect` applies on the other model pickers.

import { useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeAgentModelChoice } from '../../src/App';
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
  agentId: 'opencode',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  agentModels: {},
  agentCliEnv: {},
};

/** The shape the report is about: one provider prefix shared by every row, so
 *  the ellipsised list is indistinguishable without a filter. */
const opencodeAgent: AgentInfo = {
  id: 'opencode',
  name: 'OpenCode',
  bin: 'opencode',
  available: true,
  version: '1.0.0',
  models: [
    { id: 'default', label: 'Default (CLI config)', default: true },
    { id: 'opencode-go/claude-haiku-5-5', label: 'opencode-go/claude-haiku-5-5' },
    { id: 'opencode-go/deepseek-v4-flash', label: 'opencode-go/deepseek-v4-flash' },
    { id: 'opencode-go/deepseek-v4-flash-vision-exp', label: 'opencode-go/deepseek-v4-flash-vision-exp' },
    { id: 'opencode-go/deepseek-v4-pro', label: 'opencode-go/deepseek-v4-pro' },
    { id: 'opencode-go/deepseek-v4.1-flash', label: 'opencode-go/deepseek-v4.1-flash' },
    { id: 'opencode-go/glm-5.2', label: 'opencode-go/glm-5.2' },
    { id: 'opencode-go/glm-5.3', label: 'opencode-go/glm-5.3' },
    { id: 'opencode-go/gpt-6-luna', label: 'opencode-go/gpt-6-luna' },
    { id: 'opencode-go/kimi-k3', label: 'opencode-go/kimi-k3' },
    { id: 'opencode-go/mimo-v2.6-flash', label: 'opencode-go/mimo-v2.6-flash' },
    { id: 'opencode-go/minimax-m3', label: 'opencode-go/minimax-m3' },
  ],
};

/** Mirrors `App.handleAgentModelChange` so a click on a filtered row flows back
 *  into the chip label — the same round-trip the real client performs. */
function StatefulSwitcher({
  agents,
  initialConfig,
}: {
  agents: AgentInfo[];
  initialConfig?: Partial<AppConfig>;
}) {
  const [config, setConfig] = useState<AppConfig>({ ...baseConfig, ...initialConfig });
  const persistedRef = useRef(config);
  return (
    <InlineModelSwitcher
      config={config}
      agents={agents}
      providerModelsCache={{}}
      compact
      daemonLive
      onModeChange={vi.fn()}
      onAgentChange={vi.fn()}
      onAgentModelChange={(agentId, choice) => {
        const current = persistedRef.current;
        const merged = mergeAgentModelChoice(
          current.agentModels?.[agentId] ?? {},
          choice,
        );
        const next: AppConfig = {
          ...current,
          agentModels: { ...(current.agentModels ?? {}), [agentId]: merged },
        };
        persistedRef.current = next;
        setConfig(next);
      }}
      onApiProtocolChange={vi.fn()}
      onApiModelChange={vi.fn()}
      onOpenSettings={vi.fn()}
    />
  );
}

function openSwitcher(): HTMLElement {
  fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
  return screen.getByTestId('inline-model-switcher-popover');
}

function chipText(): string {
  return screen.getByTestId('inline-model-switcher-chip').textContent ?? '';
}

function compactRow(modelId: string): HTMLElement {
  return screen.getByTestId(`inline-model-switcher-compact-model-${modelId}`);
}

function searchInput(): HTMLInputElement {
  return screen.getByTestId('inline-model-switcher-compact-model-search') as HTMLInputElement;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('compact home model list — search filter', () => {
  it('filters rows by substring and the chip follows a click on a filtered row', () => {
    render(<StatefulSwitcher agents={[opencodeAgent]} />);
    openSwitcher();
    fireEvent.change(searchInput(), { target: { value: 'v4.1' } });

    expect(compactRow('opencode-go/deepseek-v4.1-flash')).toBeTruthy();
    expect(
      screen.queryByTestId('inline-model-switcher-compact-model-opencode-go/deepseek-v4-pro'),
    ).toBeNull();
    expect(
      screen.queryByTestId('inline-model-switcher-compact-model-opencode-go/glm-5.3'),
    ).toBeNull();

    fireEvent.click(compactRow('opencode-go/deepseek-v4.1-flash'));
    // The chip shows the same distinguishing half the rows show; the full id
    // stays on the aria label for screen readers.
    expect(chipText()).toContain('deepseek-v4.1-flash');
    expect(chipText()).not.toContain('opencode-go');
  });

  it('matches case-insensitively on both id and label', () => {
    render(<StatefulSwitcher agents={[opencodeAgent]} />);
    openSwitcher();
    fireEvent.change(searchInput(), { target: { value: 'GLM' } });

    expect(compactRow('opencode-go/glm-5.3')).toBeTruthy();
    expect(
      screen.queryByTestId('inline-model-switcher-compact-model-opencode-go/deepseek-v4-pro'),
    ).toBeNull();
  });

  it('shows the empty state for a query with no matches, and clearing restores the catalog', () => {
    render(<StatefulSwitcher agents={[opencodeAgent]} />);
    openSwitcher();
    fireEvent.change(searchInput(), { target: { value: 'no-such-model' } });

    expect(screen.getByText('No matches')).toBeTruthy();
    expect(
      screen.queryByTestId('inline-model-switcher-compact-model-opencode-go/deepseek-v4-pro'),
    ).toBeNull();

    fireEvent.change(searchInput(), { target: { value: '' } });
    expect(compactRow('opencode-go/deepseek-v4-pro')).toBeTruthy();
  });

  it('reopens on the full catalog after closing mid-query', () => {
    render(<StatefulSwitcher agents={[opencodeAgent]} />);
    openSwitcher();
    fireEvent.change(searchInput(), { target: { value: 'glm' } });
    expect(
      screen.queryByTestId('inline-model-switcher-compact-model-opencode-go/deepseek-v4-pro'),
    ).toBeNull();

    const chip = screen.getByTestId('inline-model-switcher-chip');
    fireEvent.click(chip);
    fireEvent.click(chip);

    expect(searchInput().value).toBe('');
    expect(compactRow('opencode-go/deepseek-v4-pro')).toBeTruthy();
  });

  it('drops the provider prefix every row shares so labels stay distinguishable', () => {
    render(<StatefulSwitcher agents={[opencodeAgent]} />);
    openSwitcher();

    // Without this, the ellipsised row would repeat the half every row shares.
    const row = compactRow('opencode-go/deepseek-v4.1-flash');
    expect(row).toHaveTextContent('deepseek-v4.1-flash');
    expect(row).not.toHaveTextContent('opencode-go');

    // Rows with no provider prefix keep their own labels.
    expect(compactRow('default')).toHaveTextContent('Default (CLI config)');
  });
});

// @vitest-environment jsdom
//
// Home composer chip → compact model list → click a model. The chip MUST show
// the clicked model.
//
// The reported bug: the owner clicked `claude-opus-4.6` in the compact list and
// the chip stayed on `deepseek-v4-flash`. The list offered a model that is above
// the caller's plan (`enabled: false` from `vela model list --json`) as a plain
// selectable row; the click was accepted, written to config, and then coerced
// straight back by `normalizeAgentModelChoice` + the re-normalization effect in
// `InlineModelSwitcher` — so the click read as a no-op.
//
// Every assertion here is on the user-visible chip label, never on whether a
// callback fired: the callback fires today and the chip still does not move.
// The switcher does not own persistence — `App.handleAgentModelChange` does — so
// these specs wire the real merge/persist shape around the component and let the
// new config flow back in as a prop. A bare `vi.fn()` callback would make every
// case below pass while the real client stayed broken.

import { useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeAgentModelChoice } from '../../src/App';
import { DEEPSEEK_V4_FLASH_CAMPAIGN } from '../../src/campaigns/deepseek-v4-flash';
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
  agentModels: {},
  agentCliEnv: {},
};

/** The catalog from the bug report: the two DeepSeek tiers are on the caller's
 *  plan, the Claude tiers are not. `enabled: false` is what `vela model list
 *  --json` reports for a model above the caller's plan. */
const amrAgent: AgentInfo = {
  id: 'amr',
  name: 'AMR (vela)',
  bin: 'amr',
  available: true,
  version: '1.0.0',
  models: [
    { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash', enabled: true, default: true },
    { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro', enabled: true },
    { id: 'claude-fable-5', label: 'claude-fable-5', enabled: false },
    { id: 'claude-opus-4.6', label: 'claude-opus-4.6', enabled: false },
    { id: 'claude-opus-4.7', label: 'claude-opus-4.7', enabled: false },
    { id: 'claude-opus-4.8', label: 'claude-opus-4.8', enabled: false },
  ],
};

/** Same catalog with every model on-plan — the control case. */
const amrAgentAllEnabled: AgentInfo = {
  ...amrAgent,
  models: (amrAgent.models ?? []).map((model) => ({ ...model, enabled: true })),
};

/**
 * Mirrors `App.handleAgentModelChange`: merge into the persisted choice, keep a
 * ref as the write-through truth source, and re-render the switcher with the new
 * config. This is the round-trip the chip label actually depends on, and the
 * same round-trip a page reload replays out of the persisted config.
 */
function StatefulSwitcher({
  agents,
  initialConfig,
  compact = true,
  onPersist,
}: {
  agents: AgentInfo[];
  initialConfig?: Partial<AppConfig>;
  compact?: boolean;
  onPersist?: (agentId: string, model: string | undefined) => void;
}) {
  const [config, setConfig] = useState<AppConfig>({ ...baseConfig, ...initialConfig });
  const persistedRef = useRef(config);
  return (
    <InlineModelSwitcher
      config={config}
      agents={agents}
      providerModelsCache={{}}
      compact={compact}
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
        onPersist?.(agentId, merged.model);
        setConfig(next);
      }}
      onApiProtocolChange={vi.fn()}
      onApiModelChange={vi.fn()}
      onOpenSettings={vi.fn()}
    />
  );
}

function chipText(): string {
  return screen.getByTestId('inline-model-switcher-chip').textContent ?? '';
}

function openSwitcher(): HTMLElement {
  fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
  return screen.getByTestId('inline-model-switcher-popover');
}

function compactRow(modelId: string): HTMLElement {
  return screen.getByTestId(`inline-model-switcher-compact-model-${modelId}`);
}

function isOffered(row: HTMLElement): boolean {
  return (
    !(row as HTMLButtonElement).disabled && row.getAttribute('aria-disabled') !== 'true'
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Pins the clock inside/outside the real campaign window — the ONLY lever
 *  left for campaign visibility now that the URL review parameters are gone. */
function mockNow(at: string): void {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(at));
}

describe('compact home model list — a clicked model reaches the chip', () => {
  it('never offers a model whose click the chip will not honor', () => {
    // The invariant, stated as the user sees it. Any row the list presents as
    // clickable must move the chip; a row it will not honor must be presented
    // as unavailable with a reason. Today `claude-opus-4.6` (and the other
    // off-plan Claude tiers) are offered as plain rows and clicking them leaves
    // the chip on `deepseek-v4-flash`.
    for (const model of amrAgent.models ?? []) {
      render(<StatefulSwitcher agents={[amrAgent]} />);
      expect(chipText()).toContain('deepseek-v4-flash');

      openSwitcher();
      const row = compactRow(model.id);
      const offered = isOffered(row);
      fireEvent.click(row);

      if (offered) {
        expect(chipText(), `${model.id} was offered as selectable`).toContain(
          model.label,
        );
      } else {
        // Refused is fine — silently refused is not. The row must say why.
        expect(
          screen.getByTestId(`inline-model-switcher-compact-model-lock-${model.id}`)
            .textContent,
          `${model.id} was refused without a reason`,
        ).toBeTruthy();
        expect(chipText()).toContain('deepseek-v4-flash');
      }
      cleanup();
    }
  });

  it('applies an on-plan model the user clicks', () => {
    // Control case: this passes on the unfixed code. It is what rules out the
    // outside-click/`mousedown` close handler as the cause — if that handler
    // were unmounting the list before the option's click fired, this case would
    // fail too.
    render(<StatefulSwitcher agents={[amrAgentAllEnabled]} />);
    expect(chipText()).toContain('deepseek-v4-flash');

    openSwitcher();
    fireEvent.click(compactRow('deepseek-v4-pro'));

    expect(chipText()).toContain('deepseek-v4-pro');
    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();
  });

  it('lists available models above the ones the plan does not include', () => {
    // Same ordering the execution-settings picker already applies via
    // `orderModelOptionsByAvailability`. The compact list was the one surface
    // rendering the raw catalog order, so off-plan models could sit on top of
    // the ones the caller can actually pick.
    const interleaved: AgentInfo = {
      ...amrAgent,
      models: [
        { id: 'claude-opus-4.8', label: 'claude-opus-4.8', enabled: false },
        { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash', enabled: true, default: true },
        { id: 'claude-opus-4.6', label: 'claude-opus-4.6', enabled: false },
        { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro', enabled: true },
      ],
    };
    render(<StatefulSwitcher agents={[interleaved]} />);
    const popover = openSwitcher();
    const labels = within(popover)
      .getAllByRole('radio')
      .map((row) => row.textContent ?? '');

    expect(labels[0]).toContain('deepseek-v4-flash');
    expect(labels[1]).toContain('deepseek-v4-pro');
    expect(labels.slice(2).join('\n')).not.toContain('deepseek');
  });

  it('writes nothing at all when a refused model is clicked', () => {
    // The refusal happens BEFORE the write, not after: without the gate the
    // click lands a locked model in the config (which `saveConfig` persists and
    // `syncConfigToDaemon` pushes to the daemon) and a second write reverts it.
    // Two round-trips to store a value the user never gets.
    const persisted = vi.fn();
    render(<StatefulSwitcher agents={[amrAgent]} onPersist={persisted} />);
    openSwitcher();
    fireEvent.click(compactRow('claude-opus-4.6'));

    expect(persisted).not.toHaveBeenCalled();
    expect(chipText()).toContain('deepseek-v4-flash');
  });

  it('re-selecting the already active model closes the list without changing the chip', () => {
    render(<StatefulSwitcher agents={[amrAgentAllEnabled]} />);
    openSwitcher();
    fireEvent.click(compactRow('deepseek-v4-flash'));

    expect(chipText()).toContain('deepseek-v4-flash');
    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();
  });

  it('shows the unlimited badge only on DeepSeek V4 Flash and keeps it in the selected chip', () => {
    // Campaign visibility is decided by the real window alone: pin the clock
    // inside the window instead of the removed ?campaign= review parameters.
    mockNow(DEEPSEEK_V4_FLASH_CAMPAIGN.window.startAt);
    render(<StatefulSwitcher agents={[amrAgentAllEnabled]} />);

    expect(chipText()).toContain('deepseek-v4-flash');
    expect(within(screen.getByTestId('inline-model-switcher-chip')).getByText('Unlimited'))
      .toBeInTheDocument();

    const popover = openSwitcher();
    expect(within(compactRow('deepseek-v4-flash')).getByText('Unlimited'))
      .toBeInTheDocument();
    expect(within(compactRow('deepseek-v4-pro')).queryByText('Unlimited'))
      .toBeNull();
    expect(within(popover).getAllByText('Unlimited')).toHaveLength(1);
  });

  it('hides the campaign badge entirely outside the real window', () => {
    // The half-open window: at endAtExclusive the campaign is over, and no
    // URL parameter can bring the badge back.
    mockNow(DEEPSEEK_V4_FLASH_CAMPAIGN.window.endAtExclusive);
    render(<StatefulSwitcher agents={[amrAgentAllEnabled]} />);

    expect(chipText()).toContain('deepseek-v4-flash');
    expect(within(screen.getByTestId('inline-model-switcher-chip')).queryByText('Unlimited'))
      .toBeNull();

    const popover = openSwitcher();
    expect(within(popover).queryByText('Unlimited')).toBeNull();
  });

  it('still closes on a click genuinely outside the switcher', () => {
    render(
      <div>
        <StatefulSwitcher agents={[amrAgentAllEnabled]} />
        <button type="button" data-testid="outside">
          outside
        </button>
      </div>,
    );
    openSwitcher();
    fireEvent.mouseDown(screen.getByTestId('outside'));

    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();
  });

  it('keeps the execution-settings picker applying a model', () => {
    // The non-compact surface the existing portal-class exemption protects. It
    // must keep working: its option list is a `document.body` portal, so its
    // clicks land outside the switcher's wrapper.
    render(<StatefulSwitcher agents={[amrAgentAllEnabled]} compact={false} />);
    openSwitcher();

    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-model'));
    const modelPopover = screen.getByTestId(
      'inline-model-switcher-agent-model-popover',
    );
    fireEvent.mouseDown(modelPopover);
    fireEvent.click(
      within(modelPopover).getByRole('option', { name: /deepseek-v4-pro/ }),
    );

    expect(chipText()).toContain('deepseek-v4-pro');
    expect(screen.getByTestId('inline-model-switcher-agent-model')).toHaveTextContent(
      'deepseek-v4-pro',
    );
  });
});

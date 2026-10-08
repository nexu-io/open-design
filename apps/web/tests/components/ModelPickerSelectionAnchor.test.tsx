// @vitest-environment jsdom
//
// OPEND-2812 — "模型选择器打开时定位到上次选中的模型".
//
// Reported pain: "用户频繁切换模型时,每次都要重新查找上次选中的模型,选择效率低."
// Expected: "打开选择器时高亮当前／上次选择的模型,并滚动定位到对应位置."
//
// Both model lists cap their height and scroll — the compact home list at six
// rows (`.inline-switcher--compact .inline-switcher__agent-grid`, max-height
// 226px) and the searchable popover at 280px. A catalog longer than the cap
// therefore opens on its FIRST row, with the model actually in effect below the
// fold, which is exactly the hunting the ticket describes.
//
// "Current" and "last" are the same thing here: the model in effect is what the
// chip already shows and what the list already marks selected. So these specs
// pin the two halves of the requirement against that existing selection — no
// second "last picked" state is invented:
//   1. the model in effect is marked selected (aria-checked / aria-selected),
//   2. and it is put inside its scroller's visible area when the list opens.
//
// Judged on observable behavior only: ARIA state plus the scroll-positioning
// call recorded off the elements themselves. No CSS class assertions
// (apps/web/src/components/chat/AGENTS.md §5).

import { useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InlineModelSwitcher } from '../../src/components/InlineModelSwitcher';
import { SearchableModelSelect } from '../../src/components/modelOptions';
import type { AgentInfo, AgentModelOption, AppConfig } from '../../src/types';

vi.mock('../../src/providers/provider-models', () => ({
  fetchProviderModels: vi.fn(async () => ({ ok: false, models: [] })),
}));

/**
 * jsdom implements no layout, so it ships no `Element.prototype.scrollIntoView`
 * at all. Record every call together with the element it was made ON — "which
 * row got scrolled into view" is the observable the ticket's second half is
 * about, and it is the only way to tell "anchored on the selection" apart from
 * "scrolled something, anything".
 */
interface ScrollCall {
  element: Element;
  options: unknown;
}

type ScrollableProto = { scrollIntoView?: (options?: unknown) => void };

let scrollCalls: ScrollCall[] = [];
let restoreScrollIntoView: () => void = () => {};

function installScrollRecorder(): void {
  scrollCalls = [];
  const proto = Element.prototype as unknown as ScrollableProto;
  const owned = Object.prototype.hasOwnProperty.call(
    Element.prototype,
    'scrollIntoView',
  );
  const original = proto.scrollIntoView;
  proto.scrollIntoView = function (this: Element, options?: unknown) {
    scrollCalls.push({ element: this, options });
  };
  restoreScrollIntoView = () => {
    if (owned) proto.scrollIntoView = original;
    else delete proto.scrollIntoView;
  };
}

function scrolledElements(): Element[] {
  return scrollCalls.map((call) => call.element);
}

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
  agentModels: {},
  agentCliEnv: {},
};

/** A catalog longer than the compact list's six-row cap, so the selection the
 *  specs pick is genuinely below the fold on open. */
const LONG_CATALOG: AgentModelOption[] = Array.from({ length: 18 }, (_, index) => ({
  id: `model-${index}`,
  label: `Model ${index}`,
  enabled: true,
}));

const longCatalogAgent: AgentInfo = {
  id: 'codex',
  name: 'Codex CLI',
  bin: 'codex',
  available: true,
  version: '1.0.0',
  models: LONG_CATALOG,
};

/** Mirrors the home composer's wiring: the switcher does not own persistence,
 *  the picked model flows back in as config. */
function CompactSwitcher({ initialConfig }: { initialConfig?: Partial<AppConfig> }) {
  const [config, setConfig] = useState<AppConfig>({ ...baseConfig, ...initialConfig });
  const persistedRef = useRef(config);
  return (
    <InlineModelSwitcher
      config={config}
      agents={[longCatalogAgent]}
      providerModelsCache={{}}
      compact
      daemonLive
      onModeChange={vi.fn()}
      onAgentChange={vi.fn()}
      onAgentModelChange={(agentId, choice) => {
        const next: AppConfig = {
          ...persistedRef.current,
          agentModels: {
            ...(persistedRef.current.agentModels ?? {}),
            [agentId]: choice,
          },
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

function openCompactSwitcher(): HTMLElement {
  fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
  return screen.getByTestId('inline-model-switcher-popover');
}

function compactRow(modelId: string): HTMLElement {
  return screen.getByTestId(`inline-model-switcher-compact-model-${modelId}`);
}

beforeEach(() => {
  installScrollRecorder();
});

afterEach(() => {
  restoreScrollIntoView();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('compact home model list — opening lands on the model in effect', () => {
  it('marks the model in effect selected and scrolls it into view', () => {
    render(<CompactSwitcher initialConfig={{ agentModels: { codex: { model: 'model-14' } } }} />);

    const popover = openCompactSwitcher();
    const selected = within(popover).getByTestId(
      'inline-model-switcher-compact-model-model-14',
    );

    // Half one: the list says which model is in effect.
    expect(selected.getAttribute('aria-checked')).toBe('true');
    // Half two: and puts it where the user can see it, without having to hunt.
    expect(scrolledElements()).toContain(selected);
    expect(scrollCalls.find((call) => call.element === selected)?.options).toEqual({
      block: 'nearest',
    });
  });

  it('anchors on the selection only — no other row is scrolled to', () => {
    render(<CompactSwitcher initialConfig={{ agentModels: { codex: { model: 'model-14' } } }} />);

    openCompactSwitcher();

    const scrolled = scrolledElements();
    for (const model of LONG_CATALOG) {
      if (model.id === 'model-14') continue;
      expect(scrolled, `${model.id} must not be scrolled to`).not.toContain(
        compactRow(model.id),
      );
    }
  });

  it('does not scroll at all when nothing in the list is selected', () => {
    // Reverse anchor — first use, or a saved model the catalog no longer
    // carries. Nothing is in effect inside this list, so nothing may be
    // yanked into view and nothing may crash.
    render(
      <CompactSwitcher
        initialConfig={{ agentModels: { codex: { model: 'model-that-left-the-catalog' } } }}
      />,
    );

    const popover = openCompactSwitcher();

    const rows = within(popover).getAllByRole('radio');
    expect(rows).toHaveLength(LONG_CATALOG.length);
    expect(rows.some((row) => row.getAttribute('aria-checked') === 'true')).toBe(false);
    expect(scrollCalls).toHaveLength(0);
  });
});

describe('searchable model picker — opening lands on the model in effect', () => {
  beforeEach(() => {
    // An on-screen trigger: jsdom reports a zero rect for everything, which
    // the picker treats as "no layout yet".
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 120,
      y: 200,
      top: 200,
      right: 360,
      bottom: 236,
      left: 120,
      width: 240,
      height: 36,
      toJSON: () => ({}),
    });
  });

  function openPicker(): HTMLElement {
    fireEvent.click(screen.getByRole('combobox'));
    return screen.getByTestId('model-popover');
  }

  it('marks the model in effect selected and scrolls it into view', () => {
    render(
      <SearchableModelSelect
        models={LONG_CATALOG}
        value="model-14"
        onChange={vi.fn()}
        searchPlaceholder="Search models"
        popoverTestId="model-popover"
      />,
    );

    const popover = openPicker();
    const selected = within(popover)
      .getAllByRole('option')
      .find((option) => option.getAttribute('aria-selected') === 'true');

    expect(selected).toBeTruthy();
    expect(scrolledElements()).toContain(selected);
  });

  it('brings the selected company into view alongside its model', () => {
    // The two-level browse (AMR's cross-vendor catalog) scrolls in BOTH panes:
    // the company rail on the left and that company's models on the right.
    const crossVendor: AgentModelOption[] = [
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `claude-${index}`,
        label: `Claude ${index}`,
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `deepseek-${index}`,
        label: `DeepSeek ${index}`,
      })),
    ];

    render(
      <SearchableModelSelect
        models={crossVendor}
        value="deepseek-4"
        onChange={vi.fn()}
        groupByCompany
        searchPlaceholder="Search models"
        popoverTestId="model-popover"
      />,
    );

    const popover = openPicker();
    const scrolled = scrolledElements();
    const selectedOption = within(popover)
      .getAllByRole('option')
      .find((option) => option.getAttribute('aria-selected') === 'true');

    expect(selectedOption).toBeTruthy();
    expect(scrolled).toContain(selectedOption);
    expect(scrolled).toContain(within(popover).getByTestId('model-company-deepseek'));
    expect(scrolled).not.toContain(within(popover).getByTestId('model-company-claude'));
  });

  it('does not scroll at all when no listed model is in effect', () => {
    render(
      <SearchableModelSelect
        models={LONG_CATALOG}
        value=""
        onChange={vi.fn()}
        searchPlaceholder="Search models"
        popoverTestId="model-popover"
      />,
    );

    const popover = openPicker();

    expect(within(popover).getAllByRole('option')).toHaveLength(LONG_CATALOG.length);
    expect(
      within(popover)
        .getAllByRole('option')
        .some((option) => option.getAttribute('aria-selected') === 'true'),
    ).toBe(false);
    expect(scrollCalls).toHaveLength(0);
  });
});

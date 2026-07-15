// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CUSTOM_MODEL_SENTINEL,
  isCustomModel,
  orderModelOptionsByAvailability,
  renderModelOptions,
  SearchableModelSelect,
} from '../../src/components/modelOptions';
import type { AgentModelOption } from '../../src/types';

function renderOptions(models: AgentModelOption[]): string {
  return renderToStaticMarkup(<select>{renderModelOptions(models)}</select>);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('renderModelOptions', () => {
  it('renders an empty model list without options', () => {
    expect(renderOptions([])).toBe('<select></select>');
  });

  it('renders flat model lists as ungrouped options in input order', () => {
    expect(
      renderOptions([
        { id: 'default', label: 'Default' },
        { id: 'sonnet', label: 'Claude Sonnet' },
        { id: 'opus', label: 'Claude Opus' },
      ]),
    ).toBe(
      '<select><option value="default">Default</option><option value="sonnet">Claude Sonnet</option><option value="opus">Claude Opus</option></select>',
    );
  });

  it('pins default and other flat options before provider optgroups', () => {
    expect(
      renderOptions([
        { id: 'openai/gpt-5.1', label: 'openai/gpt-5.1' },
        { id: 'custom-local', label: 'Custom local' },
        { id: 'default', label: 'Default' },
        { id: 'anthropic/claude-sonnet-4.5', label: 'anthropic/claude-sonnet-4.5' },
        { id: 'openai/o3', label: 'openai/o3' },
      ]),
    ).toBe(
      '<select><option value="default">Default</option><option value="custom-local">Custom local</option><optgroup label="openai"><option value="openai/gpt-5.1">gpt-5.1</option><option value="openai/o3">o3</option></optgroup><optgroup label="anthropic"><option value="anthropic/claude-sonnet-4.5">claude-sonnet-4.5</option></optgroup></select>',
    );
  });

  it('treats leading-slash ids as flat and only strips matching provider label prefixes', () => {
    expect(
      renderOptions([
        { id: '/missing-provider', label: '/missing-provider' },
        { id: 'openai/gpt-5.1', label: 'GPT 5.1' },
        { id: 'openai/o3', label: 'openai/o3' },
      ]),
    ).toBe(
      '<select><option value="/missing-provider">/missing-provider</option><optgroup label="openai"><option value="openai/gpt-5.1">GPT 5.1</option><option value="openai/o3">o3</option></optgroup></select>',
    );
  });
});

describe('isCustomModel', () => {
  const models: AgentModelOption[] = [
    { id: 'default', label: 'Default' },
    { id: 'openai/gpt-5.1', label: 'openai/gpt-5.1' },
  ];

  it('returns false for empty selections and listed model ids', () => {
    expect(isCustomModel(null, models)).toBe(false);
    expect(isCustomModel(undefined, models)).toBe(false);
    expect(isCustomModel('', models)).toBe(false);
    expect(isCustomModel('default', models)).toBe(false);
    expect(isCustomModel('openai/gpt-5.1', models)).toBe(false);
  });

  it('returns true for unlisted custom ids and the custom sentinel', () => {
    expect(isCustomModel('local/my-model', models)).toBe(true);
    expect(isCustomModel(CUSTOM_MODEL_SENTINEL, models)).toBe(true);
  });
});

describe('orderModelOptionsByAvailability', () => {
  it('keeps available models before unavailable models without reordering within each group', () => {
    expect(
      orderModelOptionsByAvailability([
        { id: 'locked-a', label: 'Locked A', enabled: false },
        { id: 'ready-a', label: 'Ready A' },
        { id: 'locked-b', label: 'Locked B', enabled: false },
        { id: 'ready-b', label: 'Ready B', enabled: true },
      ]).map((model) => model.id),
    ).toEqual(['ready-a', 'ready-b', 'locked-a', 'locked-b']);
  });
});

describe('SearchableModelSelect', () => {
  it('renders capability tag and cost metadata as option text', async () => {
    render(
      <SearchableModelSelect
        models={[
          {
            id: 'deepseek-v4-flash',
            label: 'deepseek-v4-flash',
            metadata: { cost: 'low', capability: 'standard' },
          },
        ]}
        value="deepseek-v4-flash"
        onChange={vi.fn()}
        searchPlaceholder="Search models"
        minSearchableOptions={1}
      />,
    );

    fireEvent.click(screen.getByRole('combobox'));

    const option = await screen.findByRole('option', { name: /^deepseek-v4-flash$/ });
    expect(option.textContent).toContain('Low cost');
    expect(option.textContent).toContain('Standard');
    expect(option.getAttribute('aria-labelledby')).toBeTruthy();
    expect(option.getAttribute('aria-describedby')).toBeTruthy();
    expect(option).toHaveAccessibleName('deepseek-v4-flash');
    expect(option).toHaveAccessibleDescription('Low cost Standard');
    expect(option.querySelector('[data-description]')).toBeNull();
    expect(option.querySelector('[data-label]')).toBeNull();
  });

  it('disables unavailable options and shows the provided hint', async () => {
    const onChange = vi.fn();
    render(
      <SearchableModelSelect
        models={[
          { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash', default: true },
          { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro', enabled: false },
        ]}
        value="deepseek-v4-flash"
        onChange={onChange}
        searchPlaceholder="Search models"
        disabledOptionHint={(option) =>
          option.enabled === false ? '请升级后使用高级模型' : null
        }
      />,
    );

    fireEvent.click(screen.getByRole('combobox'));

    const disabledOption = await screen.findByRole('option', { name: /^deepseek-v4-pro$/ });
    expect(disabledOption.hasAttribute('disabled')).toBe(true);
    expect(disabledOption.getAttribute('aria-describedby')).toBeTruthy();
    expect(disabledOption.textContent).toContain('请升级后使用高级模型');

    fireEvent.click(disabledOption);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders a lock affordance for disabled options that opens the upgrade destination', async () => {
    const onChange = vi.fn();
    const onDisabledOptionUpgrade = vi.fn();
    render(
      <SearchableModelSelect
        models={[
          { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash', default: true },
          { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro', enabled: false },
        ]}
        value="deepseek-v4-flash"
        onChange={onChange}
        searchPlaceholder="Search models"
        disabledOptionHint={(option) =>
          option.enabled === false ? 'Upgrade to use' : null
        }
        onDisabledOptionUpgrade={onDisabledOptionUpgrade}
      />,
    );

    fireEvent.click(screen.getByRole('combobox'));

    // The inline hint text is replaced by the lock affordance whose accessible
    // name (and tooltip) carry the hint.
    const disabledOption = await screen.findByRole('option', {
      name: /^deepseek-v4-pro$/,
    });
    expect(disabledOption.getAttribute('aria-disabled')).toBe('true');

    const lock = screen.getByTestId('model-option-upgrade-lock');
    expect(lock.getAttribute('aria-label')).toBe('Upgrade to use');
    expect(lock.getAttribute('title')).toBe('Upgrade to use');

    fireEvent.click(lock);
    expect(onDisabledOptionUpgrade).toHaveBeenCalledTimes(1);
    expect(onDisabledOptionUpgrade).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'deepseek-v4-pro' }),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps upgrade affordances outside the truncating model label', async () => {
    const longModelLabel = 'gemini-3-flash-preview-with-an-extra-long-provider-suffix';

    render(
      <SearchableModelSelect
        models={[
          { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash', default: true },
          {
            id: 'google/gemini-3-flash-preview',
            label: longModelLabel,
            enabled: false,
            metadata: { capability: 'standard' },
          },
        ]}
        value="deepseek-v4-flash"
        onChange={vi.fn()}
        searchPlaceholder="Search models"
        disabledOptionHint={(option) =>
          option.enabled === false ? 'Upgrade to use' : null
        }
        onDisabledOptionUpgrade={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('combobox'));

    const disabledOption = await screen.findByRole('option', {
      name: longModelLabel,
    });
    const label = disabledOption.querySelector('.model-select-searchable__option-label');
    const affordances = disabledOption.querySelector(
      '.model-select-searchable__option-affordances',
    );
    const lock = screen.getByTestId('model-option-upgrade-lock');
    const badge = disabledOption.querySelector('.model-select-searchable__option-badge');

    expect(label?.textContent).toBe(longModelLabel);
    expect(label?.contains(lock)).toBe(false);
    expect(affordances?.contains(lock)).toBe(true);
    expect(affordances?.contains(badge)).toBe(true);
    expect(disabledOption).toHaveAccessibleName(longModelLabel);
  });
});

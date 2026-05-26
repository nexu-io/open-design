import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  CUSTOM_MODEL_SENTINEL,
  isCustomModel,
  renderModelOptions,
} from '../../src/components/modelOptions';
import type { AgentModelOption } from '../../src/types';

function renderOptions(models: AgentModelOption[]): string {
  return renderToStaticMarkup(<select>{renderModelOptions(models)}</select>);
}

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

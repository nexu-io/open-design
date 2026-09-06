// @vitest-environment jsdom
/**
 * BYOK 模式下,紧凑 chip 的**读屏标签和提示**不许还念上一个 CLI agent 的名字。
 *
 * 真机复现(2026-08-27):在设置里配好 OpenRouter 的 key 之后回到首页,
 * chip 的可见文字是 `google/gemini-2.5-flash`(对的),但
 * `aria-label` / `data-tooltip` 是「**Claude Code** · google/gemini-2.5-flash」。
 * 而这一轮真正跑的是 `byok-opencode`(落盘 run 里
 * `agent=byok-opencode model=open-design-byok/google/gemini-2.5-flash`)——
 * 读屏用户会被告知一个根本没参与的执行者。
 *
 * 根因:非紧凑那支的 `chipPrimary` 按 `config.mode` 分了岔(API 模式用
 * `apiProtocolLabel`),而紧凑那支的 `chipAgentLabel` **没分岔**,
 * 永远取 `displayAgentName(currentAgent)` —— API 模式下那是留在 config 里的
 * 上一个 daemon agent,陈旧值。
 *
 * 判据落在 chip 的 `aria-label` 上,不是「有没有出现某个字符串」——
 * 模型名两种模式下都在标签里,只查模型名会永远通过。
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InlineModelSwitcher } from '../../src/components/InlineModelSwitcher';
import type { AgentInfo, AppConfig } from '../../src/types';

vi.mock('../../src/providers/provider-models', () => ({
  fetchProviderModels: vi.fn(async () => ({ ok: false, models: [] })),
}));

afterEach(cleanup);

const claudeAgent: AgentInfo = {
  id: 'claude',
  name: 'Claude Code',
  bin: 'claude',
  available: true,
  version: '2.1.247',
  models: [{ id: 'default', label: 'CLI 默认设置', enabled: true, default: true }],
} as unknown as AgentInfo;

function configOf(over: Partial<AppConfig>): AppConfig {
  return {
    mode: 'daemon',
    apiKey: '',
    apiProtocol: 'openai',
    apiVersion: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'google/gemini-2.5-flash',
    apiProviderBaseUrl: 'https://openrouter.ai/api/v1',
    apiProtocolConfigs: {},
    agentId: 'claude',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: {},
    agentCliEnv: {},
    ...over,
  } as AppConfig;
}

function show(config: AppConfig): HTMLElement {
  render(
    <InlineModelSwitcher
      config={config}
      agents={[claudeAgent]}
      providerModelsCache={{}}
      compact
      daemonLive
      onModeChange={vi.fn()}
      onAgentChange={vi.fn()}
      onAgentModelChange={vi.fn()}
      onApiProtocolChange={vi.fn()}
      onApiModelChange={vi.fn()}
      onOpenSettings={vi.fn()}
    />,
  );
  return screen.getByTestId('inline-model-switcher-chip');
}

describe('BYOK 紧凑 chip 的读屏标签', () => {
  it('API 模式下不许念出 CLI agent 的名字', () => {
    const chip = show(configOf({ mode: 'api' }));
    expect(chip.getAttribute('aria-label') ?? '').not.toContain('Claude Code');
    expect(chip.getAttribute('data-tooltip') ?? '').not.toContain('Claude Code');
  });

  it('API 模式下标签仍要说清是哪条通路 —— 不能修成只剩模型名', () => {
    const chip = show(configOf({ mode: 'api' }));
    const label = chip.getAttribute('aria-label') ?? '';
    expect(label).toContain('google/gemini-2.5-flash');
    // 模型名之外还得有个来源词,否则读屏只念一串模型 id
    expect(label.replace('google/gemini-2.5-flash', '').trim().length).toBeGreaterThan(0);
  });

  it('daemon 模式照旧念 agent 名 —— 否则上面两条就是把标签删了', () => {
    const chip = show(configOf({ mode: 'daemon' }));
    expect(chip.getAttribute('aria-label') ?? '').toContain('Claude Code');
  });
});

// @vitest-environment jsdom
/**
 * 红测(E3 的下半段):报错卡上的〔更换模型〕要能**从外面把这张模型选择器打开**。
 *
 * 交付稿 `error-ux-design.md:130`(S08):「更换模型直接打开模型选择器,选完自动重跑」。
 * `AvatarMenu` 的开合本来只由它自己的触发器控制,外面叫不开 —— 所以给一个
 * 只进不出的信号量:数字一变就打开,不去接管它平时的开合(那仍归它自己)。
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AvatarMenu } from '../../src/components/AvatarMenu';
import type { AppConfig } from '../../src/types';

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: (k: string) => k }),
  useT: () => ((k: string) => k),
}));

afterEach(() => cleanup());

const config = { mode: 'cli', agentId: 'claude' } as unknown as AppConfig;
const agents = [{ id: 'claude', name: 'Claude Code', available: true }] as never;

function renderMenu(openSignal?: number) {
  return render(
    <AvatarMenu
      config={config}
      agents={agents}
      daemonLive
      onModeChange={vi.fn()}
      onAgentChange={vi.fn()}
      onAgentModelChange={vi.fn()}
      onOpenSettings={vi.fn()}
      onRefreshAgents={vi.fn()}
      {...(openSignal !== undefined ? { openSignal } : {})}
    />,
  );
}

/**
 * 开合看触发器上的 `aria-expanded` —— `.avatar-menu` 是常驻的外壳,
 * 真正的浮层还走 portal(挂到 body 上,不在 container 里),两者都判不出开没开。
 */
const isOpen = (container: HTMLElement) =>
  container.querySelector('[aria-expanded]')?.getAttribute('aria-expanded') === 'true';

describe('AvatarMenu 可以被外面叫开', () => {
  it('stays closed on its own', () => {
    const { container } = renderMenu(0);
    expect(isOpen(container)).toBe(false);
  });

  it('opens when the signal advances', () => {
    const { container, rerender } = renderMenu(0);
    expect(isOpen(container)).toBe(false);
    rerender(
      <AvatarMenu
        config={config}
        agents={agents}
        daemonLive
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onOpenSettings={vi.fn()}
        onRefreshAgents={vi.fn()}
        openSignal={1}
      />,
    );
    expect(isOpen(container), '信号推进了却没打开 =〔更换模型〕按下去没反应').toBe(true);
  });

  it('does not reopen itself on an unrelated re-render', () => {
    // 信号没动就不该有动作 —— 否则用户手动关掉之后,任何一次重渲染都会把它弹回来。
    const { container, rerender } = renderMenu(0);
    rerender(
      <AvatarMenu
        config={config}
        agents={agents}
        daemonLive
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onOpenSettings={vi.fn()}
        onRefreshAgents={vi.fn()}
        openSignal={0}
      />,
    );
    expect(isOpen(container)).toBe(false);
  });
});

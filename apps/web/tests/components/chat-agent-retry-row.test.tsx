// @vitest-environment jsdom
/**
 * 红测:组件 22 那一行要能说第二句话 —— 「正在重试」。
 *
 * 形态逐字沿用第 82/83 格(球 + 会扫光的一句 + 计数),因为交付稿 4058 明说
 * 不许为同一件事再立第三个模块。换掉的只有那句话:重跑一轮的时候连接是通的,
 * 说「正在重新连接」会把「线真的断了」这句话说漏。
 *
 * 计数那一条另有讲究:今天 daemon 的自动重试预算是 **1**
 * (`apps/daemon/src/run-retry-policy.ts` 的 `DEFAULT_SAFE_RUN_RETRY_MAX_ATTEMPTS`,
 * 从未改过;放宽到 2 是 `run-error-catalog.md` 的 Q-11,**还没裁**)。
 * 「1/1」写在脸上等于告诉用户「一共就一次,而这一次正在用掉」—— 读起来像倒计时,
 * 而且没有任何信息量。所以预算 ≤ 1 时只说那句话,不写分数;预算真的放宽到 2
 * 之后,同一段代码自动开始显示「1/2」,不用再改一次。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../src/i18n';
import { Reconnect } from '../../src/components/chat/Reconnect';

afterEach(() => { cleanup(); });

const render = (ui: ReactElement) => rtlRender(<I18nProvider initial="zh-CN">{ui}</I18nProvider>);
const row = () => screen.getByTestId('chat-reconnect');
const orb = () => row().querySelector('[data-orb]');

describe('Reconnect · 自动重试读数', () => {
  it('说的是「正在重试」,不是「正在重新连接」', () => {
    render(<Reconnect attempt={1} max={2} reason="agent-retry" />);
    // 逐字浮现会拆文本节点,所以读 textContent 而不是 getByText。
    expect(row().textContent).toBe('正在重试1/2');
    expect(row().textContent).not.toContain('重新连接');
  });

  it('形态和第 82 格一致 —— 同一颗球,同样没有按钮', () => {
    render(<Reconnect attempt={1} max={2} reason="agent-retry" />);
    expect(orb()).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  // 今天的真实预算就是 1。
  it('预算只有一次时不写分数', () => {
    render(<Reconnect attempt={1} max={1} reason="agent-retry" />);
    expect(row().textContent).toBe('正在重试');
  });

  it('没在重试就整行消失,不留「已恢复」', () => {
    render(<Reconnect attempt={0} max={2} reason="agent-retry" />);
    expect(screen.queryByTestId('chat-reconnect')).toBeNull();
  });
});

describe('传输层那一行一个字没变', () => {
  it('不传 reason 时仍然是「正在重新连接 N/5」', () => {
    render(<Reconnect attempt={2} max={5} />);
    expect(row().textContent).toBe('正在重新连接2/5');
  });

  it('显式传 transport 也一样', () => {
    render(<Reconnect attempt={2} max={5} reason="transport" />);
    expect(row().textContent).toBe('正在重新连接2/5');
  });

  it('agent 上游重连也说「正在重新连接」并原位显示计数', () => {
    render(<Reconnect attempt={2} max={5} reason="agent-reconnect" />);
    expect(row().textContent).toBe('正在重新连接2/5');
  });

  it('读数超过预算仍然夹到预算上', () => {
    render(<Reconnect attempt={7} max={5} reason="transport" />);
    expect(row().textContent).toBe('正在重新连接5/5');
  });
});

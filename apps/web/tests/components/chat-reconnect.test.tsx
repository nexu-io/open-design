// @vitest-environment jsdom
/**
 * 组件 22 · 重连(84 格状态矩阵第 82–84 格)。
 *
 * 这一族的验收点不在「字对不对」,在**形状与边界**:
 *   · 82 / 83 是同一副形状,只有计数不同 —— 陈列页两格并排就是为了让设计确认这件事
 *   · 恢复后整行消失,不留「已恢复」
 *   · 84 停止自动重连,换成一颗交回给人的按钮
 *   · 计数不能超过预算(传输层的预算会被 keepalive 续上,读数可能大过 max)
 *
 * 文案按 `components/chat/AGENTS.md` §0 逐字对设计稿(zh-CN 是原文,不改写),
 * 其余断言只碰行为 / ARIA / 稳定的 `data-testid` —— §5 明令不断 CSS 类名。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../src/i18n';
import { Reconnect } from '../../src/components/chat/Reconnect';

afterEach(() => { cleanup(); });

const render = (ui: ReactElement) => rtlRender(<I18nProvider initial="zh-CN">{ui}</I18nProvider>);
const row = () => screen.getByTestId('chat-reconnect');
/** 那颗球 —— Orb 自己挂的 data-orb,是这一行「还在等」的稳定标记 */
const orb = () => row().querySelector('[data-orb]');

describe('Reconnect · 82 重连中', () => {
  it('shows how many attempts in, out of the transport budget', () => {
    render(<Reconnect attempt={2} max={5} />);
    // 设计稿 4354 的原文,计数紧跟在这句话后面(同一条扫光里)
    expect(row().textContent).toBe('正在重新连接2/5');
    expect(orb()).not.toBeNull();
  });

  it('drops the fraction when nothing is counting behind it', () => {
    /*
     * 浏览器自己报「这一屏没网了」时推的就是这一档(`ChatReconnectSignal` 的
     * `network`,读数固定 1/1)。背后**没有梯子在数** —— 那种断法里传输层的
     * 重连预算一次都没上膛 —— 所以写「1/5」是假话,写「1/1」像倒计时且一个
     * 信息都没给。判据是组件自己的 `showCount = max > 1`,这里钉住它的外观。
     */
    render(<Reconnect attempt={1} max={1} />);
    expect(row().textContent).toBe('正在重新连接');
    expect(orb()).not.toBeNull();
  });

  it('renders nothing once the connection is no longer dropping', () => {
    // 传输层恢复时发的是 { attempt: 0, phase: 'cleared' } —— 调用方可以直接铺进来,
    // 由组件自己判「这一行该没了」。设计稿:恢复后整行消失,不留「已恢复」。
    render(<Reconnect attempt={0} max={5} />);
    expect(screen.queryByTestId('chat-reconnect')).toBeNull();
  });

  it('keeps the detail chevron out until someone can answer what broke', () => {
    // 今天的传输层把 fetch 抛错 / 流提前关 / 只收到 keepalive 走同一条路径,
    // 分不出断因;不传 onShowDetail 就不该出这颗点开什么都没有的箭头。
    render(<Reconnect attempt={2} max={5} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers the detail chevron with an accessible name when a handler is wired', () => {
    const onShowDetail = vi.fn();
    render(<Reconnect attempt={2} max={5} onShowDetail={onShowDetail} />);
    const chevron = screen.getByRole('button', { name: '查看详情' });
    fireEvent.click(chevron);
    expect(onShowDetail).toHaveBeenCalledTimes(1);
  });
});

describe('Reconnect · 83 最后一次', () => {
  it('is the same shape as any other attempt — only the count moved', () => {
    const { unmount } = render(<Reconnect attempt={2} max={5} />);
    const mid = { orb: orb() !== null, buttons: screen.queryAllByRole('button').length };
    unmount();

    render(<Reconnect attempt={5} max={5} />);
    expect(row().textContent).toContain('5/5');
    expect({ orb: orb() !== null, buttons: screen.queryAllByRole('button').length }).toEqual(mid);
  });

  it('never shows a count past the budget', () => {
    // 预算会被 keepalive 空转续上,读数可能走到 7 —— 但屏幕上不该出现「7/5」。
    render(<Reconnect attempt={7} max={5} />);
    expect(row().textContent).toContain('5/5');
    expect(row().textContent).not.toContain('7');
  });
});

describe('Reconnect · 84 重连失败', () => {
  it('stops counting and hands the retry back to the user', () => {
    const onReconnect = vi.fn();
    render(<Reconnect attempt={5} max={5} exhausted onReconnect={onReconnect} />);

    // 不再是「还在等」:球撤了,计数也不再报
    expect(orb()).toBeNull();
    expect(row().textContent).not.toContain('5/5');
    expect(screen.getByText('连接失败')).toBeTruthy();

    // 稿子给的是「重新连接」不是「重试」—— 语义是接回同一个 run 的流,不是新建 run
    fireEvent.click(screen.getByRole('button', { name: '重新连接' }));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('still states the failure when nobody wired a reconnect action', () => {
    render(<Reconnect attempt={5} max={5} exhausted />);
    expect(screen.queryByTestId('chat-reconnect')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the failed row even after the counter was cleared', () => {
    // exhausted 优先于 attempt:传输层用尽预算时发的是 { attempt: 5, phase: 'exhausted' },
    // 但调用方若先把读数清了再置失败,这一行仍然要在。
    render(<Reconnect attempt={0} max={5} exhausted />);
    expect(screen.queryByTestId('chat-reconnect')).not.toBeNull();
  });
});

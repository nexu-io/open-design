// @vitest-environment jsdom
/**
 * 生图失败格的「重试」要真的接上(设计稿组件 12 · 第 11 格)。
 *
 * 原来 `ImageRow` 有 `onRetry` 这个口子,但一路没人传 —— 那一格只画不点。
 * 事件流里既没有「重发第 N 张」的动作、也没有「哪一张砸了」的顺序,
 * 所以接法是**走正常发送路径**:组一句人话交给 agent(D59)。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ExecutionShell as ShellData } from '../../../src/runtime/chat/contract';

afterEach(() => cleanup());
const render = (ui: ReactElement) => rtlRender(<I18nProvider initial="zh-CN">{ui}</I18nProvider>);

const gen = (path: string) => JSON.stringify({ status: 'succeeded', path });
const fail = () => JSON.stringify({ status: 'failed', error: { code: 'provider_missing' } });

function shellWithFailedImage(
  runStatus: NonNullable<Parameters<typeof buildTurnBlocks>[0]['runStatus']> = 'succeeded',
): ShellData {
  const events: PersistedAgentEvent[] = [
    { kind: 'tool_use', id: 'g1', name: 'Bash', input: { command: 'od media generate a && od media generate b' }, startedAt: 0 },
    { kind: 'tool_result', toolUseId: 'g1', content: [gen('a.png'), fail()].join('\n'), isError: false, completedAt: 1200 },
  ];
  const shell = buildTurnBlocks({ events, runStatus })
    .find((b): b is ShellData => b.kind === 'shell');
  if (!shell) throw new Error('没有生成执行记录壳');
  return shell;
}

describe('生图重试', () => {
  it('给了回调就能点,点了把「砸了几张」交出去', () => {
    const onRetryImage = vi.fn();
    render(
      <ExecutionShell
        shell={shellWithFailedImage()}
        onRetryImage={onRetryImage}
        runTerminal
        deferCollapsedBodies={false}
      />,
    );

    const retry = screen.getByRole('button', { name: '重试' });
    fireEvent.click(retry);

    expect(onRetryImage).toHaveBeenCalledTimes(1);
    expect(onRetryImage.mock.calls[0]?.[0]).toMatchObject({ failed: 1 });
  });

  /*
   * ⚠️ 下面两条原来断言的是「『重试』两个字还在,只是不可点」。产品 2026-09-02
   * 推翻了那一版:不能点的时候摆的是**另一样东西** —— 错误图标 +「失败」。
   * 长得像按钮却没反应,用户读到的是「界面卡了」,不是「现在不该我动手」。
   * 两态的形态判据在 `image-fail-cell-two-states.test.tsx`;这里只守接线。
   */
  it('没有回调时只画不点 —— 不摆一颗按不动的按钮', () => {
    render(<ExecutionShell shell={shellWithFailedImage()} deferCollapsedBodies={false} />);
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
    expect(screen.queryByText('重试')).toBeNull();
    expect(screen.getByText('失败')).toBeTruthy();
  });

  it('整轮仍在运行时不开放媒体重试,避免和 agent fallback 并发', () => {
    render(
      <ExecutionShell
        shell={shellWithFailedImage('running')}
        onRetryImage={vi.fn()}
        runTerminal={false}
        deferCollapsedBodies={false}
      />,
    );

    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
    expect(screen.queryByText('重试')).toBeNull();
    expect(screen.getByText('失败')).toBeTruthy();
  });
});

// @vitest-environment jsdom
/**
 * 生图失败格的**两种样子** —— OPEND-2544 的呈现形态,产品 2026-09-02 定死。
 *
 * ## 原来错在哪
 *
 * OPEND-2544 的判据早就接上了(`ExecutionShell` 只在整轮进终态时才把 `onRetryImage`
 * 往下传),但**呈现**没跟着分家:`ImageRow` 的两条分支共用同一份 `inner`
 * ——「↻ 重试」。于是轮次还在跑的时候,用户看见的是一枚
 * **长得像按钮、点了没反应**的「重试」。这比「不给重试」更糟:它把
 * 「现在不该你动手」误读成「界面卡了」。
 *
 * ## 定下来的两态
 *
 *   run 还在跑   [错误图标] + 「失败」   —— 一条**状态说明**,不是 button,不可点
 *   run 已结束   [重试图标] + 「重试」   —— 真按钮,点了走 `onRetry`
 *
 * 「不是暂时不能点的按钮,是一条状态说明」是这一条的核心:所以下面不止断言
 * `queryByRole('button')` 为空,还要断言那一格里**根本没有** button 语义
 * (没有 `<button>`、没有 `role="button"`、没有 disabled 的按钮壳)。
 *
 * ## 判据用 `running`,取消 / 失败终止都给重试
 *
 * `running` 说的是「这一轮还活着」(`ExecutionShell` 里 `status === 'running' && !stopped`)。
 * OPEND-2544 要挡的是**并发**:agent 自己还在切 provider 重试的时候,用户再手动重试
 * 会和它打架。轮次一旦停下 —— 无论是跑完、跑挂、还是用户按停 —— 那个并发的对手
 * 就不存在了,重试对用户只有好处(尤其取消:整批不想要了,但这一张还想要)。
 * 所以判据是「还活着吗」,不是「成功了吗」。仓库既有的接线也正是这一档:
 * `AssistantMessage` 传的是 `isTerminalRunStatus()`,它包含 `canceled` 和 `failed`。
 *
 * ## 图标为什么盯 `d`,不盯组件名
 *
 * 和 `thoughts-row-icon.test.tsx` 同一条理由:DOM 上没有「图标名」这种东西,
 * 只有一条 `d`。而这一枚的路径数据是从 `REMIX_ICON_PATHS['error-warning-line']`
 * 取的 —— 那张表一改、键一改名,`d` 会静默变成 `undefined`,图标**整枚消失**
 * 而组件不报错。所以这里钉的是产品交付件 `error-warning-line.svg` 里那条 `d` 原文。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { I18nProvider } from '../../../src/i18n';
import { ImageRow } from '../../../src/components/chat/primitives/ImageRow';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ExecutionShell as ShellData, ImageRow as ImageRowData } from '../../../src/runtime/chat/contract';
import styles from '../../../src/components/chat/primitives/record.module.css';

afterEach(cleanup);
const render = (ui: ReactElement) => rtlRender(<I18nProvider initial="zh-CN">{ui}</I18nProvider>);

/** 产品 2026-09-02 交付的 `error-warning-line.svg` 里那条 `d`,逐字节原文。 */
const ERROR_WARNING_LINE_D =
  'M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20ZM11 15H13V17H11V15ZM11 7H13V13H11V7Z';

const failedCell = (root: HTMLElement): HTMLElement => {
  const cell = root.querySelector<HTMLElement>('[data-image-cell="failed"]');
  if (!cell) throw new Error('没有渲染出失败格');
  return cell;
};

/** 一批 3 张:1 张出好、1 张砸了、1 张还没回来。`pending` 为真 = 还有格子没回来。 */
const liveRow = (over: Partial<ImageRowData> = {}): ImageRowData => ({
  kind: 'image',
  id: 'media-batch:b1',
  surface: 'image',
  total: 3,
  done: 1,
  failed: 1,
  thumbs: ['a.png'],
  cells: [
    { taskId: 'one', status: 'done', path: 'a.png' },
    { taskId: 'two', status: 'failed' },
    { taskId: 'three', status: 'pending' },
  ],
  pending: true,
  elapsedMs: null,
  ...over,
});

/** 全回来了,其中一张砸了 —— 不收行,大格形态。 */
const settledRow = (): ImageRowData => liveRow({
  total: 2,
  done: 1,
  failed: 1,
  pending: false,
  cells: [
    { taskId: 'one', status: 'done', path: 'a.png' },
    { taskId: 'two', status: 'failed' },
  ],
});

describe('生图失败格 · 轮次还在跑', () => {
  it('给的是错误图标 +「失败」,不是「重试」', () => {
    const { container } = render(<ImageRow row={liveRow()} running onRetry={vi.fn()} />);
    const cell = failedCell(container);

    expect(cell.textContent, '还在跑的时候只说「失败」').toBe('失败');
    expect(cell.textContent).not.toContain('重试');
    expect(cell.querySelector('path')?.getAttribute('d')).toBe(ERROR_WARNING_LINE_D);
    expect(cell.querySelector('svg')?.getAttribute('fill'), '颜色要跟着失败态的语义色走').toBe('currentColor');
  });

  it('那一格没有任何按钮语义 —— 它不是「暂时不能点的按钮」', () => {
    const onRetry = vi.fn();
    const { container } = render(<ImageRow row={liveRow()} running onRetry={onRetry} />);
    const cell = failedCell(container);

    expect(cell.querySelector('button'), '不是 button').toBeNull();
    expect(cell.querySelector('[role="button"]'), '也不冒充 button').toBeNull();
    expect(cell.querySelector('[disabled]'), '不是禁用态的按钮,是一条状态说明').toBeNull();
    expect(screen.queryByRole('button', { name: /重试|失败/ })).toBeNull();

    // 就算点上去也没有处理器可跑
    fireEvent.click(cell.firstElementChild ?? cell);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('这条状态说明不套用「重试」那一枚的样式(不会跟着变手型 / 变色)', () => {
    const { container } = render(<ImageRow row={liveRow()} running onRetry={vi.fn()} />);
    const note = failedCell(container).firstElementChild as HTMLElement;
    /*
     * ⚠️ 别写成 `expect(className).toMatch(/failNote/)`。vitest 的 CSS Module
     * 是**按键名现编**类名的(`classNameStrategy: 'stable'` → `_<键名>_<文件哈希>`),
     * 键根本不存在也照样给你一个字符串 —— 把 `styles.failNote` 打错成
     * `styles.failNoteTypo`,那条正则一样绿。实测过。
     * 所以这里比的是**同一张表里的两个键**,再由下面那段读 CSS 原文的断言
     * 证明 `failNote` 在样式表里真的有规则。两条合起来才闭环。
     */
    expect(note.className, '状态说明挂的就是 failNote 那一份').toBe(styles.failNote);
    expect(styles.failNote, '和可点那枚必须是两个类,否则 cursor: pointer 会跟过来')
      .not.toBe(styles.retry);

    const css = readFileSync(
      resolve(__dirname, '../../../src/components/chat/primitives/record.module.css'),
      'utf8',
    );
    const block = /\.shot\.fail \.failNote\s*\{([^}]*)\}/.exec(css);
    expect(block, '失败说明要有自己的规则块 —— 没有的话上面那个类名是空头支票').not.toBeNull();
    expect(block![1], '状态说明不该有手型').not.toMatch(/cursor:\s*pointer/);
    expect(css, '也不该有悬停换色').not.toMatch(/\.shot\.fail \.failNote:hover/);
  });
});

describe('生图失败格 · 轮次已结束', () => {
  it('换成重试图标 +「重试」,并且真的能点', () => {
    const onRetry = vi.fn();
    const { container } = render(<ImageRow row={settledRow()} onRetry={onRetry} />);
    const cell = failedCell(container);
    const button = cell.querySelector('button');

    expect(button, '结束之后才给按钮').not.toBeNull();
    expect(button!.textContent).toBe('重试');
    expect(button!.querySelector('path')?.getAttribute('d'), '换图标,不是错误图标')
      .not.toBe(ERROR_WARNING_LINE_D);

    fireEvent.click(button!);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ kind: 'image' }), 1);
  });

  it('没接回调时不摆空按钮,退回那条状态说明', () => {
    const { container } = render(<ImageRow row={settledRow()} />);
    const cell = failedCell(container);
    expect(cell.querySelector('button'), '没有处理器就不该有按钮').toBeNull();
    expect(cell.textContent).toBe('失败');
  });
});

/* ── 接线:真实的 run 终态 ────────────────────────────────── */

const gen = (path: string) => JSON.stringify({ status: 'succeeded', path });
const fail = () => JSON.stringify({ status: 'failed', error: { code: 'provider_missing' } });

function shellFor(runStatus: NonNullable<Parameters<typeof buildTurnBlocks>[0]['runStatus']>): ShellData {
  const events: PersistedAgentEvent[] = [
    { kind: 'tool_use', id: 'g1', name: 'Bash', input: { command: 'od media generate a && od media generate b' }, startedAt: 0 },
    { kind: 'tool_result', toolUseId: 'g1', content: [gen('a.png'), fail()].join('\n'), isError: false, completedAt: 1200 },
  ];
  const shell = buildTurnBlocks({ events, runStatus }).find((b): b is ShellData => b.kind === 'shell');
  if (!shell) throw new Error('没有生成执行记录壳');
  return shell;
}

const isTerminal = (s: 'running' | 'succeeded' | 'failed' | 'canceled') => s !== 'running';

describe('生图失败格 · 跟着真实轮次状态换脸', () => {
  it.each(['succeeded', 'failed', 'canceled'] as const)(
    '%s —— 轮次停了就给重试,并发的对手已经没有了',
    (runStatus) => {
      const onRetryImage = vi.fn();
      const { container } = render(
        <ExecutionShell
          shell={shellFor(runStatus)}
          onRetryImage={onRetryImage}
          runTerminal={isTerminal(runStatus)}
          deferCollapsedBodies={false}
        />,
      );
      const button = failedCell(container).querySelector('button');
      expect(button, `${runStatus} 之后应当放开重试`).not.toBeNull();
      fireEvent.click(button!);
      expect(onRetryImage).toHaveBeenCalledTimes(1);
    },
  );

  it('running —— 还在跑就只有状态说明', () => {
    const { container } = render(
      <ExecutionShell
        shell={shellFor('running')}
        onRetryImage={vi.fn()}
        runTerminal={false}
        deferCollapsedBodies={false}
      />,
    );
    const cell = failedCell(container);
    expect(cell.querySelector('button')).toBeNull();
    expect(cell.textContent).toBe('失败');
    expect(cell.querySelector('path')?.getAttribute('d')).toBe(ERROR_WARNING_LINE_D);
  });
});

/* ── 反向守卫:别的格子一格没动 ──────────────────────────── */

describe('生图行的其它格子不受影响', () => {
  it('出好的格子仍是可点的缩略图,还没出来的仍在动', () => {
    const { container } = render(
      <ImageRow row={liveRow()} running onRetry={vi.fn()} imageSrc={(p) => `/raw/${p}`} />,
    );
    const cells = [...container.querySelectorAll('[data-image-cell]')];
    expect(cells.map((c) => c.getAttribute('data-image-cell'))).toEqual(['done', 'failed', 'loading']);

    const done = cells[0] as HTMLElement;
    expect(done.tagName).toBe('BUTTON');
    expect(done.querySelector('img')?.getAttribute('src')).toBe('/raw/a.png');

    expect(cells[2]!.querySelector('canvas[data-testid="pixel-liquid"]'), '没出的格子还是液体').not.toBeNull();
    expect(failedCell(container).querySelector('canvas[data-testid="pixel-liquid"]'), '失败格不是 loading').toBeNull();
  });

  it('轮次停了之后,没回来的格子也不会因为这次改动重新转起来', () => {
    const { container } = render(<ImageRow row={liveRow()} running={false} onRetry={vi.fn()} />);
    const mark = container.querySelector<HTMLElement>('[class*="mark"]');
    expect(mark).not.toBeNull();
    expect(mark!.className, 'G2 刚修过的「取消后不再转圈」不能被这次改动带回去').not.toMatch(/run/);
  });

  it('全出完、一张没砸:仍然收成一行,压根没有失败格', () => {
    const { container } = render(
      <ImageRow
        row={liveRow({
          total: 2, done: 2, failed: 0, pending: false, thumbs: ['a.png', 'b.png'], elapsedMs: 2_600,
          cells: [
            { taskId: 'one', status: 'done', path: 'a.png' },
            { taskId: 'two', status: 'done', path: 'b.png' },
          ],
        })}
        onRetry={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-image-cell]')).toBeNull();
    expect(container.querySelector('[class*="strip"]')).not.toBeNull();
    expect(container.textContent).toContain('2.6s');
  });
});

// @vitest-environment jsdom
/**
 * 生图行也不许在轮次停了之后继续转圈。
 *
 * 和工具行是**同一个 bug**(OPEND-2419 的 #2):`ImageRow` 只看 `row.pending`
 * ——「还有格子没回来」—— 就画 `StatusMark status="running"`,而它没有「这一轮还活着吗」
 * 的概念。取消 / 失败之后 `pending` 仍然是 true(那些图确实没回来),于是那颗球
 * 永远转下去,读作「还在生成」。
 *
 * 判据和 `ToolRow` 统一:`pending` 只说「没回来」,画成哪一档由**轮次状态**定。
 * 绿勾是假成功、红叉是假错误,所以停下来那一档取中性灰
 * (和 `markFor` 的「中断时正在跑的:中性灰,红要留给真的错误」同一条规矩)。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import type { ExecutionShell as Shell, ImageRow, ShellItem } from '../../../src/runtime/chat/contract';

afterEach(cleanup);

function imageItem(over: Partial<ImageRow> = {}): ShellItem {
  const row: ImageRow = {
    kind: 'image',
    id: 'media-batch:b1',
    surface: 'image',
    total: 3,
    done: 1,
    failed: 0,
    thumbs: ['a.png'],
    cells: [
      { taskId: 'm1', status: 'done', path: 'a.png' },
      { taskId: 'm2', status: 'pending' },
      { taskId: 'm3', status: 'pending' },
    ],
    pending: true,
    elapsedMs: null,
    ...over,
  };
  return row;
}

function shellOf(items: ShellItem[], over: Partial<Shell> = {}): Shell {
  const shell: Shell = {
    kind: 'shell',
    id: 'shell-1',
    status: 'running',
    stopped: false,
    thinking: false,
    elapsedMs: null,
    quietMs: null,
    items,
    segments: [],
    ...over,
  };
  return shell;
}

const show = (shell: Shell): ReactElement => (
  <I18nProvider initial="zh-CN">
    <ExecutionShell shell={shell} deferCollapsedBodies={false} />
  </I18nProvider>
);

const markIn = (root: HTMLElement): HTMLElement | null =>
  root.querySelector<HTMLElement>('[class*="mark"]');

describe('生图行的进行中标记', () => {
  it('轮次还在跑:转着的球', () => {
    const { container } = render(show(shellOf([imageItem()])));
    const mark = markIn(container);
    expect(mark, '还在生成时应当有状态标记').not.toBeNull();
    expect(mark!.className).toMatch(/run/);
    // 正向对照:格子确实还在那儿,不是整行没渲染
    expect(container.querySelectorAll('[data-image-cell]').length).toBe(3);
  });

  it('取消掉的那一轮:不再转圈,退成中性灰', () => {
    const { container } = render(show(shellOf([imageItem()], { status: 'done', stopped: true })));
    const mark = markIn(container);
    expect(mark, '停下来之后仍要留着这一行').not.toBeNull();
    expect(mark!.className).not.toMatch(/run/);
    // 也不冒充成功 / 失败
    expect(mark!.className).not.toMatch(/ok/);
    expect(mark!.className).not.toMatch(/fail/);
  });

  it('反向对照:全出完了收成一行,本来就没有状态标记', () => {
    const { container } = render(show(shellOf(
      [imageItem({
        pending: false, done: 3, failed: 0, thumbs: ['a.png', 'b.png', 'c.png'],
        cells: [
          { taskId: 'm1', status: 'done', path: 'a.png' },
          { taskId: 'm2', status: 'done', path: 'b.png' },
          { taskId: 'm3', status: 'done', path: 'c.png' },
        ],
        elapsedMs: 4_000,
      })],
      { status: 'done' },
    )));
    expect(markIn(container)).toBeNull();
    expect(container.textContent).toContain('4.0s');
  });
});

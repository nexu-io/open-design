// @vitest-environment jsdom
/**
 * OPEND-2419 的渲染面:**进行中的调用长什么样。**
 *
 * 形态照稿子(`8015870…:docs/design/chat-panel/src/body-components.html`)。稿子里
 * 进行中的那条可折叠工具行是:
 *   `<summary><span class="mk is-run">…</span><span class="nm">构建产物,看能不能跑通</span>
 *    <span class="ms"></span><span class="chev">…</span></summary>`
 * 两处要照抄:
 *   ① 行首那格换成**转着的球**(`mk is-run`),不是工具类别图标;
 *   ② 耗时槽 `.ms` **在** —— 稿子里它是空的,留空是为了数值落地那一刻箭头不横跳。
 *
 * ⚠️ 「稿子刻意不给进行中的行挂跳动的秒数」这一条 **2026-09-02 被产品推翻了**
 * (有意偏离设计稿:真实数据里有单轮思考 28.5 分钟、单个 Bash 卡住 14.1 分钟的案例,
 * 诊断包 run `3fc3b3ae`;产品原话「我感觉**进行中的 toolrow 都得有计时**吧?」)。
 * 现在算得出耗时的进行中行会把值填进那个槽,守卫在
 * `tests/components/chat/live-row-elapsed.test.tsx`。
 * 下面这几条钉的是**另一半**:连起点都拿不到时(夹具里 `elapsedMs: null`),
 * 槽仍然留着、仍然是空的 —— 那条「不估算、不编数」的纪律没有变。
 *
 * 第三件事稿子没画,但不做就是新 bug:**轮次结束之后**那几条没回来的调用不能
 * 继续转圈。取一档中性灰(和 `markFor` 里「中断时正在跑的:中性灰,红要留给真的
 * 错误」同一条规矩),而不是绿勾(那是假成功)也不是红叉(那是假错误)。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import type { ExecutionShell as Shell, ShellItem, ToolRow } from '../../../src/runtime/chat/contract';

afterEach(cleanup);

/* 字段给全就不用强转:`ToolRow` 本来就是 `ShellItem` 联合的一支 */
function toolItem(over: Partial<ToolRow> = {}): ToolRow {
  return {
    kind: 'tool', id: 't1', tool: 'read', name: 'Read', title: '读取 a.ts', rawTitle: false,
    file: null, pattern: null, hits: null, delta: null, elapsedMs: null,
    pending: false, failed: false, failReason: null, command: null, terminal: null,
    ...over,
  };
}

function shellOf(items: ShellItem[], over: Partial<Shell> = {}): Shell {
  /* 不带 `as`,也没有 `seq`(契约里没有这个字段)—— fixture 的价值就是它长得像真的 */
  return {
    kind: 'shell', id: 'shell-1', status: 'running', items, segments: [],
    thinking: false, stopped: false, elapsedMs: null, quietMs: null, ...over,
  };
}

const show = (shell: Shell): ReactElement => (
  <I18nProvider initial="zh-CN">
    <ExecutionShell shell={shell} deferCollapsedBodies={false} />
  </I18nProvider>
);

/** 那一行的盒子:不可展开的是 `div.tool`,可展开的是 `details.fold` */
const rowOf = (root: HTMLElement): HTMLElement => {
  const el = root.querySelector<HTMLElement>('div[class*="tool"], details[class*="fold"]:not([class*="flat"])');
  if (!el) throw new Error('工具行没渲染出来');
  return el;
};
const markIn = (row: HTMLElement): HTMLElement | null =>
  row.querySelector<HTMLElement>('[class*="mark"]');

describe('进行中的工具行', () => {
  it('行首是转着的球,不是工具类别图标', () => {
    const { container } = render(show(shellOf([toolItem({ pending: true })])));
    const row = rowOf(container);
    expect(row.textContent).toContain('读取 a.ts');
    const mark = markIn(row);
    expect(mark, '进行中的行应当有状态标记').not.toBeNull();
    expect(mark!.className).toMatch(/run/);
  });

  it('耗时槽在,但是空的 —— 数值落地时箭头不横跳', () => {
    const { container } = render(show(shellOf([toolItem({ pending: true })])));
    const row = rowOf(container);
    const meta = row.querySelector('[class*="meta"]');
    expect(meta, '耗时槽应当预留出来').not.toBeNull();
    expect(meta!.textContent).toBe('');
  });

  it('可展开的命令行同样:球 + 空槽', () => {
    const { container } = render(show(shellOf([toolItem({
      pending: true, tool: 'exec', name: 'Bash', title: '构建产物,看能不能跑通',
      command: 'npm run build',
    })])));
    const row = rowOf(container);
    expect(row.tagName).toBe('DETAILS');
    expect(markIn(row)!.className).toMatch(/run/);
    const meta = row.querySelector('[data-testid="chat-foldable-elapsed"]');
    expect(meta, '折叠头的耗时槽应当预留出来').not.toBeNull();
    expect(meta!.textContent).toBe('');
  });

  it('轮次结束后没回来的那条不再转圈,退成中性灰', () => {
    const { container } = render(show(shellOf(
      [toolItem({ pending: true })],
      { status: 'done', stopped: true },
    )));
    const mark = markIn(rowOf(container));
    expect(mark, '停下来之后仍要留着这一行').not.toBeNull();
    // 不转圈
    expect(mark!.className).not.toMatch(/run/);
    // 也不冒充成功 / 失败
    expect(mark!.className).not.toMatch(/ok/);
    expect(mark!.className).not.toMatch(/fail/);
  });

  it('反向对照:跑完的行照旧 —— 工具图标 + 真的耗时,没有状态标记', () => {
    const { container } = render(show(shellOf(
      [toolItem({ pending: false, elapsedMs: 3_000 })],
      { status: 'done' },
    )));
    const row = rowOf(container);
    expect(row.textContent).toContain('3.0s');
    expect(markIn(row)).toBeNull();
    expect(row.querySelector('[class*="icon"]')).not.toBeNull();
  });
});

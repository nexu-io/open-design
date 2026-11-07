// @vitest-environment jsdom
/**
 * 【产品裁决 2026-11-07】执行记录**跑完不收起** —— 自动折叠整个拿掉。
 *
 * 这个文件原来钉的是 OPEND-2557「run 结束后自己收起」。新裁决推翻了那条:整条
 * 记录(Thoughts、计划、十几行工具调用)跑完之后继续摊着,用户才能回头核对这一轮
 * 到底做了什么。手动开合仍然由用户掌握(`userToggled` 闩)。
 *
 * `<details>` 的 `toggle` 事件不区分是谁掀开的 —— React 把受控的 `open` 写回 DOM
 * 时浏览器也会派发一次。下面显式派发同值回声,钉的是:那声回声**不算**用户操作,
 * 用户自己点的那一次才算。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import type { ExecutionShell as Shell, ShellItem } from '../../../src/runtime/chat/contract';

afterEach(cleanup);

const tool = (id: string): ShellItem => ({
  kind: 'tool', id, tool: 'read', title: `读取 ${id}`, name: 'Read', rawTitle: false,
  file: null, delta: null, hits: null, pattern: null, elapsedMs: 400,
  failed: false, failReason: null, command: null, terminal: null,
} as ShellItem);

function shellOf(over: Partial<Shell>): Shell {
  return {
    kind: 'shell', seq: 0, status: 'running', items: [tool('a.png'), tool('b.png')],
    segments: [], thinking: false, stopped: false, elapsedMs: 12_000, quietMs: null,
    ...over,
  } as Shell;
}

const show = (shell: Shell): ReactElement => (
  <I18nProvider initial="zh-CN"><ExecutionShell shell={shell} deferCollapsedBodies={false} /></I18nProvider>
);

const outer = (root: HTMLElement): HTMLDetailsElement => {
  const el = root.querySelector<HTMLDetailsElement>('details[class*="flat"]');
  if (!el) throw new Error('壳没渲染出来');
  return el;
};

/** 浏览器在 `open` 属性被写回时派发的那一次 —— 不是用户点的 */
const echoToggle = (el: HTMLDetailsElement): void => {
  fireEvent(el, new Event('toggle', { bubbles: false }));
};

describe('run 结束后执行记录仍然摊开', () => {
  it('跑着的时候是摊开的', () => {
    const { container } = render(show(shellOf({ status: 'running' })));
    expect(outer(container).open).toBe(true);
  });

  it('run 结束后不收起 —— 中间浏览器回声的那几次 toggle 不算用户点过', () => {
    const { container, rerender } = render(show(shellOf({ status: 'running' })));
    const el = outer(container);
    expect(el.open).toBe(true);
    // 壳一开着,浏览器就会为「open 属性被写上」派发一次 toggle。
    // 这一次必须**不算**用户操作,否则用户自己动过的记录会认错。
    echoToggle(el);

    rerender(show(shellOf({ status: 'done', elapsedMs: 132_000 })));
    expect(outer(container).open, 'run 结束了,记录不该自动收起来').toBe(true);
  });

  it('用户手动收起的,跑完不许替他打开', () => {
    const { container, rerender } = render(show(shellOf({ status: 'done' })));
    const el = outer(container);
    expect(el.open).toBe(true);

    // 真人点在标题行上:DOM 自己先翻面(jsdom 也实现了 summary 的激活行为),
    // 浏览器随后才派发 toggle —— 这一次的值和我们的状态**相反**,才是用户点的
    const summary = el.querySelector('summary');
    expect(summary).not.toBeNull();
    fireEvent.click(summary!);
    expect(el.open, 'summary 点击应当先把 details 收起').toBe(false);
    echoToggle(el);
    expect(outer(container).open).toBe(false);

    // 又来了一帧同样的终态,不能把用户收起的这一下抹掉
    rerender(show(shellOf({ status: 'done', elapsedMs: 133_000 })));
    expect(outer(container).open, '用户手动收起之后,后续帧不许再打开').toBe(false);
  });

  it('反向对照:中断的那一轮仍然摊开 —— 它是要人看清停在哪一步的', () => {
    const { container } = render(show(shellOf({ status: 'done', stopped: true })));
    expect(outer(container).open).toBe(true);
  });
});

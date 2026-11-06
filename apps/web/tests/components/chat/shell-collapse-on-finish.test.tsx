// @vitest-environment jsdom
/**
 * OPEND-2557(urgent):**这一轮跑完,执行记录要自己收起来。**
 *
 * 用户截图里那一行写着「Done 2m 12s」,箭头却朝上 —— 整条记录(Thoughts、四步计划、
 * 十几行工具调用)还全摊在侧栏里,把回答本身挤到屏外。D18 早就写了「跑着的时候摊开,
 * 结束就收起来」,`ExecutionShell` 也确实有那段 `lifecycleOpen` 的同步。
 *
 * 那它为什么没收?因为 **`<details>` 的 `toggle` 事件不区分是谁掀开的**。
 * React 把受控的 `open` 写回 DOM 时,浏览器照样派发一次 `toggle`;`Foldable` 把它原样
 * 转给 `onToggle`,而 `ExecutionShell` 拿到就当成「用户手动点过了」,从此
 * `userToggled` 永久为真 —— 后面 run 结束时那次同步被自己屏蔽掉了。
 *
 * 最早触发它的就是**壳自己开着的那一帧**:跑起来时 `open=true`,React 写属性,
 * 浏览器排一个 toggle 任务,于是壳还没跑完就已经「被用户点过」了。
 *
 * 判据只能是「这次 toggle 和我们自己的状态一不一致」:受控方写回去的那一次必然相等,
 * 用户点的那一次必然相反。
 *
 * jsdom 不一定按浏览器时序派发 `toggle`,所以下面**显式派发**一次 —— 钉的是
 * 「收到一次与自身状态一致的 toggle 之后,生命周期同步还活着」。
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

describe('OPEND-2557 跑完就收起', () => {
  it('跑着的时候是摊开的', () => {
    const { container } = render(show(shellOf({ status: 'running' })));
    expect(outer(container).open).toBe(true);
  });

  it('run 结束后自己收起 —— 中间浏览器回声的那几次 toggle 不算用户点过', () => {
    const { container, rerender } = render(show(shellOf({ status: 'running' })));
    const el = outer(container);
    expect(el.open).toBe(true);
    // 壳一开着,浏览器就会为「open 属性被写上」派发一次 toggle。
    // 这一次必须**不算**用户操作,否则后面的生命周期同步全被屏蔽。
    echoToggle(el);

    rerender(show(shellOf({ status: 'done', elapsedMs: 132_000 })));
    expect(outer(container).open).toBe(false);
  });

  it('反向对照:用户自己点开的,跑完不许再替他收走', () => {
    const { container, rerender } = render(show(shellOf({ status: 'done' })));
    const el = outer(container);
    expect(el.open).toBe(false);

    // 真人点在标题行上:DOM 自己先翻面(jsdom 也实现了 summary 的激活行为),
    // 浏览器随后才派发 toggle —— 这一次的值和我们的状态**相反**,才是用户点的
    const summary = el.querySelector('summary');
    expect(summary).not.toBeNull();
    fireEvent.click(summary!);
    expect(el.open, 'summary 点击应当先把 details 翻开').toBe(true);
    echoToggle(el);
    expect(outer(container).open).toBe(true);

    // 又来了一帧同样的终态,不能把用户掀开的这一下抹掉
    rerender(show(shellOf({ status: 'done', elapsedMs: 133_000 })));
    expect(outer(container).open).toBe(true);
  });

  it('反向对照:中断的那一轮仍然摊开 —— 它是要人看清停在哪一步的', () => {
    const { container } = render(show(shellOf({ status: 'done', stopped: true })));
    expect(outer(container).open).toBe(true);
  });
});

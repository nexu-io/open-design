// @vitest-environment jsdom
/**
 * **一条 todo 跑完了,它自己那只抽屉也要收起来。**
 *
 * 壳那一层早就有这条(OPEND-2557,`shell-collapse-on-finish.test.tsx`),抽屉这一层
 * 漏了:`TodoRow` 传的是 `defaultOpen={segment.status === 'in_progress'}`。
 * `defaultOpen` **只在挂载那一帧被看一眼**,而这一行的 key 是
 * `todo-${segment.content}-${index}` —— 状态从 `in_progress` 翻成 `completed` 时
 * 内容和位置一个字都没变,于是**同一个实例、同一份内部折叠态**,那只抽屉
 * 跑完还摊着,把后面几步挤到屏外。
 *
 * 修法是接 `Foldable` 的 `lifecycleOpen`(W24 交付,`foldable-lifecycle-follow.test.tsx`
 * 钉着它自己那一层):跟着外面那件事的相位走,**但用户自己动过之后就不再跟** ——
 * 手动展开的跑完不替他收,手动收起的后续不替他开。
 *
 * ⚠️ jsdom 不保证按浏览器时序派发 `toggle`,所以下面和
 * `shell-collapse-on-finish.test.tsx` 一样**显式派发一次同值回声**。
 * 那声回声正是这个 bug 家族的真因:把「我们自己把 open 写回 DOM」引发的 toggle
 * 当成「用户点过」,自动跟随会在第一帧就被永久禁用。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import type {
  ExecutionShell as Shell,
  ShellItem,
  TodoStatus,
} from '../../../src/runtime/chat/contract';

afterEach(cleanup);

const tool = (id: string): ShellItem => ({
  kind: 'tool', id, tool: 'read', title: `读取 ${id}`, name: 'Read', rawTitle: false,
  file: null, delta: null, hits: null, pattern: null, elapsedMs: 400,
  failed: false, failReason: null, command: null, terminal: null,
} as ShellItem);

/**
 * 同一条 todo 的两个相位。**内容和位置一个字都不变** —— 这是这条测试的前提:
 * key 不变 = 同一个 React 实例,`defaultOpen` 因此救不了。
 */
const shellOf = (status: TodoStatus): Shell => ({
  kind: 'shell', id: 'shell-1', status: status === 'in_progress' ? 'running' : 'done',
  thinking: false, stopped: false, elapsedMs: 12_000, quietMs: null,
  segments: [],
  items: [{
    kind: 'todo',
    segment: {
      content: '复刻商品列表页',
      status,
      recalled: false,
      abandoned: false,
      implicit: false,
      items: [tool('a.png'), tool('b.png')],
      elapsedMs: 18_200,
    },
  } as ShellItem],
});

const show = (shell: Shell): ReactElement => (
  <I18nProvider initial="zh-CN"><ExecutionShell shell={shell} deferCollapsedBodies={false} /></I18nProvider>
);

/** 抽屉那一层:壳是 `details.flat`,todo 抽屉是它里面那只 */
const drawer = (root: HTMLElement): HTMLDetailsElement => {
  const el = root.querySelector<HTMLDetailsElement>('details[class*="flat"] details[class*="stepRow"]');
  if (!el) throw new Error('todo 抽屉没渲染出来');
  return el;
};

/** 浏览器在 `open` 属性被写回时派发的那一次 —— 不是用户点的 */
const echoToggle = (el: HTMLDetailsElement): void => {
  fireEvent(el, new Event('toggle', { bubbles: false }));
};

describe('todo 抽屉跟着这一步的相位收放', () => {
  it('这一步在跑:抽屉是摊开的', () => {
    const { container } = render(show(shellOf('in_progress')));
    expect(drawer(container).open).toBe(true);
  });

  it('这一步做完了:key 一个字没变,抽屉也要自己收起来', () => {
    const { container, rerender } = render(show(shellOf('in_progress')));
    const el = drawer(container);
    expect(el.open).toBe(true);
    // 摊开那一帧浏览器会为「open 属性被写上」派发一次 toggle。
    // 这一次必须**不算**用户操作,否则后面的相位同步全被屏蔽。
    echoToggle(el);

    rerender(show(shellOf('completed')));
    expect(drawer(container).open, '跑完还摊着就是这个 bug').toBe(false);
  });

  it('反向对照:用户自己掀开的,这一步跑完不许替他收走', () => {
    const { container, rerender } = render(show(shellOf('completed')));
    const el = drawer(container);
    expect(el.open).toBe(false);

    const summary = el.querySelector('summary');
    expect(summary).not.toBeNull();
    fireEvent.click(summary!);
    expect(el.open, 'summary 点击应当先把 details 翻开').toBe(true);
    echoToggle(el);

    // 又来一帧同样的终态,不能把用户掀开的这一下抹掉
    rerender(show(shellOf('completed')));
    expect(drawer(container).open).toBe(true);
  });
});

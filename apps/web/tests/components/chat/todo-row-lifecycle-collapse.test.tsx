// @vitest-environment jsdom
/**
 * 【产品裁决 2026-11-07】**todo 抽屉跑完不自动收起** —— 它装着这一步真正跑过的
 * 命令、读过的文件和推理。
 *
 * 这个文件原来钉的是「一条 todo 跑完,抽屉自己收起来」。新裁决推翻了那条:记录
 * 本来就是为了事后读的,跑完就收等于把证据藏起来。现在 `TodoRow` 恒传
 * `lifecycleOpen`,抽屉始终摊开;用户手动收起仍然算数。
 *
 * 这一行的 key 是 `todo-${segment.content}-${index}`,状态从 `in_progress` 翻成
 * `completed` 时内容和位置一个字都没变 —— 所以「保持摊开」不能只靠挂载时的
 * `defaultOpen`,必须走 `Foldable` 的 `lifecycleOpen` 同步。
 *
 * ⚠️ jsdom 不保证按浏览器时序派发 `toggle`,所以下面显式派发一次同值回声,
 * 钉住「回声不算用户点过」。
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

describe('todo 抽屉的摊开态', () => {
  it('这一步在跑:抽屉是摊开的', () => {
    const { container } = render(show(shellOf('in_progress')));
    expect(drawer(container).open).toBe(true);
  });

  it('这一步做完了:key 一个字没变,抽屉仍然摊着', () => {
    const { container, rerender } = render(show(shellOf('in_progress')));
    const el = drawer(container);
    expect(el.open).toBe(true);
    // 摊开那一帧浏览器会为「open 属性被写上」派发一次 toggle。
    // 这一次必须**不算**用户操作,否则用户手动收起的判断会认错。
    echoToggle(el);

    rerender(show(shellOf('completed')));
    expect(drawer(container).open, '跑完之后这一步的现场仍然要看得见').toBe(true);
  });

  it('用户手动收起的,后续重渲染不许替他打开', () => {
    const { container, rerender } = render(show(shellOf('completed')));
    const el = drawer(container);
    expect(el.open).toBe(true);

    const summary = el.querySelector('summary');
    expect(summary).not.toBeNull();
    fireEvent.click(summary!);
    expect(el.open, 'summary 点击应当先把 details 收起').toBe(false);
    echoToggle(el);

    // 又来了一帧同样的终态,不能把用户收起的这一下抹掉
    rerender(show(shellOf('completed')));
    expect(drawer(container).open).toBe(false);
  });
});

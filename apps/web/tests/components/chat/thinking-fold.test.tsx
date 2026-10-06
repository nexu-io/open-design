// @vitest-environment jsdom
/**
 * N2:**跑完的 thinking 收进一个可展开的折叠行**(用户裁决,2026-08-27)。
 *
 * 用户原话:「thinking 也要包裹在进行中的下拉卡片里,其次 thinking 完成后就变成
 * 普通工具调用的状态,可以下拉展开看思考细节」。
 *
 * ⚠️ 这条**覆盖设计稿**。设计稿组件 3 状态 3 写的是「跑完 · 收进 7·任务进度里,
 * 是几段纯文字,**不再自带折叠**」。冲突已当面对齐,用户选 B。
 * 详见 `specs/current/chat-panel-feedback.md` §F-11。
 *
 * 修的是哪个画面:`shell.thinking` 一旦置 false(第一段正文或第一个工具落下),
 * body 就从 `.stream`(限高 96px)换成 `.stack`(高度 auto),
 * 于是刚才那十几段推理**原地全部展开** —— 用户说的「怎么一结束全部释放出来了」。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import type { ExecutionShell as Shell, ShellItem } from '../../../src/runtime/chat/contract';

afterEach(cleanup);

function shellOf(items: ShellItem[], over: Partial<Shell> = {}): Shell {
  return {
    kind: 'shell', seq: 0, status: 'succeeded', items,
    thinking: false, stopped: false, elapsedMs: null, quietMs: null,
    ...over,
  } as Shell;
}

const show = (shell: Shell): ReactElement => (
  <I18nProvider initial="zh-CN"><ExecutionShell shell={shell} /></I18nProvider>
);

const think = (text: string): ShellItem => ({ kind: 'text', text, thinking: true });
const say = (text: string): ShellItem => ({ kind: 'text', text });
const tool = (id: string): ShellItem => ({
  kind: 'tool', id, tool: 'read', title: `读取 ${id}`, elapsedMs: 400, failed: false,
} as ShellItem);

/** 只摊开**最外层那张壳**(跑完是收起的),里面的折叠保持它自己的默认态 */
const openShell = (root: HTMLElement): void => {
  for (const d of Array.from(root.querySelectorAll('details'))) {
    if (d.className.includes('flat') && !d.open) {
      fireEvent.click(d.querySelector('summary')!);
    }
  }
};

describe('N2 跑完的 thinking 收进折叠行', () => {
  it('两段连续的 thinking 收成【一个】折叠行,标题是「思考过程」,默认不展开正文', () => {
    const { container } = render(show(shellOf([
      think('先判断这一屏属于哪种页面类型。'),
      think('设置页要和它共用同一套间距。'),
      tool('a.png'),
    ])));
    openShell(container);           // 壳自己跑完是收起的,先摊开壳看里面
    // 折叠头出现,且只有一个
    expect(screen.getAllByText('思考过程')).toHaveLength(1);
    // 推理正文默认藏着 —— 这正是「不再一结束全释放」
    const fold = screen.getByText('思考过程').closest('details');
    expect(fold).not.toBeNull();
    expect(fold?.open).toBe(false);
  });

  it('展开之后读得到每一段推理', () => {
    const { container } = render(show(shellOf([
      think('先判断这一屏属于哪种页面类型。'),
      think('设置页要和它共用同一套间距。'),
    ])));
    openShell(container);
    const fold = screen.getByText('思考过程').closest('details');
    fireEvent.click(fold!.querySelector('summary')!);   // 用户点开这一格
    // 不只是「读得到」——必须读在折叠里,否则等于没折叠(否定断言会空转)
    expect(fold?.contains(screen.getByText('先判断这一屏属于哪种页面类型。'))).toBe(true);
    expect(fold?.contains(screen.getByText('设置页要和它共用同一套间距。'))).toBe(true);
  });

  it('还在思考时**不折叠** —— 那一段归 96px 的流式窗管(设计稿状态 1)', () => {
    const { container } = render(show(shellOf(
      [think('先判断这一屏属于哪种页面类型。')],
      { status: 'running', thinking: true },
    )));
    openShell(container);
    expect(screen.queryByText('思考过程')).toBeNull();
    /*
     * 结构断言。只写 `queryByText('思考过程')` 为 null 的话,这条在没实现折叠时
     * 天然成立 —— 空转,所以必须配一条说明推理**到底在哪**的正向断言。
     *
     * ⚠️ 这里原来断言的是「推理段直接挂在壳的 body 上」。**那描述的是旧架构**:
     * 当时思考是**壳的一种形态**(整只壳 body 换成 96px 的流式窗)。用户
     * 2026-08-27 把它推翻了 —— 「绝不能 thinking 的时候直接把进行中或原本的
     * 东西给替换了」—— 思考改成**壳里的一个条目**,流式窗下沉到那一格自己身上
     * (§F-15 / §F-18)。所以推理现在的正确位置是 `.thoughts` 那一格里面,
     * 不是壳 body 的直接子代。
     *
     * 另外不能用 `getByText` 找这一段:还在跑的那一段会被逐字浮现
     * (`useCharReveal`,§F-16)按字拆成一串 `<span>`,整段匹配从此找不到它。
     * 改成在段落自己的 `textContent` 上找,拆不拆都成立。
     */
    const p = [...container.querySelectorAll('p, div')]
      .find((n) => (n.textContent ?? '') === '先判断这一屏属于哪种页面类型。');
    expect(p).toBeTruthy();
    // 推理住在思考那一格里
    const row = p?.closest('details');
    expect(row?.className).toMatch(/thoughts/);
    // 而且那一格是**摊开**的 —— 还在想的时候不该要用户点开才看得见
    expect(row?.open).toBe(true);
    // 反向对照:这一格仍然在壳里,没有跑到壳外面去
    expect(row?.closest('details')?.parentElement ?? row?.parentElement)
      .toBeTruthy();
  });

  it('普通过程叙述(非 thinking)不进折叠,照旧平铺', () => {
    const { container } = render(show(shellOf([say('好,先把列表页搭起来。'), tool('a.png')])));
    openShell(container);
    expect(screen.queryByText('思考过程')).toBeNull();
    /*
     * 同上:叙述必须仍然直接挂在壳 body 上,别被顺手卷进折叠。
     *
     * 叙述改走 markdown 之后(2026-09-03),`getByText` 拿到的是块树里的那只
     * `<p class="md-p">`,它的父层是 `SayText` 自己的 `.think` 容器 —— 化开要挂在
     * 一只**身份稳定**的元素上,块树会换元素(见 `say-text-markdown.test.tsx`)。
     * 所以这里要先上溯到 `.think` 那一层再看它挂在谁身上,判据本身没变。
     */
    const p = screen.getByText('好,先把列表页搭起来。');
    const block = p.closest('[class*="think"]');
    expect(block?.parentElement?.className).toMatch(/body/);
  });

  it('被工具行隔开的两段 thinking 收成【两个】折叠行,不跨工具合并', () => {
    const { container } = render(show(shellOf([
      think('第一段推理。'), tool('a.png'), think('第二段推理。'),
    ])));
    openShell(container);
    expect(screen.getAllByText('思考过程')).toHaveLength(2);
  });

  it('OPEND-2406:运行中的历史/中间 thought 收起,只有当前 live thought 展开', () => {
    const { container } = render(show(shellOf([
      think('开头已经完成的推理。'),
      tool('first.png'),
      think('中间已经完成的推理。'),
      tool('second.png'),
      think('当前仍在写的推理。'),
    ], { status: 'running', thinking: true })));
    openShell(container);

    const thoughts = Array.from(
      container.querySelectorAll<HTMLDetailsElement>('details[class*="thoughts"]'),
    );
    expect(thoughts).toHaveLength(3);
    expect(thoughts.map((row) => row.open)).toEqual([false, false, true]);
    expect(thoughts.slice(0, 2).map((row) => row.querySelector('summary')?.textContent))
      .toEqual(['思考过程', '思考过程']);
    expect(thoughts[2]?.querySelector('summary')?.textContent).toContain('思考中');
  });
});

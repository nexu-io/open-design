// @vitest-environment jsdom
/**
 * **想完了的那一格思考,右边挂自己的耗时;正在想的那一格不挂。**
 *
 * 用户 2026-08-27 真机指认:「thought 是不是本身右边也要显示一个耗时?
 * 为啥 todo 外的一个耗时都没显示?」「todo 内的倒是每个工具调用都有耗时,
 * thought 也要有耗时」。
 *
 * `ThoughtsRow` 原来的注释写着「不挂耗时:推理的时长在壳头的总耗时里」——
 * 那句话的**前提是假的**:壳头的跨度只由带时刻的事件撑开,第一个工具之前的推理
 * 根本不在里面(见 `runtime/chat/shell-elapsed-includes-thinking.test.ts`)。
 *
 * ⚠️ **「正在想不挂」那一半 2026-09-02 被产品推翻了**(有意偏离设计稿)。
 * 稿子的理由是「这一行只活到第一个字落地为止」,而那个前提对推理模型不成立:
 * 真实数据里有单轮思考 28.5 分钟的案例(诊断包 run `3fc3b3ae`),用户的实感是
 * 「跑了 40 分钟什么都没出来」。产品原话:「为啥思考中不会有计时?我感觉
 * **进行中的 toolrow 都得有计时**吧?」完整因果与三类行的守卫在
 * `tests/components/chat/live-row-elapsed.test.tsx`;这个文件只留「想完了那一格」
 * 这一半,以及「拿不到就不编数」那条纪律。
 *
 * ⚠️ 两个用例的**数据完全一样**,只有「在不在想」这一位不同 ——
 * 否则「显示了」这条断言可以靠挂一个常量蒙混过去。
 *
 * ⚠️ **2026-09-04 起夹具都往前垫了 `LEAD`**(理由在 `LEAD` 自己的注释):产品把
 * 「整轮头一格推理」这一个位置的耗时收了回去,而这个文件测的是「推理那一格该不该有
 * 自己的耗时」,不是那一个位置。断言一条没改,只把被测的那一格挪出头一格。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import type { ExecutionShell as Shell, ShellItem } from '../../../src/runtime/chat/contract';

afterEach(cleanup);

/** 一段跑完的推理 —— 带着 `build-turn-blocks` 算出来的耗时 */
const thought = (text: string, elapsedMs: number): ShellItem => ({
  kind: 'text', text, thinking: true, elapsedMs,
});

const readRow = (id: string, elapsedMs: number): ShellItem => ({
  kind: 'tool', id, tool: 'read', name: 'Read', title: 'Read', rawTitle: false,
  file: { path: 'index.html', label: 'index.html' },
  pattern: null, hits: null, delta: null, elapsedMs,
  failed: false, failReason: null, command: null, terminal: null,
} as ShellItem);

/**
 * 每个夹具前面都垫这两条 —— **让被测的那一格不是整轮头一格**。
 *
 * 产品 2026-09-04 把「整轮头一格推理」这一个位置的耗时收了回去(原话:「这里首次
 * thinking 我看是有一个计时的, 能不能不要计时, 不然跟上面一行的进行中的计时有点重复」)。
 * 头一格填的空白起点就是轮次开头,和壳头那个数同起同终,两行贴着写同一个数。
 * 这个文件测的是**推理那一格该不该有自己的耗时**这件事,不是「头一格」那一个位置,
 * 所以夹具往前垫一格推理 + 一次调用,把被测的那一格挪到第二格 ——
 * 它填的是两次调用之间的空白,是新信息,照旧要报。
 * (中间那次调用是必须的:`groupThinking` 的硬判据是「连续的推理收成一格」,
 * 不隔开的话两段会并进同一格,读出来是它们的和。)
 *
 * 头一格那半边的守卫在 `first-thoughts-no-elapsed.test.tsx`。
 */
const LEAD: ShellItem[] = [thought('开场那一段推理。', 62_000), readRow('t0', 300)];

function show(over: Partial<Shell>): HTMLElement {
  const shell = {
    kind: 'shell', id: 'shell-1', status: 'done', items: [], segments: [],
    thinking: false, stopped: false, elapsedMs: 371_631, quietMs: null,
    ...over,
  } as unknown as Shell;
  return render(
    <I18nProvider initial="zh-CN">
      <ExecutionShell shell={shell} deferCollapsedBodies={false} />
    </I18nProvider>,
  ).container;
}

describe('思考那一格的耗时(设计稿组件 3 · 用户 2026-08-27 裁决)', () => {
  it('想完了:右边写着这一格自己的耗时', () => {
    const root = show({ items: [...LEAD, thought('先想清楚要动哪几个文件。', 154_000)] });
    expect(root.textContent).toContain('2m 34s');
  });

  it('**正在想**:同一份数据,同样写出来(产品 2026-09-02 推翻了稿子那一条)', () => {
    const root = show({
      status: 'running',
      thinking: true,
      items: [...LEAD, thought('先想清楚要动哪几个文件。', 154_000)],
    });
    expect(root.textContent).toContain('思考中');
    expect(root.textContent).toContain('2m 34s');
  });

  it('同一摞里两格并存:两格**各报各的**,不是共用一个数', () => {
    const root = show({
      status: 'running',
      thinking: true,
      items: [
        ...LEAD,
        thought('第一段想完了。', 5_400),
        readRow('t1', 300),
        thought('第二段还在想。', 8_900),
      ],
    });
    expect(root.textContent).toContain('5.4s');
    expect(root.textContent).toContain('8.9s');
  });

  it('拿不到耗时的那一格什么都不写 —— 不用 `0.0s` 顶上', () => {
    const root = show({
      items: [...LEAD, { kind: 'text', text: '这一段算不出耗时。', thinking: true } as ShellItem],
    });
    expect(root.textContent).toContain('这一段算不出耗时。');
    expect(root.textContent).not.toContain('0.0s');
  });
});

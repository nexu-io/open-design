// @vitest-environment jsdom
/**
 * 执行记录(`chat-panel-next.md`)在真实消息里的行为。
 *
 * 这一层**不重复纯函数那一层**(落块规则在 `tests/runtime/chat/build-turn-blocks.test.ts`),
 * 只问两件事:画出来了没有、画对了没有。
 *
 * 用例编码的是行为不是样式,所以断言挂在**看得见的字**和 `<details>` 的开合上,
 * 不挂 CSS Module 的类名 —— 那些名字在 vitest 下带哈希。
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { AgentEvent, ChatMessage } from '../../src/types';

function messageWithEvents(events: AgentEvent[]): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    events,
    startedAt: 1_000,
    endedAt: 3_000,
    runStatus: 'succeeded',
  };
}

/** 执行记录壳:`.assistant-flow` 里的第一个顶层 `<details>`(ExecutionShell → Foldable) */
function record(container: HTMLElement): HTMLDetailsElement {
  const el = maybeRecord(container);
  if (!el) throw new Error('执行记录壳没有渲染出来');
  return el;
}

/** 同上,但**允许没有** —— B47 之后「跑完了却空着」的壳整个不渲染 */
const maybeRecord = (container: HTMLElement): HTMLDetailsElement | null =>
  container.querySelector<HTMLDetailsElement>('.assistant-flow > details');

/** 壳头那行字:状态词(+ 耗时) */
const recordHead = (container: HTMLElement): string =>
  record(container).querySelector('summary')?.textContent ?? '';

/** 壳里的内容区。壳里没东西可展开时 `Foldable` 连这个 div 都不建 */
const recordBody = (container: HTMLElement): HTMLElement | null =>
  record(container).querySelector<HTMLElement>(':scope > div');

function activateExecutionRecord(container: HTMLElement): void {
  const shell = record(container);
  const summary = shell.querySelector<HTMLElement>(':scope > summary');
  if (!summary) throw new Error('执行记录壳标题没有渲染出来');
  fireEvent.click(summary);
}

const bodyText = (container: HTMLElement): string => recordBody(container)?.textContent ?? '';

/** 壳里的行数:工具行、清单行、过程叙述各算一行 */
const rowCount = (container: HTMLElement): number => recordBody(container)?.children.length ?? 0;

describe('AssistantMessage 执行记录', () => {
  afterEach(() => cleanup());

  it('调用发出去就落行;轮次跑完了,没回来的那一行留着但不再转圈(D3 作废 2026-09-02 / OPEND-2419)', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          {
            kind: 'tool_use',
            id: 'tool-1',
            name: 'Bash',
            input: { command: 'pnpm guard', description: 'Run guard' },
          },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    /*
     * ⚠️ 这一条原来叫「没有配对结果的调用不落行,而空壳跑完就整个不渲染(D3 + B47)」,
     * 断言的是 `maybeRecord(container)` 为 null。它把**两条**规则叠在一起,而其中
     * 上面那条已经作废 —— 分寸在这里,别把另一条一起丢了:
     *
     *  · D3「界面上没有『执行中』这一档,调用没回来就不落行」**已作废**
     *    (产品 2026-09-02,OPEND-2419;规格 `chat-panel-next.md:419` 已划掉)。
     *    产品原话:「调用时不管成功没,都要立刻渲染,所有状态啥的东西都要尽快反应在
     *    界面上,不然用户会吐槽卡住了啥的」。实测代价:一次卡住 14.1 分钟的下载在
     *    界面上完全不存在,用户看到的是「转了 40 分钟什么都没出来」。
     *  · B47「跑完之后空着的壳整个不渲染」**没有被推翻,仍然成立**。变的只是这一条
     *    fixture 再也造不出空壳了:那次调用现在会落行,壳里有东西,B47 根本不触发。
     *    B47 自己的守卫在 `tests/runtime/chat/empty-shell.test.ts`(7 条,含 U4 的
     *    取消档),不依赖这一条 —— 所以改这里不会把 B47 弄丢。
     *
     * 于是这一条改钉**翻转后的规则**,外加它带来的那条新约束:轮次已经结束的
     * pending 行**不许再画成转圈的球**。判据逐字写在
     * `runtime/chat/contract.ts` 的 `ToolRow.pending` 上:「`pending` 只说『没回来』,
     * 不说『还在跑』…… 那是『永远停在 running』这个新 bug」。
     */
    expect(maybeRecord(container)).not.toBeNull();
    expect(recordHead(container)).toContain('Done');

    activateExecutionRecord(container);
    expect(rowCount(container)).toBe(1);
    expect(bodyText(container)).toContain('Run guard');

    /*
     * 行首那一格:轮次停了要退成中性灰(`Not started`),不能还是转着的球(`Working`)。
     * 两句一正一反配着写 —— 只写反向那句的话,「标记整个没渲染」也会绿,等于没测。
     */
    const body = recordBody(container)!;
    expect(body.querySelector('[aria-label="Not started"]'), '没回来的行要有中性灰记号').not.toBeNull();
    expect(body.querySelector('[aria-label="Working"]'), '轮次停了还转圈是新 bug').toBeNull();
  });

  it('没有 runStatus 的历史消息按「已完成」处理:壳头是「已完成」,没回来的行不转圈', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents([
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'pnpm guard', description: 'Execute guard' },
            },
          ]),
          runStatus: undefined,
        }}
        streaming={false}
        projectId="project-1"
      />,
    );

    /*
     * 这一条问的一直是同一件事:**缺 `runStatus` 的历史消息被当成跑完了没有**。
     * 变的只是拿什么当证据。
     *
     * 原来的证据是「壳整个没了」—— 那是借 B47 反推的:空壳只在还在跑的时候留,
     * 壳没了就说明这一轮被判成了终态。D3 作废(2026-09-02,OPEND-2419)之后
     * 那次调用会落行,壳里有东西,B47 不再触发,这条反推的路断了。
     *
     * 换成**直接的**证据:壳头写的是「已完成」(还在跑会是「进行中」),
     * 而且行首那一格是中性灰不是球。比原来那条更贴题 —— 原来是靠一条别的规则的
     * 副作用间接说话。B47 本身仍然成立,守卫在 `tests/runtime/chat/empty-shell.test.ts`。
     */
    expect(maybeRecord(container)).not.toBeNull();
    expect(recordHead(container)).toContain('Done');
    expect(recordHead(container)).not.toContain('Working');

    activateExecutionRecord(container);
    const body = recordBody(container)!;
    expect(body.querySelector('[aria-label="Not started"]'), '没回来的行要有中性灰记号').not.toBeNull();
    expect(body.querySelector('[aria-label="Working"]'), '轮次停了还转圈是新 bug').toBeNull();
  });

  it('没有 runStatus 的历史消息里有调用报错 → 整轮算「运行失败」', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents([
            { kind: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: '/repo/missing.ts' } },
            { kind: 'tool_result', toolUseId: 'tool-1', content: 'File not found', isError: true },
          ]),
          runStatus: undefined,
        }}
        streaming={false}
        projectId="project-1"
      />,
    );

    expect(recordHead(container)).toContain('Run failed');
  });

  it('失败之后重试成功:整轮仍是「已完成」,失败那一行还留在记录里', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          { kind: 'tool_use', id: 'failed-read', name: 'Read', input: { file_path: '/repo/missing.ts' } },
          { kind: 'tool_result', toolUseId: 'failed-read', content: 'File not found', isError: true },
          { kind: 'tool_use', id: 'successful-read', name: 'Read', input: { file_path: '/repo/source.ts' } },
          { kind: 'tool_result', toolUseId: 'successful-read', content: 'source', isError: false },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    expect(recordHead(container)).toContain('Done');
    activateExecutionRecord(container);
    expect(bodyText(container)).toContain('missing.ts');
    expect(bodyText(container)).toContain('source.ts');

    /*
     * ⚠️ 这一条的红**和 D3 作废无关** —— 它的两次调用都有配对结果,一条在途行都没有。
     * 红在另一笔改动上:`02605b1f01`「surface why a tool failed」把 `failReason`
     * 从写死的 `null` 接通了,于是失败行从「失败写法一」(名字 + 一颗「Failed」按钮)
     * 走进了稿子的**「失败写法二」**(`ToolRow.tsx:192`:原因跟在名字后面,
     * 不再重复那个词)。屏幕上现在是「Read missing.ts · File not found」。
     *
     * 两种写法都是稿子自己画的,由 `failReason` 有没有决定走哪支(S1,
     * `chat-panel-next.md:889`,仍挂在 wangchenglong 名下待确认)。所以这里不改回
     * 去要那个词,改成要**这一行确实被标成失败了**的两件证据:
     *  · 原因原样出现(写法二的正题:报错原文以前一个字都到不了屏幕上);
     *  · 那一行仍然带着失败态的类名(`styles.fail`,红点 / 静音灰全挂在它上面)——
     *    少了这一句,万一哪天写法二把失败态一起丢了,只看文字是发现不了的。
     */
    expect(bodyText(container)).toContain('File not found');
    const failRow = [...recordBody(container)!.children]
      .find((n) => (n.textContent ?? '').includes('missing.ts'));
    expect(failRow, '失败那一行还在记录里').toBeTruthy();
    expect(failRow!.className, '那一行要挂着失败态').toMatch(/fail/i);
    // 反向守卫:成功那一行没有被一起染成失败
    const okRow = [...recordBody(container)!.children]
      .find((n) => (n.textContent ?? '').includes('source.ts'));
    expect(okRow!.className).not.toMatch(/fail/i);
  });

  it('一轮里多个调用都没有结果:每个各占一行,不合并也不丢(D3 作废 2026-09-02)', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          {
            kind: 'tool_use',
            id: 'tool-1',
            name: 'Bash',
            input: { command: 'pnpm guard', description: 'Execute guard' },
          },
          {
            kind: 'tool_use',
            id: 'tool-2',
            name: 'Bash',
            input: { command: 'pnpm typecheck', description: 'Execute typecheck' },
          },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    /*
     * 上一条的多调用版。D3 作废之后(2026-09-02,OPEND-2419)两次调用各落一行,
     * 所以这里钉的是**数量**:两次调用 = 两行,不会被折成一行,也不会因为
     * 「都没有结果」而一起消失。
     *
     * ⚠️ 别把这一条读成 B47 的守卫 —— 它现在造不出空壳了。B47(空壳不留)
     * 仍然成立,守卫在 `tests/runtime/chat/empty-shell.test.ts`。
     */
    expect(maybeRecord(container)).not.toBeNull();
    activateExecutionRecord(container);
    expect(rowCount(container)).toBe(2);
    expect(bodyText(container)).toContain('Execute guard');
    expect(bodyText(container)).toContain('Execute typecheck');
    // 反向守卫:两行是两次调用,不是同一次画了两遍(去重仍然生效)
    expect(container.textContent).not.toContain('×2');
  });

  it('同一个 tool_use id 出现两次不折成 ×2', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          { kind: 'tool_use', id: 'tool-1', name: 'Write', input: { file_path: '/repo/index.html', content: '<main />' } },
          { kind: 'tool_use', id: 'tool-1', name: 'Write', input: { file_path: '/repo/index.html', content: '<main />' } },
          { kind: 'tool_result', toolUseId: 'tool-1', content: 'ok', isError: false },
          // 产物卡是声明出来的;这条测的是「同一份文件只出一张卡」,所以先把它声明出来
          { kind: 'artifact_focus', show: ['index.html'] },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    activateExecutionRecord(container);
    expect(rowCount(container)).toBe(1);
    // HTML 产物走卡片形态(组件 14),产物只应出现一次
    expect(container.querySelectorAll('[data-artifact-card]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="file-ops-toggle"]')).toBeNull();
    expect(container.textContent).not.toContain('×2');
  });

  it('只读文件留在执行记录里,不算这一轮的产出', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          { kind: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: '/repo/source.ts' } },
          { kind: 'tool_result', toolUseId: 'tool-1', content: 'source', isError: false },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    activateExecutionRecord(container);
    expect(bodyText(container)).toContain('source.ts');
    expect(screen.queryByTestId('file-ops-summary')).toBeNull();
  });

  it('读 / 写 / 跑三种调用收进同一张执行记录', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          { kind: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: '/repo/source.ts' } },
          { kind: 'tool_result', toolUseId: 'tool-1', content: 'source', isError: false },
          { kind: 'tool_use', id: 'tool-2', name: 'Write', input: { file_path: '/repo/result.ts', content: 'export {}' } },
          { kind: 'tool_result', toolUseId: 'tool-2', content: 'ok', isError: false },
          { kind: 'tool_use', id: 'tool-3', name: 'Bash', input: { command: 'pnpm typecheck' } },
          { kind: 'tool_result', toolUseId: 'tool-3', content: 'ok', isError: false },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    activateExecutionRecord(container);
    expect(container.querySelectorAll('[data-testid="assistant-flow"] > details')).toHaveLength(1);
    expect(rowCount(container)).toBe(3);
    const body = bodyText(container);
    expect(body).toContain('source.ts');
    expect(body).toContain('result.ts');
    expect(body).toContain('pnpm typecheck');
  });

  it('失败的一轮:壳头是「运行失败」', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents([
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'pnpm guard', description: 'Execute guard' },
            },
          ]),
          runStatus: 'failed',
        }}
        streaming={false}
        projectId="project-1"
      />,
    );

    expect(recordHead(container)).toContain('Run failed');
    expect(recordHead(container)).not.toContain('Done');

    /*
     * ⚠️ 这里原来是 `expect(recordBody(container)).toBeNull()`,注释写着
     * 「D3:那次调用没有配对结果,所以不落行」。**两处都不对,而且它一直是绿的** ——
     * CI 照不出来,是我在做在途行改造时用探针撞出来的:
     *
     *  · D3 已作废(2026-09-02,OPEND-2419),没有结果的调用现在照样落行;
     *  · 更要紧的是,那句断言**从来就不是靠 D3 绿的**。失败那档壳头是收起的
     *    (`ExecutionShell` 的 `lifecycleOpen = running || stopped`),而收起的壳
     *    走 `deferCollapsedBodies` —— body 压根没挂载。也就是说不管壳里有没有东西,
     *    `recordBody` 都是 null:一条**永真**的断言。
     *
     * 改成先展开再看,这样它才真的在问「失败那一轮里,那次没回来的调用还在不在」。
     */
    activateExecutionRecord(container);
    const body = recordBody(container)!;
    expect(body, '失败的一轮也留着执行记录(B47 只在这一档保空壳)').not.toBeNull();
    expect(body.textContent).toContain('Execute guard');
    // 轮次已经停了 —— 和跑完那几条同一条规矩:中性灰,不许继续转圈
    expect(body.querySelector('[aria-label="Not started"]')).not.toBeNull();
    expect(body.querySelector('[aria-label="Working"]')).toBeNull();
  });

  /*
   * ⚠️ OPEND-2626 **翻过案**:壳头不再沿用「进行中」。
   * 原来的理由是「下面那行『已手动停止』已经说清楚了」,而那一行在**历史回合**上
   * 是 `opacity: 0`(OPEND-2542 的 hover 揭示)—— 前提在历史回合上不成立。
   * 这一条仍然守着「两行说的是同一件事的两句话」:壳头报终态、状态行报是谁停的。
   */
  it('手动停止:壳头报「已取消」,「已手动停止」是下面那行状态的词(B7 / W4)', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents([
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'pnpm guard', description: 'Execute guard' },
            },
            /*
             * 配上结果,壳里才**有东西** —— 取消掉的空壳现在整个不渲染
             * (B47,见 `runtime/chat/empty-shell.test.ts`:壳头写着「进行中」
             * 压在「已取消」上面,既没信息又自相矛盾)。这一条要验的是
             * 「壳头在手动停止时仍是进行中」,所以得给它一行内容才谈得上壳头。
             */
            {
              kind: 'tool_result',
              toolUseId: 'tool-1',
              content: 'ok',
              isError: false,
            },
          ]),
          runStatus: 'canceled',
        }}
        streaming={false}
        projectId="project-1"
        // 回合状态行**只在最后一轮出**(2026-08-26 产品裁决,用户原话:「应该只有
        // 最后一轮底部才会显示,之前轮次不要显示,hover 也不显示」)。这一条要断言
        // 那一行的词,就得把这条消息摆成最后一轮 —— 原来没传,于是整行不渲染。
        isLast
      />,
    );

    // 手动停止仍不是第四种 `status`(壳走 `stopped` 旗标、秒数停住),
    // 但壳头那个词报的是终态本身,不再和真的在跑的回合共用「进行中」。
    expect(recordHead(container)).toContain('Canceled');
    expect(recordHead(container)).not.toContain('Working');
    expect(recordHead(container)).not.toContain('Done');
    expect(container.querySelector('[data-testid="assistant-label"]')?.textContent).toBe('Stopped manually');
  });

  it('执行记录里没内容的一轮被停掉:状态行说「已手动停止」而不是「已完成」', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents([{ kind: 'text', text: 'Partial response.' }]),
          content: 'Partial response.',
          runStatus: 'canceled',
        }}
        streaming={false}
        projectId="project-1"
        // 同上:回合状态行只在最后一轮出。
        isLast
      />,
    );

    expect(container.querySelector('[data-testid="assistant-label"]')?.textContent).toBe('Stopped manually');
  });

  it.each(['no_result', 'delivery_failed'] as const)(
    '产物没送达(%s)也算这一轮失败',
    (resultDeliveryState) => {
      const { container } = render(
        <AssistantMessage
          projectKind="prototype"
          conversationId="conv-1"
          message={{
            ...messageWithEvents([
              { kind: 'tool_use', id: 'tool-1', name: 'Write', input: { file_path: '/repo/index.html', content: '<main />' } },
              { kind: 'tool_result', toolUseId: 'tool-1', content: 'ok', isError: false },
            ]),
            resultDeliveryState,
          }}
          streaming={false}
          projectId="project-1"
        />,
      );

      expect(recordHead(container)).toContain('Run failed');
    },
  );

  it('流式中的调用还没有结果:壳是「进行中」、默认摊开,那一行当场就在(D3 作废 / D18)', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents([
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'pnpm guard', description: 'Run guard' },
            },
          ]),
          endedAt: undefined,
          runStatus: 'running',
        }}
        streaming
        projectId="project-1"
      />,
    );

    /*
     * D18 那半边**没变**:轮次还在跑,壳头是「进行中」、默认摊开。
     *
     * D3 那半边翻了(2026-09-02,OPEND-2419):调用发出去就落行。这一刻恰恰是
     * 整条裁决的**正题** —— 命令还在跑,屏幕上就得有它。原来这里断言
     * `recordBody(container)` 是 null(壳里空着),那是「跑完才落行」的形态。
     *
     * 行首这一格与上面那几条相反:轮次**还在跑**,所以要的就是转着的球(`Working`)。
     * 两头都钉住,「不许转圈」那条才不至于矫枉过正把该转的也停掉。
     */
    expect(recordHead(container)).toContain('Working');
    const body = recordBody(container)!;
    expect(body, '进行中的调用当场落行').not.toBeNull();
    expect(body.textContent).toContain('Run guard');
    expect(body.querySelector('[aria-label="Working"]'), '还在跑的行是转着的球').not.toBeNull();
    expect(body.querySelector('[aria-label="Not started"]'), '还在跑不该退成中性灰').toBeNull();
  });

  it('还在流的 Write 当场落行(源码预览仍然不许回来);run 结束后壳收起(D3 作废 + D18)', () => {
    const streamingEvents = [
      {
        kind: 'tool_use' as const,
        id: 'tool-1',
        name: 'Write',
        input: { file_path: '/repo/result.ts', content: 'export const value = 1;' },
      },
      { kind: 'text' as const, text: 'Writing the result now.' },
    ];
    const { container, rerender } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents(streamingEvents),
          endedAt: undefined,
          runStatus: 'running',
        }}
        streaming
        projectId="project-1"
      />,
    );

    /*
     * 2026-08-26 裁决之后:还没有 todo 的阶段,叙述在壳外,壳里只装工具调用和 thinking。
     * 这一刻那次 Write **还没有结果**,所以壳里确实空着 —— 空壳按 D21 不出箭头也打不开。
     *
     * 这一条原来还断言「流式的代码预览照旧渲染」,依据是接入时的临时安排
     * (`chat-panel-next.md:674`「位置不对但能力不丢」)。
     * **用户当场把它推翻了**(`chat-panel-feedback.md:422` N4:
     * 「不应该是一个普通工具调用的样式吗?」),喂料的 `liveToolInput` 链路整条删了,
     * 那句断言在这里已经无从证伪 —— 挪去 `chat/write-live-preview.test.tsx`,
     * 那边守的是「通道不许回来」。
     *
     * ⚠️ 2026-09-02(OPEND-2419)之后这一条又翻了一半:原来写的是
     * 「这一刻那次 Write 还没有结果,所以壳里确实空着」+ `rowCount === 1`,
     * 依据是 D3;**D3 已作废**,Write 发出去就落行,所以现在壳里是**两件东西**:
     * 那一行 + 那句叙述。
     *
     * 但 N4 那条**一个字都没松**,而且正是它给出这条裁决的形状:用户要的是
     * 「一个普通工具调用的样式」(一行「新建 result.ts」),不是壳外摊开的几十行
     * HTML 源码。所以下面那句 `not.toContain('export const value = 1;')` 必须留着 ——
     * 它现在是这一条里唯一还在守 N4 的断言,别当成「顺手带的」删掉。
     */
    expect(rowCount(container)).toBe(2);                       // 工具行 + 那句叙述
    expect(bodyText(container)).toContain('Writing the result now.');
    expect(bodyText(container)).toContain('result.ts');        // 调用发出去就落行
    // N4 守卫:落的是一行,不是一块源码预览
    expect(container.textContent ?? '').not.toContain('export const value = 1;');

    rerender(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents([
            ...streamingEvents,
            { kind: 'tool_result', toolUseId: 'tool-1', content: 'ok', isError: false },
          ]),
          runStatus: 'succeeded',
        }}
        streaming={false}
        projectId="project-1"
      />,
    );

    expect(record(container).open).toBe(false);
  });

  it('壳外的结论带着流式光标;done 之前的叙述留在壳里(D43)', () => {
    // 注意这一条的名字就是结论:done **之前**的叙述在壳里。
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents([
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'pnpm guard', description: 'Run guard' },
            },
            { kind: 'text', text: 'Let me check the guard first.' },
            { kind: 'text', text: '<done/>The answer is still streaming.' },
          ]),
          endedAt: undefined,
          runStatus: 'running',
        }}
        streaming
        projectId="project-1"
      />,
    );

    /*
     * 原来这里用 `.prose-block[data-stream-cursor="true"]` 定位正文。那个属性
     * 2026-08-27 随流式光标一起删掉了(用户:「把这个光标干掉,什么地方都不准
     * 出现」),所以改成按内容找 —— 这条用例问的本来就是「done 之后的正文出没
     * 出壳」,和光标无关。光标不再出现这件事由
     * `tests/components/chat/stream-cursor-removed.test.tsx` 单独钉着。
     */
    const prose = [...container.querySelectorAll('.prose-block')]
      .find((n) => (n.textContent ?? '').includes('The answer is still streaming.'));
    expect(prose).toBeTruthy();
    /*
     * 这里曾经断言「两段都在壳外」,依据是 2026-08-26 早些时候那条
     * 「还没有 todo 时正文一律在壳外」—— **用户当天晚些时候把它推翻了**
     * (`chat-panel-feedback.md`「被推翻的两条」;原话:「没有 todowrite 时,
     * 所有工具调用或普通文本或者 thinking,都收拢在展开收起卡片里;当有了 done
     * 信号之后,输出的平台文本内容才会显示到卡片外面」)。
     *
     * 推翻的理由是真机截图指认的坏画面:`ensureShell` 在循环开头就把壳压进了
     * `blocks`,于是开场白排到了**整张卡之后**,还和结论粘成一段。
     *
     * 所以判据只有一个 —— **done 到没到**:之前的进壳,之后的出壳。
     */
    const paragraphs = [...container.querySelectorAll('.prose-block')].map((n) => n.textContent ?? '');
    expect(paragraphs.some((p) => p.includes('Let me check the guard first.'))).toBe(false);
    expect(bodyText(container)).toContain('Let me check the guard first.');
  });

  /*
   * 壳头**永远不说「思考中」**(用户裁决 2026-08-27:「一上来应该是原本的进行中卡片」)。
   * 思考这件事由壳里那一格自己表达 —— 它有球、有扫光、有「思考中」三个字。
   * 这条测试原来断言的是壳头会先显示 Thinking 再切 Working,那是重构前的形态,
   * 已被上面这条裁决推翻;改写而不是删掉,是为了留住「壳头在思考阶段说什么」这个问题的答案。
   */
  it('壳跟着 run 走:思考态壳头就是「进行中」,思考中三个字在壳里那一格', () => {
    const renderMessage = (
      events: AgentEvent[],
      options: { streaming: boolean; runStatus: ChatMessage['runStatus']; endedAt?: number },
    ) => (
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents(events),
          endedAt: options.endedAt,
          runStatus: options.runStatus,
        }}
        streaming={options.streaming}
        projectId="project-1"
      />
    );
    const thinking = { kind: 'thinking', text: 'Reviewing the request.' } satisfies AgentEvent;
    const read = {
      kind: 'tool_use',
      id: 'tool-1',
      name: 'Read',
      input: { file_path: '/repo/source.ts' },
    } satisfies AgentEvent;

    const { container, rerender } = render(renderMessage(
      [thinking],
      { streaming: true, runStatus: 'running' },
    ));
    // 壳头:思考阶段就已经是「进行中」,不再有单独的 Thinking 一档
    expect(recordHead(container)).toContain('Working');
    expect(recordHead(container)).not.toContain('Thinking');
    /*
     * 正向对照 —— 少了这一条,上面那句 `not.toContain` 在「思考那一格整个没渲染」
     * 时也会绿,等于什么都没测。「思考中」必须确实出现在壳**里**。
     */
    expect(bodyText(container)).toContain('Thinking');
    expect(record(container).open).toBe(true);

    // 动手了那一格就不再是「思考中」,变成可展开的「Thoughts」(W11:靠事件不靠文字)
    rerender(renderMessage([thinking, read], { streaming: true, runStatus: 'running' }));
    expect(recordHead(container)).toContain('Working');
    expect(recordHead(container)).not.toContain('Thinking');
    expect(bodyText(container)).not.toContain('Thinking');
    expect(bodyText(container)).toContain('Thoughts');

    rerender(renderMessage(
      [thinking, read, { kind: 'text', text: 'Here is the conclusion.' }],
      { streaming: true, runStatus: 'running' },
    ));
    expect(record(container).open).toBe(true);

    rerender(renderMessage(
      [
        thinking,
        read,
        { kind: 'tool_result', toolUseId: 'tool-1', content: 'source', isError: false },
        { kind: 'text', text: 'Here is the conclusion.' },
      ],
      { streaming: false, runStatus: 'succeeded', endedAt: 3_000 },
    ));
    expect(recordHead(container)).toContain('Done');
    expect(record(container).open).toBe(false);
  });

  it('run 还在跑时,流出来的推理当场就看得见(recvqgLmAkUM6G)', () => {
    // 老链路把推理收进一个要手点的抽屉里;新壳跑着的时候本来就是摊开的(D18),
    // 所以「卡在 Thinking 上的用户能不能读到推理」这条保障仍然成立,只是不用点了。
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents([{ kind: 'thinking', text: 'Reviewing the request.' }]),
          endedAt: undefined,
          runStatus: 'running',
        }}
        streaming
        projectId="project-1"
      />,
    );

    expect(record(container).open).toBe(true);
    expect(bodyText(container)).toContain('Reviewing the request.');
  });

  it('执行记录在回答上方,thinking 与工具行都收在里面', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          { kind: 'thinking', text: 'Reviewing the request.' },
          { kind: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: '/repo/source.ts' } },
          { kind: 'tool_result', toolUseId: 'tool-1', content: 'source', isError: false },
          { kind: 'text', text: 'Here is the finished answer.' },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    activateExecutionRecord(container);
    const flow = container.querySelector('[data-testid="assistant-flow"]');
    expect(flow?.firstElementChild).toBe(record(container));
    expect(recordHead(container)).toContain('Done');
    expect(flow?.textContent).toContain('Here is the finished answer.');

    expect(bodyText(container)).toContain('Thoughts');
    fireEvent.click(screen.getByText('Thoughts').closest('summary')!);
    const body = bodyText(container);
    expect(body).toContain('Reviewing the request.');
    expect(body).toContain('source.ts');
    // 结论在壳【外】,不在壳里重复一遍(D43)
    expect(body).not.toContain('Here is the finished answer.');
  });

  it('hides empty tool_call / tool_call_update status rows (no displayable detail) (#4618)', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          { kind: 'status', label: 'tool_call' },
          { kind: 'status', label: 'tool_call_update' },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    // These persisted ACP markers carry no tool name/input/output, so they must
    // not surface as empty, expandable status pills.
    expect(container.querySelector('[data-status="tool_call"]')).toBeNull();
    expect(container.querySelector('[data-status="tool_call_update"]')).toBeNull();
    expect(container.querySelector('[data-testid="status-pill"]')).toBeNull();
  });

  it('hides persisted lifecycle status rows after a run reaches a terminal state', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents([
            { kind: 'status', label: 'working' },
            { kind: 'status', label: 'completed' },
          ]),
          runStatus: 'canceled',
          endedAt: 2,
        }}
        streaming={false}
        projectId="project-1"
      />,
    );

    expect(container.querySelector('[data-status="working"]')).toBeNull();
    expect(container.querySelector('[data-status="completed"]')).toBeNull();
    expect(container.querySelector('[data-testid="status-pill"]')).toBeNull();
  });

  /*
   * `model` 这一档 2026-08-27 起不再渲染(用户:「这个模型的标识可以去掉」)——
   * 它是 AMR/ACP 独有的运行时标记,由 `acp/session.ts` 在 session/new 和
   * set_model 完成时各发一次,内容是模型 id,而输入区的模型芯片上已经写着了。
   * 详见 `tests/components/AssistantMessage.amr-model-status.test.tsx`。
   *
   * 这条用例原来把 `model` 和生命周期状态行捆在一起断言,于是跟着变红。
   * 保留生命周期那两档(它们照常渲染),把 `model` 那半改成**反向断言** ——
   * 这样它从「跟着别人一起红」变成「替那条裁决站岗」。
   */
  it('lifecycle 状态行照常渲染,而 model 那一档不再出现', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          { kind: 'status', label: 'working', detail: 'Publishing plugin' },
          { kind: 'status', label: 'done', detail: 'CLI command finished' },
          { kind: 'status', label: 'model', detail: 'claude-opus-4-7-high' },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    expect(container.querySelector('[data-status="working"]')).not.toBeNull();
    expect(container.querySelector('[data-status="done"]')).not.toBeNull();
    expect(container.textContent).toContain('Publishing plugin');
    expect(container.textContent).toContain('CLI command finished');
    // 反向断言:model 那一行整个不画,detail 里的模型 id 也不出现在任何地方
    expect(container.querySelector('[data-status="model"]')).toBeNull();
    expect(container.textContent).not.toContain('claude-opus-4-7-high');
  });

  it('renders URLs in JSON-like status details without trailing structural characters', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          {
            kind: 'status',
            label: 'publish repo',
            detail: '{"url":"https://github.com/nexu-io/example-plugin","nameWithOwner":"nexu-io/example-plugin"}',
          },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    const link = container.querySelector('[data-testid="status-detail"] a.md-link');
    expect(link?.getAttribute('href')).toBe('https://github.com/nexu-io/example-plugin');
    expect(link?.textContent).toBe('https://github.com/nexu-io/example-plugin');
    expect(container.querySelector('[data-testid="status-detail"]')?.textContent).toContain('"}');
  });
});

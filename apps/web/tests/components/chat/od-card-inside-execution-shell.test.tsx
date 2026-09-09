// @vitest-environment jsdom
/**
 * `<od-card>` emitted before `<od-done>` must still render as a card.
 *
 * ── 症状(用户实拍)────────────────────────────────────────────────────
 * 助手消息里,「思考过程」和「执行计划 · 3 步」**之间**摊着一整段原始文本:
 *
 *     <od-card type="task-brief">
 *     { "summary": "按参考模板把「狐假虎威」寓言画成一张…", "fields": [ … ] }
 *     </od-card>
 *
 * ── 结构性成因(复核过,不是照抄工单)──────────────────────────────────
 * 一轮里的文字有两条 lane,判据是 D43(`runtime/chat/build-turn-blocks.ts:12`):
 * `<od-done>` **之前**的散文是过程叙述,`routeInside()` 收进执行壳;之后的是结论,
 * `pushProse()` 留在壳外。
 *
 * 而 `splitOnOdCards`(`packages/contracts/src/artifacts/od-card.ts`)全仓只有
 * 一个渲染调用点 —— `AssistantMessage.tsx` 的 `prose-block`,也就是**壳外**那条。
 * 壳内的文字走 `ExecutionShell` → `SayText` → `renderMarkdown`,这条路上一处
 * od-card 解析都没有。
 *
 * 所以只要模型在 `<od-done>` 之前发卡片(task-brief 这一档 PRE 卡按设计就是在
 * 开工前发的),它必然落进不解析的那条通道,标签原文原样上屏。截图里卡片在开头、
 * done 在结尾,正好是这个形状。
 *
 * OPEND-2745 修的是**另一件事** —— 宿主补发的记忆卡被误判成一次运行,于是它的
 * 正文被 D43 收进壳里。那条修复把误判关掉,卡回到壳外就好了;它没有、也不打算
 * 给壳内那条通道补上 od-card 解析(那个文件的注释逐字写着「整条链上没有任何一处
 * `splitOnOdCards`」)。本文件钉的是真运行走 D43 的那条正常路径。
 *
 * ── 红线 ──────────────────────────────────────────────────────────────
 * 正确行为是**渲染成卡片**,不是删掉、不是当纯文本。`<od-card>` 是仓库真实实现的
 * 协议标签,删掉等于把 OPEND-2607 那一档 UI 重新弄没。最后一节是壳外那条原有通道
 * 的对照锚点:修复不许把它改坏。
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AssistantMessage } from '../../../src/components/AssistantMessage';
import type { ChatMessage } from '../../../src/types';

afterEach(() => cleanup());

const KEY = 'a7f3c91ed2b40561';

/** 用户截图里那张卡,原样保留换行与 JSON 体。 */
const TASK_BRIEF_CARD = [
  '<od-card type="task-brief">',
  '{ "summary": "按参考模板把「狐假虎威」寓言画成一张电影级 3D 风格故事插画(16:9 单图)。",',
  '  "fields": [ {"label": "主体", "value": "狐狸与老虎"}, {"label": "画幅", "value": "16:9"} ] }',
  '</od-card>',
].join('\n');

/**
 * 一次**真运行**,停在截图那一刻:卡片和过程叙述都发了,`<od-done>` **还没到**。
 * D43 于是把两段都收进执行壳,而壳这时是摊开的(还在跑、还没有结论)——
 * 截图里那张卡就是这么和「思考过程 / 执行计划」并排躺在壳里的。
 *
 * ⚠️ 不能拿「跑完的一轮」当夹具:跑完 + 有结论 = 壳自动收起,
 * `deferCollapsedBodies` 连 body 都不渲染,断言会因为**整块没上屏**而假绿。
 */
function turnWithCardBeforeDone(): ChatMessage {
  return {
    id: 'assistant-card-in-shell',
    role: 'assistant',
    content: `${TASK_BRIEF_CARD}\n我先对齐一下需求。\n`,
    events: [
      { kind: 'done_key', key: KEY },
      { kind: 'text', text: `${TASK_BRIEF_CARD}\n我先对齐一下需求。\n` },
      {
        kind: 'tool_use',
        id: 'todo-1',
        name: 'TodoWrite',
        input: { todos: [{ content: '生成插画', status: 'in_progress' }] },
      },
    ],
    agentId: 'claude',
    agentName: 'Claude',
    runId: 'run-card-in-shell',
    runStatus: 'running',
    createdAt: 1_700_000_000_000,
    startedAt: 1_700_000_000_000,
  } as ChatMessage;
}

function renderTurn(message: ChatMessage, streaming = true) {
  return render(
    <AssistantMessage
      message={message}
      streaming={streaming}
      projectId="project-1"
      conversationId="conv-1"
      isLast
    />,
  );
}

describe('od-card 出现在执行壳内', () => {
  it('不把 <od-card> 标签原文摊给用户看', () => {
    const { container } = renderTurn(turnWithCardBeforeDone());

    // 正向锚点:壳的 body **确实**上屏了。少了它,下面那条可以因为
    // 「壳收起来了、整块压根没渲染」而假绿。
    expect(
      container.textContent ?? '',
      '夹具坏了 —— 壳 body 没上屏,断言看不到任何东西',
    ).toContain('我先对齐一下需求。');

    expect(
      container.textContent ?? '',
      'od-card 标签原文被摊给用户看了(壳内那条通道不解析 od-card)',
    ).not.toContain('<od-card');
  });

  it('渲染成 task-brief 那张卡,而不是删掉', () => {
    const { container } = renderTurn(turnWithCardBeforeDone());

    expect(
      container.querySelector('[data-od-card="task-brief"]'),
      '卡片没渲染出来 —— 修复不许把 od-card 当噪音删掉',
    ).not.toBeNull();
    expect(container.textContent ?? '').toContain('狐假虎威');
  });

  it('卡片之外的过程叙述照旧留在壳里', () => {
    const { container } = renderTurn(turnWithCardBeforeDone());

    expect(
      container.textContent ?? '',
      '同一段文字里卡片以外的散文被一起吞了',
    ).toContain('我先对齐一下需求。');
    expect(
      container.querySelector('[data-testid="assistant-flow"]'),
      '夹具坏了 —— 执行壳那一块压根没渲染',
    ).not.toBeNull();
  });
});

/**
 * ⚠️ **对照锚点 —— 壳外那条原有通道**。
 *
 * `<od-done>` 之后发的卡片走的是 `AssistantMessage` 的 `prose-block`,那条通道
 * 本来就正确。修复只许给壳内补一条同源的解析,不许动这一条。
 */
describe('壳外那条原有通道不变', () => {
  it('done 之后的 od-card 照旧渲染成卡片', () => {
    const { container } = renderTurn({
      id: 'assistant-card-after-done',
      role: 'assistant',
      content: `完成。<od-done key="${KEY}"/>${TASK_BRIEF_CARD}`,
      events: [
        { kind: 'done_key', key: KEY },
        { kind: 'text', text: `完成。<od-done key="${KEY}"/>${TASK_BRIEF_CARD}` },
      ],
      agentId: 'claude',
      agentName: 'Claude',
      runId: 'run-card-after-done',
      runStatus: 'succeeded',
      createdAt: 1_700_000_000_000,
      startedAt: 1_700_000_000_000,
      endedAt: 1_700_000_009_000,
    } as ChatMessage);

    expect(container.querySelector('[data-od-card="task-brief"]')).not.toBeNull();
    expect(container.textContent ?? '').not.toContain('<od-card');
  });
});

// @vitest-environment jsdom

/**
 * 分叉之后「成功的一轮变成运行失败」的**显示这一端**。
 *
 * 真机 2026-08-27:一轮完整成功的 Codex 回答,分叉之后壳头是红色的「运行失败」。
 * 那一轮里有一次 `desktop renderer unavailable` 的工具报错,但整轮 run 是 `succeeded`。
 *
 * 链条只有两环:
 *  1. daemon 复制这一截上下文时把 `runStatus` 一并丢了(修在
 *     `apps/daemon/src/routes/project/conversations.ts` 的 fork 分支);
 *  2. 壳拿不到结论就回退到「从事件里猜」(`AssistantMessage.legacyTurnFailed`)——
 *     看到任何一条报错的 `tool_result` 就判整轮失败。
 *
 * 这个文件钉住第 2 环:**结论在就听结论**。有它,第 1 环把结论带回来就够了;
 * 没有它,就没人拦得住「把状态无脑写成成功」这种假修法 —— 所以成功和失败两边都钉。
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage } from '../../src/types';

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => store.delete(k),
      setItem: (k: string, v: string) => store.set(k, v),
    },
  });
});

afterEach(cleanup);

/**
 * 真机那一条的形状(app.sqlite 里逐字段对过):一轮成功的设计轮次,中途一次
 * 工具调用报错,`runId` / `lastRunEventId` 已经被 fork 摘掉。
 */
function turnWithOneFailedToolCall(runStatus: ChatMessage['runStatus']): ChatMessage {
  return {
    id: 'copied-tail',
    role: 'assistant',
    content: '已完成长篇深度文章页面。静态检查已通过;桌面渲染服务当前不可用。',
    ...(runStatus ? { runStatus } : {}),
    startedAt: 1787796127536,
    endedAt: 1787796469549,
    events: [
      { kind: 'tool_use', id: 'item_6', name: 'render_screenshot', input: {} },
      {
        kind: 'tool_result',
        toolUseId: 'item_6',
        content:
          '{"error":{"code":"UPSTREAM_UNAVAILABLE","message":"desktop renderer unavailable"}}',
        isError: true,
      },
      { kind: 'text', text: '已完成长篇深度文章页面。' },
    ],
    producedFiles: [],
  } as unknown as ChatMessage;
}

function renderTurn(message: ChatMessage): string {
  const { container } = render(
    <AssistantMessage
      message={message}
      streaming={false}
      isLast
      projectId="p1"
      errorCardOwnerId={null}
      onFeedback={vi.fn()}
    />,
  );
  return container.textContent ?? '';
}

describe('壳头的状态听 run 的结论', () => {
  it('一轮成功、中途某个工具报过错 —— 不说「运行失败」', () => {
    expect(renderTurn(turnWithOneFailedToolCall('succeeded'))).not.toContain('Run failed');
  });

  /*
   * 反向那一条:少了它,把状态写死成 succeeded 也能让上面那条绿 —— 那会把真正
   * 失败的一轮藏起来,比原来的 bug 更糟。
   */
  it('一轮真的失败 —— 照说「运行失败」', () => {
    expect(renderTurn(turnWithOneFailedToolCall('failed'))).toContain('Run failed');
  });

  /*
   * 这一条不是「应该这样」,是**现状**:结论整个不在的时候,壳只能从事件里猜,
   * 而那条判据看到一条报错的 tool_result 就判失败。它就是 fork 丢掉 `runStatus`
   * 之后那个红壳头的来源 —— 钉在这里,是为了让「fork 必须把结论带过来」有据可依。
   * (线上还有一批老 daemon 建出来的分叉会话,`run_status` 已经永久为空,
   * 只能靠改这条判据或者引入「未知」态才救得回来 —— 那是产品裁决,不在本次修复里。)
   */
  it('结论整个不在时,壳退回从事件里猜 —— 于是同一轮被判成失败', () => {
    expect(renderTurn(turnWithOneFailedToolCall(undefined))).toContain('Run failed');
  });
});

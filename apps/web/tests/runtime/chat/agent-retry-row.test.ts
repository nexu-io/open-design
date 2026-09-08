/**
 * 红测:daemon 自动重跑一轮的时候,流水尾部要有一行说「在重试」。
 *
 * 今天没有。web 完全不认识 `run_retry_attempted` —— 那条事件带着
 * `retry_attempt_index` / `retry_max_attempts` 走 SSE 到了浏览器
 * (`apps/daemon/src/runtimes/runs.ts` 的 `emit` 把**每一条**记录都
 * `for (const sse of run.clients) sse.send(...)`),然后被丢掉。
 *
 * 真机证据 `.od/runs/0e40b819-…/events.jsonl`:
 *   id 10 error(json-rpc … context deadline exceeded)
 *   id 12 run_retry_attempted  retry_attempt_index=1 retry_max_attempts=1
 *   id 14 start(第二次尝试)
 * 之后第二次尝试等了 30+ 秒才有第一个 token。整段时间里屏幕上只有「进行中」,
 * 没有任何地方说过「刚才那次失败了,这是第二次」。
 *
 * 为什么复用组件 22「重连」的状态而不是新造一个:交付稿自己写死了这条规矩
 * (`docs/design/chat-panel-next.html:4058`)——「断线由 22 · 重连全程接管……
 * **再单立一个模块只会多出第三个说法**」。用户体感里「连接在重连」和「这一轮在
 * 重跑」是同一件事(系统在自救,等一下),形态也一样:流水尾部一行会动的状态,
 * 恢复后整行消失、不留「已恢复」。
 *
 * 复用的是**形态**,不是那句话:重跑一轮的时候连接好好的,说「正在重新连接」
 * 是假的,而且会把「连接真的断了」这句话说漏。所以另给一条读数(`reason`)。
 */
import { describe, expect, it } from 'vitest';

import {
  nextChatReconnectView,
  type ChatReconnectView,
} from '../../../src/runtime/chat/reconnect-state';

const RUN = 'run-1';
const CONV = 'conv-1';

function retrying(attempt: number, max: number) {
  return {
    kind: 'agent-retry' as const,
    runId: RUN,
    conversationId: CONV,
    attempt,
    max,
    phase: 'retrying' as const,
  };
}

describe('自动重试也走流水尾部那一行', () => {
  it('收到重试信号就长出那一行,并标明它说的是「重跑一轮」', () => {
    const view = nextChatReconnectView(null, retrying(1, 2));
    expect(view).not.toBeNull();
    expect(view!.reason).toBe('agent-retry');
    expect(view!.attempt).toBe(1);
    expect(view!.max).toBe(2);
    expect(view!.runId).toBe(RUN);
    expect(view!.conversationId).toBe(CONV);
  });

  // 自动重试没有「用尽后交回给人」那一档:预算烧完之后接手的是报错卡
  // (设计稿 S10 的时机原文是「自动重试都失败后」),不是一颗〔重新连接〕。
  // 所以这一行永远不该进 22-3 那个形态。
  it('自动重试永远不进「交回给人」那一档', () => {
    const view = nextChatReconnectView(null, retrying(1, 1));
    expect(view!.exhausted).toBe(false);
  });

  it('重跑接上了就整行消失,不留「已恢复」', () => {
    const shown = nextChatReconnectView(null, retrying(1, 2));
    const cleared = nextChatReconnectView(shown, {
      kind: 'agent-retry',
      runId: RUN,
      conversationId: CONV,
      attempt: 0,
      max: 2,
      phase: 'cleared',
    });
    expect(cleared).toBeNull();
  });

  it('别的 run 的重试信号不动当前这一行', () => {
    const shown = nextChatReconnectView(null, retrying(1, 2));
    const other = nextChatReconnectView(shown, {
      kind: 'agent-retry',
      runId: 'run-2',
      conversationId: CONV,
      attempt: 0,
      max: 2,
      phase: 'cleared',
    });
    expect(other).toBe(shown);
  });

  // 这一轮收场了,那一行跟着走 —— 和传输层那一行同一套判据,因为它们现在是
  // 同一个 reducer 的两种读数。
  it('这一轮成功/失败/取消,那一行都不留', () => {
    for (const status of ['succeeded', 'failed', 'canceled'] as const) {
      const shown = nextChatReconnectView(null, retrying(1, 2));
      expect(nextChatReconnectView(shown, { kind: 'settled', runId: RUN, status })).toBeNull();
    }
  });

  it('切走/卸载时那一行不残留', () => {
    const shown = nextChatReconnectView(null, retrying(1, 2));
    expect(nextChatReconnectView(shown, { kind: 'dropped' })).toBeNull();
  });
});

describe('agent 上游重连也复用同一行', () => {
  it('原地更新计数，恢复后消失', () => {
    const first = nextChatReconnectView(null, {
      kind: 'agent-reconnect',
      runId: RUN,
      conversationId: CONV,
      attempt: 1,
      max: 5,
      phase: 'reconnecting',
    });
    expect(first).toMatchObject({ reason: 'agent-reconnect', attempt: 1, max: 5 });

    const second = nextChatReconnectView(first, {
      kind: 'agent-reconnect',
      runId: RUN,
      conversationId: CONV,
      attempt: 2,
      max: 5,
      phase: 'reconnecting',
    });
    expect(second).toMatchObject({ reason: 'agent-reconnect', attempt: 2, max: 5 });

    expect(nextChatReconnectView(second, {
      kind: 'agent-reconnect',
      runId: RUN,
      conversationId: CONV,
      attempt: 0,
      max: 5,
      phase: 'cleared',
    })).toBeNull();
  });
});

describe('两种自救同时在场时,断线那一行优先', () => {
  // 这两件事在今天的实现里**碰不到一起**:daemon 发 `error` 帧不会关流
  // (`runtimes/runs.ts` 只有 `finish()` 才 `sse.end()`,而同 run 重试不走
  // `finish()`),web 那边 `error` 帧只是缓存下来继续读
  // (`providers/daemon.ts` 的 `pendingStructuredError`),不会触发重连计数。
  //
  // 但「碰不到一起」是当下实现的性质,不是这一层的保证。真断线时用户至少还有
  // 〔重新连接〕那颗按钮可按;重试那一行什么按钮都没有。所以万一同时到达,
  // 让有出路的那一行留在屏幕上。
  it('已经在显示断线时,重试信号不把它顶掉', () => {
    const transport = nextChatReconnectView(null, {
      kind: 'transport',
      runId: RUN,
      conversationId: CONV,
      attempt: 3,
      max: 5,
      phase: 'reconnecting',
    }) as ChatReconnectView;
    expect(transport.reason).toBe('transport');

    const after = nextChatReconnectView(transport, retrying(1, 2));
    expect(after).toBe(transport);
  });

  // 反方向:断线永远盖得住重试那一行 —— 线断了是更大的事实,而且它带着按钮。
  it('正在显示重试时,断线信号顶得掉它', () => {
    const retry = nextChatReconnectView(null, retrying(1, 2));
    const after = nextChatReconnectView(retry, {
      kind: 'transport',
      runId: RUN,
      conversationId: CONV,
      attempt: 1,
      max: 5,
      phase: 'reconnecting',
    });
    expect(after!.reason).toBe('transport');
    expect(after!.max).toBe(5);
  });
});

describe('传输层那一行的读数没被改动', () => {
  it('传输层的行仍然标成 transport,预算仍然是它自己的', () => {
    const view = nextChatReconnectView(null, {
      kind: 'transport',
      runId: RUN,
      conversationId: CONV,
      attempt: 2,
      max: 5,
      phase: 'reconnecting',
    });
    expect(view!.reason).toBe('transport');
    expect(view!.max).toBe(5);
    expect(view!.exhausted).toBe(false);
  });

  it('传输层用尽仍然进「交回给人」那一档', () => {
    const view = nextChatReconnectView(null, {
      kind: 'transport',
      runId: RUN,
      conversationId: CONV,
      attempt: 5,
      max: 5,
      phase: 'exhausted',
    });
    expect(view!.exhausted).toBe(true);
    expect(view!.reason).toBe('transport');
  });
});

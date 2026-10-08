import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@open-design/contracts';

import { forkBoundaryMessageIndex } from '../../../src/runtime/chat/fork-boundary';

/*
 * 边界只在**同一条逻辑任务**内往后推。往前收、跨任务跑、或者在没有折叠的转录上
 * 乱动,都会把分叉切到用户没点的地方 —— 这三条各留一个用例钉住。
 *
 * 形状照 `GET /api/projects/:id/conversations/:cid/messages` 的返回:落库那几列
 * 加上历史 GET 补的 `strategyTaskExecutionId` / `strategyTaskRunIndex`
 * (`apps/daemon/src/routes/project/conversations.ts`)。
 */

const TASK_A = 'odnext_d56fa27247794fe6a7f2e46156f0dee0';
const TASK_B = 'odnext_b31c0a44e0d24e8fbb2a5a0f9c1e7d33';

function user(id: string, content: string): ChatMessage {
  return { id, role: 'user', content, sessionMode: 'design' };
}

function plainAssistant(id: string, runId: string): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: `answer for ${runId}`,
    agentId: 'claude',
    runId,
    runStatus: 'succeeded',
    sessionMode: 'design',
  };
}

function taskAssistant(
  id: string,
  runId: string,
  taskExecutionId: string,
  runIndex: number,
): ChatMessage {
  return {
    ...plainAssistant(id, runId),
    strategyTaskExecutionId: taskExecutionId,
    strategyTaskRunIndex: runIndex,
    strategyTaskDelivered: true,
  };
}

describe('forkBoundaryMessageIndex', () => {
  it('把折叠回合的头一条推到这条任务在转录里的最后一条', () => {
    const messages: ChatMessage[] = [
      user('u0', '写一份 B2B 销售提案'),
      taskAssistant('a-request', 'run-request', TASK_A, 0),
      user('u-form', '[form answers — discovery]'),
      taskAssistant('a-clarify', 'run-clarify', TASK_A, 1),
      taskAssistant('a-production', 'run-production', TASK_A, 2),
    ];
    expect(forkBoundaryMessageIndex(messages, 'a-request')).toBe(4);
  });

  it('折叠回合后面还有别的回合时,边界停在这条任务的末尾,不跑到转录末尾', () => {
    const messages: ChatMessage[] = [
      user('u0', '写一份 B2B 销售提案'),
      taskAssistant('a-request', 'run-request', TASK_A, 0),
      taskAssistant('a-production', 'run-production', TASK_A, 1),
      user('u1', '再改一版封面'),
      taskAssistant('b-request', 'run-b-request', TASK_B, 0),
      taskAssistant('b-production', 'run-b-production', TASK_B, 1),
    ];
    expect(forkBoundaryMessageIndex(messages, 'a-request')).toBe(2);
  });

  it('普通单 run 回合的边界就是它自己 —— 这种转录压根不折叠', () => {
    const messages: ChatMessage[] = [
      user('u0', '第一问'),
      plainAssistant('a0', 'run-0'),
      user('u1', '第二问'),
      plainAssistant('a1', 'run-1'),
    ];
    expect(forkBoundaryMessageIndex(messages, 'a0')).toBe(1);
    expect(forkBoundaryMessageIndex(messages, 'a1')).toBe(3);
  });

  it('点的是任务链的最后一条时不往回收', () => {
    const messages: ChatMessage[] = [
      user('u0', '写一份 B2B 销售提案'),
      taskAssistant('a-request', 'run-request', TASK_A, 0),
      taskAssistant('a-production', 'run-production', TASK_A, 1),
    ];
    expect(forkBoundaryMessageIndex(messages, 'a-production')).toBe(2);
  });

  it('分叉点不在这份转录里时返回 -1,让调用方走没落库那条兜底路', () => {
    const messages: ChatMessage[] = [user('u0', '第一问'), plainAssistant('a0', 'run-0')];
    expect(forkBoundaryMessageIndex(messages, 'a-never-persisted')).toBe(-1);
  });
});

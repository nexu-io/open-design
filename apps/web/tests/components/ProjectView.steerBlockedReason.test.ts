import { describe, expect, it } from 'vitest';

import { shouldExplainMidTurnSteeringUnsupported } from '../../src/components/ProjectView';

/**
 * 队列行退回态旁边那句「当前 agent 不支持中途插话」什么时候才**说得通**。
 *
 * 它是对「这颗为什么不是『引导对话』」的解释,而「引导」这件事只有在
 * **有一轮正在跑**的时候才存在。一轮都没在跑、队列纯粹排着等的时候,
 * 没有任何东西可以插话 —— 那颗按钮就是普通的「立即发送」,不打断任何东西,
 * 这时候再解释「不支持中途插话」是在回答一个没人问的问题。
 *
 * 这正是用户视频里的状态:上方显示「已手动停止」、一轮都没在跑,
 * 那句话却照样挂着。
 */
describe('shouldExplainMidTurnSteeringUnsupported', () => {
  it('有一轮正在跑、而这个 agent 中途根本不读 stdin —— 这时候才值得解释', () => {
    expect(
      shouldExplainMidTurnSteeringUnsupported({
        steerableRunId: 'run-1',
        agentSupportsSteering: false,
      }),
    ).toBe(true);
  });

  it('一轮都没在跑时不解释:那时候本来就没有「中途」可言', () => {
    expect(
      shouldExplainMidTurnSteeringUnsupported({
        steerableRunId: null,
        agentSupportsSteering: false,
      }),
    ).toBe(false);
  });

  it('agent 本来就接得住中途插话时不解释', () => {
    expect(
      shouldExplainMidTurnSteeringUnsupported({
        steerableRunId: 'run-1',
        agentSupportsSteering: true,
      }),
    ).toBe(false);
    expect(
      shouldExplainMidTurnSteeringUnsupported({
        steerableRunId: null,
        agentSupportsSteering: true,
      }),
    ).toBe(false);
  });
});

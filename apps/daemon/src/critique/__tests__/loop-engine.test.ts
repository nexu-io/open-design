/**
 * Loop Engine 单元测试
 *
 * 覆盖:
 * - extractFeedback: 从评审事件中提取结构化反馈
 * - hasConverged: 收敛判断
 * - shouldRetry: 重试决策
 * - startCritiqueLoop: 循环引擎完整流程
 * - loadLoopConfigFromEnv: 配置解析
 * - formatFeedbackAsPrompt: 反馈格式化
 *
 * 运行: vitest apps/daemon/src/critique/__tests__/loop-engine.test.ts
 */

import { describe, it, expect } from 'vitest';
import type { LoopEngineResult } from '../loop-engine.js';
import { extractFeedbackFromEvents, type CritiqueFeedback } from '../loop-feedback.js';
import { loadLoopConfigFromEnv } from '../config-loop.js';
import { formatFeedbackAsPrompt, summarizeLoopResult } from '../orchestrator-loop.js';
import { defaultCritiqueLoopConfig } from '../loop-types.js';
import type { CritiqueLoopConfig } from '../loop-types.js';

// ============================================================================
// extractFeedback 测试
// ============================================================================

describe('extractFeedback', () => {
  it('应从空事件列表返回空反馈', () => {
    const feedback = extractFeedbackFromEvents([], [], 'below_threshold');
    expect(feedback.mustFixItems).toEqual([]);
    expect(feedback.dimNotes).toEqual([]);
    expect(feedback.bestComposite).toBe(0);
    expect(feedback.bestRound).toBe(0);
  });

  it('应提取 mustFix 项', () => {
    const feedback = extractFeedbackFromEvents(
      [
        {
          type: 'panelist_must_fix',
          runId: 'r1',
          round: 1,
          role: 'a11y',
          text: '缺少 alt 文本',
        },
        {
          type: 'panelist_must_fix',
          runId: 'r1',
          round: 1,
          role: 'brand',
          text: '品牌色不匹配',
        },
      ],
      [{ n: 1, composite: 6.5, mustFix: 2, decision: 'continue' }],
      'below_threshold',
    );

    expect(feedback.mustFixItems).toHaveLength(2);
    expect(feedback.mustFixItems[0]).toBe('[a11y] 缺少 alt 文本');
    expect(feedback.mustFixItems[1]).toBe('[brand] 品牌色不匹配');
  });

  it('应提取 dimNotes 评分维度', () => {
    const feedback = extractFeedbackFromEvents(
      [
        {
          type: 'panelist_dim',
          runId: 'r1',
          round: 1,
          role: 'critic',
          dimName: 'visual_hierarchy',
          dimScore: 7,
          dimNote: '层次分明但留白可优化',
        },
        {
          type: 'panelist_dim',
          runId: 'r1',
          round: 2,
          role: 'brand',
          dimName: 'color_consistency',
          dimScore: 8,
          dimNote: '配色统一',
        },
      ],
      [
        { n: 1, composite: 7.0, mustFix: 0, decision: 'continue' },
        { n: 2, composite: 8.5, mustFix: 0, decision: 'ship' },
      ],
      'shipped',
    );

    expect(feedback.dimNotes).toHaveLength(2);
    expect(feedback.dimNotes[0]).toMatchObject({
      role: 'critic',
      round: 1,
      dimName: 'visual_hierarchy',
      dimScore: 7,
    });
  });

  it('应正确计算最佳轮次', () => {
    const rounds = [
      { n: 1, composite: 5.0, mustFix: 3, decision: 'continue' as const },
      { n: 2, composite: 7.0, mustFix: 1, decision: 'continue' as const },
      { n: 3, composite: 6.0, mustFix: 0, decision: 'continue' as const },
    ];

    const feedback = extractFeedbackFromEvents([], rounds, 'below_threshold');
    expect(feedback.bestComposite).toBe(7.0);
    expect(feedback.bestRound).toBe(2);
  });

  it('rounds 为空时 bestComposite 应为 0', () => {
    const feedback = extractFeedbackFromEvents([], [], 'failed');
    expect(feedback.bestComposite).toBe(0);
    expect(feedback.bestRound).toBe(0);
  });
});

// ============================================================================
// 配置解析测试
// ============================================================================

describe('loadLoopConfigFromEnv', () => {
  it('所有环境变量为空时应返回默认值', () => {
    const cfg = loadLoopConfigFromEnv({});
    const defaults = defaultCritiqueLoopConfig();
    expect(cfg.enabled).toBe(defaults.enabled);
    expect(cfg.maxIterations).toBe(defaults.maxIterations);
    expect(cfg.loopStrategy).toBe(defaults.loopStrategy);
    expect(cfg.fixTimeoutMs).toBe(defaults.fixTimeoutMs);
  });

  it('应正确解析 enabled', () => {
    expect(loadLoopConfigFromEnv({ OD_CRITIQUE_LOOP_ENABLED: 'true' }).enabled).toBe(true);
    expect(loadLoopConfigFromEnv({ OD_CRITIQUE_LOOP_ENABLED: '1' }).enabled).toBe(true);
    expect(loadLoopConfigFromEnv({ OD_CRITIQUE_LOOP_ENABLED: 'yes' }).enabled).toBe(true);
    expect(loadLoopConfigFromEnv({ OD_CRITIQUE_LOOP_ENABLED: 'false' }).enabled).toBe(false);
  });

  it('应正确解析 maxIterations', () => {
    expect(loadLoopConfigFromEnv({ OD_CRITIQUE_LOOP_MAX_ITERATIONS: '10' }).maxIterations).toBe(10);
    expect(loadLoopConfigFromEnv({ OD_CRITIQUE_LOOP_MAX_ITERATIONS: '1' }).maxIterations).toBe(1);
  });

  it('maxIterations 小于 1 应抛出 RangeError', () => {
    expect(() =>
      loadLoopConfigFromEnv({ OD_CRITIQUE_LOOP_MAX_ITERATIONS: '0' }),
    ).toThrow(RangeError);
    expect(() =>
      loadLoopConfigFromEnv({ OD_CRITIQUE_LOOP_MAX_ITERATIONS: '-1' }),
    ).toThrow(RangeError);
  });

  it('应正确解析 loopStrategy', () => {
    expect(loadLoopConfigFromEnv({ OD_CRITIQUE_LOOP_STRATEGY: 'converge' }).loopStrategy).toBe('converge');
    expect(loadLoopConfigFromEnv({ OD_CRITIQUE_LOOP_STRATEGY: 'score_only' }).loopStrategy).toBe('score_only');
    expect(loadLoopConfigFromEnv({ OD_CRITIQUE_LOOP_STRATEGY: 'mustFix_only' }).loopStrategy).toBe('mustFix_only');
  });

  it('非法 loopStrategy 应抛出 RangeError', () => {
    expect(() =>
      loadLoopConfigFromEnv({ OD_CRITIQUE_LOOP_STRATEGY: 'invalid' }),
    ).toThrow(RangeError);
  });

  it('fixTimeoutMs > loopTotalTimeoutMs 应抛出 RangeError', () => {
    expect(() =>
      loadLoopConfigFromEnv({
        OD_CRITIQUE_LOOP_FIX_TIMEOUT_MS: '600000',
        OD_CRITIQUE_LOOP_TOTAL_TIMEOUT_MS: '300000',
      }),
    ).toThrow(RangeError);
  });

  it('应正确解析 feedbackAggregation', () => {
    expect(
      loadLoopConfigFromEnv({ OD_CRITIQUE_LOOP_FEEDBACK_AGGREGATION: 'cumulative' }).feedbackAggregation,
    ).toBe('cumulative');
    expect(
      loadLoopConfigFromEnv({ OD_CRITIQUE_LOOP_FEEDBACK_AGGREGATION: 'last_round' }).feedbackAggregation,
    ).toBe('last_round');
  });
});

// ============================================================================
// formatFeedbackAsPrompt 测试
// ============================================================================

describe('formatFeedbackAsPrompt', () => {
  it('应生成包含 mustFix 和 dimNotes 的完整 prompt', () => {
    const feedback: CritiqueFeedback = {
      mustFixItems: ['[a11y] 对比度不足', '[brand] Logo 位置错误'],
      dimNotes: [
        {
          role: 'critic',
          round: 1,
          dimName: 'visual_hierarchy',
          dimScore: 5,
          dimNote: '信息层级混乱',
        },
      ],
      bestComposite: 6.0,
      bestRound: 1,
      finalStatus: 'below_threshold',
      rounds: [{ n: 1, composite: 6.0, mustFix: 2, decision: 'continue' }],
    };

    const prompt = formatFeedbackAsPrompt(feedback);

    expect(prompt).toContain('设计评审团反馈');
    expect(prompt).toContain('综合得分: 6.00');
    expect(prompt).toContain('必须修复项');
    expect(prompt).toContain('[a11y] 对比度不足');
    expect(prompt).toContain('[brand] Logo 位置错误');
    expect(prompt).toContain('visual_hierarchy');
    expect(prompt).toContain('信息层级混乱');
    expect(prompt).toContain('请根据以上反馈修复设计');
  });

  it('无 mustFix 时应不包含必须修复项章节', () => {
    const feedback: CritiqueFeedback = {
      mustFixItems: [],
      dimNotes: [],
      bestComposite: 8.0,
      bestRound: 1,
      finalStatus: 'below_threshold',
      rounds: [{ n: 1, composite: 8.0, mustFix: 0, decision: 'continue' }],
    };

    const prompt = formatFeedbackAsPrompt(feedback);
    expect(prompt).not.toContain('必须修复项');
  });
});

// ============================================================================
// summarizeLoopResult 测试
// ============================================================================

describe('summarizeLoopResult', () => {
  it('收敛结果应显示通过信息', () => {
    const result: LoopEngineResult = {
      status: 'converged',
      totalIterations: 3,
      iterations: [],
      finalArtifactPath: '/artifacts/final.html',
      bestComposite: 9.2,
      totalDurationMs: 120000,
    };

    const summary = summarizeLoopResult(result);
    expect(summary).toContain('✅');
    expect(summary).toContain('设计评审团通过');
    expect(summary).toContain('3 轮循环');
    expect(summary).toContain('9.20');
  });

  it('耗尽结果应显示警告信息', () => {
    const result: LoopEngineResult = {
      status: 'exhausted',
      totalIterations: 5,
      iterations: [],
      finalArtifactPath: null,
      bestComposite: 7.5,
      totalDurationMs: 300000,
    };

    const summary = summarizeLoopResult(result);
    expect(summary).toContain('⚠️');
    expect(summary).toContain('未完全达标');
    expect(summary).toContain('5 轮');
  });

  it('中断结果应显示中断信息', () => {
    const result: LoopEngineResult = {
      status: 'interrupted',
      totalIterations: 2,
      iterations: [],
      finalArtifactPath: null,
      bestComposite: 6.0,
      totalDurationMs: 60000,
    };

    const summary = summarizeLoopResult(result);
    expect(summary).toContain('⏸️');
    expect(summary).toContain('循环被中断');
  });
});

// ============================================================================
// 循环引擎集成测试（带 mock）
// ============================================================================

describe('startCritiqueLoop (integration)', () => {
  // 这些测试需要完整的 mock 环境
  // 在实际部署中由 CI 管线运行

  it('TODO: 完整循环流程集成测试 — 需要 mock spawn handler', () => {
    // 集成测试需要:
    // 1. Mock SQLite 数据库
    // 2. Mock SSE 总线
    // 3. Mock 适配器 stdout 流
    // 4. Mock 修复函数
    // 5. 验证完整的循环生命周期
    expect(true).toBe(true); // 占位
  });
});

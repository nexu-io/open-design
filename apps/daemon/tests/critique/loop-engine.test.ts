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
 * 运行: vitest apps/daemon/tests/critique/loop-engine.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { startCritiqueLoop, type LoopEngineResult } from '../../src/critique/loop-engine.js';
import { runOrchestrator } from '../../src/critique/orchestrator.js';
import { extractFeedbackFromEvents, type CritiqueFeedback } from '../../src/critique/loop-feedback.js';
import { loadLoopConfigFromEnv } from '../../src/critique/config-loop.js';
import {
  formatFeedbackAsPrompt,
  runOrchestratorWithLoop,
  summarizeLoopResult,
} from '../../src/critique/orchestrator-loop.js';
import { defaultCritiqueConfig, type PanelEvent } from '@open-design/contracts/critique';
import { defaultCritiqueLoopConfig } from '../../src/critique/loop-types.js';

vi.mock('../../src/critique/orchestrator.js', () => ({
  runOrchestrator: vi.fn(),
}));

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

describe('startCritiqueLoop', () => {
  it('为下一轮创建真实资源并传入上一轮评审反馈', async () => {
    const firstEvents: PanelEvent[] = [
      {
        type: 'panelist_must_fix' as const,
        runId: 'first-run',
        round: 1,
        role: 'a11y',
        text: '缺少替代文本',
      },
      {
        type: 'panelist_dim' as const,
        runId: 'first-run',
        round: 1,
        role: 'critic',
        dimName: 'visual_hierarchy',
        dimScore: 5,
        dimNote: '需要强化主次层级',
      },
    ];
    const createIteration = vi.fn((
      iteration: number,
      _feedback: CritiqueFeedback | null,
      _runId: string,
    ) => ({
      stdout: (async function* () {})(),
      child: { kill: vi.fn() },
      childExitPromise: Promise.resolve({ code: 0, signal: null }),
    }));
    const runOrchestratorMock = vi.mocked(runOrchestrator);
    runOrchestratorMock
      .mockResolvedValueOnce({
        status: 'below_threshold',
        composite: 6,
        rounds: [{ n: 1, composite: 6, mustFix: 1, decision: 'continue' }],
        events: firstEvents,
        transcriptPath: null,
        artifactPath: null,
      })
      .mockResolvedValueOnce({
        status: 'shipped',
        composite: 9,
        rounds: [{ n: 1, composite: 9, mustFix: 0, decision: 'ship' }],
        events: [],
        transcriptPath: null,
        artifactPath: '/artifacts/final.html',
      });

    try {
      const result = await startCritiqueLoop({
        loopCfg: { ...defaultCritiqueLoopConfig(), enabled: true, maxIterations: 2 },
        critiqueCfg: { ...defaultCritiqueConfig(), scoreThreshold: 8 },
        db: {} as never,
        bus: { emit: vi.fn() },
        projectId: 'project-1',
        artifactDir: '/artifacts',
        projectDir: '/missing-project-dir',
        adapter: 'test',
        skill: 'test-skill',
        createIteration,
      });

      expect(result.status).toBe('converged');
      expect(createIteration).toHaveBeenCalledTimes(2);
      expect(createIteration).toHaveBeenNthCalledWith(1, 1, null, expect.any(String));
      expect(createIteration).toHaveBeenNthCalledWith(
        2,
        2,
        expect.objectContaining({
          mustFixItems: ['[a11y] 缺少替代文本'],
          dimNotes: [expect.objectContaining({ dimName: 'visual_hierarchy' })],
        }),
        expect.any(String),
      );
      expect(createIteration.mock.calls[0]?.[2]).not.toBe(createIteration.mock.calls[1]?.[2]);
    } finally {
      runOrchestratorMock.mockReset();
    }
  });

  it.each([
    {
      strategy: 'converge' as const,
      composite: 9,
      mustFix: 1,
      expected: 'exhausted',
    },
    {
      strategy: 'score_only' as const,
      composite: 9,
      mustFix: 1,
      expected: 'converged',
    },
    {
      strategy: 'mustFix_only' as const,
      composite: 5,
      mustFix: 0,
      expected: 'converged',
    },
  ])('按 $strategy 判定收敛条件', async ({ strategy, composite, mustFix, expected }) => {
    vi.mocked(runOrchestrator).mockResolvedValueOnce({
      status: 'below_threshold',
      composite,
      rounds: [{ n: 1, composite, mustFix, decision: 'continue' }],
      events: [],
      transcriptPath: null,
      artifactPath: '/artifacts/candidate.html',
    });

    const result = await startCritiqueLoop({
      loopCfg: {
        ...defaultCritiqueLoopConfig(),
        enabled: true,
        maxIterations: 1,
        loopStrategy: strategy,
      },
      critiqueCfg: { ...defaultCritiqueConfig(), scoreThreshold: 8 },
      db: {} as never,
      bus: { emit: vi.fn() },
      projectId: 'project-strategy',
      artifactDir: '/artifacts',
      projectDir: '/missing-project-dir',
      adapter: 'test',
      skill: 'test-skill',
      createIteration: () => ({
        stdout: (async function* () {})(),
        child: { kill: vi.fn() },
        childExitPromise: Promise.resolve({ code: 0, signal: null }),
      }),
    });

    expect(result.status).toBe(expected);
    vi.mocked(runOrchestrator).mockReset();
  });

  it.each([
    ['interrupted', 'interrupted'],
    ['timed_out', 'timed_out'],
    ['degraded', 'degraded'],
    ['failed', 'failed'],
  ] as const)('保留编排器终态 %s', async (orchestratorStatus, expectedStatus) => {
    vi.mocked(runOrchestrator).mockResolvedValueOnce({
      status: orchestratorStatus,
      composite: null,
      rounds: [],
      events: [],
      transcriptPath: null,
      artifactPath: null,
    });

    const result = await startCritiqueLoop({
      loopCfg: { ...defaultCritiqueLoopConfig(), enabled: true, maxIterations: 2 },
      critiqueCfg: defaultCritiqueConfig(),
      db: {} as never,
      bus: { emit: vi.fn() },
      projectId: 'project-terminal',
      artifactDir: '/artifacts',
      projectDir: '/missing-project-dir',
      adapter: 'test',
      skill: 'test-skill',
      createIteration: () => ({
        stdout: (async function* () {})(),
        child: { kill: vi.fn() },
        childExitPromise: Promise.resolve({ code: 0, signal: null }),
      }),
    });

    expect(result.status).toBe(expectedStatus);
    vi.mocked(runOrchestrator).mockReset();
  });

  it('后续迭代异常时返回 failed，而不是把上一轮误报为 exhausted', async () => {
    vi.mocked(runOrchestrator).mockResolvedValueOnce({
      status: 'below_threshold',
      composite: 6,
      rounds: [{ n: 1, composite: 6, mustFix: 1, decision: 'continue' }],
      events: [],
      transcriptPath: null,
      artifactPath: null,
    });
    const createIteration = vi.fn((
      iteration: number,
      _feedback: CritiqueFeedback | null,
      _runId: string,
    ) => {
      if (iteration === 2) throw new Error('spawn failed');
      return {
        stdout: (async function* () {})(),
        child: { kill: vi.fn() },
        childExitPromise: Promise.resolve({ code: 0, signal: null }),
      };
    });

    const result = await startCritiqueLoop({
      loopCfg: { ...defaultCritiqueLoopConfig(), enabled: true, maxIterations: 2 },
      critiqueCfg: defaultCritiqueConfig(),
      db: {} as never,
      bus: { emit: vi.fn() },
      projectId: 'project-failure',
      artifactDir: '/artifacts',
      projectDir: '/missing-project-dir',
      adapter: 'test',
      skill: 'test-skill',
      createIteration,
    });

    expect(result.status).toBe('failed');
    vi.mocked(runOrchestrator).mockReset();
  });

  it.each([
    ['cumulative', ['[a11y] 第一轮问题', '[brand] 第二轮问题']],
    ['last_round', ['[brand] 第二轮问题']],
  ] as const)('%s 反馈聚合模式按配置传递历史问题', async (feedbackAggregation, expectedItems) => {
    const results = [
      {
        status: 'below_threshold' as const,
        composite: 5,
        rounds: [{ n: 1, composite: 5, mustFix: 1, decision: 'continue' as const }],
        events: [{
          type: 'panelist_must_fix' as const,
          runId: 'run-1',
          round: 1,
          role: 'a11y' as const,
          text: '第一轮问题',
        }],
        transcriptPath: null,
        artifactPath: null,
      },
      {
        status: 'below_threshold' as const,
        composite: 6,
        rounds: [{ n: 1, composite: 6, mustFix: 1, decision: 'continue' as const }],
        events: [{
          type: 'panelist_must_fix' as const,
          runId: 'run-2',
          round: 1,
          role: 'brand' as const,
          text: '第二轮问题',
        }],
        transcriptPath: null,
        artifactPath: null,
      },
      {
        status: 'shipped' as const,
        composite: 9,
        rounds: [{ n: 1, composite: 9, mustFix: 0, decision: 'ship' as const }],
        events: [],
        transcriptPath: null,
        artifactPath: '/artifacts/final.html',
      },
    ];
    vi.mocked(runOrchestrator)
      .mockResolvedValueOnce(results[0]!)
      .mockResolvedValueOnce(results[1]!)
      .mockResolvedValueOnce(results[2]!);
    const feedbackByIteration = new Map<number, CritiqueFeedback | null>();

    const result = await startCritiqueLoop({
      loopCfg: {
        ...defaultCritiqueLoopConfig(),
        enabled: true,
        maxIterations: 3,
        feedbackAggregation,
      },
      critiqueCfg: defaultCritiqueConfig(),
      db: {} as never,
      bus: { emit: vi.fn() },
      projectId: 'project-feedback',
      artifactDir: '/artifacts',
      projectDir: '/missing-project-dir',
      adapter: 'test',
      skill: 'test-skill',
      createIteration: (iteration, feedback) => {
        feedbackByIteration.set(iteration, feedback);
        return {
          stdout: (async function* () {})(),
          child: { kill: vi.fn() },
          childExitPromise: Promise.resolve({ code: 0, signal: null }),
        };
      },
    });

    expect(result.status).toBe('converged');
    expect(feedbackByIteration.get(3)?.mustFixItems).toEqual(expectedItems);
    vi.mocked(runOrchestrator).mockReset();
  });

  it('单轮超时取 critique 与 loop 配置的较小值', async () => {
    vi.mocked(runOrchestrator).mockResolvedValueOnce({
      status: 'failed',
      composite: null,
      rounds: [],
      events: [],
      transcriptPath: null,
      artifactPath: null,
    });

    await startCritiqueLoop({
      loopCfg: {
        ...defaultCritiqueLoopConfig(),
        enabled: true,
        fixTimeoutMs: 12_000,
      },
      critiqueCfg: {
        ...defaultCritiqueConfig(),
        perRoundTimeoutMs: 20_000,
        totalTimeoutMs: 30_000,
      },
      db: {} as never,
      bus: { emit: vi.fn() },
      projectId: 'project-timeout',
      artifactDir: '/artifacts',
      projectDir: '/missing-project-dir',
      adapter: 'test',
      skill: 'test-skill',
      createIteration: () => ({
        stdout: (async function* () {})(),
        child: { kill: vi.fn() },
        childExitPromise: Promise.resolve({ code: 0, signal: null }),
      }),
    });

    expect(vi.mocked(runOrchestrator)).toHaveBeenCalledWith(expect.objectContaining({
      cfg: expect.objectContaining({
        perRoundTimeoutMs: 12_000,
        totalTimeoutMs: 12_000,
      }),
    }));
    vi.mocked(runOrchestrator).mockReset();
  });

  it('循环总时限耗尽后不再创建下一轮资源', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.mocked(runOrchestrator).mockImplementationOnce(async () => {
      vi.setSystemTime(1_001);
      return {
        status: 'below_threshold',
        composite: 5,
        rounds: [{ n: 1, composite: 5, mustFix: 1, decision: 'continue' }],
        events: [],
        transcriptPath: null,
        artifactPath: null,
      };
    });
    const createIteration = vi.fn(() => ({
      stdout: (async function* () {})(),
      child: { kill: vi.fn() },
      childExitPromise: Promise.resolve({ code: 0, signal: null }),
    }));

    try {
      const result = await startCritiqueLoop({
        loopCfg: {
          ...defaultCritiqueLoopConfig(),
          enabled: true,
          maxIterations: 3,
          loopTotalTimeoutMs: 1_000,
        },
        critiqueCfg: defaultCritiqueConfig(),
        db: {} as never,
        bus: { emit: vi.fn() },
        projectId: 'project-total-timeout',
        artifactDir: '/artifacts',
        projectDir: '/missing-project-dir',
        adapter: 'test',
        skill: 'test-skill',
        createIteration,
      });

      expect(result.status).toBe('timed_out');
      expect(createIteration).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      vi.mocked(runOrchestrator).mockReset();
    }
  });
});

describe('runOrchestratorWithLoop', () => {
  it('禁用循环时只创建首轮资源并保留外层 runId', async () => {
    vi.mocked(runOrchestrator).mockResolvedValueOnce({
      status: 'shipped',
      composite: 9,
      rounds: [{ n: 1, composite: 9, mustFix: 0, decision: 'ship' }],
      events: [],
      transcriptPath: '/artifacts/transcript.ndjson',
      artifactPath: '/artifacts/final.html',
    });
    const createIteration = vi.fn(() => ({
      stdout: (async function* () {})(),
      child: { kill: vi.fn() },
      childExitPromise: Promise.resolve({ code: 0, signal: null }),
    }));

    const result = await runOrchestratorWithLoop({
      runId: 'outer-run',
      projectId: 'project-disabled',
      conversationId: null,
      artifactId: 'artifact-disabled',
      artifactDir: '/artifacts',
      adapter: 'test',
      cfg: defaultCritiqueConfig(),
      db: {} as never,
      bus: { emit: vi.fn() },
      loopCfg: { ...defaultCritiqueLoopConfig(), enabled: false },
      projectDir: '/missing-project-dir',
      createIteration,
    });

    expect(result.status).toBe('shipped');
    expect(createIteration).toHaveBeenCalledOnce();
    expect(createIteration).toHaveBeenCalledWith(1, null, 'outer-run');
    vi.mocked(runOrchestrator).mockReset();
  });

  it('启用循环时不压平 interrupted 终态和最后一轮详情', async () => {
    const interruptedEvent: PanelEvent = {
      type: 'interrupted',
      runId: 'iteration-run',
      bestRound: 1,
      composite: 6,
    };
    vi.mocked(runOrchestrator).mockResolvedValueOnce({
      status: 'interrupted',
      composite: 6,
      rounds: [{ n: 1, composite: 6, mustFix: 1, decision: 'continue' }],
      events: [interruptedEvent],
      transcriptPath: '/artifacts/transcript.ndjson',
      artifactPath: '/artifacts/candidate.html',
    });

    const result = await runOrchestratorWithLoop({
      runId: 'outer-run',
      projectId: 'project-interrupted',
      conversationId: null,
      artifactId: 'artifact-interrupted',
      artifactDir: '/artifacts',
      adapter: 'test',
      cfg: defaultCritiqueConfig(),
      db: {} as never,
      bus: { emit: vi.fn() },
      loopCfg: { ...defaultCritiqueLoopConfig(), enabled: true },
      projectDir: '/missing-project-dir',
      createIteration: () => ({
        stdout: (async function* () {})(),
        child: { kill: vi.fn() },
        childExitPromise: Promise.resolve({ code: 0, signal: null }),
      }),
    });

    expect(result).toMatchObject({
      status: 'interrupted',
      composite: 6,
      rounds: [{ n: 1, composite: 6, mustFix: 1 }],
      events: [interruptedEvent],
      transcriptPath: '/artifacts/transcript.ndjson',
      artifactPath: '/artifacts/candidate.html',
    });
    vi.mocked(runOrchestrator).mockReset();
  });

  it('经验持久化失败时不覆盖已经收敛的主结果', async () => {
    vi.mocked(runOrchestrator)
      .mockResolvedValueOnce({
        status: 'below_threshold',
        composite: 6,
        rounds: [{ n: 1, composite: 6, mustFix: 1, decision: 'continue' }],
        events: [],
        transcriptPath: null,
        artifactPath: '/artifacts/candidate.html',
      })
      .mockResolvedValueOnce({
        status: 'shipped',
        composite: 9,
        rounds: [{ n: 1, composite: 9, mustFix: 0, decision: 'ship' }],
        events: [],
        transcriptPath: '/artifacts/transcript.ndjson',
        artifactPath: '/artifacts/final.html',
      });

    try {
      await expect(runOrchestratorWithLoop({
        runId: 'outer-run',
        projectId: 'project-memory-failure',
        conversationId: null,
        artifactId: 'artifact-memory-failure',
        artifactDir: '/artifacts',
        adapter: 'test',
        cfg: defaultCritiqueConfig(),
        db: {} as never,
        bus: { emit: vi.fn() },
        loopCfg: { ...defaultCritiqueLoopConfig(), enabled: true, maxIterations: 2 },
        projectDir: '/missing-project-dir',
        createIteration: () => ({
          stdout: (async function* () {})(),
          child: { kill: vi.fn() },
          childExitPromise: Promise.resolve({ code: 0, signal: null }),
        }),
      })).resolves.toMatchObject({
        status: 'shipped',
        artifactPath: '/artifacts/final.html',
      });
    } finally {
      vi.mocked(runOrchestrator).mockReset();
    }
  });
});

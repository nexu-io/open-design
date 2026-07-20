/**
 * Loop Engine 生命周期集成测试
 *
 * 测试策略执行（converge / score_only / mustFix_only）、反馈累积、
 * 收敛判定、max iterations 耗尽和错误传播。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- mock orchestrator ----
const runOrchestratorMock = vi.fn();
vi.mock('../../src/critique/orchestrator.js', () => ({
  runOrchestrator: (...args: unknown[]) => runOrchestratorMock(...args),
}));

import { startCritiqueLoop, type FixFunction } from '../../src/critique/loop-engine.js';
import { extractFeedbackFromEvents } from '../../src/critique/loop-feedback.js';
import {
  type CritiqueLoopConfig,
  type CritiqueFeedback,
  defaultCritiqueLoopConfig,
} from '../../src/critique/loop-types.js';
import type { OrchestratorResult } from '../../src/critique/orchestrator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLoopCfg(overrides: Partial<CritiqueLoopConfig> = {}): CritiqueLoopConfig {
  return { ...defaultCritiqueLoopConfig(), enabled: true, maxIterations: 3, ...overrides };
}

function makeCritiqueCfg(scoreThreshold = 50) {
  return {
    enabled: true,
    maxRounds: 3,
    scoreThreshold,
    scoreScale: 100,
    perRoundTimeoutMs: 60_000,
    totalTimeoutMs: 300_000,
    parserMaxBlockBytes: 256_000,
    fallbackPolicy: 'abort' as const,
  };
}

/** 构造一个简单的 OrchestratorResult */
function orchResult(
  status: OrchestratorResult['status'],
  composite: number | null,
  mustFix: number,
  dims: number = 0,
  artifactPath: string | null = '/tmp/art.html',
): OrchestratorResult {
  const rounds = (mustFix > 0 || dims > 0)
    ? [
        {
          mustFix,
          mustFixDetail: Array.from({ length: mustFix }, (_, i) => `fix-issue-${i + 1}`),
          dimNotes: Array.from({ length: dims }, (_, i) => `dim-note-${i + 1}`),
        },
      ]
    : [];
  return {
    status,
    composite,
    rounds: rounds as OrchestratorResult['rounds'],
    transcriptPath: null,
    artifactPath,
  };
}

/** 构造 feedback */
function mkFeedback(mustFixItems: string[], dimNotes: string[] = []): CritiqueFeedback {
  return { mustFixItems, dimNotes, overallStatus: 'below_threshold' };
}

/** 无操作 fix */
const noopFix: FixFunction = () =>
  Promise.resolve({ artifactContent: '<html></html>', artifactMime: 'text/html' });

/** 同步 stdout 迭代器 */
async function* syncStdout(lines: string[]) {
  for (const line of lines) yield line;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeDb = { exec: vi.fn(), pragma: vi.fn() } as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeBus = { emit: vi.fn() } as any;

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 收敛判定 — converge strategy
// ---------------------------------------------------------------------------

describe('收敛判定 (converge strategy)', () => {
  it('分数达标且零 mustFix → 立即收敛', async () => {
    runOrchestratorMock.mockResolvedValueOnce(orchResult('shipped', 90, 0));

    const result = await startCritiqueLoop({
      loopCfg: makeLoopCfg({ loopStrategy: 'converge', maxIterations: 3 }),
      critiqueCfg: makeCritiqueCfg(50),
      fixFn: noopFix,
      db: fakeDb,
      bus: fakeBus,
      projectId: 'p1',
      artifactDir: '/tmp/art',
      adapter: 'gemini',
      createStdout: () => syncStdout([]),
    });

    expect(result.status).toBe('converged');
    expect(result.totalIterations).toBe(1);
    expect(result.iterations[0].converged).toBe(true);
  });

  it('分数达标但仍有 mustFix → 不收敛，触发重试', async () => {
    runOrchestratorMock
      .mockResolvedValueOnce(orchResult('shipped', 90, 2))   // i1: shipped + mustFix
      .mockResolvedValueOnce(orchResult('shipped', 95, 0));  // i2: 修复后通过

    const result = await startCritiqueLoop({
      loopCfg: makeLoopCfg({ loopStrategy: 'converge', maxIterations: 3 }),
      critiqueCfg: makeCritiqueCfg(50),
      fixFn: noopFix,
      db: fakeDb,
      bus: fakeBus,
      projectId: 'p1',
      artifactDir: '/tmp/art',
      adapter: 'gemini',
      createStdout: () => syncStdout([]),
    });

    expect(result.status).toBe('converged');
    expect(result.totalIterations).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 收敛判定 — score_only strategy
// ---------------------------------------------------------------------------

describe('收敛判定 (score_only strategy)', () => {
  it('分数达标 → 收敛（忽略 mustFix）', async () => {
    runOrchestratorMock.mockResolvedValueOnce(orchResult('shipped', 90, 3));

    const result = await startCritiqueLoop({
      loopCfg: makeLoopCfg({ loopStrategy: 'score_only', maxIterations: 5 }),
      critiqueCfg: makeCritiqueCfg(50),
      fixFn: noopFix,
      db: fakeDb,
      bus: fakeBus,
      projectId: 'p2',
      artifactDir: '/tmp/art',
      adapter: 'gemini',
      createStdout: () => syncStdout([]),
    });

    // score_only: mustFix 不阻塞收敛
    expect(result.status).toBe('converged');
    expect(result.totalIterations).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 收敛判定 — mustFix_only strategy
// ---------------------------------------------------------------------------

describe('收敛判定 (mustFix_only strategy)', () => {
  it('分数不达标但是零 mustFix → 收敛', async () => {
    runOrchestratorMock.mockResolvedValueOnce(orchResult('shipped', 30, 0));

    const result = await startCritiqueLoop({
      loopCfg: makeLoopCfg({ loopStrategy: 'mustFix_only', maxIterations: 3 }),
      critiqueCfg: makeCritiqueCfg(50),
      fixFn: noopFix,
      db: fakeDb,
      bus: fakeBus,
      projectId: 'p3',
      artifactDir: '/tmp/art',
      adapter: 'gemini',
      createStdout: () => syncStdout([]),
    });

    // mustFix_only: 分数不达标但 mustFix=0 → 通过
    expect(result.status).toBe('converged');
  });

  it('分数很高但仍有 mustFix → 不收敛', async () => {
    runOrchestratorMock
      .mockResolvedValueOnce(orchResult('shipped', 99, 1))
      .mockResolvedValueOnce(orchResult('shipped', 99, 0));

    const result = await startCritiqueLoop({
      loopCfg: makeLoopCfg({ loopStrategy: 'mustFix_only', maxIterations: 3 }),
      critiqueCfg: makeCritiqueCfg(50),
      fixFn: noopFix,
      db: fakeDb,
      bus: fakeBus,
      projectId: 'p3',
      artifactDir: '/tmp/art',
      adapter: 'gemini',
      createStdout: () => syncStdout([]),
    });

    // mustFix_only: 第一轮有 mustFix → 重试
    expect(result.status).toBe('converged');
    expect(result.totalIterations).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 重试判定
// ---------------------------------------------------------------------------

describe('重试判定 (strategy-based)', () => {
  it('converge: below_threshold → 重试直到收敛', async () => {
    runOrchestratorMock
      .mockResolvedValueOnce(orchResult('below_threshold', 30, 1))
      .mockResolvedValueOnce(orchResult('shipped', 85, 0));

    const result = await startCritiqueLoop({
      loopCfg: makeLoopCfg({ loopStrategy: 'converge', maxIterations: 3 }),
      critiqueCfg: makeCritiqueCfg(50),
      fixFn: noopFix,
      db: fakeDb,
      bus: fakeBus,
      projectId: 'p1',
      artifactDir: '/tmp/art',
      adapter: 'gemini',
      createStdout: () => syncStdout([]),
    });

    expect(result.status).toBe('converged');
    expect(result.totalIterations).toBe(2);
  });

  it('score_only: below_threshold 触发重试，mustFix 不阻塞', async () => {
    runOrchestratorMock
      .mockResolvedValueOnce(orchResult('below_threshold', 30, 5))
      .mockResolvedValueOnce(orchResult('shipped', 80, 5)); // shipped+高分+仍有mustFix

    const result = await startCritiqueLoop({
      loopCfg: makeLoopCfg({ loopStrategy: 'score_only', maxIterations: 3 }),
      critiqueCfg: makeCritiqueCfg(50),
      fixFn: noopFix,
      db: fakeDb,
      bus: fakeBus,
      projectId: 'p1',
      artifactDir: '/tmp/art',
      adapter: 'gemini',
      createStdout: () => syncStdout([]),
    });

    // score_only: 分数达标就收敛
    expect(result.status).toBe('converged');
    expect(result.totalIterations).toBe(2);
  });

  it('mustFix_only: below_threshold 不触发重试，但 mustFix 触发', async () => {
    runOrchestratorMock
      .mockResolvedValueOnce(orchResult('shipped', 30, 2))   // shipped 但 mustFix
      .mockResolvedValueOnce(orchResult('shipped', 40, 0));  // 修复完成

    const result = await startCritiqueLoop({
      loopCfg: makeLoopCfg({ loopStrategy: 'mustFix_only', maxIterations: 3 }),
      critiqueCfg: makeCritiqueCfg(50),
      fixFn: noopFix,
      db: fakeDb,
      bus: fakeBus,
      projectId: 'p1',
      artifactDir: '/tmp/art',
      adapter: 'gemini',
      createStdout: () => syncStdout([]),
    });

    expect(result.status).toBe('converged');
    expect(result.totalIterations).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 最大迭代耗尽
// ---------------------------------------------------------------------------

describe('最大迭代耗尽', () => {
  it('永远不收敛 → exhausted', async () => {
    // 每次返回 below_threshold，永不收敛
    runOrchestratorMock.mockResolvedValue(orchResult('below_threshold', 30, 3));

    const result = await startCritiqueLoop({
      loopCfg: makeLoopCfg({ loopStrategy: 'converge', maxIterations: 3 }),
      critiqueCfg: makeCritiqueCfg(50),
      fixFn: noopFix,
      db: fakeDb,
      bus: fakeBus,
      projectId: 'p1',
      artifactDir: '/tmp/art',
      adapter: 'gemini',
      createStdout: () => syncStdout([]),
    });

    expect(result.status).toBe('exhausted');
    expect(result.totalIterations).toBe(3);
  });

  it('degraded 状态终止', async () => {
    runOrchestratorMock.mockResolvedValueOnce(orchResult('degraded', 10, 1));

    const result = await startCritiqueLoop({
      loopCfg: makeLoopCfg({ loopStrategy: 'converge', maxIterations: 5 }),
      critiqueCfg: makeCritiqueCfg(50),
      fixFn: noopFix,
      db: fakeDb,
      bus: fakeBus,
      projectId: 'p1',
      artifactDir: '/tmp/art',
      adapter: 'gemini',
      createStdout: () => syncStdout([]),
    });

    expect(result.status).toBe('exhausted');
    expect(result.totalIterations).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 反馈累积 (feedbackAggregation)
// ---------------------------------------------------------------------------

describe('反馈累积', () => {
  it('cumulative: 反馈不丢失，传递给 fixFn', async () => {
    const fixSpy = vi.fn(noopFix);

    runOrchestratorMock
      .mockResolvedValueOnce(orchResult('shipped', 90, 2, 1))
      .mockResolvedValueOnce(orchResult('shipped', 95, 0, 0));

    const result = await startCritiqueLoop({
      loopCfg: makeLoopCfg({
        loopStrategy: 'converge',
        feedbackAggregation: 'cumulative',
        maxIterations: 3,
      }),
      critiqueCfg: makeCritiqueCfg(50),
      fixFn: fixSpy,
      db: fakeDb,
      bus: fakeBus,
      projectId: 'p1',
      artifactDir: '/tmp/art',
      adapter: 'gemini',
      createStdout: () => syncStdout([]),
    });

    expect(result.status).toBe('converged');
    // fixFn 被调用了一次（第二轮触发）
    expect(fixSpy).toHaveBeenCalledTimes(1);
    const feedback = fixSpy.mock.calls[0][0] as CritiqueFeedback;
    expect(feedback.mustFixItems.length).toBe(2);
    expect(feedback.dimNotes.length).toBe(1);
  });

  it('last_round: 只传递最新一轮反馈', async () => {
    const fixSpy = vi.fn(noopFix);

    runOrchestratorMock
      .mockResolvedValueOnce(orchResult('shipped', 90, 2, 1))
      .mockResolvedValueOnce(orchResult('below_threshold', 40, 1, 0))
      .mockResolvedValueOnce(orchResult('shipped', 95, 0, 0));

    const result = await startCritiqueLoop({
      loopCfg: makeLoopCfg({
        loopStrategy: 'converge',
        feedbackAggregation: 'last_round',
        maxIterations: 5,
      }),
      critiqueCfg: makeCritiqueCfg(50),
      fixFn: fixSpy,
      db: fakeDb,
      bus: fakeBus,
      projectId: 'p1',
      artifactDir: '/tmp/art',
      adapter: 'gemini',
      createStdout: () => syncStdout([]),
    });

    expect(result.status).toBe('converged');
    // fixFn called twice (after i1 and after i2)
    expect(fixSpy).toHaveBeenCalled();
    // last-round: i3 的 fix 只看到 i2 的 feedback
    const lastFeedback = fixSpy.mock.calls[fixSpy.mock.calls.length - 1][0] as CritiqueFeedback;
    expect(lastFeedback.mustFixItems.length).toBe(1);
  });

  it('none: 永远不会调用 fixFn', async () => {
    const fixSpy = vi.fn(noopFix);

    runOrchestratorMock
      .mockResolvedValueOnce(orchResult('shipped', 90, 2, 1))
      .mockResolvedValueOnce(orchResult('shipped', 95, 0, 0));

    await startCritiqueLoop({
      loopCfg: makeLoopCfg({
        loopStrategy: 'converge',
        feedbackAggregation: 'none',
        maxIterations: 3,
      }),
      critiqueCfg: makeCritiqueCfg(50),
      fixFn: fixSpy,
      db: fakeDb,
      bus: fakeBus,
      projectId: 'p1',
      artifactDir: '/tmp/art',
      adapter: 'gemini',
      createStdout: () => syncStdout([]),
    });

    // none → fixFn never triggers
    expect(fixSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 错误处理
// ---------------------------------------------------------------------------

describe('错误处理', () => {
  it('disabled config → 拒绝', async () => {
    await expect(
      startCritiqueLoop({
        loopCfg: makeLoopCfg({ enabled: false }),
        critiqueCfg: makeCritiqueCfg(50),
        fixFn: noopFix,
        db: fakeDb,
        bus: fakeBus,
        projectId: 'p1',
        artifactDir: '/tmp/art',
        adapter: 'gemini',
        createStdout: () => syncStdout([]),
      }),
    ).rejects.toThrow(/enabled must be true/);
  });

  it('maxIterations < 1 → 拒绝', async () => {
    await expect(
      startCritiqueLoop({
        loopCfg: makeLoopCfg({ maxIterations: 0 }),
        critiqueCfg: makeCritiqueCfg(50),
        fixFn: noopFix,
        db: fakeDb,
        bus: fakeBus,
        projectId: 'p1',
        artifactDir: '/tmp/art',
        adapter: 'gemini',
        createStdout: () => syncStdout([]),
      }),
    ).rejects.toThrow(/maxIterations/);
  });

  it('orbiter 异常 → failed', async () => {
    runOrchestratorMock.mockRejectedValueOnce(new Error('crash'));

    const result = await startCritiqueLoop({
      loopCfg: makeLoopCfg({ loopStrategy: 'converge', maxIterations: 3 }),
      critiqueCfg: makeCritiqueCfg(50),
      fixFn: noopFix,
      db: fakeDb,
      bus: fakeBus,
      projectId: 'p1',
      artifactDir: '/tmp/art',
      adapter: 'gemini',
      createStdout: () => syncStdout([]),
    });

    expect(result.status).toBe('failed');
  });

  it('fixFn 异常 → exhausted (已有历史)', async () => {
    runOrchestratorMock
      .mockResolvedValueOnce(orchResult('shipped', 90, 2))   // i1 触发 fix
      .mockResolvedValueOnce(orchResult('shipped', 95, 0));  // 不会到达

    const badFix: FixFunction = () => Promise.reject(new Error('fix crash'));

    const result = await startCritiqueLoop({
      loopCfg: makeLoopCfg({ loopStrategy: 'converge', maxIterations: 3 }),
      critiqueCfg: makeCritiqueCfg(50),
      fixFn: badFix,
      db: fakeDb,
      bus: fakeBus,
      projectId: 'p1',
      artifactDir: '/tmp/art',
      adapter: 'gemini',
      createStdout: () => syncStdout([]),
    });

    // i1 shipped + mustFix → i2 fix 失败 → exhausted
    expect(result.status).toBe('exhausted');
    expect(result.totalIterations).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// extractFeedbackFromEvents 单元测试
// ---------------------------------------------------------------------------

describe('extractFeedbackFromEvents', () => {
  it('从 rounds 中提取 mustFixDetail 和 dimNotes', () => {
    const rounds = [
      {
        mustFix: 2,
        mustFixDetail: ['背景色不符合 WCAG AA', '按钮没有 aria-label'],
        dimNotes: ['标题字号可以更大'],
      },
      {
        mustFix: 1,
        mustFixDetail: ['logo 图片 alt 缺失'],
        dimNotes: [],
      },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const feedback = extractFeedbackFromEvents([], rounds as any, 'shipped');
    expect(feedback.mustFixItems).toEqual([
      '背景色不符合 WCAG AA',
      '按钮没有 aria-label',
      'logo 图片 alt 缺失',
    ]);
    expect(feedback.dimNotes).toEqual(['标题字号可以更大']);
    expect(feedback.overallStatus).toBe('shipped');
  });

  it('空 rounds → 空反馈', () => {
    const feedback = extractFeedbackFromEvents([], [], 'shipped');
    expect(feedback.mustFixItems).toEqual([]);
    expect(feedback.dimNotes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// formatFeedbackForFixPrompt
// ---------------------------------------------------------------------------

import { formatFeedbackForFixPrompt } from '../../src/critique/loop-feedback.js';

describe('formatFeedbackForFixPrompt', () => {
  it('包含必须修复项和改进建议', () => {
    const prompt = formatFeedbackForFixPrompt(
      mkFeedback(['fix-1', 'fix-2'], ['dim-1']),
    );
    expect(prompt).toContain('CRITIQUE_FIX_CONTEXT');
    expect(prompt).toContain('fix-1');
    expect(prompt).toContain('fix-2');
    expect(prompt).toContain('dim-1');
    expect(prompt).toContain('必须修复');
    expect(prompt).toContain('质量改进建议');
  });

  it('无反馈项 → 不输出对应标题', () => {
    const prompt = formatFeedbackForFixPrompt(mkFeedback([]));
    expect(prompt).not.toContain('必须修复');
    expect(prompt).not.toContain('质量改进建议');
  });
});

// ---------------------------------------------------------------------------
// config-loop parseStrategy
// ---------------------------------------------------------------------------

import { loadLoopConfigFromEnv } from '../../src/critique/config-loop.js';

describe('config-loop parseStrategy', () => {
  it('默认 → converge', () => {
    const cfg = loadLoopConfigFromEnv({});
    expect(cfg.loopStrategy).toBe('converge');
  });

  it('environment → 接受 score_only', () => {
    const cfg = loadLoopConfigFromEnv({ OD_CRITIQUE_LOOP_STRATEGY: 'score_only' });
    expect(cfg.loopStrategy).toBe('score_only');
  });

  it('大小写不敏感 → mustFix_only', () => {
    const cfg = loadLoopConfigFromEnv({ OD_CRITIQUE_LOOP_STRATEGY: 'MustFix_Only' });
    expect(cfg.loopStrategy).toBe('mustFix_only');
  });

  it('非法 strategy → 抛出', () => {
    expect(() =>
      loadLoopConfigFromEnv({ OD_CRITIQUE_LOOP_STRATEGY: 'invalid' }),
    ).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// config-loop feedbackAggregation
// ---------------------------------------------------------------------------

describe('config-loop feedbackAggregation', () => {
  it('默认 → cumulative', () => {
    const cfg = loadLoopConfigFromEnv({});
    expect(cfg.feedbackAggregation).toBe('cumulative');
  });

  it('接受 last_round', () => {
    const cfg = loadLoopConfigFromEnv({
      OD_CRITIQUE_LOOP_FEEDBACK_AGGREGATION: 'last_round',
    });
    expect(cfg.feedbackAggregation).toBe('last_round');
  });

  it('接受 none', () => {
    const cfg = loadLoopConfigFromEnv({
      OD_CRITIQUE_LOOP_FEEDBACK_AGGREGATION: 'none',
    });
    expect(cfg.feedbackAggregation).toBe('none');
  });
});

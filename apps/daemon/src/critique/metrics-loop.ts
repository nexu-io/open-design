/**
 * Critique Loop Metrics — Prometheus 指标
 *
 * 所有指标前缀: od_critique_loop_
 *
 * 需合并到 apps/daemon/src/metrics/index.ts 中导出
 */

import { Counter, Histogram, Gauge } from 'prom-client';

/** 循环总次数 */
export const critiqueLoopTotal = new Counter({
  name: 'od_critique_loop_total',
  help: 'Total critique loops',
  labelNames: ['status', 'adapter', 'skill'],
});

/** 循环收敛次数 */
export const critiqueLoopConvergedTotal = new Counter({
  name: 'od_critique_loop_converged_total',
  help: 'Loops that converged (met standards)',
  labelNames: ['adapter', 'skill'],
});

/** 循环耗尽次数 */
export const critiqueLoopExhaustedTotal = new Counter({
  name: 'od_critique_loop_exhausted_total',
  help: 'Loops that exhausted max iterations',
  labelNames: ['adapter', 'skill', 'reason'],
});

/** 循环迭代总次数 */
export const critiqueLoopIterationsTotal = new Counter({
  name: 'od_critique_loop_iterations_total',
  help: 'Total loop iterations',
  labelNames: ['adapter', 'skill', 'iteration'],
});

/** 修复操作耗时 */
export const critiqueLoopFixDurationMs = new Histogram({
  name: 'od_critique_loop_fix_duration_ms',
  help: 'Fix operation duration in ms',
  labelNames: ['adapter', 'skill'],
  buckets: [5000, 15000, 30000, 60000, 120000, 300000, 600000],
});

/** 循环总耗时 */
export const critiqueLoopTotalDurationMs = new Histogram({
  name: 'od_critique_loop_total_duration_ms',
  help: 'Total loop duration in ms',
  labelNames: ['adapter', 'skill', 'status'],
  buckets: [30000, 60000, 120000, 300000, 600000, 900000, 1800000],
});

/** 循环启用状态 */
export const critiqueLoopEnabled = new Gauge({
  name: 'od_critique_loop_enabled',
  help: '1 if loop engineering is active',
  labelNames: ['enabled'],
});

/** 活跃循环数 */
export const critiqueLoopActiveCount = new Gauge({
  name: 'od_critique_loop_active_count',
  help: 'Number of active critique loops',
  labelNames: ['adapter'],
});

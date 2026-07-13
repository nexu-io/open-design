# Critique Theater Loop Engineering — 集成指南

> **功能**: 当用户启用设计评审团 (Design Jury) 时，如有评审问题，自动触发修复-重审循环，直到达到评审团标准。

## 概述

这是 Loop Engineering 范式在 Open Design 中的核心实现。当前 Critique Theater 已支持单次运行中的多轮评审，但缺少"评审发现问题 → 自动修复 → 重新提交"的闭环。本功能补全了这一环节。

## 新增文件清单

| 文件 | 路径 | 用途 |
|------|------|------|
| `loop-engine.ts` | `apps/daemon/src/critique/loop-engine.ts` | 核心循环引擎 |
| `orchestrator-loop.ts` | `apps/daemon/src/critique/orchestrator-loop.ts` | 编排器循环集成桥接 |
| `config-loop.ts` | `apps/daemon/src/critique/config-loop.ts` | 循环配置解析 |
| `persistence-loop.ts` | `apps/daemon/src/critique/persistence-loop.ts` | 循环数据持久化 |
| `metrics-loop.ts` | `apps/daemon/src/critique/metrics-loop.ts` | Prometheus 指标 |
| `critique-loop.ts` | `packages/contracts/src/critique-loop.ts` | 契约类型定义 |
| `loop-engine.test.ts` | `apps/daemon/src/critique/__tests__/loop-engine.test.ts` | 单元测试 |

## 需要修改的现有文件

### 1. `packages/contracts/src/critique.ts` — 添加循环配置

在 `CritiqueConfig` 接口中添加循环配置字段：

```ts
import type { CritiqueLoopConfig } from './critique-loop.js';

export interface CritiqueConfig {
  // ... 现有字段保持不变 ...
  
  /** 循环工程配置（v1.1+） */
  loop: CritiqueLoopConfig;
}
```

在 `defaultCritiqueConfig()` 中添加默认值：

```ts
import { defaultCritiqueLoopConfig } from './critique-loop.js';

export function defaultCritiqueConfig(): CritiqueConfig {
  return {
    // ... 现有默认值 ...
    loop: defaultCritiqueLoopConfig(),
  };
}
```

### 2. `apps/daemon/src/critique/config.ts` — 添加循环配置解析

```ts
import { loadLoopConfigFromEnv } from './config-loop.js';

export function loadCritiqueConfigFromEnv(env = process.env): CritiqueConfig {
  // ... 现有解析逻辑 ...
  
  return {
    // ... 现有字段 ...
    loop: loadLoopConfigFromEnv(env),
  };
}
```

### 3. `apps/daemon/src/critique/persistence.ts` — 添加循环表迁移

在数据库初始化函数中添加：

```ts
import { migrateLoopSchema } from './persistence-loop.js';

export function initCritiqueDb(db: Database): void {
  // ... 现有初始化 ...
  migrateLoopSchema(db);
}
```

### 4. `apps/daemon/src/metrics/index.ts` — 导出循环指标

```ts
export {
  critiqueLoopTotal,
  critiqueLoopConvergedTotal,
  critiqueLoopExhaustedTotal,
  critiqueLoopIterationsTotal,
  critiqueLoopFixesTotal,
  critiqueLoopFixDurationMs,
  critiqueLoopTotalDurationMs,
  critiqueLoopIterationDurationMs,
  critiqueLoopEnabled,
  critiqueLoopActiveCount,
} from '../critique/metrics-loop.js';
```

### 5. `apps/daemon/src/cli.ts` 或 `server.ts` — 启用循环引擎

在 spawn handler 中将 `runOrchestrator` 替换为 `runOrchestratorWithLoop`：

```ts
import { runOrchestratorWithLoop } from './critique/orchestrator-loop.js';
import type { CritiqueFeedback } from './critique/loop-engine.js';

// 在 spawn handler 中:
const result = await runOrchestratorWithLoop({
  // ... 现有参数 ...
  loopCfg: critiqueCfg.loop,
  fixFn: async (feedback: CritiqueFeedback, iteration: number) => {
    // 1. 构造修复 prompt
    const fixPrompt = formatFeedbackAsPrompt(feedback);
    
    // 2. 调用 agent 重新生成产物
    const artifact = await agentSpawner.regenerate({
      projectId,
      feedback: fixPrompt,
      previousArtifact: lastArtifactPath,
    });
    
    return {
      artifactContent: artifact.content,
      artifactMime: artifact.mimeType,
    };
  },
  createStdout: async (iteration: number, feedback: CritiqueFeedback | null) => {
    // 返回新的 agent 输出流
    return agentSpawner.spawnStdout();
  },
});
```

## 配置环境变量

```bash
# 启用自动修复循环
OD_CRITIQUE_LOOP_ENABLED=true

# 最大循环迭代次数（默认 5）
OD_CRITIQUE_LOOP_MAX_ITERATIONS=5

# 循环策略: converge | score_only | mustFix_only
OD_CRITIQUE_LOOP_STRATEGY=converge

# 单次修复超时 (ms)，默认 300000 (5分钟)
OD_CRITIQUE_LOOP_FIX_TIMEOUT_MS=300000

# 循环总超时 (ms)，默认 1800000 (30分钟)，0=不限制
OD_CRITIQUE_LOOP_TOTAL_TIMEOUT_MS=1800000

# 反馈聚合策略: cumulative | last_round
OD_CRITIQUE_LOOP_FEEDBACK_AGGREGATION=cumulative
```

## 循环流程

```
┌──────────────────────────────────────────────────────┐
│                  用户启用设计评审团                      │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│               第 N 轮: 评审团评审                        │
│  Panelists: Designer / Critic / Brand / A11y / Copy  │
│  → 评分 + mustFix 项                                  │
└──────────────────────┬───────────────────────────────┘
                       │
           ┌───────────┴───────────┐
           │                       │
           ▼                       ▼
    ┌─────────────┐         ┌─────────────┐
    │  达标 (SHIP) │         │ 发现问题      │
    │  composite≥阈值│         │ mustFix>0 或 │
    │  mustFix=0   │         │ composite<阈值│
    └──────┬──────┘         └──────┬──────┘
           │                       │
           ▼                       ▼
    ┌─────────────┐         ┌─────────────────┐
    │  ✅ 交付产物  │         │ 提取评审反馈      │
    └─────────────┘         │ → mustFix 项     │
                            │ → dimNotes 意见  │
                            └────────┬────────┘
                                     │
                                     ▼
                            ┌─────────────────┐
                            │ 触发自动修复      │
                            │ Agent 根据反馈   │
                            │ 重新生成产物      │
                            └────────┬────────┘
                                     │
                                     ▼
                            ┌─────────────────┐
                            │ 重新提交评审团    │
                            │ (iteration + 1) │
                            └────────┬────────┘
                                     │
                         循环直到达标或达到 maxIterations
```

## 测试

```bash
# 运行单元测试
pnpm vitest apps/daemon/src/critique/__tests__/loop-engine.test.ts

# 运行所有 critique 测试
pnpm vitest apps/daemon/src/critique/__tests__/
```

## 循环策略说明

| 策略 | 收敛条件 | 适用场景 |
|------|----------|----------|
| `converge` | composite ≥ 阈值 **且** mustFix = 0 | 严格质量控制（默认） |
| `score_only` | composite ≥ 阈值（忽略 mustFix） | 仅关注综合得分 |
| `mustFix_only` | mustFix = 0（忽略得分阈值） | 仅关注关键问题修复 |

## 反馈聚合策略

- **cumulative**: 累积所有历史轮次的反馈，避免同样问题被忽略
- **last_round**: 仅传递最近一轮的反馈，适合迭代式微调

# 项目记忆

## 项目概述
- 项目: Open Design (nexu-io/open-design) — 开源 Claude Design 替代方案
- 工作区: d:\我爱集团\open-loop
- GitHub 账号: pixcore598-design (通过 gh CLI 登录)

## 网络状况
- GitHub 直连不通 (github.com:443 无法连接)
- gh CLI 已登录但 git clone 同样超时
- 代理 http://127.0.0.1:33210 也不可用
- 后续需要网络恢复后才能拉取代码

## 当前任务
为 Open Design 的 Critique Theater (设计评审团/Design Jury) 实现 Loop Engineering 自动修复循环功能。

## 技术架构
- Critique Theater 核心模块在 `apps/daemon/src/critique/`
- 关键文件: orchestrator.ts (编排器), scoreboard.ts (评分), parser.ts (解析), config.ts (配置)
- 评审团由 5 位虚拟专家组成: Designer / Critic / Brand / A11y / Copy
- 决策规则: composite >= threshold 且 mustFix = 0 → SHIP
- 合约定义在 `packages/contracts/src/critique.ts`

## 新增文件 (Loop Engineering 功能)
- `apps/daemon/src/critique/loop-engine.ts` — 核心循环引擎
- `apps/daemon/src/critique/orchestrator-loop.ts` — 编排器循环桥接
- `apps/daemon/src/critique/config-loop.ts` — 循环配置解析
- `apps/daemon/src/critique/persistence-loop.ts` — 循环持久化
- `apps/daemon/src/critique/metrics-loop.ts` — Prometheus 指标
- `packages/contracts/src/critique-loop.ts` — 契约类型
- `apps/daemon/src/critique/__tests__/loop-engine.test.ts` — 测试
- `apps/daemon/src/critique/INTEGRATION.md` — 集成指南

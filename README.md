# Multi-Agent Team Collaboration Module for Open Design

> 多 Agent 团队协作模块 —— 让 Open Design 从单 Agent 迈入团队协作时代

[![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?logo=go)](https://golang.org/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](#验证)

## 这是什么

Open Design 当前是**单 Agent 驱动设计**的工作流（`SKILL.md → daemon → agent → artifact`）。

本模块为 Open Design 增加了**多 Agent 团队协作**能力：

- 📋 **YAML 配置驱动**：一行 YAML 定义一个 Agent 团队
- 🔀 **5 种协作模式**：并行 / 串行 / 遗传 / 继承 / 混合
- 🔗 **Daemon 原生对接**：通过 HTTP API + SSE 流式调用 Open Design daemon
- 📦 **工件版本管理**：Agent 间工件传递、继承和版本链追踪
- 📊 **事件驱动**：完整生命周期事件 + 历史重放

## 快速开始

### 安装

```bash
go install github.com/nexu-io/open-design/packages/multi-agent-team/cmd/odteam@latest
```

### 启动 Open Design daemon

```bash
cd open-design
pnpm tools-dev run web
# daemon 默认监听 http://127.0.0.1:17900
```

### 创建团队配置

```yaml
# team.yaml
version: "1.0"
team:
  name: "design-team"
  mode: parallel
  agents:
    - id: designer
      name: "UI 设计师"
      role: "界面视觉设计"
      type: claude-code
      skills: [hero-section, pricing-table]
      designs: [minimal-light]
    - id: writer
      name: "文案师"
      role: "用户体验文案"
      type: codex
      skills: [copywriting]
      designs: [minimal-light]
```

### 运行

```bash
odteam -config team.yaml -task "设计一个 SaaS 产品落地页，包含 hero、定价表、FAQ"
```

## 五种协作模式

| 模式 | 说明 | 适用场景 | DAG 示意 |
|------|------|----------|----------|
| **parallel** | 同层级 Agent 并行执行 | 多视角设计 | `A ─┬─> B` / `   └─> C` |
| **serial** | 按阶段链式传递 | 线性工作流 | `A → B → C` |
| **genetic** | 多变体进化优化 | 设计探索 | `A → [B₁ B₂ B₃ B₄] → best` |
| **inheritance** | 父子上下文继承 | 细化迭代 | `A → B → {C, D}` |
| **hybrid** | 串行主干 + 阶段内并行 | 复杂项目 | `A → {B,C} → D` |

### 并行模式

所有 Agent 同时处理同一任务的不同角色维度，结果通过拓扑排序分层执行。

### 串行模式

按 Pipeline 阶段顺序执行，前一阶段输出的工件自动注入下一阶段上下文。

### 遗传模式

基于遗传算法：初始种群（多变体 prompt）→ 评估适应度 → 选择/交叉/变异 → 多代进化 → 保留最优解。

### 继承模式

父 Agent 完成任务后，子 Agent 继承父节点的工件、技能、设计系统和共享记忆。

### 混合模式

Pipeline 阶段串行执行，阶段内多个 Agent 可并行工作（如调研阶段同时跑竞品分析和用户访谈）。

## 架构

```
┌─────────────────────────────────────────────────────┐
│  CLI (odteam)                                       │
│  -config / -task / -daemon / -artifacts / -status   │
└─────────────┬───────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────┐
│  Coordinator (编排器)                                │
│  - splitTasks()     任务拆分                          │
│  - Run()            执行调度                          │
│  - lifecycle hooks  onTaskStart/Complete/Error        │
└─────────────┬───────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────┐
│  Scheduler (调度器)                                  │
│  ┌──────────┬──────────┬──────────┬──────────┐      │
│  │ Parallel │  Serial  │ Genetic  │Inheritance│     │
│  └──────────┴──────────┴──────────┴──────────┘      │
└─────────────┬───────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────┐
│  Agent Pool                                         │
│  ┌──────────────────────────────────────────┐       │
│  │ ManagedAgent × N                         │       │
│  │  ├─ daemon.ChatSSE()    → OpenDesign daemon│    │
│  │  ├─ saveArtifact()      → 工件存储          │    │
│  │  └─ context.Inherit()   → 上下文继承        │    │
│  └──────────────────────────────────────────┘       │
└─────────────┬───────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────┐
│  Infrastructure                                     │
│  ┌───────────┬────────────┬──────────┬───────────┐  │
│  │ Bus       │ Events     │ Store    │ Context   │  │
│  │ 发布订阅  │ 生命周期    │ SQLite   │ 继承管理  │  │
│  └───────────┴────────────┴──────────┴───────────┘  │
└─────────────────────────────────────────────────────┘
```

## 项目结构

```
packages/multi-agent-team/
├── cmd/odteam/main.go              # CLI 入口
├── pkg/protocol/
│   ├── message.go                  # 核心类型定义
│   └── artifact.go                 # 文件工件存储
├── internal/
│   ├── agent/
│   │   ├── pool.go                 # Agent 池 + daemon 调用
│   │   └── adapter/
│   │       ├── adapter.go          # 适配器接口
│   │       ├── claude.go           # Claude Code 适配
│   │       ├── opendesign.go       # OpenDesign CLI 适配
│   │       └── daemon/client.go    # daemon REST + SSE 客户端
│   ├── bus/bus.go                  # 发布订阅通信总线
│   ├── config/                     # YAML 配置解析 + 校验
│   ├── scheduler/
│   │   ├── scheduler.go            # 调度器接口 + 工厂
│   │   ├── parallel.go             # 并行调度（拓扑分层）
│   │   ├── serial.go               # 串行管线调度
│   │   ├── genetic.go              # 遗传进化调度
│   │   └── inheritance.go          # 继承链调度
│   ├── coordinator/
│   │   └── coordinator.go          # 团队协调器 + 任务拆分
│   ├── context/context.go          # 上下文管理器（继承/合并/同步）
│   ├── events/emitter.go           # 事件驱动 + 历史重放
│   └── store/history.go            # SQLite 历史存储
└── examples/
    ├── team-parallel.yaml
    ├── team-serial.yaml
    ├── team-genetic.yaml
    ├── team-inheritance.yaml
    └── team-hybrid.yaml
```

## 配置参考

```yaml
version: "1.0"
team:
  name: "my-team"
  mode: parallel          # parallel | serial | genetic | inheritance | hybrid
  max_retries: 2
  timeout: "30m"
  agents:
    - id: agent-id
      name: "显示名"
      role: "角色描述"
      type: claude-code    # claude-code | codex | cursor | opendesign
      skills:
        - hero-section     # OpenDesign SKILL.md 名称
      designs:
        - minimal-light    # OpenDesign DESIGN.md 名称
      config:
        model: "claude-sonnet-4-20250514"

  inheritance:
    enabled: true
    tree:
      agent_id: root-agent
      children:
        - agent_id: child-agent

pipeline:
  stages:
    - name: stage-name
      agent: agent-id
      depends_on: []
      input_from: ""
      output_as: "stage output"
```

## 验证

```bash
go build ./...
go test -count=1 -race ./...
go vet ./...
```

## 许可证

Apache License 2.0

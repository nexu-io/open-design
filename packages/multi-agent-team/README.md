# Multi-Agent Team Collaboration Module for Open Design

> 多 Agent 团队协作模块 —— 让 Open Design 从单 Agent 迈入团队协作时代

[![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?logo=go)](https://golang.org/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](#验证)

## 这是什么

Open Design 当前是**单 Agent 驱动设计**的工作流（`SKILL.md → daemon → agent → artifact`）。

本模块为 Open Design 增加了**多 Agent 团队协作**能力：

- 📋 **YAML 配置驱动**：一行 YAML 定义一个 Agent 团队
- 🔄 **继承协作模式**：父子 Agent 上下文继承，逐步细化产出
- 🔗 **Daemon 原生对接**：通过 HTTP API + SSE 流式调用 Open Design daemon
- 📦 **工件版本管理**：Agent 间工件传递、继承和版本链追踪
- 📊 **事件驱动**：完整生命周期事件 + 历史重放

> **当前阶段**：本模块已实现全部 7 种协作模式（inheritance / cycle / complementary / parallel / serial / genetic / hybrid）。[团队配置示例 →](examples/)

## 快速开始

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
  mode: inheritance
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

### 使用模块

本模块通过 YAML 配置 + daemon API 集成使用。公开类型定义在 `pkg/protocol/` 包中：

```go
import "github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
```

内部实现（agent pool、scheduler、daemon client）均为 `internal/` 包，不面向外部调用方。如需扩展，请参考源码或提交 feature request。

## 协作模式

| 模式 | 状态 | 说明 |
|------|:--:|------|
| **inheritance** | ✅ 已实现 | 父子 Agent 上下文继承，工件传递与版本链追踪 |
| **cycle** | ✅ 已实现 | 生成器 ↔ 评审迭代求精，达到阈值后退出 |
| **complementary** | ✅ 已实现 | 互补专家链式交接，按序传递工件 |
| **parallel** | ✅ 已实现 | 同层级 Agent 并行执行，sync.WaitGroup 汇总 |
| **serial** | ✅ 已实现 | 按阶段链式传递，前段 artifacts 通过 ContextSnapshot 交接 |
| **genetic** | ✅ 已实现 | 多代进化：并行生成 N 个变体 → 选择 → 最优解传下一代 |
| **hybrid** | ✅ 已实现 | 按依赖分层层，同层并行，层间串行传递 artifacts |

> 模式通过 YAML 配置 `team.mode` 字段选择，配置校验器 `Validate()` 接受上述全部 7 种值。

### 继承模式

父 Agent 完成任务后，子 Agent 继承父节点的工件、技能、设计系统和共享记忆。适用于需要逐步细化产出的场景（如：初稿 → 打磨 → 终稿）。

示例：`
parent (初稿) → child-a (文案润色) → child-b (代码生成)`

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
│  ┌────────────────────────────┐                      │
│  │ Inheritance (上下文继承链)   │                      │
│  └────────────────────────────┘                      │
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
├── go.mod
├── go.sum
├── Makefile
├── README.md
├── pkg/
│   └── protocol/
│       └── types.go              # 核心类型：Artifact, Message, AgentRuntime 等
├── internal/
│   ├── agent/
│   │   ├── pool.go               # Agent 池 + daemon 调用 + 继承上下文构建
│   │   └── adapter/
│   │       └── daemon/client.go  # daemon REST + SSE 客户端
│   ├── bus/
│   │   └── bus.go                # 发布订阅通信总线
│   ├── config/
│   │   └── config.go             # YAML 团队配置解析与校验
│   └── scheduler/
│       ├── types.go              # Task, TaskResult, ExecutionPlan
│       └── inheritance.go        # 继承链调度
└── examples/
    └── team-inheritance.yaml
```

## 配置参考

```yaml
version: "1.0"
team:
  name: "my-team"
  mode: inheritance       # 当前支持的模式
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
cd packages/multi-agent-team
make build
make test
```

## 许可证

Apache License 2.0

# Multi-Agent Team Collaboration — Product Demo & Evaluation

> **当前阶段**: 已实现全部 7 种协作模式（inheritance / cycle / complementary / parallel / serial / genetic / hybrid）。本 demo 以 inheritance 模式为例。

## End-to-End Product Demo

### Prerequisites

1. **OpenDesign daemon running** on `http://127.0.0.1:17900`
2. **At least 2 agents configured** (e.g., `claude-code` and `codex`)
3. **Skills installed**: `hero-section`, `pricing-table`, `faq-section`, `copywriting`, `tailwind-css`, `responsive-layout`

### Demo: Inheritance Chain (refinement workflow)

**Config**: `examples/team-inheritance.yaml`
```
initial_designer → polisher → codegen
```

**Step 1 — Create team config** (`team.yaml`):
```yaml
version: "1.0"
team:
  name: "inheritance-refinement"
  mode: inheritance
  agents:
    - id: initial_designer
      name: "Initial Designer"
      role: "Create the first draft"
      type: claude-code
      skills: [hero-section, pricing-table]
      designs: [minimal-light]
    - id: polisher
      name: "Polisher"
      role: "Polish and refine the content"
      type: codex
      skills: [copywriting]
      designs: [minimal-light]
      inherits: initial_designer
    - id: codegen
      name: "Code Generator"
      role: "Generate production-ready code"
      type: codex
      skills: [tailwind-css, responsive-layout]
      inherits: polisher
```

**Step 2 — Start the daemon**:
```bash
cd open-design
pnpm tools-dev run web
# Daemon listening on http://127.0.0.1:17900
```

**Step 3 — Load and execute via public API**:
```go
package main

import (
    "github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

func main() {
    // 通过 daemon HTTP API + SSE 流式调用执行团队任务
    // 公开类型（Artifact、Message、AgentRuntime 等）在 pkg/protocol/ 包中
    // 内部调度器（agent pool、scheduler、daemon client）通过 YAML 配置驱动
    _ = protocol.Artifact{}
}
```

**Expected output** — 3-stage inheritance chain:
- `initial_designer` → creates first draft of the landing page
- `polisher` → inherits the draft, applies copywriting polish (context: parent artifacts + skills + design systems)
- `codegen` → inherits polished content, generates production-ready HTML/CSS

**Time**: ~6-9 minutes (3 stages × 2-3 min each, sequential inheritance)

---

## Evaluation: Single-Agent vs Multi-Agent

| Dimension | Single Agent | Multi-Agent Team (Inheritance) |
|-----------|:---:|:---:|
| Output quality | 1 perspective | 3-stage refinement chain |
| Design diversity | ❌ Single style | ✅ Staged evolution |
| Context sharing | Manual copy/paste | Automatic artifact chain |
| Skills reuse | All skills must load into 1 agent | Each agent focuses on specialized skills |
| Error isolation | 1 agent fails → retry all | Stage failures isolated to that agent |
| Time | ~5 min | ~6-9 min (3 stages) |

## All Supported Modes

| Mode | Status | Description |
|------|:------:|-------------|
| inheritance | ✅ Implemented | Parent→child context inheritance, artifact handoff & version chain |
| cycle | ✅ Implemented | Generator↔reviewer iterative refinement until threshold |
| complementary | ✅ Implemented | Expert chain handoff, sequential artifact transfer |
| parallel | ✅ Implemented | Concurrent execution across agents, results aggregated |
| serial | ✅ Implemented | Linear pipeline, each stage's output feeds the next |
| genetic | ✅ Implemented | Multi-variant generation with fitness scoring and evolution |
| hybrid | ✅ Implemented | Serial backbone with parallel execution within stages |

> 7 种模式均通过 `config.Validate()` 校验，对应调度器实现在 `internal/scheduler/` 下。

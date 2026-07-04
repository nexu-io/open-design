# Multi-Agent Team Assembly — Visual Evidence Report

This report demonstrates how the **intelligent team assembly system** 
maps agent runtime capabilities to team roles for each of the 7 
collaboration modes. All assignments are deterministic and based on 
8-dimensional capability profiling of each agent's runtime characteristics.

---

## Agent Capability Profiles

| Agent | Design | Code | Content | Review | Ops | Iterate | Reasoning | Chinese | Best Role |
|---|---|---|---|---|---|---|---|---|---|
| Claude Code (claude) | 100 | 75 | 85 | 80 | 65 | 70 | 85 | 60 | **设计师** (91) |
| Gemini CLI (gemini) | 70 | 60 | 100 | 75 | 55 | 80 | 70 | 50 | **文案写手** (84) |
| Codex CLI (codex) | 60 | 100 | 60 | 70 | 90 | 65 | 90 | 40 | **开发者** (96) |
| Cursor Agent (cursor-agent) | 60 | 90 | 55 | 80 | 70 | 60 | 75 | 40 | **开发者** (83) |
| Kimi CLI (kimi) | 50 | 50 | 85 | 60 | 40 | 55 | 50 | 95 | **文案写手** (80) |
| Qwen Code (qwen) | 60 | 85 | 80 | 60 | 55 | 60 | 70 | 90 | **文案写手** (78) |
| DeepSeek TUI (deepseek) | 55 | 95 | 60 | 70 | 65 | 60 | 85 | 85 | **开发者** (87) |

## Parallel Mode

**Strategy:** Best-Fit — each role assigned to the highest-scoring agent  

| Role | Agent | Runtime Type | Score | Reasoning |
|---|---|---|---|---|
| designer | agent-claude | `claude` | 91/100 | 创意设计, 深度推理 |
| developer | agent-codex | `codex` | 96/100 | 代码生成, 系统操作 |
| copywriter | agent-gemini | `gemini` | 84/100 | 内容写作, 快速迭代 |

## Serial Mode

**Strategy:** Chain-of-Experts — sequential handoff, no agent reused across stages  

| Role | Agent | Runtime Type | Score | Reasoning |
|---|---|---|---|---|
| designer | agent-claude | `claude` | 91/100 | 创意设计, 深度推理 |
| polisher | agent-gemini | `gemini` | 78/100 | 内容写作, 快速迭代 |
| developer | agent-codex | `codex` | 96/100 | 代码生成, 系统操作 |

## Genetic Mode

**Strategy:** Single Best All-Rounder — weighted composite score (reasoning 40% + design 30% + code 30%)  

| Role | Agent | Runtime Type | Score | Reasoning |
|---|---|---|---|---|
| designer | agent-claude | `claude` | 91/100 | 创意设计, 深度推理 |

## Inheritance Mode

**Strategy:** Three-stage inheritance chain: Root(designer) → Child(polisher) → Leaf(developer)  

| Role | Agent | Runtime Type | Score | Reasoning |
|---|---|---|---|---|
| designer | agent-claude | `claude` | 91/100 | 创意设计, 深度推理 |
| polisher | agent-gemini | `gemini` | 78/100 | 内容写作, 快速迭代 |
| developer | agent-codex | `codex` | 96/100 | 代码生成, 系统操作 |

## Hybrid Mode

**Strategy:** Layered — parallel within layer, serial across layers  

| Role | Agent | Runtime Type | Score | Reasoning |
|---|---|---|---|---|
| designer | agent-claude | `claude` | 91/100 | 创意设计, 深度推理 |
| developer | agent-codex | `codex` | 96/100 | 代码生成, 系统操作 |
| copywriter | agent-gemini | `gemini` | 84/100 | 内容写作, 快速迭代 |

## Complementary Mode

**Strategy:** Diverse Non-Overlapping — designer→copywriter→developer→reviewer, each agent used once  

| Role | Agent | Runtime Type | Score | Reasoning |
|---|---|---|---|---|
| designer | agent-claude | `claude` | 91/100 | 创意设计, 深度推理 |
| copywriter | agent-gemini | `gemini` | 84/100 | 内容写作, 快速迭代 |
| developer | agent-codex | `codex` | 96/100 | 代码生成, 系统操作 |
| reviewer | agent-cursor | `cursor-agent` | 76/100 | 代码生成, 批判评审 |

## Cycle Mode

**Strategy:** Paired Generator↔Reviewer — different agents, creative vs critical roles  

| Role | Agent | Runtime Type | Score | Reasoning |
|---|---|---|---|---|
| generator | agent-claude | `claude` | 82/100 | 创意设计, 深度推理 |
| reviewer | agent-codex | `codex` | 80/100 | 代码生成, 系统操作 |

## Mode Comparison Summary

| Mode | Agent Count | Parallelism | Role Overlap | Best For |
|---|---|---|---|---|
| parallel | 3 | all tasks parallel | allowed | multi-dimensional design |
| serial | 3 | none (sequential) | none | linear pipelines |
| genetic | 1 | N variants parallel per gen | N/A | design variation exploration |
| inheritance | 3 | none (tree) | none | iterative refinement |
| hybrid | 3 | within layer | within layer | complex projects |
| complementary | 4 | none (chain) | none (diverse) | full lifecycle |
| cycle | 2 | alternating | none (paired) | quality polishing |

## Full Agent Capability Detail

### Claude Code (`claude`)

**Role Rankings:** designer (91) > polisher (91) > reviewer (84)

**Capability Bars:**
  Design       |████████████████████| 100
  Content      |█████████████████░░░| 85
  Code         |███████████████░░░░░| 75
  Reasoning    |█████████████████░░░| 85
  Review       |████████████████░░░░| 80
  Iteration    |██████████████░░░░░░| 70
  Ops          |█████████████░░░░░░░| 65
  Chinese      |████████████░░░░░░░░| 60

**Top 3 Strengths:** 创意设计 (100), 内容写作 (85), 深度推理 (85)

### Gemini CLI (`gemini`)

**Role Rankings:** copywriter (84) > designer (78) > polisher (78)

**Capability Bars:**
  Design       |██████████████░░░░░░| 70
  Content      |████████████████████| 100
  Code         |████████████░░░░░░░░| 60
  Reasoning    |██████████████░░░░░░| 70
  Review       |███████████████░░░░░| 75
  Iteration    |████████████████░░░░| 80
  Ops          |███████████░░░░░░░░░| 55
  Chinese      |██████████░░░░░░░░░░| 50

**Top 3 Strengths:** 内容写作 (100), 快速迭代 (80), 批判评审 (75)

### Codex CLI (`codex`)

**Role Rankings:** developer (96) > reviewer (80) > synthesizer (80)

**Capability Bars:**
  Design       |████████████░░░░░░░░| 60
  Content      |████████████░░░░░░░░| 60
  Code         |████████████████████| 100
  Reasoning    |██████████████████░░| 90
  Review       |██████████████░░░░░░| 70
  Iteration    |█████████████░░░░░░░| 65
  Ops          |██████████████████░░| 90
  Chinese      |████████░░░░░░░░░░░░| 40

**Top 3 Strengths:** 代码生成 (100), 深度推理 (90), 系统操作 (90)

### Cursor Agent (`cursor-agent`)

**Role Rankings:** developer (83) > reviewer (76) > synthesizer (76)

**Capability Bars:**
  Design       |████████████░░░░░░░░| 60
  Content      |███████████░░░░░░░░░| 55
  Code         |██████████████████░░| 90
  Reasoning    |███████████████░░░░░| 75
  Review       |████████████████░░░░| 80
  Iteration    |████████████░░░░░░░░| 60
  Ops          |██████████████░░░░░░| 70
  Chinese      |████████░░░░░░░░░░░░| 40

**Top 3 Strengths:** 代码生成 (90), 批判评审 (80), 深度推理 (75)

### Kimi CLI (`kimi`)

**Role Rankings:** copywriter (80) > generator (68) > synthesizer (58)

**Capability Bars:**
  Design       |██████████░░░░░░░░░░| 50
  Content      |█████████████████░░░| 85
  Code         |██████████░░░░░░░░░░| 50
  Reasoning    |██████████░░░░░░░░░░| 50
  Review       |████████████░░░░░░░░| 60
  Iteration    |███████████░░░░░░░░░| 55
  Ops          |████████░░░░░░░░░░░░| 40
  Chinese      |███████████████████░| 95

**Top 3 Strengths:** 中文内容 (95), 内容写作 (85), 批判评审 (60)

### Qwen Code (`qwen`)

**Role Rankings:** copywriter (78) > developer (76) > generator (72)

**Capability Bars:**
  Design       |████████████░░░░░░░░| 60
  Content      |████████████████░░░░| 80
  Code         |█████████████████░░░| 85
  Reasoning    |██████████████░░░░░░| 70
  Review       |████████████░░░░░░░░| 60
  Iteration    |████████████░░░░░░░░| 60
  Ops          |███████████░░░░░░░░░| 55
  Chinese      |██████████████████░░| 90

**Top 3 Strengths:** 中文内容 (90), 代码生成 (85), 内容写作 (80)

### DeepSeek TUI (`deepseek`)

**Role Rankings:** developer (87) > synthesizer (78) > reviewer (76)

**Capability Bars:**
  Design       |███████████░░░░░░░░░| 55
  Content      |████████████░░░░░░░░| 60
  Code         |███████████████████░| 95
  Reasoning    |█████████████████░░░| 85
  Review       |██████████████░░░░░░| 70
  Iteration    |████████████░░░░░░░░| 60
  Ops          |█████████████░░░░░░░| 65
  Chinese      |█████████████████░░░| 85

**Top 3 Strengths:** 代码生成 (95), 深度推理 (85), 中文内容 (85)


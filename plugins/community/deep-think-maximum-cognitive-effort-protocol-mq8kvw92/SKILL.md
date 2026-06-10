---
description: Comprehensive deep-thinking process. Activates maximum reasoning, skill retrieval, verification, and step-by-step execution.
---

# /deep-think — Maximum Cognitive Effort Protocol

**Goal:** Activate the highest level of cognitive architecture for complex, multi-step, or ambiguous tasks where quality matters more than speed.
**Time:** 5-15 minutes depending on complexity tier.
**When to use:** Architecture decisions, multi-system changes, irreversible actions, anything where being wrong is expensive.

> **This is NOT /reason.** /reason = "follow the reasoning engine checklist" (fast, lightweight).
> /deep-think = "maximum effort with structured thinking, research, gap analysis, multi-perspective debate, and adversarial review" (slow, thorough).

---

## Complexity Gate (decide first)

Before starting, classify the task:

| Tier | When | Phases Used |
|------|------|-------------|
| **SIMPLE** | Quick but thorough — single-domain analysis, clear question | Phases 1 + 5 only |
| **MEDIUM** | Research + analysis — multi-source synthesis, comparison | Phases 1-5 |
| **COMPLEX** | Full adversarial — architecture decisions, multi-system changes, irreversible actions | All 8 phases |

---

## Phase 1: ORIENT (Memory + Context)

Load ALL available context before forming any opinion.

1. Read `MEMORY.md` — current global state
2. Read `knowledge/gotchas.md` — known pitfalls for this domain
3. Read the most relevant local knowledge or chunk files
4. Search Honcho when recent continuity matters
5. Check conversation history for prior work on this topic
6. Identify which projects/systems are involved

**If any tool fails:** Note "degraded mode" and continue with available sources. Do NOT stall.

---

## Phase 2: QUESTION (Challenge the Request)

Before solving, challenge the problem statement itself.

1. Use **sequential-thinking MCP** (`mcp_sequential-thinking_sequentialthinking`) to decompose the problem into component parts
2. Ask explicitly:
   - "Is this the right question? Is there a better framing?"
   - "What assumptions are embedded in this request?"
   - "What would go wrong if I do the obvious thing?"
   - "Has this been attempted before? What happened?"
3. If the framing reveals a deeper issue, address THAT instead

---

## Phase 3: RESEARCH (Evidence Collection)

Gather evidence from multiple sources. Do NOT rely on training data alone.

1. **Web search** for current best practices, official docs, known issues
2. **Context7 MCP** for any referenced libraries, frameworks, or APIs
3. **Skills:** Check `.agent/skills/` and `.agent/skills/` for relevant procedures
4. **Domain chunks:** Load relevant `.context/taza-context/` chunks via WORKSPACE-AUTOMAP routing
5. **knowledge/conventions.md** for established patterns

**Rule:** Every factual claim must trace to a retrieved source, not memory.

---

## Phase 4: AUDIT (Gap Analysis)

For architecture and system tasks. Skip for pure analysis questions.

1. **What exists?** List all relevant files, tools, configs currently in place
2. **What SHOULD exist?** Based on research and requirements, what's the ideal state?
3. **What's the delta?** Enumerate every gap between current and ideal
4. **What's stale?** Cross-reference sources for contradictions and outdated information
5. **What's broken?** Check tool health, file integrity, reference validity

---

## Phase 5: SYNTHESIZE (Multi-Perspective Analysis)

Evaluate the problem from multiple expert perspectives.

1. **Council of Experts** — consider the problem as:
   - A **Lead Developer**: Is this technically sound? What are the edge cases?
   - A **Business Strategist**: Does this serve Taza's business outcomes?
   - A **UX/Ops Pro**: Is this maintainable? Will it create friction?
2. **Reconcile conflicts** between perspectives and sources
3. **Produce a structured recommendation** with:
   - The recommended approach
   - The key tradeoff
   - The risk if wrong
   - The success criteria

---

## Phase 6: PLAN (Surgical Execution Design)

Break the recommendation into executable steps.

1. Decompose into the **smallest possible steps** — each independently verifiable
2. Run the **5-step Pre-Action Verification Protocol** on EACH step:
   - Are assumptions stated?
   - Am I targeting the correct file/resource?
   - Is scope minimal?
   - Is action reversible?
   - What are the success criteria?
3. Define **measurable success criteria** for the overall task
4. Sequence steps so failures are caught early (dependencies first)

---

## Phase 7: EXECUTE + VERIFY (Work → Check → Correct)

Execute the plan one step at a time.

1. **One step at a time.** Verify output after each step before proceeding.
2. **Work → Verify → Self-Correct loop.** Do not assume success.
3. **Anti-Bulk Enforcement:** Use the most surgical edit mechanism available. Never rewrite files unless creating from scratch.
4. **80% Confidence Threshold:** If confidence drops below 80% on a high-stakes decision, STOP and ask Taza for input.
5. Follow **Karpathy Doctrine**: surgical, minimal, explicit.

---

## Phase 8: CHALLENGE (Adversarial Self-Review)

After producing the result, attack it.

1. **Re-read the original request word by word.** Did you actually answer THE question?
2. **What did you miss?** What would a senior expert critique about this output?
3. **Would you stake your reputation on this?** If not, what needs to change?
4. **Edge cases:** What happens under unusual conditions? Empty inputs? Scale? Concurrent use?
5. **Save key learnings** to the appropriate memory layer:
   - Debugging insights → `knowledge/gotchas.md`
   - New patterns → `knowledge/conventions.md`
   - Decisions made → `knowledge/decisions.md`
   - Recent continuity worth reusing soon → one concise Honcho conclusion

---

## What This Workflow Does NOT Do

- It does NOT replace `/reason` for quick analysis — use /reason for fast reasoning engine activation.
- It does NOT save session state — that's `/wrap`.
- It does NOT consolidate memory — that's `/dream`.

## Provenance

Formalized by Open Design from candidate a6f4ae48-146c-4430-8a9e-5ac6d4db9dad.

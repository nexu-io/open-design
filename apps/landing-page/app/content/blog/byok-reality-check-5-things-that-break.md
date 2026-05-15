---
title: "BYOK reality check: 5 things that break in Open Design today"
date: 2026-05-14
category: "Guides"
readingTime: 7
summary: "We promised BYOK as first-class. Five open bug threads from this week — Gemini, DeepSeek, OpenCode, Windows — show where the seams are still rough, and what to use until each fix lands."
---

We've been telling people Open Design is BYOK from the ground up. That's still true. The seed post on the [BYOK design workflow](/blog/byok-design-workflow-claude-codex-qwen/) walks through the working path — point the daemon at any OpenAI-compatible endpoint, paste your key, you're done.

But "BYOK" isn't a single feature. It's a contract that reaches into the chat composer, the finalize endpoint, the model picker, the CLI launch path, and the analytics layer. Every one of those is a place where the contract can break — and right now, four of them are open issues in our [public tracker](https://github.com/nexu-io/open-design/issues), reported by users in the last 48 hours.

This post lists what's broken, why it's broken, what to do today, and which PR is fixing it. Treat it as the Windows-and-Gemini honesty pass that the seed BYOK post didn't give you.

## The promise vs the bug list

The framing matters. None of these are "BYOK doesn't work" bugs. They're all at the boundary between an adapter we own (the OpenAI-compatible layer) and one we don't (the upstream provider's CLI, their packaging, or the host platform's process model). That's where reality lives in any open-source CLI orchestrator — and where we've been doing most of the firefighting this week.

Here are the five.

## Gemini gets lost on the way to "Finish Design"

**[Issue #1619](https://github.com/nexu-io/open-design/issues/1619) — `bug`, open**

Reporter: BYOK is configured for Gemini. The Settings test connection succeeds. The model picker returns Gemini models. Regular chat works. But the moment they hit **Finish Design**, the daemon throws an Anthropic-shaped error.

The maintainer reply confirms it: regular API-mode chat honors the selected Gemini BYOK provider, but Finish Design has not yet been generalized beyond the Anthropic-compatible finalize path. Everything else routes through the provider-aware proxy; Finish Design still goes through a hardcoded Anthropic finalize endpoint.

**What to do today:** route Gemini through OpenRouter under the Anthropic-compatible provider slot. The Finish Design path then sees an Anthropic-shaped response from OpenRouter's shim and finalizes correctly. It's an extra hop, but it's stable.

**Who's fixing it:** the Finish Design generalization is now on the BYOK roadmap as a P1. No PR yet — this is the next thing the daemon team picks up.

## Gemini 3 Flash dies on Windows before the prompt lands

**[Issue #1611](https://github.com/nexu-io/open-design/issues/1611) — `bug`, open**

Reporter: Gemini 3 Flash Preview fails inside Open Design on Windows with `stdin: write EOF` after about 1.5 seconds. Gemini 3 Pro works fine in the same install. Direct Gemini CLI (`gemini --model gemini-3-flash-preview ...`) succeeds when `GEMINI_CLI_TRUST_WORKSPACE=true` is set.

The diagnosis took two passes. First read of the screenshot looked like upstream `429 RESOURCE_EXHAUSTED`. After a clean PowerShell repro that wrote `OD_GEMINI_3_FLASH_OK` to stdout, the picture changed: the model is reachable, the CLI is healthy, the failure is on the Open Design → Gemini CLI launch path, and it's specific to the Flash variant on Windows.

**What to do today:** select Gemini 3 Pro Preview in the model picker. It runs through the same launch path and works. Also check `~/.gemini/hooks/` — a slow `gsd-check-update.js` hook (`Hook execution error: Hook timed out after 60000ms`) was adding ~104s of overhead to every run in this user's case, independent of the Flash bug. Clean Gemini hooks separately.

**Who's fixing it:** flagged as Flash-specific OD-side. Investigation in progress on the daemon's stdin write path.

## DeepSeek TUI has a 30 KB prompt ceiling on Windows

**[Issue #1610](https://github.com/nexu-io/open-design/issues/1610) — `bug`, open**

Reporter (DeepSeek wrapper v0.8.33, Windows packaged build): a long composed prompt fails with our pre-flight guard at `81397 > 30000 bytes`.

That guard is intentional. Without it, Windows would fail later with a less useful `ENAMETOOLONG` spawn error. The DeepSeek TUI adapter currently sends the prompt as a positional command-line argument — argv-bound — so any prompt over the Windows command-line ceiling is unsafe to spawn. The high-level docs imply Windows long-prompt fallbacks apply broadly; the DeepSeek path doesn't have one yet.

**What to do today:** if you're on Windows with the DeepSeek TUI adapter, keep the composed prompt under 30 KB or switch to a stdin-based adapter (Claude Code, Codex, OpenCode). On macOS and Linux, this issue does not bite — the argv ceiling is much higher.

**Who's fixing it:** the right fix is a stdin or prompt-file transport for the DeepSeek TUI adapter. Tracked on the adapter team's queue.

## The OpenCode local-CLI test times out before the model warms up

**[Issue #1603](https://github.com/nexu-io/open-design/issues/1603) — `bug`, `priority:p0`, open**

Reporter: in Settings → BYOK → OpenCode, the connection test reliably times out at 45 seconds. But if they first open OpenCode Desktop's terminal and attach a local LLM there, the same Open Design test then succeeds.

That's the useful clue. Open Design doesn't attach to the running OpenCode Desktop session — for a Settings smoke test, the daemon spawns its own fresh OpenCode CLI subprocess and waits for an `ok` reply. With a cold local model, that first reply can take longer than the 45-second budget. The OpenCode Desktop terminal step warms the model in a way the daemon's fresh subprocess can then see.

**What to do today:** before testing OpenCode in Open Design, open OpenCode Desktop, attach your local LLM, and let it answer one prompt. Then run the OD connection test. As of v0.7.0, the connection-test budget is configurable; bump it if your local model is slow to load.

**Who's fixing it:** the daemon-side fix is a longer / configurable warmup window for local-model adapters. Tracked at p0.

## The packaged web app refuses to load over plain HTTP

**[Issue #1620](https://github.com/nexu-io/open-design/issues/1620) — `bug`, open**

Slightly different bug, same family. Reporter is running the packaged web app on a LAN IP over plain HTTP. After PR #1428, the analytics provider and the PDF export nonce started calling `crypto.randomUUID()` directly, bypassing the tiered helper from PR #900. Chromium does not expose `crypto.randomUUID` in non-secure contexts, so the page throws on load.

This isn't strictly a BYOK bug, but it bites the same audience: people running their own infrastructure, often air-gapped, often over plain HTTP because the cert story isn't worth it for an internal tool.

**What to do today:** serve the web app over HTTPS or `localhost`. Both paths satisfy the Chromium secure-context requirement and the page loads.

**Who's fixing it:** PR #1621 routes the remaining call sites through the tiered UUID helper. Open and under review.

## What this actually says about BYOK in Open Design

Read the list as a contract map, not a quality verdict. Four of these five issues are at adapter boundaries — Gemini's CLI, DeepSeek's CLI, OpenCode's CLI launch model, the host platform's secure-context rules. The fifth is at our own finalize endpoint where we hardcoded an Anthropic-shaped response a release ago and haven't generalized yet.

That's where every BYOK system that isn't a rebadged proxy ends up. You either own the inference (and lose BYOK) or you respect the upstream tools (and inherit their edges). We [picked the second posture deliberately](/blog/why-we-built-open-design-as-a-skill-layer/). The cost is that triage looks like this week, where the daemon team filed five PRs across five surfaces in two days.

The trade is still right. A working setup on Claude Code, Codex, Cursor, Gemini Pro on macOS, and DeepSeek on Linux — the matrix that covers ~90% of our actual users — runs cleanly today, with no proxy tax and no margin on tokens. The five threads above are what the other 10% of the matrix looks like in mid-May 2026, with named PRs against each one.

## What to use today (matrix)

| Provider | macOS | Linux | Windows | Finish Design path |
|---|---|---|---|---|
| Claude Code (Sonnet / Opus) | ✓ | ✓ | ✓ | native |
| Codex | ✓ | ✓ | ✓ | native |
| Cursor (BYOK) | ✓ | ✓ | ✓ | native |
| Gemini 3 Pro Preview | ✓ | ✓ | ✓ | OpenRouter shim |
| Gemini 3 Flash Preview | ✓ | ✓ | ✗ ([#1611](https://github.com/nexu-io/open-design/issues/1611)) | OpenRouter shim |
| DeepSeek (API) | ✓ | ✓ | ✓ | OpenRouter shim |
| DeepSeek TUI (long prompts) | ✓ | ✓ | ✗ ([#1610](https://github.com/nexu-io/open-design/issues/1610)) | OpenRouter shim |
| OpenCode (local model) | ✓ | ✓ | ✓ (warm first) | n/a |

Subscribe to the [BYOK label on the tracker](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+label%3Abug+BYOK) if you want notifications when each row above flips.

## What to do next

Open Design's [skills library](https://github.com/nexu-io/open-design/tree/main/skills) is the working layer underneath all of this — the file-driven contracts that the BYOK adapter feeds into. If you want to see what a skill actually consumes from the model and what it doesn't care about, that directory is the right place to start.

[Browse the skills library](https://github.com/nexu-io/open-design/tree/main/skills).

## Related reading

- [BYOK design workflow: run Claude, Codex, or Qwen on your own key](/blog/byok-design-workflow-claude-codex-qwen/) — the original BYOK explainer
- [31 skills, 72 systems — how the library works](/blog/31-skills-72-systems-how-the-library-works/) — what BYOK actually feeds into
- <!-- TODO: backfill related when "Open Design on Windows" ships -->

# Conversation transcript unbounded growth — investigation writeup

## Purpose

This is an investigation writeup, not a design decision or a fix proposal.
It documents what a multi-session debugging investigation found, so the
actual design conversation about what (if anything) to change can start
from confirmed facts instead of re-deriving them. No code has been changed
as a result of this investigation beyond temporary, clearly-marked debug
logging (see "Artifacts" below).

## Where this started

A real, reproducible-looking symptom: file edits in one long-running chat
conversation repeatedly failed with `"Edit approval denied by ACP client;
file was not modified."` — 6 occurrences across 2026-07-27 through
2026-08-02, all in the same conversation (Hermes agent, project "Meripro
Solutions" landing page work).

The natural hypothesis was an ACP permission-routing bug: either Open
Design's Hostinger-only permission-scoping (`apps/daemon/src/acp.ts`,
`1b907a154`) misclassifying an edit as needing human approval, or the new
approval-card UI (`f25fd7176`) failing to render/answer it in time.

## What was ruled out

Both of the above were directly disproven, not just reasoned about:

- **Persisted event data proved the premise wrong first.** Every one of
  the 6 failing messages' `events_json` (in `.od/app.sqlite`) has **zero**
  `permission_request`, `permission_resolved`, or `tool_call` events — the
  daemon's own human-approval UI mechanism was never even triggered for
  these. So neither the Hostinger-scoping logic nor the approval-card UI
  could be the cause; there was nothing for either to act on.
- **The actual permission mechanism involved turned out to be different**
  — Hermes' own internal ACP edit-approval requester
  (`~/.hermes/hermes-agent/acp_adapter/edit_approval.py`), which does call
  Open Design's `session/request_permission` for every `write_file`/`patch`
  tool call. Traced this end to end with temporary correlated logging on
  both sides (daemon `[ACP-DEBUG]` lines + a dedicated Hermes-side log) and
  two live reproduction attempts. **Both attempts succeeded cleanly** — full
  round trip (Hermes schedules → daemon auto-approves with `allow_once` →
  Hermes receives it) in ~3-4ms, twice, including once inside the exact
  conversation that produced all 6 real failures.
- One of the two reproductions was briefly suspected of also failing
  (a "file not modified, contradiction" report), but that was a timezone
  mismatch in comparing a local-time file mtime against UTC-labeled debug
  log timestamps — independently re-verified the file did contain both
  test edits, mtimes matching to the millisecond. No contradiction; both
  reproductions were genuinely clean.

**Conclusion: the ACP permission round-trip (`acp.ts` + `edit_approval.py`)
is proven correct, twice, including inside the real failing conversation.**
The temporary debug logging added during this work is intentionally still
in place in both repos (see Artifacts) in case a true routing failure ever
does recur, but it is not implicated in what was actually found.

## What was actually happening

Mining the same persisted conversation data (rather than generating more
of it) found the real transition point, turn by turn:

| turn | input tokens | what happened |
|---|---:|---|
| (last known-good turn) | — | real `tool_use` events recorded, everything working |
| assistant | — | "I'll modify the HTML..." — no `tool_use` recorded |
| user | — | "approve just do it" |
| assistant | **1,159,779** | "trouble with the exact string matching... you approved my proposed path without me confir—" |
| assistant | 587,425 | "the fixes didn't happen... I'll re-check..." |
| user | — | "approve" |
| assistant | 343,804 | **first appearance of "Edit approval denied by ACP client"** |

**Gemini 2.5 Flash's documented context window is 1,048,576 tokens.** The
turn two steps before the first denial message sent **1,159,779** —
already over the model's real maximum — with no clean API error surfaced;
just increasingly confused, degraded output, culminating in a fabricated
tool-denial message that (per the ruled-out section above) never
corresponded to any real daemon or ACP-level event. The most likely
explanation: the model hallucinated a plausible-sounding denial — that
exact string is hardcoded in `edit_approval.py`, an easy pattern to
misremember or confabulate — as an explanation for its own degraded state,
rather than this ever being a real protocol-level denial.

## Root cause

`composeChatUserRequestForAgent()` (`apps/daemon/src/server.ts:2827`) has
exactly two modes:

- **`skip`** — send only the latest user turn, because the agent's own CLI
  resumes its prior session and already remembers everything.
- **default — send the entire conversation transcript, unbounded**, every
  single turn, labeled `"## Full conversation transcript"`. No truncation,
  no summarization, no token budget check anywhere in this function.

Which mode an agent gets is decided by `agentSupportsSessionResume =
def.resumesSessionViaCli === true || def.streamFormat === 'pi-rpc'`
(`server.ts`, near the `startChatRun` call site).

**Only 3 of ~24 registered agent runtimes opt into the bounded path:**
`claude`, `codebuddy` (`resumesSessionViaCli: true`), and `pi`
(`streamFormat: 'pi-rpc'`). **Every other registered agent — including
`hermes`, `amr`, `amp`, `codex`, `deepseek`, `devin`, `gemini`, `kiro`,
`kimi`, `trae-cli`, `opencode`, `vibe`, `aider`, `copilot`, `kilo`,
`grok-build`, `cursor-agent`, `qoder`, `reasonix`, `qwen`, and
`antigravity` — takes the unbounded full-transcript path.** This is not
Hermes-specific.

## This is a deliberate architecture choice, not an oversight — but the size question was never addressed

`antigravity.ts`'s own comment explains why: CLI-native session-resume
flags (tested with `agy -c`) activate the underlying CLI's own agentic
retry/fallback behavior, which can't be steered by Open Design's
system-prompt overrides — testing found `-c` reproducing a byte-for-byte
duplicate response from a cached-tool-error path that no amount of prompt
strength could override. The stateless, full-transcript-resend approach
was chosen deliberately, for real correctness/steerability reasons that
apply broadly, not just to antigravity.

**What that choice didn't come with: any bound on how large the resent
transcript is allowed to get.**

## The size risk is already known and partially mitigated — just not enough

`apps/web/src/providers/daemon.ts` already has two real mechanisms here:

- `MAX_TRANSCRIPT_MESSAGE_CHARS = 12,000` — caps any *single* message's
  length before inclusion. Does not bound the transcript's total length or
  message count.
- `HIGH_INPUT_TOKEN_WARNING_THRESHOLD = 200,000` — once any prior run in
  the conversation reported at least this many input tokens,
  `buildPriorRunContextWarning()` injects an advisory note into the next
  prompt: *"Keep this turn compact: summarize prior tool output, read
  large references from temp files, and quote only task-relevant lines."*

This is a **prompted request to the model**, not an enforced limit. In the
conversation this investigation traced, this threshold would have started
firing well before the 1,159,779-token turn — and evidently, asking the
model nicely wasn't sufficient to prevent it from still blowing past both
the 200k advisory threshold (5.8x over) and the model's real hard ceiling.

## Why this likely isn't a one-conversation edge case

`specs/current/run-reliability-optimization-plan.md` (existing, PostHog
baseline from 179k `run_finished` events, 2026-05-12 through 2026-05-30)
already measured **average successful-task token usage at ~360k/run (about
350k input, 9k output)** platform-wide, and states cost is
"input/context dominated." That baseline is fully consistent with what
this investigation found in one specific conversation — it just hadn't
previously been traced to this specific mechanism (unbounded transcript
resend for 21 of 24 agents) or connected to a concrete failure mode
(context-overflow-driven degraded/hallucinated output, not just cost).

## Existing full-reset mechanism: starting a new conversation

Starting a new conversation in the same project (the plain UI action, not
the separate "Side Chat" fork feature below) is a genuine, complete reset
of the transcript-growth risk — confirmed by tracing the actual code path,
not assumed:

- `createConversation()` (`apps/web/src/state/projects.ts:299`) calls
  `POST /api/projects/:id/conversations`.
- The daemon route (`server.ts:6101`) does
  `insertConversation(db, { id: randomId(), projectId, ... })` — a brand
  new conversation row with a fresh random id.
- `seedMessages` stays empty unless the caller explicitly passes
  `seedFromConversationId` — which the plain "new conversation" action does
  not do. So by default the new conversation has **zero** rows in
  `messages` at creation.
- Since the transcript is built entirely from `messages` filtered by
  `conversation_id`, a new conversation starts genuinely empty. The
  unbounded-growth risk resets to zero and only re-accumulates from there.

**There is a separate, opt-in exception that does carry history forward:**
the "Side Chat" fork feature. `createConversation()` also accepts
`seedFromConversationId` (plus an optional `forkAfterMessageId` to cut off
at a specific point), which the daemon route uses to copy an existing
conversation's messages into the new one (`listMessages()` +
`upsertMessage()` with fresh message ids, `runId`/`runStatus` stripped).
That is a deliberate "continue this thread elsewhere" action a user has to
explicitly choose — it is not what happens on a plain new conversation,
and it would carry the same unbounded-growth risk forward if the source
conversation was already large.

This means a full, working mitigation already exists today, it's just
manual and not surfaced as a response to the risk — nothing currently
tells a user "this conversation is getting large, consider starting a new
one," the way `buildPriorRunContextWarning` tells the *model* to be more
compact. Relevant to the open questions below.

## Open questions for the design conversation (no recommendation implied)

- Should there be a hard, enforced transcript size bound (by token count,
  not just per-message char count), rather than an advisory warning?
- If so, at what point — trim oldest turns, summarize, or something else —
  and does that reintroduce the steerability problems that motivated
  moving away from CLI-native resume in the first place?
- Does the bound need to be per-model (context windows vary widely across
  the ~21 affected agents' underlying models), or a conservative
  one-size-fits-all number?
- Is `buildPriorRunContextWarning`'s 200k threshold meant to eventually
  become a hard stop rather than advisory, or is advisory-only a
  deliberate choice that just needs a lower threshold / stronger wording?
- Separately: should the model's own out-of-context behavior surface as a
  visible, structured error to the user (closer to how `AMR_MODEL_UNAVAILABLE`
  already works elsewhere in this codebase) instead of silently degrading
  into plausible-looking but fabricated tool-result text?
- Given a full, clean reset already exists (starting a new conversation),
  is a lighter-weight fix simply surfacing that option to the *user* —
  e.g. a UI nudge alongside or instead of the model-facing
  `buildPriorRunContextWarning` note — rather than building transcript
  truncation/summarization at all?

## Artifacts from this investigation

- **Temporary debug logging, intentionally still in place** (not
  implicated in the actual root cause, kept for now in case a real ACP
  routing failure ever does recur):
  - `open-design@163e014d7` — `apps/daemon/src/acp.ts`'s auto-approve
    branch, `[ACP-DEBUG]` tagged, logs to
    `.tmp/tools-dev/default/logs/daemon/latest.log`.
  - `hermes-agent` fork branch `debug/acp-edit-approval-stall`
    (`b17c25912`, PR closed — branch kept, not merged) —
    `edit_approval.py`'s `_requester()`, logs to
    `/tmp/acp-debug-hermes.log`.
  - Full session notes: `open-design`'s `.tmp/DEBUG-NOTES-acp-permission-stall.md`
    (gitignored, not itself committed).
- This document.

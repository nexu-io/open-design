# Recorded Claude Code CLI output (verbatim)

Every `.jsonl` here is **byte-for-byte stdout** captured from a real
`claude` process, not a hand-assembled frame sequence.

> **Do NOT copy the frame shape from the older daemon fixtures.**
> Almost every hand-built Claude fixture in `apps/daemon/tests/**` puts
> `stop_reason` on the `assistant` wrapper frame. Claude Code **2.1.259 never
> does that** — see the table below. Tests written against the hand-built shape
> go green against a stream the installed CLI no longer produces.

Recorder: `claude -p --input-format stream-json --output-format stream-json
--verbose [--include-partial-messages] --model haiku --permission-mode
bypassPermissions`, CLI version **2.1.259**, recorded 2026-09-03.

| file | flags | what it contains |
| --- | --- | --- |
| `claude-2.1.259-partial-two-turns.jsonl` | `--include-partial-messages` | **Two user turns in one CLI process.** Turn 1 `Write`s `alpha.html`; turn 2 (a second stream-json user frame written after turn 1's `result`) emits an inline `<artifact type="text/html" title="Beta">` whose body differs from the written file. |
| `claude-2.1.259-partial-same-turn-echo.jsonl` | `--include-partial-messages` | One user turn: `Write`s `gamma.html`, then echoes the identical content back as an inline `<artifact type="text/html">`. This echo is the thing the dedup is *supposed* to swallow. |
| `claude-2.1.259-partial-single-turn.jsonl` | `--include-partial-messages` | One user turn: `Write` + `DONE1`. Baseline for "single-turn behaviour unchanged". |
| `claude-2.1.259-no-partial-messages.jsonl` | *(flag omitted)* | Same CLI **without** `--include-partial-messages`: no `stream_event` frames exist at all, so `message_delta` is not available and the only surviving stop reason is on the terminal `result` frame. |
| `claude-2.1.259-no-partial-two-turns.jsonl` | *(flag omitted)* | The two-turn scenario above recorded **without** `--include-partial-messages`. Turn 1 `Write`s `alpha.html`, turn 2 emits the inline `Beta` artifact — and the only turn boundary in the whole stream is the `result` frame. |
| `claude-2.1.259-partial-forwarded-subagent.jsonl` | `--include-partial-messages --forward-subagent-text` | A real `Agent` sub-agent whose frames are forwarded inline carrying a non-null top-level `parent_tool_use_id`. |

## Where the stop reason actually lives

Measured across all five recordings plus the four earlier probes in
`scratchpad/w103-probe` and `scratchpad/w100/probe`:

| frame | 2.1.259 |
| --- | --- |
| `assistant` → `message.stop_reason` | **always `null`** (0 non-null out of every assistant frame recorded) |
| `stream_event` → `message_delta` → `delta.stop_reason` | the real value (`tool_use` / `end_turn`), one per assistant message — **only with `--include-partial-messages`** |
| `result` → `stop_reason` | the real value, **one per user turn** (a held-open stdin session emits a `result` per turn, not one per process) |

2.1.259 also emits **one `assistant` wrapper frame per content block** (a
thinking block and a text block of the same `message.id` arrive as two separate
`assistant` frames), and forwarded sub-agent frames arrive as `assistant`
wrappers only — there are **no** child `stream_event` frames.

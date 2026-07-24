# `mocks/golden/` — daemon-event regression snapshots

Each `<trace-id>.events.json` is a committed snapshot of the event
sequence that flows out of the OD daemon's stream handler when fed the
matching mock CLI's output for that recording.

The shape is:

```json
{
  "agent": "claude",
  "trace": "314d6833-...",
  "events": [
    { "type": "status", ... },
    { "type": "tool_use", "name": "Read", ... },
    { "type": "tool_result", ... },
    ...
  ]
}
```

## Why these exist

`mocks/scripts/smoke-test.sh` confirms the mock CLIs *run* and emit
events. It doesn't tell you whether the events have the *right shape*
— a parser change in `apps/daemon/src/runtimes/claude-stream.ts` or
`runtimes/json-event-stream.ts` could silently drop a field, rename
`sessionID` → `sessionId`, or stop emitting `turn_end`. The goldens
are diffed by `apps/daemon/tests/mocks-golden.test.ts`; a regression
makes that test fail loudly.

## Updating after an intentional parser change

```bash
MOCKS_GOLDEN_UPDATE=1 pnpm --filter @open-design/daemon test mocks-golden
git diff mocks/golden/
git add mocks/golden/ && git commit -m "mocks: refresh goldens — parser X now emits Y"
```

The diff is the part the reviewer eyeballs. If the change matches what
the parser refactor intended, ship. If it doesn't, the refactor broke
something.

## Coverage

| File | Agent | Trace | Tools | Why it's representative |
|---|---|---|---|---|
| `314d6833…events.json` | claude | 17-tool agent-browser session | 8 | Median complexity for claude; exercises Read / Write / Edit / Bash tool shapes + content_block streaming |
| `9a9522ec…events.json` | opencode | data-report session | 7 | Covers `step_start` / `step_finish` / `tool_use` / `cost` envelope |
| `dcdff3b3…events.json` | codex | 14-tool refactor | 14 | High tool density; exercises `thread.started` + thread message streaming |

Other agents (gemini / cursor-agent / plain / ACP / vela) aren't
golden-tested here because their parsers either (a) emit only assistant
text (gemini, cursor-agent, plain) — covered by simpler unit tests, or
(b) use JSON-RPC over stdio rather than streamed stdout (ACP / vela)
— which needs a different harness; see `apps/daemon/tests/acp.test.ts`.

# Agent runtime maintenance

Read `apps/daemon/AGENTS.md` first (repository-relative paths below).
This directory owns runtime definitions, spawning, stream parsing, and
executable/environment shaping. Definitions live in `defs/`; parsers live
beside their runtime stream helpers.

## Input and turn boundaries

- `RuntimeAgentDef.promptInputFormat` selects stdin transport. Text input ends stdin after the prompt; stream-json wraps input as JSONL user messages and keeps stdin open for mid-turn messages. Check the runtime definition rather than inferring transport from an agent name.
- `applyClaudeStreamJsonRunBookkeeping` in `apps/daemon/src/server.ts` tracks open stdin. Close only at a clean turn boundary; a `tool_use` stop reason is a pause for the CLI's tool runner and must not close stdin.
- `claude-stream.ts` supports three turn-boundary sources: `stream_event.message_delta.delta.stop_reason`, legacy `assistant.message.stop_reason`, and terminal `result` surfaced as `usage`. Deduplicate boundaries by assistant message id, emit all tool calls before `turn_end`, and reject forwarded sub-agent boundaries with non-null `parent_tool_use_id`.
- A stream-json `result` ends a user turn, not the CLI process. Use it as a per-turn artifact-echo reset even when partial-message boundaries are absent. Do not introduce a CLI-version gate for these frame variations.
- Recorded evidence lives in `apps/daemon/tests/fixtures/claude-cli-recordings/README.md`. Use those verbatim recordings for new boundary assertions; older hand-built fixtures may describe obsolete wrapper shapes.

## Product steering and questions

Product clarification uses `<question-form>` artifacts; see `apps/web/AGENTS.md`
and `apps/daemon/src/prompts/AGENTS.md`. This describes OpenDesign's product protocol,
not the repository contributor's conversation interface.

`POST /api/runs/:id/steer` sends a further user message into a running turn;
it is not a host-question answer path. Use `classifyRunSteering` in
`run-steering.ts` for admissibility rather than re-deriving it at call sites.
There is no `AskUserQuestion` tool wiring or `/api/runs/:id/tool-result` host
return path. Changes to that product protocol require its consumers to agree.

## Validation

Use focused parser tests and recorded CLI replays; see `mocks/README.md` for
trace selection. A source-checkout PATH overlay is:

```bash
export PATH="$PWD/mocks/bin:$PATH" OD_MOCKS_TRACE=<8-char-id> OD_MOCKS_NO_DELAY=1
```

Do not put repository-maintenance instructions into product prompt assets.

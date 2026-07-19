# `mocks/` — replay-based mock CLIs for OD's supported agents

A drop-in replacement for the real agent CLIs (`amp`, `claude`, `opencode`,
`codex`, `gemini`, `cursor-agent`, `deepseek`, `qwen`, `grok`, the
ACP family `devin` / `hermes` / `kilo` / `kimi` / `kiro` / `vibe`, and
the AMR `vela` CLI) that replays pre-recorded sessions in each CLI's
native protocol — stdout streaming for most, JSON-RPC over stdio for
ACP and AMR. **Zero LLM tokens.**

Used by:

- **E2E tests** in `apps/daemon/tests/` — run the full chat-server
  pipeline against a known agent trace, assert UI events / artifacts.
- **Local self-tests during development** — iterate on `routes/chat.ts`,
  `runtimes/claude-stream.ts`, `runtimes/json-event-stream.ts` parser changes without
  burning provider budget.
- **Demo / onboarding** — show what a 17-tool `claude` editing session
  looks like end-to-end, offline.
- **Regression harness** — replay the same trace before and after a
  charter / parser change; diff the events the daemon surfaces.

The recordings are anonymized exports from open-design's Langfuse
project (179 traces across 9 agents and 5+ skills as of this commit).

---

## tl;dr

```bash
# First-time setup — pull the recording corpus from R2 (~30s, 4.5MB):
bash mocks/scripts/fetch-recordings.sh
# Subsequent runs hit the local cache (sha256-verified, instant).

# Make the mock CLIs override the real ones for this shell:
export PATH="$PWD/mocks/bin:$PATH"

# Pick any recording to play back (8-char prefix OK):
export OD_MOCKS_TRACE=04097377

# Speed up replay (skip inter-event sleeps):
export OD_MOCKS_NO_DELAY=1

# Now anything that spawns opencode/claude/codex gets the recording:
echo "any prompt body" | opencode run
echo "any prompt"     | claude -p --output-format=stream-json
echo "any prompt"     | codex exec
```

The mock binaries are bash wrappers that exec
`node mocks/mock-agent.mjs --as <agent>`. Anything fed to stdin is
discarded by the renderer but used by the recording picker (see hash
mode below).

## Recordings live on R2, not in this repo

The 179-recording corpus (~4.5 MB) is hosted on Cloudflare R2 at
`open-design-mocks` and fetched **on demand** — `pnpm install` does NOT
pull them, and the repo stays small. Recordings only land in
`mocks/recordings/` when:

1. You run `bash mocks/scripts/fetch-recordings.sh` directly, OR
2. `bash mocks/scripts/smoke-test.sh` runs and the dir is empty (auto-
   fetch fallback), OR
3. A mock binary spawn finds no data — it errors with a pointer at the
   fetch script (no silent failure).

This is by design: contributors who don't touch agent code don't pay
the fetch cost. CI jobs that DO touch agent code (`apps/daemon/tests/`
parser changes, etc.) run the fetch as a quick pre-step and cache
`mocks/recordings/` between runs.

```bash
# Fetch everything (parallel, sha256-verified, idempotent):
bash mocks/scripts/fetch-recordings.sh

# Fetch a subset:
bash mocks/scripts/fetch-recordings.sh --agent claude       # 57 claude traces
bash mocks/scripts/fetch-recordings.sh --outcome failed     # 35 failed-path traces
bash mocks/scripts/fetch-recordings.sh --skill agent-browser

# Override cache location (e.g. share across multiple OD checkouts):
OD_MOCKS_CACHE_DIR=~/.cache/od-mocks bash mocks/scripts/fetch-recordings.sh
```

Manifest at `mocks/manifest.json` is the committed source of truth —
it lists every recording's `trace_id`, `sha256`, `bytes`, `agent`,
`outcome`, `skills`, `multi_turn`, plus histograms over the corpus.
Tooling reads this; you don't have to.

### Provenance per recording

Beyond identity (`trace_id`, `sha256`), each manifest entry carries
fixture-trust signals so consumers can decide whether the recording
is still meaningful as the real CLIs evolve:

| Field | Meaning |
|---|---|
| `captured_at` | ISO 8601 timestamp of the original session — populated for all 179 current entries |
| `cli_version` | The CLI version the trace was captured against (e.g. `"claude-code 1.0.65"`) — populated only on traces the harvester writes it to, null otherwise |
| `protocol_version` | Stream-format version (`"claude-stream-json/v1"`, `"opencode/json-event-stream"`) — populated by harvester |
| `anonymization_version` | Which anonymizer pass scrubbed the recording — populated by harvester |

For now most of these are null on the existing 179 — the harvester in
[nexu-io/agent-pr-explore][harvester] is the next thing to teach to
write them. Once a recording's `cli_version` falls behind the actual
CLI by more than one minor version, treat it as a candidate for
re-harvest.

### Golden daemon-event snapshots

`mocks/golden/<trace>.events.json` holds the exact event sequence the
OD daemon emits when fed each (mock CLI → handler) pipeline. Diffed
on every `pnpm --filter @open-design/daemon test` run by
`apps/daemon/tests/mocks-golden.test.ts`.

A parser refactor that semantically changes events (drops a field,
renames `sessionId`, stops emitting `turn_end`) fails the diff loudly.
After an intentional parser change, regenerate:

```bash
MOCKS_GOLDEN_UPDATE=1 pnpm --filter @open-design/daemon test mocks-golden
git diff mocks/golden/    # eyeball the new shapes
git add mocks/golden/ && git commit -m "mocks: refresh goldens for <parser change>"
```

Per-spawn volatile fields (currently just claude's generated
`sessionId`) are stripped to `"<normalized>"` so the snapshot stays
stable. See `mocks/golden/README.md` for the coverage rationale.

### Real-CLI contract check

The mocks catch parser regressions against the recordings; they do
**not** catch the recordings themselves drifting away from the live
agent CLIs. For that, `mocks/scripts/contract-check.sh` spawns a real
CLI alongside the mock with a fixed prompt and prints a side-by-side
event-type distribution.

This is human-driven and costs real LLM tokens — run on a real-CLI
release or before a parser refactor, not on a cron. Full doc:
[`docs/MOCKS-CONTRACT-CHECK.md`](../docs/MOCKS-CONTRACT-CHECK.md).

---

## What gets emitted

Each renderer matches the EXACT event shapes the OD daemon expects, as
verified line-by-line against the parsers in `apps/daemon/src/`:

| CLI | OD streamFormat | Parser source |
|---|---|---|
| `opencode`        | `json-event-stream` (opencode kind)     | `runtimes/json-event-stream.ts:handleOpenCodeEvent`   |
| `codex`           | `json-event-stream` (codex kind)        | `runtimes/json-event-stream.ts:handleCodexEvent`      |
| `amp` `claude`    | `claude-stream-json`                    | `runtimes/claude-stream.ts:createClaudeStreamHandler` |
| `gemini`          | `json-event-stream` (gemini kind)       | `runtimes/json-event-stream.ts:handleGeminiEvent`     |
| `cursor-agent`    | `json-event-stream` (cursor-agent kind) | `runtimes/json-event-stream.ts:handleCursorEvent`     |
| `deepseek` `qwen` `grok` | `plain`                          | `server.ts` (raw stdout = final assistant text) |
| `kimi`            | `json-event-stream` (kimi kind)         | `runtimes/json-event-stream.ts:handleKimiEvent`         |
| `devin` `hermes` `kilo` `kiro` `vibe` | `acp-json-rpc` | `agent-protocol/acp/session.ts:attachAcpSession`         |
| `vela` (AMR) | `acp-json-rpc` + `login` / `models` subcommands | `runtimes/defs/amr.ts` + `apps/daemon/tests/fixtures/fake-vela.mjs` (sibling stub) |

> **Note on `cursor-agent`**: OD's parser does NOT recognize tool-call
> events — only init / assistant text / usage. The renderer therefore emits
> only the final assistant text wrapped in the expected init/text/usage
> envelope. Tool calls present in the source recording are silently dropped.
> `gemini` recognizes the current Gemini CLI `stream-json` tool_use /
> tool_result frames and replays recorded tool calls through that envelope.

> **Note on ACP agents** (`devin` / `hermes` / `kilo` / `kiro` /
> `vibe`): These do NOT stream stdout — they speak JSON-RPC v2 over stdio.
> OD's daemon sends `initialize` → `session/new` → (optional `session/set_model`)
> → `session/prompt`; the mock responds in order, streams text via
> `session/update` notifications carrying `agent_message_chunk` parts,
> then responds to the prompt request with usage stats. Tool calls
> aren't part of the ACP protocol on this path (tools surface via MCP or
> other side channels), so they're dropped from playback.

> **Note on `kimi`**: Modern Kimi CLI is not an ACP stdio adapter in Open
> Design. The runtime launches it in prompt mode (`kimi -p ... --output-format
> stream-json`), so the mock replays Kimi-flavored JSON-event-stream frames
> instead of JSON-RPC.

> **Note on `vela` (AMR)**: vela is the bin OD's AMR runtime spawns. It
> extends the generic ACP shape with `agentCapabilities` + `models`
> blocks in `initialize` / `session/new`, plus a **strict set_model gate**
> — `session/prompt` is rejected with -32602 until `session/set_model`
> (or `session/set_config_option`) has been called for the current
> sessionId, mirroring real vela 0.0.1 contract.
>
> vela also has two non-ACP subcommands:
>
> - `vela login` → writes `~/.amr/config.json` with a fake profile so
>   OD's daemon login route + `AmrLoginPill` poller see the same on-disk
>   projection production produces.
> - `vela models` → prints the production-shaped `public_model_*    vela`
>   catalog.
>
> Error injection envs (kept in sync with
> `apps/daemon/tests/fixtures/fake-vela.mjs`):
> `FAKE_VELA_SESSION_NEW_ERROR` / `FAKE_VELA_SET_MODEL_ERROR` /
> `FAKE_VELA_PROMPT_ERROR` / `FAKE_VELA_LOGIN_FAIL` /
> `FAKE_VELA_REQUIRE_SET_MODEL=0`.

Each tool call from the recording is rendered with the original input
arguments and tool output. The agents' assistant text is rendered as
the final message.

---

## Recording selection

Driven by env vars, in priority order:

| Env | Behavior |
|---|---|
| `OD_MOCKS_TRACE=<id>` | Always play this trace. 8-char prefix OK. |
| `OD_MOCKS_BY_PROMPT_HASH=1` + stdin prompt | Deterministic by `sha256(prompt) % len(all)`. Same prompt → same trace. Useful for "stable answer per question" tests. |
| `OD_MOCKS_POOL=<tag>` | Random within the tag pool. Examples: `agent:claude`, `skill:agent-browser`, `outcome:failed`. |
| `OD_MOCKS_SEED=<str>` | Makes "random" picks reproducible across runs. |
| `OD_MOCKS_NO_DELAY=1` | Skip inter-event waits. |
| `OD_MOCKS_RECORDINGS_DIR=<path>` | Override the recordings dir. |

If none are set, a uniformly random recording is played each invocation.

The mock binary announces the picked trace id on stderr:

```
[mock-opencode] picked 04097377… via fixed
```

This line is invisible to OD's stdout parser but useful for "wait, why
did my test get the FAQ-fix trace?" debugging.

---

## Recording catalog

The recordings live as one JSONL file per Langfuse trace under
`recordings/`. Each file starts with a `meta` event carrying:

```json
{
  "type": "meta",
  "source": {"provider": "langfuse", "trace_id": "...", "project_id": "..."},
  "agent": "claude" | "codex" | "opencode" | "gemini" | "cursor-agent" | "qwen" | "copilot" | "deepseek" | "antigravity",
  "model": "...",
  "outcome": "succeeded" | "failed" | "errored" | "interrupted",
  "duration_ms": 33620,
  "tool_call_count": 17,
  "error_count": 0,
  "total_tokens": 12345,
  "tags": ["agent:claude", "skill:agent-browser", "open-design", ...],
  "user_input": "...",
  "session_id": "..."
}
```

Subsequent events are `tool_call`, `tool_result`, and `report` (the
final assistant text).

### Indexed metadata

`mocks/manifest.json` is a flat manifest with one entry per recording
plus histograms over all recordings, committed to the repo. It's also
mirrored to R2 alongside the .jsonl files so consumers can fetch the
current catalog without cloning. Query with `jq`:

```bash
# All multi-turn claude sessions about HTML editing
jq '.entries[] | select(.agent=="claude" and .multi_turn==true)' \
  mocks/manifest.json | head -50

# Failed codex traces (negative-path tests)
jq '.entries[] | select(.agent=="codex" and .outcome=="failed") | .trace_id' \
  mocks/manifest.json

# Agent-browser skill, sorted by tool count desc
jq '[.entries[] | select(.skills | index("agent-browser"))] | sort_by(-.tool_count)' \
  mocks/manifest.json
```

### Headline stats (current dataset)

| Dimension | Distribution |
|---|---|
| Agents | claude 57 · opencode 41 · codex 38 · gemini 25 · cursor-agent 11 · qwen/copilot/deepseek 2 each · antigravity 1 |
| Outcomes | succeeded 144 · failed 35 |
| Skills | default 71 · ad-creative 50 · algorithmic-art 30 · agent-browser 22 · video-hyperframes 2 · magazine-web-ppt / brainstorming / data-report / penpot-flutter 1 each |
| Multi-turn | 124 traces tied to a session with ≥2 turns |
| Artifact | 18 traces produce `<artifact>` output |

---

## Anonymization

User-specific data has been scrubbed from every recording:

- `/Users/<name>/…`, `/home/<name>/…`, `C:\Users\<name>\…`
  → `${HOME}/…` / `%USERPROFILE%\…`
- Project UUIDs → stable `proj-001`, `proj-002`, … per recording
- meta tag `project:<uuid>` rewritten too

The anonymizer is idempotent. Tool input/output payloads (HTML, code,
etc.) are preserved verbatim — they're templated UI without cell-level
PII; if a future audit finds otherwise, add specific scrubs in the
harvester repo (see "Adding more recordings" below) and re-run.

---

## Adding more recordings

Local maintainer flow — the .jsonl never enters the repo. Only the
manifest delta (≈200 B per entry) gets committed.

### Step 1 — produce an anonymized .jsonl

The harvester that produced the current 179-trace set lives in a
separate repo, [nexu-io/agent-pr-explore][harvester]. See its README
for how to authenticate against your trace store, filter by skill /
agent / outcome, and anonymize the result. Output is one
`<trace-id>.jsonl` file per recording.

[harvester]: https://github.com/nexu-io/agent-pr-explore

### Step 2 — one-shot upload + manifest update

```bash
# prereq, once: wrangler login (OAuth, no token to manage)
bash mocks/scripts/upload-recording.sh /path/to/<trace-id>.jsonl
```

The script validates the file, prints the manifest entry it will add,
uploads the .jsonl to R2, rewrites `mocks/manifest.json` locally, then
uploads the updated manifest to R2 too (so consumers see the new entry
without waiting for the next git push).

### Step 3 — commit the manifest delta

```bash
git add mocks/manifest.json
git commit -m "mocks: add recording <trace-id>"
git push     # or open a PR — your call
```

The only thing in the commit is a ~200-byte JSON edit listing the new
entry's `trace_id`, `sha256`, `bytes`, `agent`, `outcome`, `skills`,
etc. The .jsonl itself stays in R2.

### Trust model

- **R2 write is wrangler-OAuth gated.** Maintainers do `wrangler login`
  once. The bucket is on the powerformer Cloudflare account (pinned in
  the script). No long-lived tokens in repo secrets, no Action to
  hijack — just account access.
- **Repo stays small forever.** No .jsonl files ever land in git; the
  manifest grows by ~200 B per recording.
- **Read stays public.** Anyone can fetch via the r2.dev URL — see
  [Recordings live on R2, not in this repo](#recordings-live-on-r2-not-in-this-repo).

### Removing a recording

```bash
# 1. delete from R2
export CLOUDFLARE_ACCOUNT_ID=64ad4569ffd912432d6b86d5656484c4
wrangler r2 object delete open-design-mocks/recordings/v1/<trace-id>.jsonl --remote
# 2. drop the entry from manifest.json (edit by hand, or use `jq`)
# 3. re-upload manifest
wrangler r2 object put open-design-mocks/recordings/v1/manifest.json \
  --file mocks/manifest.json --remote
# 4. git add mocks/manifest.json && git commit && git push
```

There's no automation for delete because (a) it's rare and (b) you
want a human to think about whether removing a recording would
invalidate any test fixtures that pin it via `OD_MOCKS_TRACE=<id>`.

---

## Usage from OD's test code

### From a test (Vitest / Jest)

```ts
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const MOCK_BIN = join(__dirname, '../../mocks/bin');

it('parses an opencode session with 4 tool calls into 4 UI events', async () => {
  const child = spawn('opencode', ['run'], {
    env: {
      ...process.env,
      PATH: `${MOCK_BIN}:${process.env.PATH}`,
      OD_MOCKS_TRACE: '06a9324a',   // 4-tool claude session
      OD_MOCKS_NO_DELAY: '1',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin.write('test prompt');
  child.stdin.end();
  // ... assert events parsed from child.stdout
});
```

### From a manual playback

```bash
# See what claude's 17-tool "delete v2" session emits to OD:
export PATH=$(git rev-parse --show-toplevel)/mocks/bin:$PATH
export OD_MOCKS_TRACE=04097377
export OD_MOCKS_NO_DELAY=1
echo "anything" | claude -p --output-format=stream-json | jq .type | uniq -c
```

---

## Files

```
mocks/
├── README.md                 ← you are here
├── mock-agent.mjs                ← entry; routes --as <agent> to format renderer
├── lib/
│   ├── recording-picker.mjs      ← env-driven trace selection
│   ├── format-opencode.mjs       ← matches handleOpenCodeEvent
│   ├── format-codex.mjs          ← matches handleCodexEvent
│   ├── format-claude.mjs         ← matches createClaudeStreamHandler
│   ├── format-gemini.mjs         ← matches handleGeminiEvent
│   ├── format-cursor-agent.mjs   ← matches handleCursorEvent
│   ├── format-acp.mjs            ← JSON-RPC server matching attachAcpSession
│   ├── format-kimi.mjs           ← kimi stream-json renderer
│   ├── format-vela.mjs           ← AMR vela: ACP + models block + set_model gate
│   ├── vela-subcommands.mjs      ← `vela login` + `vela models` handlers
│   └── format-plain.mjs          ← raw stdout (deepseek/qwen/grok)
├── bin/
│   ├── amp  claude  codex  opencode  opencode-cli
│   ├── gemini    cursor-agent
│   ├── deepseek  qwen    grok
│   ├── devin hermes kilo kimi kiro kiro-cli vibe vibe-acp
│   └── vela                       ← 19 PATH-overlay wrappers
├── manifest.json                 ← committed: 179 entries' metadata + sha256 + provenance + R2 storage hints
├── golden/                       ← committed: daemon-event regression snapshots
│   ├── README.md
│   └── *.events.json             ← 3 representative traces (claude/codex/opencode)
├── scripts/
│   ├── smoke-test.sh             ← 21 checks; auto-fetches recordings if empty
│   ├── fetch-recordings.sh       ← pull from R2 (parallel, sha256-verified, idempotent)
│   ├── upload-recording.sh       ← maintainer-local: validate + wrangler put + manifest update
│   ├── contract-check.sh         ← real-CLI vs mock protocol drift check (manual)
│   └── lib/
│       └── manifest-utils.mjs    ← shared sha256 / meta-parse / manifest-rebuild logic
└── recordings/                   ← populated at runtime, gitignored .jsonl
    └── .gitignore                ← recordings come via fetch
```

No external dependencies. Pure node:`fs`/`crypto`/`child_process`. Works
under any Node ≥18.

---

## Limitations

- `copilot`, `qoder`, `pi` (the niche `copilot-stream-json` /
  `qoder-stream-json` / `pi-rpc` formats) are recorded but not yet
  rendered as their native protocols — they fall back to the plain
  renderer for now. If you need them, add a `format-<agent>.mjs`
  following the same pattern as `format-codex.mjs`; the parsers are
  in `apps/daemon/src/copilot-stream.ts`,
  `apps/daemon/src/runtimes/qoder-stream.ts`, and
  `apps/daemon/src/agent-protocol/pi-rpc/session.ts`.
- The mock does not honor CLI flags that change semantics (`--model`,
  `--permission-mode`, `--allowed-tools`). They're silently ignored.

---

## Provenance / safety

All recordings come from open-design's own Langfuse project (the
`open-design` project under the `powerformer` org). Users opted into
telemetry when they installed the desktop client. The anonymizer
removed user-identifying paths and project UUIDs before checking in.

If you find a recording that includes content that should be redacted,
follow the [Removing a recording](#removing-a-recording) flow above.

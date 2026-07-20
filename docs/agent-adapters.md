# Agent Adapters

**Parent:** [`spec.md`](spec.md) · **Siblings:** [`architecture.md`](architecture.md) · [`skills-protocol.md`](skills-protocol.md) · [`new-agent-runtime-acp.md`](new-agent-runtime-acp.md) · [`modes.md`](modes.md)

The adapter layer is OD's most load-bearing design decision. We delegate the **entire agent loop** — model calls, tool use, context management, permission handling, resume, cancel — to the user's existing code agent CLI. OD's job is to detect it, feed it a skill + prompt + working directory, and stream its output back to the web UI.

If you're adding a new ACP-backed runtime, start with [`new-agent-runtime-acp.md`](new-agent-runtime-acp.md) for the expected stdio transport, JSON-RPC message flow, and process lifecycle contract.

> **Thesis:** The code agent space has already converged on strong implementations (Claude Code, Codex, Devin for Terminal, Cursor Agent, OpenCode, Qoder CLI, and others). Reimplementing another one is worse than talking to all of them.
>
> **Inspiration:** [multica](https://github.com/multica-ai/multica) (PATH-scan detection + daemon architecture) and [cc-switch](https://github.com/farion1231/cc-switch) (per-agent config format knowledge + symlink-based skill distribution).

---

## 1. Adapter contract: a data spec, not a class

An adapter is **not** a class that implements the agent loop. It is a **plain data object** — one `RuntimeAgentDef` object literal per CLI — that declares *how to talk to* that CLI: which binary to probe, how to build its argv, how it streams, what it can do. A **generic engine** reads those fields and does the detecting, launching, invoking, and stream-parsing for every agent uniformly. There is no per-agent subclass and no `run()` / `cancel()` method to implement.

Where the pieces live (all under `apps/daemon/src/`):

- **The contract (the data spec):** [`runtimes/types.ts`](../apps/daemon/src/runtimes/types.ts) — the `RuntimeAgentDef` type.
- **One def per CLI:** [`runtimes/defs/*.ts`](../apps/daemon/src/runtimes/defs) — `claude.ts`, `codex.ts`, `cursor-agent.ts`, `devin.ts`, … each exports a single object literal.
- **The registry (a unique-id array):** [`runtimes/registry.ts`](../apps/daemon/src/runtimes/registry.ts) — `BASE_AGENT_DEFS` collects every def into `AGENT_DEFS`; a boot-time loop throws on any duplicate `id`.
- **The generic engine (zero per-agent code):** `detection.ts`, `capabilities.ts`, `executables.ts` / `resolution.ts`, `launch.ts`, `invocation.ts`, `env.ts`, `mcp.ts`, `models.ts`, `prompt-budget.ts` under `runtimes/`, plus the stream dispatch in [`server.ts`](../apps/daemon/src/server.ts) that routes each def's `streamFormat` / `eventParser` to the matching `*-stream.ts` parser.
- **The public barrel:** [`agents.ts`](../apps/daemon/src/agents.ts) re-exports `AGENT_DEFS`, `getAgentDef`, `detectAgents`, `resolveAgentLaunch`, … from `runtimes/`. It defines nothing itself — import from it for convenience, but read `runtimes/` for the contract.

> **Adding a CLI is a one-file change.** Drop a new `runtimes/defs/<cli>.ts` exporting one `RuntimeAgentDef`, add it to the `BASE_AGENT_DEFS` array in `registry.ts`, and the engine detects, launches, invokes, and (for an existing `streamFormat`) streams it — **no engine edits, no new class, no method overrides.** The def is config; the loop is shared. A genuinely new wire format is the only case that also adds an engine file (a new `*-stream.ts` and a `streamFormat` value).

### The data spec (`RuntimeAgentDef`, abbreviated)

The full type lives in `runtimes/types.ts`; the load-bearing fields:

```ts
type RuntimeAgentDef = {
  id: string;                 // unique key, e.g. "claude" | "codex" — the registry dedupes on it
  name: string;               // display name
  bin: string;                // CLI executable to probe on PATH
  fallbackBins?: string[];    // alternate executable names
  versionArgs: string[];      // args for the version / detection probe
  fallbackModels: RuntimeModelOption[];

  // How to invoke: build the argv for one turn from the composed prompt.
  buildArgs: (
    prompt: string,
    imagePaths: string[],
    extraAllowedDirs?: string[],
    options?: RuntimeBuildOptions,
    runtimeContext?: RuntimeContext,
  ) => string[];

  // How it talks back: the engine dispatches these to the matching parser.
  streamFormat: string;               // e.g. "claude-stream-json" | "acp-json-rpc" | "plain"
  eventParser?: string;               // named parser, e.g. "codex" | "cursor-agent" | "opencode"

  // How the prompt is delivered.
  promptViaStdin?: boolean;
  promptViaFile?: boolean;
  promptInputFormat?: 'text' | 'stream-json';

  // Optional capability / integration declarations (all data, no behavior).
  supportsImagePaths?: boolean;
  externalMcpInjection?: 'claude-mcp-json' | 'acp-merge' | 'opencode-env-content';
  authProbe?: { args: string[]; timeoutMs?: number };
  listModels?: RuntimeListModels;     // dynamic model discovery
  // …~30 more optional fields, every one data or a pure arg-builder.
};
```

Every field is **data or a pure arg-builder** — there is no `run()`, no `cancel()`, no subclass. Capabilities, detection, cancellation, and streaming are the engine's job, driven off these declarations, which is why a new agent needs only a new object rather than a new code path.

### A concrete def (shape)

```ts
// runtimes/defs/acme.ts (illustrative — a made-up CLI, not a shipped def)
export const acmeAgentDef: RuntimeAgentDef = {
  id: 'acme',
  name: 'Acme CLI',
  bin: 'acme',
  versionArgs: ['--version'],
  fallbackModels: [{ id: 'acme-pro', label: 'Acme Pro' }],
  streamFormat: 'claude-stream-json',   // reuse an existing parser — no engine change
  promptViaStdin: true,
  buildArgs: (prompt, imagePaths, extraDirs, opts) => [
    '--output-format', 'stream-json',
    /* … */
  ],
};
```

### The registry (a unique-id array)

```ts
// runtimes/registry.ts
const BASE_AGENT_DEFS: RuntimeAgentDef[] = [
  claudeAgentDef, codexAgentDef, devinAgentDef, cursorAgentDef,
  /* … one entry per CLI (roughly two dozen today) … */
];

// boot-time invariant: no two defs may share an id
const ids = new Set<string>();
for (const def of AGENT_DEFS) {
  if (ids.has(def.id)) throw new Error(`Duplicate agent definition id: ${def.id}`);
  ids.add(def.id);
}
```

`AGENT_DEFS` = `BASE_AGENT_DEFS` plus any user-defined local profiles (`readLocalAgentProfileDefs`), and `getAgentDef(id)` is the lookup the rest of the daemon uses. The event set the `*-stream.ts` parsers emit onto the UI stream (thinking / tool-call / tool-result / text-delta / file-write / error / done) is defined by those parsers, not by the def — see §11 for where they live and `server.ts` for the dispatch.

## 2. Detection strategy

`detectAgents()` and `detectAgentsStream()` probe all registered definitions in
parallel whenever they are invoked. The daemon warms detection at startup, and
agent-list/run paths invoke it again when they need fresh availability or model
data; there is no persisted 24-hour detection result.

For each definition, detection:

1. Calls `resolveAgentLaunch()` so it probes the same configured, fallback, or
   packaged executable path that a run will actually spawn—not merely the first
   PATH-visible shim.
2. Runs the definition's version probe. An OS-level missing or non-executable
   result marks the adapter unavailable; a CLI that launches but rejects its
   version flag remains available with no version string.
3. After availability is established, runs help/capability, model-discovery,
   and declared auth probes concurrently. Definitions without `authProbe` are
   not assigned a synthetic auth failure from a config-directory guess.

Each adapter probe is fault-isolated so one broken executable cannot empty the
whole picker. Capability flags and recently discovered live models are retained
in process for invocation/model validation, and each detection pass refreshes
them.

## 3. Shipped adapter catalog

The authoritative list is `BASE_AGENT_DEFS` in
[`runtimes/registry.ts`](../apps/daemon/src/runtimes/registry.ts). The shipped
definitions currently group by transport as follows:

| Stream format | Runtime ids |
|---|---|
| `claude-stream-json` | `claude`, `amp`, `codebuddy` |
| `json-event-stream` | `codex`, `cursor-agent`, `opencode`, `mimo`, `byok-opencode` |
| `copilot-stream-json` | `copilot` |
| `qoder-stream-json` | `qoder` |
| `acp-json-rpc` | `amr` (Vela), `devin`, `hermes`, `kimi`, `kiro`, `kilo`, `reasonix`, `trae-cli`, `vibe` |
| `pi-rpc` | `pi` |
| `plain` | `aider`, `antigravity`, `atomcode`, `deepseek`, `grok-build`, `qwen` |

`byok-opencode` is the API-backed OpenCode-compatible profile rather than an
additional local executable. User-defined local profiles may extend the base
registry at runtime. Gemini remains available as a BYOK provider and MCP client
target, but its local generation runtime was retired and is not an adapter id.

## 4. Skill composition and staging

Skill delivery is shared daemon behavior; individual runtime definitions do not
select a native, prompt, or project-instruction strategy.

For each run the daemon:

1. Resolves the primary project/request skill, any additional `skillIds`
   selected through `@` mentions, and applicable plugin-provided skills.
2. Composes the selected `SKILL.md` bodies into the system prompt. It does not
   automatically inline every `references/*.md` file. Instead, the skill-root
   preamble tells the agent where the staged skill lives and identifies side
   files referenced by the body so the agent can read them when needed.
3. Attempts to copy each selected skill directory into
   `<project-cwd>/.od-skills/<basename>-<source-path-hash>/`. These are real,
   dereferenced project-private copies—not symlinks or junctions—so a tool that
   edits the staged tree cannot mutate the source skill. The copy path includes
   a recursive stream-copy fallback for recoverable cross-filesystem failures.
4. Supplies both the cwd-relative staged path and the absolute source fallback
   in the prompt. Definitions that accept additional directories may also
   receive external skill/design-system roots as CLI flags or system-prompt
   hints, according to their declared arg builder.

This is why `RuntimeAgentDef` has no `nativeSkillLoading` or
`skillInjectionStrategy` field, and why the daemon does not create
`.cursorrules` or install selected skills into an agent's home directory as part
of a run. See [`skills-protocol.md`](skills-protocol.md) for the skill format;
the active-run staging implementation is in
[`server.ts`](../apps/daemon/src/server.ts),
[`skills.ts`](../apps/daemon/src/skills.ts), and
[`cwd-aliases.ts`](../apps/daemon/src/cwd-aliases.ts).

## 5. Per-adapter notes

### 5.1 Claude Code (reference implementation)

- Invocation starts with `claude -p --input-format stream-json --output-format
  stream-json --verbose`; model, capability-gated partial-message/extra-dir
  flags, native session `--resume` or `--session-id`, and
  `--permission-mode bypassPermissions` are appended when applicable. The
  process itself is spawned in the effective project cwd; there is no
  `--cwd <artifact-dir>` prompt invocation.
- The composed prompt is written as one JSONL `user` message. Stdin remains
  open so the daemon can forward additional user messages mid-turn, then is
  closed after a clean terminal `turn_end`/`usage` rather than at a mid-tool
  `tool_use` pause.
- [`runtimes/claude-stream.ts`](../apps/daemon/src/runtimes/claude-stream.ts)
  translates Claude's structured stdout into the shared event stream. The
  generic run lifecycle owns process termination and cancellation.
- Selected skills use the shared composition/staging path in §4; a run does
  not symlink them into `~/.claude/skills/`.

### 5.2 BYOK OpenCode

- The former direct-Anthropic fallback was replaced by the
  `byok-opencode` profile. API-mode provider credentials and model selection
  are translated into OpenCode configuration, while the installed
  `opencode-cli`/`opencode` process still owns the model/tool loop.
- Invocation is `opencode run --format json` with the composed prompt on
  stdin and the selected provider/model passed through OpenCode's model
  syntax. The profile shares the OpenCode JSON-event parser and external MCP
  injection path.
- There is no daemon-owned fallback loop or daemon implementation of
  `Read`/`Write`/`Edit` tools, and this profile is not an automatic recovery
  target for failed local agents.

### 5.3 Codex

- A new session runs `codex exec --json --skip-git-repo-check` with the
  effective sandbox configuration, create-only `-C`/`--add-dir` arguments,
  and optional model/reasoning overrides. The composed prompt is written to
  stdin.
- [`runtimes/json-event-stream.ts`](../apps/daemon/src/runtimes/json-event-stream.ts)
  parses Codex's structured JSON events; this is not a regex-based plain-text
  adapter. The parser captures `thread.started.thread_id`.
- Follow-up turns use `codex exec resume --json ... <thread-id>`. Resume uses
  `-c sandbox_mode=...` because Codex rejects create-only `--sandbox`, `-C`,
  and `--add-dir` flags on `exec resume`.
- Detection uses `codex login status` for auth and `codex debug models` for
  live model discovery, with static model hints as a fallback. Skills use the
  shared composition/staging path in §4 rather than version-gated loading from
  `~/.codex/skills/`.

### 5.4 Devin for Terminal

- Invocation: `devin --permission-mode dangerous --respect-workspace-trust false acp`.
- Install/update: macOS/Linux/WSL users can install with `curl -fsSL https://cli.devin.ai/install.sh | bash`; run `devin update` for existing installs.
- Version requirement: requires a Devin CLI build with the `devin acp` subcommand (verified with `devin 2026.5.1-1`). Check with `devin acp --help`; if the subcommand is missing, update or reinstall Devin for Terminal.
- Streaming: Agent Client Protocol JSON-RPC over stdio, handled by the daemon's shared `acp-json-rpc` transport.
- Skills: selected skills use the shared composition/staging path in §4; no
  Devin-specific skill installation is required for a run.
- Surgical edits: Devin's own edit/write tools handle targeted changes.
- Permission: `--permission-mode dangerous` avoids headless approval prompts in the web UI; `--respect-workspace-trust false` ensures Devin doesn't block on trust prompts for newly created project dirs. Org/team-level policies still apply inside Devin.

### 5.5 Cursor Agent

- Invocation uses `cursor-agent --print --output-format stream-json
  --stream-partial-output --force`, capability-gated `--trust`,
  `--workspace <project-cwd>`, and an optional model. The composed prompt is
  delivered on stdin rather than as a positional argument.
- Cursor's JSONL is parsed by the shared `json-event-stream` dispatcher with
  the `cursor-agent` parser. Detection uses `cursor-agent status` for auth and
  `cursor-agent models` for live model discovery.
- Selected skills use §4's prompt composition and `.od-skills` copies. The
  daemon does not generate a `.cursorrules` file.
- `--workspace` chooses the starting workspace; `--force` and optional
  `--trust` are part of the non-interactive authority posture described in
  §10, not a filesystem sandbox supplied by Open Design.

### 5.6 OpenCode

- OpenCode runs as `opencode run --format json` with the prompt on stdin.
  Newer builds that advertise `--dangerously-skip-permissions` from
  `opencode run --help` receive that flag; older builds keep the compatible
  argv without it.
- The adapter discovers models with `opencode models`, parses structured JSON
  events, and captures OpenCode's `sessionID`. Follow-up turns continue the
  native session with `-s <session-id>`.
- External MCP configuration is supplied per invocation through
  `OPENCODE_CONFIG_CONTENT`; selected skills still use the shared §4 path.

### 5.7 GitHub Copilot CLI

- Invocation is `copilot --allow-all-tools --output-format json` with optional
  model and repeated `--add-dir` arguments. The daemon omits `-p` entirely and
  pipes the composed prompt to stdin; `-p -` would be interpreted as the
  literal prompt `-`.
- `--allow-all-tools` is required for non-interactive execution; without it
  Copilot can block waiting for a tool-approval prompt. `--add-dir` widens the
  CLI's path access to explicitly supplied external roots.
- Streaming: `--output-format json` emits JSONL with the same expressive shape as Claude Code's stream-json (`assistant.reasoning_delta`, `assistant.message_delta`, `tool.execution_start/complete`, `result`). `apps/daemon/src/copilot-stream.ts` maps these onto the same UI events as `claude-stream.ts`.
- Skills use the shared composition/staging path in §4.
- Surgical edits: dedicated `edit` tool.
- Copilot declares no proactive `authProbe`; detection proves that the binary
  is invocable, while login and account scope remain owned by the CLI.

### 5.8 Qoder CLI

- Invocation is `qodercli -p --output-format stream-json --yolo -w
  <project-cwd>` with optional model, repeated absolute `--add-dir`, and one
  `--attachment <absolute-image-path>` per image. The composed prompt is
  delivered over stdin, and print mode exits after the turn.
- Streaming: `--output-format stream-json` emits JSONL records such as `system/init`, `assistant`, and `result`. `apps/daemon/src/runtimes/qoder-stream.ts` maps assistant content blocks to text deltas, maps assistant errors without text to typed error events, and preserves result usage, model usage, cost, duration, stop reason, and unknown records as raw events.
- Models: ships fallback hints for `default`, `lite`, `efficient`, `auto`, `performance`, and `ultimate`. Selecting `default` omits `--model` so Qoder's own CLI configuration remains authoritative.
- Skills use the shared §4 path. `--add-dir` is repeatable for absolute
  external roots; relative entries are not forwarded.
- Permission: `--yolo` avoids headless approval prompts. Treat this as the
  same trust posture as running Qoder directly with that flag in the selected
  project directory.
- **Gotcha:** Detection only proves `qodercli --version` can run. Qoder owns
  login/account scope; persisted `qodercli login` state or an inherited
  `QODER_PERSONAL_ACCESS_TOKEN` is outside daemon management. Run failures are
  surfaced instead of triggering a daemon login flow.

### 5.9 Trae CLI

- Invocation: `traecli acp serve --yolo`, using the daemon's shared ACP JSON-RPC transport. The adapter follows Trae CLI's public ACP entrypoint documented at https://www.volcengine.com/docs/86677/2227861?lang=zh.
- Streaming: `acp-json-rpc`; the daemon uses the same ACP event path as the other ACP-backed adapters.
- Models: dynamic via the ACP handshake. If model discovery fails, the picker falls back to the CLI's default configuration rather than requiring CI or startup detection to log in to Trae CLI.
- Skills use the shared §4 path. External MCP servers can be forwarded through the ACP launch descriptor with the existing `acp-merge` path.
- Permission: `--yolo` avoids headless approval prompts in the web UI. This follows the adapter catalog's existing non-interactive permission posture for CLIs such as Devin, Copilot, Qoder, and DeepSeek: the daemon runs agent CLIs without a TTY, so it must not rely on an interactive tool-approval prompt to make progress.
- **Gotcha:** Detection only proves `traecli --version` and model discovery can run in the current environment. Trae CLI owns login, account scope, and model entitlement; the daemon does not run login flows or edit Trae CLI configuration.

### 5.10 Pi

- Invocation: `pi --mode rpc [--model <id>] [--thinking <level>] [--append-system-prompt <dir> …]`, with the composed prompt delivered over stdin via JSON-RPC. The daemon sends a `prompt` command (optionally with `images` for multimodal input) and pi streams back typed events until `agent_end`. Pi's RPC process stays alive after `agent_end` (designed for multi-prompt sessions); the daemon closes stdin and SIGTERMs after a grace period since `/api/chat` is single-shot.
- Streaming: `pi-rpc` JSON-RPC over stdio. Events include `agent_start`, `turn_start/end`, `message_update` (text deltas, thinking deltas, tool calls), `tool_execution_start/end`, `compaction_start`, `auto_retry_start/end`, and `extension_error`. `apps/daemon/src/agent-protocol/pi-rpc/session.ts` maps them into the shared UI event stream. Errors from `extension_error` and exhausted `auto_retry_end` go through the daemon's normal stream-error and empty-output handling.
- Models: dynamic — `pi --list-models` prints a TSV table to stdout that the daemon parses into provider/model picker entries. Fallback hints for the most common providers/models are shipped for when the list command times out.
- Images: pi's RPC `prompt` command supports an `images` field (base64-encoded `ImageContent` objects). The daemon reads validated `imagePaths` at session attach time and includes them in the prompt command. Unreadable images are skipped rather than failing the run.
- Skills use §4's composed prompt and staged `.od-skills` copies. Absolute
  external roots in `extraAllowedDirs` are also forwarded through repeated
  `--append-system-prompt`; this is a path hint, not a filesystem grant or
  sandbox flag.
- Thinking: the daemon exposes pi's `--thinking` levels (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`) in the Settings model picker.
- Resume: after `agent_end`, the transport captures the single changed
  `.pi/sessions/*.jsonl` path. A later turn can send `new_session` with that
  file as `parentSession`; ambiguous concurrent changes are not associated
  with the conversation.
- Extension UI: auto-resolved. pi's RPC protocol can request user dialogs (`select`, `confirm`, `input`, `editor`) and fire-and-forget notifications (`setStatus`, `setWidget`, `notify`, `setTitle`, `set_editor_text`). Dialog methods are auto-approved (confirm → true, select → first option) and fire-and-forget methods are silently consumed because the web UI has no surface for them.
- **Gotcha:** pi's RPC `prompt` response is asynchronous — `success: true` only means the prompt was accepted, not that the agent finished. Agent failures after acceptance surface through the normal event stream (`extension_error`, `auto_retry_end` with `success: false`) and the empty-output guard.

### 5.11 DeepSeek TUI

- Invocation is `deepseek exec --auto [--model <id>] "<prompt>"` through the
  dispatcher. `codewhale` is an argv-compatible fallback binary after the
  upstream rename. The companion `deepseek-tui`/`codewhale-tui` runtime is not
  probed directly because it does not accept this invocation shape.
- Streaming: plain text deltas to stdout in non-`--json` mode (tool-call notifications go to stderr). Skipping `--json` is intentional — `deepseek exec --json` batches the entire run into one trailing summary object instead of streaming, which would freeze the chat UI until end-of-turn.
- Auto-approval: `--auto` enables agentic mode with the YOLO permission posture. The daemon runs every CLI without a TTY, so the interactive approval prompt would otherwise hang the run.
- Skills use the shared composition/staging path in §4; the adapter does not
  rely on DeepSeek's own skill-directory scan.
- Prompt delivery: positional argv (no stdin sentinel; clap declares `prompt: String` as a required field). This means very large composed prompts can hit Windows' ~32 KB `CreateProcess` limit; for typical chat prompts this is non-issue. Upstream support for a `-` stdin sentinel would let us flip this to `promptViaStdin: true` like the other adapters. To avoid surfacing oversized prompts as a generic `spawn ENAMETOOLONG` / `E2BIG`, the adapter declares `maxPromptArgBytes` (currently 30,000) and `/api/chat` enforces it through three complementary guards: a fast pre-bin-resolution `checkPromptArgvBudget` against the raw composed prompt bytes, a post-`buildArgs` `checkWindowsCmdShimCommandLineBudget` that — when the resolved binary is a Windows `.cmd` / `.bat` shim — recomputes the would-be `cmd.exe /d /s /c "<inner>"` command line using the same per-arg quote-doubling the platform layer applies on Windows, and a sibling `checkWindowsDirectExeCommandLineBudget` that — when the resolved binary is a non-shim Windows install (e.g. a cargo-built `deepseek.exe`) — recomputes the same command line using libuv's `quote_cmd_arg` rules (every `"` becomes `\"`, backslashes adjacent to a quote are doubled). The two Windows guards are mutually exclusive on a given resolution: the cmd-shim guard owns `.cmd`/`.bat`, the direct-exe guard owns everything else. Together they catch quote-heavy prompts (code blocks, JSON-shaped skill seeds) that fit under the raw byte budget but expand past CreateProcess's 32_767-char `lpCommandLine` cap on either install path. All three guards emit the same actionable `AGENT_PROMPT_TOO_LARGE` SSE error telling the user to reduce skills/design-system context, shorten the conversation, or pick an adapter with stdin support, and all three are unit-tested (oversized + short-prompt branches, quote-heavy regressions for both Windows paths, and a mutual-exclusivity check) so the guards can't silently regress.
- Models: ships `deepseek-v4-pro` and `deepseek-v4-flash` as fallback hints (1M-token context windows, native thinking-mode streaming). Users can paste any other id (e.g. `nvidia-nim/deepseek-v4-pro`, `fireworks/deepseek-v4-flash`) via the Settings dialog's custom-model input.
- **Gotcha — no proactive auth probe.** Detection reports binary availability,
  but DeepSeek TUI reads its API key from `~/.deepseek/config.toml` or
  `DEEPSEEK_API_KEY`. If a run fails with a recognized auth signature, the
  shared failure classifier emits DeepSeek-specific guidance for those two
  configuration paths instead of returning the raw non-actionable error.

### 5.12 Plain stream artifact handoff

Adapters with `streamFormat: 'plain'` do not expose structured file-write tool calls to the daemon. Their stdout is still a valid artifact handoff when the model emits Anthropic-style source blocks:

```html
<artifact identifier="landing-page" type="text/html" title="Landing page">
<!doctype html>
<html>...</html>
</artifact>
```

At run completion, the daemon scans the captured plain stdout for `<artifact>` blocks with supported text types and writes them through the normal project artifact path:

| Artifact type | Project file |
|---|---|
| `text/html` or `html` | `<identifier>.html` |
| `text/css` or `css` | `<identifier>.css` |
| `image/svg+xml` or `svg` | `<identifier>.svg` |
| `text/markdown`, `text/x-markdown`, `markdown`, or `md` | `<identifier>.md` |

The identifier is slugged before use, collisions receive `-2`, `-3`, etc., and outputs without a supported `<artifact>` block are left unchanged. This daemon-side extraction keeps headless runs and web-attached runs aligned: the project file exists even when no browser is present to parse the chat stream.

## 6. Runtime metadata and UI

There is no public `agents.capabilities()` method and no generalized
`surgicalEdit`/`streaming`/`resume` feature-gate table.

- `RuntimeAgentDef` declares invocation and transport facts such as prompt
  delivery, stream parser, image support, external MCP injection, native
  session resume, model/reasoning choices, and prompt budgets.
- [`runtimes/capabilities.ts`](../apps/daemon/src/runtimes/capabilities.ts)
  contains only an in-process map of flags found in an installed CLI's help
  output. Arg builders use those flags to avoid passing options that an older
  executable does not recognize—for example Claude's partial messages or
  Cursor's `--trust`.
- `/api/agents` returns `AgentInfo`: availability, resolved path, version,
  auth status when probed, diagnostics, models/model source, reasoning
  options, and MCP metadata. The picker and Settings render controls from
  those concrete fields.

Run-time behavior such as native-session recovery is handled by the shared
engine from the selected definition; it is not toggled by a separate web
capability API.

## 7. Agent switching

The picker writes the selected id to `AppConfig.agentId`, persists the local
preference, and syncs it through `PUT /api/app-config`. Model and reasoning
choices are stored separately under `agentModels[agentId]`.

Each chat/run request carries its `agentId`, and the daemon resolves that
definition when it creates the run. Changing the picker affects subsequent
runs; it does not rebind or mutate a child process that is already running.
Cancel the existing run separately if it should stop. There is no
`POST agents.setActive` endpoint or capability-refresh handshake.

## 8. Selection and failure recovery

Open Design does not implement an ordered cross-agent fallback chain. A chat
request explicitly names its agent, and a crash, auth failure, timeout, or
invalid invocation remains a failure for that run. The user can select another
agent and send the request again, but the daemon does not silently—or through a
dedicated one-click fallback action—move the request to Claude, another
detected CLI, or BYOK OpenCode.

The generic run-creation endpoint has a narrower pre-run defaulting rule when
`agentId` is omitted: use the configured agent if it is currently available,
otherwise use the first available definition. This chooses an agent before a
run starts; it is not failure recovery. Separately, when a stored native
session has expired, the daemon may clear that same agent's stale session and
reseed the turn with the full transcript. That recovery never changes agent
families.

## 9. Detection UX

The daemon warms detection during startup, but the user-facing inventory comes
from `/api/agents`. Its `?stream=1` form emits one `agent` SSE event as each
probe settles, followed by `done`, so Settings can paint cards without waiting
for the slowest CLI. The non-streaming form returns the complete array.

Settings groups installed and unavailable agents, shows version/path and
declared auth/model information, renders typed diagnostics with fix actions,
and exposes a rescan action. The compact picker lists available agents and
keeps unavailable entries disabled. Auth is only asserted for definitions
that declare a working probe; other definitions leave auth unset/unknown rather
than guessing it from a config directory. The old illustrative terminal
transcript and “skills dir linked” status are not emitted by the current startup
path.

## 10. Authorization boundaries

The daemon delegates policy enforcement to each CLI, but its headless arg
builders intentionally choose non-interactive permission modes. The effective
project cwd is an execution root, not a uniform Open Design sandbox, and
external-directory flags can widen a CLI's reach.

- Claude runs with `--permission-mode bypassPermissions`; Cursor runs with
  `--force` and capability-gated `--trust`.
- Devin uses `--permission-mode dangerous --respect-workspace-trust false`;
  Qoder and Trae use `--yolo`; Copilot uses `--allow-all-tools`; DeepSeek uses
  `--auto`. Other definitions have their own explicit headless posture (for
  example Amp's `--dangerously-allow-all`).
- OpenCode receives `--dangerously-skip-permissions` only when its help probe
  advertises that flag, so older compatible builds are not given an unknown
  option.
- Codex defaults to `workspace-write` with network access on supported macOS
  and Linux hosts. Windows, WSL, or an explicit
  `OD_CODEX_SANDBOX=danger-full-access` operator override uses
  `danger-full-access` because the workspace-write path cannot support the
  required shell execution there.

Provider/org policy and any sandbox internal to the CLI still apply, but users
must treat these runs as trusted agent execution with the authority shown by
the selected definition. There is no direct-Anthropic daemon loop with a
daemon-owned `Read`/`Write`/`Edit` whitelist; BYOK generation delegates that
loop to OpenCode as described in §5.2.

## 11. Adapter source layout

The contract, the per-CLI defs, and most stream parsers live under
`apps/daemon/src/runtimes/`; the JSON-RPC transports live under
`apps/daemon/src/agent-protocol/`. The `agents.ts` public barrel,
`copilot-stream.ts`, and the `server.ts` spawn/dispatch glue are the main
runtime-facing entry points directly under `apps/daemon/src/`.

```
apps/daemon/src/
├── agents.ts               # public barrel — re-exports AGENT_DEFS / getAgentDef / detectAgents / … from runtimes/ (defines nothing)
├── runtimes/
│   ├── types.ts            # the RuntimeAgentDef contract (the data spec) + shared runtime types
│   ├── registry.ts         # BASE_AGENT_DEFS array → AGENT_DEFS + unique-id guard + getAgentDef()
│   ├── defs/               # one object literal per CLI — the file you add for a new agent
│   │   ├── claude.ts
│   │   ├── codex.ts
│   │   ├── cursor-agent.ts
│   │   ├── devin.ts
│   │   ├── …               # ~two dozen defs (opencode, hermes, qoder, copilot,
│   │   │                   #   amp, pi, kiro, kilo, vibe, deepseek, aider, antigravity, qwen,
│   │   │                   #   grok-build, kimi, reasonix, codebuddy, trae-cli, …)
│   │   └── shared.ts       # helpers reused across defs (not a registered agent)
│   ├── detection.ts        # resolved-launch/version/help/model/auth probes (detectAgents / …Stream)
│   ├── capabilities.ts     # in-process help-probe flag map consumed by arg builders
│   ├── executables.ts      # PATH resolution     · resolution.ts — bin resolution
│   ├── launch.ts           # generic launch descriptor (resolveAgentLaunch / applyAgentLaunchEnv)
│   ├── invocation.ts       # generic argv/prompt invocation from a def's buildArgs
│   ├── env.ts              # per-agent spawn env  · mcp.ts — external-MCP injection per def
│   ├── models.ts           # live/fallback models · prompt-budget.ts — argv size guards
│   ├── local-profiles.ts   # user-defined local agent profiles merged into AGENT_DEFS
│   ├── claude-stream.ts    # streamFormat="claude-stream-json": stream-json JSONL → UI events
│   ├── qoder-stream.ts     # streamFormat="qoder-stream-json": stream-json JSONL → UI events
│   ├── json-event-stream.ts# streamFormat="json-event-stream": generic JSONL → UI events
│   └── plain-stream.ts     # streamFormat="plain": scans stdout for <artifact> blocks → project files
├── copilot-stream.ts       # streamFormat="copilot-stream-json" — the one stream parser that sits flat at src/
├── agent-protocol/         # JSON-RPC transports, dispatched via agent-protocol/index.ts (attachAcpSession / attachPiRpcSession)
│   ├── index.ts            # barrel: attachAcpSession / attachPiRpcSession / mapPiRpcEvent
│   ├── acp/                # streamFormat="acp-json-rpc": shared transport for AMR, Devin, Hermes, Kimi, Kiro, Kilo, Reasonix, Trae CLI, and Vibe
│   ├── pi-rpc/             # streamFormat="pi-rpc": pi's JSON-RPC-over-stdio transport
│   └── core/               # shared JSON-line stream helpers
└── server.ts               # spawn pipeline + stream dispatch: routes def.streamFormat/eventParser to a parser
```

The engine is agent-agnostic: it iterates `AGENT_DEFS` and reads fields. A community contribution adds a new agent by dropping one `runtimes/defs/<cli>.ts` and appending it to `BASE_AGENT_DEFS` — detection, launch, invocation, and (for an existing `streamFormat`) parsing come for free, with no change to core daemon code.

## 12. Open questions

- **Nested agents.** Structured streams can carry a child agent's messages
  inline. For example, Claude Task frames have a non-null
  `parent_tool_use_id`; the parser surfaces their content but prevents the
  child's `turn_end` from completing the parent run. The UI still does not
  expose an independent nested-run tree.
- **Usage and cost coverage.** Parsers preserve `usage` and reported cost when
  a CLI exposes them (for example Claude, Codex, OpenCode, and Qoder), and
  those events feed persisted run messages and lifecycle analytics. Coverage
  is runtime-dependent; Open Design does not invent token or billing data when
  a CLI omits it.
- **Windows support.** PATH scanning and `spawn` semantics differ on Windows. Definitions
  that accept stdin should set `promptViaStdin`; argv-only definitions must declare and
  enforce a prompt budget so Windows' command-line limit fails observably before spawn.
- **Docker-contained agents.** Some users run Claude Code in a container. Adapter needs a "remote" mode — probably same interface but talks over SSH. Phase 2+.

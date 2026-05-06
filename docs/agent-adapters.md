# Agent Adapters

**Parent:** [`spec.md`](spec.md) · **Siblings:** [`architecture.md`](architecture.md) · [`skills-protocol.md`](skills-protocol.md) · [`modes.md`](modes.md)

The adapter layer is OD's most load-bearing design decision. We delegate the **entire agent loop** — model calls, tool use, context management, permission handling, resume, cancel — to the user's existing code agent CLI. OD's job is to detect it, feed it a skill + prompt + working directory, and stream its output back to the web UI.

> **Thesis:** The code agent space has already converged on a few strong implementations (Claude Code, Codex, Devin for Terminal, Cursor Agent, Gemini CLI, OpenCode, OpenClaw, Qoder CLI). Reimplementing another one is worse than just talking to all of them.
>
> **Inspiration:** [multica](https://github.com/multica-ai/multica) (PATH-scan detection + daemon architecture) and [cc-switch](https://github.com/farion1231/cc-switch) (per-agent config format knowledge + symlink-based skill distribution).

---

## 1. Adapter interface (TypeScript)

Every adapter implements this interface. Full types in [`schemas/adapter.md`](schemas/adapter.md) (TODO).

```ts
interface AgentAdapter {
  readonly id: string;                      // "claude-code" | "codex" | …
  readonly displayName: string;

  // -- discovery --------------------------------------------------
  detect(): Promise<AgentDetection | null>; // null if not installed

  // -- capability negotiation ------------------------------------
  capabilities(): AgentCapabilities;

  // -- execution -------------------------------------------------
  run(params: AgentRunParams): AsyncIterable<AgentEvent>;
  cancel(runId: string): Promise<void>;
  resume?(runId: string, message: string): AsyncIterable<AgentEvent>;
}

interface AgentDetection {
  executablePath: string;                   // absolute path to CLI
  version: string;
  configDir?: string;                       // e.g. ~/.claude
  skillsDir?: string;                       // e.g. ~/.claude/skills
  authState: "ok" | "missing" | "expired";
}

interface AgentCapabilities {
  surgicalEdit: boolean;                    // can edit a targeted region without rewriting file
  nativeSkillLoading: boolean;              // picks up ~/.<agent>/skills/ automatically
  streaming: boolean;                       // emits tool calls in real time
  resume: boolean;                          // can continue an interrupted run
  permissionMode: "strict" | "permissive" | "none";
  contextWindowHint?: number;               // in tokens
}

interface AgentRunParams {
  runId: string;
  cwd: string;                              // absolute path — artifact dir
  systemPrompt: string;                     // skill's SKILL.md body + DESIGN.md excerpt
  userPrompt: string;
  skillDir?: string;                        // if set, adapter should make skill files available
  allowedTools?: string[];                  // for agents that support it
  timeoutMs?: number;
}

type AgentEvent =
  | { type: "thinking"; text: string }
  | { type: "tool_call"; name: string; input: unknown; id: string }
  | { type: "tool_result"; id: string; output: unknown }
  | { type: "text_delta"; text: string }
  | { type: "file_write"; path: string }   // synthesized by adapter if agent doesn't emit natively
  | { type: "error"; error: string }
  | { type: "done"; reason: "completed" | "cancelled" | "error" };
```

## 2. Detection strategy

Run all adapters' `detect()` in parallel on daemon start, then cache results in `~/.open-design/agents.json` with a 24h TTL. Re-detect on daemon `SIGHUP`.

Each adapter uses **two signals**:

1. **PATH scan.** `which <binary>` for each known executable name. Fast (<10ms).
2. **Config-dir probe.** Check for `~/.claude/`, `~/.codex/`, `~/.cursor/`, etc. This catches cases where the CLI was installed via npm global into a shell-specific PATH.

If both signals agree, detection is confident. If only one signal fires, we mark `authState: "missing"` and prompt the user to run the CLI's auth flow.

## 3. Adapter catalog (v1 target)

| Adapter | CLI command | Config dir | Skills dir | Native skill loading | Surgical edit | Streaming | Priority |
|---|---|---|---|---|---|---|---|
| **claude-code** | `claude` | `~/.claude/` | `~/.claude/skills/` | ✅ | ✅ | ✅ | P0 (MVP) |
| **api-fallback** | *(direct Anthropic API)* | — | — | ❌ (prompt-injected) | 〜 | ✅ | P0 (MVP) |
| **codex** | `codex` | `~/.codex/` | `~/.codex/skills/` | 〜 (varies by version) | 〜 (regenerate w/ scoping) | ✅ | P1 |
| **devin** | `devin` | `~/.config/devin/` | `~/.config/devin/skills/` | ✅ | ✅ | ✅ (`acp-json-rpc`) | P1 |
| **cursor-agent** | `cursor-agent` | `~/.cursor/` | n/a (via project `.cursorrules`) | ❌ (prompt-injected) | ✅ | ✅ | P1 |
| **gemini-cli** | `gemini` | `~/.config/gemini/` | ❌ | ❌ (prompt-injected) | ❌ (regenerate) | ✅ | P2 |
| **opencode** | `opencode` | `~/.opencode/` | 〜 | 〜 | ✅ | P2 |
| **openclaw** | `openclaw` | `~/.openclaw/` | 〜 | 〜 | 〜 | P2 |
| **copilot** | `copilot` | `~/.copilot/` | ❌ | ✅ (`edit` tool) | ✅ (`--output-format json` JSONL) | P2 |
| **kiro** | `kiro-cli` | `~/.kiro/` | ❌ | ✅ | ✅ (`acp-json-rpc`) | P2 |
| **kilo** | `kilo` | — | ❌ | ✅ | ✅ (`acp-json-rpc`) | P2 |
| **vibe** | `vibe-acp` | `~/.vibe/` | ❌ | ✅ | ✅ (`acp-json-rpc`) | P2 |
| **deepseek** | `deepseek` | `~/.deepseek/` | `~/.deepseek/skills/` | ❌ (prompt-injected) | ✅ | ✅ (plain text) | P2 |
| **qoder** | `qodercli` | Qoder CLI config | Qoder CLI managed | ❌ (prompt-injected) | ✅ | ✅ (`stream-json`) | P2 |

"P0/P1/P2" correspond to the roadmap phases in [`roadmap.md`](roadmap.md).

## 4. Skill injection per adapter

Skills travel into each agent via one of three strategies, in order of preference:

### 4.1 Native skill loading (preferred)
Agent scans its own `~/.<agent>/skills/` on launch. We symlink OD's skill into that dir (see [`skills-protocol.md`](skills-protocol.md) §3) and let the agent pick it up natively. Zero prompt overhead.

- **Works for:** Claude Code. Codex (version-dependent). OpenCode.

### 4.2 Prompt injection (fallback)
We read the skill's `SKILL.md` body + any `references/*.md` files it has, concatenate them into the system prompt, and copy `assets/` files into the cwd. The agent has no concept of "skills" but has the instructions.

- **Works for:** everyone. Default for API fallback, Cursor Agent, Gemini CLI.
- **Cost:** more tokens per run. Mitigation: prune `references/` to the files the skill body actually mentions.

### 4.3 File-placed workflow (hybrid)
For agents that support `AGENTS.md` / `.cursorrules` / similar project-level instruction files (Cursor Agent, OpenCode), we write a project-scoped instruction file in the artifact cwd before running the agent. The agent picks it up automatically.

- **Works for:** Cursor Agent (`.cursorrules`), some OpenCode configurations.

The adapter declares which strategy to use via `capabilities().nativeSkillLoading` and a private `skillInjectionStrategy` field.

## 5. Per-adapter notes

### 5.1 Claude Code (reference implementation)

- Invocation: `claude --print --output-format stream-json --cwd <artifact-dir> "<prompt>"`.
- Streaming format: JSON Lines over stdout; each line is an event we can map to `AgentEvent` directly.
- Skill loading: native. Just ensure the skill is symlinked in `~/.claude/skills/`.
- Surgical edits: use the `Edit` tool; Claude Code's own loop handles this.
- Permission: set `--allowed-tools "Read,Edit,Write"` to restrict blast radius.
- Cancel: send `SIGTERM`; Claude Code flushes and exits.
- **Gotchas:** Claude Code's JSON stream schema is versioned — pin to a known version, warn on mismatch.

### 5.2 API fallback (no CLI)

- Invocation: direct Anthropic Messages API with `stream: true`.
- Skill loading: prompt injection only — read the skill dir, inline everything.
- Tool use: we register `Read/Write/Edit` as tools, implement them in the daemon against the artifact cwd, and run the loop ourselves. This is the one place OD does own the loop — because the user has no agent at all. Keep it as dumb as possible.
- Surgical edits: approximated by regenerating the whole target file with "only change X" in the prompt.
- Model: Claude Sonnet 4.6 default; Opus 4.7 behind a flag.
- **Why ship this at all?** Topology C requires it (no daemon available in a pure-Vercel deploy). Also, users trying OD for the first time without a CLI installed still get a working experience.

### 5.3 Codex

- Invocation: `codex exec --cwd <dir> "<prompt>"`.
- Streaming: line-based; parse with a regex-based state machine. Less rich than Claude Code's JSON stream.
- Skill loading: varies. Newer Codex versions read `~/.codex/skills/`; older versions don't. Detect by version string; fall back to prompt injection.
- Surgical edits: Codex's edit tool exists but the tool-call schema is different enough that we regenerate files instead in v1. Revisit in v2.
- **Gotcha:** Codex's CLI auth state can be "authenticated to wrong org." Detect by running `codex whoami` at detect time.

### 5.4 Devin for Terminal

- Invocation: `devin --permission-mode dangerous --respect-workspace-trust false acp`.
- Install/update: macOS/Linux/WSL users can install with `curl -fsSL https://cli.devin.ai/install.sh | bash`; run `devin update` for existing installs.
- Version requirement: requires a Devin CLI build with the `devin acp` subcommand (verified with `devin 2026.5.1-1`). Check with `devin acp --help`; if the subcommand is missing, update or reinstall Devin for Terminal.
- Streaming: Agent Client Protocol JSON-RPC over stdio, handled by the daemon's shared `acp-json-rpc` transport.
- Skill loading: Devin supports `.devin/skills/` and `~/.config/devin/skills/`; OD's current daemon also prompt-injects the selected skill body into the composed prompt, so no per-project skill install is required for generation.
- Surgical edits: Devin's own edit/write tools handle targeted changes.
- Permission: `--permission-mode dangerous` avoids headless approval prompts in the web UI; `--respect-workspace-trust false` ensures Devin doesn't block on trust prompts for newly created project dirs. Org/team-level policies still apply inside Devin.

### 5.5 Cursor Agent

- Invocation: `cursor-agent --workspace <dir> "<prompt>"` (rough; verify with CLI docs at implementation time).
- Streaming: yes, JSON lines.
- Skill loading: no native skill concept. We write a `.cursorrules` file into the artifact dir before running. The rules file contains the skill's SKILL.md body (minus front-matter).
- Surgical edits: Cursor's inline edit tool is strong; map our `refine` call to its edit protocol.
- **Gotcha:** Cursor Agent operates on workspaces, not single files. Constrain the workspace to the artifact dir to prevent over-broad changes.

### 5.6 Gemini CLI

- Invocation: `gemini` with the composed prompt delivered via **stdin** (no `-p` flag).
  Gemini CLI enters headless mode automatically when stdin is a pipe and no `-p` flag is
  supplied — verified with `gemini@0.1.x`.
- Trust: `GEMINI_CLI_TRUST_WORKSPACE=true` is set in the spawned process instead of
  passing `--skip-trust`, which is version-fragile across Gemini CLI releases.
- Streaming: yes, `--output-format stream-json` to stdout.
- Skill loading: prompt injection only.
- Surgical edits: regenerate whole file.
- **Gotcha — `spawn ENAMETOOLONG` on Windows:** Passing the full composed prompt as a
  `-p <string>` CLI argument hits Windows' `CreateProcess` hard limit of ~32 KB for the
  entire command line. The fix is to set `promptViaStdin: true` in the agent definition
  and write the prompt to `child.stdin` after spawning. The daemon's `/api/chat` handler
  checks this flag and opens stdin as a pipe instead of `'ignore'`.
- **Gotcha:** Gemini's tool-use format is distinct; we translate our file-write tool to its
  `file_tool` equivalent when that feature is implemented.

### 5.7 OpenCode / OpenClaw

- Less-matured CLIs. Targeting P2. Expect bumps; adapter implementations will likely be the thinnest possible "shell out, parse output, synthesize events" approach.

### 5.8 GitHub Copilot CLI

- Invocation: `copilot -p "<prompt>" --allow-all-tools --output-format json --add-dir <skills> --add-dir <design-systems>`. `--allow-all-tools` is mandatory in non-interactive mode — without it the CLI blocks waiting for human approval on every tool call. Unlike Codex (where `exec` is a dedicated headless subcommand with auto-approve baked in) or Claude Code (which inherits its permission policy from `~/.claude/settings.json`), Copilot's `-p` mode always prompts unless this flag is passed explicitly. `--add-dir` (repeatable) widens the path-level sandbox so Copilot can read skill seeds and design-system specs that live outside the project cwd.
- Streaming: `--output-format json` emits JSONL with the same expressive shape as Claude Code's stream-json (`assistant.reasoning_delta`, `assistant.message_delta`, `tool.execution_start/complete`, `result`). `apps/daemon/src/copilot-stream.ts` maps these onto the same UI events as `claude-stream.ts`.
- Skill loading: prompt injection only. Github Copilot's tool catalog includes a `skill` tool — native format worth reverse-engineering later.
- Surgical edits: dedicated `edit` tool.
- Detection assumes Copilot is already authenticated, via one of: `copilot login` (subcommand, OAuth device flow), the interactive `/login` slash command inside `copilot` with no args.

### 5.9 Qoder CLI

- Invocation: `qodercli -p --output-format stream-json --permission-mode bypass_permissions --cwd <dir> [--model <id>] --add-dir <absolute-skills-dir> --add-dir <absolute-design-systems-dir>`, with the composed prompt delivered over stdin. Print mode exits after the turn, which fits the daemon's one-request chat lifecycle. Qoder is currently text-only in OD; `_imagePaths` are intentionally ignored because Qoder CLI does not expose a supported multimodal flag for this adapter path yet.
- Streaming: `--output-format stream-json` emits JSONL records such as `system/init`, `assistant`, and `result`. `apps/daemon/src/qoder-stream.ts` maps assistant content blocks to text deltas, maps assistant errors without text to typed error events, and preserves result usage, model usage, cost, duration, stop reason, and unknown records as raw events.
- Models: ships fallback hints for `default`, `lite`, `efficient`, `auto`, `performance`, and `ultimate`. Selecting `default` omits `--model` so Qoder's own CLI configuration remains authoritative.
- Skills: prompt injection only in v1. `--add-dir` is repeatable so Qoder can read absolute skill and design-system roots that live outside the active project cwd; the daemon does not forward relative extra directory entries.
- Permission: `--permission-mode bypass_permissions` avoids headless approval prompts in the web UI. Users should treat this as the same trust posture as running Qoder directly with that flag in the selected project directory.
- **Gotcha:** Detection only proves `qodercli --version` can run. Qoder authentication and account scope remain owned by Qoder CLI, with credentials read from Qoder's `~/.qoder/config.json`; the daemon surfaces stderr/stdout failures from the spawned run instead of running login or editing Qoder config.

### 5.10 DeepSeek TUI

- Invocation: `deepseek exec --auto [--model <id>] "<prompt>"`. The `deepseek` dispatcher owns the `exec` / `--auto` subcommands and delegates to a sibling `deepseek-tui` runtime binary at exec time; upstream documents both binaries as required (the npm and cargo paths install them together). We only probe the dispatcher — `deepseek-tui` on its own doesn't accept this argv shape, so advertising it as a fallback would surface the agent as available but fail on the first chat run. A future revision could teach resolution + buildArgs which binary was selected and emit a verified `deepseek-tui` invocation, with a regression test exercising that path.
- Streaming: plain text deltas to stdout in non-`--json` mode (tool-call notifications go to stderr). Skipping `--json` is intentional — `deepseek exec --json` batches the entire run into one trailing summary object instead of streaming, which would freeze the chat UI until end-of-turn.
- Auto-approval: `--auto` enables agentic mode with the YOLO permission posture. The daemon runs every CLI without a TTY, so the interactive approval prompt would otherwise hang the run.
- Skills: prompt injection only in v1. DeepSeek TUI does walk `.agents/skills`, `skills`, `.opencode/skills`, `.claude/skills`, and `~/.deepseek/skills` first-wins, so a future revision can switch to file-placed skill loading the same way Claude Code does.
- Prompt delivery: positional argv (no stdin sentinel; clap declares `prompt: String` as a required field). This means very large composed prompts can hit Windows' ~32 KB `CreateProcess` limit; for typical chat prompts this is non-issue. Upstream support for a `-` stdin sentinel would let us flip this to `promptViaStdin: true` like the other adapters. To avoid surfacing oversized prompts as a generic `spawn ENAMETOOLONG` / `E2BIG`, the adapter declares `maxPromptArgBytes` (currently 30,000) and `/api/chat` enforces it through three complementary guards: a fast pre-bin-resolution `checkPromptArgvBudget` against the raw composed prompt bytes, a post-`buildArgs` `checkWindowsCmdShimCommandLineBudget` that — when the resolved binary is a Windows `.cmd` / `.bat` shim — recomputes the would-be `cmd.exe /d /s /c "<inner>"` command line using the same per-arg quote-doubling the platform layer applies on Windows, and a sibling `checkWindowsDirectExeCommandLineBudget` that — when the resolved binary is a non-shim Windows install (e.g. a cargo-built `deepseek.exe`) — recomputes the same command line using libuv's `quote_cmd_arg` rules (every `"` becomes `\"`, backslashes adjacent to a quote are doubled). The two Windows guards are mutually exclusive on a given resolution: the cmd-shim guard owns `.cmd`/`.bat`, the direct-exe guard owns everything else. Together they catch quote-heavy prompts (code blocks, JSON-shaped skill seeds) that fit under the raw byte budget but expand past CreateProcess's 32_767-char `lpCommandLine` cap on either install path. All three guards emit the same actionable `AGENT_PROMPT_TOO_LARGE` SSE error telling the user to reduce skills/design-system context, shorten the conversation, or pick an adapter with stdin support, and all three are unit-tested (oversized + short-prompt branches, quote-heavy regressions for both Windows paths, and a mutual-exclusivity check) so the guards can't silently regress.
- Models: ships `deepseek-v4-pro` and `deepseek-v4-flash` as fallback hints (1M-token context windows, native thinking-mode streaming). Users can paste any other id (e.g. `nvidia-nim/deepseek-v4-pro`, `fireworks/deepseek-v4-flash`) via the Settings dialog's custom-model input.
- **Gotcha — auth state is not auto-detected.** DeepSeek TUI reads its API key from `~/.deepseek/config.toml` or `DEEPSEEK_API_KEY`. If the user hasn't run `deepseek auth set --provider deepseek` (or set the env var), the first run errors out with a non-actionable message. Detection currently only reports `available: true` based on the binary being on PATH; surface auth state via `deepseek doctor --json` in a follow-up.

## 6. Capability-driven UI

The web UI reads `agents.capabilities()` and disables features that the active adapter can't support:

| UI feature | Requires | If missing |
|---|---|---|
| Comment mode (click to refine) | `surgicalEdit: true` | Hidden; show tooltip explaining why |
| Streaming tool-call feed | `streaming: true` | Show a spinner only |
| Resume interrupted run | `resume: true` | "Cancel + restart" only |
| Skill picker shows skill with `od.capabilities_required` | all listed caps | Skill greyed out with reason |

This is how we avoid "works on my Claude Code, breaks on your Gemini" — we detect, degrade, and document.

## 7. Agent switching

The user can switch active agent per session:

```
POST agents.setActive { agentId: "codex" }
→ capabilities() reported
→ web UI refreshes feature gates
→ next generation runs on Codex
```

Switching mid-run is not allowed (cancel first). The artifact is agent-agnostic; only the generation process differs.

## 8. Fallback chain

If the user's preferred agent fails (crash, auth, timeout), OD offers a one-click fallback in this order:

1. User's preferred agent (e.g. Cursor Agent)
2. Any other detected agent (Claude Code, if installed)
3. API fallback (direct Anthropic, requires key)

The user explicitly opts in to fallback — we don't silently switch, because a skill may have been authored for a specific agent's capabilities.

## 9. Detection UX

First run:

```
$ pnpm tools-dev run web
[od] daemon starting on :7456
[od] detecting agents…
[od]   ✓ claude-code v0.6.3 (auth: ok, skills dir linked)
[od]   ✓ codex v0.8.1 (auth: ok)
[od]   ✗ cursor-agent (not installed)
[od]   ✗ gemini-cli (installed but not authenticated; run `gemini auth login`)
[od]   ✓ api-fallback (ANTHROPIC_API_KEY found)
[od] daemon ready; 3 agents available
```

Web UI mirrors this in an agent-selector dropdown, with unauthenticated agents shown greyed out with a fix-it tooltip.

## 10. Authorization boundaries

We inherit the underlying agent's permission model rather than building our own. This means:

- **Claude Code** respects its own `--allowed-tools` and `--permission-mode` flags. OD passes through user preferences.
- **Codex / Cursor** sandbox by workspace; OD always sets cwd to the artifact dir so nothing outside is visible by default.
- **Qoder CLI** runs with `--permission-mode bypass_permissions` for non-interactive web execution and is scoped by the daemon's cwd plus explicit absolute `--add-dir` entries.
- **API fallback** is the one case we own. We implement a whitelist: only `Read`, `Write`, `Edit` tools, all rooted at the artifact cwd. Network access is off.

The daemon never grants more authority to an agent than it had on its own. We don't run the agent in a privileged mode "for convenience."

## 11. Adapter source layout

```
apps/daemon/
├── base.ts                 # shared interface + utility helpers
├── claude-code/
│   ├── adapter.ts
│   ├── stream-parser.ts    # JSON-lines → AgentEvent
│   └── detect.ts
├── api-fallback/
│   ├── adapter.ts
│   ├── tool-loop.ts        # the minimal tool-use loop
│   └── tools.ts            # Read/Write/Edit implementations
├── codex/                  # Phase 1
├── cursor-agent/           # Phase 1
├── gemini-cli/             # Phase 2
├── opencode/               # Phase 2
└── openclaw/               # Phase 2
```

Each adapter is a separate module so community contributions can add new ones without touching core daemon code.

## 12. Open questions

- **Nested agents.** What if Claude Code's agent itself spawns a subagent? We receive events from the outer process only. v1 policy: surface only top-level events; summarize subagent activity as "sub-task" placeholder.
- **Billing awareness.** Some agents bill per message, some per token. OD doesn't track cost in MVP; v1 adds an optional "usage" event from adapters that expose it.
- **Windows support.** PATH scanning and `spawn` semantics differ on Windows. v1 targets
  macOS and Linux; Windows is best-effort. Known issue fixed: `spawn ENAMETOOLONG` when
  running Gemini CLI (and other plain-text agents) on Windows — resolved by routing the
  composed prompt through stdin instead of as a CLI argument (see §5.5).
- **Docker-contained agents.** Some users run Claude Code in a container. Adapter needs a "remote" mode — probably same interface but talks over SSH. Phase 2+.

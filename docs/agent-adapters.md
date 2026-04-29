# Agent Adapters

**Parent:** [`spec.md`](spec.md) · **Siblings:** [`architecture.md`](architecture.md) · [`skills-protocol.md`](skills-protocol.md) · [`modes.md`](modes.md)

The adapter layer is OD's most load-bearing design decision. We delegate the **entire agent loop** — model calls, tool use, context management, permission handling, resume, cancel — to the user's existing code agent CLI. OD's job is to detect it, feed it a skill + prompt + working directory, and stream its output back to the web UI.

> **Thesis:** The code agent space has already converged on a few strong implementations (Claude Code, Codex, Cursor Agent, Gemini CLI, OpenCode, OpenClaw). Reimplementing a 7th is worse than just talking to all of them.
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
| **cursor-agent** | `cursor-agent` | `~/.cursor/` | n/a (via project `.cursorrules`) | ❌ (prompt-injected) | ✅ | ✅ | P1 |
| **gemini-cli** | `gemini` | `~/.config/gemini/` | ❌ | ❌ (prompt-injected) | ❌ (regenerate) | ✅ | P2 |
| **opencode** | `opencode` | `~/.opencode/` | 〜 | 〜 | ✅ | P2 |
| **openclaw** | `openclaw` | `~/.openclaw/` | 〜 | 〜 | 〜 | P2 |
| **copilot** | `copilot` | `~/.copilot/` | ❌ | ✅ (`edit` tool) | ✅ (`--output-format json` JSONL) | P2 |

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

### 5.4 Cursor Agent

- Invocation: `cursor-agent --workspace <dir> "<prompt>"` (rough; verify with CLI docs at implementation time).
- Streaming: yes, JSON lines.
- Skill loading: no native skill concept. We write a `.cursorrules` file into the artifact dir before running. The rules file contains the skill's SKILL.md body (minus front-matter).
- Surgical edits: Cursor's inline edit tool is strong; map our `refine` call to its edit protocol.
- **Gotcha:** Cursor Agent operates on workspaces, not single files. Constrain the workspace to the artifact dir to prevent over-broad changes.

### 5.5 Gemini CLI

- Invocation: `gemini` with the composed prompt delivered via **stdin** (no `-p` flag).
  Gemini CLI enters headless mode automatically when stdin is a pipe and no `-p` flag is
  supplied — verified with `gemini@0.1.x`.
- Streaming: yes, plain text to stdout.
- Skill loading: prompt injection only.
- Surgical edits: regenerate whole file.
- **Gotcha — `spawn ENAMETOOLONG` on Windows:** Passing the full composed prompt as a
  `-p <string>` CLI argument hits Windows' `CreateProcess` hard limit of ~32 KB for the
  entire command line. The fix is to set `promptViaStdin: true` in the agent definition
  and write the prompt to `child.stdin` after spawning. The daemon's `/api/chat` handler
  checks this flag and opens stdin as a pipe instead of `'ignore'`.
- **Gotcha:** Gemini's tool-use format is distinct; we translate our file-write tool to its
  `file_tool` equivalent when that feature is implemented.

### 5.6 OpenCode / OpenClaw

- Less-matured CLIs. Targeting P2. Expect bumps; adapter implementations will likely be the thinnest possible "shell out, parse output, synthesize events" approach.

### 5.7 GitHub Copilot CLI

- Invocation: `copilot -p "<prompt>" --allow-all-tools --output-format json --add-dir <skills> --add-dir <design-systems>`. `--allow-all-tools` is mandatory in non-interactive mode — without it the CLI blocks waiting for human approval on every tool call. Unlike Codex (where `exec` is a dedicated headless subcommand with auto-approve baked in) or Claude Code (which inherits its permission policy from `~/.claude/settings.json`), Copilot's `-p` mode always prompts unless this flag is passed explicitly. `--add-dir` (repeatable) widens the path-level sandbox so Copilot can read skill seeds and design-system specs that live outside the project cwd.
- Streaming: `--output-format json` emits JSONL with the same expressive shape as Claude Code's stream-json (`assistant.reasoning_delta`, `assistant.message_delta`, `tool.execution_start/complete`, `result`). `daemon/copilot-stream.js` maps these onto the same UI events as `claude-stream.js`.
- Skill loading: prompt injection only. Github Copilot's tool catalog includes a `skill` tool — native format worth reverse-engineering later.
- Surgical edits: dedicated `edit` tool.
- Detection assumes Copilot is already authenticated, via one of: `copilot login` (subcommand, OAuth device flow), the interactive `/login` slash command inside `copilot` with no args.

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
$ pnpm dev
[od] daemon starting on :7431
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
- **API fallback** is the one case we own. We implement a whitelist: only `Read`, `Write`, `Edit` tools, all rooted at the artifact cwd. Network access is off.

The daemon never grants more authority to an agent than it had on its own. We don't run the agent in a privileged mode "for convenience."

## 11. Adapter source layout

```
apps/daemon/src/adapters/
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

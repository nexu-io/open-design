# Adapter Interface Reference

**Parent:** [`../agent-adapters.md`](../agent-adapters.md) (conceptual)
**Source:** [`../../apps/daemon/src/runtimes/types.ts`](../../apps/daemon/src/runtimes/types.ts) (canonical types)
**Status:** v0.1 · 2026-05-15

The adapter layer delegates the entire agent loop — model calls, tool use, context management — to the user's existing code agent CLI. Open Design detects it, feeds it a skill + prompt + working directory, and streams its output to the web UI.

---

## 1. Canonical TypeScript Interfaces

### 1.1 `RuntimeAgentDef` — Adapter Definition

```ts
// Source: apps/daemon/src/runtimes/types.ts

type RuntimeAgentDef = {
  id: string;                       // Unique identifier: "claude-code", "codex", …
  name: string;                     // Display name
  bin: string;                      // Primary CLI binary name
  versionArgs: string[];            // CLI args for --version probe
  fallbackModels: RuntimeModelOption[]; // Static model list when live fetch fails

  buildArgs: (                      // Build argv for spawning the agent
    prompt: string,
    imagePaths: string[],
    extraAllowedDirs?: string[],
    options?: RuntimeBuildOptions,
    runtimeContext?: RuntimeContext,
  ) => string[];

  streamFormat: string;             // "claude-stream-json" | "copilot-stream-json"
                                    // | "json-event-stream" | "qoder-stream-json"
                                    // | "pi-rpc" | "acp" | "plain-text"

  // -- optional --
  fallbackBins?: string[];          // Alternative binary names to probe on PATH
  helpArgs?: string[];              // CLI args for --help (capability detection)
  capabilityFlags?: Record<string, string>; // --help string → capability key mapping
  promptViaStdin?: boolean;         // Route prompt via stdin instead of argv
  eventParser?: string;             // Named event parser function
  env?: Record<string, string>;     // Extra env vars to inject
  listModels?: RuntimeListModels;   // Config for --list-models
  fetchModels?: (bin: string, env: RuntimeEnv) => Promise<RuntimeModelOption[] | null>;
  reasoningOptions?: RuntimeReasoningOption[]; // Supported reasoning levels
  supportsImagePaths?: boolean;     // Multimodal image input support
  maxPromptArgBytes?: number;       // Windows CreateProcess 32KB limit guard
  mcpDiscovery?: string;            // MCP server discovery mechanism
  installUrl?: string;              // Installation instructions URL
  docsUrl?: string;                 // Documentation URL
};
```

### 1.2 `DetectedAgent` — Discovery Result

```ts
// Source: apps/daemon/src/runtimes/types.ts
// (RuntimeAgentDef minus build-time fields, plus runtime-detected fields)

type DetectedAgent = {
  id: string;
  name: string;
  bin: string;
  versionArgs: string[];
  streamFormat: string;
  models: RuntimeModelOption[];
  available: boolean;
  authStatus?: 'ok' | 'missing' | 'unknown';
  authMessage?: string;
  path?: string;                    // Absolute path to detected binary
  version?: string | null;
  installUrl?: string;
  docsUrl?: string;
  supportsImagePaths?: boolean;
  reasoningOptions?: RuntimeReasoningOption[];
  // …
};
```

### 1.3 Supporting Types

```ts
type RuntimeModelOption = { id: string; label: string };
type RuntimeReasoningOption = RuntimeModelOption;

type RuntimeBuildOptions = {
  model?: string | null;
  reasoning?: string | null;
};

type RuntimeContext = { cwd?: string };

type RuntimeListModels = {
  args: string[];
  timeoutMs?: number;
  parse: (stdout: string) => RuntimeModelOption[] | null;
};

type RuntimeCapabilityMap = Record<string, boolean>;

type RuntimePromptBudgetError = {
  code: 'AGENT_PROMPT_TOO_LARGE';
  message: string;
  bytes?: number;
  commandLineLength?: number;
  limit: number;
};
```

---

## 2. Adapter Lifecycle

### 2.1 Detection

On daemon start (or on `GET /api/agents`), the daemon probes every registered adapter in parallel.

**Steps:**
1. **Path resolution** — `resolveAgentLaunch(def, env)` locates the binary on PATH. Tries `def.bin` first, then each `def.fallbackBins`. Codex has special resolution that unwraps npm-installed shims to native binaries.
2. **Version probe** — runs `<bin> <versionArgs>` (typically `--version`). Exit code 127/126 means "not invocable"; ENOENT means "not installed".
3. **Capability probe** — if `helpArgs` and `capabilityFlags` are defined, runs `--help` and greps for flag strings. Results are cached in the `agentCapabilities` map.
4. **Model fetch** — calls `fetchModels()` or runs `listModels` command. Falls back to `fallbackModels` on failure or timeout.
5. **Auth probe** — runs `whoami` or checks `~/.<agent>/config.toml` via per-adapter `probeAgentAuthStatus()`.

**Caching:** Results are cached in `~/.open-design/agents.json` with a 24-hour TTL. SIGHUP triggers re-detection.

**Source:** `apps/daemon/src/runtimes/detection.ts`, `executables.ts`, `launch.ts`, `auth.ts`, `models.ts`

### 2.2 Capability Negotiation

Each detected agent exposes a `RuntimeCapabilityMap` — a flat `Record<string, boolean>`. The web UI reads this to gate features:

| Capability flag | Effect when false |
|-----------------|-------------------|
| `surgicalEdit` | Comment mode disabled; only whole-file regeneration available |
| `streaming` | Tool calls shown as spinner, not real-time feed |
| `resume` | Resume button hidden; only cancel + restart available |
| `nativeSkillLoading` | Skills injected via prompt text, not symlink to agent's skills dir |

**Source:** `apps/daemon/src/runtimes/capabilities.ts`

### 2.3 Execution

When the user sends a prompt, the daemon:

1. **Builds args** — calls `def.buildArgs(prompt, imagePaths, extraAllowedDirs, options, runtimeContext)` to produce the full argv array.
2. **Sets up env** — calls `spawnEnvForAgent(defId, baseEnv, configuredEnv)` to merge agent-specific env vars (e.g. `PI_HOME` for Pi).
3. **Checks budget** — on Windows, `checkPromptArgvBudget` ensures the composed command line stays under the 32KB CreateProcess limit. Returns `AGENT_PROMPT_TOO_LARGE` error if exceeded.
4. **Spawns** — uses `execFile` or `spawn` (depending on `promptViaStdin`), with CWD set to the project artifact directory.
5. **Parses stream** — a stream-format-specific parser reads stdout and maps lines/chunks to `DaemonAgentPayload` SSE events:

| `streamFormat` | Parser | Used by |
|----------------|--------|---------|
| `claude-stream-json` | `apps/daemon/src/claude-stream.ts` | Claude Code, OpenCode |
| `copilot-stream-json` | `apps/daemon/src/copilot-stream.ts` | Copilot |
| `json-event-stream` | `apps/daemon/src/json-event-stream.ts` | Gemini CLI, Kiro, Kilo, Vibe, DeepSeek |
| `qoder-stream-json` | `apps/daemon/src/qoder-stream.ts` | Qoder |
| `pi-rpc` | `apps/daemon/src/pi-rpc.ts` | Pi |
| `acp` | `apps/daemon/src/acp.ts` | Devin, Kiro, Kilo, Vibe |

**Source:** `apps/daemon/src/runtimes/invocation.ts`, `env.ts`, `prompt-budget.ts`

### 2.4 Cancel

`POST /api/runs/:id/cancel` sends `SIGTERM` to the agent's child process. After a grace period, `SIGKILL` follows. The daemon marks the run as `canceled` and closes the SSE stream.

### 2.5 Skill Injection

Three strategies, applied in preference order:

1. **Native skill loading** — symlink the skill directory into `~/.<agent>/skills/`; the agent picks up the skill natively.
2. **Prompt injection** — read `SKILL.md` + `references/*.md` and concatenate into the system prompt (used for agents without native skill loading).
3. **File-placed workflow** — write `.cursorrules` or equivalent into the artifact CWD (Cursor Agent).

**Source:** `apps/daemon/src/skills.ts` (skill staging), `apps/daemon/src/prompts/system.ts` (prompt composition)

---

## 3. Stream Event Contract

All adapters MUST emit events that conform to `DaemonAgentPayload` from `packages/contracts/src/sse/chat.ts`. The union includes:

| Event kind | Payload fields | UI action |
|------------|---------------|-----------|
| `status` | `label`, `model?`, `ttftMs?`, `detail?` | Status indicator update |
| `text_delta` | `delta: string` | Streaming text append |
| `thinking_delta` | `delta: string` | Reasoning panel append |
| `thinking_start` | *(none)* | Show reasoning expander |
| `tool_use` | `id`, `name`, `input` | Tool call card in feed |
| `tool_result` | `toolUseId`, `content`, `isError?` | Tool result display |
| `usage` | `usage?`, `costUsd?`, `durationMs?` | Token/cost summary |
| `live_artifact` | `action`, `projectId`, `artifactId`, … | Artifact create/update/delete |
| `live_artifact_refresh` | `phase`, `projectId`, `artifactId`, … | Artifact refresh lifecycle |
| `raw` | `line: string` | Unparsed line (debug) |

The full event union is the canonical contract in `packages/contracts/`.

---

## 4. Adapter Catalog

Registered adapters in `apps/daemon/src/runtimes/registry.ts` (16 adapters):

| id | name | streamFormat |
|----|------|-------------|
| `claude` | Claude Code | `claude-stream-json` |
| `codex` | Codex | `claude-stream-json` |
| `devin` | Devin for Terminal | `acp` |
| `gemini` | Gemini CLI | `json-event-stream` |
| `opencode` | OpenCode | `claude-stream-json` |
| `hermes` | Hermes | `claude-stream-json` |
| `kimi` | Kimi CLI | `claude-stream-json` |
| `cursor-agent` | Cursor Agent | `claude-stream-json` |
| `qwen` | Qwen CLI | `claude-stream-json` |
| `qoder` | Qoder CLI | `qoder-stream-json` |
| `copilot` | Copilot | `copilot-stream-json` |
| `pi` | Pi | `pi-rpc` |
| `kiro` | Kiro | `json-event-stream` |
| `kilo` | Kilo | `json-event-stream` |
| `vibe` | Vibe | `json-event-stream` |
| `deepseek` | DeepSeek | `json-event-stream` |

For capability matrix (surgical edit, streaming, resume, etc.), see `docs/agent-adapters.md` §6.

---

## 5. Error Contract

Adapter-level errors use `ApiError` codes from `packages/contracts/src/errors.ts`:

| Code | Meaning |
|------|---------|
| `AGENT_UNAVAILABLE` | No agent binary detected on PATH |
| `AGENT_AUTH_REQUIRED` | Agent detected but unauthenticated |
| `AGENT_EXECUTION_FAILED` | Spawn failure or runtime crash |
| `AGENT_PROMPT_TOO_LARGE` | Composed prompt exceeds platform limit (Windows 32KB) |
| `RATE_LIMITED` | Upstream rate limit hit |
| `UPSTREAM_UNAVAILABLE` | Upstream API unreachable |

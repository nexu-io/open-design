import type { ExecFileOptions } from 'node:child_process';
import type { AgentDiagnostic } from '@open-design/contracts';

export type { AgentDiagnostic } from '@open-design/contracts';

export type RuntimeEnv = NodeJS.ProcessEnv | Record<string, string>;

export type RuntimeModelOption = {
  id: string;
  label: string;
};

export type RuntimeModelSource = 'live' | 'fallback';

export type RuntimeReasoningOption = RuntimeModelOption;

export type RuntimeBuildOptions = {
  model?: string | null;
  reasoning?: string | null;
};

export type RuntimeContext = {
  cwd?: string;
  // True when the current chat run has at least one prior persisted
  // assistant message in the same conversation — i.e. this isn't the
  // first user turn. Plain-streaming adapters that support a "continue
  // the most recent conversation" CLI flag (e.g. `agy -c`) read this to
  // decide whether to resume the upstream agent's own session state
  // instead of spawning a fresh, context-free turn. Adapters that
  // either have no resume flag or recompose history into the prompt
  // themselves ignore this field.
  hasPriorAssistantTurn?: boolean;
  // Daemon-owned path to a temp file where the adapter should write
  // its diagnostic log. Today only antigravity consumes this: agy in
  // print mode is silent on stdout/stderr for both missing-auth AND
  // quota-exhausted failures (verified via `agy --log-file` capture
  // during PR #3157), so post-exit log inspection is the only way to
  // tell them apart. Adapters that don't have a `--log-file` flag
  // ignore this field; the daemon cleans the file up after reading.
  agentLogFilePath?: string;
  // Override for the antigravity model-selection settings file path.
  // Production code leaves this undefined (falls back to the default
  // ~/.gemini/antigravity-cli/settings.json). Tests pass a temp path
  // so unit assertions against buildArgs do not touch the real home dir.
  antigravitySettingsPath?: string;
};

// Marker on a RuntimeAgentDef declaring that the adapter's CLI maintains
// its own multi-turn conversation memory and the daemon should NOT also
// pack the rendered web transcript (the `## user` / `## assistant` blocks
// `buildDaemonTranscript` produces) into the user request. Today only
// `agy -c` qualifies; other plain-stream adapters have no upstream
// session storage and still rely on the daemon-side transcript injection
// for multi-turn coherence.
//
// Without this opt-out, agy with `-c` receives the same prior turn
// twice — once from its own conversation memory, once embedded in the
// composed user request — and the embedded copy includes the literal
// `<question-form>` markup it emitted on turn 1. The model then
// pattern-matches that and re-emits the form on turn 2, looking like
// the discovery loop never breaks.

export type RuntimeCapabilityMap = Record<string, boolean>;

export type RuntimeListModels = {
  args: string[];
  timeoutMs?: number;
  parse: (stdout: string) => RuntimeModelOption[] | null;
};

export type RuntimePromptBudgetError = {
  code: 'AGENT_PROMPT_TOO_LARGE';
  message: string;
  bytes?: number;
  commandLineLength?: number;
  limit: number;
};

export type RuntimeAgentDef = {
  id: string;
  name: string;
  bin: string;
  versionArgs: string[];
  fallbackModels: RuntimeModelOption[];
  buildArgs: (
    prompt: string,
    imagePaths: string[],
    extraAllowedDirs?: string[],
    options?: RuntimeBuildOptions,
    runtimeContext?: RuntimeContext,
  ) => string[];
  streamFormat: string;
  fallbackBins?: string[];
  versionProbeTimeoutMs?: number;
  helpArgs?: string[];
  capabilityFlags?: Record<string, string>;
  promptViaStdin?: boolean;
  // Format for the user prompt fed via stdin. Default is plain text (the
  // entire prompt buffer goes in raw, then stdin is closed). When set to
  // 'stream-json' the daemon writes a single JSONL line wrapping the prompt
  // as an Anthropic user message (so tool_result blocks can later be
  // injected into the same stdin without re-spawning the child). Only
  // honored for adapters that also set `promptViaStdin: true`.
  promptInputFormat?: 'text' | 'stream-json';
  eventParser?: string;
  env?: Record<string, string>;
  listModels?: RuntimeListModels;
  fetchModels?: (
    resolvedBin: string,
    env: RuntimeEnv,
  ) => Promise<RuntimeModelOption[] | null>;
  reasoningOptions?: RuntimeReasoningOption[];
  supportsImagePaths?: boolean;
  maxPromptArgBytes?: number;
  mcpDiscovery?: string;
  // How the daemon forwards the user's `.od/mcp-config.json` external MCP
  // servers to this runtime at spawn time. The shape of the injection
  // is one of three strategies, each of which the server.ts spawn
  // pipeline knows how to apply:
  //
  //   'claude-mcp-json'      — write `.mcp.json` into the managed
  //                            project cwd (Claude Code auto-loads it).
  //   'acp-merge'            — merge stdio entries into the existing
  //                            `mcpServers` array of an ACP launch
  //                            descriptor (Hermes / Kimi / Kilo / Kiro
  //                            / Vibe / Devin).
  //   'opencode-env-content' — serialise to OpenCode's `mcp` config
  //                            schema and hand it through
  //                            `OPENCODE_CONFIG_CONTENT` in the spawn
  //                            env.
  //
  // Leave undefined for adapters that have no native MCP transport
  // wired yet (codex, gemini, cursor-agent, copilot, qoder, pi). The
  // settings UI reads this field to surface an explicit "external MCP
  // is not forwarded to <agent>; configure servers in <agent>'s own
  // config file instead" hint, replacing the previous silent-failure
  // UX from issue #2142.
  externalMcpInjection?:
    | 'claude-mcp-json'
    | 'acp-merge'
    | 'opencode-env-content';
  installUrl?: string;
  docsUrl?: string;
  // When `false`, the Settings model picker hides the "Custom (fill below)"
  // option and the associated free-text input. Use this for agents whose
  // CLI does not actually accept a model id (e.g. `agy` v1.0.3 has no
  // `--model` flag yet — upstream issue #35 — and the model is chosen
  // server-side; AMR routes model selection through ACP's
  // `session/set_model` and rejects free-form ids). Defaults to allowing
  // custom input (undefined === true) so most adapters keep today's UX.
  supportsCustomModel?: boolean;
  // When `true`, the daemon trusts this adapter's CLI to carry its own
  // multi-turn conversation memory across spawn invocations (today only
  // `agy -c`). The chat composer skips the rendered web transcript on
  // follow-up turns and sends just the latest user message — see the
  // RuntimeContext.hasPriorAssistantTurn comment for why double-context
  // is the discovery-form loop's root cause.
  resumesSessionViaCli?: boolean;
  // Optional name of a daemon-process environment variable that overrides
  // the default model id when the chat run reaches the spawn layer with
  // null or the synthetic 'default'. Used by adapters whose CLI rejects
  // 'default' (e.g. AMR / vela) so an operator can swap the hardcoded
  // fallback without a code change — set the env var on the daemon
  // process when launching `tools-dev` / `od` daemon. The value must be
  // present in the daemon's `process.env`; Settings-UI per-agent env
  // values only reach the spawned child and are NOT consulted here.
  defaultModelEnvVar?: string;
  // Declarative authentication probe. When set, detection spawns
  // `<bin> <args>` after the version check and classifies the combined
  // stdout/stderr to derive `authStatus`. This replaces the previous
  // hardcoded "only cursor-agent gets an auth probe" gate: an adapter
  // opts in by declaring a cheap, side-effect-free status/whoami command
  // (e.g. cursor-agent `status`). Adapters WITHOUT this field are never
  // actively probed for auth — their auth status is only inferred later
  // from a real chat failure's error text (see classifyAgentServiceFailure).
  authProbe?: {
    args: string[];
    timeoutMs?: number;
  };
};

export type DetectedAgent = Omit<
  RuntimeAgentDef,
  | 'buildArgs'
  | 'listModels'
  | 'fetchModels'
  | 'fallbackModels'
  | 'helpArgs'
  | 'capabilityFlags'
  | 'fallbackBins'
  | 'versionProbeTimeoutMs'
  | 'maxPromptArgBytes'
  | 'env'
  | 'authProbe'
> & {
  models: RuntimeModelOption[];
  modelsSource: RuntimeModelSource;
  available: boolean;
  authStatus?: 'ok' | 'missing' | 'unknown';
  authMessage?: string;
  path?: string;
  version?: string | null;
  diagnostics?: AgentDiagnostic[];
};

export type RuntimeExecOptions = ExecFileOptions & {
  env?: NodeJS.ProcessEnv;
};

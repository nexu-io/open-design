import type { ExecFileOptions } from 'node:child_process';

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
  // Merged environment that will be made available to the spawned
  // agent (host process.env overlaid with the per-agent overrides
  // returned by `agentCliEnvForAgent(...)`). Adapters that surface a
  // user-tunable behaviour via an env var should read it from this
  // map rather than from `process.env`, so configured-env and
  // process-env both resolve to the same value at argv-build time.
  // PR #2556 (Siri-Ray): the OpenClaw adapter pulls
  // `OD_OPENCLAW_SESSION` from here so model probe and chat spawn
  // agree on the same gateway session id.
  env?: Record<string, string | undefined>;
};

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
  // Optional name of a daemon-process environment variable that overrides
  // the default model id when the chat run reaches the spawn layer with
  // null or the synthetic 'default'. Used by adapters whose CLI rejects
  // 'default' (e.g. AMR / vela) so an operator can swap the hardcoded
  // fallback without a code change — set the env var on the daemon
  // process when launching `tools-dev` / `od` daemon. The value must be
  // present in the daemon's `process.env`; Settings-UI per-agent env
  // values only reach the spawned child and are NOT consulted here.
  defaultModelEnvVar?: string;
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
> & {
  models: RuntimeModelOption[];
  modelsSource: RuntimeModelSource;
  available: boolean;
  authStatus?: 'ok' | 'missing' | 'unknown';
  authMessage?: string;
  path?: string;
  version?: string | null;
};

export type RuntimeExecOptions = ExecFileOptions & {
  env?: NodeJS.ProcessEnv;
};

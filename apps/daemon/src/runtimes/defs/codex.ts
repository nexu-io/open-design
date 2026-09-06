import { spawnSync } from 'node:child_process';
import { DEFAULT_MODEL_OPTION, clampCodexReasoning } from './shared.js';
import { resolveAgentLaunch } from '../launch.js';
import type { RuntimeModelOption } from '../types.js';
import type { RuntimeAgentDef } from '../types.js';

function parseCodexStringList(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const values = raw
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function parseCodexServiceTiers(raw: unknown): RuntimeModelOption[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: RuntimeModelOption[] = [];
  const seen = new Set<string>();
  for (const tier of raw) {
    if (!tier || typeof tier !== 'object') continue;
    const entry = tier as {
      id?: unknown;
      name?: unknown;
      label?: unknown;
    };
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label =
      typeof entry.name === 'string' && entry.name.trim()
        ? entry.name.trim()
        : typeof entry.label === 'string' && entry.label.trim()
          ? entry.label.trim()
        : id;
    out.push({ id, label });
  }
  return out.length > 0 ? out : undefined;
}

const CODEX_SPEED_TIER_SERVICE_TIER_OPTIONS: Record<string, RuntimeModelOption> = {
  fast: { id: 'priority', label: 'Fast' },
};

function parseCodexServiceTiersFromSpeedTiers(
  speedTiers: readonly string[] | undefined,
): RuntimeModelOption[] | undefined {
  if (!speedTiers) return undefined;
  const out: RuntimeModelOption[] = [];
  const seen = new Set<string>();
  for (const raw of speedTiers) {
    const option = CODEX_SPEED_TIER_SERVICE_TIER_OPTIONS[raw.toLowerCase()];
    if (!option || seen.has(option.id)) continue;
    seen.add(option.id);
    out.push({ ...option });
  }
  return out.length > 0 ? out : undefined;
}

export function parseCodexDebugModels(stdout: string): RuntimeModelOption[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(stdout || ''));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const models = Array.isArray(parsed)
    ? parsed
    : (parsed as { models?: unknown }).models;
  if (!Array.isArray(models)) return null;

  const out = [DEFAULT_MODEL_OPTION];
  const seen = new Set<string>([DEFAULT_MODEL_OPTION.id]);
  for (const raw of models) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as {
      slug?: unknown;
      id?: unknown;
      display_name?: unknown;
      name?: unknown;
      visibility?: unknown;
      additional_speed_tiers?: unknown;
      service_tiers?: unknown;
    };
    if (entry.visibility === 'hidden') continue;
    const id =
      typeof entry.slug === 'string'
        ? entry.slug.trim()
        : typeof entry.id === 'string'
          ? entry.id.trim()
          : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label =
      typeof entry.display_name === 'string' && entry.display_name.trim()
        ? entry.display_name.trim()
        : typeof entry.name === 'string' && entry.name.trim()
          ? entry.name.trim()
          : id;
    const model: RuntimeModelOption = { id, label };
    const additionalSpeedTiers = parseCodexStringList(
      entry.additional_speed_tiers,
    );
    if (additionalSpeedTiers) model.additionalSpeedTiers = additionalSpeedTiers;
    const serviceTierOptions =
      parseCodexServiceTiers(entry.service_tiers) ??
      parseCodexServiceTiersFromSpeedTiers(additionalSpeedTiers);
    if (serviceTierOptions) model.serviceTierOptions = serviceTierOptions;
    out.push(model);
  }
  return out.length > 1 ? out : null;
}

const GPT_5_5_SERVICE_TIER_OPTIONS: RuntimeModelOption[] = [
  { id: 'priority', label: 'Fast' },
];

// Codex applies `shell_environment_policy` again when its shell tool starts a
// command. That second boundary is independent from the environment the daemon
// passes to the Codex process itself. In particular, the supported
// `inherit = "core"` policy removes every OpenDesign wrapper variable, so a
// prompt can see the documented `$OD_NODE_BIN` / `$OD_BIN` invocation yet the
// actual command expands both paths to empty strings.
//
// Start from the daemon-built process environment, then use Codex's
// `include_only` policy to retain only the small cross-platform shell baseline
// plus the run-scoped wrapper contract. Credentials inherited by the daemon
// remain unavailable unless they are one of the explicit OpenDesign
// capabilities below. `OD_TOOL_TOKEN` stays in the environment channel rather
// than being copied into argv, process listings, or Codex config files.
const CODEX_SHELL_ENVIRONMENT_INCLUDE_KEYS = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'TERM',
  'COLORTERM',
  'SYSTEMROOT',
  'COMSPEC',
  'PATHEXT',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'HOMEDRIVE',
  'HOMEPATH',
  // Packaged macOS uses Electron's helper executable as its Node-compatible
  // runtime. The helper only behaves as Node while this flag survives into
  // Codex's tool shell; without it every OD_NODE_BIN + OD_BIN wrapper exits
  // before the CLI script can run.
  'ELECTRON_RUN_AS_NODE',
  'OD_BIN',
  'OD_HYPERFRAMES_BIN',
  'OD_NODE_BIN',
  // macOS packages use Electron Helper as OD_NODE_BIN. Preserve its Node mode
  // when Codex applies this second environment filter to tool shell commands.
  'ELECTRON_RUN_AS_NODE',
  'OD_DAEMON_URL',
  'OD_TOOL_TOKEN',
  'OD_DATA_DIR',
  'OD_PROJECT_ID',
  'OD_PROJECT_DIR',
  'OD_TASK_INPUT_DIR',
] as const;

export function codexOpenDesignShellEnvironmentArgs(): string[] {
  const includeOnly = CODEX_SHELL_ENVIRONMENT_INCLUDE_KEYS
    .map((key) => `"${key}"`)
    .join(',');
  return [
    '-c',
    // A login shell can source user profile files after Codex applies the
    // whitelist and reintroduce credentials that the daemon intentionally
    // withheld. Structured DS wrappers need a deterministic, run-scoped
    // environment, so keep tool shells non-login for daemon-launched Codex.
    'allow_login_shell=false',
    '-c',
    'shell_environment_policy.inherit="all"',
    '-c',
    'shell_environment_policy.ignore_default_excludes=true',
    '-c',
    `shell_environment_policy.include_only=[${includeOnly}]`,
  ];
}

// Codex asks the API for a reasoning summary only when `model_reasoning_summary`
// resolves to something other than `none`, and its own embedded model catalog
// ships `"default_reasoning_summary": "none"` for the current frontier models
// (verbatim from the `gpt-5.6-sol` entry in codex-cli 0.149.1). The result is a
// turn that provably reasons — `turn.completed` reports the reasoning tokens —
// while the JSON stream carries no reasoning item at all.
//
// Measured on codex-cli 0.149.1, one prompt, two invocations differing only in
// this override:
//
//   without → {"type":"item.completed","item":{"type":"agent_message",…}}
//             and nothing else, on a turn billed 516 reasoning tokens
//   with    → {"type":"item.completed","item":{"id":"item_1","type":"reasoning",
//               "text":"**Calculating favorable combinations ratio**"}}
//
// `emitCodexReasoningItem` in json-event-stream.ts already turns exactly that
// item into `thinking_delta`, so asking for the summary is the whole fix.
//
// This is deliberately unconditional rather than "only when the user has not
// set it": codex hashes the per-turn `turn_context` block, so an override that
// appears on some turns and not others would break the prefix cache that
// `exec resume` exists to reuse. Both the create and the resume turn get the
// identical pair.
export function codexReasoningSummaryArgs(): string[] {
  return ['-c', 'model_reasoning_summary="detailed"'];
}

// Codex registers its `update_plan` tool only when `tools.update_plan.enabled`
// resolves true, and on codex-cli 0.153.0 the default is OFF. The daemon
// therefore has to ask for it, or no codex turn can ever produce a Todos card
// however plainly the system prompt names the tool (OPEND-2410).
//
// Measured on codex-cli 0.153.0 against the real CLI, driving `codex
// app-server` with byte-identical argv to this file's and the same JSON-RPC
// handshake, on one prompt that says 「用你的计划工具记录三步计划」:
//
//   without → 0 × `turn/plan/updated`, and the plan arrives as reply prose
//   with    → 4 × `turn/plan/updated`, each `plan: [{ step, status }, …]`
//
// `handleTurnPlan` in agent-protocol/codex-app-server/normalize.ts already
// turns exactly that notification into a `todo_list` frame, so asking for the
// tool is the whole fix — no parser change is involved.
//
// Two supporting facts, both read out of the 0.153.0 binary rather than
// guessed, explain why this stopped working without anyone touching OD:
// codex's embedded model catalog carries the `update_plan` briefing in the
// `gpt-5.2` entry ONLY — `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.5`, and the whole
// `gpt-5.6-*` family mention it zero times — and those newer models run
// `"tool_mode": "code_mode_only"`. So on a current model the tool is both
// unbriefed and unregistered by default.
//
// Unconditional for the same reason `codexReasoningSummaryArgs` is: codex
// hashes the per-turn `turn_context`, so an override present on some turns and
// absent on others would break the prefix cache `exec resume` exists to reuse,
// and would make the Todos card blink out on the second turn of a thread.
export function codexUpdatePlanToolArgs(): string[] {
  return ['-c', 'tools.update_plan.enabled=true'];
}

export function codexNeedsDangerFullAccessSandbox(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  // Operator override for deployments where Codex cannot create its
  // workspace-write sandbox, for example unprivileged Linux containers.
  // Only danger-full-access is accepted; unknown values keep the default path.
  if (env.OD_CODEX_SANDBOX?.trim() === 'danger-full-access') return true;
  if (platform === 'win32') return true;
  // WSL reports `linux` but Codex still hits the Windows read-only
  // workspace-write sandbox path when launched from there (#2834).
  return Boolean(env.WSL_DISTRO_NAME?.trim());
}

export const codexAgentDef = {
    id: 'codex',
    name: 'Codex CLI',
    bin: 'codex',
    versionArgs: ['--version'],
    // Codex exposes its installed model catalog through `debug models` on
    // recent CLIs. Older builds fall back to these static hints.
    listModels: {
      args: ['debug', 'models'],
      parse: parseCodexDebugModels,
      timeoutMs: 5000,
    },
    authProbe: {
      args: ['login', 'status'],
      timeoutMs: 5000,
    },
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      {
        id: 'gpt-5.5',
        label: 'gpt-5.5',
        additionalSpeedTiers: ['fast'],
        serviceTierOptions: GPT_5_5_SERVICE_TIER_OPTIONS,
      },
      { id: 'gpt-5.4', label: 'gpt-5.4' },
      { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
      { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
      { id: 'gpt-5.1', label: 'gpt-5.1' },
      { id: 'gpt-5.1-codex-mini', label: 'gpt-5.1-codex-mini' },
      { id: 'gpt-5-codex', label: 'gpt-5-codex' },
      { id: 'gpt-5', label: 'gpt-5' },
      { id: 'o3', label: 'o3' },
      { id: 'o4-mini', label: 'o4-mini' },
    ],
    reasoningOptions: [
      { id: 'default', label: 'Default' },
      { id: 'none', label: 'None' },
      { id: 'minimal', label: 'Minimal' },
      { id: 'low', label: 'Low' },
      { id: 'medium', label: 'Medium' },
      { id: 'high', label: 'High' },
      { id: 'xhigh', label: 'XHigh' },
    ],
    // Prompt is delivered via stdin pipe (gated by `promptViaStdin: true`
    // below) to avoid Windows `spawn ENAMETOOLONG` while keeping Codex on
    // its structured JSON stream. Recent Codex CLI versions reject a bare
    // `-` argv sentinel — passing both the pipe and `-` produces
    // `error: unexpected argument '-' found` and the agent exits with
    // code 2 before any prompt is read (see issue #237). The pipe alone
    // is sufficient for stdin delivery.
    buildArgs: (
      _prompt,
      _imagePaths,
      extraAllowedDirs = [],
      options = {},
      runtimeContext = {},
    ) => {
      // Codex CLI's `workspace-write` sandbox blocks shell invocations on
      // Windows ("powershell.exe ... rejected: blocked by policy", #1721),
      // because Codex has no working OS-level sandbox on Windows and falls
      // back to a coarse policy that rejects any shell. macOS (Seatbelt)
      // and Linux (Landlock+seccomp) keep workspace-write because their
      // sandbox enforcement permits shell while restricting writes.
      const needsDangerFullAccess = codexNeedsDangerFullAccessSandbox();
      // Capture-style resume: when the daemon has a stored Codex thread id for
      // this conversation it asks the CLI to continue that session with
      // `exec resume <thread_id>` instead of `exec` (a fresh session). Codex
      // mints its own id, so the daemon does not specify one — it captures the
      // id from the create turn's `thread.started.thread_id` event (see the
      // json-event-stream `codex` parser) and replays it here on resume.
      const resumeSessionId =
        typeof runtimeContext.resumeSessionId === 'string' &&
        runtimeContext.resumeSessionId.length > 0
          ? runtimeContext.resumeSessionId
          : null;
      // `codex exec resume` rejects `--sandbox` (only valid on a fresh
      // `exec`); the sandbox mode must be passed as a `-c sandbox_mode=...`
      // config override. We mirror the exact same effective sandbox policy as
      // the create turn so Codex's per-turn `turn_context` block byte-matches
      // across turns and does not break the upstream prefix cache the resume
      // is meant to reuse.
      const sandboxArgs = needsDangerFullAccess
        ? resumeSessionId
          ? ['-c', 'sandbox_mode="danger-full-access"']
          : ['--sandbox', 'danger-full-access']
        : resumeSessionId
          ? [
              '-c',
              'sandbox_mode="workspace-write"',
              '-c',
              'sandbox_workspace_write.network_access=true',
            ]
          : [
              '--sandbox',
              'workspace-write',
              '-c',
              'sandbox_workspace_write.network_access=true',
            ];
      const args = resumeSessionId
        ? ['exec', 'resume', '--json', '--skip-git-repo-check', ...sandboxArgs]
        : ['exec', '--json', '--skip-git-repo-check', ...sandboxArgs];
      if (
        runtimeContext.disablePlugins === true
        || process.env.OD_CODEX_DISABLE_PLUGINS === '1'
      ) {
        args.push('--disable', 'plugins');
      }
      args.push(...codexOpenDesignShellEnvironmentArgs());
      args.push(...codexReasoningSummaryArgs());
      args.push(...codexUpdatePlanToolArgs());
      // `-C <cwd>` and `--add-dir <dir>` are CREATE-only flags: `codex exec
      // resume` rejects both (`error: unexpected argument '-C' found`), so
      // appending them on a resume turn would make the follow-up turn die
      // before the first event. The daemon already spawns the child with
      // `cwd: effectiveCwd`, and resuming by explicit SESSION_ID does not use
      // codex's cwd-based session filtering, so the resumed turn still runs in
      // the right workspace without `-C`. The extra writable dirs were granted
      // when the session was created and are carried by the resumed session.
      if (!resumeSessionId) {
        if (runtimeContext.cwd) {
          args.push('-C', runtimeContext.cwd);
        }
        const dirs = (extraAllowedDirs || []).filter(
          (d) => typeof d === 'string' && d.length > 0,
        );
        for (const d of dirs) {
          args.push('--add-dir', d);
        }
      }
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      if (options.reasoning && options.reasoning !== 'default') {
        const effort = clampCodexReasoning(options.model, options.reasoning);
        // Codex accepts `-c key=value` config overrides; reasoning effort
        // is exposed as `model_reasoning_effort`.
        args.push('-c', `model_reasoning_effort="${effort}"`);
      }
      if (options.serviceTier && options.serviceTier !== 'default') {
        args.push('-c', `service_tier="${options.serviceTier}"`);
      }
      // The resume thread id is the positional SESSION_ID argument of
      // `codex exec resume`; it must come after the flags. The prompt is
      // delivered via stdin (promptViaStdin), so the thread id is the final
      // argv entry.
      if (resumeSessionId) {
        args.push(resumeSessionId);
      }
      return args;
    },
    promptViaStdin: true,
    // Codex's CLI carries its own session across spawns: on a follow-up turn
    // the daemon resumes the captured thread id instead of re-sending the
    // flattened transcript, so the first upstream call reuses the warm prefix
    // cache. Capture-style: the resume handle is the `thread.started.thread_id`
    // captured from the stream, not a daemon-minted id.
    resumesSessionViaCli: true,
    capturesSessionIdFromStream: true,
    streamFormat: 'json-event-stream',
    eventParser: 'codex',
} satisfies RuntimeAgentDef;

/* ------------------------------------------------------------------ *
 * app-server transport (runtime-switched, shipping default)
 * ------------------------------------------------------------------ */

/**
 * `streamFormat` value that routes a codex run through the JSON-RPC
 * `codex app-server` transport instead of `exec --json`.
 *
 * The two transports coexist. `app-server` is the shipping default, while an
 * operator can set `OD_CODEX_TRANSPORT=exec-json` for an immediate rollback.
 * The reason to have a second transport at all is that `exec --json` cannot
 * stream: `codex-rs/exec/src/event_processor_with_json_output.rs` has
 * suppressed `AgentMessageDelta` / `AgentReasoningDelta` since `rust-v0.8.0`,
 * so a several-minute codex turn shows nothing until an item completes. The
 * app-server transport carries the same items PLUS the token deltas.
 */
export const CODEX_APP_SERVER_STREAM_FORMAT = 'codex-app-server';

/**
 * Lowest codex release `auto` mode will switch to.
 *
 * Three numbers matter, established by reading the codex source at each tag
 * rather than by reading the protocol declarations — a method NAME routinely
 * appears releases before anything emits it, and a declared-but-unwired method
 * looks supported while streaming nothing:
 *
 *   rust-v0.56.0  `thread/start` / `thread/resume` / `turn/start` /
 *                 `turn/interrupt` land wired; `ThreadStartParams.sandbox` and
 *                 `TurnStartParams.summary` exist from day one.
 *   rust-v0.59.0  first emit of `item/agentMessage/delta` (PR #6559) and of the
 *                 reasoning summary deltas — i.e. the streaming this transport
 *                 exists for. Also the first `turn/completed` emit.
 *   rust-v0.64.0  first emit of `thread/tokenUsage/updated`. This is the
 *                 CAPABILITY floor: below it the transport still works but
 *                 reports no token usage, which would be a regression against
 *                 `exec --json`.
 *
 * The constant is set higher still, at the release where `initialize` first
 * accepts a `capabilities` object at all (PR #10231). Below it our handshake
 * would be sending a field the server has no place to put, and we would be
 * guessing at how its deserializer treats the extra key. Refusing to guess
 * costs nothing real — codex ships roughly two stable releases a week, so
 * everything below this floor is long superseded.
 *
 * Two notifications land later than this floor and degrade quietly when
 * absent: `warning` (rust-v0.122.0) simply produces no warning pill, and
 * `item/fileChange/patchUpdated` (rust-v0.123.0) is not consumed at all.
 */
export const CODEX_APP_SERVER_MIN_VERSION = '0.95.0';

export type CodexTransport = 'exec-json' | 'app-server';
export type CodexTransportPreference = CodexTransport | 'auto';

/** Operator switch. Unset means the shipping `app-server` behaviour. */
export const CODEX_TRANSPORT_ENV_VAR = 'OD_CODEX_TRANSPORT';

/**
 * Read the operator's transport preference.
 *
 * Three values. An unrecognised non-empty value fails closed to exec-json
 * rather than taking Codex offline; an unset or empty value uses the shipping
 * app-server default.
 *
 *   (unset)                app-server (shipping default)
 *   `exec-json`            force the legacy transport (rollback)
 *   `auto`                 app-server when the installed codex is new enough
 *   `app-server`           force, no version gate (operator override)
 */
export function codexTransportPreference(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): CodexTransportPreference {
  const raw = typeof env[CODEX_TRANSPORT_ENV_VAR] === 'string'
    ? String(env[CODEX_TRANSPORT_ENV_VAR]).trim().toLowerCase()
    : '';
  if (raw === '') return 'app-server';
  if (raw === 'app-server') return 'app-server';
  if (raw === 'auto') return 'auto';
  return 'exec-json';
}

/**
 * Decide whether a detected codex version is at or above the app-server floor.
 *
 * Fails closed: a version string this parser cannot read (a nightly tag, an
 * empty probe result, a CLI that changed its `--version` format) reports false,
 * so `auto` stays on `exec --json` instead of gambling on a silent stream.
 */
export function codexAppServerSupportsVersion(version: string | null | undefined): boolean {
  const match = /(\d+)\.(\d+)\.(\d+)/u.exec(String(version ?? ''));
  if (!match) return false;
  const floor = /(\d+)\.(\d+)\.(\d+)/u.exec(CODEX_APP_SERVER_MIN_VERSION);
  if (!floor) return false;
  for (let i = 1; i <= 3; i += 1) {
    const found = Number(match[i]);
    const required = Number(floor[i]);
    if (found > required) return true;
    if (found < required) return false;
  }
  return true;
}

/** Resolve the transport for one run from the switch plus the version probe. */
export function resolveCodexTransport(opts: {
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  version: string | null;
}): CodexTransport {
  const preference = codexTransportPreference(opts.env);
  if (preference === 'app-server') return 'app-server';
  if (preference === 'exec-json') return 'exec-json';
  return codexAppServerSupportsVersion(opts.version) ? 'app-server' : 'exec-json';
}

/**
 * Effective sandbox mode for a codex run, shared by both transports so the
 * app-server thread can never be more permissive than the `exec` invocation it
 * replaces. `workspace-write` and `danger-full-access` are the same two
 * `SandboxMode` values codex's own `--sandbox` flag accepts, and codex builds
 * the identical policy from either entry point.
 */
export function codexResolvedSandboxMode(): 'workspace-write' | 'danger-full-access' {
  return codexNeedsDangerFullAccessSandbox() ? 'danger-full-access' : 'workspace-write';
}

/**
 * argv for `codex app-server`.
 *
 * Almost everything the `exec` path puts on argv moves onto the wire: the
 * prompt, model, reasoning effort, service tier, reasoning summary, cwd, and
 * sandbox mode are all typed `thread/start` / `turn/start` parameters. What
 * stays on argv is what has no RPC equivalent:
 *
 *  - the OpenDesign shell-environment policy, byte-identical to the exec path,
 *    because it governs the environment codex hands to its own shell tool;
 *  - `sandbox_workspace_write.network_access`, the same `-c` override the exec
 *    path already uses;
 *  - `sandbox_workspace_write.writable_roots`, the config-level equivalent of
 *    `exec --add-dir`. Verified against codex's own source rather than assumed:
 *    `Config::load` merges `additional_writable_roots` (the `--add-dir` flag)
 *    and `sandbox_workspace_write.writable_roots` into the SAME
 *    `workspace_roots` list, and `SandboxPolicy::get_writable_roots_with_cwd`
 *    then appends cwd, `/tmp`, and `$TMPDIR` on top of whatever is configured.
 *    Both entry points are therefore additive over the same defaults — this
 *    grants no access `--add-dir` would not have granted.
 *  - `--disable plugins`, the same per-run plugin isolation flag.
 */
function buildCodexAppServerArgs(
  extraAllowedDirs: string[] = [],
  runtimeContext: { disablePlugins?: boolean } = {},
): string[] {
  const args = ['app-server'];
  if (
    runtimeContext.disablePlugins === true
    || process.env.OD_CODEX_DISABLE_PLUGINS === '1'
  ) {
    args.push('--disable', 'plugins');
  }
  args.push(...codexOpenDesignShellEnvironmentArgs());
  // The plan tool has no `thread/start` or `turn/start` parameter, so unlike
  // the model / effort / summary knobs it stays on argv on this transport too.
  args.push(...codexUpdatePlanToolArgs());
  if (codexResolvedSandboxMode() === 'workspace-write') {
    args.push('-c', 'sandbox_workspace_write.network_access=true');
    const dirs = (extraAllowedDirs || []).filter(
      (d) => typeof d === 'string' && d.length > 0,
    );
    if (dirs.length > 0) {
      args.push('-c', `sandbox_workspace_write.writable_roots=${JSON.stringify(dirs)}`);
    }
  }
  return args;
}

/**
 * Return the runtime definition to use for one run under `transport`.
 *
 * Under `exec-json` this returns the SAME OBJECT the registry exports. That is
 * the rollback guarantee in its strongest available form: with the switch off
 * there is no derived def, no copied field, and nothing downstream — the spawn
 * branch, the `start` SSE payload, the execution-profile lookup, the resume
 * bookkeeping — can observe that this code exists.
 */
export function withCodexTransport(
  def: RuntimeAgentDef,
  transport: CodexTransport,
): RuntimeAgentDef {
  if (def.id !== 'codex' || transport !== 'app-server') return def;
  return {
    ...def,
    streamFormat: CODEX_APP_SERVER_STREAM_FORMAT,
    // The prompt is a `turn/start` parameter; stdin carries JSON-RPC frames.
    promptViaStdin: false,
    buildArgs: (_prompt, _imagePaths, extraAllowedDirs = [], _options = {}, runtimeContext = {}) =>
      buildCodexAppServerArgs(extraAllowedDirs, runtimeContext),
  };
}

/**
 * Memoized `codex --version`, keyed by resolved binary path.
 *
 * Only consulted in `auto` mode, so a default (`exec --json`) run and a forced
 * `app-server` run both cost zero extra spawns. The result is cached for the
 * daemon's lifetime: a codex upgrade mid-session keeps whichever transport the
 * daemon started with until the next restart, which is the same granularity
 * the switch itself has.
 */
let codexVersionProbeCache: { path: string; version: string | null } | null = null;

export function probeCodexVersion(launchPath: string): string | null {
  if (codexVersionProbeCache?.path === launchPath) return codexVersionProbeCache.version;
  let version: string | null = null;
  try {
    const result = spawnSync(launchPath, ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    });
    const raw = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
    version = raw ? (raw.split(/\r?\n/u)[0] ?? null) : null;
  } catch {
    version = null;
  }
  codexVersionProbeCache = { path: launchPath, version };
  return version;
}

/** Test-only: forget the memoized probe so a suite can vary the version. */
export function resetCodexVersionProbeCache(): void {
  codexVersionProbeCache = null;
}

/**
 * Resolve the runtime definition a chat run should use for `agentId`.
 *
 * This is the single choke point where the codex transport switch is applied.
 * For every non-codex agent, and for codex with the switch off, the argument is
 * returned unchanged — same object, same behaviour.
 */
export function applyCodexTransportOverride(
  def: RuntimeAgentDef | null,
  env: NodeJS.ProcessEnv = process.env,
): RuntimeAgentDef | null {
  if (!def || def.id !== 'codex') return def;
  const preference = codexTransportPreference(env);
  if (preference === 'exec-json') return def;
  const version = preference === 'auto'
    ? probeCodexVersion(resolveAgentLaunch(def).launchPath ?? def.bin)
    : null;
  return withCodexTransport(def, resolveCodexTransport({ env, version }));
}

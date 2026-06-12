import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mergeProxyAwareEnv, resolveSystemProxyEnv } from '@open-design/platform';
import { readAppConfigSync } from '../app-config.js';
import { resolveProjectRelativePath } from '../home-expansion.js';
import { expandConfiguredEnv } from './paths.js';
import { resolveAmrOpenCodeExecutable } from './executables.js';
import { amrVelaProfileEnv } from '../integrations/vela-profile.js';
import { resolveProjectRootFromNestedModule } from '../project-root.js';
import {
  applySandboxRuntimeEnv,
  isSandboxModeEnabled,
  resolveSandboxRuntimeConfig,
  type SandboxRuntimeConfig,
} from '../sandbox-mode.js';

type RuntimeEnvMap = NodeJS.ProcessEnv | Record<string, string>;
type SpawnEnvOptions = {
  resolvedBin?: string | null;
};

const RUNTIME_MODULE_PROJECT_ROOT = resolveProjectRootFromNestedModule(
  path.dirname(fileURLToPath(import.meta.url)),
);

// Build the env passed to spawn() for a given agent adapter.
//
// The claude adapter strips Anthropic API credentials so Claude Code's own auth
// resolution (claude login / Pro/Max plan) wins instead of silently
// falling back to API-key billing whenever the daemon happened to be
// launched from a shell that exported the key for SDK or scripting use.
// See issue #398.
//
// However, when ANTHROPIC_BASE_URL is set the user is intentionally
// routing Claude Code to a custom endpoint (e.g. a Kimi/Moonshot proxy).
// In that case claude login is meaningless, so preserve the credential so
// the child can authenticate against the custom base URL.
//
// The codex adapter has the symmetric problem: a stale BYOK
// OPENAI_API_KEY / CODEX_API_KEY left behind in app-config.json silently
// outranks Codex CLI's own `~/.codex/auth.json` (codex login) and trips
// 401 invalid_api_key whenever execution mode is switched back to
// Local CLI. Strip both keys unless the user has also configured a
// custom OPENAI_BASE_URL — i.e. they are intentionally routing Codex
// CLI through a third-party OpenAI-compatible gateway. See issue #2420.
//
// Windows env-var names are case-insensitive at the kernel level
// (`GetEnvironmentVariable`), but spreading `process.env` into a plain
// object loses Node's case-insensitive accessor — `Anthropic_Api_Key`
// would survive a literal `delete env.ANTHROPIC_API_KEY` and still reach
// the child. Iterate keys and compare case-insensitively to close that.
// When the daemon launches the vela (amr) CLI, forward this installation's id
// so vela's analytics can be correlated back to it. spawnEnvForAgent is
// synchronous, so this uses readAppConfigSync — the synchronous mirror of
// readAppConfig — to resolve consent and the installationId through the exact
// same parsing/validation/defaulting the daemon and web analytics config use.
// That keeps vela's correlation in lockstep with what the web side already
// emits: telemetry defaults to on (opt-out), the id is withheld only when the
// user has explicitly opted out (metrics !== true) or no id exists, and an
// unreadable config simply omits the env (vela reports without it).
function amrAnalyticsIdentityEnv(
  env: NodeJS.ProcessEnv,
): Record<string, string> {
  const dataDir = env.OD_DATA_DIR?.trim();
  if (!dataDir) return {};
  let cfg: { telemetry?: { metrics?: boolean }; installationId?: string | null };
  try {
    cfg = readAppConfigSync(dataDir);
  } catch {
    return {};
  }
  // Matches the analytics gate in analytics.ts (`telemetry?.metrics !== true`).
  if (cfg.telemetry?.metrics !== true) return {};
  const installationId = cfg.installationId;
  if (typeof installationId !== 'string' || installationId.length === 0) {
    return {};
  }
  return { OD_INSTALLATION_ID: installationId };
}

export function spawnEnvForAgent(
  agentId: string,
  baseEnv: RuntimeEnvMap,
  configuredEnv: unknown = {},
  systemProxyEnv: RuntimeEnvMap = resolveSystemProxyEnv(),
  options: SpawnEnvOptions = {},
): NodeJS.ProcessEnv {
  const sandboxRuntime = sandboxRuntimeConfigForBaseEnv(baseEnv);
  const env = mergeProxyAwareEnv(
    process.platform,
    systemProxyEnv,
    baseEnv,
    expandConfiguredEnv(configuredEnv),
  );
  if (agentId === 'amr') {
    Object.assign(env, amrVelaProfileEnv(env));
    Object.assign(env, amrAnalyticsIdentityEnv(env));
    // `execAgentFile` REPLACES the child environment (execFile with `env`
    // set), so anything missing here is genuinely absent for vela. `vela model
    // list` resolves its config home up front and exits non-zero with
    // "$HOME is not defined" when HOME is unset — while `vela model preset`
    // and `vela --version` do not need it. A packaged daemon spawned with a
    // stripped env (or any caller that did not forward HOME) would therefore
    // detect AMR and seed the picker from preset, yet fail every run's remote
    // catalog probe. Backfill HOME from the OS so the authoritative catalog
    // call is never silently decapitated by a missing home dir.
    if (!env.HOME?.trim()) {
      const home = os.homedir();
      if (home) env.HOME = home;
    }
    // Identify Open Design as the host so the vela CLI tags its command +
    // model_request analytics with source=open_design (revenue attribution).
    // Not PII (unlike the installation id above), so set it regardless of the
    // telemetry-consent gate that amrAnalyticsIdentityEnv applies.
    if (!env.AMR_CLIENT_SOURCE?.trim()) {
      env.AMR_CLIENT_SOURCE = 'open_design';
    }
    if (!env.OPENCODE_TEST_HOME?.trim() && env.OD_DATA_DIR?.trim()) {
      env.OPENCODE_TEST_HOME = path.join(
        env.OD_DATA_DIR.trim(),
        'amr',
        'opencode-home',
      );
    }
    if (!env.VELA_OPENCODE_BIN?.trim()) {
      const opencodeBin = resolveAmrOpenCodeExecutable(env);
      if (opencodeBin) env.VELA_OPENCODE_BIN = opencodeBin;
    }
    return reapplySandboxRuntimeEnv(env, sandboxRuntime);
  }
  if (agentId === 'claude') {
    if (!isOpenClaudeExecutable(options.resolvedBin)) {
      stripUnlessCustomBaseUrl(env, 'ANTHROPIC_BASE_URL', [
        'ANTHROPIC_API_KEY',
        'ANTHROPIC_AUTH_TOKEN',
      ]);
    }
    return reapplySandboxRuntimeEnv(env, sandboxRuntime);
  }
  if (agentId === 'codex') {
    stripUnlessCustomBaseUrl(env, 'OPENAI_BASE_URL', [
      'OPENAI_API_KEY',
      'CODEX_API_KEY',
    ]);
    return reapplySandboxRuntimeEnv(env, sandboxRuntime);
  }
  if (agentId === 'opencode') {
    stripKeysCaseInsensitive(env, [
      'OPENCODE',
      'OPENCODE_PID',
      'OPENCODE_RUN_ID',
      'OPENCODE_SERVER_PASSWORD',
    ]);
    // OpenCode is bun-based and, left to its defaults, walks up from its cwd to
    // the nearest project root and runs `bun install` there at startup to set up
    // local plugins. When that root is a pnpm workspace (the daemon's own repo,
    // or a project nested inside it), the install replaces the pnpm `.pnpm` store
    // with a bun `node_modules/.bun` + `bun.lock` and breaks the workspace.
    // Disable project-config discovery (and its install) so OpenCode only honors
    // the config the daemon injects via OPENCODE_CONFIG_CONTENT — this is exactly
    // what the AMR path already does for its private OpenCode server.
    if (!env.OPENCODE_DISABLE_PROJECT_CONFIG?.trim()) {
      env.OPENCODE_DISABLE_PROJECT_CONFIG = 'true';
    }
    return reapplySandboxRuntimeEnv(env, sandboxRuntime);
  }
  return reapplySandboxRuntimeEnv(env, sandboxRuntime);
}

export function openDesignAmrTraceEnv(input: {
  agentId: string;
  runId: string;
  conversationId?: string | null;
  runAttempt: number;
}): NodeJS.ProcessEnv {
  if (input.agentId !== 'amr') return {};

  const runId = input.runId.trim();
  if (!runId) {
    throw new Error('OPEN_DESIGN_RUN_ID requires a non-empty run id for AMR runs');
  }
  if (!Number.isFinite(input.runAttempt) || input.runAttempt < 0) {
    throw new Error('OPEN_DESIGN_RUN_ATTEMPT requires a non-negative finite attempt index');
  }

  const conversationId = input.conversationId?.trim();
  return {
    OPEN_DESIGN_RUN_ID: runId,
    OPEN_DESIGN_RUN_ATTEMPT: String(Math.floor(input.runAttempt)),
    ...(conversationId ? { OPEN_DESIGN_SESSION_ID: conversationId } : {}),
  };
}

function isOpenClaudeExecutable(resolvedBin: string | null | undefined): boolean {
  if (typeof resolvedBin !== 'string' || !resolvedBin.trim()) return false;
  const base = path
    .basename(resolvedBin.trim().replace(/\\/g, '/'))
    .replace(/\.(exe|cmd|bat)$/i, '')
    .toLowerCase();
  return base === 'openclaude';
}

function sandboxRuntimeConfigForBaseEnv(
  baseEnv: RuntimeEnvMap,
): SandboxRuntimeConfig | null {
  if (!isSandboxModeEnabled(baseEnv)) return null;
  const dataDir = baseEnv.OD_DATA_DIR?.trim();
  if (!dataDir) return null;
  const resolvedDataDir = resolveProjectRelativePath(
    dataDir,
    RUNTIME_MODULE_PROJECT_ROOT,
  );
  return resolveSandboxRuntimeConfig(true, resolvedDataDir);
}

function reapplySandboxRuntimeEnv(
  env: NodeJS.ProcessEnv,
  sandboxRuntime: SandboxRuntimeConfig | null,
): NodeJS.ProcessEnv {
  if (!sandboxRuntime) return env;
  return applySandboxRuntimeEnv(env, sandboxRuntime);
}

// Remove `secretKeys` from `env` unless `baseUrlKey` is set to a non-empty
// value — in which case the user is intentionally routing the CLI through
// a custom endpoint and the secret is the credential that authenticates
// against it. Comparison is case-insensitive so Windows env names with
// mixed casing (`Openai_Api_Key`) cannot slip past a literal `delete`.
function stripUnlessCustomBaseUrl(
  env: NodeJS.ProcessEnv,
  baseUrlKey: string,
  secretKeys: readonly string[],
): void {
  const baseUrlKeyUpper = baseUrlKey.toUpperCase();
  const hasCustomBaseUrl = Object.keys(env).some(
    (k) =>
      k.toUpperCase() === baseUrlKeyUpper &&
      typeof env[k] === 'string' &&
      env[k].trim() !== '',
  );
  if (hasCustomBaseUrl) return;
  const secretKeysUpper = new Set(secretKeys.map((k) => k.toUpperCase()));
  for (const key of Object.keys(env)) {
    if (secretKeysUpper.has(key.toUpperCase())) delete env[key];
  }
}

function stripKeysCaseInsensitive(
  env: NodeJS.ProcessEnv,
  keysToStrip: readonly string[],
): void {
  const keysUpper = new Set(keysToStrip.map((key) => key.toUpperCase()));
  for (const key of Object.keys(env)) {
    if (keysUpper.has(key.toUpperCase())) delete env[key];
  }
}

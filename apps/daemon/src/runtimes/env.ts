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
// Auth/config precedence for Local CLI launches:
//
// 1. Provider BYOK is separate. It is used by Open Design's direct provider
//    API calls and is not automatically mapped into Local CLI launches.
// 2. The inherited launch env represents the user's local CLI setup
//    (OAuth/login files, CLI homes, or user-owned API-key env). Preserve it
//    so Claude Code/Codex behave like they do in the user's terminal.
// 3. `configuredEnv` comes from Settings -> Local CLI ->
//    "Advanced: proxy & custom paths". It is an explicit low-level CLI env
//    override, so it wins over inherited env, including API-key variables.
//    BASE_URL is optional: when omitted, the underlying CLI uses its own
//    official default endpoint.
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
  _options: SpawnEnvOptions = {},
): NodeJS.ProcessEnv {
  const sandboxRuntime = sandboxRuntimeConfigForBaseEnv(baseEnv);
  const expandedConfiguredEnv = expandConfiguredEnv(configuredEnv);
  const env = mergeProxyAwareEnv(
    process.platform,
    systemProxyEnv,
    baseEnv,
    expandedConfiguredEnv,
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
    return reapplySandboxRuntimeEnv(env, sandboxRuntime);
  }
  if (agentId === 'codex') {
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

function stripKeysCaseInsensitive(
  env: NodeJS.ProcessEnv,
  keysToStrip: readonly string[],
): void {
  const keysUpper = new Set(keysToStrip.map((key) => key.toUpperCase()));
  for (const key of Object.keys(env)) {
    if (keysUpper.has(key.toUpperCase())) delete env[key];
  }
}

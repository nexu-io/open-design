import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mergeProxyAwareEnv, resolveSystemProxyEnv } from '@open-design/platform';
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

// Valid values for CODEBUDDY_INTERNET_ENVIRONMENT (closed enum per IAM docs).
// Must stay in sync with AGENT_CLI_ENV_ENUMS in app-config.ts.
const CODEBUDDY_INTERNET_ENV_ALLOWED = new Set(['internal', 'ioa']);

// CodeBuddy env keys that need case-insensitive canonicalization on Windows.
const CODEBUDDY_CANONICAL_KEYS = [
  'CODEBUDDY_API_KEY',
  'CODEBUDDY_BASE_URL',
  'CODEBUDDY_CONFIG_DIR',
  'CODEBUDDY_BIN',
  'CODEBUDDY_INTERNET_ENVIRONMENT',
] as const;

/** Typed error for invalid agent env/config — caught by detection.ts
 *  to surface a per-agent "unavailable" result without crashing other agents.
 *  Unexpected probe bugs (not env/config errors) should still fail fast. */
export class AgentEnvConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentEnvConfigError';
  }
}

// Remove case-insensitive aliases for a set of canonical env key names.
// On Windows, env key names are case-insensitive at the OS level but
// Node's process.env preserves original casing. A merged env can contain
// both an inherited alias and a configured canonical key. We must remove
// the alias and let the configured value (merged last by expandConfiguredEnv)
// win. If only a non-canonical alias exists, adopt its value into the
// canonical key.
function canonicalizeEnvKeys(
  env: NodeJS.ProcessEnv,
  canonicalKeys: readonly string[],
): void {
  for (const canonical of canonicalKeys) {
    const upper = canonical.toUpperCase();
    const aliases: string[] = [];
    for (const key of Object.keys(env)) {
      if (key.toUpperCase() === upper && key !== canonical) {
        aliases.push(key);
      }
    }
    for (const alias of aliases) {
      if (!(canonical in env) && typeof env[alias] === 'string') {
        env[canonical] = env[alias];
      }
      delete env[alias];
    }
  }
}

// Build the env passed to spawn() for a given agent adapter.
//
// The claude adapter strips ANTHROPIC_API_KEY so Claude Code's own auth
// resolution (claude login / Pro/Max plan) wins instead of silently
// falling back to API-key billing whenever the daemon happened to be
// launched from a shell that exported the key for SDK or scripting use.
// See issue #398.
//
// The codebuddy adapter does NOT strip CODEBUDDY_API_KEY. Unlike Claude Code,
// where /login OAuth is the primary auth path and API-key billing is a
// fallback, CodeBuddy's `-p` (non-interactive) mode always authenticates via
// CODEBUDDY_API_KEY per the CLI docs. Stripping it would break every headless
// CodeBuddy run. See https://www.codebuddy.cn/docs/cli/env-vars.
//
// However, when ANTHROPIC_BASE_URL is set the user is intentionally
// routing Claude Code to a custom endpoint (e.g. a Kimi/Moonshot proxy).
// In that case claude login is meaningless, so preserve the API key so
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
      stripUnlessCustomBaseUrl(env, 'ANTHROPIC_BASE_URL', ['ANTHROPIC_API_KEY']);
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
  // CodeBuddy's `-p` mode requires CODEBUDDY_API_KEY for authentication.
  // Do not strip it — the key is the primary auth path, not a fallback.
  // See https://www.codebuddy.cn/docs/cli/env-vars.
  //
  // CODEBUDDY_INTERNET_ENVIRONMENT is a closed enum (internal/ioa;
  // empty or unset = international/default). Per the CLI docs, only
  // `internal` and `ioa` are documented values; the international/default
  // path is represented by leaving the variable unset, not by setting it
  // to "public".
  //
  // When the user has not configured a value in Settings (fresh install,
  // no codebuddy section in agentCliEnv), we preserve any inherited value
  // from the parent process (e.g.
  //   CODEBUDDY_INTERNET_ENVIRONMENT=internal pnpm tools-dev
  // ) so that China/iOA installs launched with the env var on the command
  // line continue to work without requiring Settings configuration.
  //
  // When the user explicitly selects "International (default)" in Settings,
  // validateAgentCliEnv persists an empty string as an "unset" marker.
  // That marker reaches the merged env here and overrides any inherited
  // value; we delete the key so the child process uses the international
  // default (variable unset). This ensures users CAN switch away from an
  // inherited non-default value through the Settings UI.
  //
  // Inherited values outside the closed enum (e.g. a typo like
  // "internel") are treated as a hard error so the bad configuration is
  // surfaced immediately instead of silently sending traffic to the wrong
  // network region.
  // Canonicalize CODEBUDDY_INTERNET_ENVIRONMENT: on Windows, env key names
  // are case-insensitive at the OS level but Node's process.env preserves
  // the original casing. A merged env can contain both an inherited alias
  // like `Codebuddy_Internet_Environment=internel` and the configured
  // override `CODEBUDDY_INTERNET_ENVIRONMENT=internal`. We must:
  //   1. Remove all case-insensitive duplicates.
  //   2. Let the configured (expandConfiguredEnv) value win over inherited.
  //   3. Validate the single canonical key's value.
  // This mirrors the ANTHROPIC_API_KEY case-insensitive cleanup above.
  if (agentId === 'codebuddy') {
    // Canonicalize all CodeBuddy env keys to remove Windows case-insensitive
    // aliases, then validate the closed-enum INTERNET_ENVIRONMENT value.
    // On Windows, env key names are case-insensitive at the OS level but
    // Node's process.env preserves original casing — a merged env can
    // contain both Codebuddy_Api_Key and CODEBUDDY_API_KEY. On POSIX,
    // env names are case-sensitive: codebuddy_bin and CODEBUDDY_BIN are
    // unrelated variables, so canonicalization must not run there.
    if (process.platform === 'win32') {
      canonicalizeEnvKeys(env, CODEBUDDY_CANONICAL_KEYS);
    }

    const CANONICAL = 'CODEBUDDY_INTERNET_ENVIRONMENT';
    const value = env[CANONICAL];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        if (!CODEBUDDY_INTERNET_ENV_ALLOWED.has(trimmed)) {
          throw new AgentEnvConfigError(
            `[env] Invalid inherited CODEBUDDY_INTERNET_ENVIRONMENT="${value}".` +
            ` Valid values: ${[...CODEBUDDY_INTERNET_ENV_ALLOWED].join(', ')}.`,
          );
        }
        env[CANONICAL] = trimmed;
      } else {
        // Empty string = "International (default)" explicitly selected in
        // Settings. Delete the key so the child process uses the
        // international default (variable unset). This overrides any
        // inherited non-default value from the parent process.
        delete env[CANONICAL];
      }
    }
  }
  return reapplySandboxRuntimeEnv(env, sandboxRuntime);
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

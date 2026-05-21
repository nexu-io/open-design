import path from 'node:path';

import { mergeProxyAwareEnv, resolveSystemProxyEnv } from '@open-design/platform';
import { expandConfiguredEnv } from './paths.js';
import { resolveAmrOpenCodeExecutable } from './executables.js';
import { amrVelaProfileEnv } from '../integrations/vela-profile.js';

type RuntimeEnvMap = NodeJS.ProcessEnv | Record<string, string>;

// Valid values for CODEBUDDY_INTERNET_ENVIRONMENT (closed enum per IAM docs).
// Must stay in sync with AGENT_CLI_ENV_ENUMS in app-config.ts.
const CODEBUDDY_INTERNET_ENV_ALLOWED = new Set(['public', 'internal', 'ioa']);

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
): NodeJS.ProcessEnv {
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
    return env;
  }
  if (agentId === 'claude') {
    stripUnlessCustomBaseUrl(env, 'ANTHROPIC_BASE_URL', ['ANTHROPIC_API_KEY']);
    return env;
  }
  if (agentId === 'codex') {
    stripUnlessCustomBaseUrl(env, 'OPENAI_BASE_URL', [
      'OPENAI_API_KEY',
      'CODEX_API_KEY',
    ]);
    return env;
  }
  // CodeBuddy's `-p` mode requires CODEBUDDY_API_KEY for authentication.
  // Do not strip it — the key is the primary auth path, not a fallback.
  // See https://www.codebuddy.cn/docs/cli/env-vars.
  //
  // CODEBUDDY_INTERNET_ENVIRONMENT is a closed enum (public/internal/ioa;
  // empty or unset = international/public default). When the user selects
  // "Inherit / unset" in Settings, no configured value is persisted. In that
  // case we preserve any inherited value from the parent process (e.g.
  //   CODEBUDDY_INTERNET_ENVIRONMENT=internal pnpm tools-dev
  // ) so that China/iOA installs launched with the env var on the command
  // line continue to work. When the user explicitly selects a value in
  // Settings, expandConfiguredEnv will override the inherited value.
  //
  // However, inherited values outside the closed enum (e.g. a typo like
  // "internel") are treated as a hard error so the bad configuration is
  // surfaced immediately instead of silently sending traffic to the wrong
  // network region.
  if (agentId === 'codebuddy') {
    for (const key of Object.keys(env)) {
      if (key.toUpperCase() === 'CODEBUDDY_INTERNET_ENVIRONMENT') {
        const value = env[key];
        if (typeof value === 'string' && value.trim() && !CODEBUDDY_INTERNET_ENV_ALLOWED.has(value.trim())) {
          throw new Error(
            `[env] Invalid inherited CODEBUDDY_INTERNET_ENVIRONMENT="${value}".` +
            ` Valid values: ${[...CODEBUDDY_INTERNET_ENV_ALLOWED].join(', ')}.`,
          );
        }
      }
    }
  }
  return env;
  return env;
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

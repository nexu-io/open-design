import { expandConfiguredEnv } from './paths.js';

type RuntimeEnvMap = NodeJS.ProcessEnv | Record<string, string>;

// Build the env passed to spawn() for a given agent adapter.
//
// The claude adapter strips ANTHROPIC_API_KEY so Claude Code's own auth
// resolution (claude login / Pro/Max plan) wins instead of silently
// falling back to API-key billing whenever the daemon happened to be
// launched from a shell that exported the key for SDK or scripting use.
// See issue #398.
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
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    ...expandConfiguredEnv(configuredEnv),
  };
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

/**
 * Sanitize the environment before spawning a child agent CLI.
 *
 * When the daemon itself is launched from inside an agent terminal (for
 * example the user ran `pnpm tools-dev` from within an `opencode` session),
 * that host agent injects runtime variables like `OPENCODE_CLIENT`,
 * `OPENCODE_SERVER_USERNAME`, `OPENCODE_SERVER_PASSWORD`, `OPENCODE_RUN_ID`,
 * `OPENCODE_PID` etc. into our `process.env`. If we then `spawn('opencode
 * run …')` from the daemon with `{ ...process.env }`, the freshly-spawned
 * CLI inherits those variables and tries to attach to the host session /
 * server, which does not exist for it — producing errors like
 * "Session not found" and an immediate exit.
 *
 * The same class of poisoning applies to other agent CLIs that ship with
 * their own runtime variables. We keep this list conservative: we only
 * strip variables whose prefixes are unambiguously owned by an agent
 * runtime and which have no legitimate reason to cross process
 * boundaries. API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, …) and
 * shell/system variables are never stripped.
 */

/**
 * Prefixes of env variable names that identify "host agent runtime" state.
 * Anything matching one of these (case-insensitive) is dropped before we
 * spawn a child agent. Keep this list tight — only add a prefix when we
 * have evidence that leaving it in breaks a concrete CLI.
 */
const HOST_AGENT_ENV_PREFIXES: readonly string[] = [
  'OPENCODE_',
  'CLAUDE_CODE_',
  'CODEX_',
  'GEMINI_CLI_',
  'CURSOR_AGENT_',
];

/**
 * Exact env variable names that identify "host agent runtime" state but do
 * not match any of the prefix rules above. `OPENCODE=1` (without an
 * underscore suffix) is set by the opencode CLI in its own child processes
 * to mark "you are running inside opencode".
 */
const HOST_AGENT_ENV_EXACT: ReadonlySet<string> = new Set([
  'OPENCODE',
]);

export interface SanitizeAgentEnvOptions {
  /**
   * Extra variable names (exact match, case-insensitive) to drop on top of
   * the default deny-list. Useful for tests or for future expansion.
   */
  extraDenyExact?: readonly string[];
  /**
   * Extra prefixes to drop on top of the default deny-list.
   */
  extraDenyPrefixes?: readonly string[];
}

export function sanitizeAgentEnv(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
  options: SanitizeAgentEnvOptions = {},
): Record<string, string> {
  const denyPrefixes = [
    ...HOST_AGENT_ENV_PREFIXES,
    ...(options.extraDenyPrefixes ?? []),
  ].map((p) => p.toUpperCase());

  const denyExact = new Set<string>([
    ...HOST_AGENT_ENV_EXACT,
    ...(options.extraDenyExact ?? []),
  ].map((name) => name.toUpperCase()));

  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    if (rawValue === undefined) continue;
    const key = rawKey.toUpperCase();
    if (denyExact.has(key)) continue;
    if (denyPrefixes.some((prefix) => key.startsWith(prefix))) continue;
    out[rawKey] = String(rawValue);
  }
  return out;
}

/**
 * Names of variables that the default ruleset strips. Exposed for tests
 * and for diagnostics routes that want to show the user what got removed.
 */
export function listStrippedAgentEnvKeys(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
): string[] {
  const stripped: string[] = [];
  for (const rawKey of Object.keys(input)) {
    const key = rawKey.toUpperCase();
    if (HOST_AGENT_ENV_EXACT.has(key)) {
      stripped.push(rawKey);
      continue;
    }
    if (HOST_AGENT_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      stripped.push(rawKey);
    }
  }
  return stripped;
}

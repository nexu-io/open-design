import { agentCapabilities } from './capabilities.js';
import type { RuntimeAgentDef, RuntimeEnv } from './types.js';

export const OPENCODE_SKIP_PERMISSIONS_FLAG = '--dangerously-skip-permissions';
export const OPENCODE_AUTO_APPROVE_FLAG = '--auto';
export const OPENCODE_WORKSPACE_DIR_FLAG = '--dir';
export const OPENCODE_PURE_FLAG = '--pure';
export const OPENCODE_VARIANT_FLAG = '--variant';
export const OPENCODE_STANDALONE_FLAG = '--standalone';

/**
 * Flags whose presence in `opencode run --help` differs between the 1.x and
 * 2.x command lines. The probe is a substring scan, so a 1.x build records the
 * removed flags as `true` and a 2.x build as `false`; a failed probe leaves
 * the map empty, which every helper below reads as "not answered yet".
 */
export const OPENCODE_PERMISSION_CAPABILITY = {
  helpArgs: ['run', '--help'],
  capabilityFlags: {
    [OPENCODE_SKIP_PERMISSIONS_FLAG]: 'skipPermissions',
    [OPENCODE_AUTO_APPROVE_FLAG]: 'autoApprove',
    [OPENCODE_WORKSPACE_DIR_FLAG]: 'workspaceDir',
    [OPENCODE_PURE_FLAG]: 'pure',
    [OPENCODE_VARIANT_FLAG]: 'variant',
    [OPENCODE_STANDALONE_FLAG]: 'standalone',
  },
} satisfies Pick<RuntimeAgentDef, 'helpArgs' | 'capabilityFlags'>;

/**
 * Which OpenCode command line the installed binary speaks.
 *
 * OpenCode 2.0 removed `--dir`, `--pure`, `--variant` and
 * `--dangerously-skip-permissions` from `opencode run` (each fails the spawn
 * with "Unrecognized flag"), added `--auto` and `--standalone`, folded the
 * variant into `-m provider/model#variant`, dropped `--verbose` from `models`,
 * and moved `export` under `session export`. The `run --help` probe is the one
 * signal the daemon has: `--dir` is present on every 1.x build and absent on
 * every 2.x build, so that single flag decides the generation.
 *
 * `'unknown'` (no probe yet, or the probe failed) keeps the historical 1.x
 * argv: a 1.x build without `--dir` would silently adopt the enclosing git
 * root as its workspace, and failing loudly at spawn is the better outcome.
 * Every launch path warms the probe first, so this only covers a CLI whose
 * `--help` could not be read at all.
 */
export type OpenCodeCliGeneration = 'v1' | 'v2' | 'unknown';

export function resolveOpenCodeCliGeneration(agentId: string): OpenCodeCliGeneration {
  const workspaceDir = agentCapabilities.get(agentId)?.workspaceDir;
  if (workspaceDir === false) return 'v2';
  if (workspaceDir === true) return 'v1';
  return 'unknown';
}

/**
 * Non-interactive permission posture. 1.x advertises
 * `--dangerously-skip-permissions`; 2.x replaced it with `--auto`
 * ("auto-approve permissions that are not explicitly denied"). `--auto` is
 * only sent on a 2.x build: the probe is a substring scan, so the 1.x argv
 * must not grow a flag just because that text appears in 1.x help. Builds
 * that advertise neither run with their configured permission policy.
 */
export function appendOpenCodePermissionBypass(args: string[], agentId: string): void {
  const caps = agentCapabilities.get(agentId);
  if (caps?.skipPermissions) {
    args.push(OPENCODE_SKIP_PERMISSIONS_FLAG);
  } else if (caps?.autoApprove && resolveOpenCodeCliGeneration(agentId) === 'v2') {
    args.push(OPENCODE_AUTO_APPROVE_FLAG);
  }
}

/**
 * Pin OpenCode's workspace to the resolved project directory.
 *
 * OpenCode 1.x does not treat its process cwd as the project: it walks up to
 * the nearest enclosing git root and adopts THAT as the worktree. A managed
 * project directory is not a git repository, and a development install keeps
 * the daemon data directory under the repository root — so OpenCode walks past
 * the project and adopts the whole Open Design checkout. The consequences are
 * all silent: the agent writes the deliverable at the repository root, the
 * project directory stays empty, `snapshotProjectArtifactsAsync(cwd)` sees
 * nothing, and the Run reports `no_artifact`. `--dir <cwd>` is the 1.x fix.
 *
 * OpenCode 2.x removed the flag and records the process cwd as the session
 * directory (verified on 2.0.29: `session list` reports the spawn cwd even
 * when `PWD` points elsewhere). The spawn cwd is already the project
 * directory, and `withOpenCodeWorkspaceEnv` pins `PWD` to it as well for the
 * 2.0.x builds that consulted `PWD` first.
 *
 * An unprobed build keeps sending `--dir`: a 1.x CLI without it loses files
 * silently, whereas a 2.x CLI with it fails loudly at spawn.
 */
export function appendOpenCodeWorkspaceDir(
  args: string[],
  cwd: string | null | undefined,
  agentId: string,
): void {
  if (typeof cwd !== 'string' || cwd.length === 0) return;
  if (resolveOpenCodeCliGeneration(agentId) === 'v2') return;
  args.push(OPENCODE_WORKSPACE_DIR_FLAG, cwd);
}

/**
 * Run OpenCode 2.x against a private in-process server.
 *
 * By default a 2.x `run` sends the message to a background service that was
 * started from whichever shell first used OpenCode, with that shell's
 * environment. Everything the daemon decides per launch — the
 * `OPENCODE_CONFIG_CONTENT` MCP overlay, sandbox-mode `XDG_DATA_HOME`,
 * `OPENCODE_DISABLE_PROJECT_CONFIG`, the stripped nested-session variables —
 * only reaches a server that the spawned process itself starts. `--standalone`
 * restores the 1.x process-local semantics at the cost of a server start per
 * run.
 */
export function appendOpenCodeStandalone(args: string[], agentId: string): void {
  if (resolveOpenCodeCliGeneration(agentId) !== 'v2') return;
  if (!agentCapabilities.get(agentId)?.standalone) return;
  args.push(OPENCODE_STANDALONE_FLAG);
}

/**
 * Whether `opencode run` / `opencode export` accept `--pure` (1.x only).
 * Unprobed builds keep the 1.x answer.
 */
export function shouldUseOpenCodePureFlag(agentId: string): boolean {
  return resolveOpenCodeCliGeneration(agentId) !== 'v2';
}

/**
 * Model selection argv. 1.x takes a separate `--variant <name>`; 2.x folds the
 * variant into the model id as `provider/model#variant`. The caller has already
 * checked that the variant is advertised for this model.
 */
export function openCodeModelArgs(
  model: string,
  variant: string | null | undefined,
  agentId: string,
): string[] {
  if (!variant) return ['-m', model];
  if (resolveOpenCodeCliGeneration(agentId) === 'v2') return ['-m', `${model}#${variant}`];
  return ['-m', model, OPENCODE_VARIANT_FLAG, variant];
}

/**
 * Return the launch environment with `PWD` pinned to the project directory for
 * a 2.x launch.
 *
 * Node `spawn({ cwd })` changes the child's working directory but leaves the
 * inherited `PWD` alone, and early 2.0.x builds resolved the workspace as
 * `PWD ?? process.cwd()` — so a daemon started from the repository root sent
 * every run to the checkout instead of the project. 2.0.29 ignores `PWD`
 * (verified), which makes this a no-op there. Callers must pass the same path
 * they hand to `spawn({ cwd })`; the value is not realpath'd, so it may differ
 * textually from `process.cwd()` through a symlink, which is how a shell sets
 * `PWD` too. 1.x and unprobed builds receive the environment unchanged because
 * they carry `--dir`.
 */
export function withOpenCodeWorkspaceEnv<T extends RuntimeEnv>(
  env: T,
  cwd: string | null | undefined,
  agentId: string,
): T {
  if (typeof cwd !== 'string' || cwd.length === 0) return env;
  if (resolveOpenCodeCliGeneration(agentId) !== 'v2') return env;
  return { ...env, PWD: cwd };
}

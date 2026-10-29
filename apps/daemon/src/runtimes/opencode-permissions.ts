import { agentCapabilities } from './capabilities.js';
import type { RuntimeAgentDef } from './types.js';

export const OPENCODE_SKIP_PERMISSIONS_FLAG = '--dangerously-skip-permissions';
export const OPENCODE_WORKSPACE_DIR_FLAG = '--dir';
export const OPENCODE_PURE_FLAG = '--pure';

export const OPENCODE_PERMISSION_CAPABILITY = {
  helpArgs: ['run', '--help'],
  capabilityFlags: {
    [OPENCODE_SKIP_PERMISSIONS_FLAG]: 'skipPermissions',
    [OPENCODE_WORKSPACE_DIR_FLAG]: 'workspaceDir',
    [OPENCODE_PURE_FLAG]: 'pure',
    ['--variant']: 'variant',
  },
} satisfies Pick<RuntimeAgentDef, 'helpArgs' | 'capabilityFlags'>;

export function appendOpenCodePermissionBypass(args: string[], agentId: string): void {
  if (agentCapabilities.get(agentId)?.skipPermissions) {
    args.push(OPENCODE_SKIP_PERMISSIONS_FLAG);
  }
}

function openCodeFlagAllowed(agentId: string, key: string): boolean {
  const caps = agentCapabilities.get(agentId);
  // Historical OpenCode v1 behavior is the default while the `--help` probe
  // has not warmed the map yet. Warmed entries gate strictly: OpenCode v2
  // dropped `--dir` and `--pure` from `run`, so sending them fails the spawn
  // loudly instead of running the agent.
  if (!caps) return true;
  return caps[key] !== false;
}

/**
 * Whether this OpenCode build may receive `--pure` (run/export without
 * executing user-installed plugins). Advertised by OpenCode v1 `run --help`;
 * absent from OpenCode v2, where the flag is rejected.
 */
export function supportsOpenCodePure(agentId: string): boolean {
  return openCodeFlagAllowed(agentId, 'pure');
}

/**
 * Pin OpenCode's workspace to the resolved project directory.
 *
 * OpenCode v1 does not treat its process cwd as the project: it walks up to
 * the nearest enclosing git root and adopts THAT as the worktree (verified with
 * `opencode debug scrap`, whose every registered project is a git root). A
 * managed project directory is not a git repository, and a development install
 * keeps the daemon data directory under the repository root — so OpenCode walks
 * past the project and adopts the whole Open Design checkout.
 *
 * The consequences are all silent: the agent names the repository root as its
 * workspace and writes the deliverable there, the project directory stays
 * empty, `snapshotProjectArtifactsAsync(cwd)` sees nothing, and the Run reports
 * `no_artifact`. `permission.external_directory` cannot catch it either — once
 * the repository is the worktree, writing inside it is an in-project write.
 *
 * OpenCode v2 removed `--dir` from `run` and uses the spawn cwd as the
 * project instead (the daemon already spawns every agent CLI with the project
 * directory as its process cwd — see `spawnAgentProcess`). The flag is
 * therefore sent only when the `--help` capability probe advertised it, so a
 * v2 build runs with a bare cwd instead of failing loudly at spawn.
 */
export function appendOpenCodeWorkspaceDir(
  args: string[],
  agentId: string,
  cwd: string | null | undefined,
): void {
  if (typeof cwd !== 'string' || cwd.length === 0) return;
  if (!openCodeFlagAllowed(agentId, 'workspaceDir')) return;
  args.push(OPENCODE_WORKSPACE_DIR_FLAG, cwd);
}

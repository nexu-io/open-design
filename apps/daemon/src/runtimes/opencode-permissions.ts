import { agentCapabilities } from './capabilities.js';
import type { RuntimeAgentDef } from './types.js';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';

export const OPENCODE_SKIP_PERMISSIONS_FLAG = '--dangerously-skip-permissions';
export const OPENCODE_WORKSPACE_DIR_FLAG = '--dir';

export const OPENCODE_PERMISSION_CAPABILITY = {
  helpArgs: ['run', '--help'],
  capabilityFlags: {
    [OPENCODE_SKIP_PERMISSIONS_FLAG]: 'skipPermissions',
    '--auto': 'autoPermissions',
    '--standalone': 'standalone',
    [OPENCODE_WORKSPACE_DIR_FLAG]: 'workspaceDir',
  },
} satisfies Pick<RuntimeAgentDef, 'helpArgs' | 'capabilityFlags'>;

export function appendOpenCodePermissionBypass(args: string[], agentId: string): void {
  const capabilities = agentCapabilities.get(agentId);
  if (capabilities?.autoPermissions) {
    // OpenCode V2 auto-approves all permissions except explicit denies.
    args.push('--auto');
  } else if (capabilities?.skipPermissions) {
    args.push(OPENCODE_SKIP_PERMISSIONS_FLAG);
  }
  if (capabilities?.standalone) args.push('--standalone');
}

/**
 * Pin OpenCode's workspace to the resolved project directory.
 *
 * OpenCode does not treat its process cwd as the project: it walks up to the
 * nearest enclosing git root and adopts THAT as the worktree (verified with
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
 * Pass the directory flag only when the installed CLI advertises it. On
 * versions without that flag, process cwd remains the project boundary; refuse
 * to launch when that cwd is nested in a different git root rather than
 * silently widening OpenCode's workspace.
 */
export function appendOpenCodeWorkspaceDir(
  args: string[],
  cwd: string | null | undefined,
  agentId = 'opencode',
): void {
  if (typeof cwd !== 'string' || cwd.length === 0) return;
  const capabilities = agentCapabilities.get(agentId);
  if (capabilities?.workspaceDir) {
    args.push(OPENCODE_WORKSPACE_DIR_FLAG, cwd);
    return;
  }
  assertOpenCodeCwdIsolated(cwd);
}

export function assertOpenCodeCwdIsolated(cwd: string): void {
  let current: string;
  try {
    current = realpathSync(resolve(cwd));
  } catch {
    current = resolve(cwd);
  }
  const root = parse(current).root;
  for (let parent = dirname(current); parent !== current; parent = dirname(parent)) {
    if (existsSync(join(parent, '.git'))) {
      throw new Error(
        `OpenCode cannot safely use project directory ${cwd}: this CLI does not advertise --dir and the directory is nested inside git workspace ${parent}. Choose a project directory outside that workspace or use another agent.`,
      );
    }
    if (parent === root) break;
  }
}

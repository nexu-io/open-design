import { agentCapabilities } from './capabilities.js';
import type { RuntimeAgentDef } from './types.js';

export const OPENCODE_SKIP_PERMISSIONS_FLAG = '--dangerously-skip-permissions';
export const OPENCODE_AUTO_APPROVE_FLAG = '--auto';
export const OPENCODE_WORKSPACE_DIR_FLAG = '--dir';
export const OPENCODE_VARIANT_FLAG = '--variant';
export const OPENCODE_PURE_FLAG = '--pure';

export const OPENCODE_PERMISSION_CAPABILITY = {
  helpArgs: ['run', '--help'],
  capabilityFlags: {
    [OPENCODE_SKIP_PERMISSIONS_FLAG]: 'skipPermissions',
    [OPENCODE_AUTO_APPROVE_FLAG]: 'autoApprove',
    [OPENCODE_WORKSPACE_DIR_FLAG]: 'workspaceDir',
    [OPENCODE_VARIANT_FLAG]: 'variantFlag',
    [OPENCODE_PURE_FLAG]: 'pureMode',
  },
} satisfies Pick<RuntimeAgentDef, 'helpArgs' | 'capabilityFlags'>;

export function appendOpenCodePermissionBypass(args: string[], agentId: string): void {
  const caps = agentCapabilities.get(agentId) ?? {};
  if (caps.skipPermissions) {
    args.push(OPENCODE_SKIP_PERMISSIONS_FLAG);
  } else if (caps.autoApprove) {
    // OpenCode 2.x removed the hidden `--dangerously-skip-permissions` from
    // `run --help` and documents `--auto` (auto-approve permissions that are
    // not explicitly denied) as the non-interactive posture instead.
    args.push(OPENCODE_AUTO_APPROVE_FLAG);
  }
}

/**
 * Pin OpenCode's workspace to the resolved project directory.
 *
 * OpenCode 1.x does not treat its process cwd as the project: it walks up to
 * the nearest enclosing git root and adopts THAT as the worktree (verified
 * with `opencode debug scrap`, whose every registered project is a git root).
 * A managed project directory is not a git repository, and a development
 * install keeps the daemon data directory under the repository root — so
 * OpenCode walks past the project and adopts the whole Open Design checkout.
 *
 * The consequences are all silent: the agent names the repository root as its
 * workspace and writes the deliverable there, the project directory stays
 * empty, `snapshotProjectArtifactsAsync(cwd)` sees nothing, and the Run
 * reports `no_artifact`. `permission.external_directory` cannot catch it
 * either — once the repository is the worktree, writing inside it is an
 * in-project write.
 *
 * OpenCode 2.x removed `--dir` from `opencode run --help` (verified on
 * 2.0.24). There the spawn cwd (`effectiveCwd` in server.ts) already pins the
 * workspace, so sending the flag would only fail loudly with
 * `Unrecognized flag: --dir`. Gate on the `--help` probe: omit only when the
 * probe explicitly says the flag is missing (`false`); send otherwise so a
 * 1.x build without the flag still fails loudly instead of silently losing
 * files. When the probe already identified a 2.x CLI via `--auto` but has not
 * yet recorded `workspaceDir`, omit as well to avoid one loud failure.
 */
export function appendOpenCodeWorkspaceDir(
  args: string[],
  cwd: string | null | undefined,
  agentId?: string,
): void {
  if (typeof cwd !== 'string' || cwd.length === 0) return;
  if (typeof agentId === 'string' && agentId.length > 0) {
    const caps = agentCapabilities.get(agentId) ?? {};
    if (caps.workspaceDir === false) return;
    if (caps.workspaceDir === undefined && caps.autoApprove === true) return;
  }
  args.push(OPENCODE_WORKSPACE_DIR_FLAG, cwd);
}

/**
 * Whether `opencode run` accepts a separate `--variant <name>` flag (1.x).
 * OpenCode 2.x folded the variant into `-m provider/model#variant` (see
 * `opencode run --help` on 2.0.24) and rejects `--variant` with
 * `Unrecognized flag`. Pre-probe defaults to the 1.x shape to preserve the
 * existing behavior; once `--auto` identifies a 2.x CLI, prefer `#variant`.
 */
export function shouldUseOpenCodeVariantFlag(agentId: string): boolean {
  const caps = agentCapabilities.get(agentId) ?? {};
  if (caps.variantFlag === undefined && caps.autoApprove === true) return false;
  return caps.variantFlag !== false;
}

/**
 * Whether `opencode run` / `opencode export` accept `--pure` (1.x).
 * Removed in 2.x (`opencode run --help` and `opencode session export --help`
 * on 2.0.24 list no such flag). Same gating as the workspace dir: omit only
 * on explicit `false` or when `--auto` already identified 2.x.
 */
export function shouldUseOpenCodePureFlag(agentId: string): boolean {
  const caps = agentCapabilities.get(agentId) ?? {};
  if (caps.pureMode === undefined && caps.autoApprove === true) return false;
  return caps.pureMode !== false;
}

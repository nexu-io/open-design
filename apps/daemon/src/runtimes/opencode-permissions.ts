import path from 'node:path';
import { agentCapabilities } from './capabilities.js';
import type { RuntimeAgentDef, RuntimeCapabilityMap } from './types.js';

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
 * 2.0.24). However, OpenCode 2.x resolves its workspace via
 * `options.root ?? process.env.PWD ?? process.cwd()`. Node's `spawn({ cwd })`
 * sets the OS process working directory but does NOT update `process.env.PWD`,
 * so an inherited `PWD` pointing to the daemon repository root would still
 * cause OpenCode to adopt the repository instead of the project directory.
 *
 * For OpenCode 2.x, `--dir` is omitted and `env.PWD` is set via
 * `applyOpenCodeWorkspaceEnv`. Gate `--dir` on the `--help` probe: omit only
 * when the probe explicitly says the flag is missing (`false`) or when `--auto`
 * identifies 2.x; send otherwise so a 1.x build without the flag still fails
 * loudly instead of silently losing files.
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
 * Pin OpenCode 2.x's workspace via `env.PWD`.
 *
 * OpenCode 2.x non-interactive `run` resolves its workspace through
 * `process.env.PWD ?? process.cwd()`. Node `child_process.spawn({ cwd })` does
 * not assign `process.env.PWD`. When `workspaceDir === false` (or `--auto`
 * identifies a 2.x CLI) and `cwd` is non-empty, sets `env.PWD` to the resolved
 * absolute project directory. Leaves `PWD` untouched when `--dir` is still
 * supported or the capability map is unwarmed, preserving 1.x behavior.
 */
export function applyOpenCodeWorkspaceEnv(
  env: NodeJS.ProcessEnv,
  cwd: string | null | undefined,
  agentId: string = 'opencode',
): NodeJS.ProcessEnv {
  if (typeof cwd !== 'string' || cwd.length === 0) return env;
  const caps = agentCapabilities.get(agentId);
  if (caps?.workspaceDir === false || (caps?.workspaceDir === undefined && caps?.autoApprove === true)) {
    env.PWD = path.resolve(cwd);
  }
  return env;
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
 * Whether a resolved `run --help` capability map describes OpenCode 2.x.
 *
 * The line is identified by advertised flags, never by version string or by
 * the error text of a rejected probe: 2.x advertises `--auto` and dropped
 * `--variant`, 1.x is the other way round. Anything unresolved stays on the
 * 1.x assumption, which is the conservative direction.
 */
export function isOpenCode2xCapabilities(
  caps: RuntimeCapabilityMap | null | undefined,
): boolean {
  if (!caps) return false;
  if (caps.autoApprove !== true) return false;
  return caps.variantFlag !== true;
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

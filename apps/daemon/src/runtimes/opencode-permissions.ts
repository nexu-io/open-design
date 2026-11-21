import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { agentCapabilities } from './capabilities.js';
import { execAgentFile } from './invocation.js';
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

export interface OpenCodeEditBaseResolution {
  /** Every worktree OpenCode may resolve edits against; deny rules cover all. */
  dirs: string[];
  /** How `git rev-parse` answered. A failure no longer withholds the grant. */
  gitProbe: 'resolved' | 'not_git' | 'failed';
  gitProbeError?: string;
}

/**
 * The worktrees OpenCode may check relative edit paths against.
 *
 * OpenCode adopts the enclosing Git worktree, or the volume root outside Git.
 * Resource rules only add `deny` entries, so covering every candidate base
 * can never widen write access. Candidates come from the filesystem (the
 * nearest ancestor holding `.git`, and the volume root) plus Git's own answer
 * when it gives one. A failed or slow `git rev-parse` therefore no longer
 * withholds the task-profile grant: on a Windows package it was killed by its
 * 2 s timeout, the run could not read its profile, and it ended without the
 * requested change (OPEND-4366 W03). Only an ancestor whose `.git` cannot be
 * checked leaves the base unconfirmed; that still throws, and the caller
 * withholds the grant.
 */
export async function resolveOpenCodeEditBaseDirs(cwd: string): Promise<OpenCodeEditBaseResolution> {
  const start = path.resolve(cwd);
  const real = await realpath(start).catch(() => start);
  const dirs = new Set<string>([path.parse(start).root, path.parse(real).root]);
  for (const from of new Set([start, real])) {
    const found = await nearestGitAncestor(from);
    if (found) dirs.add(found);
  }
  try {
    const { stdout } = await execAgentFile('git', ['rev-parse', '--show-toplevel'], {
      cwd, timeout: 2_000, env: { ...process.env, LC_ALL: 'C' },
    });
    const root = String(stdout).trim();
    if (!path.isAbsolute(root)) throw new Error('Git did not return an absolute OpenCode edit base.');
    dirs.add(path.resolve(root));
    return { dirs: [...dirs], gitProbe: 'resolved' };
  } catch (error) {
    const failure = error as { stderr?: unknown; message?: unknown };
    if (String(failure.stderr ?? '').includes('not a git repository')) {
      return { dirs: [...dirs], gitProbe: 'not_git' };
    }
    return {
      dirs: [...dirs],
      gitProbe: 'failed',
      gitProbeError: String(failure.message ?? error).split('\n')[0] ?? '',
    };
  }
}

async function nearestGitAncestor(from: string): Promise<string | null> {
  let dir = from;
  for (;;) {
    try {
      await lstat(path.join(dir, '.git'));
      return dir;
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      // Anything but "absent" means this level is unknown, and an unknown
      // worktree must not produce a grant with edit rules for the wrong root.
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
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
 * System temporary directories a headless OpenCode run may use.
 *
 * Agents write scratch files to temp paths on their own: thumbnails, ffmpeg
 * frames, browser probe scripts, usually as literal `/tmp/...` paths rather
 * than through `$TMPDIR`. Without an `external_directory` grant a headless
 * OpenCode run auto-rejects the follow-up read with "The user rejected
 * permission", and the model then ends the turn with no output.
 *
 * Codex's workspace-write sandbox makes `/tmp` and `$TMPDIR` writable by
 * default for the same reason. The caller's allowlist builder adds realpath
 * variants, so macOS `/private/tmp` and `/private/var/folders/...` follow.
 */
export function openCodeSystemTempDirectories(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (platform === 'win32') {
    const value = (key: string) => env[
      Object.keys(env).find((name) => name.toLowerCase() === key.toLowerCase()) ?? key
    ];
    const root = value('TEMP') || value('TMP') || `${value('SystemRoot') || value('windir')}\\temp`;
    return [root.length > 1 && root.endsWith('\\') && root.at(-2) !== ':' ? root.slice(0, -1) : root];
  }
  const root = env.TMPDIR || env.TMP || env.TEMP || '/tmp';
  return Array.from(new Set([root.length > 1 && root.endsWith('/') ? root.slice(0, -1) : root, '/tmp']));
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
export type OpenCodeCliLine = '1x' | '2x' | 'unknown';

/**
 * Classify an OpenCode executable into its 1.x or 2.x line from capabilities.
 *
 * The line is identified by advertised flags, never by version string or by
 * the error text of a rejected probe: 2.x advertises `--auto` and dropped
 * `--variant`; 1.x still advertises `--variant` (1.18.x also advertises
 * `--auto`). The rejection wording differs between 2.0.24 (help on stdout,
 * exit 1, no message) and 2.0.32 (`Unrecognized flag: ...`). A map that
 * advertises neither is `unknown`, not 1.x: callers that choose an invocation
 * shape must keep a tolerant fallback rather than silently assuming the
 * legacy line.
 */
export function classifyOpenCodeCliLine(
  caps: RuntimeCapabilityMap | null | undefined,
): OpenCodeCliLine {
  if (!caps) return 'unknown';
  if (caps.autoApprove === true && caps.variantFlag !== true) return '2x';
  if (caps.variantFlag === true) return '1x';
  return 'unknown';
}

/**
 * Whether a resolved `run --help` capability map describes OpenCode 2.x.
 *
 * Kept as the boolean shorthand for argv builders that only need to choose
 * between the 2.x and legacy flag shapes. Anything unresolved stays on the
 * 1.x assumption, which is the conservative direction: the 1.x shapes fail
 * loudly, while a wrong 2.x assumption would silently drop a flag. Callers
 * that must distinguish "confirmed 1.x" from "probe failed" use
 * `classifyOpenCodeCliLine` instead.
 */
export function isOpenCode2xCapabilities(
  caps: RuntimeCapabilityMap | null | undefined,
): boolean {
  return classifyOpenCodeCliLine(caps) === '2x';
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

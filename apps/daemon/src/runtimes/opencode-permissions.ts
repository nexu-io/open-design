import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { agentCapabilities } from './capabilities.js';
import { execAgentFile } from './invocation.js';
import type { RuntimeAgentDef, RuntimeCapabilityMap } from './types.js';

export const OPENCODE_SKIP_PERMISSIONS_FLAG = '--dangerously-skip-permissions';
export const OPENCODE_AUTO_APPROVE_FLAG = '--auto';
export const OPENCODE_WORKSPACE_DIR_FLAG = '--dir';
export const OPENCODE_PURE_FLAG = '--pure';
export const OPENCODE_VARIANT_FLAG = '--variant';
export const OPENCODE_STANDALONE_FLAG = '--standalone';

/**
 * Every `opencode run` flag this adapter may emit, probed from one `--help`
 * scan. OpenCode 2 removed `--dir`, `--pure`, `--variant`, and
 * `--dangerously-skip-permissions`, and added `--auto` and `--standalone`;
 * the flags this build emits therefore depend on the installed CLI, not on a
 * version comparison. `probeCapabilities` already scans stdout and stderr and
 * returns `{}` when the probe fails, so a missing key means "not probed"
 * rather than "unsupported".
 */
export const OPENCODE_PERMISSION_CAPABILITY = {
  helpArgs: ['run', '--help'],
  capabilityFlags: {
    [OPENCODE_SKIP_PERMISSIONS_FLAG]: 'skipPermissions',
    [OPENCODE_AUTO_APPROVE_FLAG]: 'autoApprove',
    [OPENCODE_WORKSPACE_DIR_FLAG]: 'workspaceDir',
    [OPENCODE_PURE_FLAG]: 'pure',
    [OPENCODE_VARIANT_FLAG]: 'variantFlag',
    [OPENCODE_STANDALONE_FLAG]: 'standalone',
  },
} satisfies Pick<RuntimeAgentDef, 'helpArgs' | 'capabilityFlags'>;

/**
 * Whether the probed surface is OpenCode 2's.
 *
 * Two independent signals, both required: `--standalone` exists only on the V2
 * client, and `--pure` exists only on V1's `run`. A build that has one but not
 * the other is treated as V1 on purpose — that direction appends `--dir`, which
 * fails loudly on a V2 CLI instead of reverting to the silent workspace bug
 * described in `appendOpenCodeWorkspaceDir`.
 */
export function isOpenCodeV2Surface(
  capabilities: RuntimeCapabilityMap | undefined,
): boolean {
  if (!capabilities) return false;
  return capabilities.standalone === true && capabilities.pure === false;
}

export function isOpenCodeV2Agent(agentId: string): boolean {
  return isOpenCodeV2Surface(agentCapabilities.get(agentId));
}

export function appendOpenCodePermissionBypass(args: string[], agentId: string): void {
  const capabilities = agentCapabilities.get(agentId);
  if (capabilities?.skipPermissions) {
    args.push(OPENCODE_SKIP_PERMISSIONS_FLAG);
    return;
  }
  // V2 renamed the bypass. It is not merely a rename: V2's `--auto` approves
  // permissions that were not explicitly denied, which is the closest
  // equivalent to V1's skip-all flag.
  if (isOpenCodeV2Surface(capabilities) && capabilities?.autoApprove) {
    args.push(OPENCODE_AUTO_APPROVE_FLAG);
  }
}

/**
 * `--pure` isolates a probe from user-installed plugins. Only a surface proven
 * to be V2 skips it: V1 keeps the flag even when its `--help` omits it, because
 * the workspace/isolation behaviour is a property of the generation rather than
 * of the help text.
 */
export function appendOpenCodePure(args: string[], agentId: string): void {
  const capabilities = agentCapabilities.get(agentId);
  if (isOpenCodeV2Surface(capabilities)) return;
  if (!args.includes(OPENCODE_PURE_FLAG)) args.push(OPENCODE_PURE_FLAG);
}

/**
 * Run OpenCode on a private server instead of the user's shared background
 * service. The shared service is account-wide: without this flag a headless
 * Run attaches to whatever server the user's interactive TUI happens to own,
 * mixing runtime state and lifecycle between the two.
 */
export function appendOpenCodeStandalone(args: string[], agentId: string): void {
  const capabilities = agentCapabilities.get(agentId);
  if (isOpenCodeV2Surface(capabilities)) args.push(OPENCODE_STANDALONE_FLAG);
}

export function openCodeSupportsVariantFlag(agentId: string): boolean {
  return !isOpenCodeV2Agent(agentId);
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
 * Sent unconditionally on V1, matching the BYOK OpenCode definition that
 * already carried this workaround. Gating it on the `--help` capability probe
 * would turn a missing flag back into the silent data-loss bug; an OpenCode V1
 * build without `--dir` should fail loudly at spawn instead.
 *
 * OpenCode 2 changes the premise: it resolves its workspace from the process
 * cwd (`location services booted directory=<cwd>`) and no longer adopts the
 * enclosing git root, so the flag is gone and spawning with `cwd` is the
 * contract. `isOpenCodeV2Surface` is the only branch that omits it; every
 * other state — V1, or a probe that never ran — keeps today's behaviour.
 */
export function appendOpenCodeWorkspaceDir(
  args: string[],
  agentId: string,
  cwd: string | null | undefined,
): void {
  if (typeof cwd !== 'string' || cwd.length === 0) return;
  if (isOpenCodeV2Surface(agentCapabilities.get(agentId))) return;
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

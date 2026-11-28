import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { agentCapabilities } from './capabilities.js';
import { execAgentFile } from './invocation.js';
import type { RuntimeAgentDef } from './types.js';

export const OPENCODE_SKIP_PERMISSIONS_FLAG = '--dangerously-skip-permissions';
export const OPENCODE_WORKSPACE_DIR_FLAG = '--dir';

export const OPENCODE_PERMISSION_CAPABILITY = {
  helpArgs: ['run', '--help'],
  capabilityFlags: {
    // One capability, two CLI generations: 1.x documents the legacy spelling,
    // 2.x documents `--auto` (where the 1.x spelling survives as a hidden
    // alias). `scanHelpCapabilities` records whichever this binary advertises.
    [OPENCODE_SKIP_PERMISSIONS_FLAG]: 'skipPermissions',
    '--auto': 'skipPermissions',
    // OpenCode 2.x-only flags. Their presence in `--help` both identifies the
    // CLI generation (see `isOpenCodeV2Dialect`) and gates the flags
    // themselves, so buildArgs never sends a 2.x-only flag to a 1.x binary.
    '--archived': 'archivedSessions',
    '--standalone': 'standaloneServer',
    '--variant': 'modelVariant',
  },
} satisfies Pick<RuntimeAgentDef, 'helpArgs' | 'capabilityFlags'>;

export function appendOpenCodePermissionBypass(args: string[], agentId: string): void {
  const advertised = agentCapabilities.get(agentId)?.skipPermissions;
  if (!advertised) return;
  // The scan records the flag this binary documents (`--dangerously-skip-
  // permissions` on 1.x, `--auto` on 2.x); a bare `true` (hidden-flag probe)
  // falls back to the legacy spelling.
  args.push(typeof advertised === 'string' ? advertised : OPENCODE_SKIP_PERMISSIONS_FLAG);
}

/**
 * True when the cached `--help` scan positively identified an OpenCode 2.x
 * CLI (`--archived` shipped in 2.2.6 and never existed on 1.x).
 *
 * Everything the 2.x CLI *removed* (`--dir`, `--pure`, `--variant`) is
 * conditioned on this marker: only positive 2.x evidence suppresses a 1.x
 * flag, so an unprobed or unreadable CLI keeps today's exact 1.x argv. A
 * 2.x binary that somehow lacks the marker fails loudly at spawn with
 * "Unrecognized flag: --dir" (now classified as a version-incompatibility
 * diagnostic) instead of silently changing where the agent writes.
 */
export function isOpenCodeV2Dialect(agentId: string): boolean {
  return Boolean(agentCapabilities.get(agentId)?.archivedSessions);
}

/**
 * Run against a private OpenCode server that inherits this child's env.
 *
 * OpenCode 2.x `run` reuses a background service when one is up — but a
 * reused service carries its OWN environment, so the daemon's
 * `OPENCODE_CONFIG_CONTENT` / `OPENCODE_DISABLE_PROJECT_CONFIG` injection
 * would be silently ignored whenever the user has an interactive OpenCode
 * session running. `--standalone` gives the run a private server whose env
 * is the daemon's, and whose stdin-ownership lease tears the server down
 * when the run process dies — which matters because the daemon's Windows
 * kill path has no process groups.
 */
export function appendOpenCodeStandaloneServer(args: string[], agentId: string): void {
  if (agentCapabilities.get(agentId)?.standaloneServer) {
    args.push('--standalone');
  }
}

/**
 * Reasoning-variant selection across OpenCode CLI generations.
 *
 * 1.x spelled variants as a dedicated `--variant` flag. 2.x removed the flag
 * and folded variants into the model reference (`provider/model#variant`,
 * split at `#` by the CLI's own schema). Only a positively-advertised
 * `--variant` uses the flag form; a probe-confirmed absence folds the
 * variant into `-m`, and an unprobed binary keeps the 1.x status quo.
 */
export function appendOpenCodeVariant(
  args: string[],
  agentId: string,
  modelId: string,
  variant: string,
): void {
  const advertised = agentCapabilities.get(agentId)?.modelVariant;
  if (!isOpenCodeV2Dialect(agentId) && (advertised === undefined || advertised)) {
    args.push('--variant', variant);
    return;
  }
  const modelFlagIndex = args.indexOf('-m');
  if (modelFlagIndex !== -1) {
    args[modelFlagIndex + 1] = `${args[modelFlagIndex + 1]}#${variant}`;
  } else {
    args.push('-m', `${modelId}#${variant}`);
  }
}

/**
 * Connection smoke-test isolation across OpenCode CLI generations.
 *
 * `opencode run --pure` (1.x) kept the one-off smoke test isolated from
 * user-installed plugins while regular chat runs retained the user's full
 * plugin environment. 2.x has no `--pure`; the archived session is the 2.x
 * hygiene equivalent — the smoke session stays out of the user's session
 * list, and the daemon resumes/export sessions by id, which `--archived`
 * does not block. mimo is a fork that still speaks `--pure` and rides the
 * legacy branch (it never advertises the 2.x marker).
 */
export function appendOpenCodeConnectionTestFlags(args: string[], agentId: string): void {
  if (isOpenCodeV2Dialect(agentId)) {
    if (!args.includes('--archived')) args.push('--archived');
  } else if (!args.includes('--pure')) {
    args.push('--pure');
  }
  if (!args.includes('--title')) args.push('--title', 'Connection test');
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
 * OpenCode 2.x removed `--dir` entirely: the run directory is the spawn cwd,
 * and the config-discovery walk-up the flag used to defeat is disabled
 * instead via `OPENCODE_DISABLE_PROJECT_CONFIG` (see `env.ts`). Only positive
 * 2.x evidence (`--archived` in the cached `--help` scan, a flag that never
 * existed on 1.x) omits `--dir`; an unprobed or unreadable CLI keeps the
 * unconditional append, so a 1.x binary never silently loses workspace
 * pinning. (A 2.x binary without the marker would fail loudly at spawn with
 * "Unrecognized flag: --dir" — a version-incompatibility diagnostic.)
 */
export function appendOpenCodeWorkspaceDir(
  args: string[],
  cwd: string | null | undefined,
  agentId: string = 'opencode',
): void {
  if (typeof cwd !== 'string' || cwd.length === 0) return;
  if (isOpenCodeV2Dialect(agentId)) return;
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

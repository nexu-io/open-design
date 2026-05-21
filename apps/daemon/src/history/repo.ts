// Substrate-aware history module: owns substrate initialization for a
// project (git init + initial migration commit + corresponding
// project_revisions row), the existing-`.git` collision check, and the
// per-run "commit if dirty" path that records a revision when a chat
// run leaves changes on disk.
//
// The substrate is git. The API surface (the names of the functions
// this module exports and the shape of their arguments / results) is
// substrate-agnostic by design so a future OD-owned implementation
// could replace `repo-git.ts` without changing call sites in
// `ensureProject` / `startChatRun` / route handlers.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

import { runGit } from '../git/exec.js';
import type { Identity } from '../identity/types.js';
import { withProjectLock } from './project-lock.js';

const DEFAULT_GITIGNORE = `# Open Design auto-generated; commit or edit as needed.
.DS_Store
*.log
`;

const MIGRATION_COMMIT_MESSAGE = 'chore(init): import existing project tree';

/**
 * Resolve the on-disk path of the substrate's gitdir for a project.
 * Lives next to projects/ under OD_DATA_DIR so backups already cover
 * it. The `.gitdir` suffix avoids the confusing nested `<id>/.git/`
 * layout that conventional `git init` would produce.
 */
export function projectRepoPath(repoRoot: string, projectId: string): string {
  return path.join(repoRoot, `${projectId}.gitdir`);
}

/** State of the project tree's `.git` entry — used for substrate init + collision detection. */
type DotGitState =
  | { kind: 'absent' }
  | { kind: 'ours' }
  | { kind: 'foreign-dir' }
  | { kind: 'foreign-link'; target: string };

/**
 * Inspect the project tree's `.git` entry. Returns:
 * - `absent`     — no .git, ready for first init
 * - `ours`       — .git is a gitlink file pointing at our `repoDir`
 * - `foreign-dir`  — .git is a regular directory (someone else's repo, possibly cloned)
 * - `foreign-link` — .git is a gitlink pointing somewhere else
 *
 * The caller decides what to do: continue (absent), no-op (ours), or
 * refuse with a clear user-facing error (foreign-*).
 */
async function readDotGitState(projectDir: string, repoDir: string): Promise<DotGitState> {
  const dotGit = path.join(projectDir, '.git');
  let stat;
  try {
    stat = await fs.lstat(dotGit);
  } catch {
    return { kind: 'absent' };
  }
  if (stat.isDirectory()) return { kind: 'foreign-dir' };
  if (!stat.isFile()) return { kind: 'foreign-dir' };
  // Gitlink file: contents `gitdir: <absolute path>`
  const content = await fs.readFile(dotGit, 'utf8');
  const match = /^gitdir:\s*(.+)\s*$/m.exec(content);
  const linkRaw = match?.[1];
  if (!linkRaw) return { kind: 'foreign-dir' };
  const linkedAbsolute = path.isAbsolute(linkRaw)
    ? linkRaw
    : path.resolve(projectDir, linkRaw);
  // `git init --separate-git-dir` canonicalizes its path via the OS
  // (resolving symlinks), so on platforms where the storage root is
  // under a symlink (macOS's /tmp → /private/tmp, common deployment
  // setups where /var or /home is a symlink) a naive string compare
  // against our unresolved `repoDir` fails. Resolve both sides where
  // possible — fall back to lexical compare when realpath errors
  // (e.g., the linked target no longer exists).
  if (await sameDirectoryPath(linkedAbsolute, repoDir)) {
    return { kind: 'ours' };
  }
  return { kind: 'foreign-link', target: linkedAbsolute };
}

async function sameDirectoryPath(a: string, b: string): Promise<boolean> {
  let aResolved = path.resolve(a);
  let bResolved = path.resolve(b);
  try { aResolved = await fs.realpath(aResolved); } catch { /* fall back to lexical */ }
  try { bResolved = await fs.realpath(bResolved); } catch { /* fall back to lexical */ }
  return aResolved === bResolved;
}

/**
 * Construct a git author email when the resolved Identity didn't carry
 * one. Single-user / LocalFallbackProvider deployments commonly leave
 * email unset; this synthesizes a stable, ASCII-safe email derived from
 * the identity's id so git commit doesn't refuse the author line.
 */
function syntheticAuthorEmail(identity: Identity): string {
  if (identity.email && identity.email.trim().length > 0) return identity.email.trim();
  const safe = identity.id.replace(/[^a-z0-9.-]/gi, '_');
  return `${safe}@open-design.local`;
}

/**
 * Apply the resolved Identity to git's per-repo `user.name` / `user.email`
 * config. Per-repo (not --global) so we don't perturb the operator's
 * own git config, and the commit gets the right author line even when
 * multiple identities operate against the same daemon.
 */
async function applyAuthorConfig(
  projectDir: string,
  identity: Identity,
  signal?: AbortSignal,
): Promise<void> {
  await runGit(projectDir, ['config', 'user.email', syntheticAuthorEmail(identity)], signal);
  await runGit(projectDir, ['config', 'user.name', identity.displayName], signal);
}

export interface InitProjectHistoryArgs {
  projectId: string;
  projectDir: string;
  repoDir: string;
  identity: Identity;
  db: Database.Database;
  signal?: AbortSignal;
}

export type InitProjectHistoryResult =
  /** Substrate freshly initialized; first revision recorded. */
  | { kind: 'initialized'; revisionId: string }
  /** Substrate was already initialized for this project; no-op. */
  | { kind: 'already-initialized' }
  /**
   * Project tree already contains a `.git` we don't manage. Refuse to
   * take ownership; the caller surfaces a project-level error. The
   * `target` field is set when the foreign entry is a gitlink (the
   * path it points at), absent when the foreign entry is a regular
   * `.git/` directory.
   */
  | { kind: 'foreign-git-collision'; target?: string };

/**
 * Initialize the history substrate for a project. Idempotent: if the
 * substrate is already in place, returns `already-initialized` without
 * touching anything. Refuses to take ownership of a foreign `.git`.
 *
 * On `initialized`, the on-disk state is:
 *  - .git gitlink file inside projectDir → repoDir
 *  - repoDir contains a full git object database
 *  - a default .gitignore exists in projectDir (only written if missing)
 *  - one commit on `main`: the migration commit capturing the current tree
 *
 * And the DB state is:
 *  - one row inserted in project_revisions with source='migration'
 *  - projects.current_revision_id advanced to that revision's id (the commit SHA)
 */
export async function initProjectHistory(
  args: InitProjectHistoryArgs,
): Promise<InitProjectHistoryResult> {
  // Serialize against any concurrent init/record on the same project.
  // Two callers racing initProjectHistory could otherwise both pass
  // the readDotGitState() check and both run `git init`, producing
  // duplicate migration revisions or corrupt state.
  return withProjectLock(args.projectId, () => initProjectHistoryLocked(args));
}

async function initProjectHistoryLocked(
  args: InitProjectHistoryArgs,
): Promise<InitProjectHistoryResult> {
  const { projectId, projectDir, repoDir, identity, db, signal } = args;

  const state = await readDotGitState(projectDir, repoDir);
  if (state.kind === 'ours') return { kind: 'already-initialized' };
  if (state.kind === 'foreign-dir') return { kind: 'foreign-git-collision' };
  if (state.kind === 'foreign-link') {
    return { kind: 'foreign-git-collision', target: state.target };
  }

  await fs.mkdir(path.dirname(repoDir), { recursive: true });

  // `git init --separate-git-dir=<repoDir>` puts the object database
  // at repoDir and writes a `.git` gitlink file in projectDir. Main
  // is the canonical branch.
  await runGit(
    projectDir,
    ['init', '--separate-git-dir', repoDir, '--initial-branch', 'main'],
    signal,
  );

  const gitignorePath = path.join(projectDir, '.gitignore');
  try {
    await fs.access(gitignorePath);
  } catch {
    await fs.writeFile(gitignorePath, DEFAULT_GITIGNORE, 'utf8');
  }

  await applyAuthorConfig(projectDir, identity, signal);
  await runGit(projectDir, ['add', '-A'], signal);

  // Allow an empty initial commit so brand-new projects (no files yet)
  // still have a starting SHA we can record on the migration row.
  await runGit(
    projectDir,
    ['commit', '--allow-empty', '-m', MIGRATION_COMMIT_MESSAGE],
    signal,
  );

  const sha = (await runGit(projectDir, ['rev-parse', 'HEAD'], signal)).trim();

  const now = Date.now();
  db.prepare(
    `INSERT INTO project_revisions (
       id, project_id, parent_id, created_at, source, message,
       actor_identity_id, actor_display_name, run_id,
       files_changed_count, bytes_added, bytes_removed
     ) VALUES (?, ?, NULL, ?, 'migration', ?, ?, ?, NULL, 0, 0, 0)`,
  ).run(sha, projectId, now, MIGRATION_COMMIT_MESSAGE, identity.id, identity.displayName);

  db.prepare(`UPDATE projects SET current_revision_id = ? WHERE id = ?`).run(sha, projectId);

  return { kind: 'initialized', revisionId: sha };
}

export interface RecordRevisionForRunArgs {
  projectId: string;
  projectDir: string;
  repoDir: string;
  run: { id: string; identity: Identity };
  /** Commit message — caller derives from the chatBody (typically first line of the user prompt). */
  message: string;
  db: Database.Database;
  signal?: AbortSignal;
}

export type RecordRevisionForRunResult =
  /** Tree was dirty and we recorded a new revision. */
  | { kind: 'recorded'; revisionId: string; filesChanged: number; bytesAdded: number; bytesRemoved: number }
  /** Nothing to record — the working tree was clean at run end. */
  | { kind: 'clean' }
  /** Substrate isn't initialized for this project; caller should init first. */
  | { kind: 'not-initialized' };

/**
 * At chat-run end, if the project's working tree has uncommitted changes,
 * stage and commit them as a revision authored by the run's resolved
 * identity. Inserts a `project_revisions` row and advances the project's
 * `current_revision_id` pointer.
 *
 * Returns `clean` (no-op) when the tree is clean — the daemon's chat-run
 * lifecycle calls this unconditionally at run end; it's expected to
 * sometimes have nothing to do.
 *
 * Returns `not-initialized` if the substrate isn't in place for this
 * project — the caller (P0.7 lifecycle hook) decides whether to call
 * `initProjectHistory` first or skip silently.
 *
 * Errors from git (timeout, unexpected exit) propagate as thrown
 * exceptions; the caller wraps in try/catch and logs without failing
 * the run (auto-commit is best-effort, not part of the run's contract).
 */
export async function recordRevisionForRun(
  args: RecordRevisionForRunArgs,
): Promise<RecordRevisionForRunResult> {
  // Serialize against concurrent init/record on the same project. Two
  // runs finishing close together can otherwise both call `git add -A`,
  // and one `git commit` absorbs the other's staged changes — the
  // loser sees a clean tree and no-ops. Lock guarantees the
  // "one revision per run" contract holds.
  return withProjectLock(args.projectId, () => recordRevisionForRunLocked(args));
}

async function recordRevisionForRunLocked(
  args: RecordRevisionForRunArgs,
): Promise<RecordRevisionForRunResult> {
  const { projectId, projectDir, repoDir, run, message, db, signal } = args;

  const state = await readDotGitState(projectDir, repoDir);
  if (state.kind !== 'ours') return { kind: 'not-initialized' };

  const status = await runGit(projectDir, ['status', '--short'], signal);
  if (status.trim().length === 0) return { kind: 'clean' };

  await applyAuthorConfig(projectDir, run.identity, signal);
  await runGit(projectDir, ['add', '-A'], signal);
  await runGit(projectDir, ['commit', '-m', message], signal);

  const sha = (await runGit(projectDir, ['rev-parse', 'HEAD'], signal)).trim();
  const parent = (await runGit(projectDir, ['rev-parse', 'HEAD^'], signal)).trim() || null;
  const stats = await parseLastCommitStats(projectDir, signal);

  const now = Date.now();
  db.prepare(
    `INSERT INTO project_revisions (
       id, project_id, parent_id, created_at, source, message,
       actor_identity_id, actor_display_name, run_id,
       files_changed_count, bytes_added, bytes_removed
     ) VALUES (?, ?, ?, ?, 'agent-run', ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sha,
    projectId,
    parent,
    now,
    message,
    run.identity.id,
    run.identity.displayName,
    run.id,
    stats.filesChanged,
    stats.bytesAdded,
    stats.bytesRemoved,
  );

  db.prepare(`UPDATE projects SET current_revision_id = ? WHERE id = ?`).run(sha, projectId);

  return {
    kind: 'recorded',
    revisionId: sha,
    filesChanged: stats.filesChanged,
    bytesAdded: stats.bytesAdded,
    bytesRemoved: stats.bytesRemoved,
  };
}

interface CommitStats {
  filesChanged: number;
  bytesAdded: number;
  bytesRemoved: number;
}

/**
 * Parse `git show --shortstat --format= HEAD` output to extract counts
 * for the most recent commit. Format example:
 *   ` 3 files changed, 7 insertions(+), 2 deletions(-)`
 * Missing components default to 0 — `git show` may omit insertions or
 * deletions if zero, or omit the line entirely for an empty commit.
 *
 * Note: insertions/deletions are line counts in git's output, not byte
 * counts. The column is named `bytes_*` in the schema for forward
 * compatibility with a future OD-owned substrate that may track actual
 * bytes; under the git substrate we populate the line-count value
 * which is a useful proxy for "size of change."
 */
async function parseLastCommitStats(
  projectDir: string,
  signal?: AbortSignal,
): Promise<CommitStats> {
  const out = await runGit(
    projectDir,
    ['show', '--shortstat', '--format=', 'HEAD'],
    signal,
  );
  const line = out.split('\n').find((l) => l.includes('changed')) ?? '';
  const files = /(\d+)\s+files? changed/.exec(line)?.[1];
  const added = /(\d+)\s+insertions?\(\+\)/.exec(line)?.[1];
  const removed = /(\d+)\s+deletions?\(-\)/.exec(line)?.[1];
  return {
    filesChanged: files ? Number(files) : 0,
    bytesAdded: added ? Number(added) : 0,
    bytesRemoved: removed ? Number(removed) : 0,
  };
}

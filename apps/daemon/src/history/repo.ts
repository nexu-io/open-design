// Substrate-aware history module: owns substrate initialization for a
// project (git init + initial migration commit + corresponding
// project_revisions row), the existing-`.git` collision check, and the
// per-run "commit if dirty" path that records a revision when a chat
// run leaves changes on disk.
//
// The substrate is git. The API surface is substrate-agnostic so a
// future OD-owned implementation could replace it without changing
// call sites in ensureProject / startChatRun / route handlers.

import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
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
const DEFAULT_COMMIT_MESSAGE = 'Agent run';

// Patterns kept in `<repoDir>/info/exclude` rather than the project's
// `.gitignore` because they're runtime scratch (e.g., `.od-skills/` is
// staged into the cwd per run by server.ts). info/exclude is local to
// the gitdir, doesn't pollute the user's .gitignore, and survives clones
// without affecting the clone target.
const HISTORY_EXCLUDE_HEADER = `# Open Design: runtime scratch the history feature ignores.`;
const HISTORY_EXCLUDE_PATTERNS = [
  '.od-skills/',
];
const HISTORY_EXCLUDE_MARKER = '# open-design:history-managed';

/**
 * Resolve the on-disk path of the substrate's gitdir for a project.
 * Lives next to projects/ under OD_DATA_DIR so backups already cover
 * it. The `.gitdir` suffix avoids the confusing nested `<id>/.git/`
 * layout that conventional `git init` would produce.
 */
export function projectRepoPath(repoRoot: string, projectId: string): string {
  return path.join(repoRoot, `${projectId}.gitdir`);
}

type DotGitState =
  | { kind: 'absent' }
  | { kind: 'ours' }
  | { kind: 'foreign-dir' }
  | { kind: 'foreign-link'; target: string };

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
  const content = await fs.readFile(dotGit, 'utf8');
  const match = /^gitdir:\s*(.+)\s*$/m.exec(content);
  const linkRaw = match?.[1];
  if (!linkRaw) return { kind: 'foreign-dir' };
  const linkedAbsolute = path.isAbsolute(linkRaw)
    ? linkRaw
    : path.resolve(projectDir, linkRaw);
  // `git init --separate-git-dir` canonicalizes via realpath, so a
  // naive string compare fails when the storage root is under a
  // symlink (macOS /tmp -> /private/tmp). Resolve both sides; fall
  // back to lexical compare if realpath fails.
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
 * Append daemon-managed exclude patterns to `<repoDir>/info/exclude`.
 * Idempotent via the marker line; preserves any existing content.
 */
async function ensureHistoryManagedExcludes(repoDir: string): Promise<void> {
  const excludePath = path.join(repoDir, 'info', 'exclude');
  await fs.mkdir(path.dirname(excludePath), { recursive: true });
  let existing = '';
  try { existing = await fs.readFile(excludePath, 'utf8'); } catch { /* no prior content */ }
  if (existing.includes(HISTORY_EXCLUDE_MARKER)) return;
  const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
  const block = [
    '',
    HISTORY_EXCLUDE_MARKER,
    HISTORY_EXCLUDE_HEADER,
    ...HISTORY_EXCLUDE_PATTERNS,
    '',
  ].join('\n');
  await fs.writeFile(excludePath, existing + separator + block, 'utf8');
}

/**
 * Synthesize an ASCII-safe author email when the resolved Identity has
 * none. Single-user / LocalFallbackProvider deployments commonly leave
 * email unset; without this, `git commit` refuses the author line.
 */
function syntheticAuthorEmail(identity: Identity): string {
  if (identity.email && identity.email.trim().length > 0) return identity.email.trim();
  const safe = identity.id.replace(/[^a-z0-9.-]/gi, '_');
  return `${safe}@open-design.local`;
}

/**
 * Apply Identity to per-repo (not --global) git config so the commit
 * author line is right without perturbing the operator's git config.
 */
async function applyAuthorConfig(
  projectDir: string,
  identity: Identity,
  signal?: AbortSignal,
): Promise<void> {
  await runGit(projectDir, ['config', 'user.email', syntheticAuthorEmail(identity)], signal);
  await runGit(projectDir, ['config', 'user.name', identity.displayName], signal);
}

/**
 * Read HEAD's SHA, returning null when HEAD is unborn. Always passes
 * softFail128 because callers handle the "no HEAD" case explicitly.
 */
export async function readHeadSha(
  projectDir: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const out = await runGit(projectDir, ['rev-parse', 'HEAD'], signal, { softFail128: true });
  return out.trim() || null;
}

/**
 * Read HEAD's parent SHA, returning null on initial commit (no parent).
 */
async function readHeadParentSha(
  projectDir: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const out = await runGit(projectDir, ['rev-parse', 'HEAD^'], signal, { softFail128: true });
  return out.trim() || null;
}

/**
 * Repair `projects.current_revision_id` when it doesn't match HEAD's row.
 * Covers legacy state from pre-transaction-wrap days where INSERT
 * landed but UPDATE didn't. No-op when HEAD is unborn or has no row
 * (caller's orphan-backfill handles that case).
 */
function ensureHeadPointerInvariant(
  db: Database.Database,
  projectId: string,
  headSha: string | null,
): void {
  if (!headSha) return;
  const headRow = db.prepare(
    `SELECT id FROM project_revisions WHERE project_id = ? AND git_sha = ? LIMIT 1`,
  ).get(projectId, headSha) as { id: string } | undefined;
  if (!headRow) return;
  const projectRow = db.prepare(
    `SELECT current_revision_id FROM projects WHERE id = ?`,
  ).get(projectId) as { current_revision_id: string | null } | undefined;
  if (projectRow?.current_revision_id !== headRow.id) {
    setCurrentRevision(db, projectId, headRow.id);
  }
}

/** Look up an existing revision row's id by (project_id, git_sha). */
function revisionIdForSha(
  db: Database.Database,
  projectId: string,
  sha: string | null,
): string | null {
  if (!sha) return null;
  const row = db.prepare(
    `SELECT id FROM project_revisions WHERE project_id = ? AND git_sha = ?`,
  ).get(projectId, sha) as { id: string } | undefined;
  return row?.id ?? null;
}

function setCurrentRevision(
  db: Database.Database,
  projectId: string,
  revisionId: string,
): void {
  db.prepare(`UPDATE projects SET current_revision_id = ? WHERE id = ?`).run(revisionId, projectId);
}

interface RevisionRow {
  id: string;
  projectId: string;
  parentId: string | null;
  gitSha: string | null;
  createdAt: number;
  source: 'agent-run' | 'manual-snapshot' | 'restore' | 'migration';
  message: string;
  actorIdentityId: string | null;
  actorDisplayName: string | null;
  runId: string | null;
  filesChanged: number;
  bytesAdded: number;
  bytesRemoved: number;
}

const INSERT_PROJECT_REVISION_SQL = `INSERT INTO project_revisions (
  id, project_id, parent_id, git_sha, created_at, source, message,
  actor_identity_id, actor_display_name, run_id,
  files_changed_count, bytes_added, bytes_removed
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function insertRevision(db: Database.Database, row: RevisionRow): void {
  db.prepare(INSERT_PROJECT_REVISION_SQL).run(
    row.id,
    row.projectId,
    row.parentId,
    row.gitSha,
    row.createdAt,
    row.source,
    row.message,
    row.actorIdentityId,
    row.actorDisplayName,
    row.runId,
    row.filesChanged,
    row.bytesAdded,
    row.bytesRemoved,
  );
}

/**
 * Atomic INSERT + pointer-advance. Without the transaction, a crash
 * between the two statements leaves a row in project_revisions with
 * `projects.current_revision_id` pointing at the previous revision —
 * the same partial-multi-write defect the orphan-HEAD backfill catches
 * on retry, applied to the SQL-write boundary.
 */
function insertRevisionAndAdvancePointer(db: Database.Database, row: RevisionRow): void {
  db.transaction(() => {
    insertRevision(db, row);
    setCurrentRevision(db, row.projectId, row.id);
  })();
}

interface CommitMetadata {
  sha: string;
  authorName: string;
  authorDateMs: number;
  message: string;
}

async function readCommitMetadata(
  projectDir: string,
  ref: string,
  signal?: AbortSignal,
): Promise<CommitMetadata> {
  const out = await runGit(
    projectDir,
    ['log', '-1', '--format=%H%n%an%n%aI%n%B', ref],
    signal,
  );
  const lines = out.split('\n');
  if (lines.length < 4) {
    throw new Error(`readCommitMetadata(${ref}): malformed git log output`);
  }
  const [sha, authorName, authorIso, ...messageLines] = lines;
  const authorDateMs = Date.parse(authorIso ?? '');
  if (!sha) throw new Error(`readCommitMetadata(${ref}): empty SHA`);
  if (Number.isNaN(authorDateMs)) {
    throw new Error(`readCommitMetadata(${ref}): unparseable author date "${authorIso}"`);
  }
  return {
    sha,
    authorName: (authorName ?? '').trim(),
    authorDateMs,
    message: messageLines.join('\n').trim(),
  };
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
   * Substrate was initialized on disk by a prior call that crashed or
   * had its post-commit DB write fail, leaving the gitdir and gitlink
   * in place but no `project_revisions` migration row. This call
   * detected the half-init state, read HEAD's SHA from the existing
   * gitdir, inserted the missing migration row, and advanced
   * `current_revision_id`. From the caller's perspective the project
   * is now fully initialized — same end-state as `'initialized'`.
   */
  | { kind: 'repaired'; revisionId: string }
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
 *  - projects.current_revision_id advanced to that revision's id (a UUID)
 */
export async function initProjectHistory(
  args: InitProjectHistoryArgs,
): Promise<InitProjectHistoryResult> {
  // Serialize against any concurrent init/record on the same project,
  // otherwise two callers can both pass readDotGitState and both
  // `git init`, producing duplicate migration revisions.
  return withProjectLock(args.projectId, () => initProjectHistoryLocked(args));
}

/**
 * Substrate exists on disk but no migration row in the DB — repair by
 * either attributing from the existing commit (case-a: HEAD exists,
 * commit is durable history we did not author) or completing the init
 * (case-b: HEAD unborn, we author the migration commit ourselves).
 */
async function repairHalfInitializedSubstrate(
  args: InitProjectHistoryArgs,
): Promise<{ kind: 'repaired'; revisionId: string }> {
  const { projectId, projectDir, repoDir, identity, db, signal } = args;
  const headSha = await readHeadSha(projectDir, signal);
  const revisionId = randomUUID();

  if (headSha) {
    // (a) Attribute from the existing commit, not this retrying call.
    const meta = await readCommitMetadata(projectDir, 'HEAD', signal);
    insertRevisionAndAdvancePointer(db, {
      id: revisionId,
      projectId,
      parentId: null,
      gitSha: meta.sha,
      createdAt: meta.authorDateMs,
      source: 'migration',
      message: meta.message || MIGRATION_COMMIT_MESSAGE,
      actorIdentityId: null,
      actorDisplayName: meta.authorName || null,
      runId: null,
      filesChanged: 0,
      bytesAdded: 0,
      bytesRemoved: 0,
    });
    return { kind: 'repaired', revisionId };
  }

  // (b) Resume the remaining init steps; we author the new commit.
  await ensureHistoryManagedExcludes(repoDir);
  await applyAuthorConfig(projectDir, identity, signal);
  await runGit(projectDir, ['add', '-A'], signal);
  await runGit(projectDir, ['commit', '--allow-empty', '-m', MIGRATION_COMMIT_MESSAGE], signal);
  const sha = (await runGit(projectDir, ['rev-parse', 'HEAD'], signal)).trim();
  insertRevisionAndAdvancePointer(db, {
    id: revisionId,
    projectId,
    parentId: null,
    gitSha: sha,
    createdAt: Date.now(),
    source: 'migration',
    message: MIGRATION_COMMIT_MESSAGE,
    actorIdentityId: identity.id,
    actorDisplayName: identity.displayName,
    runId: null,
    filesChanged: 0,
    bytesAdded: 0,
    bytesRemoved: 0,
  });
  return { kind: 'repaired', revisionId };
}

async function initProjectHistoryLocked(
  args: InitProjectHistoryArgs,
): Promise<InitProjectHistoryResult> {
  const { projectId, projectDir, repoDir, identity, db, signal } = args;

  const state = await readDotGitState(projectDir, repoDir);
  if (state.kind === 'ours') {
    // Substrate exists on disk. Fast path is no-op when the migration
    // row also exists; otherwise repair from HEAD — without this,
    // `readDotGitState() === 'ours'` short-circuits forever and the
    // project stays broken.
    const existing = db
      .prepare(
        `SELECT id FROM project_revisions
          WHERE project_id = ? AND source = 'migration'
          LIMIT 1`,
      )
      .get(projectId) as { id: string } | undefined;
    if (existing) {
      // Defensively re-assert pointer: a legacy partial write or
      // external DB edit could have left it stale.
      ensureHeadPointerInvariant(db, projectId, await readHeadSha(projectDir, signal));
      return { kind: 'already-initialized' };
    }
    return repairHalfInitializedSubstrate(args);
  }
  if (state.kind === 'foreign-dir') return { kind: 'foreign-git-collision' };
  if (state.kind === 'foreign-link') {
    return { kind: 'foreign-git-collision', target: state.target };
  }

  await fs.mkdir(path.dirname(repoDir), { recursive: true });

  // `git init --separate-git-dir=<repoDir>` puts the object database
  // at repoDir and writes a `.git` gitlink file in projectDir.
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

  // Daemon-managed exclusions go in info/exclude (out of the
  // user-visible .gitignore). git init may have written its own
  // sample content; we append idempotently rather than overwriting.
  await ensureHistoryManagedExcludes(repoDir);

  await applyAuthorConfig(projectDir, identity, signal);
  await runGit(projectDir, ['add', '-A'], signal);

  // --allow-empty so brand-new projects (no files yet) still get a
  // starting SHA for the migration row.
  await runGit(
    projectDir,
    ['commit', '--allow-empty', '-m', MIGRATION_COMMIT_MESSAGE],
    signal,
  );

  const sha = (await runGit(projectDir, ['rev-parse', 'HEAD'], signal)).trim();
  const revisionId = randomUUID();
  insertRevisionAndAdvancePointer(db, {
    id: revisionId,
    projectId,
    parentId: null,
    gitSha: sha,
    createdAt: Date.now(),
    source: 'migration',
    message: MIGRATION_COMMIT_MESSAGE,
    actorIdentityId: identity.id,
    actorDisplayName: identity.displayName,
    runId: null,
    filesChanged: 0,
    bytesAdded: 0,
    bytesRemoved: 0,
  });

  return { kind: 'initialized', revisionId };
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
  /**
   * Whether this run is known to have invoked a file-write tool. Gates
   * marker creation in the sibling-absorbed branch: a purely
   * conversational run must not produce a marker row even if a sibling
   * advanced HEAD during its lock wait. Default false (no marker) —
   * safer to lose provenance for an edge case than to write a false
   * marker that pollutes durable history data.
   */
  runTouchedFiles?: boolean;
  /**
   * HEAD SHA observed at run-create time. Preferred baseline for the
   * sibling-absorbed marker check: catches the sequential-completion
   * case where a sibling commits and releases before this run's
   * finish hook even enters `recordRevisionForRun`. When null the
   * marker falls back to the lock-entry baseline only.
   */
  runHeadAtCreate?: string | null;
}

export type RecordRevisionForRunResult =
  /** Tree was dirty and we recorded a new revision. */
  | { kind: 'recorded'; revisionId: string; filesChanged: number; bytesAdded: number; bytesRemoved: number }
  /** Nothing to record — the working tree was clean at run end. */
  | { kind: 'clean' }
  /**
   * A concurrent sibling run on the same project advanced HEAD while
   * this run waited at the lock; the sibling's commit absorbed any
   * changes this run wrote. We preserve provenance by recording a row
   * with `git_sha=NULL` and `parent_id` pointing to the sibling's
   * revision. `current_revision_id` is NOT advanced (the sibling
   * already owns the head).
   */
  | { kind: 'marker'; revisionId: string; absorbedIntoRevisionId: string | null }
  /** Substrate isn't initialized for this project; caller should init first. */
  | { kind: 'not-initialized' };

/**
 * At chat-run end, if the project's working tree has uncommitted
 * changes, stage and commit them as a revision authored by the run's
 * identity. Returns `clean` when nothing to do (expected case) and
 * `not-initialized` when the caller should init first.
 *
 * Errors from git propagate; the caller wraps in try/catch and logs
 * (auto-commit is best-effort, not part of the run's contract).
 */
export async function recordRevisionForRun(
  args: RecordRevisionForRunArgs,
): Promise<RecordRevisionForRunResult> {
  // The lock alone is not sufficient for "one revision per run". When
  // two runs finish close together both with dirty workdirs, the first
  // to acquire the lock `git add -A`s the *combined* dirty state; the
  // second acquires a clean tree and would silently lose provenance.
  // To preserve it, capture HEAD *before* queueing for the lock; if
  // the locked critical section finds the tree clean AND HEAD has
  // advanced, we know a sibling absorbed our changes and record a
  // marker row attributed to this run.
  let headBeforeLock: string | null = null;
  try {
    headBeforeLock = await readHeadSha(args.projectDir, args.signal);
  } catch {
    // HEAD may not resolve if the substrate isn't initialized yet —
    // recordRevisionForRunLocked handles that case explicitly via the
    // readDotGitState check at its head.
  }
  return withProjectLock(args.projectId, () => recordRevisionForRunLocked(args, headBeforeLock));
}

/**
 * Walk back from HEAD collecting commits that have no project_revisions
 * row. Stops at the first commit that does, or at the repo root.
 * Returns oldest-first so caller can insert in parent → child order.
 */
async function collectOrphanCommits(
  projectDir: string,
  db: Database.Database,
  projectId: string,
  headSha: string,
  signal?: AbortSignal,
): Promise<CommitMetadata[]> {
  const orphans: CommitMetadata[] = [];
  let cursor: string | null = headSha;
  while (cursor && !revisionIdForSha(db, projectId, cursor)) {
    const meta = await readCommitMetadata(projectDir, cursor, signal);
    orphans.push(meta);
    cursor = await readFirstParentSha(projectDir, cursor, signal);
  }
  return orphans.reverse();
}

async function readFirstParentSha(
  projectDir: string,
  ref: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const out = await runGit(projectDir, ['rev-parse', `${ref}^`], signal, { softFail128: true });
  return out.trim() || null;
}

/**
 * Restore the "every HEAD-reachable commit has a row" invariant by
 * walking back from HEAD and inserting each missing commit oldest →
 * newest in one transaction, attributing to the actual git author
 * (NOT this retrying run).
 */
async function repairOrphanHead(
  args: RecordRevisionForRunArgs,
  headSha: string,
): Promise<void> {
  const { projectId, projectDir, db, signal } = args;
  if (revisionIdForSha(db, projectId, headSha)) {
    ensureHeadPointerInvariant(db, projectId, headSha);
    return;
  }
  const orphans = await collectOrphanCommits(projectDir, db, projectId, headSha, signal);
  if (orphans.length === 0) return;

  const oldestParentSha = await readFirstParentSha(projectDir, orphans[0]!.sha, signal);
  const oldestParentId = revisionIdForSha(db, projectId, oldestParentSha);
  const ids = orphans.map(() => randomUUID());
  const stats: CommitStats[] = [];
  for (const meta of orphans) {
    stats.push(await parseCommitStats(projectDir, meta.sha, signal));
  }

  db.transaction(() => {
    orphans.forEach((meta, i) => {
      const isRootBoundary = i === 0 && oldestParentSha === null;
      insertRevision(db, {
        id: ids[i]!,
        projectId,
        parentId: i === 0 ? oldestParentId : ids[i - 1]!,
        gitSha: meta.sha,
        createdAt: meta.authorDateMs,
        source: isRootBoundary ? 'migration' : 'agent-run',
        message: meta.message || DEFAULT_COMMIT_MESSAGE,
        actorIdentityId: null,
        actorDisplayName: meta.authorName || null,
        runId: null,
        filesChanged: stats[i]!.filesChanged,
        bytesAdded: stats[i]!.bytesAdded,
        bytesRemoved: stats[i]!.bytesRemoved,
      });
    });
    setCurrentRevision(db, projectId, ids[ids.length - 1]!);
  })();
}

/**
 * Sibling-absorbed marker: tree was clean at lock acquisition but HEAD
 * advanced during the wait and this run did invoke a file-write tool.
 * Record git_sha=NULL (partial unique index on (project_id, git_sha)
 * is WHERE git_sha IS NOT NULL) with parent_id pointing at the sibling's
 * revision. Do NOT advance current_revision_id; the sibling owns head.
 */
function recordSiblingAbsorbedMarker(
  args: RecordRevisionForRunArgs,
  headNow: string,
): { kind: 'marker'; revisionId: string; absorbedIntoRevisionId: string | null } {
  const { projectId, run, message, db } = args;
  const absorbedIntoRevisionId = revisionIdForSha(db, projectId, headNow);
  const revisionId = randomUUID();
  insertRevision(db, {
    id: revisionId,
    projectId,
    parentId: absorbedIntoRevisionId,
    gitSha: null,
    createdAt: Date.now(),
    source: 'agent-run',
    message,
    actorIdentityId: run.identity.id,
    actorDisplayName: run.identity.displayName,
    runId: run.id,
    filesChanged: 0,
    bytesAdded: 0,
    bytesRemoved: 0,
  });
  return { kind: 'marker', revisionId, absorbedIntoRevisionId };
}

async function recordRevisionForRunLocked(
  args: RecordRevisionForRunArgs,
  headBeforeLock: string | null,
): Promise<RecordRevisionForRunResult> {
  const { projectId, projectDir, repoDir, run, message, db, signal } = args;

  const state = await readDotGitState(projectDir, repoDir);
  if (state.kind !== 'ours') return { kind: 'not-initialized' };

  // Belt-and-suspenders: re-assert daemon-managed excludes before
  // every status check. Idempotent and cheap. Catches the legacy case
  // where substrates initialized before this fix landed don't have
  // info/exclude populated, so without this call `.od-skills/` would
  // be reported dirty and the next commit would absorb runtime scratch.
  await ensureHistoryManagedExcludes(repoDir);

  const headForRepair = await readHeadSha(projectDir, signal);
  if (headForRepair) {
    await repairOrphanHead(args, headForRepair);
  }

  const status = await runGit(projectDir, ['status', '--short'], signal);
  if (status.trim().length === 0) {
    if (!args.runTouchedFiles) return { kind: 'clean' };
    const headNow = await readHeadSha(projectDir, signal);
    // Prefer the earliest baseline available: HEAD at run-create catches
    // the sequential-completion case (sibling committed and released
    // before this hook entered), HEAD at lock-entry catches the
    // overlapping-lock case. Either advancing → marker.
    const baseline = args.runHeadAtCreate ?? headBeforeLock;
    const advanced = baseline !== null && headNow !== null && headNow !== baseline;
    if (!advanced || !headNow) return { kind: 'clean' };
    return recordSiblingAbsorbedMarker(args, headNow);
  }

  // Dirty tree, but this run didn't invoke a file-write tool — the
  // dirt is pre-existing (uploads, sibling, or template seeds). Don't
  // commit it as this run's work; let a future file-writing run pick
  // it up. Avoids attributing other actors' content to a conversational
  // run that happened to win the lock.
  if (!args.runTouchedFiles) return { kind: 'clean' };

  await applyAuthorConfig(projectDir, run.identity, signal);
  await runGit(projectDir, ['add', '-A'], signal);
  await runGit(projectDir, ['commit', '-m', message], signal);

  const sha = (await runGit(projectDir, ['rev-parse', 'HEAD'], signal)).trim();
  // parent_id is a UUID, not a SHA; resolve via (project_id, git_sha)
  // unique index. Initial commit -> null.
  const parentSha = await readHeadParentSha(projectDir, signal);
  const stats = await parseCommitStats(projectDir, 'HEAD', signal);

  const revisionId = randomUUID();
  insertRevisionAndAdvancePointer(db, {
    id: revisionId,
    projectId,
    parentId: revisionIdForSha(db, projectId, parentSha),
    gitSha: sha,
    createdAt: Date.now(),
    source: 'agent-run',
    message,
    actorIdentityId: run.identity.id,
    actorDisplayName: run.identity.displayName,
    runId: run.id,
    filesChanged: stats.filesChanged,
    bytesAdded: stats.bytesAdded,
    bytesRemoved: stats.bytesRemoved,
  });

  return {
    kind: 'recorded',
    revisionId,
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
 * Parse `git show --shortstat --format= HEAD` output. Format example:
 *   ` 3 files changed, 7 insertions(+), 2 deletions(-)`
 * Missing components default to 0.
 *
 * Note: bytes_added/bytes_removed columns hold line counts under the
 * git substrate (named for forward-compat with a future OD-owned
 * substrate that may track actual bytes).
 */
async function parseCommitStats(
  projectDir: string,
  ref: string,
  signal?: AbortSignal,
): Promise<CommitStats> {
  const out = await runGit(projectDir, ['show', '--shortstat', '--format=', ref], signal);
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

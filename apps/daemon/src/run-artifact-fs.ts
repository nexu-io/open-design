// Agent-agnostic artifact counter. Instead of reconstructing file writes from
// each agent's tool-call stream (which only `claude_code` reports in a shape
// `run-artifacts.ts#countNewArtifacts` recognizes — see the audit that found
// codex / opencode / gemini / cursor / amr / … all report artifact_count: 0),
// this snapshots the project's artifact files before the run and diffs against
// a snapshot taken at run end. Whatever runtime the agent used, a real file
// write or edit shows up as a created or modified path.
//
// Why a fingerprint diff and not a file-count delta: a run that EDITS an
// existing artifact leaves the directory's file count unchanged (still 1 file)
// yet did produce artifact work. Counting only "new files" would miss every
// iteration turn. So we compare per-path fingerprints and count a path as
// touched when it is new OR its size/mtime changed — which matches the
// tool-stream counter's existing semantics (both Write and Edit count).

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  isArtifactPath,
  isDesignSystemFile,
  isPreviewModulePath,
} from './runtimes/run-artifacts.js';

// A file worth fingerprinting for run-finish bookkeeping: a user-facing
// artifact (HTML / image / video / audio) OR a design-system marker
// (`DESIGN.md`). Preview modules (`preview/*.html`) are already covered by the
// artifact-extension check; they are classified at diff time.
function isTrackedRunFile(name: string): boolean {
  return isArtifactPath(name) || isDesignSystemFile(name) || isRenderDependencyPath(name);
}

const RENDER_DEPENDENCY_EXTENSIONS = new Set([
  '.css',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
]);

const SUPPORTING_MEDIA_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg',
  '.mp4', '.mov', '.webm', '.mp3', '.wav', '.m4a',
]);

function extensionOf(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

function isRenderDependencyPath(filePath: string): boolean {
  return RENDER_DEPENDENCY_EXTENSIONS.has(extensionOf(filePath));
}

function isSupportingMediaPath(filePath: string): boolean {
  return SUPPORTING_MEDIA_EXTENSIONS.has(extensionOf(filePath));
}

export interface ArtifactFingerprint {
  size: number;
  mtimeMs: number;
  // Content hash for files up to `HASH_MAX_BYTES`, else null. size + mtime
  // already catch every real agent edit (the baseline is taken before the run,
  // so a write during the run advances mtime), but the hash closes the
  // pathological "same byte length AND preserved mtime" rewrite that size+mtime
  // alone would miss. Large media skip hashing to bound run-finish cost.
  hash: string | null;
}

// Files larger than this are not content-hashed (cost bound). Artifacts that
// get edited in place — HTML, DESIGN.md, SVG — are small; large media are
// regenerated wholesale (size changes), so size+mtime suffices for them.
const HASH_MAX_BYTES = 1024 * 1024;

function fingerprintFile(full: string, size: number, mtimeMs: number): ArtifactFingerprint {
  let hash: string | null = null;
  if (size <= HASH_MAX_BYTES) {
    try {
      hash = createHash('sha1').update(fs.readFileSync(full)).digest('hex');
    } catch {
      hash = null;
    }
  }
  return { size, mtimeMs, hash };
}

async function fingerprintFileAsync(
  full: string,
  size: number,
  mtimeMs: number,
): Promise<ArtifactFingerprint> {
  let hash: string | null = null;
  if (size <= HASH_MAX_BYTES) {
    try {
      hash = createHash('sha1').update(await fs.promises.readFile(full)).digest('hex');
    } catch {
      hash = null;
    }
  }
  return { size, mtimeMs, hash };
}

// path -> fingerprint for every artifact-extension file under the project root.
export type ArtifactSnapshot = Map<string, ArtifactFingerprint>;

// Directories that never hold user-facing artifacts; skipped so the walk stays
// cheap and never wanders into dependencies, VCS, or daemon scratch.
const IGNORED_DIR_NAMES: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  '.tmp',
  'dist',
  'build',
  '.next',
  '.cache',
  '.turbo',
]);

// Safety cap: a pathological project tree must not turn run-finish bookkeeping
// into an unbounded walk. Snapshots are best-effort; truncation only risks a
// minor undercount, never a hang.
const MAX_FILES = 5000;

// Separate cap for files outside the tracked-extension set (markdown, docs,
// code, JSON, …). These feed only the coarse `files_written_count` signal, so
// they get their own budget instead of competing with — and on a large
// imported repo starving — the artifact fingerprints that the primary
// `artifact_count` funnel depends on.
const MAX_OTHER_FILES = 5000;

// Cheap fingerprint for non-tracked files: size + mtime only, no content read.
// `files_written_count` is a boolean-ish "did the run write anything" signal,
// so the pathological same-size-same-mtime rewrite these miss is acceptable —
// hashing every code file in an imported repo at run finish is not.
function statOnlyFingerprint(size: number, mtimeMs: number): ArtifactFingerprint {
  return { size, mtimeMs, hash: null };
}

// Walk `rootDir` and fingerprint every file: tracked files (artifact
// extensions + DESIGN.md + render dependencies, per `run-artifacts.ts`) get a
// full content fingerprint; every other file gets a cheap size+mtime stamp so
// the diff can also report the all-file-types `files_written_count`. Each class
// has its own cap (`MAX_FILES` / `MAX_OTHER_FILES`) so a code-heavy imported
// repo cannot starve artifact tracking. Best-effort: unreadable dirs/files are
// skipped, never thrown. Returns an empty snapshot when the root does not
// exist.
export function snapshotProjectArtifacts(rootDir: string): ArtifactSnapshot {
  const snapshot: ArtifactSnapshot = new Map();
  let trackedCount = 0;
  let otherCount = 0;
  const walk = (dir: string): void => {
    if (trackedCount >= MAX_FILES && otherCount >= MAX_OTHER_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (trackedCount >= MAX_FILES && otherCount >= MAX_OTHER_FILES) return;
      if (entry.isDirectory()) {
        if (IGNORED_DIR_NAMES.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        const tracked = isTrackedRunFile(entry.name);
        if (tracked ? trackedCount >= MAX_FILES : otherCount >= MAX_OTHER_FILES) continue;
        const full = path.join(dir, entry.name);
        try {
          const stat = fs.statSync(full);
          snapshot.set(
            full,
            tracked
              ? fingerprintFile(full, stat.size, stat.mtimeMs)
              : statOnlyFingerprint(stat.size, stat.mtimeMs),
          );
          if (tracked) trackedCount += 1;
          else otherCount += 1;
        } catch {
          // Race (file removed mid-walk) or permission error — skip.
        }
      }
    }
  };
  walk(rootDir);
  return snapshot;
}

// Async counterpart used by the normal run start/finish path. It deliberately
// preserves the synchronous snapshot's traversal order, cap, filtering, and
// best-effort error behavior; the only difference is that directory, stat, and
// content reads yield the daemon event loop instead of pausing unrelated HTTP
// and SSE traffic while a large project is scanned.
export async function snapshotProjectArtifactsAsync(rootDir: string): Promise<ArtifactSnapshot> {
  const snapshot: ArtifactSnapshot = new Map();
  const files: Array<{ full: string; tracked: boolean }> = [];
  let trackedCount = 0;
  let otherCount = 0;
  const walk = async (dir: string): Promise<void> => {
    if (trackedCount >= MAX_FILES && otherCount >= MAX_OTHER_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (trackedCount >= MAX_FILES && otherCount >= MAX_OTHER_FILES) return;
      if (entry.isDirectory()) {
        if (IGNORED_DIR_NAMES.has(entry.name) || entry.name.startsWith('.')) continue;
        await walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        const tracked = isTrackedRunFile(entry.name);
        if (tracked ? trackedCount >= MAX_FILES : otherCount >= MAX_OTHER_FILES) continue;
        files.push({ full: path.join(dir, entry.name), tracked });
        if (tracked) trackedCount += 1;
        else otherCount += 1;
      }
    }
  };
  await walk(rootDir);

  // A small worker pool prevents a 5k-file project from turning the async
  // safety fix into a long serial tail, while still bounding filesystem load.
  // Results are committed in traversal order so diff output remains stable.
  // Non-tracked files only need a stat (size+mtime stamp), never a content
  // read, so widening the walk to all files adds no hashing cost.
  const fingerprints = new Array<readonly [string, ArtifactFingerprint] | null>(files.length);
  let nextIndex = 0;
  const fingerprintWorker = async (): Promise<void> => {
    for (;;) {
      const index = nextIndex;
      if (index >= files.length) return;
      nextIndex += 1;
      const { full, tracked } = files[index]!;
      try {
        const stat = await fs.promises.stat(full);
        fingerprints[index] = [
          full,
          tracked
            ? await fingerprintFileAsync(full, stat.size, stat.mtimeMs)
            : statOnlyFingerprint(stat.size, stat.mtimeMs),
        ];
      } catch {
        fingerprints[index] = null;
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(16, files.length) },
      () => fingerprintWorker(),
    ),
  );
  for (const fingerprint of fingerprints) {
    if (fingerprint) snapshot.set(fingerprint[0], fingerprint[1]);
  }
  return snapshot;
}

export interface RunArtifactDiff {
  // Artifact files (HTML / image / video / audio) present after the run but not
  // before. `DESIGN.md` is NOT an artifact extension and is excluded here.
  created: number;
  // Artifact files present both before and after whose size or mtime changed.
  modified: number;
  // Distinct artifact files this run produced or edited (created + modified).
  // Fed into `run_finished.artifact_count`, so an edit-only turn still
  // reports >0.
  touched: number;
  // True when the run created or modified a `DESIGN.md` — the filesystem
  // equivalent of the tool-stream `didRunCreateDesignSystemFile`.
  designSystemCreated: boolean;
  // Distinct `preview/*.html` modules created or modified — the filesystem
  // equivalent of the tool-stream `countDesignSystemPreviewModules`. A preview
  // module is also an artifact, so it is counted in `touched` too (matching the
  // tool-stream counter, where preview writes also bumped artifact_count).
  previewModuleCount: number;
  // Absolute paths for tracked files that were created or modified. Consumers
  // that need per-file side effects, such as HTML version snapshots, can filter
  // this list without re-walking the project tree.
  touchedPaths: string[];
  // Content-only v4 counters. For hashable files, a timestamp-only rewrite is
  // excluded; the legacy counters above intentionally keep their old mtime
  // semantics during the compatibility window.
  contentCreated: number;
  contentModified: number;
  contentTouched: number;
  contentTouchedPaths: string[];
  // HTML rendering dependencies are not legacy artifacts, but changing them
  // can visibly modify the primary preview and must inform
  // primary_artifact_change.
  renderDependencyTouched: number;
  renderDependencyTouchedPaths: string[];
  supportingMediaTouched: number;
  // Distinct files of ANY type this run created or modified — markdown briefs,
  // docx exports, JSON data, code, plus everything the counters above already
  // cover. `artifact_count` deliberately only counts renderable outputs, which
  // makes a run that delivered `PROMPTS.md` or `report.docx` look identical to
  // a pure chat turn in the funnel; this counter closes that blind spot
  // (`run_finished.files_written_count`). Same mtime-inclusive touched
  // semantics as `touched`; deletions are ignored.
  filesWritten: number;
}

// Classify created vs modified tracked files between two snapshots into the
// artifact / design-system / preview-module signals the run_finished event
// needs. Deletions are intentionally ignored: removing a file is not artifact
// production.
export function diffRunArtifacts(
  before: ArtifactSnapshot,
  after: ArtifactSnapshot,
): RunArtifactDiff {
  let created = 0;
  let modified = 0;
  let previewModuleCount = 0;
  let designSystemCreated = false;
  const touchedPaths: string[] = [];
  let contentCreated = 0;
  let contentModified = 0;
  let renderDependencyTouched = 0;
  let supportingMediaTouched = 0;
  let filesWritten = 0;
  const contentTouchedPaths: string[] = [];
  const renderDependencyTouchedPaths: string[] = [];
  for (const [filePath, fingerprint] of after) {
    const prior = before.get(filePath);
    const isNew = !prior;
    const isChanged =
      !!prior &&
      (prior.size !== fingerprint.size ||
        prior.mtimeMs !== fingerprint.mtimeMs ||
        prior.hash !== fingerprint.hash);
    if (!isNew && !isChanged) continue;
    filesWritten += 1;
    const contentChanged = isNew || (!!prior && (
      prior.hash !== null && fingerprint.hash !== null
        ? prior.hash !== fingerprint.hash
        : prior.size !== fingerprint.size || prior.mtimeMs !== fingerprint.mtimeMs
    ));
    // Snapshot keys are native paths (`path.join` → backslashes on Windows),
    // but `isPreviewModulePath` / `isDesignSystemFile` match forward slashes
    // only. Normalize separators so the design-system / preview signals work on
    // Windows project runs, not just POSIX.
    const classifyPath = filePath.replace(/\\/g, '/');
    if (isArtifactPath(classifyPath)) {
      if (isNew) created += 1;
      else modified += 1;
      touchedPaths.push(filePath);
      if (contentChanged) {
        if (isNew) contentCreated += 1;
        else contentModified += 1;
        contentTouchedPaths.push(filePath);
        if (isSupportingMediaPath(classifyPath)) supportingMediaTouched += 1;
      }
    }
    if (contentChanged && isRenderDependencyPath(classifyPath)) {
      renderDependencyTouched += 1;
      renderDependencyTouchedPaths.push(filePath);
    }
    if (isPreviewModulePath(classifyPath)) previewModuleCount += 1;
    if (isDesignSystemFile(classifyPath)) designSystemCreated = true;
  }
  return {
    created,
    modified,
    touched: created + modified,
    designSystemCreated,
    previewModuleCount,
    touchedPaths,
    contentCreated,
    contentModified,
    contentTouched: contentCreated + contentModified,
    contentTouchedPaths,
    renderDependencyTouched,
    renderDependencyTouchedPaths,
    supportingMediaTouched,
    filesWritten,
  };
}

export type PrimaryArtifactChange = 'none' | 'created' | 'modified';

export function primaryArtifactChangeForRun(input: {
  diff: RunArtifactDiff;
  projectKind: string | null;
  hadExistingArtifacts: boolean;
  interactionMode?: string;
  clarificationRequested: boolean;
}): PrimaryArtifactChange | undefined {
  if (
    input.projectKind === 'design_system'
    || input.interactionMode === 'ask'
    || input.interactionMode === 'plan'
    || input.clarificationRequested
  ) {
    return undefined;
  }

  const changed = (() => {
    switch (input.projectKind) {
      case 'prototype':
      case 'live_artifact':
      case 'slide_deck':
      case 'template':
        return input.diff.contentTouchedPaths.some((filePath) => /\.html?$/i.test(filePath))
          || input.diff.renderDependencyTouched > 0;
      case 'image':
        return input.diff.contentTouchedPaths.some((filePath) =>
          /\.(?:png|jpe?g|gif|webp|avif|svg)$/i.test(filePath));
      case 'video':
        return input.diff.contentTouchedPaths.some((filePath) =>
          /\.(?:mp4|mov|webm)$/i.test(filePath));
      case 'audio':
        return input.diff.contentTouchedPaths.some((filePath) =>
          /\.(?:mp3|wav|m4a)$/i.test(filePath));
      default:
        return input.diff.contentTouched > 0 || input.diff.renderDependencyTouched > 0;
    }
  })();
  if (!changed) return 'none';
  return input.hadExistingArtifacts ? 'modified' : 'created';
}

export function supportingAssetFilesChangedForRun(
  diff: RunArtifactDiff,
  projectKind: string | null,
): number | undefined {
  return projectKind === 'prototype'
    || projectKind === 'live_artifact'
    || projectKind === 'slide_deck'
    || projectKind === 'template'
    ? diff.supportingMediaTouched
    : undefined;
}

export interface RunArtifactBaseline {
  cwd: string;
  before: ArtifactSnapshot;
  // True when another run was active in the SAME cwd while this run ran. The
  // daemon allows overlapping runs (see the antigravity lock in server.ts), and
  // a whole-tree snapshot diff cannot tell which concurrent run wrote a file —
  // so a contended run must NOT trust the filesystem diff (the caller falls back
  // to the per-run tool-stream count) to avoid attributing one run's artifacts
  // to another.
  contended: boolean;
}

// Registry of per-run baselines that flags same-cwd overlap. `remember` marks
// both the incoming run and every still-open run sharing its cwd as contended;
// `peek` lets pre-finish hooks inspect without consuming the baseline, and
// `take` removes and returns it for the final analytics pass.
export function createRunArtifactBaselines(cap = 2000) {
  const baselines = new Map<string, RunArtifactBaseline>();
  return {
    remember(runId: string, cwd: string, before: ArtifactSnapshot): void {
      if (baselines.size >= cap) {
        const oldest = baselines.keys().next().value;
        if (oldest !== undefined) baselines.delete(oldest);
      }
      let contended = false;
      for (const [id, other] of baselines) {
        if (id !== runId && other.cwd === cwd) {
          other.contended = true; // the already-open run is now contended too
          contended = true;
        }
      }
      baselines.set(runId, { cwd, before, contended });
    },
    peek(runId: string): RunArtifactBaseline | undefined {
      return baselines.get(runId);
    },
    take(runId: string): RunArtifactBaseline | undefined {
      const baseline = baselines.get(runId);
      if (baseline) baselines.delete(runId);
      return baseline;
    },
  };
}

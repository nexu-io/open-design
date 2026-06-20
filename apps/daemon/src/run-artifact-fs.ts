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
} from './run-artifacts.js';

// A file worth fingerprinting for run-finish bookkeeping: a user-facing
// artifact (HTML / image / video / audio) OR a design-system marker
// (`DESIGN.md`). Preview modules (`preview/*.html`) are already covered by the
// artifact-extension check; they are classified at diff time.
function isTrackedRunFile(name: string): boolean {
  return isArtifactPath(name) || isDesignSystemFile(name);
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

// Walk `rootDir` and fingerprint every artifact file (HTML + image/video/audio,
// per `run-artifacts.ts`). Best-effort: unreadable dirs/files are skipped, never
// thrown. Returns an empty snapshot when the root does not exist.
export function snapshotProjectArtifacts(rootDir: string): ArtifactSnapshot {
  const snapshot: ArtifactSnapshot = new Map();
  const walk = (dir: string): void => {
    if (snapshot.size >= MAX_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (snapshot.size >= MAX_FILES) return;
      if (entry.isDirectory()) {
        if (IGNORED_DIR_NAMES.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile() && isTrackedRunFile(entry.name)) {
        const full = path.join(dir, entry.name);
        try {
          const stat = fs.statSync(full);
          snapshot.set(full, fingerprintFile(full, stat.size, stat.mtimeMs));
        } catch {
          // Race (file removed mid-walk) or permission error — skip.
        }
      }
    }
  };
  walk(rootDir);
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
  for (const [filePath, fingerprint] of after) {
    const prior = before.get(filePath);
    const isNew = !prior;
    const isChanged =
      !!prior &&
      (prior.size !== fingerprint.size ||
        prior.mtimeMs !== fingerprint.mtimeMs ||
        prior.hash !== fingerprint.hash);
    if (!isNew && !isChanged) continue;
    // Snapshot keys are native paths (`path.join` → backslashes on Windows),
    // but `isPreviewModulePath` / `isDesignSystemFile` match forward slashes
    // only. Normalize separators so the design-system / preview signals work on
    // Windows project runs, not just POSIX.
    const classifyPath = filePath.replace(/\\/g, '/');
    if (isArtifactPath(classifyPath)) {
      if (isNew) created += 1;
      else modified += 1;
    }
    if (isPreviewModulePath(classifyPath)) previewModuleCount += 1;
    if (isDesignSystemFile(classifyPath)) designSystemCreated = true;
  }
  return { created, modified, touched: created + modified, designSystemCreated, previewModuleCount };
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
// `take` removes and returns a run's baseline at finish.
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
    take(runId: string): RunArtifactBaseline | undefined {
      const baseline = baselines.get(runId);
      if (baseline) baselines.delete(runId);
      return baseline;
    },
  };
}

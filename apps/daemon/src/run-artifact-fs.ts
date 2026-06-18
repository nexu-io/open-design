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
          snapshot.set(full, { size: stat.size, mtimeMs: stat.mtimeMs });
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
      !!prior && (prior.size !== fingerprint.size || prior.mtimeMs !== fingerprint.mtimeMs);
    if (!isNew && !isChanged) continue;
    if (isArtifactPath(filePath)) {
      if (isNew) created += 1;
      else modified += 1;
    }
    if (isPreviewModulePath(filePath)) previewModuleCount += 1;
    if (isDesignSystemFile(filePath)) designSystemCreated = true;
  }
  return { created, modified, touched: created + modified, designSystemCreated, previewModuleCount };
}

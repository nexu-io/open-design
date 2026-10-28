import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export interface MotionRenderSourceEvidence {
  scope: 'composition-directory';
  files: Array<{ path: string; bytes: number; sha256: string }>;
  issues: Array<{ path: string; reason: string }>;
  directoryComplete: boolean;
  fingerprint: string;
  /** System fonts, remote URLs and dependencies outside this directory are not captured. */
  externalDependencies: 'not-observed';
}

const digest = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');

/** Bounded evidence only: a missing/large/changed file never becomes an export gate. */
export async function captureMotionRenderSource(
  compositionDir: string,
  outputPath: string,
  limits = { files: 512, bytes: 256 * 1024 * 1024 },
): Promise<MotionRenderSourceEvidence> {
  const files: MotionRenderSourceEvidence['files'] = [];
  const issues: MotionRenderSourceEvidence['issues'] = [];
  let bytesRead = 0;
  const issue = (relative: string, reason: string) => {
    if (issues.length < 32) issues.push({ path: relative, reason });
  };
  async function visit(relative: string): Promise<void> {
    const absolute = path.join(compositionDir, relative);
    if (path.resolve(absolute) === path.resolve(outputPath)) return;
    if (files.length >= limits.files || bytesRead >= limits.bytes) {
      issue(relative, 'evidence-budget');
      return;
    }
    try {
      const before = await lstat(absolute);
      if (before.isSymbolicLink()) { issue(relative, 'symlink-not-followed'); return; }
      if (before.isDirectory()) {
        const entries = await readdir(absolute);
        for (const name of entries.sort()) await visit(path.join(relative, name));
        return;
      }
      if (!before.isFile()) { issue(relative, 'not-regular-file'); return; }
      if (before.size > limits.bytes - bytesRead) { issue(relative, 'evidence-budget'); return; }
      const bytes = await readFile(absolute);
      bytesRead += bytes.length;
      const after = await lstat(absolute);
      if (!after.isFile() || after.isSymbolicLink() || before.size !== after.size
        || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) {
        issue(relative, 'changed-during-read');
        return;
      }
      files.push({ path: relative.split(path.sep).join('/'), bytes: bytes.length, sha256: digest(bytes) });
    } catch (error) {
      issue(relative, (error as NodeJS.ErrnoException).code ?? 'read-failed');
    }
  }
  await visit('');
  return { scope: 'composition-directory', files, issues, directoryComplete: issues.length === 0,
    fingerprint: digest(JSON.stringify(files)), externalDependencies: 'not-observed' };
}

export function motionRenderEvidence(input: {
  projectId: string;
  compositionDir: string;
  output: string;
  before: MotionRenderSourceEvidence | null;
  after: MotionRenderSourceEvidence;
  videoBytes: Uint8Array | null;
}) {
  return { version: 1, ...input, videoBytes: undefined,
    videoSha256: input.videoBytes ? digest(input.videoBytes) : null,
    videoSize: input.videoBytes?.length ?? null,
    directoryUnchanged: input.before?.directoryComplete && input.after.directoryComplete
      ? input.before.fingerprint === input.after.fingerprint : null,
    boundary: 'Hashes at capture boundaries; not an atomic filesystem snapshot or proof of visual quality.',
  };
}

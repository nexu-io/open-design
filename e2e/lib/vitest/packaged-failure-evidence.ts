import type { E2eReport } from './report.ts';

/**
 * Report subdirectory that holds everything captured about one failed packaged
 * smoke case. Kept separate from the passing report's files so a failure never
 * overwrites the artifacts the release report already publishes.
 */
export const PACKAGED_FAILURE_EVIDENCE_DIR = 'first-run-failure';

export type PackagedEvidenceSource = {
  name: string;
  read: () => Promise<string | Uint8Array>;
};

export type PackagedEvidenceEntry = {
  detail: string;
  name: string;
  relpath: string;
  status: 'failed' | 'saved';
};

/**
 * Build the report-relative path for one evidence file.
 *
 * Names come from failure paths (log paths, error labels), so they are sanitized
 * rather than trusted: an evidence writer must never be the reason a report
 * write escapes its root.
 */
export function packagedEvidenceRelpath(dir: string, name: string): string {
  return `${sanitizeSegment(dir)}/${sanitizeSegment(name)}`;
}

/**
 * Save every source into the report, keeping going when individual captures
 * fail, and never throwing.
 *
 * A failing packaged case is cleaned up immediately afterwards — uninstall, then
 * the next case's `rm -rf` of the runtime namespace — so anything not copied out
 * here is gone before anyone can look at it. That is why partial evidence beats
 * a capture that aborts on its first unreadable source, and why the manifest
 * records the failures too: "the desktop log could not be read" is itself a
 * finding.
 */
export async function capturePackagedFailureEvidence(
  report: Pick<E2eReport, 'json' | 'save'>,
  dir: string,
  sources: PackagedEvidenceSource[],
): Promise<PackagedEvidenceEntry[]> {
  const entries: PackagedEvidenceEntry[] = [];
  for (const source of sources) {
    const relpath = packagedEvidenceRelpath(dir, source.name);
    try {
      await report.save(relpath, await source.read());
      entries.push({ detail: '', name: source.name, relpath, status: 'saved' });
    } catch (error) {
      entries.push({
        detail: formatEvidenceError(error),
        name: source.name,
        relpath,
        status: 'failed',
      });
    }
  }
  try {
    await report.json(packagedEvidenceRelpath(dir, 'index.json'), {
      capturedAt: new Date().toISOString(),
      entries,
    });
  } catch {
    // The manifest is a convenience; the captured files are the evidence.
  }
  return entries;
}

export function formatEvidenceError(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function sanitizeSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+/, '');
  return cleaned.length === 0 ? 'unnamed' : cleaned;
}

import { DESIGN_JURY_VIEWPORTS } from './visual-capture.js';
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

export interface ObservedVisualCapture {
  artifactPath: string;
  revision: string;
  width: number;
  height: number;
  deliveredImageContent: boolean;
  evidencePath: string;
}

export class VisualEvidenceTracker {
  private readonly captures: ObservedVisualCapture[] = [];

  record(captures: ObservedVisualCapture[]): void {
    this.captures.push(...captures);
    if (this.captures.length > 48) this.captures.splice(0, this.captures.length - 48);
  }

  verify(current: { artifactPath: string; revision: string }): { ok: true } | { ok: false; reason: string } {
    const currentRevisionCaptures = this.captures.filter((capture) =>
      capture.artifactPath === current.artifactPath && capture.revision === current.revision,
    );
    for (const viewport of DESIGN_JURY_VIEWPORTS) {
      const capture = currentRevisionCaptures.find((candidate) =>
        candidate.width === viewport.width
        && candidate.height === viewport.height
        && candidate.deliveredImageContent
        && candidate.evidencePath.length > 0,
      );
      if (!capture) return { ok: false, reason: `Missing current rendered evidence for ${viewport.width}x${viewport.height}.` };
    }
    return { ok: true };
  }
}

export async function readReviewedArtifact(input: {
  projectRoot: string;
  artifactPath: string;
  tracker: VisualEvidenceTracker;
}): Promise<{ ok: true; body: string; revision: string } | { ok: false; reason: string }> {
  try {
    const root = await realpath(input.projectRoot);
    const candidate = path.resolve(root, ...input.artifactPath.split('/'));
    const actualPath = await realpath(candidate);
    if (actualPath !== root && !actualPath.startsWith(root + path.sep)) {
      return { ok: false, reason: 'Captured artifact resolves outside the active project.' };
    }
    const bytes = await readFile(actualPath);
    const revision = createHash('sha256').update(bytes).digest('hex');
    const evidence = input.tracker.verify({ artifactPath: input.artifactPath, revision });
    if (!evidence.ok) return { ok: false, reason: 'Rendered evidence is stale: the saved artifact changed after capture.' };
    return { ok: true, body: bytes.toString('utf8'), revision };
  } catch {
    return { ok: false, reason: 'Captured artifact is no longer available in the active project.' };
  }
}

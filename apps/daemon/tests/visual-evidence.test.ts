import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readReviewedArtifact, VisualEvidenceTracker } from '../src/critique/visual-evidence.js';
import { DESIGN_JURY_VIEWPORTS } from '../src/critique/visual-capture.js';

describe('VisualEvidenceTracker', () => {
  const current = { artifactPath: 'index.html', revision: 'sha-current' };

  it('requires all three viewport images delivered for the exact current revision', () => {
    const tracker = new VisualEvidenceTracker();
    expect(tracker.verify(current)).toMatchObject({ ok: false });
    tracker.record(DESIGN_JURY_VIEWPORTS.map(({ width, height }) => ({
      ...current, width, height, deliveredImageContent: true, evidencePath: `visual/${width}.png`,
    })));
    expect(tracker.verify(current)).toEqual({ ok: true });
    expect(tracker.verify({ ...current, revision: 'sha-after-repair' })).toMatchObject({ ok: false });
  });

  it('rejects missing image delivery even when paths and viewports exist', () => {
    const tracker = new VisualEvidenceTracker();
    tracker.record(DESIGN_JURY_VIEWPORTS.map(({ width, height }, index) => ({
      ...current,
      width,
      height,
      deliveredImageContent: index !== 1,
      evidencePath: `visual/${width}.png`,
    })));
    expect(tracker.verify(current)).toMatchObject({ ok: false, reason: expect.stringContaining('1024x768') });
  });

  it('ships the byte-exact captured template file with CDATA indentation and rejects edits after capture', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'od-reviewed-artifact-'));
    try {
      const body = '<!doctype html>\n<html>\n  <body>\n    <main>reviewed</main>\n  </body>\n</html>\n';
      writeFileSync(join(projectRoot, 'index.html'), body);
      const revision = createHash('sha256').update(body).digest('hex');
      const tracker = new VisualEvidenceTracker();
      tracker.record(DESIGN_JURY_VIEWPORTS.map(({ width, height }) => ({
        artifactPath: 'index.html', revision, width, height,
        deliveredImageContent: true, evidencePath: `visual/${width}.png`,
      })));
      const unchanged = await readReviewedArtifact({ projectRoot, artifactPath: 'index.html', tracker });
      expect(unchanged).toMatchObject({ ok: true, body, revision });

      writeFileSync(join(projectRoot, 'index.html'), `${body}<!-- post-capture edit -->\n`);
      expect(await readReviewedArtifact({ projectRoot, artifactPath: 'index.html', tracker }))
        .toMatchObject({ ok: false, reason: expect.stringContaining('stale') });
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});

import { describe, expect, it } from 'vitest';

import {
  hasPreviewableArtifactForOnboarding,
  producedPreviewableArtifact,
} from '../src/onboarding/first-generation';

// Regression for the funnel-inflation bug (PR #5111 review):
// `onboarding_first_generation_completed` must fire only when a run actually
// produced a previewable artifact — mirroring the first-artifact hint — not on
// any `succeeded` run. This predicate is the gate; ProjectView applies it to
// the files produced during the turn.
describe('producedPreviewableArtifact', () => {
  it('is true when the turn produced an .html artifact', () => {
    expect(producedPreviewableArtifact([{ name: 'index.html' }])).toBe(true);
  });

  it('is true regardless of case', () => {
    expect(producedPreviewableArtifact([{ name: 'Landing.HTML' }])).toBe(true);
  });

  it('is true when at least one produced file is previewable', () => {
    expect(
      producedPreviewableArtifact([
        { name: 'notes.md' },
        { name: 'data.json' },
        { name: 'page.html' },
      ]),
    ).toBe(true);
  });

  it('is true when the turn produced an image artifact', () => {
    const image = { name: 'cute-puppy.png', kind: 'image' } as const;

    expect(producedPreviewableArtifact([image])).toBe(true);
  });

  it('uses the canonical file kind for generated image artifacts', () => {
    const image = { name: 'generated-output.bin', kind: 'image' } as const;

    expect(producedPreviewableArtifact([image])).toBe(true);
  });

  it('is false for a succeeded run that produced no artifact (text/question only)', () => {
    expect(producedPreviewableArtifact([])).toBe(false);
  });

  it('is false when only non-previewable files were produced', () => {
    expect(
      producedPreviewableArtifact([
        { name: 'plan.md' },
        { name: 'palette.json' },
      ]),
    ).toBe(false);
  });

  it('does not treat a sketch image as a generated image artifact', () => {
    const sketch = { name: 'sketch-preview.png', kind: 'sketch' } as const;

    expect(producedPreviewableArtifact([sketch])).toBe(false);
  });

  it('does not treat a filename that merely contains "html" as previewable', () => {
    expect(producedPreviewableArtifact([{ name: 'html-notes.md' }])).toBe(false);
  });
});

describe('hasPreviewableArtifactForOnboarding', () => {
  const image = { name: 'cute-puppy.png', kind: 'image' } as const;

  it('keeps the existing project-level html fallback', () => {
    expect(hasPreviewableArtifactForOnboarding([{ name: 'index.html' }], [])).toBe(true);
  });

  it('does not treat an arbitrary project image as a generated artifact', () => {
    expect(hasPreviewableArtifactForOnboarding([image], [])).toBe(false);
  });

  it('accepts an image still present after a successful assistant turn', () => {
    expect(
      hasPreviewableArtifactForOnboarding(
        [image],
        [{ role: 'assistant', runStatus: 'succeeded', producedFiles: [image] }],
      ),
    ).toBe(true);
  });

  it('rejects failed or deleted image outputs', () => {
    expect(
      hasPreviewableArtifactForOnboarding(
        [image],
        [{ role: 'assistant', runStatus: 'failed', producedFiles: [image] }],
      ),
    ).toBe(false);
    expect(
      hasPreviewableArtifactForOnboarding(
        [],
        [{ role: 'assistant', runStatus: 'succeeded', producedFiles: [image] }],
      ),
    ).toBe(false);
  });

  it('rejects a stale image provenance when the current path is no longer an image', () => {
    expect(
      hasPreviewableArtifactForOnboarding(
        [{ name: image.name, kind: 'sketch' }],
        [{ role: 'assistant', runStatus: 'succeeded', producedFiles: [image] }],
      ),
    ).toBe(false);
  });

  it('rejects a different image version uploaded at the same path', () => {
    expect(
      hasPreviewableArtifactForOnboarding(
        [{ ...image, mtime: 20 }],
        [{
          role: 'assistant',
          runStatus: 'succeeded',
          producedFiles: [{ ...image, mtime: 10 }],
        }],
      ),
    ).toBe(false);
  });
});

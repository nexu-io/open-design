import { describe, expect, it } from 'vitest';

import { producedPreviewableArtifact } from '../src/onboarding/first-generation';

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

  it('is false for a succeeded run that produced no artifact (text/question only)', () => {
    expect(producedPreviewableArtifact([])).toBe(false);
  });

  it('is false when only non-previewable files were produced', () => {
    expect(
      producedPreviewableArtifact([
        { name: 'plan.md' },
        { name: 'palette.json' },
        { name: 'screenshot.png' },
      ]),
    ).toBe(false);
  });

  it('does not treat a filename that merely contains "html" as previewable', () => {
    expect(producedPreviewableArtifact([{ name: 'html-notes.md' }])).toBe(false);
  });
});

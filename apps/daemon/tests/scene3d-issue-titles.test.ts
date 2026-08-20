import { describe, expect, it } from 'vitest';
import { ISSUE_CODES } from '@open-design/scene3d';
import { SCENE3D_ISSUE_TITLES, scene3dIssueTitle } from '@open-design/contracts';

/**
 * The compiler's code set (packages/scene3d/src/errors.ts) and the human
 * title catalog (packages/contracts/src/api/scene3d-codes.ts) live in
 * different packages on purpose — the web app may not import the compiler.
 * The daemon depends on both, so this is the seam where drift is caught:
 * a code without a title renders as bare jargon in every UI surface that
 * has only the stored manifest's issueCodes to work with.
 */
describe('scene3d issue title catalog', () => {
  it('gives every compiler code a human title', () => {
    const untitled = Object.values(ISSUE_CODES).filter(
      (code) => scene3dIssueTitle(code) === null,
    );
    expect(untitled).toEqual([]);
  });

  it('carries no title for a code the compiler no longer defines', () => {
    const known = new Set<string>(Object.values(ISSUE_CODES));
    const orphaned = Object.keys(SCENE3D_ISSUE_TITLES).filter((code) => !known.has(code));
    expect(orphaned).toEqual([]);
  });

  it('keeps titles short enough for a chip beside the code', () => {
    const tooLong = Object.entries(SCENE3D_ISSUE_TITLES)
      .filter(([, title]) => title.length > 40)
      .map(([code]) => code);
    expect(tooLong).toEqual([]);
  });
});

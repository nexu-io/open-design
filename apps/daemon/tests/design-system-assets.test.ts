// Focused test for readDesignSystemAssets — the new sibling-file reader
// that lets the daemon ship the compiled (tokens.css + components.html)
// form of a brand alongside its DESIGN.md prose. The legacy reader
// (`readDesignSystem`, returning DESIGN.md content) already has implicit
// coverage through the showcase + chat-route tests; this file pins the
// new helper's contract so future changes can't silently regress the
// "either or both files may be absent" semantics that PR-C relies on
// for graceful fallback across the ~138 brands without compiled tokens
// today.

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readDesignSystemAssets } from '../src/design-systems.js';

function fresh(): string {
  return mkdtempSync(path.join(tmpdir(), 'od-design-system-assets-'));
}

function brandDir(root: string, id: string): string {
  const dir = path.join(root, id);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('readDesignSystemAssets', () => {
  it('returns both fields when tokens.css and components.html are both present', async () => {
    const root = fresh();
    const dir = brandDir(root, 'sample');
    writeFileSync(path.join(dir, 'tokens.css'), ':root {\n  --bg: #fff;\n}\n');
    writeFileSync(
      path.join(dir, 'components.html'),
      '<!doctype html><html><body>fixture</body></html>\n',
    );

    const assets = await readDesignSystemAssets(root, 'sample');
    expect(assets.tokensCss).toContain('--bg: #fff');
    expect(assets.fixtureHtml).toContain('fixture');
  });

  it('returns the single field that exists when its sibling is missing (per-file independence)', async () => {
    const root = fresh();
    const dir = brandDir(root, 'tokens-only');
    writeFileSync(path.join(dir, 'tokens.css'), ':root { --x: 1; }');

    const tokensOnly = await readDesignSystemAssets(root, 'tokens-only');
    expect(tokensOnly.tokensCss).toBe(':root { --x: 1; }');
    expect(tokensOnly.fixtureHtml).toBeUndefined();

    const fixtureDir = brandDir(root, 'fixture-only');
    writeFileSync(path.join(fixtureDir, 'components.html'), '<p>only</p>');

    const fixtureOnly = await readDesignSystemAssets(root, 'fixture-only');
    expect(fixtureOnly.tokensCss).toBeUndefined();
    expect(fixtureOnly.fixtureHtml).toBe('<p>only</p>');
  });

  it('returns an empty object when the brand directory has neither file', async () => {
    const root = fresh();
    brandDir(root, 'prose-only');

    const assets = await readDesignSystemAssets(root, 'prose-only');
    expect(assets.tokensCss).toBeUndefined();
    expect(assets.fixtureHtml).toBeUndefined();
  });

  it('returns an empty object when the brand directory itself does not exist (legacy ~138-brand fallback)', async () => {
    const root = fresh();
    const assets = await readDesignSystemAssets(root, 'nonexistent-brand');
    expect(assets.tokensCss).toBeUndefined();
    expect(assets.fixtureHtml).toBeUndefined();
  });

  // Reviewer feedback (nettee, PR-C #1385): the prior implementation
  // swallowed every readFile() error as "absent", which would silently
  // hide non-absence failures (EACCES, EISDIR, broken packaged
  // resource paths, transient I/O) and ship the legacy DESIGN.md-only
  // prompt as if the token channel had succeeded. That corrupts the
  // exact signal the smoke-test rollout depends on. The reader now
  // only swallows ENOENT / ENOTDIR; everything else must surface.
  it('rejects on non-absence read failures so token-channel misconfigurations surface', async () => {
    const root = fresh();
    const dir = brandDir(root, 'broken-tokens');
    // Plant a DIRECTORY at the tokens.css path. readFile() rejects
    // with EISDIR — a real-world stand-in for permission / packaged-
    // resource path bugs that should fail visibly, not silently fall
    // back. EACCES would be more lifelike but is hard to simulate
    // portably across CI runners; EISDIR exercises the exact same
    // "non-absence error" branch.
    mkdirSync(path.join(dir, 'tokens.css'));

    await expect(readDesignSystemAssets(root, 'broken-tokens')).rejects.toThrow(
      /EISDIR|illegal operation|directory/i,
    );
  });

  it('still treats ENOENT as absence even when one sibling is present (per-file independence holds under the stricter contract)', async () => {
    // Pin the flip side of the rejection test above: tightening the
    // catch must NOT regress the legacy ~138-brand fallback. With
    // tokens.css present and components.html absent, the reader
    // returns the present side and undefined for the missing one,
    // exactly as before.
    const root = fresh();
    const dir = brandDir(root, 'partial');
    writeFileSync(path.join(dir, 'tokens.css'), ':root { --x: 1; }');

    const assets = await readDesignSystemAssets(root, 'partial');
    expect(assets.tokensCss).toBe(':root { --x: 1; }');
    expect(assets.fixtureHtml).toBeUndefined();
  });
});

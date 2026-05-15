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

import {
  isDesignTokenChannelEnabled,
  readDesignSystemAssets,
  resolveDesignSystemAssets,
} from '../src/design-systems.js';

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

// Reviewer feedback (nettee, PR-D #1544): the parity guard at
// `scripts/check-design-system-flag-parity.ts` exercises the prompt
// composer directly and therefore does NOT cover the server-layer env
// gate that PR-D actually flipped — a future regression that restored
// `=== '1'`, used a typo'd env name, or stopped reading assets when
// the var is unset would still let the guard pass green. These tests
// pin the predicate that wraps the gate so the default-on flip itself
// is locked into the test suite.
describe('isDesignTokenChannelEnabled (PR-D env gate)', () => {
  it('is true when OD_DESIGN_TOKEN_CHANNEL is unset (PR-D default-on)', () => {
    expect(isDesignTokenChannelEnabled({})).toBe(true);
  });

  it('is true for the legacy explicit opt-in `1`', () => {
    expect(isDesignTokenChannelEnabled({ OD_DESIGN_TOKEN_CHANNEL: '1' })).toBe(true);
  });

  it('is true for any non-`0` truthy-looking value (forward compatibility)', () => {
    expect(isDesignTokenChannelEnabled({ OD_DESIGN_TOKEN_CHANNEL: 'true' })).toBe(true);
    expect(isDesignTokenChannelEnabled({ OD_DESIGN_TOKEN_CHANNEL: 'on' })).toBe(true);
    expect(isDesignTokenChannelEnabled({ OD_DESIGN_TOKEN_CHANNEL: '2' })).toBe(true);
    expect(isDesignTokenChannelEnabled({ OD_DESIGN_TOKEN_CHANNEL: 'yes' })).toBe(true);
  });

  it('is true for an empty string (operator typed `=` and forgot the value — fail open, not closed)', () => {
    expect(isDesignTokenChannelEnabled({ OD_DESIGN_TOKEN_CHANNEL: '' })).toBe(true);
  });

  it('is false ONLY for the literal kill-switch value `0`', () => {
    expect(isDesignTokenChannelEnabled({ OD_DESIGN_TOKEN_CHANNEL: '0' })).toBe(false);
  });

  it('is true for whitespace-padded `0` — strict literal match prevents accidental kill-switch tripping', () => {
    expect(isDesignTokenChannelEnabled({ OD_DESIGN_TOKEN_CHANNEL: ' 0' })).toBe(true);
    expect(isDesignTokenChannelEnabled({ OD_DESIGN_TOKEN_CHANNEL: '0 ' })).toBe(true);
  });
});

// Reviewer feedback (lefarcen, PR-D #1544 round 2): the predicate
// suite above pins the env-flag boolean but does NOT exercise the
// server's asset-resolution path that PR-D actually flipped — i.e.
// the seam where the daemon decides whether to read tokens.css /
// components.html from disk and hand them to composeSystemPrompt.
//
// `resolveDesignSystemAssets` IS that seam: server.ts at the
// prompt-assembly site is now a thin caller of this function, so a
// regression that restored the old `=== '1'` semantics, swapped in a
// wrong env name, or silently dropped the asset-read branch flips
// observable behaviour here against real disk fixtures. These tests
// run that whole pipeline (env gate → readDesignSystemAssets per
// root → fallback chain → DesignSystemAssets shape) end-to-end.
describe('resolveDesignSystemAssets (PR-D server-layer asset resolution)', () => {
  it('returns the built-in assets when the channel is enabled (env unset, default-on)', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    const dir = brandDir(builtInRoot, 'sample');
    writeFileSync(path.join(dir, 'tokens.css'), ':root { --bg: #fff; }');
    writeFileSync(path.join(dir, 'components.html'), '<button>btn</button>');

    const assets = await resolveDesignSystemAssets('sample', builtInRoot, userRoot, {});
    expect(assets.tokensCss).toBe(':root { --bg: #fff; }');
    expect(assets.fixtureHtml).toBe('<button>btn</button>');
  });

  it('returns empty (kill switch) when OD_DESIGN_TOKEN_CHANNEL is `0`, even if files are on disk', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    const dir = brandDir(builtInRoot, 'sample');
    writeFileSync(path.join(dir, 'tokens.css'), ':root { --bg: #fff; }');
    writeFileSync(path.join(dir, 'components.html'), '<button>btn</button>');

    const assets = await resolveDesignSystemAssets('sample', builtInRoot, userRoot, {
      OD_DESIGN_TOKEN_CHANNEL: '0',
    });
    expect(assets.tokensCss).toBeUndefined();
    expect(assets.fixtureHtml).toBeUndefined();
  });

  it('still returns the assets under the legacy explicit opt-in `OD_DESIGN_TOKEN_CHANNEL=1`', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    const dir = brandDir(builtInRoot, 'sample');
    writeFileSync(path.join(dir, 'tokens.css'), ':root { --bg: #fff; }');
    writeFileSync(path.join(dir, 'components.html'), '<button>btn</button>');

    const assets = await resolveDesignSystemAssets('sample', builtInRoot, userRoot, {
      OD_DESIGN_TOKEN_CHANNEL: '1',
    });
    expect(assets.tokensCss).toContain('--bg: #fff');
    expect(assets.fixtureHtml).toContain('<button>');
  });

  it('falls back to user-installed root for files missing in built-in (per-file independence)', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    const builtInDir = brandDir(builtInRoot, 'split');
    writeFileSync(path.join(builtInDir, 'tokens.css'), ':root { --bg: built-in; }');
    const userDir = brandDir(userRoot, 'split');
    writeFileSync(path.join(userDir, 'components.html'), '<from-user-installed/>');

    const assets = await resolveDesignSystemAssets('split', builtInRoot, userRoot, {});
    expect(assets.tokensCss).toBe(':root { --bg: built-in; }');
    expect(assets.fixtureHtml).toBe('<from-user-installed/>');
  });

  it('returns the built-in assets verbatim when both files are present built-in (skips the user-installed roundtrip)', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    const dir = brandDir(builtInRoot, 'sample');
    writeFileSync(path.join(dir, 'tokens.css'), ':root { --bg: built-in; }');
    writeFileSync(path.join(dir, 'components.html'), '<from-built-in/>');
    // Plant different content under user-installed root — if the
    // fallback chain mistakenly merges, the test below would catch it.
    const userDir = brandDir(userRoot, 'sample');
    writeFileSync(path.join(userDir, 'tokens.css'), ':root { --bg: user-installed; }');
    writeFileSync(path.join(userDir, 'components.html'), '<from-user-installed/>');

    const assets = await resolveDesignSystemAssets('sample', builtInRoot, userRoot, {});
    expect(assets.tokensCss).toBe(':root { --bg: built-in; }');
    expect(assets.fixtureHtml).toBe('<from-built-in/>');
  });

  it('returns undefined for both fields when the brand ships neither file in either root (legacy ~138-brand fallback)', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    brandDir(builtInRoot, 'prose-only');

    const assets = await resolveDesignSystemAssets('prose-only', builtInRoot, userRoot, {});
    expect(assets.tokensCss).toBeUndefined();
    expect(assets.fixtureHtml).toBeUndefined();
  });

  it('returns undefined for both fields when the brand directory does not exist in either root', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();

    const assets = await resolveDesignSystemAssets('nonexistent', builtInRoot, userRoot, {});
    expect(assets.tokensCss).toBeUndefined();
    expect(assets.fixtureHtml).toBeUndefined();
  });
});

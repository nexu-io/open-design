// The version our one-line DeepSeek Harness installer hands the user and the
// versions the daemon stands behind live in two places that cannot import each
// other: `tools/release/resources/dsh-bootstrap/install-dsh.*` (canonical
// product source) and the agent def in `apps/daemon`. They drifted once already
// — the installers were moved to `0.1.0-rc.8` while the def still named
// `0.1.0-rc.6` as the only supported version, so following our own instructions
// produced an "untested version" warning in Settings on a clean install.
//
// This guard pins the two together across the app boundary: bumping an
// installer without teaching the daemon to accept what it installs fails here.
// Landing still ships byte-identical copies under `apps/landing-page/public/`
// until extraction; identity is frozen in tools/release tests.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

const INSTALL_SH = `${repoRoot}tools/release/resources/dsh-bootstrap/install-dsh.sh`;
const INSTALL_PS1 = `${repoRoot}tools/release/resources/dsh-bootstrap/install-dsh.ps1`;
const AGENT_DEF = `${repoRoot}apps/daemon/src/runtimes/defs/deepseek-harness.ts`;
const PEER_MANIFEST = `${repoRoot}packages/dsh-runtime/package.json`;

function requireMatch(source: string, pattern: RegExp, what: string): string {
  const found = pattern.exec(source);
  const captured = found?.[1];
  if (!captured) throw new Error(`could not read ${what}`);
  return captured;
}

/** The exact versions the daemon declares it has exercised. */
function readSupportedVersions(source: string): string[] {
  const list = requireMatch(
    source,
    /supportedVersions:\s*\[([^\]]*)\]/u,
    'supportedVersions',
  );
  return [...list.matchAll(/'([^']+)'/gu)]
    .map((entry) => entry[1])
    .filter((entry): entry is string => typeof entry === 'string');
}

/**
 * The release line the daemon accepts beyond the exercised list, rebuilt from
 * the literal in source. Absent is a valid answer — it just means the def only
 * accepts exact matches.
 */
function readSupportedVersionPattern(source: string): RegExp | null {
  const found = /supportedVersionPattern:\s*\/(.+?)\/([a-z]*)\s*,/u.exec(source);
  const body = found?.[1];
  const flags = found?.[2];
  if (!body) return null;
  return new RegExp(body, flags ?? '');
}

function accepts(source: string, version: string): boolean {
  if (readSupportedVersions(source).includes(version)) return true;
  return readSupportedVersionPattern(source)?.test(version) ?? false;
}

describe('DeepSeek Harness installer and daemon version policy agree', () => {
  it('accepts the version both installers pin', async () => {
    const [sh, ps1, def] = await Promise.all([
      readFile(INSTALL_SH, 'utf8'),
      readFile(INSTALL_PS1, 'utf8'),
      readFile(AGENT_DEF, 'utf8'),
    ]);

    const shVersion = requireMatch(sh, /DSH_VERSION='([^']+)'/u, 'DSH_VERSION');
    const ps1Version = requireMatch(ps1, /\$DshVersion\s*=\s*'([^']+)'/u, '$DshVersion');

    expect(ps1Version).toBe(shVersion);
    expect(accepts(def, shVersion)).toBe(true);
  });

  // The point is to stop pinning one release candidate, not to stop checking.
  // A version off the line the def declares must still be reported as untested.
  it('still rejects a version off the declared release line', async () => {
    const def = await readFile(AGENT_DEF, 'utf8');

    expect(accepts(def, '0.0.9')).toBe(false);
    expect(accepts(def, 'not-a-version')).toBe(false);
  });
});

/**
 * The peer ranges that track the DeepSeek Harness version, one entry per
 * package.
 *
 * Kept per dependency on purpose. Merging every comparator in the manifest into
 * one table lets a single updated peer vouch for the other four, so a
 * half-finished bump reads as compatible — the exact partial state this file is
 * supposed to catch. `@deepseek-ai/cordis*` is excluded: it has its own version
 * line and never moves with dsh.
 */
function dshPeerRanges(manifestSource: string): Record<string, string> {
  const manifest = JSON.parse(manifestSource) as {
    peerDependencies?: Record<string, string>;
  };
  const peers = manifest.peerDependencies ?? {};
  return Object.fromEntries(
    Object.entries(peers).filter(([name]) => name.startsWith('@deepseek-ai/dsh-')),
  );
}

/**
 * The lowest release candidate one range admits for a given
 * `major.minor.patch`, or undefined when it carries no prerelease comparator
 * for that tuple at all.
 *
 * semver refuses a prerelease unless some comparator shares its exact tuple AND
 * carries a prerelease of its own, so a missing tuple cannot install however
 * high the candidate number.
 */
function prereleaseFloor(range: string, tuple: string): number | undefined {
  let floor: number | undefined;
  for (const match of range.matchAll(/>=(\d+\.\d+\.\d+)-rc\.(\d+)/gu)) {
    if (match[1] !== tuple) continue;
    const candidate = Number(match[2]);
    if (Number.isNaN(candidate)) continue;
    if (floor === undefined || candidate < floor) floor = candidate;
  }
  return floor;
}

/** Installable only when *every* dsh peer admits the version. */
function peerCanInstall(ranges: Record<string, string>, version: string): boolean {
  const parsed = /^(\d+\.\d+\.\d+)-rc\.(\d+)$/u.exec(version);
  if (!parsed) return true; // stable releases need no prerelease comparator
  const tuple = parsed[1];
  const candidate = Number(parsed[2]);
  if (tuple === undefined || Number.isNaN(candidate)) return false;
  const entries = Object.values(ranges);
  if (entries.length === 0) return false;
  return entries.every((range) => {
    const floor = prereleaseFloor(range, tuple);
    return floor !== undefined && candidate >= floor;
  });
}

// Two authorities decide whether a DeepSeek Harness version works, and they can
// disagree silently in the direction that hurts: the daemon suppressing the
// "untested" warning for a version whose companion cannot install is worse than
// the warning, because the user is told everything is fine and then it is not.
//
// Widening the accepted line without widening the peers is exactly how that
// happens, so the matrix runs both sides over the versions upstream has shipped
// or plausibly will.
describe('accepted DeepSeek Harness versions can actually install their companion', () => {
  const MATRIX = [
    '0.1.0-rc.2',
    '0.1.0-rc.3',
    '0.1.0-rc.6',
    '0.1.0-rc.8',
    '0.1.0-rc.12',
    '0.1.1-rc.1',
    '0.1.1-rc.2',
    '0.1.1',
    '0.1.2',
    '0.1.2-rc.1',
    '0.2.0-rc.1',
  ];

  it('never claims support for a version the peer ranges reject', async () => {
    const [def, manifest] = await Promise.all([
      readFile(AGENT_DEF, 'utf8'),
      readFile(PEER_MANIFEST, 'utf8'),
    ]);
    const ranges = dshPeerRanges(manifest);
    expect(Object.keys(ranges).length).toBeGreaterThan(0);

    const overclaimed = MATRIX.filter(
      (version) => accepts(def, version) && !peerCanInstall(ranges, version),
    );

    expect(overclaimed).toEqual([]);
  });

  // The two versions the review named, pinned explicitly so a future widening
  // has to face them rather than quietly passing a filter that matches nothing.
  it('accepts what upstream serves and refuses the line the peers cannot reach', async () => {
    const [def, manifest] = await Promise.all([
      readFile(AGENT_DEF, 'utf8'),
      readFile(PEER_MANIFEST, 'utf8'),
    ]);
    const ranges = dshPeerRanges(manifest);

    expect(accepts(def, '0.1.1-rc.2')).toBe(true);
    expect(peerCanInstall(ranges, '0.1.1-rc.2')).toBe(true);

    expect(peerCanInstall(ranges, '0.1.2-rc.1')).toBe(false);
    expect(accepts(def, '0.1.2-rc.1')).toBe(false);
  });

  // A bump that updates one peer and forgets the rest is the realistic way this
  // goes wrong — and reading the manifest as one blob hides it, because the
  // updated peer's comparator answers for everyone. All five ranges being
  // identical today is a coincidence, not a guarantee.
  it('does not let one updated peer vouch for the others', () => {
    const partial = JSON.stringify({
      peerDependencies: {
        '@deepseek-ai/cordis': '>=4.0.1',
        '@deepseek-ai/dsh-agent': '>=0.1.0-rc.6 || >=0.1.1-rc.0',
        '@deepseek-ai/dsh-llm': '>=0.1.0-rc.6',
        '@deepseek-ai/dsh-session': '>=0.1.0-rc.6',
      },
    });
    const ranges = dshPeerRanges(partial);

    expect(Object.keys(ranges)).not.toContain('@deepseek-ai/cordis');
    expect(peerCanInstall(ranges, '0.1.1-rc.2')).toBe(false);
    expect(peerCanInstall(ranges, '0.1.0-rc.8')).toBe(true);
  });

  // The floor is part of the contract, not just the tuple.
  it('respects each range\'s own floor', () => {
    const ranges = { '@deepseek-ai/dsh-agent': '>=0.1.0-rc.6' };

    expect(peerCanInstall(ranges, '0.1.0-rc.6')).toBe(true);
    expect(peerCanInstall(ranges, '0.1.0-rc.3')).toBe(false);
  });
});

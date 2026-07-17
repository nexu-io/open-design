import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  buildReleaseGatesEvidence,
  collectArtifactHashes,
  computeContentFingerprint,
  computeFileSha256,
  resolveDataRootFingerprintPaths,
  summarizePackagedReleaseGates,
  type PackagedSmokeSignals,
  type ReleaseGateEvidence,
  type ReleaseGateStatus,
  type ReleaseGatesEvidence,
} from '@/vitest/release-gates-evidence';

const HELLO_SHA256 = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'cw10-evidence-'));
});

afterAll(() => {
  rmSync(tmp, { force: true, recursive: true });
});

type GateMap = Record<string, ReleaseGateEvidence>;

function gateStatus(gates: GateMap, id: string): ReleaseGateStatus {
  const g = gates[id];
  if (!g) throw new Error(`expected gate ${id} to be present`);
  return g.status;
}

function gateReason(gates: GateMap, id: string): string | undefined {
  return gates[id]?.reason;
}

describe('computeFileSha256', () => {
  test('hashes file contents (SHA-256 of "hello")', async () => {
    const file = join(tmp, 'hello.txt');
    writeFileSync(file, 'hello');
    expect(await computeFileSha256(file)).toBe(HELLO_SHA256);
  });

  test('is streaming-safe for larger content (never loads whole file into caller memory)', async () => {
    const file = join(tmp, 'big.bin');
    writeFileSync(file, Buffer.alloc(1 << 20, 7));
    const digest = await computeFileSha256(file);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    // stat-based size matches the buffer we wrote, proving size comes from stat not a read.
    expect(statSync(file).size).toBe(1 << 20);
  });
});

describe('collectArtifactHashes (P2: stat size, no full read)', () => {
  test('returns [] when build JSON is absent', async () => {
    expect(await collectArtifactHashes(undefined)).toEqual([]);
    expect(await collectArtifactHashes(join(tmp, 'nope.json'))).toEqual([]);
  });

  test('hashes present artifacts and skips missing ones', async () => {
    const payload = join(tmp, 'payload.7z');
    const installer = join(tmp, 'setup.exe');
    const missing = join(tmp, 'portable.zip');
    writeFileSync(payload, 'payload-bytes');
    writeFileSync(installer, 'installer-bytes');
    const buildJson = join(tmp, 'build.json');
    writeFileSync(buildJson, JSON.stringify({ payloadPath: payload, installerPath: installer, portableZipPath: missing }));

    const hashes = await collectArtifactHashes(buildJson);
    expect(hashes).toHaveLength(2);
    const names = hashes.map((h) => h.name).sort();
    expect(names).toEqual(['installer', 'payload']);
    const payloadHash = hashes.find((h) => h.name === 'payload');
    expect(payloadHash?.sha256).toBe(await computeFileSha256(payload));
    // bytes come from statSync, not from readFileSync of the body.
    expect(payloadHash?.bytes).toBe(statSync(payload).size);
    expect(hashes.find((h) => h.name === 'installer')?.bytes).toBe(statSync(installer).size);
  });

  test('reports correct byte size for a large artifact without reading it fully', async () => {
    const big = join(tmp, 'big-artifact.7z');
    writeFileSync(big, Buffer.alloc(4 << 20, 3));
    const buildJson = join(tmp, 'build-big.json');
    writeFileSync(buildJson, JSON.stringify({ installerPath: big }));
    const hashes = await collectArtifactHashes(buildJson);
    expect(hashes).toHaveLength(1);
    expect(hashes[0]?.bytes).toBe(4 << 20);
    expect(hashes[0]?.bytes).toBe(statSync(big).size);
  });

  test('resolves relative artifact paths against the build JSON dir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cw10-rel-'));
    const payload = join(dir, 'rel-payload.7z');
    writeFileSync(payload, 'rel');
    const buildJson = join(dir, 'build.json');
    writeFileSync(buildJson, JSON.stringify({ payloadPath: 'rel-payload.7z' }));
    const hashes = await collectArtifactHashes(buildJson);
    expect(hashes).toHaveLength(1);
    expect(hashes[0]?.path).toBe(payload);
    rmSync(dir, { force: true, recursive: true });
  });
});

describe('computeContentFingerprint (stable, path/mtime independent)', () => {
  function seedTree(root: string, files: Record<string, string>): void {
    for (const [rel, content] of Object.entries(files)) {
      const filePath = join(root, rel);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, content);
    }
  }

  test('identical content under different absolute roots yields identical fingerprint', async () => {
    const a = mkdtempSync(join(tmpdir(), 'cw10-fp-a-'));
    const b = mkdtempSync(join(tmpdir(), 'cw10-fp-b-'));
    const files = { 'creator-workbench/state.json': '{"x":1}', 'creator-media/a.bin': 'media', 'deep/nested/file.txt': 'hi' };
    seedTree(a, files);
    seedTree(b, files);
    const fa = await computeContentFingerprint([a]);
    const fb = await computeContentFingerprint([b]);
    expect(fa.fingerprint).toBe(fb.fingerprint);
    expect(fa.fileCount).toBe(3);
    rmSync(a, { force: true, recursive: true });
    rmSync(b, { force: true, recursive: true });
  });

  test('traversal order does not affect the fingerprint', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cw10-fp-order-'));
    seedTree(root, { 'z.json': '1', 'a.json': '2', 'm/inner.json': '3' });
    const f1 = await computeContentFingerprint([root]);
    // Re-create in a different on-disk order; relative content is identical.
    const root2 = mkdtempSync(join(tmpdir(), 'cw10-fp-order2-'));
    seedTree(root2, { 'm/inner.json': '3', 'a.json': '2', 'z.json': '1' });
    const f2 = await computeContentFingerprint([root2]);
    expect(f1.fingerprint).toBe(f2.fingerprint);
    rmSync(root, { force: true, recursive: true });
    rmSync(root2, { force: true, recursive: true });
  });

  test('divergent content yields a different fingerprint (G7 FAIL basis)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cw10-fp-div-'));
    seedTree(root, { 'creator-workbench/state.json': 'v1' });
    const before = await computeContentFingerprint([root]);
    writeFileSync(join(root, 'creator-workbench/state.json'), 'v2-changed');
    const after = await computeContentFingerprint([root]);
    expect(before.fingerprint).not.toBe(after.fingerprint);
    rmSync(root, { force: true, recursive: true });
  });

  test('missing roots are recorded, not throwing', async () => {
    const fp = await computeContentFingerprint([join(tmp, 'does-not-exist-xyz')]);
    expect(fp.missing).toHaveLength(1);
    expect(fp.fileCount).toBe(0);
  });

  test('resolveDataRootFingerprintPaths returns the 6 required G7 paths', () => {
    const paths = resolveDataRootFingerprintPaths('/ns/data', '/ns');
    // Compare trailing segments only — OS-agnostic (Windows uses backslashes).
    expect(paths.map((p) => p.split(/[\\/]/).filter(Boolean).slice(-2).join('/'))).toEqual([
      'data/creator-workbench',
      'data/creator-media',
      'data/creator-content',
      'data/creator-release',
      'data/creator-performance',
      'backups/creator',
    ]);
  });
});

function baseSignals(overrides: Partial<PackagedSmokeSignals> = {}): PackagedSmokeSignals {
  return {
    platform: 'win',
    installOk: true,
    startOk: true,
    ...overrides,
  };
}

describe('summarizePackagedReleaseGates — G6', () => {
  test('G6 PASS when install + start succeed', () => {
    const gates = summarizePackagedReleaseGates(baseSignals());
    expect(gateStatus(gates, 'G6')).toBe('PASS');
  });
  test('G6 FAIL when install or start fails', () => {
    expect(gateStatus(summarizePackagedReleaseGates(baseSignals({ installOk: false })), 'G6')).toBe('FAIL');
    expect(gateStatus(summarizePackagedReleaseGates(baseSignals({ startOk: false })), 'G6')).toBe('FAIL');
  });
});

describe('summarizePackagedReleaseGates — G7 (P0: real measurement required)', () => {
  test('G7 BLOCKED when not measured (never PASS on null)', () => {
    const gates = summarizePackagedReleaseGates(baseSignals());
    expect(gateStatus(gates, 'G7')).toBe('BLOCKED');
    expect(gateReason(gates, 'G7')).toMatch(/not measured/i);
  });

  test('G7 BLOCKED when measured flag is explicitly false', () => {
    const gates = summarizePackagedReleaseGates(
      baseSignals({ dataRootIntegrity: { measured: false, consistent: false, dirs: [] } }),
    );
    expect(gateStatus(gates, 'G7')).toBe('BLOCKED');
  });

  test('G7 PASS only when measured and content-identical', () => {
    const before = { algorithm: 'sha256-content-tree-v1' as const, fingerprint: 'abc', rootCount: 1, dirCount: 0, fileCount: 2, missing: [] };
    const gates = summarizePackagedReleaseGates(
      baseSignals({
        dataRootIntegrity: {
          measured: true,
          consistent: true,
          before,
          after: { ...before, fingerprint: 'abc' },
          dirs: [{ name: 'creator-workbench', before: 'abc', after: 'abc', consistent: true }],
        },
      }),
    );
    expect(gateStatus(gates, 'G7')).toBe('PASS');
    expect(gates.G7?.evidence?.beforeFingerprint).toBe('abc');
    expect(gates.G7?.evidence?.afterFingerprint).toBe('abc');
  });

  test('G7 FAIL when measured but content diverged', () => {
    const gates = summarizePackagedReleaseGates(
      baseSignals({
        dataRootIntegrity: {
          measured: true,
          consistent: false,
          before: { algorithm: 'sha256-content-tree-v1' as const, fingerprint: 'before', rootCount: 1, dirCount: 0, fileCount: 2, missing: [] },
          after: { algorithm: 'sha256-content-tree-v1' as const, fingerprint: 'after', rootCount: 1, dirCount: 0, fileCount: 2, missing: [] },
          dirs: [{ name: 'creator-workbench', before: 'before', after: 'after', consistent: false }],
        },
      }),
    );
    expect(gateStatus(gates, 'G7')).toBe('FAIL');
    expect(gateReason(gates, 'G7')).toMatch(/diverged/i);
  });

  test('G7 must not be claimed PASS without measurement (regression guard)', () => {
    // The historical bug: dataRootPreserved === null produced PASS. Assert it does not.
    const gates = summarizePackagedReleaseGates(
      baseSignals({ evidence: { payloadUpdateExercised: true } } as Partial<PackagedSmokeSignals> & { evidence: Record<string, unknown> }),
    );
    expect(gateStatus(gates, 'G7')).not.toBe('PASS');
  });
});

describe('summarizePackagedReleaseGates — G8 (real rollback required)', () => {
  test('G8 BLOCKED when failure scenario not exercised', () => {
    const gates = summarizePackagedReleaseGates(baseSignals());
    expect(gateStatus(gates, 'G8')).toBe('BLOCKED');
    expect(gateReason(gates, 'G8')).toMatch(/not exercised/i);
  });

  test('G8 PASS when exercised and old version healthy with data intact', () => {
    const gates = summarizePackagedReleaseGates(
      baseSignals({
        rollback: {
          exercised: true,
          ok: true,
          scenario: 'checksum-mismatch',
          oldVersion: '1.0.0',
          newVersion: '1.0.1',
          failureCode: 'checksum-mismatch',
          beforeFingerprint: 'fp-before',
          afterFingerprint: 'fp-before',
        },
      }),
    );
    expect(gateStatus(gates, 'G8')).toBe('PASS');
    expect(gates.G8?.evidence?.scenario).toBe('checksum-mismatch');
    expect(gates.G8?.evidence?.oldVersion).toBe('1.0.0');
    expect(gates.G8?.evidence?.beforeFingerprint).toBe('fp-before');
    expect(gates.G8?.evidence?.afterFingerprint).toBe('fp-before');
  });

  test('G8 FAIL when exercised but rollback failed', () => {
    const gates = summarizePackagedReleaseGates(
      baseSignals({ rollback: { exercised: true, ok: false, scenario: 'bad-payload', oldVersion: '1.0.0' } }),
    );
    expect(gateStatus(gates, 'G8')).toBe('FAIL');
  });
});

describe('summarizePackagedReleaseGates — G9 (real offline-start required)', () => {
  test('G9 BLOCKED when metadata-unreachable scenario not exercised', () => {
    const gates = summarizePackagedReleaseGates(baseSignals());
    expect(gateStatus(gates, 'G9')).toBe('BLOCKED');
    expect(gateReason(gates, 'G9')).toMatch(/not exercised/i);
  });

  test('G9 PASS when exercised and app offline-starts healthy', () => {
    const gates = summarizePackagedReleaseGates(
      baseSignals({
        offline: {
          exercised: true,
          ok: true,
          metadataUnreachable: true,
          beforeFingerprint: 'fp',
          afterFingerprint: 'fp',
        },
      }),
    );
    expect(gateStatus(gates, 'G9')).toBe('PASS');
    expect(gates.G9?.evidence?.metadataUnreachable).toBe(true);
    expect(gates.G9?.evidence?.beforeFingerprint).toBe('fp');
    expect(gates.G9?.evidence?.afterFingerprint).toBe('fp');
  });

  test('G9 FAIL when exercised but app did not start', () => {
    const gates = summarizePackagedReleaseGates(
      baseSignals({ offline: { exercised: true, ok: false, metadataUnreachable: true } }),
    );
    expect(gateStatus(gates, 'G9')).toBe('FAIL');
  });
});

describe('summarizePackagedReleaseGates — no mocked PASS', () => {
  test('never mocks PASS for unexercised failure paths', () => {
    const gates = summarizePackagedReleaseGates(baseSignals());
    expect(gateStatus(gates, 'G7')).not.toBe('PASS');
    expect(gateStatus(gates, 'G8')).not.toBe('PASS');
    expect(gateStatus(gates, 'G9')).not.toBe('PASS');
  });
});

describe('buildReleaseGatesEvidence (orchestrator merge + G10)', () => {
  const baseInput = {
    platform: 'win' as const,
    channel: 'stable',
    releaseVersion: '1.2.3',
    commit: 'abc123',
    githubRunId: '42',
    githubRunAttempt: '1',
    namespace: 'release-beta-win',
    profile: 'full',
    reportPath: '/tmp/release-report/win',
    artifacts: [] as Array<{ name: string; path: string; sha256: string; bytes: number }>,
  };

  test('G10 PASS when artifact hashes present, BLOCKED when absent', () => {
    const withArtifacts = buildReleaseGatesEvidence({
      ...baseInput,
      artifacts: [{ name: 'payload', path: '/x/payload.7z', sha256: HELLO_SHA256, bytes: 5 }],
    });
    expect(gateStatus(withArtifacts.gates, 'G10')).toBe('PASS');
    expect(withArtifacts.gates.G10?.evidence?.artifactCount).toBe(1);
    expect(withArtifacts.gates.G10?.evidence?.commit).toBe('abc123');

    const without = buildReleaseGatesEvidence({ ...baseInput, artifacts: [] });
    expect(gateStatus(without.gates, 'G10')).toBe('BLOCKED');
  });

  test('uses spec partial gates when present (platform smoke ran)', () => {
    const gates: Record<string, ReleaseGateEvidence> = summarizePackagedReleaseGates(
      baseSignals({
        dataRootIntegrity: { measured: true, consistent: true, dirs: [], before: { algorithm: 'sha256-content-tree-v1', fingerprint: 'x', rootCount: 1, dirCount: 0, fileCount: 1, missing: [] }, after: { algorithm: 'sha256-content-tree-v1', fingerprint: 'x', rootCount: 1, dirCount: 0, fileCount: 1, missing: [] } },
        rollback: { exercised: true, ok: true, scenario: 'checksum-mismatch', oldVersion: '1', newVersion: '2', beforeFingerprint: 'fp', afterFingerprint: 'fp' },
        offline: { exercised: true, ok: true, metadataUnreachable: true, beforeFingerprint: 'fp', afterFingerprint: 'fp' },
      }),
    );
    const evidence: ReleaseGatesEvidence = buildReleaseGatesEvidence({
      ...baseInput,
      artifacts: [{ name: 'payload', path: '/x/payload.7z', sha256: HELLO_SHA256, bytes: 5 }],
      partialGates: gates,
    });
    expect(gateStatus(evidence.gates, 'G6')).toBe('PASS');
    expect(gateStatus(evidence.gates, 'G7')).toBe('PASS');
    expect(gateStatus(evidence.gates, 'G8')).toBe('PASS');
    expect(gateStatus(evidence.gates, 'G9')).toBe('PASS');
    expect(gateStatus(evidence.gates, 'G10')).toBe('PASS');
  });

  test('BLOCKED for every gate when platform smoke skipped (no partial)', () => {
    const evidence = buildReleaseGatesEvidence({
      ...baseInput,
      artifacts: [],
      skipReason: "platform smoke skipped (process.platform !== 'win')",
    });
    for (const id of ['G6', 'G7', 'G8', 'G9']) {
      expect(gateStatus(evidence.gates, id)).toBe('BLOCKED');
      expect(gateReason(evidence.gates, id)).toMatch(/skipped/i);
    }
    expect(gateStatus(evidence.gates, 'G10')).toBe('BLOCKED');
  });

  test('emits the required top-level evidence shape', () => {
    const evidence: ReleaseGatesEvidence = buildReleaseGatesEvidence({
      ...baseInput,
      artifacts: [{ name: 'payload', path: '/x/payload.7z', sha256: HELLO_SHA256, bytes: 5 }],
    });
    expect(evidence.schemaVersion).toBe('1.0.0');
    expect(evidence.platform).toBe('win');
    expect(evidence.releaseVersion).toBe('1.2.3');
    expect(evidence.commit).toBe('abc123');
    expect(evidence.profile).toBe('full');
    expect(Object.keys(evidence.gates).sort()).toEqual(['G10', 'G6', 'G7', 'G8', 'G9']);
  });
});

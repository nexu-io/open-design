import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  buildReleaseGatesEvidence,
  collectArtifactHashes,
  computeFileSha256,
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

  test('is streaming-safe for larger content', async () => {
    const file = join(tmp, 'big.bin');
    writeFileSync(file, Buffer.alloc(1 << 20, 7));
    const digest = await computeFileSha256(file);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('collectArtifactHashes', () => {
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

function baseSignals(overrides: Partial<PackagedSmokeSignals> = {}): PackagedSmokeSignals {
  return {
    platform: 'win',
    installOk: true,
    startOk: true,
    payloadUpdateExercised: false,
    payloadUpdateOk: false,
    dataRootPreserved: null,
    rollbackExercised: false,
    rollbackOk: null,
    offlineStartExercised: false,
    offlineStartOk: null,
    ...overrides,
  };
}

describe('summarizePackagedReleaseGates (G6–G9)', () => {
  test('G6 PASS when install + start succeed', () => {
    const gates = summarizePackagedReleaseGates(baseSignals());
    expect(gateStatus(gates, 'G6')).toBe('PASS');
  });

  test('G6 FAIL when install or start fails', () => {
    const gates = summarizePackagedReleaseGates(baseSignals({ installOk: false }));
    expect(gateStatus(gates, 'G6')).toBe('FAIL');
    const gates2 = summarizePackagedReleaseGates(baseSignals({ startOk: false }));
    expect(gateStatus(gates2, 'G6')).toBe('FAIL');
  });

  test('G7 PASS when upgrade ran and health ok (content hash not measured)', () => {
    const gates = summarizePackagedReleaseGates(
      baseSignals({ payloadUpdateExercised: true, payloadUpdateOk: true, dataRootPreserved: null }),
    );
    expect(gateStatus(gates, 'G7')).toBe('PASS');
  });

  test('G7 FAIL when dataRoot diverged across upgrade', () => {
    const gates = summarizePackagedReleaseGates(
      baseSignals({ payloadUpdateExercised: true, payloadUpdateOk: true, dataRootPreserved: false }),
    );
    expect(gateStatus(gates, 'G7')).toBe('FAIL');
  });

  test('G7 BLOCKED when no upgrade exercised in profile', () => {
    const gates = summarizePackagedReleaseGates(baseSignals({ payloadUpdateExercised: false }));
    expect(gateStatus(gates, 'G7')).toBe('BLOCKED');
    expect(gateReason(gates, 'G7')).toMatch(/no upgrade exercised/i);
  });

  test('G8 PASS on exercised + successful rollback, BLOCKED otherwise', () => {
    const ok = summarizePackagedReleaseGates(baseSignals({ rollbackExercised: true, rollbackOk: true }));
    expect(gateStatus(ok, 'G8')).toBe('PASS');
    const fail = summarizePackagedReleaseGates(baseSignals({ rollbackExercised: true, rollbackOk: false }));
    expect(gateStatus(fail, 'G8')).toBe('FAIL');
    const skipped = summarizePackagedReleaseGates(baseSignals({ rollbackExercised: false }));
    expect(gateStatus(skipped, 'G8')).toBe('BLOCKED');
    expect(gateReason(skipped, 'G8')).toMatch(/failure-path/i);
  });

  test('G9 PASS on exercised + successful offline start, BLOCKED otherwise', () => {
    const ok = summarizePackagedReleaseGates(baseSignals({ offlineStartExercised: true, offlineStartOk: true }));
    expect(gateStatus(ok, 'G9')).toBe('PASS');
    const fail = summarizePackagedReleaseGates(baseSignals({ offlineStartExercised: true, offlineStartOk: false }));
    expect(gateStatus(fail, 'G9')).toBe('FAIL');
    const skipped = summarizePackagedReleaseGates(baseSignals({ offlineStartExercised: false }));
    expect(gateStatus(skipped, 'G9')).toBe('BLOCKED');
  });

  test('never mocks PASS for unexercised failure paths', () => {
    const gates = summarizePackagedReleaseGates(baseSignals());
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
    const evidence: ReleaseGatesEvidence = buildReleaseGatesEvidence({
      ...baseInput,
      artifacts: [{ name: 'payload', path: '/x/payload.7z', sha256: HELLO_SHA256, bytes: 5 }],
      partialGates: {
        G6: { id: 'G6', title: 'cold-start install success', status: 'PASS' },
        G7: { id: 'G7', title: 't', status: 'PASS' },
        G8: { id: 'G8', title: 't', status: 'BLOCKED', reason: 'failure-path not exercised' },
        G9: { id: 'G9', title: 't', status: 'BLOCKED', reason: 'metadata-unreachable not exercised' },
      },
    });
    expect(gateStatus(evidence.gates, 'G6')).toBe('PASS');
    expect(gateStatus(evidence.gates, 'G7')).toBe('PASS');
    expect(gateStatus(evidence.gates, 'G8')).toBe('BLOCKED');
    expect(gateStatus(evidence.gates, 'G9')).toBe('BLOCKED');
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

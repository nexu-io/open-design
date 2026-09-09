import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  OD_NEXT_RUNTIME_CAPABILITY_EVIDENCE_V1_SCHEMA,
  RuntimeCapabilityFixtureManifestV1Schema,
  type RuntimeCapabilityFixtureManifestV1,
  type RuntimeCapabilityRegistryEntryV1,
} from '@open-design/contracts';
import {
  CODEX_0_147_0_BEST_EFFORT_MANIFEST,
  CLAUDE_2_1_233_BEST_EFFORT_MANIFEST,
  OD_NEXT_RUNTIME_CAPABILITY_REGISTRY,
  OD_NEXT_RUNTIME_CAPABILITY_FIXTURE_MANIFESTS,
  OPENCODE_1_18_18_BEST_EFFORT_MANIFEST,
  OD_NEXT_RUNTIME_PATH_DESCRIPTORS,
  VELA_OPENCODE_LOCAL_BEST_EFFORT_MANIFEST,
  VELA_PI_LOCAL_BEST_EFFORT_MANIFEST,
  VELA_SINGLE_AGENT_BEST_EFFORT_MANIFESTS,
  evaluateOdNextAdmissionEligibility,
  evaluateOdNextExecutionEligibility,
  hashRuntimeCapabilityFixtureManifestV1,
  resolveBundledOdNextRuntimeCapability,
  resolveOdNextRuntimeCapability,
} from '../../src/runtimes/od-next-capability-gate.js';
import { getAgentDef } from '../../src/runtimes/registry.js';

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'od-next-runtime-capabilities',
);

const fixtureFiles = [
  'codex.contract.json',
  'claude-code.contract.json',
  'native-opencode.contract.json',
  'vela-opencode.contract.json',
] as const;

function readFixture(name: typeof fixtureFiles[number]): RuntimeCapabilityFixtureManifestV1 {
  return RuntimeCapabilityFixtureManifestV1Schema.parse(
    JSON.parse(readFileSync(join(fixtureDir, name), 'utf8')),
  );
}

function collectObjectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectObjectKeys(item, keys);
  } else if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      keys.push(key);
      collectObjectKeys(nested, keys);
    }
  }
  return keys;
}

function resolutionInput(manifest: RuntimeCapabilityFixtureManifestV1) {
  return {
    agentId: manifest.agentId,
    agentCliVersion: 'test-cli/1.2.3',
    fixtureVersion: manifest.fixtureVersion,
    fixtureManifest: manifest,
    capturedAt: 1,
    ...(manifest.runtimeCompanionName
      ? {
          runtimeCompanionName: manifest.runtimeCompanionName,
          runtimeCompanionVersion: 'test-companion/4.5.6',
        }
      : {}),
  };
}

function syntheticManifest(
  manifest: RuntimeCapabilityFixtureManifestV1,
): RuntimeCapabilityFixtureManifestV1 {
  return RuntimeCapabilityFixtureManifestV1Schema.parse({
    ...manifest,
    agentCliVersion: 'test-cli/1.2.3',
    ...(manifest.runtimeCompanionName
      ? { runtimeCompanionVersion: 'test-companion/4.5.6' }
      : {}),
    provenance: {
      kind: 'test_synthetic',
      reason: 'deterministic exact tuple gate test',
    },
  });
}

function syntheticEntry(
  manifest: RuntimeCapabilityFixtureManifestV1,
): RuntimeCapabilityRegistryEntryV1 {
  return {
    runtimePath: manifest.runtimePath,
    agentId: manifest.agentId,
    recordedAgentCliVersion: manifest.agentCliVersion ?? 'test-cli/1.2.3',
    runtimeAdapterVersion: manifest.runtimeAdapterVersion,
    ...(manifest.runtimeCompanionName
      ? {
          recordedRuntimeCompanionName: manifest.runtimeCompanionName,
          recordedRuntimeCompanionVersion: manifest.runtimeCompanionVersion,
        }
      : {}),
    fixtureVersion: manifest.fixtureVersion,
    fixtureHash: hashRuntimeCapabilityFixtureManifestV1(manifest),
    evidence: {
      schema: OD_NEXT_RUNTIME_CAPABILITY_EVIDENCE_V1_SCHEMA,
      source: 'test_synthetic',
      nativeSessionContinuation: { support: 'advertised', evidenceLevel: 'L0' },
      nativeSubagents: { support: 'advertised', evidenceLevel: 'L1' },
      caseResults: manifest.cases.map(({ id }) => ({ id, outcome: 'passed' })),
    },
  };
}

describe('OD Next runtime capability gate', () => {
  it('admits Pi continuation for simple work without borrowing OpenCode child evidence', () => {
    const capability = resolveBundledOdNextRuntimeCapability({
      agentId: 'amr', amrRuntime: 'pi', agentCliVersion: '0.0.1-test.pi.98057bb',
      // The existing generic Vela version probe reports its bundled OpenCode.
      runtimeCompanionName: 'opencode', runtimeCompanionVersion: '1.18.18',
    });
    expect(capability.reason).toBe('capability_resolved');
    expect(capability.snapshot).toMatchObject({
      runtimePath: 'vela-pi',
      recordedRuntimeCompanionName: 'pi', recordedRuntimeCompanionVersion: '0.85.1',
      nativeSessionContinuation: { support: 'verified' },
      nativeSubagents: { support: 'unknown' },
    });
    expect(capability.snapshot?.runtimeCompanionName).toBeUndefined();
    expect(evaluateOdNextAdmissionEligibility(capability.snapshot!).eligible).toBe(true);
    expect(evaluateOdNextExecutionEligibility(capability.snapshot!, 'simple').eligible).toBe(true);
    expect(evaluateOdNextExecutionEligibility(capability.snapshot!, 'complex')).toEqual({
      eligible: false, reason: 'native_subagents_not_verified',
    });
  });

  it('keeps Pi admission evidence tied to the real adapter replay and its unavailable child cases', () => {
    const seed = JSON.parse(readFileSync(
      join(fixtureDir, 'vela-pi-0.85.1.sanitized-real-seed.json'), 'utf8',
    )) as { recordingDigest: string; cases: Array<{ caseId: string; outcome: string }> };
    const digest = `sha256:${createHash('sha256').update(JSON.stringify(seed.cases)).digest('hex')}`;
    expect(seed.recordingDigest).toBe(digest);
    expect(VELA_PI_LOCAL_BEST_EFFORT_MANIFEST.provenance).toMatchObject({
      kind: 'sanitized_real', recordingDigest: digest,
    });
    expect(seed.cases.map(({ caseId }) => caseId)).toEqual(
      VELA_PI_LOCAL_BEST_EFFORT_MANIFEST.cases.map(({ id }) => id),
    );
    const entry = OD_NEXT_RUNTIME_CAPABILITY_REGISTRY.find(({ runtimePath }) => runtimePath === 'vela-pi')!;
    expect(entry.evidence.caseResults).toEqual(seed.cases.map(({ caseId, outcome }) => ({ id: caseId, outcome })));
    expect(seed.cases.filter(({ outcome }) => outcome === 'unavailable').map(({ caseId }) => caseId)).toEqual([
      'child_success', 'child_failure_parent_recovers',
    ]);
  });
  it.each(['codex', 'claude', 'dsh'] as const)('admits verified AMR %s continuation without borrowing OpenCode child evidence', (runtime) => {
    const capability = resolveBundledOdNextRuntimeCapability({
      agentId: 'amr', amrRuntime: runtime, agentCliVersion: '0.0.1-test.matrix-six.g344e0f361ae6',
      runtimeCompanionName: 'opencode', runtimeCompanionVersion: '1.18.18',
    });
    expect(capability.reason).toBe('capability_resolved');
    expect(capability.snapshot).toMatchObject({
      runtimePath: `vela-${runtime}`, recordedRuntimeCompanionName: runtime,
      nativeSessionContinuation: { support: 'verified', evidenceLevel: 'L0' },
      nativeSubagents: { support: 'unknown', evidenceLevel: 'L0' },
    });
    expect(capability.snapshot?.runtimeCompanionName).toBeUndefined();
    expect(evaluateOdNextAdmissionEligibility(capability.snapshot!).eligible).toBe(true);
    expect(evaluateOdNextExecutionEligibility(capability.snapshot!, 'complex')).toEqual({ eligible: false, reason: 'native_subagents_not_verified' });
  });
  it.each([
    { runtime: 'opencode' as const, companionVersion: '0.0.0--202609020336' },
    { runtime: 'pi' as const, companionVersion: '0.85.1' },
  ])('uses the installed new $runtime tuple with its own simple-only evidence', ({ runtime, companionVersion }) => {
    const capability = resolveBundledOdNextRuntimeCapability({
      agentId: 'amr', amrRuntime: runtime, agentCliVersion: '0.0.1-test.matrix-six.g344e0f361ae6',
      runtimeCompanionName: runtime, runtimeCompanionVersion: companionVersion,
    });
    expect(capability.reason).toBe('capability_resolved');
    expect(capability.snapshot).toMatchObject({
      recordedAgentCliVersion: '0.0.1-test.matrix-six.g344e0f361ae6',
      recordedRuntimeCompanionName: runtime, recordedRuntimeCompanionVersion: companionVersion,
      nativeSessionContinuation: { support: 'verified' }, nativeSubagents: { support: 'unknown' },
    });
    expect(evaluateOdNextAdmissionEligibility(capability.snapshot!).eligible).toBe(true);
    expect(evaluateOdNextExecutionEligibility(capability.snapshot!, 'complex')).toEqual({ eligible: false, reason: 'native_subagents_not_verified' });
    expect(evaluateOdNextAdmissionEligibility({ ...capability.snapshot!, agentId: 'claude' }).eligible).toBe(false);
  });
  it('keeps direct-model execution outside OD Next until its text-artifact strategy is verified', () => {
    const capability = resolveBundledOdNextRuntimeCapability({ agentId: 'amr', amrRuntime: 'none' });
    expect(capability.reason).toBe('runtime_out_of_scope');
    expect(capability.snapshot).toBeNull();
  });
  it.each(['opencode', 'pi', 'codex', 'claude', 'dsh', 'none'] as const)('records actual %s HTTP/ACP observations independently of declared outcomes', (runtime) => {
    const seed = JSON.parse(readFileSync(join(fixtureDir, `vela-${runtime}-six-local.sanitized-real-seed.json`), 'utf8'));
    const digest = `sha256:${createHash('sha256').update(JSON.stringify(seed.observations)).digest('hex')}`;
    expect(seed.recordingDigest).toBe(digest);
    expect(seed.observations.some((observation: { channel: string }) => observation.channel === 'http_request')).toBe(true);
    expect(seed.observations.some((observation: { channel: string }) => observation.channel === 'acp_response')).toBe(true);
    expect(seed.cases.filter(({ caseId }: { caseId: string }) => caseId.startsWith('child_')).every(({ outcome }: { outcome: string }) => outcome === 'unavailable')).toBe(true);
    if (runtime === 'none') {
      expect(seed.executionSemantics).toBe('amr_model_text_artifact');
      expect(seed.cases.find(({ caseId }: { caseId: string }) => caseId === 'tool').outcome).toBe('unavailable');
    }
    const manifest = VELA_SINGLE_AGENT_BEST_EFFORT_MANIFESTS.find((entry) => entry.runtimePath === `vela-${runtime}`);
    if (manifest) {
      expect(manifest.provenance).toMatchObject({ kind: 'sanitized_real', recordingDigest: digest });
      expect(manifest.agentCliVersion).toBe(seed.velaVersion);
      expect(manifest.runtimeCompanionVersion).toBe(seed.companionVersion);
      const entry = OD_NEXT_RUNTIME_CAPABILITY_REGISTRY.find((entry) => entry.fixtureVersion === manifest.fixtureVersion)!;
      expect(entry.evidence.caseResults).toEqual(seed.cases.map(({ caseId, outcome }: { caseId: string; outcome: string }) => ({ id: caseId, outcome })));
    }
  });
  it('binds initial path descriptors to existing runtime definitions without changing detection', () => {
    for (const descriptor of OD_NEXT_RUNTIME_PATH_DESCRIPTORS) {
      expect(getAgentDef(descriptor.agentId)?.id).toBe(descriptor.agentId);
    }
  });

  it('registers every reviewed tuple, Vela included', () => {
    expect(OD_NEXT_RUNTIME_CAPABILITY_REGISTRY).toHaveLength(10);
    expect(OD_NEXT_RUNTIME_CAPABILITY_FIXTURE_MANIFESTS).toEqual([
      CODEX_0_147_0_BEST_EFFORT_MANIFEST,
      CLAUDE_2_1_233_BEST_EFFORT_MANIFEST,
      OPENCODE_1_18_18_BEST_EFFORT_MANIFEST,
      VELA_OPENCODE_LOCAL_BEST_EFFORT_MANIFEST,
      VELA_PI_LOCAL_BEST_EFFORT_MANIFEST,
      ...VELA_SINGLE_AGENT_BEST_EFFORT_MANIFESTS,
    ]);
    const manifests = fixtureFiles.map(readFixture);
    expect(manifests.map((manifest) => manifest.runtimePath)).toEqual(
      OD_NEXT_RUNTIME_PATH_DESCRIPTORS.filter(descriptor => !('admissionMode' in descriptor)).map((descriptor) => descriptor.runtimePath),
    );

    for (const manifest of manifests) {
      expect(collectObjectKeys(manifest)).not.toEqual(expect.arrayContaining([
        'prompt',
        'path',
        'cwd',
        'secret',
        'token',
        'userInput',
      ]));
      expect(JSON.stringify(manifest)).not.toMatch(
        /\/Users\/|\/home\/|BEGIN [A-Z ]+PRIVATE KEY|sk-[A-Za-z0-9]/u,
      );
      const resolved = resolveOdNextRuntimeCapability(resolutionInput(manifest));
      expect(resolved).toMatchObject({
        includedInInitialRollout: true,
        tupleMatched: false,
        reason: 'x1_runtime_fixture_missing',
        snapshot: {
          runtimePath: manifest.runtimePath,
          nativeSessionContinuation: { support: 'unknown', source: 'unverified' },
          nativeSubagents: { support: 'unknown', source: 'unverified' },
        },
      });
      expect(evaluateOdNextExecutionEligibility(resolved.snapshot!, 'simple')).toEqual({
        eligible: false,
        reason: 'native_continuation_not_verified',
      });
    }
  });

  it('uses the Claude 2.1.233 replay as provenance without pinning admission to that version', () => {
    const seed = JSON.parse(readFileSync(
      join(fixtureDir, 'claude-2.1.233.sanitized-real-seed.json'),
      'utf8',
    )) as {
      recordingDigest: string;
      cases: Array<{ caseId: string; outcome: string }>;
    };
    const digest = `sha256:${createHash('sha256')
      .update(JSON.stringify(seed.cases), 'utf8')
      .digest('hex')}`;
    expect(seed.recordingDigest).toBe(digest);
    expect(seed.cases.map(({ caseId }) => caseId)).toEqual(
      CLAUDE_2_1_233_BEST_EFFORT_MANIFEST.cases.map(({ id }) => id),
    );
    expect(seed.cases.every(({ outcome }) => outcome === 'passed')).toBe(true);
    expect(CLAUDE_2_1_233_BEST_EFFORT_MANIFEST.provenance).toMatchObject({
      kind: 'sanitized_real',
      evidenceReview: 'open_design_best_effort',
      recordingDigest: digest,
    });

    const exact = resolveOdNextRuntimeCapability({
      agentId: 'claude',
      agentCliVersion: '2.1.233 (Claude Code)',
      fixtureVersion: CLAUDE_2_1_233_BEST_EFFORT_MANIFEST.fixtureVersion,
      fixtureManifest: CLAUDE_2_1_233_BEST_EFFORT_MANIFEST,
      capturedAt: 1,
    });
    expect(exact).toMatchObject({
      tupleMatched: true,
      reason: 'capability_resolved',
      snapshot: {
        agentCliVersion: '2.1.233 (Claude Code)',
        recordedAgentCliVersion: '2.1.233 (Claude Code)',
        nativeSessionContinuation: { support: 'verified' },
        nativeSubagents: { support: 'verified', evidenceLevel: 'L2' },
      },
    });
    expect(resolveOdNextRuntimeCapability({
      agentId: 'claude',
      agentCliVersion: '2.2.0-alpha.1 (Claude Code)',
      fixtureVersion: CLAUDE_2_1_233_BEST_EFFORT_MANIFEST.fixtureVersion,
      fixtureManifest: CLAUDE_2_1_233_BEST_EFFORT_MANIFEST,
      capturedAt: 1,
    })).toMatchObject({
      reason: 'capability_resolved',
      snapshot: {
        agentCliVersion: '2.2.0-alpha.1 (Claude Code)',
        recordedAgentCliVersion: '2.1.233 (Claude Code)',
      },
    });
  });

  it('admits Vela on the native OpenCode runtime it shares with the registered OpenCode tuple', () => {
    const seed = JSON.parse(readFileSync(
      join(fixtureDir, 'vela-opencode-0.0.1-local-opencode-1.18.18.sanitized-real-seed.json'),
      'utf8',
    )) as { recordingDigest: string };
    expect(VELA_OPENCODE_LOCAL_BEST_EFFORT_MANIFEST.provenance).toMatchObject({
      kind: 'sanitized_real',
      evidenceReview: 'open_design_best_effort',
      recordingDigest: seed.recordingDigest,
    });
    expect(resolveOdNextRuntimeCapability({
      agentId: 'amr',
      agentCliVersion: '0.0.1-od-next-local',
      runtimeCompanionName: 'opencode',
      runtimeCompanionVersion: '1.18.18',
      fixtureVersion: VELA_OPENCODE_LOCAL_BEST_EFFORT_MANIFEST.fixtureVersion,
      fixtureManifest: VELA_OPENCODE_LOCAL_BEST_EFFORT_MANIFEST,
      capturedAt: 1,
    })).toMatchObject({
      includedInInitialRollout: true,
      tupleMatched: true,
      // Vela drives the same native OpenCode runtime already registered under
      // `native-opencode`; its Child mechanism is that runtime's, reached over
      // the ACP extension instead of the CLI stream. Withholding the tuple did
      // not withhold an unproven capability, it refused complex execution to an
      // agent whose seven evidence paths all pass. Re-pin `agentCliVersion`
      // once Vela publishes a build with a stable producer version.
      reason: 'capability_resolved',
      snapshot: {
        runtimePath: 'vela-opencode',
        agentCliVersion: '0.0.1-od-next-local',
        runtimeCompanionVersion: '1.18.18',
        nativeSessionContinuation: { support: 'verified' },
        nativeSubagents: { support: 'verified', evidenceLevel: 'L2' },
      },
    });
  });

  it('admits prerelease and unknown Codex versions through the reviewed adapter contract', () => {
    const seed = JSON.parse(readFileSync(
      join(fixtureDir, 'codex-0.147.0.sanitized-real-seed.json'),
      'utf8',
    )) as { recordingDigest: string };
    expect(CODEX_0_147_0_BEST_EFFORT_MANIFEST.provenance).toMatchObject({
      kind: 'sanitized_real',
      evidenceReview: 'open_design_best_effort',
      recordingDigest: seed.recordingDigest,
    });
    const exact = resolveOdNextRuntimeCapability({
      agentId: 'codex',
      agentCliVersion: 'codex-cli 0.147.0',
      fixtureVersion: CODEX_0_147_0_BEST_EFFORT_MANIFEST.fixtureVersion,
      fixtureManifest: CODEX_0_147_0_BEST_EFFORT_MANIFEST,
      capturedAt: 1,
    });
    expect(exact).toMatchObject({
      tupleMatched: true,
      reason: 'capability_resolved',
      snapshot: {
        agentCliVersion: 'codex-cli 0.147.0',
        recordedAgentCliVersion: 'codex-cli 0.147.0',
        nativeSessionContinuation: { support: 'verified', source: 'sanitized_fixture_replay' },
        nativeSubagents: {
          support: 'verified',
          evidenceLevel: 'L2',
          source: 'sanitized_fixture_replay',
        },
      },
    });
    const prerelease = resolveOdNextRuntimeCapability({
      agentId: 'codex',
      agentCliVersion: 'codex-cli 0.148.0-alpha.9',
      fixtureVersion: CODEX_0_147_0_BEST_EFFORT_MANIFEST.fixtureVersion,
      fixtureManifest: CODEX_0_147_0_BEST_EFFORT_MANIFEST,
      capturedAt: 1,
    });
    const unknownVersion = resolveOdNextRuntimeCapability({
      agentId: 'codex',
      agentCliVersion: null,
      fixtureVersion: CODEX_0_147_0_BEST_EFFORT_MANIFEST.fixtureVersion,
      fixtureManifest: CODEX_0_147_0_BEST_EFFORT_MANIFEST,
      capturedAt: 1,
    });
    expect(prerelease).toMatchObject({
      reason: 'capability_resolved',
      snapshot: {
        agentCliVersion: 'codex-cli 0.148.0-alpha.9',
        recordedAgentCliVersion: 'codex-cli 0.147.0',
      },
    });
    expect(unknownVersion).toMatchObject({
      reason: 'capability_resolved',
      snapshot: { recordedAgentCliVersion: 'codex-cli 0.147.0' },
    });
    expect(unknownVersion.snapshot).not.toHaveProperty('agentCliVersion');
    expect(prerelease.snapshot?.snapshotHash).not.toBe(unknownVersion.snapshot?.snapshotHash);
    expect(resolveBundledOdNextRuntimeCapability({
      agentId: 'codex',
      agentCliVersion: 'codex-cli 0.148.0-alpha.9',
      capturedAt: 1,
    })).toMatchObject({
      reason: 'capability_resolved',
      snapshot: {
        agentCliVersion: 'codex-cli 0.148.0-alpha.9',
        recordedAgentCliVersion: 'codex-cli 0.147.0',
      },
    });
  });

  it('silently rejects only an explicitly confirmed incompatible CLI release', () => {
    const denied = resolveOdNextRuntimeCapability({
      agentId: 'codex',
      agentCliVersion: 'codex-cli 0.149.3-broken-adapter',
      fixtureVersion: CODEX_0_147_0_BEST_EFFORT_MANIFEST.fixtureVersion,
      fixtureManifest: CODEX_0_147_0_BEST_EFFORT_MANIFEST,
      incompatibleVersions: [{
        agentId: 'codex',
        agentCliVersion: 'codex-cli 0.149.3-broken-adapter',
      }],
      capturedAt: 1,
    });
    expect(denied).toMatchObject({
      tupleMatched: false,
      reason: 'runtime_version_denied',
      snapshot: {
        agentCliVersion: 'codex-cli 0.149.3-broken-adapter',
        nativeSessionContinuation: { support: 'unknown' },
        nativeSubagents: { support: 'unknown' },
      },
    });
  });

  it('resolves native OpenCode from adapter evidence while retaining current version diagnostics', () => {
    const seed = JSON.parse(readFileSync(
      join(fixtureDir, 'opencode-1.18.18.sanitized-real-seed.json'),
      'utf8',
    )) as { recordingDigest: string };
    expect(OPENCODE_1_18_18_BEST_EFFORT_MANIFEST.provenance).toMatchObject({
      kind: 'sanitized_real',
      evidenceReview: 'open_design_best_effort',
      recordingDigest: seed.recordingDigest,
    });
    const exact = resolveOdNextRuntimeCapability({
      agentId: 'opencode',
      agentCliVersion: '1.18.18',
      fixtureVersion: OPENCODE_1_18_18_BEST_EFFORT_MANIFEST.fixtureVersion,
      fixtureManifest: OPENCODE_1_18_18_BEST_EFFORT_MANIFEST,
      capturedAt: 1,
    });
    expect(exact).toMatchObject({
      tupleMatched: true,
      reason: 'capability_resolved',
      snapshot: {
        agentCliVersion: '1.18.18',
        recordedAgentCliVersion: '1.18.18',
        nativeSessionContinuation: { support: 'verified', source: 'sanitized_fixture_replay' },
        nativeSubagents: {
          support: 'verified',
          evidenceLevel: 'L2',
          source: 'sanitized_fixture_replay',
        },
      },
    });
    expect(resolveOdNextRuntimeCapability({
      agentId: 'opencode',
      agentCliVersion: '1.18.19',
      fixtureVersion: OPENCODE_1_18_18_BEST_EFFORT_MANIFEST.fixtureVersion,
      fixtureManifest: OPENCODE_1_18_18_BEST_EFFORT_MANIFEST,
      capturedAt: 1,
    })).toMatchObject({
      reason: 'capability_resolved',
      snapshot: {
        agentCliVersion: '1.18.19',
        recordedAgentCliVersion: '1.18.18',
      },
    });
  });

  it('matches the adapter/schema contract while refusing synthetic fixtures as verification', () => {
    const manifest = syntheticManifest(readFixture('codex.contract.json'));
    const entry = syntheticEntry(manifest);
    const exact = resolveOdNextRuntimeCapability({
      ...resolutionInput(manifest),
      fixtureManifest: manifest,
      registry: [entry],
    });
    expect(exact).toMatchObject({
      tupleMatched: true,
      reason: 'synthetic_fixture_not_accepted',
      snapshot: {
        nativeSessionContinuation: {
          support: 'unknown',
          evidenceLevel: 'L0',
          source: 'test_synthetic',
        },
        nativeSubagents: {
          support: 'unknown',
          evidenceLevel: 'L1',
          source: 'test_synthetic',
        },
      },
    });

    for (const changed of [
      { fixtureVersion: 'od-next-runtime-contract/v2' },
      {
        fixtureManifest: {
          ...manifest,
          runtimeAdapterVersion: 'od-codex-json-events/v2',
        },
      },
    ]) {
      const drifted = resolveOdNextRuntimeCapability({
        ...resolutionInput(manifest),
        fixtureManifest: manifest,
        registry: [entry],
        ...changed,
      });
      expect(drifted.snapshot?.nativeSessionContinuation.support).toBe('unknown');
      expect(drifted.reason).not.toBe('capability_resolved');
    }
  });

  it('does not resolve a registry entry without verified native subagent lifecycle', () => {
    const reviewed = OD_NEXT_RUNTIME_CAPABILITY_REGISTRY.find(
      (entry) => entry.agentId === 'codex',
    )!;
    const incomplete: RuntimeCapabilityRegistryEntryV1 = {
      ...reviewed,
      evidence: {
        ...reviewed.evidence,
        nativeSubagents: { support: 'advertised', evidenceLevel: 'L1' },
      },
    };
    expect(resolveOdNextRuntimeCapability({
      agentId: 'codex',
      fixtureVersion: CODEX_0_147_0_BEST_EFFORT_MANIFEST.fixtureVersion,
      fixtureManifest: CODEX_0_147_0_BEST_EFFORT_MANIFEST,
      registry: [incomplete],
      capturedAt: 1,
    })).toMatchObject({
      tupleMatched: true,
      reason: 'capability_tuple_unverified',
      snapshot: {
        nativeSessionContinuation: { support: 'unknown' },
        nativeSubagents: { support: 'unknown' },
      },
    });
  });

  it('treats current versions as optional diagnostics while still requiring a fixture manifest', () => {
    const manifest = syntheticManifest(readFixture('vela-opencode.contract.json'));
    expect(resolveOdNextRuntimeCapability({
      ...resolutionInput(manifest),
      fixtureManifest: manifest,
      agentCliVersion: null,
    }).reason).toBe('synthetic_fixture_not_accepted');
    expect(resolveOdNextRuntimeCapability({
      ...resolutionInput(manifest),
      fixtureManifest: manifest,
      runtimeCompanionVersion: null,
    }).reason).toBe('synthetic_fixture_not_accepted');
    expect(resolveOdNextRuntimeCapability({
      ...resolutionInput(manifest),
      fixtureManifest: undefined,
    }).reason).toBe('fixture_manifest_missing');
  });

  it('keeps snapshot hashes stable across capture time and object key order', () => {
    const raw = JSON.parse(readFileSync(
      join(fixtureDir, 'codex.contract.json'),
      'utf8',
    )) as Record<string, unknown>;
    const reordered = Object.fromEntries(Object.entries(raw).reverse());
    expect(hashRuntimeCapabilityFixtureManifestV1(raw)).toBe(
      hashRuntimeCapabilityFixtureManifestV1(reordered),
    );
    expect(hashRuntimeCapabilityFixtureManifestV1(raw)).toBe(
      hashRuntimeCapabilityFixtureManifestV1({
        ...raw,
        cases: [...(raw.cases as unknown[])].reverse(),
      }),
    );

    const manifest = readFixture('codex.contract.json');
    const first = resolveOdNextRuntimeCapability({
      ...resolutionInput(manifest),
      capturedAt: 1,
    });
    const later = resolveOdNextRuntimeCapability({
      ...resolutionInput(manifest),
      capturedAt: 9_999,
    });
    expect(first.snapshot?.capturedAt).not.toBe(later.snapshot?.capturedAt);
    expect(first.snapshot?.snapshotHash).toBe(later.snapshot?.snapshotHash);
  });

  it('excludes first-release external Agents instead of lending them an unknown path', () => {
    const excluded = resolveOdNextRuntimeCapability({
      agentId: 'kimi',
      agentCliVersion: 'kimi 9.9.9',
      fixtureVersion: 'od-next-runtime-contract/v1',
    });
    expect(excluded).toEqual({
      includedInInitialRollout: false,
      tupleMatched: false,
      reason: 'runtime_out_of_scope',
      snapshot: null,
    });
  });

  it('requires continuation for simple work and structured children for complex work', () => {
    for (const support of ['unsupported', 'unknown', 'advertised'] as const) {
      expect(evaluateOdNextExecutionEligibility({
        nativeSessionContinuation: { support },
        nativeSubagents: { support: 'verified', evidenceLevel: 'L3' },
      }, 'simple')).toEqual({
        eligible: false,
        reason: 'native_continuation_not_verified',
      });
    }

    for (const support of ['unsupported', 'unknown', 'advertised'] as const) {
      const capabilities = {
        nativeSessionContinuation: { support: 'verified' as const },
        nativeSubagents: { support, evidenceLevel: 'L1' as const },
      };
      expect(evaluateOdNextExecutionEligibility(capabilities, 'simple')).toEqual({
        eligible: true, reason: 'eligible',
      });
      expect(evaluateOdNextExecutionEligibility(capabilities, 'complex')).toEqual({
        eligible: false,
        reason: 'native_subagents_not_verified',
      });
    }

    for (const evidenceLevel of ['L0', 'L1'] as const) {
      expect(evaluateOdNextExecutionEligibility({
        nativeSessionContinuation: { support: 'verified' },
        nativeSubagents: { support: 'verified', evidenceLevel },
      }, 'complex')).toEqual({
        eligible: false,
        reason: 'structured_child_lifecycle_not_verified',
      });
    }
    for (const evidenceLevel of ['L2', 'L3'] as const) {
      expect(evaluateOdNextExecutionEligibility({
        nativeSessionContinuation: { support: 'verified' },
        nativeSubagents: { support: 'verified', evidenceLevel },
      }, 'complex')).toEqual({ eligible: true, reason: 'eligible' });
    }
  });
});

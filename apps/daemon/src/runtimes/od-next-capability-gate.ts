import { createHash } from 'node:crypto';

import {
  OD_NEXT_RUNTIME_CAPABILITY_SNAPSHOT_V1_SCHEMA,
  OD_NEXT_RUNTIME_CAPABILITY_EVIDENCE_V1_SCHEMA,
  OD_NEXT_RUNTIME_FIXTURE_MANIFEST_V1_SCHEMA,
  OdNextRuntimeCapabilitySnapshotV1Schema,
  RuntimeCapabilityFixtureManifestV1Schema,
  RuntimeCapabilityRegistryEntryV1Schema,
  type CapabilitySupportV2,
  type OdNextRuntimeCapabilitySnapshotV1,
  type RuntimeCapabilityFixtureManifestV1,
  type RuntimeCapabilityRegistryEntryV1,
  type RuntimeCapabilitySnapshotSourceV1,
  type RuntimeObservationEvidenceLevelV1,
} from '@open-design/contracts';

import type { RuntimeCapabilityMap } from './types.js';

export interface OdNextRuntimePathDescriptor {
  runtimePath: string;
  agentId: string;
  runtimeAdapterVersion: string;
  requiredRuntimeCompanionName?: string;
}

/**
 * Initial rollout descriptors only. Capability support remains registry-driven:
 * describing a path here does not make its adapter/schema contract eligible.
 */
export const OD_NEXT_RUNTIME_PATH_DESCRIPTORS = [
  {
    runtimePath: 'codex',
    agentId: 'codex',
    runtimeAdapterVersion: 'od-codex-json-events/v1',
  },
  {
    runtimePath: 'claude-code',
    agentId: 'claude',
    runtimeAdapterVersion: 'od-claude-stream-json/v1',
  },
  {
    runtimePath: 'native-opencode',
    agentId: 'opencode',
    runtimeAdapterVersion: 'od-opencode-json-events/v1',
  },
  {
    runtimePath: 'vela-opencode',
    agentId: 'amr',
    runtimeAdapterVersion: 'od-vela-opencode-acp/v1',
    requiredRuntimeCompanionName: 'opencode',
  },
] as const satisfies readonly OdNextRuntimePathDescriptor[];

const ALL_REQUIRED_CASES = [
  { id: 'main_run', expectedMinimumEvidence: 'L0' },
  { id: 'tool', expectedMinimumEvidence: 'L1' },
  { id: 'child_success', expectedMinimumEvidence: 'L2' },
  { id: 'child_failure_parent_recovers', expectedMinimumEvidence: 'L2' },
  { id: 'cancel', expectedMinimumEvidence: 'L0' },
  { id: 'timeout', expectedMinimumEvidence: 'L0' },
  { id: 'resume', expectedMinimumEvidence: 'L0' },
] as const;

/**
 * Exact Codex 0.147.0 tuple replayed by Open Design against the installed CLI
 * and the matching rust-v0.147.0 source. The failure case uses a local
 * Responses endpoint that closes only the already-started Child stream, so it
 * exercises Codex's native task_complete.error and parent recovery path
 * without sending telemetry or inference data to an online service.
 */
export const CODEX_0_147_0_BEST_EFFORT_MANIFEST =
  RuntimeCapabilityFixtureManifestV1Schema.parse({
    schema: OD_NEXT_RUNTIME_FIXTURE_MANIFEST_V1_SCHEMA,
    fixtureVersion: 'codex-0.147.0-seven-path/v1',
    runtimePath: 'codex',
    agentId: 'codex',
    agentCliVersion: 'codex-cli 0.147.0',
    runtimeAdapterVersion: 'od-codex-json-events/v1',
    provenance: {
      kind: 'sanitized_real',
      recordingDigest:
        'sha256:729d0e58e80e7b8b81eb90ad286471a26c3df80411f0b0f7092c19d157b50cc6',
      anonymizationVersion: 'od-runtime-evidence/v1',
      evidenceReview: 'open_design_best_effort',
    },
    containsSensitiveContent: false,
    cases: ALL_REQUIRED_CASES,
  });

/**
 * Open Design-owned best-effort replay for the exact native OpenCode tuple.
 * The source recording is reduced to structural facts in the checked-in seed;
 * no upstream or runtime-owner endorsement is implied.
 */
export const OPENCODE_1_18_18_BEST_EFFORT_MANIFEST =
  RuntimeCapabilityFixtureManifestV1Schema.parse({
    schema: OD_NEXT_RUNTIME_FIXTURE_MANIFEST_V1_SCHEMA,
    fixtureVersion: 'opencode-1.18.18-seven-path/v1',
    runtimePath: 'native-opencode',
    agentId: 'opencode',
    agentCliVersion: '1.18.18',
    runtimeAdapterVersion: 'od-opencode-json-events/v1',
    provenance: {
      kind: 'sanitized_real',
      recordingDigest:
        'sha256:b1224716a340401879cfb2f366d1252e9f837ce24050d9b0dfa4430f89492fc5',
      anonymizationVersion: 'od-runtime-evidence/v1',
      evidenceReview: 'open_design_best_effort',
    },
    containsSensitiveContent: false,
    cases: ALL_REQUIRED_CASES,
  });

/**
 * Open Design-owned replay of the exact Claude 2.1.233 Agent stream-json
 * protocol. The checked-in seed contains structural identities only; no
 * Prompt body, output, path, credential, or upstream endorsement is retained.
 */
export const CLAUDE_2_1_233_BEST_EFFORT_MANIFEST =
  RuntimeCapabilityFixtureManifestV1Schema.parse({
    schema: OD_NEXT_RUNTIME_FIXTURE_MANIFEST_V1_SCHEMA,
    fixtureVersion: 'claude-2.1.233-seven-path/v1',
    runtimePath: 'claude-code',
    agentId: 'claude',
    agentCliVersion: '2.1.233 (Claude Code)',
    runtimeAdapterVersion: 'od-claude-stream-json/v1',
    provenance: {
      kind: 'sanitized_real',
      recordingDigest:
        'sha256:5681a9a211562e119efc470b6846a4be8b3ee822f4e15f8967c19871e69c9b8b',
      anonymizationVersion: 'od-runtime-evidence/v1',
      evidenceReview: 'open_design_best_effort',
    },
    containsSensitiveContent: false,
    cases: ALL_REQUIRED_CASES,
  });

/**
 * Provider-backed local replay for the Vela candidate paired with native
 * OpenCode 1.18.18. All seven paths pass.
 *
 * Vela drives the same native OpenCode runtime this registry already admits
 * under `native-opencode`; its Child mechanism is that runtime's, reached over
 * the ACP extension rather than the CLI stream. Holding the tuple out of the
 * registry therefore did not withhold an unproven capability — it refused
 * complex execution to an agent whose evidence paths all pass, on the separate
 * grounds that the build is not yet immutable. Admit it, and re-pin
 * `agentCliVersion` here once Vela publishes a build that reports a stable
 * producer version — this field records which CLI the fixture was captured
 * against, and nothing gates on it.
 *
 * Child evidence is reached by ACP capability negotiation, not by sniffing that
 * version: a Vela without the `vela.opencode.child_agent_lifecycle` producer
 * simply never advertises it, so a complex task blocks on honestly missing
 * evidence, and one that does advertise it works the moment it is installed.
 * That is why admitting the tuple cannot make an older Vela claim Children it
 * never reported, and why no version pin has to be walked back when the
 * producer ships.
 */
export const VELA_OPENCODE_LOCAL_BEST_EFFORT_MANIFEST =
  RuntimeCapabilityFixtureManifestV1Schema.parse({
    schema: OD_NEXT_RUNTIME_FIXTURE_MANIFEST_V1_SCHEMA,
    fixtureVersion: 'vela-opencode-0.0.1-local-opencode-1.18.18-seven-path/v1',
    runtimePath: 'vela-opencode',
    agentId: 'amr',
    agentCliVersion: '0.0.1-od-next-local',
    runtimeAdapterVersion: 'od-vela-opencode-acp/v1',
    runtimeCompanionName: 'opencode',
    runtimeCompanionVersion: '1.18.18',
    provenance: {
      kind: 'sanitized_real',
      recordingDigest:
        'sha256:6fe49f1e0946b2220052b2239494786879c03c972b5be12dee30a7973872f6aa',
      anonymizationVersion: 'od-runtime-evidence/v1',
      evidenceReview: 'open_design_best_effort',
    },
    containsSensitiveContent: false,
    cases: ALL_REQUIRED_CASES,
  });

export const OD_NEXT_RUNTIME_CAPABILITY_FIXTURE_MANIFESTS:
  readonly RuntimeCapabilityFixtureManifestV1[] = [
    CODEX_0_147_0_BEST_EFFORT_MANIFEST,
    CLAUDE_2_1_233_BEST_EFFORT_MANIFEST,
    OPENCODE_1_18_18_BEST_EFFORT_MANIFEST,
    VELA_OPENCODE_LOCAL_BEST_EFFORT_MANIFEST,
  ];

export const OD_NEXT_RUNTIME_CAPABILITY_REGISTRY:
  readonly RuntimeCapabilityRegistryEntryV1[] = [
    CODEX_0_147_0_BEST_EFFORT_MANIFEST,
    CLAUDE_2_1_233_BEST_EFFORT_MANIFEST,
    OPENCODE_1_18_18_BEST_EFFORT_MANIFEST,
    VELA_OPENCODE_LOCAL_BEST_EFFORT_MANIFEST,
  ].map((manifest) => RuntimeCapabilityRegistryEntryV1Schema.parse({
    runtimePath: manifest.runtimePath,
    agentId: manifest.agentId,
    recordedAgentCliVersion: manifest.agentCliVersion!,
    runtimeAdapterVersion: manifest.runtimeAdapterVersion,
    ...(manifest.runtimeCompanionName
      ? { recordedRuntimeCompanionName: manifest.runtimeCompanionName }
      : {}),
    ...(manifest.runtimeCompanionVersion
      ? { recordedRuntimeCompanionVersion: manifest.runtimeCompanionVersion }
      : {}),
    fixtureVersion: manifest.fixtureVersion,
    fixtureHash: hashRuntimeCapabilityFixtureManifestV1(manifest),
    evidence: {
      schema: OD_NEXT_RUNTIME_CAPABILITY_EVIDENCE_V1_SCHEMA,
      source: 'fixture_replay',
      nativeSessionContinuation: { support: 'verified', evidenceLevel: 'L0' },
      nativeSubagents: { support: 'verified', evidenceLevel: 'L2' },
      caseResults: ALL_REQUIRED_CASES.map(({ id }) => ({ id, outcome: 'passed' })),
    },
  }));

export type OdNextCapabilityResolutionReason =
  | 'runtime_out_of_scope'
  | 'runtime_version_denied'
  | 'fixture_manifest_missing'
  | 'fixture_manifest_invalid'
  | 'fixture_tuple_mismatch'
  | 'x1_runtime_fixture_missing'
  | 'synthetic_fixture_not_accepted'
  | 'capability_tuple_unverified'
  | 'fixture_hash_mismatch'
  | 'capability_resolved';

export interface ResolveOdNextRuntimeCapabilityInput {
  agentId: string;
  agentCliVersion?: string | null;
  runtimeCompanionName?: string | null;
  runtimeCompanionVersion?: string | null;
  fixtureVersion: string;
  fixtureManifest?: unknown;
  registry?: readonly RuntimeCapabilityRegistryEntryV1[];
  incompatibleVersions?: readonly {
    agentId: string;
    agentCliVersion: string;
  }[];
  capturedAt?: number;
}

/**
 * Confirmed adapter-breaking releases only. Keep this list narrow and empty
 * unless a concrete incompatibility has been reproduced; unknown versions are
 * forward-compatible by default.
 */
const OD_NEXT_RUNTIME_INCOMPATIBLE_VERSIONS: readonly {
  agentId: string;
  agentCliVersion: string;
}[] = [];

export interface OdNextRuntimeCapabilityResolution {
  includedInInitialRollout: boolean;
  tupleMatched: boolean;
  reason: OdNextCapabilityResolutionReason;
  snapshot: OdNextRuntimeCapabilitySnapshotV1 | null;
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

function sha256Canonical(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonicalize(value)), 'utf8')
    .digest('hex')}`;
}

/** Hash only the replay contract and recording identity, not review timestamps. */
export function hashRuntimeCapabilityFixtureManifestV1(
  input: unknown,
): string {
  const manifest = RuntimeCapabilityFixtureManifestV1Schema.parse(input);
  return sha256Canonical({
    schema: manifest.schema,
    fixtureVersion: manifest.fixtureVersion,
    runtimePath: manifest.runtimePath,
    agentId: manifest.agentId,
    agentCliVersion: manifest.agentCliVersion ?? null,
    runtimeAdapterVersion: manifest.runtimeAdapterVersion,
    runtimeCompanionName: manifest.runtimeCompanionName ?? null,
    runtimeCompanionVersion: manifest.runtimeCompanionVersion ?? null,
    provenance: manifest.provenance.kind === 'sanitized_real'
      ? {
          kind: manifest.provenance.kind,
          recordingDigest: manifest.provenance.recordingDigest,
          anonymizationVersion: manifest.provenance.anonymizationVersion,
        }
      : { kind: manifest.provenance.kind },
    containsSensitiveContent: manifest.containsSensitiveContent,
    cases: [...manifest.cases].sort(({ id: left }, { id: right }) => (
      left < right ? -1 : left > right ? 1 : 0
    )),
  });
}

function snapshotHashInput(
  snapshot: Omit<OdNextRuntimeCapabilitySnapshotV1, 'snapshotHash'>,
): unknown {
  return {
    schema: snapshot.schema,
    runtimePath: snapshot.runtimePath,
    agentId: snapshot.agentId,
    agentCliVersion: snapshot.agentCliVersion ?? null,
    runtimeAdapterVersion: snapshot.runtimeAdapterVersion,
    runtimeCompanionName: snapshot.runtimeCompanionName ?? null,
    runtimeCompanionVersion: snapshot.runtimeCompanionVersion ?? null,
    recordedAgentCliVersion: snapshot.recordedAgentCliVersion ?? null,
    recordedRuntimeCompanionName: snapshot.recordedRuntimeCompanionName ?? null,
    recordedRuntimeCompanionVersion: snapshot.recordedRuntimeCompanionVersion ?? null,
    fixtureVersion: snapshot.fixtureVersion,
    fixtureHash: snapshot.fixtureHash ?? null,
    nativeSessionContinuation: snapshot.nativeSessionContinuation,
    nativeSubagents: snapshot.nativeSubagents,
  };
}

/** capturedAt is excluded; actual diagnostics and recorded provenance remain auditable. */
export function hashOdNextRuntimeCapabilitySnapshotV1(
  snapshot: Omit<OdNextRuntimeCapabilitySnapshotV1, 'snapshotHash'>,
): string {
  return sha256Canonical(snapshotHashInput(snapshot));
}

function descriptorForAgent(agentId: string): OdNextRuntimePathDescriptor | null {
  return OD_NEXT_RUNTIME_PATH_DESCRIPTORS.find((descriptor) => (
    descriptor.agentId === agentId
  )) ?? null;
}

function buildSnapshot(input: {
  descriptor: OdNextRuntimePathDescriptor;
  agentCliVersion?: string | undefined;
  runtimeCompanionName?: string | undefined;
  runtimeCompanionVersion?: string | undefined;
  recordedAgentCliVersion?: string | undefined;
  recordedRuntimeCompanionName?: string | undefined;
  recordedRuntimeCompanionVersion?: string | undefined;
  fixtureVersion: string;
  fixtureHash?: string | undefined;
  continuationSupport: CapabilitySupportV2;
  continuationEvidenceLevel: RuntimeObservationEvidenceLevelV1;
  subagentSupport: CapabilitySupportV2;
  subagentEvidenceLevel: RuntimeObservationEvidenceLevelV1;
  source: RuntimeCapabilitySnapshotSourceV1;
  capturedAt: number;
}): OdNextRuntimeCapabilitySnapshotV1 {
  const withoutHash: Omit<OdNextRuntimeCapabilitySnapshotV1, 'snapshotHash'> = {
    schema: OD_NEXT_RUNTIME_CAPABILITY_SNAPSHOT_V1_SCHEMA,
    runtimePath: input.descriptor.runtimePath,
    agentId: input.descriptor.agentId,
    ...(input.agentCliVersion ? { agentCliVersion: input.agentCliVersion } : {}),
    runtimeAdapterVersion: input.descriptor.runtimeAdapterVersion,
    ...(input.runtimeCompanionName
      ? { runtimeCompanionName: input.runtimeCompanionName }
      : {}),
    ...(input.runtimeCompanionVersion
      ? { runtimeCompanionVersion: input.runtimeCompanionVersion }
      : {}),
    ...(input.recordedAgentCliVersion
      ? { recordedAgentCliVersion: input.recordedAgentCliVersion }
      : {}),
    ...(input.recordedRuntimeCompanionName
      ? { recordedRuntimeCompanionName: input.recordedRuntimeCompanionName }
      : {}),
    ...(input.recordedRuntimeCompanionVersion
      ? { recordedRuntimeCompanionVersion: input.recordedRuntimeCompanionVersion }
      : {}),
    fixtureVersion: input.fixtureVersion,
    ...(input.fixtureHash ? { fixtureHash: input.fixtureHash } : {}),
    nativeSessionContinuation: {
      support: input.continuationSupport,
      evidenceLevel: input.continuationEvidenceLevel,
      source: input.source,
    },
    nativeSubagents: {
      support: input.subagentSupport,
      evidenceLevel: input.subagentEvidenceLevel,
      source: input.source,
    },
    capturedAt: input.capturedAt,
  };
  return OdNextRuntimeCapabilitySnapshotV1Schema.parse({
    ...withoutHash,
    snapshotHash: hashOdNextRuntimeCapabilitySnapshotV1(withoutHash),
  });
}

function unknownResolution(input: {
  descriptor: OdNextRuntimePathDescriptor;
  agentCliVersion?: string | undefined;
  runtimeCompanionName?: string | undefined;
  runtimeCompanionVersion?: string | undefined;
  fixtureVersion: string;
  fixtureHash?: string | undefined;
  capturedAt: number;
  reason: Exclude<OdNextCapabilityResolutionReason, 'runtime_out_of_scope' | 'capability_resolved'>;
  tupleMatched?: boolean;
  source?: RuntimeCapabilitySnapshotSourceV1 | undefined;
  continuationEvidenceLevel?: RuntimeObservationEvidenceLevelV1 | undefined;
  subagentEvidenceLevel?: RuntimeObservationEvidenceLevelV1 | undefined;
}): OdNextRuntimeCapabilityResolution {
  return {
    includedInInitialRollout: true,
    tupleMatched: input.tupleMatched ?? false,
    reason: input.reason,
    snapshot: buildSnapshot({
      descriptor: input.descriptor,
      agentCliVersion: input.agentCliVersion,
      runtimeCompanionName: input.runtimeCompanionName,
      runtimeCompanionVersion: input.runtimeCompanionVersion,
      fixtureVersion: input.fixtureVersion,
      fixtureHash: input.fixtureHash,
      continuationSupport: 'unknown',
      continuationEvidenceLevel: input.continuationEvidenceLevel ?? 'L0',
      subagentSupport: 'unknown',
      subagentEvidenceLevel: input.subagentEvidenceLevel ?? 'L0',
      source: input.source ?? 'unverified',
      capturedAt: input.capturedAt,
    }),
  };
}

function manifestMatchesCapabilityContract(
  manifest: RuntimeCapabilityFixtureManifestV1,
  input: {
    descriptor: OdNextRuntimePathDescriptor;
    fixtureVersion: string;
  },
): boolean {
  return manifest.runtimePath === input.descriptor.runtimePath &&
    manifest.agentId === input.descriptor.agentId &&
    manifest.runtimeAdapterVersion === input.descriptor.runtimeAdapterVersion &&
    manifest.fixtureVersion === input.fixtureVersion &&
    (manifest.runtimeCompanionName ?? undefined) ===
      input.descriptor.requiredRuntimeCompanionName;
}

function entryMatchesCapabilityContract(
  entry: RuntimeCapabilityRegistryEntryV1,
  input: {
    descriptor: OdNextRuntimePathDescriptor;
    fixtureVersion: string;
    manifest: RuntimeCapabilityFixtureManifestV1;
  },
): boolean {
  return entry.runtimePath === input.descriptor.runtimePath &&
    entry.agentId === input.descriptor.agentId &&
    entry.runtimeAdapterVersion === input.descriptor.runtimeAdapterVersion &&
    entry.fixtureVersion === input.fixtureVersion &&
    entry.recordedAgentCliVersion === input.manifest.agentCliVersion &&
    (entry.recordedRuntimeCompanionName ?? undefined) ===
      (input.manifest.runtimeCompanionName ?? undefined) &&
    (entry.recordedRuntimeCompanionVersion ?? undefined) ===
      (input.manifest.runtimeCompanionVersion ?? undefined);
}

function hasCompleteOdNextCapability(
  evidence: RuntimeCapabilityRegistryEntryV1['evidence'],
): boolean {
  return evidence.nativeSessionContinuation.support === 'verified' &&
    evidence.nativeSubagents.support === 'verified' &&
    (
      evidence.nativeSubagents.evidenceLevel === 'L2' ||
      evidence.nativeSubagents.evidenceLevel === 'L3'
    );
}

export function resolveOdNextRuntimeCapability(
  input: ResolveOdNextRuntimeCapabilityInput,
): OdNextRuntimeCapabilityResolution {
  const descriptor = descriptorForAgent(input.agentId);
  if (!descriptor) {
    return {
      includedInInitialRollout: false,
      tupleMatched: false,
      reason: 'runtime_out_of_scope',
      snapshot: null,
    };
  }

  const capturedAt = input.capturedAt ?? Date.now();
  const agentCliVersion = input.agentCliVersion?.trim() || undefined;
  const runtimeCompanionName = input.runtimeCompanionName?.trim() || undefined;
  const runtimeCompanionVersion = input.runtimeCompanionVersion?.trim() || undefined;
  const base = {
    descriptor,
    agentCliVersion,
    runtimeCompanionName,
    runtimeCompanionVersion,
    fixtureVersion: input.fixtureVersion,
    capturedAt,
  };
  if ((input.incompatibleVersions ?? OD_NEXT_RUNTIME_INCOMPATIBLE_VERSIONS).some(
    (entry) => entry.agentId === descriptor.agentId
      && entry.agentCliVersion === agentCliVersion,
  )) {
    return unknownResolution({ ...base, reason: 'runtime_version_denied' });
  }
  if (input.fixtureManifest === undefined) {
    return unknownResolution({ ...base, reason: 'fixture_manifest_missing' });
  }
  const parsedManifest = RuntimeCapabilityFixtureManifestV1Schema.safeParse(
    input.fixtureManifest,
  );
  if (!parsedManifest.success) {
    return unknownResolution({ ...base, reason: 'fixture_manifest_invalid' });
  }
  const manifest = parsedManifest.data;
  const fixtureHash = hashRuntimeCapabilityFixtureManifestV1(manifest);
  if (manifest.provenance.kind === 'contract_only') {
    return unknownResolution({
      ...base,
      fixtureHash,
      reason: 'x1_runtime_fixture_missing',
    });
  }
  const contractInput = {
    descriptor,
    fixtureVersion: input.fixtureVersion,
  };
  if (!manifestMatchesCapabilityContract(manifest, contractInput)) {
    return unknownResolution({ ...base, fixtureHash, reason: 'fixture_tuple_mismatch' });
  }

  const registry = (input.registry ?? OD_NEXT_RUNTIME_CAPABILITY_REGISTRY)
    .flatMap((candidate) => {
      const parsed = RuntimeCapabilityRegistryEntryV1Schema.safeParse(candidate);
      return parsed.success ? [parsed.data] : [];
    });
  const entry = registry.find((candidate) => entryMatchesCapabilityContract(candidate, {
    ...contractInput,
    manifest,
  }));
  if (!entry) {
    return unknownResolution({
      ...base,
      fixtureHash,
      tupleMatched: true,
      reason: manifest.provenance.kind === 'test_synthetic'
        ? 'synthetic_fixture_not_accepted'
        : 'capability_tuple_unverified',
      source: manifest.provenance.kind === 'test_synthetic'
        ? 'test_synthetic'
        : 'unverified',
    });
  }
  if (entry.fixtureHash !== fixtureHash) {
    return unknownResolution({
      ...base,
      fixtureHash,
      tupleMatched: true,
      reason: 'fixture_hash_mismatch',
    });
  }
  if (entry.evidence.source !== 'fixture_replay') {
    return unknownResolution({
      ...base,
      fixtureHash,
      tupleMatched: true,
      reason: entry.evidence.source === 'test_synthetic'
        ? 'synthetic_fixture_not_accepted'
        : 'capability_tuple_unverified',
      source: entry.evidence.source === 'test_synthetic'
        ? 'test_synthetic'
        : 'unverified',
      continuationEvidenceLevel: entry.evidence.nativeSessionContinuation.evidenceLevel,
      subagentEvidenceLevel: entry.evidence.nativeSubagents.evidenceLevel,
    });
  }
  if (
    manifest.provenance.kind === 'test_synthetic'
  ) {
    return unknownResolution({
      ...base,
      fixtureHash,
      tupleMatched: true,
      reason: 'synthetic_fixture_not_accepted',
      source: 'test_synthetic',
      continuationEvidenceLevel: entry.evidence.nativeSessionContinuation.evidenceLevel,
      subagentEvidenceLevel: entry.evidence.nativeSubagents.evidenceLevel,
    });
  }
  if (!hasCompleteOdNextCapability(entry.evidence)) {
    return unknownResolution({
      ...base,
      fixtureHash,
      tupleMatched: true,
      reason: 'capability_tuple_unverified',
      continuationEvidenceLevel: entry.evidence.nativeSessionContinuation.evidenceLevel,
      subagentEvidenceLevel: entry.evidence.nativeSubagents.evidenceLevel,
    });
  }

  const snapshotSource: RuntimeCapabilitySnapshotSourceV1 =
    'sanitized_fixture_replay';
  return {
    includedInInitialRollout: true,
    tupleMatched: true,
    reason: 'capability_resolved',
    snapshot: buildSnapshot({
      ...base,
      fixtureHash,
      recordedAgentCliVersion: entry.recordedAgentCliVersion,
      recordedRuntimeCompanionName: entry.recordedRuntimeCompanionName,
      recordedRuntimeCompanionVersion: entry.recordedRuntimeCompanionVersion,
      continuationSupport: entry.evidence.nativeSessionContinuation.support,
      continuationEvidenceLevel:
        entry.evidence.nativeSessionContinuation.evidenceLevel,
      subagentSupport: entry.evidence.nativeSubagents.support,
      subagentEvidenceLevel: entry.evidence.nativeSubagents.evidenceLevel,
      source: snapshotSource,
    }),
  };
}

export function resolveBundledOdNextRuntimeCapability(input: {
  agentId: string;
  agentCliVersion?: string | null;
  runtimeCompanionName?: string | null;
  runtimeCompanionVersion?: string | null;
  capturedAt?: number;
}): OdNextRuntimeCapabilityResolution {
  const descriptor = descriptorForAgent(input.agentId);
  const fixture = OD_NEXT_RUNTIME_CAPABILITY_FIXTURE_MANIFESTS.find((candidate) => (
    descriptor !== null
    && candidate.agentId === descriptor.agentId
    && candidate.runtimePath === descriptor.runtimePath
    && candidate.runtimeAdapterVersion === descriptor.runtimeAdapterVersion
    && (candidate.runtimeCompanionName ?? undefined) ===
      descriptor.requiredRuntimeCompanionName
  ));
  return resolveOdNextRuntimeCapability({
    ...input,
    fixtureVersion: fixture?.fixtureVersion ?? 'od-next-runtime-contract/v1',
    ...(fixture ? { fixtureManifest: fixture } : {}),
    registry: OD_NEXT_RUNTIME_CAPABILITY_REGISTRY,
  });
}

/**
 * Advertised `--help` capability keys an admitted OD Next runtime must expose
 * on the *installed* CLI, keyed by agent id.
 *
 * The fixture registry above proves what a runtime *path* is capable of; it
 * says nothing about the build the user actually has on disk. `buildArgs`
 * refuses to launch an admitted OD Next Run whose CLI does not advertise these
 * flags, so admission must establish the same facts. Otherwise the daemon
 * admits a task it cannot start and the user's Run dies with
 * AGENT_EXECUTION_FAILED instead of quietly taking the ordinary route.
 *
 * `forwardSubagentText` backs native Child behaviour observation, which every
 * admitted Claude strategy Run enables. `customAgents` backs native Build
 * Package binding; it is required up front because a simple task may escalate
 * to complex after planning, and discovering the gap at the production stage
 * would strand a task mid-flight.
 */
export const OD_NEXT_REQUIRED_ADVERTISED_CAPABILITIES: Readonly<
  Record<string, readonly string[]>
> = {
  claude: ['forwardSubagentText', 'customAgents'],
};

/**
 * Names the advertised capability keys OD Next requires but the installed CLI
 * did not advertise. Empty means the installed build satisfies the contract;
 * a null capability map means the probe could not read `--help` at all, which
 * is treated as "not advertised" so admission stays fail-closed.
 */
export function odNextAdvertisedCapabilityGap(input: {
  agentId: string;
  advertised: RuntimeCapabilityMap | null;
}): string[] {
  const required = OD_NEXT_REQUIRED_ADVERTISED_CAPABILITIES[input.agentId];
  if (!required || required.length === 0) return [];
  const advertised = input.advertised ?? {};
  return required.filter((key) => advertised[key] !== true);
}

export type OdNextExecutionMode = 'simple' | 'complex';

export type OdNextExecutionEligibilityReason =
  | 'eligible'
  | 'native_continuation_not_verified'
  | 'native_subagents_not_verified'
  | 'structured_child_lifecycle_not_verified';

/**
 * Pure policy boundary used after a runtime has passed initial-path selection.
 * Fixture provenance is enforced by the resolver; this function only applies
 * the complete OD Next capability rules to the resolved snapshot. Both modes
 * rely on native child lifecycle even when the current task is classified as
 * simple, because the strategy may escalate after planning.
 */
export function evaluateOdNextExecutionEligibility(
  capabilities: {
    nativeSessionContinuation: { support: CapabilitySupportV2 };
    nativeSubagents: {
      support: CapabilitySupportV2;
      evidenceLevel: RuntimeObservationEvidenceLevelV1;
    };
  },
  _executionMode: OdNextExecutionMode,
): { eligible: boolean; reason: OdNextExecutionEligibilityReason } {
  if (capabilities.nativeSessionContinuation.support !== 'verified') {
    return { eligible: false, reason: 'native_continuation_not_verified' };
  }
  if (capabilities.nativeSubagents.support !== 'verified') {
    return { eligible: false, reason: 'native_subagents_not_verified' };
  }
  if (
    capabilities.nativeSubagents.evidenceLevel !== 'L2' &&
    capabilities.nativeSubagents.evidenceLevel !== 'L3'
  ) {
    return { eligible: false, reason: 'structured_child_lifecycle_not_verified' };
  }
  return { eligible: true, reason: 'eligible' };
}

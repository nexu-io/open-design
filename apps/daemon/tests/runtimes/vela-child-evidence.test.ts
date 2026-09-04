import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ChildEvidenceCoverageV1Schema } from '@open-design/contracts';

import { safeTaskObservationRuntimeVersions } from '../../src/observability/task-observation-aggregation.js';
import {
  VELA_CHILD_EVIDENCE_ADAPTER_VERSION,
  VELA_CHILD_EVIDENCE_CANDIDATE,
  VELA_CHILD_EVIDENCE_COVERAGE_SOURCE,
  VELA_CHILD_EVIDENCE_EXTENSION,
  VELA_CHILD_EVIDENCE_SCHEMA_VERSION,
  adaptVelaChildRuntimeFactV1,
  createVelaChildEvidenceConsumer,
  negotiateVelaChildEvidence,
  type VelaChildRuntimeFact,
} from '../../src/runtimes/vela-child-evidence.js';

type RecordValue = Record<string, unknown>;

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'vela-opencode-child-evidence-wire-v1.golden.json',
);
const sanitizedRealSeedPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'od-next-runtime-capabilities',
  'vela-opencode-0.0.1-local-opencode-1.18.18.sanitized-real-seed.json',
);

function fixture(): RecordValue[] {
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as RecordValue[];
}

function resultOf(message: RecordValue): RecordValue {
  return message.result as RecordValue;
}

function updateOf(message: RecordValue): RecordValue {
  return ((message.params as RecordValue).update) as RecordValue;
}

function newConsumer(facts: VelaChildRuntimeFact[] = []) {
  const consumer = createVelaChildEvidenceConsumer({
    onFact: (fact) => facts.push(fact),
    now: () => 9_999,
  });
  consumer.negotiate(resultOf(fixture()[0]!));
  return consumer;
}

function observe(
  consumer: ReturnType<typeof createVelaChildEvidenceConsumer>,
  update: unknown,
  envelopeAcpSessionId: unknown = 'acp-session',
) {
  return consumer.observe({
    expectedAcpSessionId: 'acp-session',
    envelopeAcpSessionId,
    update,
  });
}

function coherentTerminal(
  overrides: Record<string, unknown> = {},
): RecordValue {
  return {
    ...updateOf(fixture()[2]!),
    evidenceId: 'evidence-terminal',
    ...overrides,
  };
}

describe('Vela OpenCode child evidence adapter', () => {
  it('pins only the approved unpublished candidate and negotiates exact schema v1', () => {
    expect(VELA_CHILD_EVIDENCE_CANDIDATE).toEqual({
      repository: 'PowerformerAI/vela',
      commit: 'c833b74e82e31c89414b7eaf01edabab1e2d0b06',
      fixture: 'apps/cli/internal/agent/testdata/opencode_child_evidence_wire_v1.golden.json',
      published: false,
      bestEffortEvidenceVerified: true,
      verifiedOpenCodeVersion: '1.18.18',
      verifiedRuntimeSupport: true,
    });
    expect(negotiateVelaChildEvidence(resultOf(fixture()[0]!))).toMatchObject({
      advertised: true,
      supported: true,
      schemaVersion: VELA_CHILD_EVIDENCE_SCHEMA_VERSION,
      producerName: 'Vela OpenCode',
      producerVersion: '1.2.3',
      reason: 'supported_candidate',
      candidatePublished: false,
      candidateCommit: VELA_CHILD_EVIDENCE_CANDIDATE.commit,
    });

    const missing = negotiateVelaChildEvidence({ protocolVersion: 1 });
    expect(missing).toMatchObject({
      advertised: false,
      supported: false,
      reason: 'extension_missing',
    });
    const unknown = negotiateVelaChildEvidence({
      agentCapabilities: {
        extensions: {
          [VELA_CHILD_EVIDENCE_EXTENSION]: { schemaVersion: 2 },
        },
      },
    });
    expect(unknown).toMatchObject({
      advertised: true,
      supported: false,
      schemaVersion: 2,
      reason: 'unsupported_schema_version',
    });
  });

  it('replays the local Terra seven-path seed while keeping the unpublished tuple out of production', () => {
    const seed = JSON.parse(readFileSync(sanitizedRealSeedPath, 'utf8')) as {
      fixtureKind: string;
      evidenceReview: string;
      velaVersion: string;
      velaCommit: string;
      openCodeVersion: string;
      model: string;
      recordingDigest: string;
      caseCoverage: Array<{ caseId: string; outcome: string; evidence: Record<string, unknown> }>;
      wire: RecordValue[];
    };
    const { recordingDigest: _recordingDigest, ...digestInput } = structuredClone(seed);
    expect(seed.recordingDigest).toBe(
      `sha256:${createHash('sha256').update(JSON.stringify(digestInput)).digest('hex')}`,
    );
    expect(seed).toMatchObject({
      fixtureKind: 'sanitized_real_best_effort',
      evidenceReview: 'open_design_best_effort',
      velaVersion: '0.0.1-od-next-local',
      velaCommit: VELA_CHILD_EVIDENCE_CANDIDATE.commit,
      openCodeVersion: '1.18.18',
      model: 'gpt-5.6-terra',
    });
    expect(seed.caseCoverage.map(({ caseId }) => caseId)).toEqual([
      'main_run',
      'tool',
      'child_success',
      'child_failure_parent_recovers',
      'cancel',
      'timeout',
      'resume',
    ]);
    expect(seed.caseCoverage.every(({ outcome }) => outcome === 'passed')).toBe(true);
    const coverage = Object.fromEntries(seed.caseCoverage.map(({ caseId, evidence }) => [caseId, evidence]));
    expect(coverage['child_failure_parent_recovers']).toMatchObject({
      childTerminal: 'failed',
      parentTerminal: 'completed',
      parentTerminalAfterChild: true,
      parentStopReason: 'end_turn',
    });
    expect(coverage['cancel']).toMatchObject({ childStarted: true, childTerminal: 'cancelled' });
    expect(coverage['timeout']).toMatchObject({
      childStarted: true,
      childTerminal: 'timed_out',
      terminalSource: 'parent_prompt_timeout',
    });
    expect(coverage['resume']).toMatchObject({
      resumeTaskId: 'child-success',
      sameRootSession: true,
      sameChildSession: true,
    });

    const facts: VelaChildRuntimeFact[] = [];
    for (let pairStart = 0; pairStart < seed.wire.length; pairStart += 2) {
      const consumer = createVelaChildEvidenceConsumer({ onFact: (fact) => facts.push(fact) });
      consumer.negotiate({
        protocolVersion: 1,
        agentInfo: { name: 'Vela OpenCode', version: seed.velaVersion },
        agentCapabilities: {
          extensions: { [VELA_CHILD_EVIDENCE_EXTENSION]: { schemaVersion: 1 } },
        },
      });
      for (const [offset, update] of seed.wire.slice(pairStart, pairStart + 2).entries()) {
        const observed = consumer.observe({
          expectedAcpSessionId: 'acp-session',
          envelopeAcpSessionId: 'acp-session',
          update,
        });
        expect(observed, `wire[${pairStart + offset}] rejected: ${observed.reason ?? 'unknown'}`)
          .toMatchObject({ handled: true, accepted: true });
      }
    }
    expect(facts.map(({ state }) => state)).toEqual([
      'running', 'completed',
      'running', 'failed',
      'running', 'cancelled',
      'running', 'timed_out',
    ]);
    expect(VELA_CHILD_EVIDENCE_CANDIDATE).toMatchObject({
      bestEffortEvidenceVerified: true,
      verifiedRuntimeSupport: true,
      published: false,
    });
  });

  it('replays paired producer lifecycles and promotes only complete terminals to L2', () => {
    const wire = fixture();
    const facts: VelaChildRuntimeFact[] = [];
    const consumer = newConsumer(facts);

    for (const message of wire.slice(1)) {
      expect(observe(consumer, updateOf(message))).toMatchObject({
        handled: true,
        accepted: true,
      });
    }

    expect(facts).toHaveLength(8);
    expect(facts.map((fact) => fact.state)).toEqual([
      'running',
      'completed',
      'running',
      'failed',
      'running',
      'cancelled',
      'running',
      'timed_out',
    ]);
    expect(facts.every((fact) => (
      fact.adapterVersion === VELA_CHILD_EVIDENCE_ADAPTER_VERSION &&
      fact.schemaVersion === VELA_CHILD_EVIDENCE_SCHEMA_VERSION &&
      fact.l3Eligible === false
    ))).toBe(true);
    expect(facts.map((fact) => fact.evidenceLevel)).toEqual([
      'L1',
      'L2',
      'L1',
      'L2',
      'L1',
      'L2',
      'L1',
      'L1',
    ]);
    expect(facts[1]).toMatchObject({
      rootSessionId: 'root',
      childSessionId: 'child-completed',
      toolCallId: 'task-completed',
      prompt: { bytes: 14 },
      usage: {
        completeness: 'complete',
        source: 'child_step_finish',
        inputTokens: 11,
        outputTokens: 7,
        totalTokens: 18,
        thoughtTokens: 2,
        cacheReadTokens: 3,
        cacheWriteTokens: 1,
      },
    });
    expect(facts[1]?.limitations).toContain(
      'L3 remains unavailable until one closed model-turn accounting group proves ownership and inherited-copy exclusion.',
    );
  });

  it('maps accepted facts to shared Normalized observations without inventing L3 accounting', () => {
    const facts: VelaChildRuntimeFact[] = [];
    const consumer = newConsumer(facts);
    for (const message of fixture().slice(1)) {
      observe(consumer, updateOf(message));
    }

    const normalized = facts.map((fact) => adaptVelaChildRuntimeFactV1({
      fact,
      agentCliVersion: '1.2.3',
      runtimeCompanionVersion: '1.18.18',
      taskExecutionId: 'task-1',
      runId: 'run-1',
      taskRunIndex: 0,
      taskRunObservationId: 'task-run:run-1:0',
      stage: 'production',
    }));
    expect(facts[0]?.producerVersion).toBe('1.2.3');
    expect(normalized[0]).toMatchObject({
      kind: 'child_agent',
      status: 'running',
      usage: { availability: 'unavailable' },
      timing: { availability: 'partial' },
      attributes: {
        agentCliVersion: '1.2.3',
        runtimeCompanionVersion: '1.18.18',
        runtimeAdapterVersion: VELA_CHILD_EVIDENCE_ADAPTER_VERSION,
        evidenceLevel: 'L1',
        l3Eligible: false,
      },
    });
    expect(normalized[1]).toMatchObject({
      status: 'completed',
      prompt: { childInjected: { availability: 'partial', source: 'acp', bytes: 14 } },
      usage: {
        availability: 'complete',
        source: 'acp',
        accountingMode: 'additive',
        values: { inputTokens: 11, outputTokens: 7, totalTokens: 18, thoughtTokens: 2 },
        valueSources: { inputTokens: 'acp', outputTokens: 'acp', totalTokens: 'acp' },
      },
      timing: { availability: 'complete' },
    });
    expect(normalized[5]).toMatchObject({
      status: 'canceled',
      usage: { availability: 'partial', source: 'acp' },
    });
    expect(normalized[7]).toMatchObject({
      status: 'failed',
      attributes: { nativeStatus: 'timed_out' },
    });
    expect(normalized.every((observation) => observation.turnAccounting === undefined)).toBe(true);
    expect(safeTaskObservationRuntimeVersions(normalized[1]!)).toEqual({
      agentCliVersion: '1.2.3',
      runtimeCompanionVersion: '1.18.18',
      runtimeAdapterVersion: VELA_CHILD_EVIDENCE_ADAPTER_VERSION,
    });
  });

  it('fails closed when the CLI probe and ACP handshake report different Vela versions', () => {
    const facts: VelaChildRuntimeFact[] = [];
    const consumer = newConsumer(facts);
    expect(observe(consumer, updateOf(fixture()[1]!)).accepted).toBe(true);

    expect(() => adaptVelaChildRuntimeFactV1({
      fact: facts[0]!,
      agentCliVersion: 'different-vela-build',
      runtimeCompanionVersion: '1.18.18',
      taskExecutionId: 'task-1',
      runId: 'run-1',
      taskRunIndex: 0,
      taskRunObservationId: 'task-run:run-1:0',
      stage: 'production',
    })).toThrow(/Vela CLI version mismatch/);
  });

  it('uses the real CLI probe when an older Vela handshake reports the 0.0.0 placeholder', () => {
    const facts: VelaChildRuntimeFact[] = [];
    const consumer = createVelaChildEvidenceConsumer({
      onFact: (fact) => facts.push(fact),
      now: () => 9_999,
    });
    const initialize = structuredClone(resultOf(fixture()[0]!));
    (initialize.agentInfo as RecordValue).version = '0.0.0';
    consumer.negotiate(initialize);
    expect(observe(consumer, updateOf(fixture()[1]!)).accepted).toBe(true);
    expect(facts[0]?.producerVersion).toBeUndefined();

    const observation = adaptVelaChildRuntimeFactV1({
      fact: facts[0]!,
      agentCliVersion: 'vela-cli-probed-0.9.1',
      runtimeCompanionVersion: '1.18.18',
      taskExecutionId: 'task-1',
      runId: 'run-1',
      taskRunIndex: 0,
      taskRunObservationId: 'task-run:run-1:0',
      stage: 'production',
    });
    expect(safeTaskObservationRuntimeVersions(observation)).toEqual({
      agentCliVersion: 'vela-cli-probed-0.9.1',
      runtimeCompanionVersion: '1.18.18',
      runtimeAdapterVersion: VELA_CHILD_EVIDENCE_ADAPTER_VERSION,
    });
  });

  it('drops unknown and malicious fields instead of forwarding them', () => {
    const facts: VelaChildRuntimeFact[] = [];
    const consumer = newConsumer(facts);
    expect(observe(consumer, updateOf(fixture()[1]!)).accepted).toBe(true);
    const malicious = {
      ...updateOf(fixture()[2]!),
      secret: 'sk-do-not-forward',
      cwd: '/private/user/workspace',
      sourceEvidence: [
        'root_task_metadata',
        'session.created',
        'child_session_status',
        'attacker.private_log',
      ],
      prompt: {
        ...(updateOf(fixture()[2]!).prompt as RecordValue),
        text: 'Inspect /Users/alice/private/design.ts with sk-test-1234567890123456789012.',
        safePayload: { token: 'secret' },
      },
      usage: {
        ...(updateOf(fixture()[2]!).usage as RecordValue),
        providerResponse: { authorization: 'Bearer secret' },
      },
    };
    expect(observe(consumer, malicious).accepted).toBe(true);
    const serialized = JSON.stringify(facts[1]);
    expect(serialized).not.toContain('sk-do-not-forward');
    expect(serialized).not.toContain('/private/user/workspace');
    expect(serialized).toContain('open-design.child-injected-prompt');
    expect(serialized).toContain('Inspect');
    expect(serialized).toContain('[REDACTED:path]');
    expect(serialized).toContain('[REDACTED:sk_key]');
    expect(serialized).not.toContain('/Users/alice');
    expect(serialized).not.toContain('sk-test-');
    expect(serialized).not.toContain('Bearer secret');
    expect(facts[1]?.sourceEvidence).toEqual([
      'root_task_metadata',
      'session.created',
      'child_session_status',
    ]);
    expect(facts[1]?.limitations).toContain('Unknown source-evidence labels were discarded.');
  });

  it('fails closed for old/unknown schema, wrong ACP session, and malformed known fields', () => {
    const old = createVelaChildEvidenceConsumer();
    old.negotiate({ protocolVersion: 1 });
    expect(observe(old, updateOf(fixture()[1]!))).toMatchObject({
      handled: true,
      accepted: false,
      reason: 'capability_not_negotiated',
    });

    const unknown = createVelaChildEvidenceConsumer();
    unknown.negotiate({
      agentCapabilities: {
        extensions: {
          [VELA_CHILD_EVIDENCE_EXTENSION]: { schemaVersion: 2 },
        },
      },
    });
    expect(observe(unknown, { ...updateOf(fixture()[1]!), schemaVersion: 2 })).toMatchObject({
      handled: true,
      accepted: false,
      reason: 'unsupported_schema_version',
    });

    const consumer = newConsumer();
    expect(observe(consumer, updateOf(fixture()[1]!), 'other-acp-session')).toMatchObject({
      accepted: false,
      reason: 'acp_session_mismatch',
    });
    expect(observe(consumer, {
      ...updateOf(fixture()[1]!),
      toolCallId: 'bad\ntool-call',
    })).toMatchObject({
      accepted: false,
      reason: 'invalid_wire_shape',
    });
  });

  it('rejects unrelated roots, cycles, parent/tool conflicts, regressions, and conflicting terminals', () => {
    const unrelated = newConsumer();
    expect(observe(unrelated, updateOf(fixture()[1]!)).accepted).toBe(true);
    expect(observe(unrelated, {
      ...updateOf(fixture()[3]!),
      parentSessionId: 'unrelated-root',
    })).toMatchObject({ accepted: false, reason: 'root_session_conflict' });

    const cycle = newConsumer();
    expect(observe(cycle, {
      ...updateOf(fixture()[1]!),
      childSessionId: 'root',
    })).toMatchObject({ accepted: false, reason: 'parent_cycle' });

    const parentConflict = newConsumer();
    expect(observe(parentConflict, updateOf(fixture()[1]!)).accepted).toBe(true);
    expect(observe(parentConflict, coherentTerminal({ parentSessionId: 'different-root' })))
      .toMatchObject({ accepted: false, reason: 'parent_conflict' });

    const toolConflict = newConsumer();
    expect(observe(toolConflict, updateOf(fixture()[1]!)).accepted).toBe(true);
    expect(observe(toolConflict, coherentTerminal({ toolCallId: 'different-task' })))
      .toMatchObject({ accepted: false, reason: 'tool_call_rebound' });

    const monotonic = newConsumer();
    expect(observe(monotonic, updateOf(fixture()[1]!)).accepted).toBe(true);
    expect(observe(monotonic, coherentTerminal()).accepted).toBe(true);
    expect(observe(monotonic, {
      ...updateOf(fixture()[1]!),
      evidenceId: 'late-start',
    })).toMatchObject({ accepted: false, reason: 'status_regression' });
    expect(observe(monotonic, coherentTerminal({
      evidenceId: 'conflicting-terminal',
      status: 'failed',
      sourceEvidence: ['child_session_error', 'root_task_metadata', 'session.created'],
    }))).toMatchObject({ accepted: false, reason: 'terminal_conflict' });

    const evidenceConflict = newConsumer();
    expect(observe(evidenceConflict, updateOf(fixture()[1]!)).accepted).toBe(true);
    expect(observe(evidenceConflict, {
      ...updateOf(fixture()[1]!),
      childSessionId: 'other-child',
    })).toMatchObject({ accepted: false, reason: 'evidence_id_conflict' });
  });

  it('rejects terminal-first and incoherent terminal-source combinations', () => {
    const terminalFirstFacts: VelaChildRuntimeFact[] = [];
    const terminalFirst = newConsumer(terminalFirstFacts);
    expect(observe(terminalFirst, updateOf(fixture()[2]!))).toMatchObject({
      accepted: false,
      reason: 'status_regression',
    });
    expect(terminalFirstFacts).toEqual([]);

    const wrongStatusSource = newConsumer();
    expect(observe(wrongStatusSource, updateOf(fixture()[1]!)).accepted).toBe(true);
    expect(observe(wrongStatusSource, {
      ...updateOf(fixture()[2]!),
      status: 'failed',
    })).toMatchObject({ accepted: false, reason: 'invalid_wire_shape' });

    const multipleTerminalSources = newConsumer();
    expect(observe(multipleTerminalSources, updateOf(fixture()[1]!)).accepted).toBe(true);
    expect(observe(multipleTerminalSources, {
      ...updateOf(fixture()[2]!),
      sourceEvidence: [
        'root_task_metadata',
        'session.created',
        'child_session_status',
        'child_session_error',
      ],
    })).toMatchObject({ accepted: false, reason: 'invalid_wire_shape' });

    const wrongTimeoutCompleteness = newConsumer();
    expect(observe(wrongTimeoutCompleteness, updateOf(fixture()[7]!)).accepted).toBe(true);
    expect(observe(wrongTimeoutCompleteness, {
      ...updateOf(fixture()[8]!),
      lifecycleCompleteness: 'complete',
    })).toMatchObject({ accepted: false, reason: 'invalid_wire_shape' });

    const hostIncompleteWithUsage = newConsumer();
    expect(observe(hostIncompleteWithUsage, updateOf(fixture()[7]!)).accepted).toBe(true);
    expect(observe(hostIncompleteWithUsage, {
      ...updateOf(fixture()[8]!),
      usage: updateOf(fixture()[2]!).usage,
    })).toMatchObject({ accepted: false, reason: 'invalid_wire_shape' });
  });

  it('accepts each status-coherent producer terminal source', () => {
    const cases = [
      {
        status: 'completed',
        source: 'root_task_tool',
        lifecycleCompleteness: 'complete',
        evidenceLevel: 'L2',
      },
      {
        status: 'failed',
        source: 'child_session_error',
        lifecycleCompleteness: 'complete',
        evidenceLevel: 'L2',
      },
      {
        status: 'timed_out',
        source: 'child_session_error',
        lifecycleCompleteness: 'complete',
        evidenceLevel: 'L2',
      },
      {
        status: 'cancelled',
        source: 'parent_prompt_cancelled',
        lifecycleCompleteness: 'partial',
        evidenceLevel: 'L1',
      },
    ] as const;
    for (const testCase of cases) {
      const consumer = newConsumer();
      expect(observe(consumer, updateOf(fixture()[1]!)).accepted).toBe(true);
      expect(observe(consumer, coherentTerminal({
        evidenceId: `evidence-${testCase.status}-${testCase.source}`,
        status: testCase.status,
        lifecycleCompleteness: testCase.lifecycleCompleteness,
        sourceEvidence: [
          testCase.source,
          'root_task_metadata',
          'session.created',
        ],
        ...(testCase.source === 'parent_prompt_cancelled'
          ? { usage: { availability: 'unavailable', completeness: 'unavailable' } }
          : {}),
      }))).toMatchObject({
        accepted: true,
        fact: {
          state: testCase.status,
          lifecycleCompleteness: testCase.lifecycleCompleteness,
          evidenceLevel: testCase.evidenceLevel,
        },
      });
    }

    const exportFallback = newConsumer();
    expect(observe(exportFallback, updateOf(fixture()[1]!)).accepted).toBe(true);
    expect(observe(exportFallback, coherentTerminal({
      evidenceId: 'evidence-export-step-finish',
      sourceEvidence: [
        'child_session_status',
        'opencode_export_step_finish',
        'root_task_metadata',
        'session.created',
      ],
      usage: {
        ...(updateOf(fixture()[2]!).usage as RecordValue),
        source: 'opencode_export_step_finish',
      },
    }))).toMatchObject({
      accepted: true,
      fact: { usage: { source: 'opencode_export_step_finish' } },
    });
  });

  it.each([
    ['child_step_finish', 'partial'],
    ['opencode_export_step_finish', 'partial'],
    ['opencode_export_message_snapshot', 'complete'],
  ] as const)('rejects impossible %s usage with %s completeness', (source, completeness) => {
    const consumer = newConsumer();
    expect(observe(consumer, updateOf(fixture()[1]!)).accepted).toBe(true);
    const terminal = coherentTerminal({
      evidenceId: `usage-mismatch-${source}-${completeness}`,
      sourceEvidence: [
        'child_session_status',
        'root_task_metadata',
        'session.created',
        ...(source.startsWith('opencode_export_') ? [source] : []),
      ],
      usage: {
        ...(updateOf(fixture()[2]!).usage as RecordValue),
        source,
        completeness,
      },
    });

    expect(observe(consumer, terminal)).toMatchObject({
      accepted: false,
      reason: 'invalid_wire_shape',
    });
  });

  it.each([
    { completeness: 'complete' },
    { completeness: 'unavailable', source: 'child_step_finish' },
    { completeness: 'unavailable', totalTokens: 18 },
  ])('rejects unavailable usage that carries impossible known evidence %o', (usage) => {
    const consumer = newConsumer();
    expect(observe(consumer, updateOf(fixture()[1]!)).accepted).toBe(true);
    expect(observe(consumer, coherentTerminal({
      evidenceId: `unavailable-usage-mismatch-${JSON.stringify(usage)}`,
      usage: { availability: 'unavailable', ...usage },
    }))).toMatchObject({
      accepted: false,
      reason: 'invalid_wire_shape',
    });
  });
});

describe('Vela OpenCode child evidence coverage', () => {
  function validCoverage(
    consumer: ReturnType<typeof createVelaChildEvidenceConsumer>,
    sessionComplete: boolean,
  ) {
    const coverage = consumer.childEvidenceCoverage({ sessionComplete });
    // The published diagnostic is only useful if downstream aggregation can
    // parse it; an invalid payload degrades back to "unavailable".
    expect(ChildEvidenceCoverageV1Schema.parse(coverage)).toEqual(coverage);
    expect(coverage.source).toBe(VELA_CHILD_EVIDENCE_COVERAGE_SOURCE);
    return coverage;
  }

  it('reports unavailable, never complete, when the capability was never negotiated', () => {
    const consumer = createVelaChildEvidenceConsumer({ now: () => 9_999 });

    const coverage = validCoverage(consumer, true);
    expect(coverage).toMatchObject({
      availability: 'unavailable',
      knownChildCount: 0,
      explicitZero: false,
      limitations: ['vela_child_evidence_capability_not_negotiated'],
    });
    expect(coverage.diagnosticCounts).toContainEqual({
      code: 'child_evidence_capability_not_negotiated',
      count: 1,
    });
  });

  it('reports unavailable when the producer advertised an unsupported schema', () => {
    const consumer = createVelaChildEvidenceConsumer({ now: () => 9_999 });
    consumer.negotiate({
      agentCapabilities: {
        extensions: { [VELA_CHILD_EVIDENCE_EXTENSION]: { schemaVersion: 2 } },
      },
    });

    expect(validCoverage(consumer, true)).toMatchObject({
      availability: 'unavailable',
      explicitZero: false,
      limitations: ['vela_child_evidence_schema_unsupported'],
      diagnosticCounts: [{ code: 'child_evidence_schema_unsupported', count: 1 }],
    });
  });

  it('reports complete with explicitZero once a negotiated run closes with no child', () => {
    const consumer = newConsumer();

    expect(validCoverage(consumer, true)).toEqual({
      availability: 'complete',
      source: VELA_CHILD_EVIDENCE_COVERAGE_SOURCE,
      knownChildCount: 0,
      explicitZero: true,
      limitations: [],
      diagnosticCounts: [],
    });
  });

  it('reports complete for one fully observed child lifecycle', () => {
    const consumer = newConsumer();
    expect(observe(consumer, updateOf(fixture()[1]!)).accepted).toBe(true);
    expect(observe(consumer, updateOf(fixture()[2]!)).accepted).toBe(true);

    expect(validCoverage(consumer, true)).toEqual({
      availability: 'complete',
      source: VELA_CHILD_EVIDENCE_COVERAGE_SOURCE,
      knownChildCount: 1,
      explicitZero: false,
      limitations: [],
      diagnosticCounts: [],
    });
  });

  it('reports partial while a registered child never reached a terminal', () => {
    const consumer = newConsumer();
    expect(observe(consumer, updateOf(fixture()[1]!)).accepted).toBe(true);
    expect(observe(consumer, updateOf(fixture()[3]!)).accepted).toBe(true);
    expect(observe(consumer, updateOf(fixture()[4]!)).accepted).toBe(true);

    const coverage = validCoverage(consumer, true);
    expect(coverage).toMatchObject({
      availability: 'partial',
      knownChildCount: 2,
      explicitZero: false,
      limitations: ['vela_child_terminal_unobserved'],
      diagnosticCounts: [{ code: 'child_terminal_unobserved', count: 1 }],
    });
  });

  it('never claims complete when the ACP turn did not close cleanly', () => {
    const consumer = newConsumer();
    expect(observe(consumer, updateOf(fixture()[1]!)).accepted).toBe(true);
    expect(observe(consumer, updateOf(fixture()[2]!)).accepted).toBe(true);

    expect(validCoverage(consumer, false)).toMatchObject({
      availability: 'partial',
      knownChildCount: 1,
      explicitZero: false,
      limitations: ['vela_child_stream_incomplete'],
      diagnosticCounts: [{ code: 'child_stream_incomplete', count: 1 }],
    });

    const childless = newConsumer();
    expect(validCoverage(childless, false)).toMatchObject({
      availability: 'unavailable',
      knownChildCount: 0,
      explicitZero: false,
    });
  });

  it('carries every rejection reason into diagnosticCounts', () => {
    const consumer = newConsumer();
    expect(observe(consumer, updateOf(fixture()[1]!)).accepted).toBe(true);
    expect(observe(consumer, updateOf(fixture()[2]!)).accepted).toBe(true);
    expect(observe(consumer, updateOf(fixture()[3]!), 'other-acp-session'))
      .toMatchObject({ accepted: false, reason: 'acp_session_mismatch' });
    expect(observe(consumer, { ...updateOf(fixture()[3]!), startedAtMs: 'nope' }))
      .toMatchObject({ accepted: false, reason: 'invalid_wire_shape' });
    expect(observe(consumer, {
      ...updateOf(fixture()[3]!),
      evidenceId: 'unrelated-root',
      parentSessionId: 'other-root',
    })).toMatchObject({ accepted: false, reason: 'root_session_conflict' });

    const coverage = validCoverage(consumer, true);
    expect(coverage.availability).toBe('partial');
    expect(coverage.knownChildCount).toBe(1);
    expect(coverage.explicitZero).toBe(false);
    expect(coverage.diagnosticCounts).toEqual([
      { code: 'child_evidence_rejected_acp_session_mismatch', count: 1 },
      { code: 'child_evidence_rejected_invalid_wire_shape', count: 1 },
      { code: 'child_evidence_rejected_root_session_conflict', count: 1 },
    ]);
    expect(coverage.limitations).toEqual([
      'vela_child_evidence_rejected_acp_session_mismatch',
      'vela_child_evidence_rejected_invalid_wire_shape',
      'vela_child_evidence_rejected_root_session_conflict',
    ]);
  });

  it('counts a repeated rejection reason instead of collapsing it', () => {
    const consumer = createVelaChildEvidenceConsumer({ now: () => 9_999 });
    expect(observe(consumer, updateOf(fixture()[1]!)))
      .toMatchObject({ accepted: false, reason: 'capability_not_negotiated' });
    expect(observe(consumer, updateOf(fixture()[3]!)))
      .toMatchObject({ accepted: false, reason: 'capability_not_negotiated' });

    expect(validCoverage(consumer, true).diagnosticCounts).toEqual([
      { code: 'child_evidence_capability_not_negotiated', count: 1 },
      { code: 'child_evidence_rejected_capability_not_negotiated', count: 2 },
    ]);
  });
});

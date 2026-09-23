import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  evaluateRuntimeEvidenceGraphV1,
  normalizeAgentObservationV1,
} from '@open-design/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adaptRuntimeChildObservationsV1 } from '../../src/observability/runtime-child-observations.js';
import { safeTaskObservationRuntimeVersions } from '../../src/observability/task-observation-aggregation.js';
import {
  OPENCODE_CHILD_EVIDENCE_ADAPTER_VERSION,
  adaptOpenCodeChildRuntimeFactV1,
  collectOpenCodeChildEvidenceFacts,
  collectOpenCodeChildRuntimeFacts,
  createOpenCodeRootTaskEvidenceCollector,
  createOpenCodeSanitizedExportLoader,
  OPENCODE_CHILD_EVIDENCE_CLI_VERSION,
  verifyOpenCodeChildExport,
  type OpenCodeChildRuntimeFact,
  type OpenCodeTaskTerminalCandidate,
} from '../../src/runtimes/opencode-child-evidence.js';
import { createJsonEventStreamHandler } from '../../src/runtimes/json-event-stream.js';

const execAgentFileMock = vi.hoisted(() => vi.fn());
vi.mock('../../src/runtimes/invocation.js', () => ({
  execAgentFile: execAgentFileMock,
}));

const fixturePath = fileURLToPath(new URL(
  '../fixtures/od-next-runtime-capabilities/opencode-1.18.18.synthetic.json',
  import.meta.url,
));
const sanitizedRealSeedPath = fileURLToPath(new URL(
  '../fixtures/od-next-runtime-capabilities/opencode-1.18.18.sanitized-real-seed.json',
  import.meta.url,
));

function fixture(): {
  fixtureKind: string;
  rootSessionId: string;
  frames: unknown[];
  sanitizedChildExport: unknown;
} {
  return JSON.parse(readFileSync(fixturePath, 'utf8'));
}

function collectCandidate(overrides: Record<string, unknown> = {}): OpenCodeTaskTerminalCandidate[] {
  const data = fixture();
  const candidates: OpenCodeTaskTerminalCandidate[] = [];
  const collector = createOpenCodeRootTaskEvidenceCollector({
    rootSessionId: data.rootSessionId,
    cliVersion: OPENCODE_CHILD_EVIDENCE_CLI_VERSION,
    now: () => 1786723202000,
    onCandidate: (candidate) => candidates.push(candidate),
  });
  for (const frame of data.frames) {
    collector.observe({ ...(frame as Record<string, unknown>), ...overrides });
  }
  return candidates;
}

const ADAPT_INPUT = {
  taskExecutionId: 'task-1',
  runId: 'run-1',
  taskRunIndex: 0,
  taskRunObservationId: 'task-run:task-1:run-1',
  stage: 'production',
} as const;

const L1_OBSERVATION_ID = 'opencode-child-candidate:run-1:ses_child_synthetic';
const L2_OBSERVATION_ID = 'opencode-child:run-1:ses_child_synthetic';

function diagnosticEvent(
  name: string,
  payload: Record<string, unknown>,
): { event: string; data: unknown } {
  return { event: 'agent', data: { type: 'diagnostic', name, ...payload } };
}

/** Rebuild the Run event stream exactly as the daemon publishes it. */
function runEvents(
  candidate: OpenCodeTaskTerminalCandidate,
  facts: readonly OpenCodeChildRuntimeFact[] = [],
): Array<{ event: string; data: unknown }> {
  return [
    diagnosticEvent('opencode_child_task_candidate', { ...candidate }),
    ...facts.map((fact) => diagnosticEvent('opencode_child_runtime_fact', { ...fact })),
  ];
}

function taskRunParent(status: 'running' | 'completed') {
  return normalizeAgentObservationV1({
    identity: {
      observationId: ADAPT_INPUT.taskRunObservationId,
      taskExecutionId: ADAPT_INPUT.taskExecutionId,
      runId: ADAPT_INPUT.runId,
      taskRunIndex: ADAPT_INPUT.taskRunIndex,
    },
    kind: 'task_run',
    stage: 'production',
    status,
    limitations: ['synthetic_contract_parent'],
  });
}

describe('native OpenCode child evidence', () => {
  beforeEach(() => {
    execAgentFileMock.mockReset();
  });

  it('replays local success, recovered failure, and resume seeds without promoting production evidence', () => {
    const seed = JSON.parse(readFileSync(sanitizedRealSeedPath, 'utf8')) as {
      fixtureKind: string;
      evidenceReview: string;
      recordingDigest: string;
      caseCoverage: Array<{
        caseId: string;
        outcome: string;
        minimumEvidence: string;
        nativeChildTerminal?: string;
        evidence: Record<string, unknown>;
      }>;
      cases: Array<{
        caseId: string;
        candidate: OpenCodeTaskTerminalCandidate;
        variant?: string;
        parentRecovered?: boolean;
        resumeLink?: {
          priorToolCallId: string;
          currentToolCallId: string;
          taskId: string;
        };
        sanitizedChildExport: unknown;
      }>;
    };
    expect(seed.fixtureKind).toBe('sanitized_real_best_effort');
    expect(seed.evidenceReview).toBe('open_design_best_effort');
    expect(seed.recordingDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    const { recordingDigest: _recordingDigest, ...digestInput } = structuredClone(seed);
    expect(seed.recordingDigest).toBe(
      `sha256:${createHash('sha256').update(JSON.stringify(digestInput)).digest('hex')}`,
    );
    expect(seed.caseCoverage.map((entry) => entry.caseId)).toEqual([
      'main_run',
      'tool',
      'child_success',
      'child_failure_parent_recovers',
      'cancel',
      'timeout',
      'resume',
    ]);
    expect(seed.caseCoverage).toEqual(expect.arrayContaining([
      expect.objectContaining({ caseId: 'cancel', outcome: 'passed', minimumEvidence: 'L0', nativeChildTerminal: 'unavailable' }),
      expect.objectContaining({ caseId: 'timeout', outcome: 'passed', minimumEvidence: 'L0', nativeChildTerminal: 'unavailable' }),
      expect.objectContaining({ caseId: 'resume', outcome: 'passed', minimumEvidence: 'L0' }),
    ]));
    const coverage = Object.fromEntries(
      seed.caseCoverage.map((entry) => [entry.caseId, entry.evidence]),
    );
    expect(coverage['main_run']).toMatchObject({
      rootSessionId: 'root-success',
      terminalFinish: 'stop',
      terminalError: false,
    });
    expect(Number(coverage['main_run']?.['completedAtMs'])).toBeGreaterThan(
      Number(coverage['main_run']?.['startedAtMs']),
    );
    expect(coverage['tool']).toMatchObject({
      rootSessionId: 'root-success',
      childSessionId: 'child-success',
      toolCallId: 'call-success',
      status: 'completed',
    });
    expect(Number(coverage['tool']?.['endedAtMs'])).toBeGreaterThan(
      Number(coverage['tool']?.['startedAtMs']),
    );
    expect(coverage['child_failure_parent_recovers']).toMatchObject({
      rootSessionId: 'root-failure',
      childSessionId: 'child-failure',
      toolCallId: 'call-failure',
      childTerminal: 'failed',
      parentTerminal: 'completed',
      parentError: false,
    });
    expect(Number(coverage['child_failure_parent_recovers']?.['parentTerminalAtMs']))
      .toBeGreaterThan(Number(coverage['child_failure_parent_recovers']?.['childTerminalAtMs']));
    expect(coverage['cancel']).toMatchObject({
      hostRunStatus: 'canceled',
      hostSignal: 'SIGKILL',
      childExitedBeforeReturn: true,
      processGroupDescendantExited: true,
    });
    expect(coverage['timeout']).toMatchObject({
      hostRunStatus: 'failed',
      terminalTrigger: 'inactivity_watchdog',
      errorCode: 'AGENT_EXECUTION_FAILED',
      processGroupTerminationRequested: 'SIGTERM',
    });
    expect(coverage['resume']).toMatchObject({
      rootSessionId: 'root-success',
      childSessionId: 'child-success',
      priorToolCallId: 'call-success',
      priorTaskId: null,
      resumeToolCallId: 'call-resume',
      resumeTaskId: 'child-success',
      resumeTerminal: 'completed',
    });
    expect(Number(coverage['resume']?.['resumeStartedAtMs']))
      .toBeGreaterThan(Number(coverage['resume']?.['priorEndedAtMs']));
    expect(seed.cases.map((entry) => entry.caseId)).toEqual([
      'child_success',
      'child_failure_parent_recovers',
      'resume',
    ]);
    const [success, failure, resume] = seed.cases;
    expect(success).toMatchObject({
      variant: 'high',
      candidate: {
        cliVersion: '1.18.18',
        promptHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        promptBytes: 88,
        model: { providerId: 'openai', modelId: 'gpt-5.6-sol' },
      },
    });
    expect(verifyOpenCodeChildExport({
      candidate: success!.candidate,
      sanitizedExport: success!.sanitizedChildExport,
    })).toMatchObject([
      { state: 'started' },
      {
        state: 'completed',
        usage: { inputTokens: 9011, outputTokens: 7 },
      },
    ]);
    expect(failure!.parentRecovered).toBe(true);
    const failedFacts = verifyOpenCodeChildExport({
      candidate: failure!.candidate,
      sanitizedExport: failure!.sanitizedChildExport,
    });
    expect(failedFacts).toMatchObject([
      { state: 'started' },
      { state: 'failed' },
    ]);
    expect(failedFacts[1]?.usage).toBeUndefined();
    expect(resume).toMatchObject({
      resumeLink: {
        priorToolCallId: success?.candidate.toolCallId,
        currentToolCallId: resume?.candidate.toolCallId,
        taskId: success?.candidate.childSessionId,
      },
      variant: 'high',
      candidate: {
        cliVersion: '1.18.18',
        rootSessionId: success?.candidate.rootSessionId,
        childSessionId: success?.candidate.childSessionId,
        promptHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        promptBytes: 59,
      },
    });
    expect(verifyOpenCodeChildExport({
      candidate: resume!.candidate,
      sanitizedExport: resume!.sanitizedChildExport,
    })).toMatchObject([
      { state: 'started' },
      {
        state: 'completed',
        usage: { inputTokens: 9039, outputTokens: 7 },
      },
    ]);
    const serialized = JSON.stringify(seed);
    expect(serialized).not.toContain('/Users/');
    expect(serialized).not.toContain('/private/');
    expect(serialized).not.toContain('sk-');
  });

  it('captures a terminal native Task candidate with only bounded redacted Prompt text', () => {
    const [candidate] = collectCandidate();
    expect(candidate).toMatchObject({
      cliVersion: '1.18.18',
      rootSessionId: 'ses_root_synthetic',
      childSessionId: 'ses_child_synthetic',
      toolCallId: 'call_task_synthetic',
      state: 'completed',
      startedAtMs: 1786723200000,
      endedAtMs: 1786723201250,
      promptBytes: 35,
    });
    expect(candidate?.promptHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(candidate?.promptSafePayload).toMatchObject({
      type: 'open-design.child-injected-prompt',
      messageCount: 1,
    });
    expect(JSON.stringify(candidate)).toContain('Inspect the synthetic fixture');
  });

  it('requires the root stream id and Task parent metadata to agree', () => {
    const data = fixture();
    const frame = structuredClone(data.frames[1]) as Record<string, unknown>;
    const part = frame.part as Record<string, unknown>;
    const state = part.state as Record<string, unknown>;
    state.metadata = {
      ...(state.metadata as Record<string, unknown>),
      parentSessionId: 'ses_unrelated',
    };
    const candidates: OpenCodeTaskTerminalCandidate[] = [];
    const collector = createOpenCodeRootTaskEvidenceCollector({
      rootSessionId: data.rootSessionId,
      cliVersion: '1.18.18',
      onCandidate: (candidate) => candidates.push(candidate),
    });
    collector.observe(frame);
    expect(candidates).toEqual([]);
  });

  it('learns a create-turn root id and keeps the verified adapter across CLI version drift', () => {
    const data = fixture();
    const candidates: OpenCodeTaskTerminalCandidate[] = [];
    const collector = createOpenCodeRootTaskEvidenceCollector({
      cliVersion: '1.18.18',
      onCandidate: (candidate) => candidates.push(candidate),
    });
    for (const frame of data.frames) collector.observe(frame);
    expect(candidates).toHaveLength(1);

    const drifted: OpenCodeTaskTerminalCandidate[] = [];
    const driftedCollector = createOpenCodeRootTaskEvidenceCollector({
      cliVersion: '1.19.0-beta.2',
      onCandidate: (candidate) => drifted.push(candidate),
    });
    for (const frame of data.frames) driftedCollector.observe(frame);
    expect(drifted).toHaveLength(1);
    expect(drifted[0]).toMatchObject({
      adapterVersion: OPENCODE_CHILD_EVIDENCE_ADAPTER_VERSION,
      cliVersion: '1.19.0-beta.2',
    });
    expect(verifyOpenCodeChildExport({
      candidate: drifted[0]!,
      sanitizedExport: data.sanitizedChildExport,
    })).toHaveLength(2);
  });

  it('reports complete explicit-zero coverage only after a complete identified stream', () => {
    const data = fixture();
    const empty = createOpenCodeRootTaskEvidenceCollector({
      cliVersion: 'future-version-without-semver',
      onCandidate: () => {},
    });
    empty.observe(data.frames[0]);
    expect(empty.coverage(true)).toEqual({
      availability: 'complete',
      source: 'opencode_json_event_stream',
      knownChildCount: 0,
      explicitZero: true,
      limitations: [],
      diagnosticCounts: [],
    });

    const incomplete = createOpenCodeRootTaskEvidenceCollector({
      cliVersion: '',
      onCandidate: () => {},
    });
    expect(incomplete.coverage(false)).toMatchObject({
      availability: 'unavailable',
      explicitZero: false,
      limitations: ['opencode_root_session_unavailable'],
    });
  });

  it.each([
    ['explicit background', '[background task started]'],
    ['foreground promoted to background', '[foreground task promoted]'],
  ])('does not promote %s root tool completion to a Child terminal', (_label, output) => {
    const data = fixture();
    const frame = structuredClone(data.frames[1]) as Record<string, unknown>;
    const part = frame.part as Record<string, unknown>;
    const state = part.state as Record<string, unknown>;
    state.output = output;
    state.metadata = {
      ...(state.metadata as Record<string, unknown>),
      background: true,
    };
    const candidates: OpenCodeTaskTerminalCandidate[] = [];
    const collector = createOpenCodeRootTaskEvidenceCollector({
      rootSessionId: data.rootSessionId,
      cliVersion: '1.18.18',
      onCandidate: (candidate) => candidates.push(candidate),
    });
    collector.observe(frame);
    expect(candidates).toEqual([]);
    expect(collector.coverage(true)).toMatchObject({
      availability: 'partial',
      knownChildCount: 1,
      explicitZero: false,
      limitations: ['opencode_child_terminal_unobserved'],
      diagnosticCounts: [{ code: 'child_terminal_unobserved', count: 1 }],
    });
  });

  it.each([
    ['Cancelled', 'canceled'],
    ['Task cancelled', 'canceled'],
    ['Child provider failed', 'failed'],
  ] as const)('maps an explicit native Task error %s to %s', (error, expected) => {
    const data = fixture();
    const frame = structuredClone(data.frames[1]) as Record<string, unknown>;
    const part = frame.part as Record<string, unknown>;
    const state = part.state as Record<string, unknown>;
    state.status = 'error';
    state.error = error;
    const candidates: OpenCodeTaskTerminalCandidate[] = [];
    createOpenCodeRootTaskEvidenceCollector({
      rootSessionId: data.rootSessionId,
      cliVersion: '1.18.18',
      onCandidate: (candidate) => candidates.push(candidate),
    }).observe(frame);
    expect(candidates[0]?.state).toBe(expected);
  });

  it('keeps timeout-looking and unclassified empty Task errors unknown', () => {
    const data = fixture();
    for (const error of ['Task timed out', '']) {
      const frame = structuredClone(data.frames[1]) as Record<string, unknown>;
      const part = frame.part as Record<string, unknown>;
      const state = part.state as Record<string, unknown>;
      state.status = 'error';
      state.error = error;
      const candidates: OpenCodeTaskTerminalCandidate[] = [];
      createOpenCodeRootTaskEvidenceCollector({
        rootSessionId: data.rootSessionId,
        cliVersion: '1.18.18',
        onCandidate: (candidate) => candidates.push(candidate),
      }).observe(frame);
      expect(candidates).toEqual([]);
    }
  });

  it('rejects unrelated and single-evidence sanitized exports', () => {
    const [candidate] = collectCandidate();
    expect(candidate).toBeDefined();
    expect(verifyOpenCodeChildExport({
      candidate: candidate!,
      sanitizedExport: {
        info: { id: candidate!.childSessionId, parentID: 'ses_other_root' },
        messages: [],
      },
    })).toEqual([]);
    expect(verifyOpenCodeChildExport({
      candidate: candidate!,
      sanitizedExport: {
        info: { id: 'ses_other_child', parentID: candidate!.rootSessionId },
        messages: [],
      },
    })).toEqual([]);
  });

  it('emits one started and one terminal fact with independent child usage', () => {
    const data = fixture();
    const [candidate] = collectCandidate();
    const facts = verifyOpenCodeChildExport({
      candidate: candidate!,
      sanitizedExport: data.sanitizedChildExport,
    });
    expect(facts.map((fact) => fact.state)).toEqual(['started', 'completed']);
    expect(facts[1]?.usage).toEqual({
      inputTokens: 11,
      outputTokens: 7,
      thoughtTokens: 3,
      cacheReadTokens: 5,
      cacheWriteTokens: 2,
    });
  });

  it('attributes usage only to child messages inside the native Task time window', () => {
    const data = fixture();
    const [candidate] = collectCandidate();
    const exported = structuredClone(data.sanitizedChildExport) as Record<string, unknown>;
    exported.messages = [
      {
        info: {
          role: 'assistant',
          sessionID: candidate!.childSessionId,
          time: { created: candidate!.startedAtMs! - 1 },
          tokens: { input: 100, output: 100 },
        },
      },
      ...(exported.messages as unknown[]),
      {
        info: {
          role: 'assistant',
          sessionID: 'ses_unrelated_child',
          time: { created: candidate!.startedAtMs! + 1 },
          tokens: { input: 200, output: 200 },
        },
      },
    ];
    const facts = verifyOpenCodeChildExport({
      candidate: candidate!,
      sanitizedExport: exported,
    });
    expect(facts[1]?.usage).toEqual({
      inputTokens: 11,
      outputTokens: 7,
      thoughtTokens: 3,
      cacheReadTokens: 5,
      cacheWriteTokens: 2,
    });
  });

  it('post-run collection requests only the declared child and absorbs lookup failure', async () => {
    const data = fixture();
    const [candidate] = collectCandidate();
    const loader = vi.fn(async () => data.sanitizedChildExport);
    await expect(collectOpenCodeChildRuntimeFacts({
      candidate: candidate!,
      loadSanitizedExport: loader,
    })).resolves.toHaveLength(2);
    expect(loader).toHaveBeenCalledWith('ses_child_synthetic');
    expect(loader).toHaveBeenCalledTimes(1);

    await expect(collectOpenCodeChildRuntimeFacts({
      candidate: candidate!,
      loadSanitizedExport: async () => { throw new Error('export unavailable'); },
    })).resolves.toEqual([]);
  });

  it('does not invent started or usage facts when the native fields are absent', () => {
    const data = fixture();
    const [candidate] = collectCandidate();
    const {
      startedAtMs: _startedAtMs,
      endedAtMs: _endedAtMs,
      ...candidateWithoutTiming
    } = candidate!;
    const facts = verifyOpenCodeChildExport({
      candidate: candidateWithoutTiming,
      sanitizedExport: {
        ...(data.sanitizedChildExport as Record<string, unknown>),
        messages: [],
      },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ state: 'completed' });
    expect(facts[0]?.usage).toBeUndefined();
  });

  it('keeps running Task parts and host cancellation unclaimed without a child id', () => {
    const data = fixture();
    const frame = structuredClone(data.frames[1]) as Record<string, unknown>;
    const part = frame.part as Record<string, unknown>;
    const state = part.state as Record<string, unknown>;
    state.status = 'running';
    const candidates: OpenCodeTaskTerminalCandidate[] = [];
    const collector = createOpenCodeRootTaskEvidenceCollector({
      rootSessionId: data.rootSessionId,
      cliVersion: '1.18.18',
      onCandidate: (candidate) => candidates.push(candidate),
    });
    collector.observe(frame);
    expect(candidates).toEqual([]);
  });

  it('keeps parser output stable when the side-channel callback throws', () => {
    const data = fixture();
    const events: Array<Record<string, unknown>> = [];
    const handler = createJsonEventStreamHandler('opencode', (event) => events.push(event), {
      openCodeChildEvidence: {
        rootSessionId: data.rootSessionId,
        cliVersion: '1.18.18',
        onCandidate: () => { throw new Error('observer failed'); },
      },
    });
    handler.feed(`${data.frames.map((frame) => JSON.stringify(frame)).join('\n')}\n`);
    handler.flush();
    expect(events).toEqual([
      { type: 'status', label: 'running', sessionId: 'ses_root_synthetic' },
      {
        type: 'tool_use',
        id: 'call_task_synthetic',
        name: 'task',
        input: {
          description: 'Synthetic child',
          prompt: 'Inspect the synthetic fixture only.',
          subagent_type: 'explore',
        },
      },
      {
        type: 'tool_result',
        toolUseId: 'call_task_synthetic',
        content: '[redacted:tool-output:task]',
        isError: false,
      },
    ]);
  });

  it('normalizes verified facts as L2 child lifecycle without claiming L3 turns', () => {
    const data = fixture();
    const [candidate] = collectCandidate();
    const observations = verifyOpenCodeChildExport({
      candidate: candidate!,
      sanitizedExport: data.sanitizedChildExport,
    }).map((fact) => adaptOpenCodeChildRuntimeFactV1({
      fact,
      taskExecutionId: 'task-1',
      runId: 'run-1',
      taskRunIndex: 0,
      taskRunObservationId: 'task-run:task-1:run-1',
      stage: 'production',
    }));
    expect(observations[1]).toMatchObject({
      kind: 'child_agent',
      status: 'completed',
      usage: { accountingMode: 'additive', availability: 'complete' },
      prompt: { childInjected: { availability: 'partial' } },
      attributes: {
        agentCliVersion: '1.18.18',
        runtimeAdapterVersion: OPENCODE_CHILD_EVIDENCE_ADAPTER_VERSION,
      },
    });
    expect(observations[1]?.attributes).not.toHaveProperty('runtimeCliVersion');
    expect(safeTaskObservationRuntimeVersions(observations[1]!)).toEqual({
      agentCliVersion: '1.18.18',
      runtimeAdapterVersion: OPENCODE_CHILD_EVIDENCE_ADAPTER_VERSION,
    });
    expect(observations[1]?.turnAccounting).toBeUndefined();
    const parent = normalizeAgentObservationV1({
      identity: {
        observationId: 'task-run:task-1:run-1',
        taskExecutionId: 'task-1',
        runId: 'run-1',
        taskRunIndex: 0,
      },
      kind: 'task_run',
      stage: 'production',
      status: 'running',
      limitations: ['synthetic_contract_parent'],
    });
    const graph = evaluateRuntimeEvidenceGraphV1([parent, ...observations]);
    expect(graph).toMatchObject({ valid: true, evidenceLevel: 'L2', countedTurnIds: [] });
  });

  it('promotes the verified export to a paired L2 child lifecycle under the task Run', async () => {
    const data = fixture();
    const [candidate] = collectCandidate();
    const facts = await collectOpenCodeChildEvidenceFacts({
      candidates: [candidate!],
      loadSanitizedExport: async () => data.sanitizedChildExport,
    });
    const observations = adaptRuntimeChildObservationsV1({
      events: runEvents(candidate!, facts),
      ...ADAPT_INPUT,
    });

    // One child, one observation id, both halves of the lifecycle in replay
    // order — the exact shape `child_started_missing` was firing on.
    expect(observations.map((observation) => ([
      observation.identity.observationId,
      observation.status,
    ]))).toEqual([
      [L2_OBSERVATION_ID, 'running'],
      [L2_OBSERVATION_ID, 'completed'],
    ]);
    expect(observations.every((observation) => (
      observation.kind === 'child_agent'
      && observation.identity.parentObservationId === ADAPT_INPUT.taskRunObservationId
      && observation.identity.runtimeSessionId === 'ses_child_synthetic'
    ))).toBe(true);
    // The bounded childInjected Prompt the L1 candidate already provided must
    // survive the upgrade rather than being traded away for the export.
    expect(observations[1]?.prompt.childInjected).toMatchObject({
      availability: 'partial',
      source: 'runtime',
      bytes: 35,
    });
    expect(observations[1]?.usage).toMatchObject({
      availability: 'complete',
      accountingMode: 'additive',
    });

    const graph = evaluateRuntimeEvidenceGraphV1([
      taskRunParent('running'),
      ...observations,
      taskRunParent('completed'),
    ]);
    expect(graph).toMatchObject({
      valid: true,
      evidenceLevel: 'L2',
      issues: [],
      childObservationIds: [L2_OBSERVATION_ID],
    });
  });

  it('keeps the unchanged L1 candidate when the child export is unavailable', async () => {
    const [candidate] = collectCandidate();
    const facts = await collectOpenCodeChildEvidenceFacts({
      candidates: [candidate!],
      loadSanitizedExport: async () => { throw new Error('export unavailable'); },
    });
    expect(facts).toEqual([]);

    const observations = adaptRuntimeChildObservationsV1({
      events: runEvents(candidate!, facts),
      ...ADAPT_INPUT,
    });
    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      identity: {
        observationId: L1_OBSERVATION_ID,
        parentObservationId: ADAPT_INPUT.taskRunObservationId,
      },
      kind: 'child_agent',
      status: 'completed',
      attributes: { evidenceLevel: 'L1' },
    });
    expect(observations[0]?.prompt.childInjected).toMatchObject({
      availability: 'exact',
      bytes: 35,
    });

    const graph = evaluateRuntimeEvidenceGraphV1([taskRunParent('running'), ...observations]);
    expect(graph.evidenceLevel).not.toBe('L2');
    expect(graph.issues).toContainEqual({
      code: 'child_started_missing',
      observationId: L1_OBSERVATION_ID,
    });
  });

  it('falls back to the L1 candidate when the export yields only half a lifecycle', async () => {
    const data = fixture();
    const [candidate] = collectCandidate();
    const { startedAtMs: _startedAtMs, ...withoutStart } = candidate!;
    const facts = await collectOpenCodeChildEvidenceFacts({
      candidates: [withoutStart],
      loadSanitizedExport: async () => data.sanitizedChildExport,
    });
    expect(facts.map((fact) => fact.state)).toEqual(['completed']);

    // A terminal-only L2 id would fail the graph on `child_started_missing`
    // while displacing the candidate that still carries the Prompt, so the
    // half lifecycle is dropped whole.
    const observations = adaptRuntimeChildObservationsV1({
      events: runEvents(candidate!, facts),
      ...ADAPT_INPUT,
    });
    expect(observations).toHaveLength(1);
    expect(observations[0]?.identity.observationId).toBe(L1_OBSERVATION_ID);
  });

  it('absorbs malformed child facts instead of throwing into the parent Run', async () => {
    const data = fixture();
    const [candidate] = collectCandidate();
    const facts = await collectOpenCodeChildEvidenceFacts({
      candidates: [candidate!],
      loadSanitizedExport: async () => data.sanitizedChildExport,
    });
    const events = [
      diagnosticEvent('opencode_child_task_candidate', { ...candidate! }),
      // Adapter drift, a truncated fact, and an unparseable payload.
      ...facts.map((fact) => diagnosticEvent('opencode_child_runtime_fact', {
        ...fact,
        adapterVersion: 'od-opencode-child-evidence/v9',
      })),
      diagnosticEvent('opencode_child_runtime_fact', { childSessionId: 'ses_child_synthetic' }),
      diagnosticEvent('opencode_child_runtime_fact', {}),
    ];

    let observations: ReturnType<typeof adaptRuntimeChildObservationsV1> = [];
    expect(() => {
      observations = adaptRuntimeChildObservationsV1({ events, ...ADAPT_INPUT });
    }).not.toThrow();
    expect(observations).toHaveLength(1);
    expect(observations[0]?.identity.observationId).toBe(L1_OBSERVATION_ID);
  });

  it('requests each child exactly once and stops at the shared wall-clock budget', async () => {
    const data = fixture();
    const [candidate] = collectCandidate();
    // A resumed native Task reports the same child session under a new tool
    // call id; its export is identical and must not be read twice.
    const resumed = { ...candidate!, toolCallId: 'call_task_resume' };
    const loader = vi.fn(async () => data.sanitizedChildExport);
    await expect(collectOpenCodeChildEvidenceFacts({
      candidates: [candidate!, resumed],
      loadSanitizedExport: loader,
    })).resolves.toHaveLength(2);
    expect(loader).toHaveBeenCalledTimes(1);

    let clock = 0;
    const budgeted = vi.fn(async () => data.sanitizedChildExport);
    await expect(collectOpenCodeChildEvidenceFacts({
      candidates: [candidate!, { ...candidate!, childSessionId: 'ses_child_second' }],
      loadSanitizedExport: budgeted,
      totalBudgetMs: 5,
      now: () => (clock += 10),
    })).resolves.toEqual([]);
    expect(budgeted).not.toHaveBeenCalled();
  });

  it('reads one child through the sanitized OpenCode export without running plugins', async () => {
    const data = fixture();
    execAgentFileMock.mockResolvedValue({
      stdout: JSON.stringify(data.sanitizedChildExport),
      stderr: 'Exporting session: ses_child_synthetic',
    });
    const load = createOpenCodeSanitizedExportLoader({
      launchPath: '/opt/open-design/opencode',
      env: { XDG_DATA_HOME: '/run/od/share' },
    });

    await expect(load('ses_child_synthetic')).resolves.toMatchObject({
      info: { id: 'ses_child_synthetic', parentID: 'ses_root_synthetic' },
    });
    expect(execAgentFileMock).toHaveBeenCalledWith(
      '/opt/open-design/opencode',
      ['export', 'ses_child_synthetic', '--sanitize', '--pure'],
      expect.objectContaining({
        env: { XDG_DATA_HOME: '/run/od/share' },
        timeout: expect.any(Number),
        maxBuffer: expect.any(Number),
      }),
    );

    // An id that is not shaped like a native session id never reaches argv.
    await expect(load('--version')).rejects.toThrow(/Unsupported OpenCode child session id/u);
    await expect(load('../../etc/passwd')).rejects.toThrow(/Unsupported OpenCode child session id/u);
    expect(execAgentFileMock).toHaveBeenCalledTimes(1);

    // A non-JSON export degrades through the collector, never into the Run.
    execAgentFileMock.mockResolvedValue({ stdout: 'Session not found', stderr: '' });
    const [candidate] = collectCandidate();
    await expect(collectOpenCodeChildEvidenceFacts({
      candidates: [candidate!],
      loadSanitizedExport: load,
    })).resolves.toEqual([]);
  });

  it('labels the fixture contract-only so it cannot become production evidence', () => {
    expect(fixture().fixtureKind).toBe('contract_only');
  });
});

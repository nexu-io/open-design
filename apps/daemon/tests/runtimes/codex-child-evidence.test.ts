import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateRuntimeEvidenceGraphV1,
  evaluateRuntimeFixtureCaseV1,
  normalizeAgentObservationV1,
  type NormalizedAgentObservationV1,
} from '@open-design/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { collectCodexChildEvidence } from '../../src/runtimes/codex-child-evidence.js';

const PARENT = '10000000-0000-4000-8000-000000000001';
const CHILD = '20000000-0000-4000-8000-000000000002';
const GRANDCHILD = '30000000-0000-4000-8000-000000000003';
const SIBLING = '40000000-0000-4000-8000-000000000004';
const BASE_TIME = Date.parse('2026-08-14T00:00:00.000Z');
const sanitizedRealSeedPath = fileURLToPath(new URL(
  '../fixtures/od-next-runtime-capabilities/codex-0.147.0.sanitized-real-seed.json',
  import.meta.url,
));

const temporaryRoots: string[] = [];

function timestamp(offsetMs: number): string {
  return new Date(BASE_TIME + offsetMs).toISOString();
}

function metadata(
  sessionId: string,
  parentSessionId?: string,
  nestedParentSessionId = parentSessionId,
): Record<string, unknown> {
  return {
    timestamp: timestamp(0),
    type: 'session_meta',
    payload: {
      id: sessionId,
      ...(parentSessionId ? { parent_thread_id: parentSessionId } : {}),
      ...(nestedParentSessionId
        ? {
            source: {
              subagent: {
                thread_spawn: { parent_thread_id: nestedParentSessionId },
              },
            },
          }
        : {}),
    },
  };
}

function event(offsetMs: number, payload: Record<string, unknown>): Record<string, unknown> {
  return { timestamp: timestamp(offsetMs), type: 'event_msg', payload };
}

function turn(input: {
  id: string;
  startedAtMs: number;
  prompt?: string;
  usage?: Record<string, number>;
  childActivities?: Array<{ sessionId: string; kind: string; atMs: number }>;
  terminal?: 'complete' | 'complete-failed' | 'abort-canceled' | 'abort-failed' | 'none';
}): Array<Record<string, unknown>> {
  const records: Array<Record<string, unknown>> = [
    event(input.startedAtMs, { type: 'task_started', turn_id: input.id }),
  ];
  if (input.prompt !== undefined) {
    records.push(event(input.startedAtMs + 10, { type: 'user_message', message: input.prompt }));
  }
  if (input.usage) {
    records.push(event(input.startedAtMs + 20, {
      type: 'token_count',
      info: {
        last_token_usage: input.usage,
        total_token_usage: input.usage,
      },
    }));
  }
  for (const activity of input.childActivities ?? []) {
    records.push(event(activity.atMs, {
      type: 'sub_agent_activity',
      agent_thread_id: activity.sessionId,
      kind: activity.kind,
      occurred_at_ms: BASE_TIME + activity.atMs,
    }));
  }
  if (input.terminal === 'abort-canceled' || input.terminal === 'abort-failed') {
    records.push(event(input.startedAtMs + 900, {
      type: 'turn_aborted',
      reason: input.terminal === 'abort-canceled' ? 'interrupted' : 'runtime_error',
    }));
  } else if (input.terminal !== 'none') {
    records.push(event(input.startedAtMs + 900, {
      type: 'task_complete',
      turn_id: input.id,
      ...(input.terminal === 'complete-failed'
        ? {
            error: {
              message: 'stream disconnected before response.completed',
              codex_error_info: 'other',
            },
          }
        : {}),
    }));
  }
  return records;
}

async function codexHome(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'od-codex-child-evidence-'));
  temporaryRoots.push(root);
  return root;
}

async function writeRollout(
  home: string,
  sessionId: string,
  records: readonly Record<string, unknown>[],
  date = '2026/08/14',
): Promise<string> {
  const directory = path.join(home, 'sessions', ...date.split('/'));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filePath = path.join(directory, `rollout-${date.replaceAll('/', '-')}-${sessionId}.jsonl`);
  await writeFile(filePath, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, {
    mode: 0o600,
  });
  return filePath;
}

function collectInput(home: string, overrides: Record<string, unknown> = {}) {
  return {
    codexHome: home,
    parentSessionId: PARENT,
    parentTurnId: 'parent-turn',
    taskExecutionId: 'task-1',
    runId: 'run-1',
    taskRunIndex: 0,
    stage: 'production' as const,
    parentObservationId: 'root',
    runStartedAtMs: BASE_TIME,
    runEndedAtMs: BASE_TIME + 10_000,
    ...overrides,
  };
}

function root(
  status: NormalizedAgentObservationV1['status'],
  runtimeSessionId = PARENT,
): NormalizedAgentObservationV1 {
  return normalizeAgentObservationV1({
    identity: {
      observationId: 'root',
      taskExecutionId: 'task-1',
      runId: 'run-1',
      taskRunIndex: 0,
      runtimeSessionId,
    },
    kind: 'task_run',
    stage: 'production',
    status,
    limitations: [],
  });
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((rootPath) => (
    rm(rootPath, { recursive: true, force: true })
  )));
});

describe('collectCodexChildEvidence', () => {
  it('replays the exact Codex 0.147.0 best-effort success, started failure, and cancel records', async () => {
    const seed = JSON.parse(readFileSync(sanitizedRealSeedPath, 'utf8')) as {
      fixtureKind: string;
      cliVersion: string;
      sourceTag: string;
      sourceCommit: string;
      recordingDigest: string;
      evidenceReview: string;
      caseCoverage: Array<{
        caseId: string;
        outcome: string;
        minimumEvidence: string;
        evidence: Record<string, unknown>;
      }>;
      replayCases: Array<{
        caseId: 'child_success' | 'child_failure_parent_recovers' | 'cancel';
        parentSessionId: string;
        parentTurnId: string;
        childSessionId: string;
        parentRollout: Record<string, unknown>[];
        childRollout: Record<string, unknown>[];
      }>;
    };
    expect(seed).toMatchObject({
      fixtureKind: 'sanitized_real_best_effort',
      cliVersion: 'codex-cli 0.147.0',
      sourceTag: 'rust-v0.147.0',
      sourceCommit: 'be6e8eac029b183056b7e4402879f15d2c85f61b',
      evidenceReview: 'open_design_best_effort',
    });
    const { recordingDigest: _recordingDigest, ...digestInput } = structuredClone(seed);
    expect(seed.recordingDigest).toBe(
      `sha256:${createHash('sha256').update(JSON.stringify(digestInput)).digest('hex')}`,
    );
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
    const coverage = Object.fromEntries(
      seed.caseCoverage.map(({ caseId, evidence }) => [caseId, evidence]),
    );
    expect(coverage['child_failure_parent_recovers']).toMatchObject({
      childTerminal: 'failed',
      terminalErrorCode: 'other',
      parentTerminal: 'completed',
      parentError: false,
    });
    expect(Number(coverage['child_failure_parent_recovers']?.['parentTerminalAtMs']))
      .toBeGreaterThan(Number(coverage['child_failure_parent_recovers']?.['childTerminalAtMs']));
    expect(coverage['cancel']).toMatchObject({
      parentActivityKind: 'interrupted',
      childAbortReason: 'interrupted',
      childTerminal: 'canceled',
    });
    expect(coverage['timeout']).toMatchObject({
      hostRunStatus: 'failed',
      hostSignal: 'SIGTERM',
      nativeTerminalObserved: false,
    });
    expect(coverage['resume']).toMatchObject({
      priorTurnId: 'child-success-turn',
      resumeTurnId: 'child-resume-turn',
      resumeTerminal: 'completed',
    });
    expect(Number(coverage['resume']?.['resumeStartedAtMs']))
      .toBeGreaterThan(Number(coverage['resume']?.['priorTerminalAtMs']));
    expect(JSON.stringify(seed)).not.toMatch(
      /\/Users\/|\/home\/|BEGIN [A-Z ]+PRIVATE KEY|sk-[A-Za-z0-9]/u,
    );

    for (const replay of seed.replayCases) {
      const home = await codexHome();
      await writeRollout(home, replay.parentSessionId, replay.parentRollout);
      await writeRollout(home, replay.childSessionId, replay.childRollout);
      const result = await collectCodexChildEvidence(collectInput(home, {
        parentSessionId: replay.parentSessionId,
        parentTurnId: replay.parentTurnId,
        agentCliVersion: seed.cliVersion,
        runStartedAtMs: Date.parse(String(replay.parentRollout[1]?.timestamp)),
        runEndedAtMs: Date.parse(String(replay.parentRollout.at(-1)?.timestamp)),
      }));
      const expectedStatus = replay.caseId === 'child_success'
        ? 'completed'
        : replay.caseId === 'cancel'
          ? 'canceled'
          : 'failed';
      const terminal = result.observations.find((observation) => (
        observation.kind === 'child_agent' && observation.status === expectedStatus
      ));
      expect(terminal).toMatchObject({
        status: expectedStatus,
        identity: { runtimeSessionId: replay.childSessionId },
        attributes: {
          agentCliVersion: 'codex-cli 0.147.0',
          terminalEvidence: replay.caseId === 'cancel'
            ? 'parent_sub_agent_activity'
            : 'child_task_complete',
        },
      });
      if (replay.caseId !== 'cancel') {
        expect(evaluateRuntimeFixtureCaseV1(replay.caseId, [
          root('running', replay.parentSessionId),
          ...result.observations,
          root('completed', replay.parentSessionId),
        ])).toMatchObject({ outcome: 'passed' });
      }
    }
  });

  it('collects declared child and grandchild lifecycles with bounded redacted Prompt text', async () => {
    const home = await codexHome();
    const secretPrompt =
      'Inspect /Users/alice/private/design.ts with sk-test-1234567890123456789012.';
    await writeRollout(home, PARENT, [
      metadata(PARENT),
      ...turn({
        id: 'parent-turn',
        startedAtMs: 100,
        terminal: 'none',
        childActivities: [
          { sessionId: CHILD, kind: 'started', atMs: 1_000 },
          { sessionId: CHILD, kind: 'completed', atMs: 6_000 },
        ],
      }),
    ]);
    await writeRollout(home, CHILD, [
      metadata(CHILD, PARENT),
      ...turn({ id: 'parent-turn', startedAtMs: 100, terminal: 'complete' }),
      ...turn({
        id: 'child-turn',
        startedAtMs: 2_000,
        prompt: secretPrompt,
        usage: { input_tokens: 11, output_tokens: 7, cached_input_tokens: 3 },
        childActivities: [
          { sessionId: GRANDCHILD, kind: 'started', atMs: 3_000 },
          { sessionId: GRANDCHILD, kind: 'completed', atMs: 5_000 },
        ],
      }),
    ]);
    await writeRollout(home, GRANDCHILD, [
      metadata(GRANDCHILD, CHILD),
      ...turn({
        id: 'grandchild-turn',
        startedAtMs: 3_500,
        prompt: 'grandchild prompt',
        usage: { input_tokens: 5, output_tokens: 2 },
      }),
    ]);

    const result = await collectCodexChildEvidence(collectInput(home));
    const serialized = JSON.stringify(result);
    const graph = evaluateRuntimeEvidenceGraphV1([
      root('running'),
      ...result.observations,
      root('completed'),
    ]);

    expect(result.observations.filter((observation) => (
      observation.kind === 'child_agent' && observation.status === 'completed'
    ))).toHaveLength(2);
    expect(graph).toMatchObject({ valid: true, evidenceLevel: 'L3' });
    expect(evaluateRuntimeFixtureCaseV1('child_success', [
      root('running'),
      ...result.observations,
      root('completed'),
    ])).toMatchObject({ outcome: 'passed' });
    expect(serialized).not.toContain(secretPrompt);
    expect(serialized).not.toContain(home);
    expect(serialized).toContain('open-design.child-injected-prompt');
    expect(serialized).toContain('Inspect');
    expect(serialized).toContain('[REDACTED:path]');
    expect(serialized).toContain('[REDACTED:sk_key]');
    expect(serialized).not.toContain('/Users/alice');
    expect(serialized).not.toContain('sk-test-');
    expect(result.limitations).toContain('codex_inherited_turn_excluded');

    const depthLimited = await collectCodexChildEvidence(collectInput(home, {
      maxRecursionDepth: 1,
    }));
    expect(depthLimited.diagnostics).toContainEqual({
      code: 'child_recursion_depth_exceeded',
      count: 1,
    });
    expect(depthLimited.observations.some((observation) => (
      observation.identity.runtimeSessionId === GRANDCHILD
    ))).toBe(false);
  });

  it('uses the Child task_complete error and turn_aborted status for failure and cancel evidence', async () => {
    const home = await codexHome();
    await writeRollout(home, PARENT, [
      metadata(PARENT),
      ...turn({
        id: 'parent-turn',
        startedAtMs: 100,
        terminal: 'none',
        childActivities: [
          { sessionId: CHILD, kind: 'started', atMs: 1_000 },
          { sessionId: SIBLING, kind: 'started', atMs: 1_500 },
        ],
      }),
    ]);
    for (const [sessionId, prompt, terminal] of [
      [CHILD, 'failed child', 'complete-failed'],
      [SIBLING, 'canceled child', 'abort-canceled'],
    ] as const) {
      await writeRollout(home, sessionId, [
        metadata(sessionId, PARENT),
        ...turn({
          id: `${sessionId}-turn`,
          startedAtMs: sessionId === CHILD ? 2_000 : 2_500,
          prompt,
          usage: { input_tokens: 2, output_tokens: 1 },
          terminal,
        }),
      ]);
    }

    const result = await collectCodexChildEvidence(collectInput(home));
    const childStatuses = result.observations
      .filter((observation) => observation.kind === 'child_agent')
      .map((observation) => observation.status);
    const fixture = evaluateRuntimeFixtureCaseV1('child_failure_parent_recovers', [
      root('running'),
      ...result.observations,
      root('completed'),
    ]);

    expect(childStatuses).toContain('failed');
    expect(childStatuses).toContain('canceled');
    expect(fixture).toMatchObject({ outcome: 'passed' });
    expect(result.observations).toContainEqual(expect.objectContaining({
      kind: 'child_agent',
      status: 'failed',
      attributes: expect.objectContaining({ terminalEvidence: 'child_task_complete' }),
    }));

    const sessionLimited = await collectCodexChildEvidence(collectInput(home, {
      maxChildSessions: 1,
    }));
    expect(sessionLimited.diagnostics).toContainEqual({
      code: 'child_session_limit_exceeded',
      count: 1,
    });
    expect(new Set(sessionLimited.observations.map((observation) => (
      observation.identity.runtimeSessionId
    )))).toEqual(new Set([CHILD]));
  });

  it('rejects missing, mismatched, and cyclic parent declarations', async () => {
    const home = await codexHome();
    await writeRollout(home, PARENT, [
      metadata(PARENT),
      ...turn({
        id: 'parent-turn',
        startedAtMs: 100,
        terminal: 'none',
        childActivities: [
          { sessionId: CHILD, kind: 'started', atMs: 1_000 },
          { sessionId: SIBLING, kind: 'started', atMs: 1_100 },
        ],
      }),
    ]);
    await writeRollout(home, CHILD, [
      metadata(CHILD, PARENT),
      ...turn({
        id: 'child-turn',
        startedAtMs: 2_000,
        prompt: 'valid',
        usage: { input_tokens: 1, output_tokens: 1 },
        childActivities: [{ sessionId: PARENT, kind: 'started', atMs: 2_500 }],
      }),
    ]);
    await writeRollout(home, SIBLING, [
      metadata(SIBLING, GRANDCHILD),
      ...turn({ id: 'sibling-turn', startedAtMs: 2_000 }),
    ]);

    const result = await collectCodexChildEvidence(collectInput(home));

    expect(result.observations.some((observation) => (
      observation.identity.runtimeSessionId === SIBLING
    ))).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      { code: 'child_cycle_rejected', count: 1 },
      { code: 'child_parent_mismatch', count: 1 },
    ]));
    expect(result.limitations).toEqual(expect.arrayContaining([
      'codex_child_cycle_rejected',
      'codex_child_parent_unverified',
    ]));
  });

  it('keeps one incomplete child partial even when another child terminates', async () => {
    const home = await codexHome();
    await writeRollout(home, PARENT, [
      metadata(PARENT),
      ...turn({
        id: 'parent-turn',
        startedAtMs: 100,
        terminal: 'none',
        childActivities: [
          { sessionId: CHILD, kind: 'started', atMs: 1_000 },
          { sessionId: CHILD, kind: 'completed', atMs: 6_000 },
          { sessionId: SIBLING, kind: 'started', atMs: 1_500 },
          { sessionId: SIBLING, kind: 'future_unknown_kind', atMs: 6_500 },
        ],
      }),
    ]);
    await writeRollout(home, CHILD, [
      metadata(CHILD, PARENT),
      ...turn({ id: 'child-turn', startedAtMs: 2_000 }),
    ]);
    await writeRollout(home, SIBLING, [
      metadata(SIBLING, PARENT),
      ...turn({ id: 'sibling-turn', startedAtMs: 2_500, terminal: 'none' }),
    ]);

    const result = await collectCodexChildEvidence(collectInput(home));

    expect(result.availability).toBe('partial');
    expect(result.limitations).toContain('codex_child_terminal_not_observed');
    const siblingLifecycle = result.observations.filter((observation) => (
      observation.identity.runtimeSessionId === SIBLING && observation.kind === 'child_agent'
    ));
    expect(siblingLifecycle.map((observation) => observation.status)).toEqual(['running']);
  });

  it('gives every turn of a re-invoked child its own lifecycle instead of one shared terminal', async () => {
    const home = await codexHome();
    await writeRollout(home, PARENT, [
      metadata(PARENT),
      ...turn({
        id: 'parent-turn',
        startedAtMs: 100,
        terminal: 'none',
        childActivities: [
          { sessionId: CHILD, kind: 'started', atMs: 1_000 },
          { sessionId: CHILD, kind: 'completed', atMs: 6_000 },
        ],
      }),
    ]);
    await writeRollout(home, CHILD, [
      metadata(CHILD, PARENT),
      ...turn({ id: 'child-turn-1', startedAtMs: 2_000 }),
      ...turn({ id: 'child-turn-2', startedAtMs: 4_000 }),
    ]);

    const result = await collectCodexChildEvidence(collectInput(home));

    // A parent re-invokes a sub-agent, and each invocation opens another turn
    // in the child's rollout, so this is the ordinary shape of one delegated
    // package. Treating it as ambiguous discarded every Child of a real complex
    // Run. Each turn still has to read its OWN terminal: the parent recorded a
    // single `completed`, which belongs to the turn it landed in, while the
    // earlier turn takes the terminal its own rollout recorded.
    const lifecycles = new Map<string, string[]>();
    for (const observation of result.observations) {
      if (observation.kind !== 'child_agent') continue;
      const key = observation.identity.observationId;
      lifecycles.set(key, [...(lifecycles.get(key) ?? []), observation.status]);
    }
    expect(lifecycles.size).toBe(2);
    for (const statuses of lifecycles.values()) {
      expect(statuses).toEqual(['running', 'completed']);
    }
    expect(result.limitations).not.toContain('codex_child_turn_ambiguous');
    expect(result.diagnostics).toEqual([]);
    // Two turns, one Child. `knownChildCount` answers "how many Children ran",
    // the same question OpenCode's `knownChildIds.size` answers, so a Child its
    // parent re-entered must not inflate it.
    expect(result.knownChildCount).toBe(1);
  });

  it('fails closed on undeclared roots, unsafe files, ambiguous rotation, and scan bounds', async () => {
    const home = await codexHome();
    const parentRecords = [
      metadata(PARENT),
      ...turn({ id: 'parent-turn', startedAtMs: 100 }),
    ];
    const parentPath = await writeRollout(home, PARENT, parentRecords);

    await expect(collectCodexChildEvidence(collectInput(home))).resolves.toMatchObject({
      availability: 'complete',
      observations: [],
      limitations: [],
      diagnostics: [],
    });

    await expect(collectCodexChildEvidence(collectInput(home, { codexHome: undefined })))
      .resolves.toMatchObject({
        availability: 'unavailable',
        diagnostics: [{ code: 'codex_home_not_declared', count: 1 }],
      });

    await chmod(parentPath, 0o666);
    await expect(collectCodexChildEvidence(collectInput(home))).resolves.toMatchObject({
      availability: 'unavailable',
      diagnostics: [{ code: 'unsafe_rollout_file', count: 1 }],
    });
    await chmod(parentPath, 0o600);

    await writeRollout(home, PARENT, parentRecords, '2026/08/13');
    await expect(collectCodexChildEvidence(collectInput(home))).resolves.toMatchObject({
      availability: 'unavailable',
      diagnostics: [{ code: 'rollout_ambiguous', count: 1 }],
    });

    const boundedHome = await codexHome();
    await mkdir(path.join(boundedHome, 'sessions', '2026', '08', '14'), {
      recursive: true,
      mode: 0o700,
    });
    await writeRollout(boundedHome, PARENT, parentRecords, '2026/08/13');
    await expect(collectCodexChildEvidence(collectInput(boundedHome, {
      maxDayDirectories: 1,
    }))).resolves.toMatchObject({
      availability: 'unavailable',
      diagnostics: [{ code: 'rollout_rotation_window_exhausted', count: 1 }],
    });
  });

  it('does not follow rollout symlinks or accept conflicting parent metadata', async () => {
    const home = await codexHome();
    await writeRollout(home, PARENT, [
      metadata(PARENT),
      ...turn({
        id: 'parent-turn',
        startedAtMs: 100,
        terminal: 'none',
        childActivities: [{ sessionId: CHILD, kind: 'started', atMs: 1_000 }],
      }),
    ]);
    const outside = path.join(home, 'outside.jsonl');
    await writeFile(outside, `${JSON.stringify(metadata(CHILD, PARENT))}\n`, { mode: 0o600 });
    const day = path.join(home, 'sessions', '2026', '08', '14');
    await symlink(outside, path.join(day, `rollout-symlink-${CHILD}.jsonl`));

    const symlinkResult = await collectCodexChildEvidence(collectInput(home));
    expect(symlinkResult.observations).toEqual([]);
    expect(symlinkResult.diagnostics).toContainEqual({ code: 'rollout_not_found', count: 1 });

    await rm(path.join(day, `rollout-symlink-${CHILD}.jsonl`));
    await writeRollout(home, CHILD, [
      metadata(CHILD, PARENT),
      metadata(CHILD, GRANDCHILD),
      ...turn({ id: 'child-turn', startedAtMs: 2_000 }),
    ]);
    const conflictResult = await collectCodexChildEvidence(collectInput(home));
    expect(conflictResult.observations).toEqual([]);
    expect(conflictResult.diagnostics).toContainEqual({
      code: 'parent_declaration_conflict',
      count: 1,
    });
  });

  it('fails closed on conflicting parent terminal states while deduplicating one state', async () => {
    const home = await codexHome();
    const childRecords = [
      metadata(CHILD, PARENT),
      ...turn({
        id: 'child-turn',
        startedAtMs: 2_000,
        prompt: 'terminal conflict child',
        usage: { input_tokens: 2, output_tokens: 1 },
      }),
    ];
    await writeRollout(home, CHILD, childRecords);
    await writeRollout(home, PARENT, [
      metadata(PARENT),
      ...turn({
        id: 'parent-turn',
        startedAtMs: 100,
        terminal: 'none',
        childActivities: [
          { sessionId: CHILD, kind: 'started', atMs: 1_000 },
          { sessionId: CHILD, kind: 'completed', atMs: 5_000 },
          { sessionId: CHILD, kind: 'completed', atMs: 5_500 },
        ],
      }),
    ]);

    const duplicateResult = await collectCodexChildEvidence(collectInput(home));
    const completed = duplicateResult.observations.find((observation) => (
      observation.kind === 'child_agent' && observation.status === 'completed'
    ));
    expect(completed?.timing.evidence?.[0]?.endedAtMs).toBe(BASE_TIME + 5_500);
    expect(duplicateResult.diagnostics).not.toContainEqual({
      code: 'child_terminal_status_conflict',
      count: 1,
    });

    await writeRollout(home, PARENT, [
      metadata(PARENT),
      ...turn({
        id: 'parent-turn',
        startedAtMs: 100,
        terminal: 'none',
        childActivities: [
          { sessionId: CHILD, kind: 'started', atMs: 1_000 },
          { sessionId: CHILD, kind: 'completed', atMs: 5_000 },
          { sessionId: CHILD, kind: 'failed', atMs: 6_000 },
        ],
      }),
    ]);

    const conflictResult = await collectCodexChildEvidence(collectInput(home));
    expect(conflictResult.availability).toBe('partial');
    expect(conflictResult.limitations).toContain('codex_child_terminal_status_conflict');
    expect(conflictResult.diagnostics).toContainEqual({
      code: 'child_terminal_status_conflict',
      count: 1,
    });
    expect(conflictResult.observations.some((observation) => (
      observation.kind === 'child_agent' &&
      ['completed', 'failed', 'canceled'].includes(observation.status)
    ))).toBe(false);
    expect(conflictResult.observations).toContainEqual(expect.objectContaining({
      kind: 'model_call',
      status: 'unknown',
    }));
  });
});

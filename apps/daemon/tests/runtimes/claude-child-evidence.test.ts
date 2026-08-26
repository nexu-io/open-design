import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateRuntimeEvidenceGraphV1 } from '@open-design/contracts';
import { describe, expect, it } from 'vitest';

import { buildStructuredMainRunObservationV1 } from '../../src/observability/main-run-observation.js';
import { adaptMainRunToolObservationsV1 } from '../../src/observability/runtime-child-observations.js';
import { safeTaskObservationRuntimeVersions } from '../../src/observability/task-observation-aggregation.js';
import {
  CLAUDE_CHILD_EVIDENCE_ADAPTER_VERSION,
  adaptClaudeChildRuntimeFactV1,
  adaptClaudeChildToolRuntimeFactV1,
  createClaudeChildEvidenceCollector,
  type ClaudeChildRuntimeFact,
  type ClaudeChildToolRuntimeFact,
} from '../../src/runtimes/claude-child-evidence.js';
import { createClaudeStreamHandler } from '../../src/runtimes/claude-stream.js';

type Fixture = {
  provenance: 'test_synthetic';
  containsSensitiveContent: false;
  cases: Record<string, unknown[]>;
};

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'od-next-runtime-capabilities',
  'claude-code.synthetic.json',
);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture;

function replay(caseId: string, opts?: {
  finish?: 'complete' | 'canceled' | 'timeout' | 'stream_incomplete';
}) {
  const mainEvents: Array<Record<string, unknown>> = [];
  const facts: ClaudeChildRuntimeFact[] = [];
  let now = 1000;
  const handler = createClaudeStreamHandler(
    (event) => mainEvents.push(event),
    {
      onChildRuntimeFact: (fact) => facts.push(fact),
      childEvidenceNow: () => {
        now += 10;
        return now;
      },
    },
  );
  for (const frame of fixture.cases[caseId] ?? []) {
    handler.feed(`${JSON.stringify(frame)}\n`);
  }
  handler.flush();
  if (opts?.finish) handler.finishOpenChildEvidence(opts.finish);
  return { mainEvents, facts, coverage: handler.childEvidenceCoverage() };
}

function root(status: 'running' | 'completed') {
  return buildStructuredMainRunObservationV1({
    taskExecutionId: 'task-execution-1',
    runId: 'run-1',
    taskRunIndex: 1,
    runtimeSessionId: 'session-synthetic',
    stage: 'production',
    status,
    startedAtMs: 900,
    ...(status === 'completed' ? { endedAtMs: 1100 } : {}),
  });
}

function adapt(fact: ClaudeChildRuntimeFact) {
  return adaptClaudeChildRuntimeFactV1({
    fact,
    agentCliVersion: '2.1.219 (Claude Code)',
    taskExecutionId: 'task-execution-1',
    runId: 'run-1',
    taskRunIndex: 1,
    taskRunObservationId: 'task-run:task-execution-1:run-1',
    stage: 'production',
  });
}

function collect(
  frames: unknown[],
  finish?: 'complete' | 'canceled' | 'timeout' | 'stream_incomplete',
): ClaudeChildRuntimeFact[] {
  const facts: ClaudeChildRuntimeFact[] = [];
  let now = 2000;
  const collector = createClaudeChildEvidenceCollector({
    onFact: (fact) => facts.push(fact),
    now: () => {
      now += 10;
      return now;
    },
  });
  for (const frame of frames) collector.observe(frame);
  if (finish) collector.finishOpenChildren(finish);
  return facts;
}

function evaluate(facts: ClaudeChildRuntimeFact[]) {
  return evaluateRuntimeEvidenceGraphV1([
    root('running'),
    ...facts.map(adapt),
    root('completed'),
  ]);
}

describe('Claude native Child evidence side channel', () => {
  it('observes Child tools while suppressing forwarded Child text and tool payloads from the parent stream', () => {
    const mainEvents: Array<Record<string, unknown>> = [];
    const childFacts: ClaudeChildRuntimeFact[] = [];
    const toolFacts: ClaudeChildToolRuntimeFact[] = [];
    let now = 10_000;
    const handler = createClaudeStreamHandler(
      (event) => mainEvents.push(event),
      {
        onChildRuntimeFact: (fact) => childFacts.push(fact),
        onChildToolRuntimeFact: (fact) => toolFacts.push(fact),
        suppressForwardedSubagentEvents: true,
        childEvidenceNow: () => {
          now += 10;
          return now;
        },
      },
    );
    const frames = [
      {
        type: 'system', subtype: 'init', session_id: 'session-child-tools',
        claude_code_version: '2.1.233',
      },
      {
        type: 'assistant', parent_tool_use_id: null,
        message: {
          content: [{
            type: 'tool_use', id: 'agent-call-raw', name: 'Agent',
            input: { prompt: 'Inspect the build safely.', subagent_type: 'od-build-1' },
          }],
          stop_reason: 'tool_use',
        },
      },
      {
        type: 'assistant', parent_tool_use_id: 'agent-call-raw',
        message: {
          content: [
            { type: 'text', text: 'CHILD_TEXT_MUST_NOT_REACH_PARENT' },
            {
              type: 'tool_use', id: 'child-tool-call-raw', name: 'Bash',
              input: { command: 'printf CHILD_TOOL_INPUT_MUST_NOT_EXPORT' },
            },
          ],
          stop_reason: 'tool_use',
        },
      },
      {
        type: 'user', parent_tool_use_id: 'agent-call-raw',
        message: {
          content: [{
            type: 'tool_result', tool_use_id: 'child-tool-call-raw',
            content: 'CHILD_TOOL_OUTPUT_MUST_NOT_EXPORT',
          }],
        },
      },
      {
        type: 'user', parent_tool_use_id: null,
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'agent-call-raw', content: 'done' }],
        },
        tool_use_result: {
          status: 'completed', agentId: 'native-child-1', agentType: 'od-build-1',
          resolvedModel: 'claude-haiku-4-5',
          usage: { input_tokens: 7, output_tokens: 3 },
        },
      },
    ];
    for (const frame of frames) handler.feed(`${JSON.stringify(frame)}\n`);
    handler.flush();

    expect(childFacts.map((fact) => fact.state)).toEqual(['started', 'completed']);
    expect(toolFacts.map((fact) => [fact.toolName, fact.state])).toEqual([
      ['Bash', 'started'],
      ['Bash', 'completed'],
    ]);
    expect(toolFacts[1]?.toolCallHash).toMatch(/^[a-f0-9]{64}$/);
    const toolObservation = adaptClaudeChildToolRuntimeFactV1({
      fact: toolFacts[1]!,
      agentCliVersion: '2.1.233 (Claude Code)',
      taskExecutionId: 'task-execution-1',
      runId: 'run-1',
      taskRunIndex: 1,
      stage: 'production',
    });
    expect(toolObservation).toMatchObject({
      kind: 'tool',
      status: 'completed',
      identity: { parentObservationId: 'claude-child:run-1:agent-call-raw' },
      attributes: { toolName: 'Bash' },
    });
    const serialized = JSON.stringify({ mainEvents, toolObservation });
    expect(serialized).not.toContain('CHILD_TEXT_MUST_NOT_REACH_PARENT');
    expect(serialized).not.toContain('CHILD_TOOL_INPUT_MUST_NOT_EXPORT');
    expect(serialized).not.toContain('CHILD_TOOL_OUTPUT_MUST_NOT_EXPORT');
    expect(serialized).not.toContain('child-tool-call-raw');
    expect(mainEvents).toContainEqual(expect.objectContaining({ type: 'tool_use', name: 'Agent' }));
    expect(mainEvents).not.toContainEqual(expect.objectContaining({ name: 'Bash' }));
  });

  it('normalizes parent Agent tool behavior for every runtime without retaining arguments or results', () => {
    const observations = adaptMainRunToolObservationsV1({
      events: [
        {
          event: 'agent', timestamp: 1_000,
          data: { type: 'tool_use', id: 'raw-parent-call', name: 'Read', input: { path: '/secret' } },
        },
        {
          event: 'agent', timestamp: 1_020,
          data: { type: 'tool_result', toolUseId: 'raw-parent-call', content: 'secret output' },
        },
      ],
      taskExecutionId: 'task-execution-1',
      runId: 'run-1',
      taskRunIndex: 1,
      taskRunObservationId: 'task-run:task-execution-1:run-1',
      stage: 'production',
      agentCliVersion: 'runtime 1.0.0',
      runtimeAdapterVersion: 'adapter/v1',
    });
    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      kind: 'tool',
      status: 'completed',
      identity: { parentObservationId: 'task-run:task-execution-1:run-1' },
      attributes: { toolName: 'Read', agentCliVersion: 'runtime 1.0.0' },
    });
    const serialized = JSON.stringify(observations);
    expect(serialized).not.toContain('raw-parent-call');
    expect(serialized).not.toContain('/secret');
    expect(serialized).not.toContain('secret output');
  });

  it('normalizes a matched Task sidechain lifecycle to L2 without inventing Prompt or usage', () => {
    const { mainEvents, facts } = replay('child_success');

    expect(facts.map((fact) => [fact.childId, fact.state])).toEqual([
      ['task-success', 'started'],
      ['task-success', 'completed'],
    ]);
    const observations = [root('running'), ...facts.map(adapt), root('completed')];
    const graph = evaluateRuntimeEvidenceGraphV1(observations);
    expect(graph).toMatchObject({ valid: true, evidenceLevel: 'L2' });
    expect(observations[2]).toMatchObject({
      prompt: { childInjected: { availability: 'unavailable' } },
      usage: { availability: 'unavailable', accountingMode: 'unknown' },
      attributes: {
        agentCliVersion: '2.1.219 (Claude Code)',
        runtimeAdapterVersion: CLAUDE_CHILD_EVIDENCE_ADAPTER_VERSION,
      },
    });
    expect(safeTaskObservationRuntimeVersions(observations[2]!)).toEqual({
      agentCliVersion: '2.1.219 (Claude Code)',
      runtimeAdapterVersion: CLAUDE_CHILD_EVIDENCE_ADAPTER_VERSION,
    });
    expect(mainEvents).toContainEqual({ type: 'turn_end', stopReason: 'tool_use' });
    expect(mainEvents).toContainEqual({ type: 'turn_end', stopReason: 'end_turn' });
  });

  it('normalizes the real Claude 2.1.233 Agent tool/result shape with safe Prompt and independent usage', () => {
    const facts = collect([
      {
        type: 'system',
        subtype: 'init',
        session_id: 'session-real-shape',
        claude_code_version: '2.1.233',
      },
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [{
            type: 'tool_use',
            id: 'agent-success',
            name: 'Agent',
            input: {
              prompt: 'Inspect /Users/example/private.txt with token sk-test-1234567890123456789012 and answer safely.',
              subagent_type: 'general-purpose',
              model: 'haiku',
              isolation: 'remote',
            },
          }],
          stop_reason: 'tool_use',
        },
      },
      {
        type: 'user',
        message: {
          content: [{
            type: 'tool_result',
            tool_use_id: 'agent-success',
            content: [{ type: 'text', text: 'sanitized child result' }],
          }],
        },
        tool_use_result: {
          status: 'completed',
          agentId: 'native-agent-1',
          agentType: 'general-purpose',
          resolvedModel: 'claude-haiku-4-5',
          totalDurationMs: 321,
          totalTokens: 15,
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 2,
            output_tokens_details: { thinking_tokens: 1 },
          },
        },
      },
    ]);

    expect(facts.map((fact) => fact.state)).toEqual(['started', 'completed']);
    expect(JSON.stringify(facts)).not.toContain('/Users/example/private.txt');
    expect(JSON.stringify(facts)).not.toContain('sk-test-1234567890123456789012');
    const terminal = adapt(facts[1]!);
    expect(terminal).toMatchObject({
      status: 'completed',
      prompt: {
        childInjected: {
          availability: 'exact',
          source: 'provider_stream',
          safePayload: {
            type: 'open-design.child-injected-prompt',
            messages: [{
              redactedContent: expect.stringContaining('[REDACTED:path]'),
            }],
          },
        },
        agentEffectiveContext: { availability: 'unobservable' },
      },
      usage: {
        availability: 'complete',
        source: 'provider_stream',
        accountingMode: 'unknown',
        values: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          thoughtTokens: 1,
          cacheReadTokens: 2,
          cacheWriteTokens: 0,
        },
      },
      attributes: {
        runtimeReportedVersion: '2.1.233',
        nativeAgentId: 'native-agent-1',
        nativeAgentType: 'general-purpose',
        model: 'claude-haiku-4-5',
      },
    });
    expect(evaluate(facts)).toMatchObject({ valid: true, evidenceLevel: 'L2' });
  });

  it('uses a root Agent tool_result error as explicit Child failure while leaving parent recovery to the main stream', () => {
    const facts = collect([
      { type: 'system', subtype: 'init', session_id: 'session-failure', claude_code_version: '2.1.233' },
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [{
            type: 'tool_use',
            id: 'agent-failure',
            name: 'Agent',
            input: { prompt: 'Return a controlled failure.', subagent_type: 'failure-agent' },
          }],
          stop_reason: 'tool_use',
        },
      },
      {
        type: 'user',
        message: {
          content: [{
            type: 'tool_result',
            tool_use_id: 'agent-failure',
            content: 'controlled provider failure',
            is_error: true,
          }],
        },
        tool_use_result: 'controlled provider failure',
      },
    ]);

    expect(facts.map((fact) => fact.state)).toEqual(['started', 'failed']);
    expect(facts[1]).toMatchObject({
      sourceEventType: 'user.tool_result',
      terminationReason: 'assistant_error',
    });
  });

  it('attaches a Build Package only through a daemon-owned native agent handle binding', () => {
    const facts: ClaudeChildRuntimeFact[] = [];
    const collector = createClaudeChildEvidenceCollector({
      onFact: (fact) => facts.push(fact),
      now: () => 100,
      nativeBuildPackageBindings: { 'od-package-a': 'package-a' },
    });
    collector.observe({ type: 'system', subtype: 'init', session_id: 'session-package' });
    collector.observe({
      type: 'assistant',
      parent_tool_use_id: null,
      message: {
        content: [{
          type: 'tool_use',
          id: 'agent-package',
          name: 'Agent',
          input: {
            prompt: 'The prose claims package-b but is not an ownership source.',
            subagent_type: 'od-package-a',
          },
        }],
        stop_reason: 'tool_use',
      },
    });

    expect(facts[0]).toMatchObject({ buildPackageId: 'package-a' });
    expect(adapt(facts[0]!)).toMatchObject({
      attributes: { buildPackageId: 'package-a', nativeAgentType: 'od-package-a' },
    });
  });

  it('keeps child failure separate while the parent main turn recovers', () => {
    const { mainEvents, facts } = replay('child_failure_parent_recovers');

    expect(facts.map((fact) => fact.state)).toEqual(['started', 'failed']);
    expect(facts[1]).toMatchObject({ terminationReason: 'assistant_error' });
    expect(mainEvents.filter((event) => event.type === 'error')).toEqual([]);
    expect(mainEvents.filter((event) => event.type === 'turn_end')).toEqual([
      { type: 'turn_end', stopReason: 'tool_use' },
      { type: 'turn_end', stopReason: 'end_turn' },
    ]);
  });

  it('tracks multiple stable native Task ids and emits exactly one terminal per child', () => {
    const { facts } = replay('multiple_children');

    expect(facts.map((fact) => `${fact.childId}:${fact.state}`)).toEqual([
      'task-a:started',
      'task-b:started',
      'task-a:completed',
      'task-b:completed',
    ]);
  });

  it('accepts an idempotent repeat of the same session, Task id, and parent tuple', () => {
    const taskFrame = {
      type: 'assistant',
      parent_tool_use_id: null,
      message: {
        content: [{ type: 'tool_use', id: 'task-repeat', name: 'Task', input: {} }],
        stop_reason: 'tool_use',
      },
    };
    const facts = collect([
      { type: 'system', subtype: 'init', session_id: 'session-repeat' },
      taskFrame,
      taskFrame,
      {
        type: 'assistant',
        parent_tool_use_id: 'task-repeat',
        message: { content: [], stop_reason: 'end_turn' },
      },
    ]);

    expect(facts.map((fact) => fact.state)).toEqual(['started', 'completed']);
    expect(evaluate(facts)).toMatchObject({ valid: true, evidenceLevel: 'L2' });
  });

  it('tracks a nested native Task with immutable parent association', () => {
    const facts = collect([
      { type: 'system', subtype: 'init', session_id: 'session-nested' },
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [{ type: 'tool_use', id: 'task-parent', name: 'Task', input: {} }],
          stop_reason: 'tool_use',
        },
      },
      {
        type: 'assistant',
        parent_tool_use_id: 'task-parent',
        message: {
          content: [{ type: 'tool_use', id: 'task-nested', name: 'Task', input: {} }],
          stop_reason: 'tool_use',
        },
      },
      {
        type: 'assistant',
        parent_tool_use_id: 'task-nested',
        message: { content: [], stop_reason: 'end_turn' },
      },
      {
        type: 'assistant',
        parent_tool_use_id: 'task-parent',
        message: { content: [], stop_reason: 'end_turn' },
      },
    ]);

    expect(facts.map((fact) => [fact.childId, fact.state, fact.parentChildId])).toEqual([
      ['task-parent', 'started', undefined],
      ['task-nested', 'started', 'task-parent'],
      ['task-nested', 'completed', 'task-parent'],
      ['task-parent', 'completed', undefined],
    ]);
    expect(evaluate(facts)).toMatchObject({ valid: true, evidenceLevel: 'L2' });
  });

  it.each([
    {
      label: 'root to nested',
      frames: [
        {
          type: 'assistant',
          parent_tool_use_id: null,
          message: {
            content: [
              { type: 'tool_use', id: 'task-dup', name: 'Task', input: {} },
              { type: 'tool_use', id: 'task-parent', name: 'Task', input: {} },
            ],
            stop_reason: 'tool_use',
          },
        },
        {
          type: 'assistant',
          parent_tool_use_id: 'task-parent',
          message: {
            content: [{ type: 'tool_use', id: 'task-dup', name: 'Task', input: {} }],
            stop_reason: 'end_turn',
          },
        },
        {
          type: 'assistant',
          parent_tool_use_id: 'task-dup',
          message: { content: [], stop_reason: 'end_turn' },
        },
      ],
    },
    {
      label: 'nested parent A to parent B',
      frames: [
        {
          type: 'assistant',
          parent_tool_use_id: null,
          message: {
            content: [
              { type: 'tool_use', id: 'task-a', name: 'Task', input: {} },
              { type: 'tool_use', id: 'task-b', name: 'Task', input: {} },
            ],
            stop_reason: 'tool_use',
          },
        },
        {
          type: 'assistant',
          parent_tool_use_id: 'task-a',
          message: {
            content: [{ type: 'tool_use', id: 'task-dup', name: 'Task', input: {} }],
            stop_reason: 'end_turn',
          },
        },
        {
          type: 'assistant',
          parent_tool_use_id: 'task-b',
          message: {
            content: [{ type: 'tool_use', id: 'task-dup', name: 'Task', input: {} }],
            stop_reason: 'end_turn',
          },
        },
        {
          type: 'assistant',
          parent_tool_use_id: 'task-dup',
          message: { content: [], stop_reason: 'end_turn' },
        },
      ],
    },
  ])('poisons a Task id after $label rebinding instead of choosing a parent', ({ frames }) => {
    const facts = collect([
      { type: 'system', subtype: 'init', session_id: 'session-rebind' },
      ...frames,
    ], 'stream_incomplete');
    const duplicateFacts = facts.filter((fact) => fact.childId === 'task-dup');

    expect(duplicateFacts.map((fact) => fact.state)).toEqual(['started', 'conflicted']);
    expect(duplicateFacts[1]).toMatchObject({
      conflictReasons: ['task_parent_rebound'],
    });
    expect(adapt(duplicateFacts[1]!)).toMatchObject({
      status: 'running',
      limitations: expect.arrayContaining([
        expect.stringContaining('must not be promoted to L2'),
      ]),
      attributes: {
        associationStatus: 'conflicted',
        conflictReasons: ['task_parent_rebound'],
      },
    });
    expect(evaluate(facts)).toMatchObject({ valid: false, evidenceLevel: 'L0' });
  });

  it('poisons every registered Task when the runtime session changes', () => {
    const facts = collect([
      { type: 'system', subtype: 'init', session_id: 'session-a' },
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [{ type: 'tool_use', id: 'task-session', name: 'Task', input: {} }],
          stop_reason: 'tool_use',
        },
      },
      {
        type: 'assistant',
        parent_tool_use_id: 'task-session',
        message: { content: [], stop_reason: null },
      },
      { type: 'system', subtype: 'init', session_id: 'session-b' },
      {
        type: 'assistant',
        parent_tool_use_id: 'task-session',
        message: { content: [], stop_reason: 'end_turn' },
      },
    ], 'stream_incomplete');

    expect(facts.map((fact) => [fact.state, fact.runtimeSessionId])).toEqual([
      ['started', 'session-a'],
      ['conflicted', 'session-a'],
    ]);
    expect(facts[1]).toMatchObject({ conflictReasons: ['runtime_session_changed'] });
    expect(evaluate(facts)).toMatchObject({ valid: false, evidenceLevel: 'L0' });
  });

  it('poisons a native Agent type rebound instead of retaining the requested package handle', () => {
    const facts = collect([
      { type: 'system', subtype: 'init', session_id: 'session-agent-type' },
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [{
            type: 'tool_use', id: 'agent-type', name: 'Agent',
            input: { prompt: 'bound work', subagent_type: 'od-build-1-aaaaaaaaaaaaaaaa' },
          }],
          stop_reason: 'tool_use',
        },
      },
      {
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 'agent-type', content: 'done' }] },
        tool_use_result: {
          status: 'completed', agentId: 'native-type',
          agentType: 'od-build-2-bbbbbbbbbbbbbbbb',
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      },
    ], 'stream_incomplete');

    expect(facts.map((fact) => fact.state)).toEqual(['started', 'conflicted']);
    expect(facts[1]).toMatchObject({ conflictReasons: ['native_agent_type_rebound'] });
    expect(evaluate(facts)).toMatchObject({ valid: false, evidenceLevel: 'L0' });
  });

  it('poisons both tool lifecycles when one native Agent id is reused', () => {
    const facts = collect([
      { type: 'system', subtype: 'init', session_id: 'session-agent-id' },
      {
        type: 'assistant', parent_tool_use_id: null,
        message: {
          content: [
            { type: 'tool_use', id: 'agent-a', name: 'Agent', input: { prompt: 'a', subagent_type: 'type-a' } },
            { type: 'tool_use', id: 'agent-b', name: 'Agent', input: { prompt: 'b', subagent_type: 'type-b' } },
          ],
          stop_reason: 'tool_use',
        },
      },
      {
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 'agent-a', content: 'done' }] },
        tool_use_result: { status: 'completed', agentId: 'native-shared', agentType: 'type-a' },
      },
      {
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 'agent-b', content: 'done' }] },
        tool_use_result: { status: 'completed', agentId: 'native-shared', agentType: 'type-b' },
      },
    ], 'stream_incomplete');

    expect(facts.map((fact) => [fact.childId, fact.state])).toEqual([
      ['agent-a', 'started'],
      ['agent-b', 'started'],
      ['agent-a', 'completed'],
      ['agent-a', 'conflicted'],
      ['agent-b', 'conflicted'],
    ]);
    expect(facts.slice(-2).every((fact) => (
      fact.conflictReasons?.includes('native_agent_id_reused')
    ))).toBe(true);
    expect(evaluate(facts)).toMatchObject({ valid: false, evidenceLevel: 'L0' });
  });

  it.each([
    {
      label: 'completed then failed',
      terminalFrames: [
        {
          type: 'assistant',
          parent_tool_use_id: 'task-terminal',
          message: { content: [], stop_reason: 'end_turn' },
        },
        {
          type: 'assistant',
          parent_tool_use_id: 'task-terminal',
          error: 'provider child error',
          message: { content: [], stop_reason: null },
        },
      ],
      firstTerminal: 'completed',
    },
    {
      label: 'failed then completed',
      terminalFrames: [
        {
          type: 'assistant',
          parent_tool_use_id: 'task-terminal',
          error: 'provider child error',
          message: { content: [], stop_reason: null },
        },
        {
          type: 'assistant',
          parent_tool_use_id: 'task-terminal',
          message: { content: [], stop_reason: 'end_turn' },
        },
      ],
      firstTerminal: 'failed',
    },
  ])('poisons $label evidence instead of keeping a certifiable first terminal', ({
    terminalFrames,
    firstTerminal,
  }) => {
    const facts = collect([
      { type: 'system', subtype: 'init', session_id: 'session-terminal' },
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [{ type: 'tool_use', id: 'task-terminal', name: 'Task', input: {} }],
          stop_reason: 'tool_use',
        },
      },
      ...terminalFrames,
    ], 'stream_incomplete');

    expect(facts.map((fact) => fact.state)).toEqual([
      'started',
      firstTerminal,
      'conflicted',
    ]);
    expect(facts[2]).toMatchObject({ conflictReasons: ['terminal_state_conflict'] });
    const graph = evaluate(facts);
    expect(graph).toMatchObject({ valid: false, evidenceLevel: 'L0' });
    expect(graph.issues).toContainEqual({
      code: 'terminal_status_changed',
      observationId: 'claude-child:run-1:task-terminal',
    });
  });

  it.each([
    ['canceled', 'canceled', 'canceled'],
    ['timeout', 'failed', 'timeout'],
    ['stream_incomplete', 'failed', 'stream_incomplete'],
  ] as const)('finalizes an open child for %s without guessing a completed state', (
    finish,
    state,
    terminationReason,
  ) => {
    const { facts } = replay('incomplete_child', { finish });

    expect(facts.map((fact) => fact.state)).toEqual(['started', state]);
    expect(facts[1]).toMatchObject({
      sourceEventType: 'host_process_close',
      terminationReason,
    });
  });

  it('leaves an incomplete stream non-terminal until the host supplies a close reason', () => {
    const { facts } = replay('incomplete_child');
    const graph = evaluateRuntimeEvidenceGraphV1([root('running'), ...facts.map(adapt)]);

    expect(facts.map((fact) => fact.state)).toEqual(['started']);
    expect(graph).toMatchObject({ valid: false });
    expect(graph.issues).toContainEqual({
      code: 'child_terminal_missing',
      observationId: 'claude-child:run-1:task-incomplete',
    });
  });

  it('summarizes explicit zero, complete terminal children, and incomplete collection truthfully', () => {
    const empty = createClaudeChildEvidenceCollector({});
    expect(empty.coverage()).toMatchObject({
      availability: 'unavailable',
      explicitZero: false,
      limitations: ['child_collection_not_finalized'],
    });
    empty.finishOpenChildren('stream_incomplete');
    expect(empty.coverage()).toMatchObject({
      availability: 'unavailable',
      explicitZero: false,
      limitations: ['child_collection_stream_incomplete'],
    });

    const confirmedEmpty = createClaudeChildEvidenceCollector({});
    confirmedEmpty.finishOpenChildren('complete');
    expect(confirmedEmpty.coverage()).toEqual({
      availability: 'complete',
      source: 'claude_stream_json',
      knownChildCount: 0,
      explicitZero: true,
      limitations: [],
      diagnosticCounts: [],
    });

    expect(replay('child_success', { finish: 'complete' }).coverage).toMatchObject({
      availability: 'complete',
      knownChildCount: 1,
      explicitZero: false,
    });
    expect(replay('incomplete_child', { finish: 'stream_incomplete' }).coverage).toMatchObject({
      availability: 'partial',
      knownChildCount: 1,
      explicitZero: false,
      limitations: ['child_collection_stream_incomplete', 'child_stream_incomplete'],
      diagnosticCounts: [
        { code: 'child_collection_stream_incomplete', count: 1 },
        { code: 'child_stream_incomplete', count: 1 },
      ],
    });
  });

  it('does not promote an unknown future stop reason to completed', () => {
    const facts: ClaudeChildRuntimeFact[] = [];
    const collector = createClaudeChildEvidenceCollector({
      onFact: (fact) => facts.push(fact),
      now: () => 100,
    });
    collector.observe({
      type: 'assistant',
      parent_tool_use_id: null,
      message: {
        content: [{ type: 'tool_use', id: 'task-future', name: 'Task', input: {} }],
        stop_reason: 'tool_use',
      },
    });
    collector.observe({
      type: 'assistant',
      parent_tool_use_id: 'task-future',
      message: { content: [], stop_reason: 'future_provider_reason' },
    });

    expect(facts.map((fact) => fact.state)).toEqual(['started']);
  });

  it('ignores an unmatched parent_tool_use_id and swallows observer failure', () => {
    const facts: ClaudeChildRuntimeFact[] = [];
    const collector = createClaudeChildEvidenceCollector({
      onFact: (fact) => {
        facts.push(fact);
        throw new Error('observer failure');
      },
      now: () => 100,
    });
    collector.observe({
      type: 'assistant',
      parent_tool_use_id: 'not-a-matched-task',
      unknown_future_field: { preservedByMainParser: true },
      message: { content: [], stop_reason: 'end_turn' },
    });

    expect(facts).toEqual([]);
    expect(() => {
      collector.observe({
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [{ type: 'tool_use', id: 'task-known', name: 'Task', input: {} }],
          stop_reason: 'tool_use',
        },
      });
      collector.observe({
        type: 'assistant',
        parent_tool_use_id: 'task-known',
        message: { content: [], stop_reason: 'end_turn' },
      });
    }).not.toThrow();
    expect(facts.map((fact) => fact.state)).toEqual(['started', 'completed']);
  });
});

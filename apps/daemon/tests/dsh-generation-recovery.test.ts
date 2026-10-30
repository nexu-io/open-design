import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { generationServer } from './fixtures/dsh-profile/server-fixture.js';
import { getStrategyTaskExecution } from '../src/strategies/task-store.js';

// Supply the frozen prompt with the real run's production key. Task ownership,
// marker-driven continuation, persistence and child I/O stay real.
vi.mock('../src/strategies/od-next/initial-prompt-bundle-service.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/strategies/od-next/initial-prompt-bundle-service.js')>();
  const { TEST_PROMPT_BUNDLE } = await import('./strategies/strategy-task-test-fixtures.js');
  const contracts = await import('@open-design/contracts');
  return { ...actual, createOdNextInitialPromptBundleService: () => async ({ meta }: { meta: { doneKey: string } }) => {
    const bundle = contracts.parseOdNextPromptBundleV2(TEST_PROMPT_BUNDLE);
    bundle.coreSystemPrompt.outputContract = contracts.OD_NEXT_PLAN_OUTPUT_INSTRUCTIONS;
    bundle.context.clientSystemPrompt = contracts.renderOdNextProductionReadyInstructions(meta.doneKey);
    return { text: contracts.serializeOdNextPromptBundleV2(bundle) };
  } };
});

let fixture: Awaited<ReturnType<typeof generationServer>> | undefined;
afterEach(async () => { await fixture?.close(); fixture = undefined; });

it.each([null, 'generation-old'])('stops a locked OD Next production continuation with stored generation %s before execute', async (generation) => {
  fixture = await generationServer(true);
  fixture.state({ generation, planning: true, nextGeneration: 'generation-1' });
  const result = await fixture.turn();
  expect(result.initialStatus.status).toBe('succeeded');
  assert(result.taskExecutionId);
  expect.soft(result.status.status).toBe('failed');
  // Main #8356 replaced the blocked task verdict with a terminal ended round.
  // The physical run still fails closed and must never execute a cold turn.
  expect.soft(getStrategyTaskExecution(fixture.db, result.taskExecutionId)).toMatchObject({
    outcome: 'completed', runs: [expect.objectContaining({ inputStage: 'request' }),
      expect.objectContaining({ inputStage: 'production', settlementReason: 'ended', settlementFacts: { physicalStatus: 'failed' } })],
  });
  expect.soft(fixture.commands()).toHaveLength(1);
  const errors = result.events.split('\n\n').filter(frame => frame.split('\n').includes('event: error'))
    .map(frame => {
      const data = frame.split('\n').find(line => line.startsWith('data: '));
      assert(data);
      return JSON.parse(data.slice(6));
    });
  expect.soft(errors).toHaveLength(1);
  expect.soft(errors[0]?.error).toMatchObject({ code: 'AGENT_SESSION_RESUME_FAILED', retryable: false });
  const lifecycle = readFileSync(fixture.statePath + '.lifecycle', 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const child = lifecycle.filter(entry => entry.event === 'ready').at(-1);
  expect.soft(lifecycle).toContainEqual({ event: 'stdin-end', pid: child.pid });
  expect.soft(lifecycle).toContainEqual({ event: 'exit', pid: child.pid });
  expect.soft(() => process.kill(child.pid, 0)).toThrow();
});

it('keeps initial OD Next execution and compatible locked production on the validated native session', async () => {
  fixture = await generationServer(true);
  fixture.state({ planning: true, nextGeneration: 'generation-1' });
  const result = await fixture.turn();
  expect(result.initialStatus.status).toBe('succeeded');
  expect(result.status.status, JSON.stringify(result.status)).toBe('succeeded');
  expect(fixture.commands()).toHaveLength(2);
  expect(fixture.commands()[0]?.resume_session_id).toBeUndefined();
  expect(fixture.commands()[1]?.resume_session_id).toBe(fixture.session()?.sessionId);
  expect(fixture.commands()[1]?.resume_session_id).toBeTruthy();
  expect(result.events).not.toContain('AGENT_SESSION_RESUME_FAILED');
});

it.each([null, 'generation-old'])('reseeds an ordinary turn with the full transcript for stored generation %s', async (generation) => {
  fixture = await generationServer();
  await fixture.turn();
  fixture.db.prepare('UPDATE agent_sessions SET compatibility_generation = ? WHERE conversation_id = ?')
    .run(generation, fixture.conversationId);
  const result = await fixture.turn();
  expect(result.status.status, JSON.stringify(result.status)).toBe('succeeded');
  expect(fixture.commands().at(-1)).toMatchObject({ prompt: expect.stringContaining('HISTORY_SENTINEL') });
  expect(fixture.commands().at(-1)?.resume_session_id).toBeUndefined();
});

it('persists the validated generation in the actual post-tool retry writer and resumes that session', async () => {
  fixture = await generationServer();
  fixture.state({ stallAttempts: 1 });
  // Audit the real SQLite restamp before a later success can hide the retry writer.
  fixture.db.exec(`
    CREATE TEMP TABLE generation_writes (session_id TEXT, generation TEXT);
    CREATE TEMP TRIGGER observe_generation AFTER UPDATE OF compatibility_generation ON main.agent_sessions
    BEGIN INSERT INTO generation_writes VALUES (NEW.session_id, NEW.compatibility_generation); END;
  `);
  const result = await fixture.turn();
  expect(result.status.status, JSON.stringify(result.status)).toBe('succeeded');
  expect(result.events).toContain('"retry_reason":"post_tool_resume"');
  expect(fixture.commands()).toHaveLength(2);
  const writes = fixture.db.prepare('SELECT session_id, generation FROM generation_writes ORDER BY rowid').all();
  expect.soft(writes[0]).toMatchObject({ generation: 'generation-1' });
  const saved = fixture.session();
  expect.soft(fixture.commands()[1]?.resume_session_id).toBe(saved?.sessionId);
  expect.soft(fixture.commands()[1]?.resume_session_id).toBeTruthy();
  expect(saved?.compatibilityGeneration).toBe('generation-1');
  const next = await fixture.turn();
  expect(next.status.status).toBe('succeeded');
  expect(fixture.commands().at(-1)?.resume_session_id).toBe(saved?.sessionId);
});

it('persists the validated generation in the actual resumable-failure writer for the next turn', async () => {
  fixture = await generationServer();
  fixture.state({ stallAttempts: 2 });
  const failed = await fixture.turn();
  expect(failed.status.status).toBe('failed');
  expect(failed.status.resumable, JSON.stringify(failed.status)).toBe(true);
  expect(fixture.commands()).toHaveLength(2);
  const saved = fixture.session();
  expect.soft(saved?.compatibilityGeneration).toBe('generation-1');
  fixture.state();
  const next = await fixture.turn();
  expect(next.status.status).toBe('succeeded');
  expect.soft(fixture.commands().at(-1)?.resume_session_id).toBe(saved?.sessionId);
});

it.each(['generation-1', 'generation-2'])('selects the full or incremental OD Next follow-up request only after ready generation %s', async (generation) => {
  fixture = await generationServer(true);
  fixture.state({ question: true });
  const initial = await fixture.turn({}, false);
  expect(initial.status.status).toBe('succeeded');
  const saved = fixture.session();
  expect(saved?.compatibilityGeneration).toBe('generation-1');
  fixture.state({ question: true, generation });
  const result = await fixture.turn({ taskExecutionId: initial.taskExecutionId, message: 'Investors', currentPrompt: 'Investors' }, false);
  expect(result.status.status).toBe('succeeded');
  expect(fixture.commands()).toHaveLength(2);
  const command = fixture.commands()[1];
  if (generation === 'generation-1') {
    expect(command?.resume_session_id).toBe(saved?.sessionId);
    expect(command?.prompt).not.toContain('<open_design_prompt_bundle');
  } else {
    expect(command?.resume_session_id).toBeUndefined();
    expect(command?.prompt).toContain('<open_design_prompt_bundle');
  }
});

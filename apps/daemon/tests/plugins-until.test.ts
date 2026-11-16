// `until` evaluator (spec §10.1 / §10.2). Closed vocabulary, intentionally
// not arbitrary JS — the parser refuses signals it does not know about and
// only accepts == != >= <= > < operators. The evaluator is short-circuit
// per OR clause and returns the first matching conjunction so the run
// audit can record "what convinced me to advance".

import { describe, expect, it } from 'vitest';
import type { AppliedPluginSnapshot, PipelineStage, PluginPipelineStageEvent } from '@open-design/contracts';
import {
  evaluateUntil,
  isParseableUntil,
  parseUntil,
  UntilSyntaxError,
} from '../src/plugins/until.js';
import { runPipeline, type PipelineEventSink } from '../src/plugins/pipeline.js';

describe('parseUntil', () => {
  it('accepts the §10.1 reference expression', () => {
    const expr = parseUntil('critique.score>=4 || iterations>=3');
    expect(expr.any).toHaveLength(2);
    expect(expr.any[0]?.[0]).toMatchObject({ signal: 'critique.score', op: '>=', value: 4 });
    expect(expr.any[1]?.[0]).toMatchObject({ signal: 'iterations', op: '>=', value: 3 });
  });

  it('accepts boolean signals with == / !=', () => {
    const expr = parseUntil('user.confirmed == true');
    expect(expr.any[0]?.[0]).toMatchObject({ signal: 'user.confirmed', op: '==', value: true });
  });

  it('rejects unknown signals', () => {
    expect(() => parseUntil('lol.idk >= 1')).toThrow(UntilSyntaxError);
  });

  it('rejects boolean signal with > operator', () => {
    expect(() => parseUntil('preview.ok > true')).toThrow(UntilSyntaxError);
  });

  it('rejects empty expressions', () => {
    expect(() => parseUntil('')).toThrow(UntilSyntaxError);
  });

  it('isParseableUntil returns false for syntactically broken input', () => {
    expect(isParseableUntil('critique.score nope 4')).toBe(false);
    expect(isParseableUntil('critique.score >= 4')).toBe(true);
  });
});

describe('evaluateUntil', () => {
  it('converges on the canonical critique-or-iterations termination', () => {
    const expr = parseUntil('critique.score>=4 || iterations>=3');
    expect(evaluateUntil(expr, { 'critique.score': 4, iterations: 1 })).toMatchObject({ satisfied: true });
    expect(evaluateUntil(expr, { 'critique.score': 2, iterations: 3 })).toMatchObject({ satisfied: true });
    expect(evaluateUntil(expr, { 'critique.score': 2, iterations: 1 })).toMatchObject({ satisfied: false });
  });

  it('boolean signals respect == / !=', () => {
    const expr = parseUntil('user.confirmed == true');
    expect(evaluateUntil(expr, { 'user.confirmed': true }).satisfied).toBe(true);
    expect(evaluateUntil(expr, { 'user.confirmed': false }).satisfied).toBe(false);
  });

  it('missing signal value never satisfies a comparison', () => {
    const expr = parseUntil('iterations>=3');
    expect(evaluateUntil(expr, {}).satisfied).toBe(false);
  });

  it('returns the matching conjunction terms for audit', () => {
    const expr = parseUntil('critique.score>=4 || iterations>=3');
    const result = evaluateUntil(expr, { 'critique.score': 4, iterations: 0 });
    expect(result.satisfied).toBe(true);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.signal).toBe('critique.score');
  });
});

// A logical operator with a missing operand must not collapse into the
// expression that remains. `iterations >= 3 ||` means "this condition, or
// something the author never wrote"; silently reading it as the narrower
// `iterations >= 3` turns a malformed manifest into a stage that terminates
// early. Every empty operand is a syntax error.
describe('parseUntil — missing logical operands', () => {
  it.each([
    ['trailing ||', 'iterations >= 3 ||'],
    ['leading ||', '|| iterations >= 3'],
    ['repeated ||', 'critique.score >= 4 || || iterations >= 3'],
    ['trailing &&', 'iterations >= 3 &&'],
    ['leading &&', '&& iterations >= 3'],
    ['repeated &&', 'iterations >= 3 && && preview.ok == true'],
  ])('rejects a %s operator', (_label, source) => {
    expect(() => parseUntil(source)).toThrow(UntilSyntaxError);
    expect(isParseableUntil(source)).toBe(false);
  });

  it('keeps accepting well-formed disjunctions and conjunctions', () => {
    expect(isParseableUntil('iterations >= 3 && preview.ok == true')).toBe(true);
    expect(
      isParseableUntil('iterations >= 3 && preview.ok == true || user.confirmed == true'),
    ).toBe(true);
  });
});

// The rejection has to land before the stage is scheduled, not after the
// first iteration: an unparseable `until` is a config error, so the worker
// must never be called, no stage event may be emitted, and no audit row may
// be written for it.
describe('runPipeline — stage scheduling with a rejected until', () => {
  it('refuses the stage before any worker call, event, or iteration write', async () => {
    const workerCalls: string[] = [];
    const events: PluginPipelineStageEvent[] = [];
    const dbTouches: string[] = [];
    const stage: PipelineStage = {
      id: 'critique',
      atoms: ['critique-theater'],
      repeat: true,
      until: 'iterations >= 3 ||',
    };

    const outcome = await runPipeline({
      db: new Proxy({} as never, {
        get(_target, property) {
          dbTouches.push(String(property));
          return undefined;
        },
      }),
      runId: 'run-until-operand',
      snapshot: { snapshotId: 'snap-until-operand' } as unknown as AppliedPluginSnapshot,
      pipeline: { stages: [stage] },
      env: { maxIterations: 3 },
      runStage: ({ stage: scheduled, iteration }) => {
        workerCalls.push(`${scheduled.id}@${iteration}`);
        return { signals: { iterations: iteration + 1 } };
      },
      emit: ((event) => events.push(event)) as PipelineEventSink,
    }).then(
      (stages) => ({ kind: 'scheduled' as const, stages }),
      (error: unknown) => ({ kind: 'rejected' as const, error }),
    );

    expect(workerCalls, 'a rejected until must not run the stage').toEqual([]);
    expect(events, 'a rejected until must not emit stage events').toEqual([]);
    expect(dbTouches, 'a rejected until must not write iteration rows').toEqual([]);
    expect(outcome.kind).toBe('rejected');
    expect(outcome.kind === 'rejected' ? String(outcome.error) : '').toMatch(
      /until expression rejected/,
    );
  });
});

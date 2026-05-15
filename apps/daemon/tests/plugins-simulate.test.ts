// Plan §3.EE1 — simulatePipeline + parseSignalKv pure helpers.

import { describe, expect, it } from 'vitest';
import type { PluginPipeline } from '@open-design/contracts';
import { parseSignalKv, simulatePipeline } from '../src/plugins/simulate.js';

const pipe = (stages: PluginPipeline['stages']): PluginPipeline => ({ stages });

describe('simulatePipeline — single-shot stages', () => {
  it("emits outcome='single' for repeat:false stages", () => {
    const result = simulatePipeline({
      pipeline: pipe([{ id: 'plan', atoms: ['todo-write'] }]),
      signals: {},
    });
    expect(result.outcome).toBe('all-single');
    expect(result.stages[0]?.outcome).toBe('single');
    expect(result.stages[0]?.iterations).toBe(1);
  });

  it("emits outcome='single' even when until is set but repeat:false", () => {
    const result = simulatePipeline({
      pipeline: pipe([{ id: 'plan', atoms: ['todo-write'], until: 'critique.score>=4' }]),
      signals: { 'critique.score': 0 },
    });
    expect(result.stages[0]?.outcome).toBe('single');
  });
});

describe('simulatePipeline — repeat: true stages', () => {
  it("emits outcome='converged' when the until expression is satisfied", () => {
    const result = simulatePipeline({
      pipeline: pipe([{
        id: 'critique', atoms: ['critique-theater'], repeat: true,
        until: 'critique.score>=4',
      }]),
      signals: { 'critique.score': 5 },
    });
    expect(result.outcome).toBe('all-converged');
    expect(result.stages[0]?.outcome).toBe('converged');
    expect(result.stages[0]?.iterations).toBe(1);
    expect(result.stages[0]?.matched).toBeDefined();
  });

  it("emits outcome='cap' when the until never satisfies within iterationCap", () => {
    const result = simulatePipeline({
      pipeline: pipe([{
        id: 'critique', atoms: ['critique-theater'], repeat: true,
        until: 'critique.score>=4',
      }]),
      signals: { 'critique.score': 2 },
      iterationCap: 3,
    });
    expect(result.outcome).toBe('cap-hit');
    expect(result.stages[0]?.outcome).toBe('cap');
    expect(result.stages[0]?.iterations).toBe(3);
    expect(result.stages[0]?.reason).toMatch(/never satisfied/);
  });

  it("emits outcome='unparsable' when the until expression fails to parse", () => {
    const result = simulatePipeline({
      pipeline: pipe([{
        id: 'critique', atoms: ['critique-theater'], repeat: true,
        until: 'this is not a valid expression',
      }]),
      signals: {},
    });
    expect(result.outcome).toBe('unparsable');
    expect(result.stages[0]?.outcome).toBe('unparsable');
    expect(result.stages[0]?.reason).toBeTruthy();
  });

  it('honours per-iteration signal providers (signals can change as iterations run)', () => {
    const result = simulatePipeline({
      pipeline: pipe([{
        id: 'critique', atoms: ['critique-theater'], repeat: true,
        until: 'critique.score>=4',
      }]),
      // Score grows across iterations; converges on iteration 4 (i=3).
      signals: (_stageId, iteration) => ({ 'critique.score': iteration + 1 }),
    });
    expect(result.stages[0]?.outcome).toBe('converged');
    expect(result.stages[0]?.iterations).toBe(4);
  });

  it('honours boolean compound until (build.passing == true && tests.passing == true)', () => {
    const both = simulatePipeline({
      pipeline: pipe([{
        id: 'verify', atoms: ['patch-edit', 'build-test'], repeat: true,
        until: 'build.passing == true && tests.passing == true',
      }]),
      signals: { 'build.passing': true, 'tests.passing': true },
    });
    expect(both.stages[0]?.outcome).toBe('converged');

    const oneShort = simulatePipeline({
      pipeline: pipe([{
        id: 'verify', atoms: ['patch-edit', 'build-test'], repeat: true,
        until: 'build.passing == true && tests.passing == true',
      }]),
      signals: { 'build.passing': true, 'tests.passing': false },
      iterationCap: 2,
    });
    expect(oneShort.stages[0]?.outcome).toBe('cap');
  });
});

describe('simulatePipeline — aggregate outcome', () => {
  it("'mixed' when some stages are single and some are converged", () => {
    const result = simulatePipeline({
      pipeline: pipe([
        { id: 'plan',     atoms: ['todo-write'] },
        { id: 'critique', atoms: ['critique-theater'], repeat: true, until: 'critique.score>=4' },
      ]),
      signals: { 'critique.score': 5 },
    });
    expect(result.outcome).toBe('mixed');
  });

  it('totalIterations sums per-stage iterations', () => {
    const result = simulatePipeline({
      pipeline: pipe([
        { id: 'plan',     atoms: ['todo-write'] },
        { id: 'verify',   atoms: ['patch-edit', 'build-test'], repeat: true, until: 'build.passing == true && tests.passing == true' },
      ]),
      signals: (_id, i) => i >= 2 ? { 'build.passing': true, 'tests.passing': true } : { 'build.passing': false, 'tests.passing': false },
    });
    // plan = 1, verify = 3 (converges on i=2 → iteration 3).
    expect(result.totalIterations).toBe(4);
  });
});

describe('parseSignalKv', () => {
  it('parses numbers and booleans into the closed UntilSignals vocabulary', () => {
    const r = parseSignalKv([
      'critique.score=4',
      'iterations=2',
      'user.confirmed=true',
      'preview.ok=false',
      'build.passing=1',
      'tests.passing=0',
    ]);
    expect(r.signals).toEqual({
      'critique.score': 4,
      'iterations':     2,
      'user.confirmed': true,
      'preview.ok':     false,
      'build.passing':  true,
      'tests.passing':  false,
    });
    expect(r.warnings).toEqual([]);
  });

  it('warns on unknown signal keys (typo guard)', () => {
    const r = parseSignalKv(['critic.score=4']);
    expect(r.signals).toEqual({});
    expect(r.warnings[0]).toMatch(/unknown signal/);
  });

  it("warns on missing '=' separator", () => {
    const r = parseSignalKv(['critique.score4']);
    expect(r.warnings[0]).toMatch(/key=value/);
  });

  it('warns on type mismatch (numeric signal with non-number value)', () => {
    const r = parseSignalKv(['critique.score=high']);
    expect(r.signals).toEqual({});
    expect(r.warnings[0]).toMatch(/expected number/);
  });
});

// Plan §3.FF1 — verifyPlugin() pure helper.

import { describe, expect, it } from 'vitest';
import type { DoctorReport } from '../src/plugins/doctor.js';
import type { SimulatePipelineResult } from '../src/plugins/simulate.js';
import { verifyPlugin } from '../src/plugins/verify.js';

const passingDoctor = (): DoctorReport => ({
  pluginId:    'p',
  ok:          true,
  issues:      [],
  freshDigest: 'abc',
});

const failingDoctor = (): DoctorReport => ({
  pluginId:    'p',
  ok:          false,
  issues:      [{ severity: 'error', code: 'manifest.invalid', message: 'broken' }],
  freshDigest: 'abc',
});

const convergedSim = (): SimulatePipelineResult => ({
  outcome: 'all-converged',
  totalIterations: 3,
  stages: [
    { stageId: 'critique', outcome: 'converged', iterations: 3, finalSignals: {} },
  ],
});

const capHitSim = (): SimulatePipelineResult => ({
  outcome: 'cap-hit',
  totalIterations: 10,
  stages: [
    { stageId: 'critique', outcome: 'cap', iterations: 10, finalSignals: {}, reason: 'never satisfied' },
  ],
});

describe('verifyPlugin — pass / fail aggregation', () => {
  it('passes when every enabled check passes', () => {
    const report = verifyPlugin({
      config: { enabled: ['doctor', 'simulate'] },
      doctor: passingDoctor(),
      simulate: convergedSim(),
    });
    expect(report.passed).toBe(true);
    expect(report.outcomes.find((o) => o.check === 'doctor')?.status).toBe('passed');
    expect(report.outcomes.find((o) => o.check === 'simulate')?.status).toBe('passed');
  });

  it('fails when doctor reports errors', () => {
    const report = verifyPlugin({
      config: { enabled: ['doctor'] },
      doctor: failingDoctor(),
    });
    expect(report.passed).toBe(false);
    expect(report.outcomes.find((o) => o.check === 'doctor')?.status).toBe('failed');
  });

  it('fails when simulate hits the cap', () => {
    const report = verifyPlugin({
      config: { enabled: ['simulate'] },
      simulate: capHitSim(),
    });
    expect(report.passed).toBe(false);
    expect(report.outcomes.find((o) => o.check === 'simulate')?.status).toBe('failed');
  });

  it("'unsupported' bubbles up as a fail when the report is missing", () => {
    const report = verifyPlugin({
      config: { enabled: ['doctor'] },
    });
    expect(report.passed).toBe(false);
    expect(report.outcomes.find((o) => o.check === 'doctor')?.status).toBe('unsupported');
  });

  it("'skipped' for checks not in the enabled set", () => {
    const report = verifyPlugin({
      config: { enabled: ['doctor'] },
      doctor: passingDoctor(),
    });
    expect(report.passed).toBe(true);
    expect(report.outcomes.find((o) => o.check === 'simulate')?.status).toBe('skipped');
    expect(report.outcomes.find((o) => o.check === 'canon')?.status).toBe('skipped');
  });
});

describe('verifyPlugin — canon byte-equality', () => {
  it('passes when canon === canonExpected', () => {
    const report = verifyPlugin({
      config: { enabled: ['canon'] },
      canon: '## Active plugin\n\nfoo',
      canonExpected: '## Active plugin\n\nfoo',
    });
    expect(report.outcomes.find((o) => o.check === 'canon')?.status).toBe('passed');
  });

  it('fails on mismatch + records both lengths', () => {
    const report = verifyPlugin({
      config: { enabled: ['canon'] },
      canon: 'short',
      canonExpected: 'much longer fixture',
    });
    const outcome = report.outcomes.find((o) => o.check === 'canon');
    expect(outcome?.status).toBe('failed');
    expect(outcome?.details?.['expectedLength']).toBe(19);
    expect(outcome?.details?.['actualLength']).toBe(5);
  });

  it('skips canon cleanly when no fixture is supplied', () => {
    const report = verifyPlugin({
      config: { enabled: ['canon'] },
    });
    const outcome = report.outcomes.find((o) => o.check === 'canon');
    expect(outcome?.status).toBe('skipped');
    expect(outcome?.summary).toMatch(/no fixture/);
  });
});

describe('verifyPlugin — strict mode (Plan §3.HH1)', () => {
  it('passes by default when doctor reports warnings + no errors', () => {
    const doctor: DoctorReport = {
      pluginId: 'p',
      ok: true,
      issues: [{ severity: 'warning', code: 'a', message: 'x' }],
      freshDigest: 'abc',
    };
    const report = verifyPlugin({ config: { enabled: ['doctor'] }, doctor });
    expect(report.passed).toBe(true);
    expect(report.outcomes.find((o) => o.check === 'doctor')?.status).toBe('passed');
  });

  it('FAILS in strict mode when doctor reports any warning', () => {
    const doctor: DoctorReport = {
      pluginId: 'p',
      ok: true,
      issues: [{ severity: 'warning', code: 'a', message: 'x' }],
      freshDigest: 'abc',
    };
    const report = verifyPlugin({ config: { enabled: ['doctor'], strict: true }, doctor });
    expect(report.passed).toBe(false);
    const outcome = report.outcomes.find((o) => o.check === 'doctor');
    expect(outcome?.status).toBe('failed');
    expect(outcome?.summary).toMatch(/strict mode/);
  });

  it('still passes in strict mode when doctor reports zero issues', () => {
    const report = verifyPlugin({ config: { enabled: ['doctor'], strict: true }, doctor: passingDoctor() });
    expect(report.passed).toBe(true);
  });
});

describe('verifyPlugin — summaries', () => {
  it('doctor summary mentions error + warning counts', () => {
    const doctor: DoctorReport = {
      pluginId: 'p',
      ok: false,
      issues: [
        { severity: 'error',   code: 'a', message: 'x' },
        { severity: 'error',   code: 'b', message: 'y' },
        { severity: 'warning', code: 'c', message: 'z' },
      ],
      freshDigest: 'abc',
    };
    const report = verifyPlugin({ config: { enabled: ['doctor'] }, doctor });
    const outcome = report.outcomes.find((o) => o.check === 'doctor');
    expect(outcome?.summary).toMatch(/2 errors/);
    expect(outcome?.summary).toMatch(/1 warning/);
  });

  it('simulate summary mentions outcome + iterations + stages', () => {
    const report = verifyPlugin({
      config: { enabled: ['simulate'] },
      simulate: convergedSim(),
    });
    const outcome = report.outcomes.find((o) => o.check === 'simulate');
    expect(outcome?.summary).toMatch(/all-converged/);
    expect(outcome?.summary).toMatch(/3 iterations/);
    expect(outcome?.summary).toMatch(/1 stage/);
  });
});

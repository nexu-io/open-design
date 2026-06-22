import { afterEach, describe, expect, it } from 'vitest';

import {
  enforceVerify,
  recordVerify,
  listVerifications,
  removeVerification,
  clearVerifications,
  __resetVerificationsForTests,
} from '../src/memory-verify.js';

function scorecard(rows: Array<{ rule: string; status: string; note?: string }>, status = 'pass'): string {
  const payload = JSON.stringify({ status, rows });
  return `Here is my work.\n\n<od-card type="verify-scorecard">\n${payload}\n</od-card>`;
}

const RULE_CTA = { name: 'CTA copy is action-first', check: 'The primary button starts with a verb' };
const RULE_CONTRAST = { name: 'Text contrast', check: 'Body text meets WCAG AA contrast' };

describe('enforceVerify', () => {
  it('skips when verify is disabled', () => {
    const r = enforceVerify({
      assistantOutput: '',
      activeRules: [RULE_CTA],
      hadArtifact: true,
      verifyEnabled: false,
    });
    expect(r.status).toBe('skipped');
    expect(r.skipReason).toBe('verify-disabled');
  });

  it('skips when there are no active rules', () => {
    const r = enforceVerify({
      assistantOutput: '',
      activeRules: [],
      hadArtifact: true,
      verifyEnabled: true,
    });
    expect(r.status).toBe('skipped');
    expect(r.skipReason).toBe('no-rules');
  });

  it('skips when the turn produced no artifact', () => {
    const r = enforceVerify({
      assistantOutput: '',
      activeRules: [RULE_CTA],
      hadArtifact: false,
      verifyEnabled: true,
    });
    expect(r.status).toBe('skipped');
    expect(r.skipReason).toBe('no-artifact');
  });

  it('flags missing when an artifact turn omits the scorecard', () => {
    const r = enforceVerify({
      assistantOutput: 'I built the landing page. Done!',
      activeRules: [RULE_CTA, RULE_CONTRAST],
      hadArtifact: true,
      verifyEnabled: true,
    });
    expect(r.status).toBe('missing');
    expect(r.uncoveredRules).toEqual([RULE_CTA.name, RULE_CONTRAST.name]);
    expect(r.rowsTotal).toBe(0);
  });

  it('passes when every active rule is covered and no row failed', () => {
    const output = scorecard([
      { rule: 'CTA copy is action-first', status: 'pass' },
      { rule: 'Text contrast meets WCAG AA', status: 'pass' },
    ]);
    const r = enforceVerify({
      assistantOutput: output,
      activeRules: [RULE_CTA, RULE_CONTRAST],
      hadArtifact: true,
      verifyEnabled: true,
    });
    expect(r.status).toBe('pass');
    expect(r.rulesCovered).toBe(2);
    expect(r.uncoveredRules).toEqual([]);
  });

  it('fails when a scorecard row failed', () => {
    const output = scorecard(
      [
        { rule: 'CTA copy is action-first', status: 'fail', note: 'still passive' },
        { rule: 'Text contrast meets WCAG AA', status: 'pass' },
      ],
      'partial',
    );
    const r = enforceVerify({
      assistantOutput: output,
      activeRules: [RULE_CTA, RULE_CONTRAST],
      hadArtifact: true,
      verifyEnabled: true,
    });
    expect(r.status).toBe('fail');
    expect(r.rowsFailed).toBe(1);
    expect(r.scorecardStatus).toBe('partial');
  });

  it('fails when a scorecard leaves an active rule uncovered', () => {
    const output = scorecard([{ rule: 'CTA copy is action-first', status: 'pass' }]);
    const r = enforceVerify({
      assistantOutput: output,
      activeRules: [RULE_CTA, RULE_CONTRAST],
      hadArtifact: true,
      verifyEnabled: true,
    });
    expect(r.status).toBe('fail');
    expect(r.uncoveredRules).toEqual([RULE_CONTRAST.name]);
    expect(r.rulesCovered).toBe(1);
  });
});

describe('verification ring buffer', () => {
  afterEach(() => __resetVerificationsForTests());

  it('does not persist skipped outcomes', () => {
    const rec = recordVerify({
      status: 'skipped',
      rulesActive: 0,
      rulesCovered: 0,
      uncoveredRules: [],
      rowsTotal: 0,
      rowsFailed: 0,
      hadArtifact: false,
      skipReason: 'no-rules',
    });
    expect(rec).toBeNull();
    expect(listVerifications()).toHaveLength(0);
  });

  it('records, lists newest-first, removes, and clears', () => {
    const make = (status: 'pass' | 'fail') => ({
      status,
      rulesActive: 1,
      rulesCovered: status === 'pass' ? 1 : 0,
      uncoveredRules: status === 'pass' ? [] : ['x'],
      rowsTotal: 1,
      rowsFailed: status === 'pass' ? 0 : 1,
      hadArtifact: true,
    });
    const first = recordVerify(make('pass'), { runId: 'r1' });
    const second = recordVerify(make('fail'), { runId: 'r2' });
    expect(first && second).toBeTruthy();
    const list = listVerifications();
    expect(list).toHaveLength(2);
    expect(list[0]?.runId).toBe('r2');
    expect(removeVerification(second!.id)).toBe(1);
    expect(listVerifications()).toHaveLength(1);
    expect(clearVerifications()).toBe(1);
    expect(listVerifications()).toHaveLength(0);
  });
});

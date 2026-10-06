import { describe, expect, it } from 'vitest';

import { stripInternalControlMarkers } from '../../src/artifacts/internal-markers';

describe('stripInternalControlMarkers', () => {
  it('removes a leaked conversation-title marker from settled prose', () => {
    const text = [
      '我会使用 Open Design 技能把已确认的电商流程整理为可执行的原型计划。',
      '<od-title>LV奢侈品电商原型</od-title>',
      '目标已锁定为响应式 LV 奢侈品电商概念原型。',
    ].join('\n');

    const out = stripInternalControlMarkers(text);

    expect(out).not.toContain('od-title');
    expect(out).toContain('我会使用 Open Design 技能');
    expect(out).toContain('目标已锁定为响应式');
  });

  it('removes OD Next machine protocol blocks', () => {
    const text = [
      'Here is the plan.',
      '<open-design-plan-contract>{"schema":"open-design.plan-contract/v2"}</open-design-plan-contract>',
      '<open-design-runtime-state>{"schema":"open-design.strategy-state/v2"}</open-design-runtime-state>',
      'Done.',
    ].join('\n');

    const out = stripInternalControlMarkers(text);

    expect(out).not.toContain('open-design-plan-contract');
    expect(out).not.toContain('open-design-runtime-state');
    expect(out).not.toContain('plan-contract/v2');
    expect(out).toContain('Here is the plan.');
    expect(out).toContain('Done.');
  });

  it('hides a half-arrived marker while the turn is still streaming', () => {
    expect(stripInternalControlMarkers('Answer <od-tit', { streaming: true })).toBe('Answer ');
    expect(stripInternalControlMarkers('Answer <od-title>Par', { streaming: true })).toBe('Answer ');
  });

  it('keeps settled prose when a turn ended mid-marker', () => {
    // Deleting the remainder of a finished answer over one stray tag would lose
    // real content, so only the tag itself goes.
    const out = stripInternalControlMarkers('Lead <od-title>Trailing answer body');

    expect(out).toBe('Lead Trailing answer body');
  });

  it('leaves renderable artifacts alone', () => {
    const text = '<question-form>{"id":"discovery"}</question-form>\n<od-card>{"kind":"memory"}</od-card>';

    expect(stripInternalControlMarkers(text)).toBe(text);
  });

  it('returns text without markup untouched', () => {
    expect(stripInternalControlMarkers('plain answer')).toBe('plain answer');
    expect(stripInternalControlMarkers('')).toBe('');
  });
});

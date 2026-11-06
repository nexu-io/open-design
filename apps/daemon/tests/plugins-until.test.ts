// `until` evaluator (spec §10.1 / §10.2). Closed vocabulary, intentionally
// not arbitrary JS — the parser refuses signals it does not know about and
// only accepts == != >= <= > < operators. The evaluator is short-circuit
// per OR clause and returns the first matching conjunction so the run
// audit can record "what convinced me to advance".

import { describe, expect, it } from 'vitest';
import {
  evaluateUntil,
  isParseableUntil,
  parseUntil,
  UntilSyntaxError,
} from '../src/plugins/until.js';

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

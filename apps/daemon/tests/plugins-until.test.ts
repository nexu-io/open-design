// `until` evaluator (spec §10.1 / §10.2). Closed vocabulary, intentionally
// not arbitrary JS — the parser refuses signals it does not know about and
// only accepts == != >= <= > < operators. The evaluator is short-circuit
// per OR clause and returns the first matching conjunction so the run
// audit can record "what convinced me to advance".

import path from 'node:path';
import url from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  evaluateUntil,
  isParseableUntil,
  parseUntil,
  UntilSyntaxError,
} from '../src/plugins/until.js';

const scenariosRoot = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  '../../../plugins/_official/scenarios',
);

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

  // #8645: the bundled od-code-migration devloop writes its stop condition
  // with bare booleans inside a parenthesized group.
  it('reads a bare boolean signal as `== true`', () => {
    expect(parseUntil('build.passing && tests.passing').any).toEqual([
      [
        { signal: 'build.passing', op: '==', value: true },
        { signal: 'tests.passing', op: '==', value: true },
      ],
    ]);
  });

  it('still requires an operator on a bare number signal', () => {
    expect(() => parseUntil('iterations')).toThrow(UntilSyntaxError);
    expect(() => parseUntil('preview.ok && critique.score')).toThrow(UntilSyntaxError);
  });

  it('splits a parenthesized conjunction instead of reading it as one comparison', () => {
    expect(parseUntil('(build.passing && tests.passing) || iterations>=8').any).toEqual([
      [
        { signal: 'build.passing', op: '==', value: true },
        { signal: 'tests.passing', op: '==', value: true },
      ],
      [{ signal: 'iterations', op: '>=', value: 8 }],
    ]);
  });

  it('flattens a grouped disjunction into the disjunction-of-conjunctions shape', () => {
    expect(parseUntil('(user.confirmed || preview.ok == true) && iterations >= 2').any).toEqual([
      [
        { signal: 'user.confirmed', op: '==', value: true },
        { signal: 'iterations', op: '>=', value: 2 },
      ],
      [
        { signal: 'preview.ok', op: '==', value: true },
        { signal: 'iterations', op: '>=', value: 2 },
      ],
    ]);
    expect(parseUntil('((critique.score >= 4))').any).toEqual([
      [{ signal: 'critique.score', op: '>=', value: 4 }],
    ]);
  });

  it('rejects empty and unbalanced groups', () => {
    expect(() => parseUntil('()')).toThrow(UntilSyntaxError);
    expect(() => parseUntil('(build.passing && tests.passing')).toThrow(UntilSyntaxError);
    expect(() => parseUntil('build.passing && tests.passing)')).toThrow(UntilSyntaxError);
  });

  it('refuses a grouping that would flatten into an exponential number of conjunctions', () => {
    const group = '(preview.ok || user.confirmed)';
    expect(() => parseUntil(Array.from({ length: 12 }, () => group).join(' && '))).toThrow(
      UntilSyntaxError,
    );
  });
});

describe('bundled scenario manifests', () => {
  it('every devloop `until` parses', async () => {
    const entries = await readdir(scenariosRoot, { withFileTypes: true });
    const untils: string[] = [];
    for (const entry of entries.filter((e) => e.isDirectory())) {
      const manifest = JSON.parse(
        await readFile(path.join(scenariosRoot, entry.name, 'open-design.json'), 'utf8'),
      );
      for (const stage of manifest.od?.pipeline?.stages ?? []) {
        if (typeof stage.until === 'string') untils.push(`${entry.name}: ${stage.until}`);
      }
    }
    expect(untils.length).toBeGreaterThan(0);
    expect(untils.filter((u) => !isParseableUntil(u.slice(u.indexOf(': ') + 2)))).toEqual([]);
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

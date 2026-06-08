import { describe, it, expect } from 'vitest';
import {
  repairJsonPrefix,
  parsePartialJson,
  parsePartialAskUserQuestion,
  parseAskUserQuestionInput,
} from '../../src/runtime/ask-user-question';

const FULL =
  '{"questions":[{"header":"DB","question":"Which database?","multiSelect":false,"options":[{"label":"Postgres","description":"Relational"},{"label":"SQLite"}]}]}';

describe('repairJsonPrefix', () => {
  it('closes open containers in a truncated object', () => {
    expect(JSON.parse(repairJsonPrefix('{"a":1'))).toEqual({ a: 1 });
    expect(JSON.parse(repairJsonPrefix('{"a":[1,2'))).toEqual({ a: [1, 2] });
  });

  it('closes a string cut off mid-value', () => {
    expect(JSON.parse(repairJsonPrefix('{"a":"hel'))).toEqual({ a: 'hel' });
  });

  it('drops a dangling key with a colon and no value', () => {
    expect(JSON.parse(repairJsonPrefix('{"a":1,"b":'))).toEqual({ a: 1 });
  });

  it('drops a bare pending key with no colon', () => {
    expect(JSON.parse(repairJsonPrefix('{"a":1,"b'))).toEqual({ a: 1 });
  });

  it('drops a trailing comma', () => {
    expect(JSON.parse(repairJsonPrefix('[1,2,'))).toEqual([1, 2]);
  });

  it('does not mistake an escaped quote for the string end', () => {
    expect(JSON.parse(repairJsonPrefix('{"a":"x\\"y'))).toEqual({ a: 'x"y' });
  });

  it('leaves complete JSON untouched', () => {
    expect(JSON.parse(repairJsonPrefix(FULL))).toEqual(JSON.parse(FULL));
  });

  it('neutralizes a dangling escape inside an open string', () => {
    expect(JSON.parse(repairJsonPrefix('{"a":"x\\'))).toEqual({ a: 'x' });
    expect(JSON.parse(repairJsonPrefix('{"a":"x\\u'))).toEqual({ a: 'x' });
    expect(JSON.parse(repairJsonPrefix('{"a":"x\\u12'))).toEqual({ a: 'x' });
  });

  it('keeps a completed escape and even backslash runs', () => {
    expect(JSON.parse(repairJsonPrefix('{"a":"x\\u0041'))).toEqual({ a: 'xA' });
    // Windows path mid-stream: escaped backslashes are complete pairs.
    expect(JSON.parse(repairJsonPrefix('{"a":"C:\\\\Users\\\\foo'))).toEqual({ a: 'C:\\Users\\foo' });
    // A lone trailing backslash (odd run) is the incomplete one — drop it.
    expect(JSON.parse(repairJsonPrefix('{"a":"C:\\\\Users\\'))).toEqual({ a: 'C:\\Users' });
  });

  it('drops an unfinished scalar value cut mid-token', () => {
    expect(JSON.parse(repairJsonPrefix('{"a":f'))).toEqual({});
    expect(JSON.parse(repairJsonPrefix('{"a":tru'))).toEqual({});
    expect(JSON.parse(repairJsonPrefix('{"a":nul'))).toEqual({});
    expect(JSON.parse(repairJsonPrefix('{"a":true,"b":f'))).toEqual({ a: true });
    expect(JSON.parse(repairJsonPrefix('{"a":1.'))).toEqual({});
    expect(JSON.parse(repairJsonPrefix('{"a":1e'))).toEqual({});
    expect(JSON.parse(repairJsonPrefix('{"a":-'))).toEqual({});
    expect(JSON.parse(repairJsonPrefix('{"a":[1,2,f'))).toEqual({ a: [1, 2] });
  });

  it('keeps complete scalar literals (not prefixes of the partial patterns)', () => {
    expect(JSON.parse(repairJsonPrefix('{"a":true'))).toEqual({ a: true });
    expect(JSON.parse(repairJsonPrefix('{"a":false'))).toEqual({ a: false });
    expect(JSON.parse(repairJsonPrefix('{"a":null'))).toEqual({ a: null });
    expect(JSON.parse(repairJsonPrefix('{"a":12'))).toEqual({ a: 12 });
    expect(JSON.parse(repairJsonPrefix('{"a":1.5'))).toEqual({ a: 1.5 });
    expect(JSON.parse(repairJsonPrefix('{"a":1e3'))).toEqual({ a: 1000 });
    // a string value that merely starts like a literal must not be touched
    expect(JSON.parse(repairJsonPrefix('{"a":"f'))).toEqual({ a: 'f' });
  });
});

describe('parsePartialJson', () => {
  it('returns null for empty / unparseable input', () => {
    expect(parsePartialJson('')).toBeNull();
    expect(parsePartialJson('   ')).toBeNull();
  });
});

describe('parsePartialAskUserQuestion (token-by-token stability)', () => {
  it('keeps a question as soon as its prompt text exists, before options arrive', () => {
    const buf = '{"questions":[{"header":"DB","question":"Which database?"';
    const qs = parsePartialAskUserQuestion(buf);
    expect(qs).toHaveLength(1);
    expect(qs[0]).toMatchObject({ question: 'Which database?', header: 'DB', options: [] });
  });

  it('does not surface a question before its prompt has any text', () => {
    expect(parsePartialAskUserQuestion('{"questions":[{"header":"DB"')).toHaveLength(0);
    expect(parsePartialAskUserQuestion('{"questions":[{"header":"DB","question":""')).toHaveLength(0);
  });

  it('grows options as they stream in, skipping a half-typed label', () => {
    const afterFirst = parsePartialAskUserQuestion(
      '{"questions":[{"question":"Q","options":[{"label":"Postgres"},{"label":"SQ',
    );
    expect(afterFirst[0]?.options.map((o) => o.label)).toEqual(['Postgres', 'SQ']);

    const labelNotYetStarted = parsePartialAskUserQuestion(
      '{"questions":[{"question":"Q","options":[{"label":"Postgres"},{"lab',
    );
    expect(labelNotYetStarted[0]?.options.map((o) => o.label)).toEqual(['Postgres']);
  });

  it('does not collapse when a boolean value is split across deltas', () => {
    // `multiSelect` cut mid-`false` used to make the whole prefix unparseable.
    const qs = parsePartialAskUserQuestion('{"questions":[{"question":"Q","multiSelect":f');
    expect(qs.map((q) => q.question)).toEqual(['Q']);
  });

  it('does not collapse mid-stream on a prompt ending in a dangling escape', () => {
    // A question mentioning a Windows path, cut right after a backslash, used
    // to make the repaired JSON invalid and drop the whole preview to [].
    const qs = parsePartialAskUserQuestion('{"questions":[{"question":"Edit C:\\');
    expect(qs).toHaveLength(1);
    expect(qs[0]?.question).toBe('Edit C:');
  });

  it('monotonically converges to the strict parse at completion', () => {
    let sawPrompt = false;
    for (let i = 1; i <= FULL.length; i++) {
      const qs = parsePartialAskUserQuestion(FULL.slice(0, i));
      if (qs.length > 0 && qs[0]!.question === 'Which database?') sawPrompt = true;
      if (sawPrompt && qs.length > 0) {
        expect('Which database?'.startsWith(qs[0]!.question) || qs[0]!.question === 'Which database?').toBe(true);
      }
    }
    expect(parsePartialAskUserQuestion(FULL)).toEqual(parseAskUserQuestionInput(JSON.parse(FULL)));
  });
});

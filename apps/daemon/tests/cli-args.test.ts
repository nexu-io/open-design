import { describe, expect, it } from 'vitest';
import {
  collectCliPositionals,
  parseFlags,
  positionalArgs,
} from '../src/cli-args.js';

describe('CLI argument contract', () => {
  const stringFlags = new Set(['name', 'value']);
  const booleanFlags = new Set(['json', 'dry-run']);

  it('parses known string, boolean, equals, and positional arguments', () => {
    expect(parseFlags(
      ['item', '--name', 'Widget', '--json', '--value=two'],
      { string: stringFlags, boolean: booleanFlags },
    )).toEqual({ name: 'Widget', json: true, value: 'two' });
  });

  it('rejects unknown flags and missing string values', () => {
    expect(() => parseFlags(['--nope'], { string: stringFlags })).toThrow(
      'unknown flag: --nope',
    );
    expect(() => parseFlags(['--name'], { string: stringFlags })).toThrow(
      'flag --name requires a value',
    );
  });

  it('keeps positional conventions stable around string flags', () => {
    const argv = ['project', '--name', 'Widget', 'tail', '--json'];
    expect(positionalArgs(argv, stringFlags)).toEqual(['project', 'tail']);
    expect(collectCliPositionals(argv, stringFlags)).toEqual(['project', 'tail']);
    expect(collectCliPositionals(['project', '--', '--literal', 'tail'], stringFlags))
      .toEqual(['project', '--literal', 'tail']);
  });
});

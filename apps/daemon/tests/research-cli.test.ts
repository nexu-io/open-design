import { describe, expect, it } from 'vitest';

import { splitResearchSubcommand } from '../src/research/cli-args.js'

describe('research CLI', () => {
  it('preserves query values equal to the search subcommand', () => {
    expect(
      splitResearchSubcommand([
        'search',
        '--query',
        'search',
        '--daemon-url',
        'http://127.0.0.1:7456',
      ]),
    ).toEqual({
      sub: 'search',
      subArgs: ['--query', 'search', '--daemon-url', 'http://127.0.0.1:7456'],
    });
  });

  it('skips --query value and keeps it in subArgs (#8890)', () => {
    expect(
      splitResearchSubcommand([
        '--query',
        'design',
        '--daemon-url',
        'http://127.0.0.1:7456',
        'search',
      ]),
    ).toEqual({
      sub: 'search',
      subArgs: ['--query', 'design', '--daemon-url', 'http://127.0.0.1:7456'],
    });
  });

  it('skips --max-sources value and keeps it in subArgs (#8890)', () => {
    expect(
      splitResearchSubcommand(['--max-sources', '3', 'search']),
    ).toEqual({
      sub: 'search',
      subArgs: ['--max-sources', '3'],
    });
  });

  it('skips --daemon-url value and keeps it in subArgs (#8890)', () => {
    expect(
      splitResearchSubcommand(['--daemon-url', 'http://127.0.0.1:7456', 'search']),
    ).toEqual({
      sub: 'search',
      subArgs: ['--daemon-url', 'http://127.0.0.1:7456'],
    });
  });

  it('handles no subcommand', () => {
    expect(splitResearchSubcommand(['--query', 'design'])).toEqual({
      sub: undefined,
      subArgs: ['--query', 'design'],
    });
  });

  it('handles only flag args', () => {
    expect(splitResearchSubcommand(['--help'])).toEqual({
      sub: undefined,
      subArgs: ['--help'],
    });
  });

  it('treats everything after -- as positional values (#8890)', () => {
    expect(splitResearchSubcommand(['--', 'search'])).toEqual({
      sub: undefined,
      subArgs: ['--', 'search'],
    });
  });

  it('does not consume a value for the equals form --flag=value (#8890)', () => {
    expect(splitResearchSubcommand(['--query=design', 'search'])).toEqual({
      sub: 'search',
      subArgs: ['--query=design'],
    });
  });

  it('does not treat an unknown flag value as a subcommand (#8890)', () => {
    // `--unknown` is not a known string flag, so `value` is the first
    // positional token — not a subcommand.
    expect(splitResearchSubcommand(['--unknown', 'value', 'search'])).toEqual({
      sub: undefined,
      subArgs: ['--unknown', 'value', 'search'],
    });
  });

  it('keeps a trailing duplicate search token in subArgs (#8890)', () => {
    expect(
      splitResearchSubcommand(['search', '--query', 'design', 'search']),
    ).toEqual({
      sub: 'search',
      subArgs: ['--query', 'design', 'search'],
    });
  });

  it('returns undefined sub when search is not present', () => {
    expect(
      splitResearchSubcommand([
        '--query',
        'design',
      ]),
    ).toEqual({
      sub: undefined,
      subArgs: ['--query', 'design'],
    });
  });

  it('handles duplicate search keyword as argument value (#8890)', () => {
    // 'search' appears as first non-flag argument (correct subcommand),
    // and again later as a regular argument value
    expect(
      splitResearchSubcommand([
        'search',
        '--query',
        'design',
        'search', // duplicate keyword as value
      ]),
    ).toEqual({
      sub: 'search',
      subArgs: ['--query', 'design', 'search'],
    });
  });
});
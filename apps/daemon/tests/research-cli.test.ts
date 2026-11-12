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

  it('handles string option values before search subcommand (#8890)', () => {
    // These should NOT be treated as subcommands
    expect(
      splitResearchSubcommand([
        '--query',
        'design',
        'search',
        '--daemon-url',
        'http://127.0.0.1:7456',
      ]),
    ).toEqual({
      sub: 'search',
      subArgs: ['--query', 'design', '--daemon-url', 'http://127.0.0.1:7456'],
    });
  });

  it('handles numeric option values before search subcommand (#8890)', () => {
    expect(
      splitResearchSubcommand([
        '--max-sources',
        '3',
        'search',
        '--query',
        'design',
      ]),
    ).toEqual({
      sub: 'search',
      subArgs: ['--max-sources', '3', '--query', 'design'],
    });
  });

  it('handles URL values before search subcommand (#8890)', () => {
    expect(
      splitResearchSubcommand([
        '--daemon-url',
        'http://127.0.0.1:7456',
        'search',
        '--query',
        'design',
      ]),
    ).toEqual({
      sub: 'search',
      subArgs: ['--daemon-url', 'http://127.0.0.1:7456', '--query', 'design'],
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
})

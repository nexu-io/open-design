import { describe, expect, it } from 'vitest';

import { splitResearchSubcommand } from '../src/research/cli-args.js';

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

  it('skips string-option values when looking for the subcommand', () => {
    // Options before the subcommand (the bug case from #8890)
    expect(
      splitResearchSubcommand([
        '--daemon-url',
        'http://localhost:3000',
        'search',
        '--query',
        'design',
      ]),
    ).toEqual({
      sub: 'search',
      subArgs: [
        '--daemon-url',
        'http://localhost:3000',
        '--query',
        'design',
      ],
    });
  });

  it('handles multiple string options interleaved with the subcommand', () => {
    expect(
      splitResearchSubcommand([
        '--max-sources',
        '3',
        '--daemon-url',
        'http://localhost:3000',
        'search',
        '--query',
        'design',
      ]),
    ).toEqual({
      sub: 'search',
      subArgs: [
        '--max-sources',
        '3',
        '--daemon-url',
        'http://localhost:3000',
        '--query',
        'design',
      ],
    });
  });

  it('returns undefined sub when no non-flag token exists', () => {
    expect(
      splitResearchSubcommand(['--daemon-url', 'http://localhost:3000']),
    ).toEqual({ sub: undefined, subArgs: ['--daemon-url', 'http://localhost:3000'] });
  });
});

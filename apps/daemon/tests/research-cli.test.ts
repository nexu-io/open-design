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

  it('treats string option values before search as flag values, not subcommands', () => {
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

  it('treats max-sources value before search as flag value', () => {
    expect(
      splitResearchSubcommand(['--max-sources', '3', 'search', '--query', 'design']),
    ).toEqual({
      sub: 'search',
      subArgs: ['--max-sources', '3', '--query', 'design'],
    });
  });

  it('treats daemon-url value before search as flag value', () => {
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
      subArgs: [
        '--daemon-url',
        'http://127.0.0.1:7456',
        '--query',
        'design',
      ],
    });
  });

  it('rejects malformed input with no subcommand', () => {
    expect(
      splitResearchSubcommand(['--query', 'design', '--daemon-url', 'http://127.0.0.1:7456']),
    ).toEqual({
      sub: undefined,
      subArgs: ['--query', 'design', '--daemon-url', 'http://127.0.0.1:7456'],
    });
  });

  it('treats equals-form option values as part of the flag', () => {
    expect(
      splitResearchSubcommand([
        '--query=design',
        'search',
      ]),
    ).toEqual({
      sub: 'search',
      subArgs: ['--query=design'],
    });
  });
});

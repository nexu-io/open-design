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
      ])
    ).toEqual({
      sub: 'search',
      subArgs: ['--query', 'search', '--daemon-url', 'http://127.0.0.1:7456'],
    });
  });

  it('skips --query value and keeps it in subArgs', () => {
    expect(
      splitResearchSubcommand([
        '--query',
        'design',
        '--daemon-url',
        'http://127.0.0.1:7456',
        'search',
      ])
    ).toEqual({
      sub: 'search',
      subArgs: ['--query', 'design', '--daemon-url', 'http://127.0.0.1:7456'],
    });
  });

  it('skips --max-sources value and keeps it in subArgs', () => {
    expect(
      splitResearchSubcommand([
        '--max-sources',
        '3',
        'search',
      ])
    ).toEqual({
      sub: 'search',
      subArgs: ['--max-sources', '3'],
    });
  });

  it('skips --daemon-url value and keeps it in subArgs', () => {
    expect(
      splitResearchSubcommand([
        '--daemon-url',
        'http://127.0.0.1:7456',
        'search',
      ])
    ).toEqual({
      sub: 'search',
      subArgs: ['--daemon-url', 'http://127.0.0.1:7456'],
    });
  });

  it('handles no subcommand', () => {
    expect(
      splitResearchSubcommand([
        '--query',
        'design',
      ])
    ).toEqual({
      sub: undefined,
      subArgs: ['--query', 'design'],
    });
  });

  it('handles only flag args', () => {
    expect(
      splitResearchSubcommand([
        '--help',
      ])
    ).toEqual({
      sub: undefined,
      subArgs: ['--help'],
    });
  });
});
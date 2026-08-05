import { describe, expect, it } from 'vitest';

import { splitResearchSubcommand } from '../src/research/cli-args.js';
import { runResearch, type ResearchCliDeps } from '../src/research/cli.js';

class CliExit extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
  }
}

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

  it('posts a typed research request and forwards the daemon response', async () => {
    const output: string[] = [];
    let request: Request | undefined;
    const deps: ResearchCliDeps = {
      resolveDaemonUrl: async () => 'http://127.0.0.1:7456/',
      fetch: async (input, init) => {
        request = new Request(input, init);
        return new Response('{"ok":true}', { status: 200 });
      },
      surfaceFetchError: () => undefined,
      writeStdout: (text) => output.push(text),
      writeStderr: () => undefined,
      exit: ((code: number): never => { throw new CliExit(code); }),
    };

    await runResearch(['search', '--query', 'typed boundary', '--max-sources', '7'], deps);

    expect(request?.url).toBe('http://127.0.0.1:7456/api/research/search');
    expect(await request?.json()).toEqual({ query: 'typed boundary', maxSources: 7 });
    expect(output).toEqual(['{"ok":true}\n']);
  });

  it('keeps daemon HTTP failures on the CLI error path', async () => {
    const errors: string[] = [];
    const deps: ResearchCliDeps = {
      resolveDaemonUrl: async () => 'http://127.0.0.1:7456',
      fetch: async () => new Response('upstream failed', { status: 502 }),
      surfaceFetchError: () => undefined,
      writeStdout: () => undefined,
      writeStderr: (text) => errors.push(text),
      exit: ((code: number): never => { throw new CliExit(code); }),
    };

    await expect(runResearch(['search', '--query', 'failure'], deps)).rejects.toMatchObject({ code: 4 });
    expect(errors).toEqual(['daemon 502: upstream failed\n']);
  });
});

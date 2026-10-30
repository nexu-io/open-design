import { execFile } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import { splitResearchSubcommand } from '../src/research/cli-args.js';

const execFileP = promisify(execFile);
const cliSource = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const tsxEntry = fileURLToPath(new URL('../../../node_modules/tsx/dist/cli.mjs', import.meta.url));

async function researchRequest(args: (baseUrl: string) => string[]) {
  const requests: Array<{ method: string | undefined; url: string | undefined; body: unknown }> = [];
  const response = { query: 'search', sources: [], provider: 'tavily', depth: 'shallow' };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, body: JSON.parse(body) });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(response));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('HTTP fixture has no port');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    const result = await execFileP(process.execPath, [tsxEntry, cliSource, 'research', ...args(baseUrl)], {
      env, timeout: 15_000,
    });
    return { ...result, requests, response };
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

describe('research CLI', () => {
  it('keeps a daemon URL before the subcommand attached to its flag', () => {
    expect(splitResearchSubcommand([
      '--daemon-url', 'http://127.0.0.1:7456', 'search', '--query', 'design',
    ])).toEqual({
      sub: 'search',
      subArgs: ['--daemon-url', 'http://127.0.0.1:7456', '--query', 'design'],
    });
  });

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

  it.each([
    { args: ['--query', 'search', 'search'], remaining: ['--query', 'search'] },
    { args: ['--max-sources', '3', 'search'], remaining: ['--max-sources', '3'] },
    { args: ['--query=search', 'search'], remaining: ['--query=search'] },
  ])('keeps option values out of subcommand discovery: $args', ({ args, remaining }) => {
    expect(splitResearchSubcommand(args)).toEqual({ sub: 'search', subArgs: remaining });
  });

  it('does not invent a subcommand from a flag value when the verb is absent', () => {
    expect(splitResearchSubcommand(['--query', 'search'])).toEqual({
      sub: undefined, subArgs: ['--query', 'search'],
    });
  });

  it.each(['verb first', 'daemon first', 'query first', 'cap first', 'equals form'])(
    'sends the same research request with %s',
    async order => {
      const result = await researchRequest(baseUrl => {
        if (order === 'daemon first') return ['--daemon-url', baseUrl, 'search', '--query', 'search'];
        if (order === 'query first') return ['--query', 'search', 'search', '--daemon-url', baseUrl];
        if (order === 'cap first') return ['--max-sources', '3', 'search', '--query', 'search', '--daemon-url', baseUrl];
        if (order === 'equals form') return ['--query=search', `--daemon-url=${baseUrl}`, 'search'];
        return ['search', '--query', 'search', '--daemon-url', baseUrl];
      });
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toEqual(result.response);
      expect(result.requests).toEqual([{
        method: 'POST', url: '/api/research/search',
        body: order === 'cap first' ? { query: 'search', maxSources: 3 } : { query: 'search' },
      }]);
    },
  );
});

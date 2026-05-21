// CLI coverage for `od page-pattern list/show` added in PR-1 of the
// page-patterns feature (see docs/plans/2026-05-21-page-patterns.md).
//
// The test boots an in-process Express mock that mirrors the production
// /api/page-patterns shape (the daemon-side route is exercised end-to-end
// in page-patterns-routes.test.ts), then spawns `apps/daemon/src/cli.ts`
// with `--daemon-url` pointing at the mock. This proves the CLI dispatch
// (SUBCOMMAND_MAP), the runLibraryList helper's response-key projection,
// and JSON / show modes without requiring a running daemon — mirroring
// how `cli-startup.test.ts` invokes the CLI through `execFile`.

import express from 'express';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

interface CliResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function runCli(args: string[], extraEnv: NodeJS.ProcessEnv = {}): Promise<CliResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', cliEntry, ...args],
      {
        cwd: daemonRoot,
        env: { ...process.env, ...extraEnv },
      },
      (error, stdout, stderr) => {
        const code = error && typeof (error as { code?: number }).code === 'number'
          ? ((error as { code: number }).code)
          : error
            ? 1
            : 0;
        resolve({ stdout, stderr, code });
      },
    );
  });
}

// The fake daemon mirrors the production list / detail response shapes so
// `runLibraryList` can route the `name === 'page-patterns'` case onto the
// `patterns` array on the wire payload.
const FAKE_LIST = {
  patterns: [
    {
      id: 'auth-login',
      name: 'Auth Login',
      title: 'Auth Login',
      hasBody: true,
      pageType: 'auth.login',
      pageInputs: [],
      pageOutputs: [
        { name: 'submit', kind: 'navigation', targetPageType: 'dashboard.metrics' },
      ],
    },
    {
      id: 'dashboard-metrics',
      name: 'Dashboard Metrics',
      title: 'Dashboard Metrics',
      hasBody: true,
      pageType: 'dashboard.metrics',
      pageInputs: [],
      pageOutputs: [],
    },
  ],
};

const FAKE_DETAIL = {
  pattern: {
    id: 'auth-login',
    name: 'Auth Login',
    title: 'Auth Login',
    hasBody: true,
    pageType: 'auth.login',
    pageInputs: [],
    pageOutputs: [
      { name: 'submit', kind: 'navigation', targetPageType: 'dashboard.metrics' },
    ],
    body: '# Login\n\nA login page.\n',
  },
};

describe('od page-pattern CLI', () => {
  let server: http.Server;
  let daemonUrl: string;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        const app = express();
        app.get('/api/page-patterns', (_req, res) => res.json(FAKE_LIST));
        app.get('/api/page-patterns/auth-login', (_req, res) => res.json(FAKE_DETAIL));
        app.get('/api/page-patterns/:id', (_req, res) =>
          res.status(404).json({ error: 'not found' }),
        );
        server = app.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          daemonUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      }),
  );

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  );

  it('`od page-pattern list --json` returns the patterns payload from the daemon', async () => {
    const result = await runCli(['page-pattern', 'list', '--json', '--daemon-url', daemonUrl]);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(Array.isArray(parsed.patterns)).toBe(true);
    expect(parsed.patterns).toHaveLength(2);
    for (const pattern of parsed.patterns) {
      expect(typeof pattern.pageType).toBe('string');
    }
  });

  it('`od page-pattern list` (no --json) prints id\\tlabel rows for every entry', async () => {
    const result = await runCli(['page-pattern', 'list', '--daemon-url', daemonUrl]);
    expect(result.code).toBe(0);
    const lines = result.stdout.trim().split('\n');
    // Two seeded entries, one row each.
    expect(lines).toHaveLength(2);
    expect(lines[0]?.startsWith('auth-login\t')).toBe(true);
    expect(lines[1]?.startsWith('dashboard-metrics\t')).toBe(true);
  });

  it('`od page-pattern show <id> --json` returns the detail payload with body', async () => {
    const result = await runCli([
      'page-pattern',
      'show',
      'auth-login',
      '--json',
      '--daemon-url',
      daemonUrl,
    ]);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.pattern?.id).toBe('auth-login');
    expect(typeof parsed.pattern?.body).toBe('string');
    expect(parsed.pattern.body.length).toBeGreaterThan(0);
  });
});

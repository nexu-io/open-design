// @vitest-environment node

import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { createSmokeSuite } from '@/vitest/suite';

const odBin = fileURLToPath(new URL('../../apps/daemon/bin/od.mjs', import.meta.url));

describe('artifact lint CLI end-to-end', () => {
  test('[P1] real od lint uses the running daemon for files, stdin, JSON, and exit thresholds', async () => {
    const suite = await createSmokeSuite('artifact-lint-cli');

    await suite.with.toolsDev(async ({ runtime }) => {
      const daemonUrl = `http://127.0.0.1:${runtime.daemonPort}`;
      const artifactPath = join(suite.scratchDir, 'default-indigo.html');
      await writeFile(
        artifactPath,
        '<!doctype html><main style="color:#6366f1"><h1>Generated artifact</h1></main>',
        'utf8',
      );

      const rejected = await odLint(
        daemonUrl,
        ['lint', artifactPath, '--json'],
      );
      expect(rejected.code, rejected.stderr || rejected.stdout).toBe(1);
      const report = JSON.parse(rejected.stdout) as {
        counts: { p0: number; p1: number; p2: number };
        failOn: string;
        findings: Array<{ id: string; severity: string }>;
        ok: boolean;
      };
      expect(report).toMatchObject({
        ok: false,
        failOn: 'p0',
        counts: { p0: expect.any(Number), p1: expect.any(Number), p2: expect.any(Number) },
      });
      expect(report.counts.p0).toBeGreaterThan(0);
      expect(report.findings).toContainEqual(expect.objectContaining({
        id: 'ai-default-indigo',
        severity: 'P0',
      }));

      const clean = await odLint(
        daemonUrl,
        ['lint', '-', '--json'],
        '<!doctype html><main><h1>Deliberate artifact</h1></main>',
      );
      expect(clean.code, clean.stderr || clean.stdout).toBe(0);
      expect(JSON.parse(clean.stdout)).toMatchObject({
        ok: true,
        failOn: 'p0',
        counts: { p0: 0 },
      });
    });
  }, 180_000);
});

async function odLint(
  daemonUrl: string,
  args: string[],
  stdin?: string,
): Promise<{ code: number; stderr: string; stdout: string }> {
  return await new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [odBin, ...args],
      {
        env: { ...process.env, OD_DAEMON_URL: daemonUrl },
        maxBuffer: 4 * 1024 * 1024,
        timeout: 60_000,
      },
      (error, stdout, stderr) => {
        const failure = error as { code?: number } | null;
        resolve({
          code: typeof failure?.code === 'number' ? failure.code : error ? 1 : 0,
          stderr: stderr ?? '',
          stdout: stdout ?? '',
        });
      },
    );
    child.stdin?.end(stdin);
  });
}

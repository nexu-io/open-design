import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { fundingCasePlan, recordOdSource } from '@/playwright/funding-runner';

describe('owned funding runner source provenance', () => {
  it('records WS005 with only its complete imported closure, and fails on every missing required source', async () => {
    const root = await mkdtemp(join(tmpdir(), 'od-funding-source-'));
    const e2eRoot = join(root, 'e2e');
    const output = join(root, 'evidence');
    const plan = fundingCasePlan('ws005');
    try {
      await mkdir(output);
      for (const source of plan.sources) {
        await mkdir(dirname(join(e2eRoot, source)), { recursive: true });
        await writeFile(join(e2eRoot, source), `fixture source ${source}\n`);
      }
      execFileSync('git', ['init', '--quiet'], { cwd: root });
      execFileSync('git', ['add', '.'], { cwd: root });
      execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        'commit', '--quiet', '-m', 'source metadata fixture'], { cwd: root });
      const metadata = await recordOdSource(e2eRoot, output, 'ws005');
      expect(metadata.config).toBe('lib/playwright/workspace-switch.config.ts');
      expect(metadata.selection).toBe('ws005');
      expect(metadata.sources.map(source => source.path)).toEqual(plan.sources);
      expect(metadata.sources.some(source => /notice|free-wallet/.test(source.path))).toBe(false);
      for (const source of metadata.sources) {
        const bytes = await readFile(join(e2eRoot, source.path));
        expect(source.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
      }
      for (const source of plan.sources) {
        const path = join(e2eRoot, source);
        const original = await readFile(path);
        await rm(path);
        await expect(recordOdSource(e2eRoot, output, 'ws005')).rejects.toMatchObject({ code: 'ENOENT', path });
        await writeFile(path, original);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(['unknown', '__proto__', 'constructor'])('rejects unsupported case %s before any child command', selection => {
    expect(() => fundingCasePlan(selection)).toThrow('Unknown OD_FUNDING_CASE');
  });

  it('binds the case manifest to the same config and filter that the runner executes', () => {
    expect(fundingCasePlan().sources).toContain('ui/workspace-funding-sandbox.test.ts');
    expect(fundingCasePlan('bill001').sources).toContain('ui/qa-bill001.private.test.ts');
    expect(fundingCasePlan('home').grep).toBe('VIEW-015 home');
    expect(fundingCasePlan('view020').sources).toContain('ui/workspace-notice-sandbox.test.ts');
    expect(fundingCasePlan('view021').grep).toBe('VIEW-021 actual');
    expect(fundingCasePlan('view021-after').grep).toBe('VIEW-021 continuation');
  });
});

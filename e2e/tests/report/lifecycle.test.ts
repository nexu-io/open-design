// @vitest-environment node

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, test } from 'vitest';

import { createReport } from '@/vitest/report';

const roots: string[] = [];

describe('report lifecycle', () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
  });

  test('saves binary and JSON entries under the report root', async () => {
    const root = await makeRoot();
    const report = await createReport(root);

    const binary = await report.save('evidence/sample.bin', Buffer.from([1, 2, 3]));
    const json = await report.json('summary.json', { ok: true });

    expect(binary.relpath).toBe('evidence/sample.bin');
    expect(binary.path).toBe(join(root, 'evidence', 'sample.bin'));
    expect(binary.bytes).toBe(3);
    expect(await readFile(binary.path)).toEqual(Buffer.from([1, 2, 3]));
    expect(json.path).toBe(join(root, 'summary.json'));
    expect(JSON.parse(await readFile(json.path, 'utf8'))).toEqual({ ok: true });
  });

  test('rejects absolute paths and parent traversal', async () => {
    const report = await createReport(await makeRoot());

    await expect(report.save('/tmp/out.txt', 'x')).rejects.toThrow(/relative/);
    await expect(report.save('../out.txt', 'x')).rejects.toThrow(/escape/);
    await expect(report.save('nested/../../out.txt', 'x')).rejects.toThrow(/escape/);
  });
});

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'open-design-e2e-report-'));
  roots.push(root);
  return root;
}

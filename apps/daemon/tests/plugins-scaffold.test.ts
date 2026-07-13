// Phase 4 / spec §14.1 — `od plugin scaffold` unit test.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ScaffoldError,
  scaffoldPlugin,
} from '../src/plugins/scaffold.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-scaffold-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('scaffoldPlugin', () => {
  it('writes SKILL.md + open-design.json + README.md by default', async () => {
    const result = await scaffoldPlugin({
      targetDir: tmpDir,
      id:        'sample-plugin',
    });
    expect(result.folder).toBe(path.join(tmpDir, 'sample-plugin'));
    expect(result.files.map((f) => path.basename(f)).sort()).toEqual([
      'README.md',
      'SKILL.md',
      'open-design.json',
    ]);
    const skillBody = await readFile(path.join(result.folder, 'SKILL.md'), 'utf8');
    expect(skillBody).toMatch(/^---/);
    expect(skillBody).toMatch(/name: sample-plugin/);
    const manifest = JSON.parse(
      await readFile(path.join(result.folder, 'open-design.json'), 'utf8'),
    );
    expect(manifest.name).toBe('sample-plugin');
    expect(manifest.od.taskKind).toBe('new-generation');
    expect(manifest.od.useCase.query).toMatch(/sample plugin/i);
  });

  it('humanises the title from the id when --title is omitted', async () => {
    const result = await scaffoldPlugin({
      targetDir: tmpDir,
      id:        'my-cool-plugin',
    });
    const manifest = JSON.parse(
      await readFile(path.join(result.folder, 'open-design.json'), 'utf8'),
    );
    expect(manifest.title).toBe('My Cool Plugin');
  });

  it('emits a Claude Code plugin.json when withClaudePlugin=true', async () => {
    const result = await scaffoldPlugin({
      targetDir:        tmpDir,
      id:               'sample-plugin',
      withClaudePlugin: true,
    });
    const cpPath = path.join(result.folder, '.claude-plugin', 'plugin.json');
    const cpStat = await stat(cpPath);
    expect(cpStat.isFile()).toBe(true);
    const cp = JSON.parse(await readFile(cpPath, 'utf8'));
    expect(cp.name).toBe('sample-plugin');
  });

  it('refuses to overwrite an existing scaffolded folder', async () => {
    await scaffoldPlugin({ targetDir: tmpDir, id: 'sample-plugin' });
    await expect(
      scaffoldPlugin({ targetDir: tmpDir, id: 'sample-plugin' }),
    ).rejects.toBeInstanceOf(ScaffoldError);
  });

  it('rejects unsafe ids', async () => {
    await expect(
      scaffoldPlugin({ targetDir: tmpDir, id: 'BadID' }),
    ).rejects.toBeInstanceOf(ScaffoldError);
    await expect(
      scaffoldPlugin({ targetDir: tmpDir, id: '../escape' }),
    ).rejects.toBeInstanceOf(ScaffoldError);
  });
});

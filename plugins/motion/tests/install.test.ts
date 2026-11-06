import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveInstalled } from '../scripts/resolve-installed.mjs';

test('preview resolves versioned cache and compatible local cache without changing user configuration', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'motion-install-'));
  try {
    const project = path.join(root, 'project'); const codex = path.join(root, 'codex');
    const manifest = JSON.stringify({ name: 'motion', version: '0.2.0' });
    await mkdir(path.join(project, '.codex-plugin'), { recursive: true });
    await writeFile(path.join(project, '.codex-plugin/plugin.json'), manifest);
    const local = path.join(codex, 'plugins/cache/motion-local/motion/local');
    const versioned = path.join(codex, 'plugins/cache/motion-local/motion/0.2.0');
    for (const directory of [local, versioned]) {
      await mkdir(path.join(directory, '.codex-plugin'), { recursive: true });
      await writeFile(path.join(directory, '.codex-plugin/plugin.json'), manifest);
      await writeFile(path.join(directory, 'server.ts'), '');
    }
    assert.equal(resolveInstalled(project, codex), versioned);
    await rm(versioned, { recursive: true }); assert.equal(resolveInstalled(project, codex), local);
    await writeFile(path.join(local, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'motion', version: '0.1.0' }));
    assert.throws(() => resolveInstalled(project, codex), /未找到 OpenDesign 0.2.0/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

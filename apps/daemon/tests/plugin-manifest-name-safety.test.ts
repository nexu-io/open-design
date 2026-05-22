// Regression test for readProjectPluginManifest name safety (issue #2749).
//
// A plugin whose open-design.json carries name: "../../evil" or name: ".."
// previously propagated to githubRepoNameFromPluginName and then to
// path.join(tmp, repoName) in the publish flow. githubRepoNameFromPluginName
// sanitises slashes and strips leading dots so the actual path.join was safe,
// but the unsanitised name also appeared verbatim in commit messages and
// PR descriptions. This guard rejects the name early with a clear error.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readProjectPluginManifest } from '../src/server.js';

let tmpDir: string;
beforeEach(async () => { tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-name-safety-')); });
afterEach(async () => { await rm(tmpDir, { recursive: true, force: true }); });

describe('readProjectPluginManifest — name safety', () => {
  it('rejects a name containing a forward slash', async () => {
    await writeFile(path.join(tmpDir, 'open-design.json'), JSON.stringify({ name: '../../evil' }));
    await expect(readProjectPluginManifest(tmpDir)).rejects.toThrow(/path separators/);
  });

  it('rejects a name that is purely dots (..)', async () => {
    await writeFile(path.join(tmpDir, 'open-design.json'), JSON.stringify({ name: '..' }));
    await expect(readProjectPluginManifest(tmpDir)).rejects.toThrow(/dots/);
  });

  it('rejects a name containing a backslash', async () => {
    await writeFile(path.join(tmpDir, 'open-design.json'), JSON.stringify({ name: 'evil\\path' }));
    await expect(readProjectPluginManifest(tmpDir)).rejects.toThrow(/path separators/);
  });

  it('accepts a normal plugin name with dots and dashes', async () => {
    await writeFile(path.join(tmpDir, 'open-design.json'), JSON.stringify({ name: 'my-plugin.v2' }));
    const result = await readProjectPluginManifest(tmpDir);
    expect(result.name).toBe('my-plugin.v2');
  });
});

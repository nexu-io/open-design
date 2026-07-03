import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  snapshotAiHtmlVersionsForRun,
} from '../src/run-html-version-snapshots.js';

describe('AI HTML version snapshots', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  async function makeProject(): Promise<{ root: string; projectsRoot: string; projectId: string; projectRoot: string }> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-html-version-snapshots-'));
    roots.push(root);
    const projectsRoot = path.join(root, 'projects');
    const projectId = 'project-1';
    const projectRoot = path.join(projectsRoot, projectId);
    await fs.mkdir(projectRoot, { recursive: true });
    return { root, projectsRoot, projectId, projectRoot };
  }

  it('throws an aggregate error when a touched HTML version cannot be persisted', async () => {
    const { projectsRoot, projectId, projectRoot } = await makeProject();
    const htmlPath = path.join(projectRoot, 'index.html');
    await fs.writeFile(htmlPath, '<html><body>draft</body></html>');
    await fs.writeFile(path.join(projectRoot, '.file-versions'), 'blocked');

    await expect(snapshotAiHtmlVersionsForRun({
      projectsRoot,
      projectId,
      projectRoot,
      diff: { touchedPaths: [htmlPath] },
      prompt: 'Make a page',
      promptSource: 'message',
    })).rejects.toMatchObject({
      code: 'HTML_VERSION_SNAPSHOT_FAILED',
      failures: [{ fileName: 'index.html' }],
    });
  });
});

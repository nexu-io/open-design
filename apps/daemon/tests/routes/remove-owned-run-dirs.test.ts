import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { removeRunDirsOwnedByProject } from '../../src/routes/project/remove-owned-run-dirs.js';

const created: string[] = [];

async function makeRunsDir(
  runs: Array<{ id: string; state?: unknown; stateRaw?: string }>,
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'od-runs-'));
  created.push(root);
  for (const run of runs) {
    const dir = path.join(root, run.id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'events.jsonl'), '{"event":"start"}\n');
    if (run.stateRaw !== undefined) {
      await writeFile(path.join(dir, 'state.json'), run.stateRaw);
    } else if (run.state !== undefined) {
      await writeFile(path.join(dir, 'state.json'), JSON.stringify(run.state));
    }
  }
  return root;
}

afterEach(async () => {
  await Promise.all(
    created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe('removeRunDirsOwnedByProject', () => {
  it('removes only the run directories the deleted project owns', async () => {
    const runsDir = await makeRunsDir([
      { id: 'run-a', state: { id: 'run-a', projectId: 'keep-me' } },
      { id: 'run-b', state: { id: 'run-b', projectId: 'delete-me' } },
      { id: 'run-c', state: { id: 'run-c', projectId: 'delete-me' } },
    ]);

    const removed = await removeRunDirsOwnedByProject(runsDir, 'delete-me');

    expect(removed).toBe(2);
    expect((await readdir(runsDir)).sort()).toEqual(['run-a']);
  });

  it('leaves directories it cannot attribute alone', async () => {
    // A run whose state file is missing, unparseable, or has no projectId is
    // ambiguous. Stranding a few KB beats deleting a run that belongs to a
    // project the user is keeping, so these must survive.
    const runsDir = await makeRunsDir([
      { id: 'no-state' },
      { id: 'corrupt-state', stateRaw: '{not json' },
      { id: 'no-project', state: { id: 'no-project', status: 'succeeded' } },
      { id: 'owned', state: { id: 'owned', projectId: 'delete-me' } },
    ]);

    const removed = await removeRunDirsOwnedByProject(runsDir, 'delete-me');

    expect(removed).toBe(1);
    expect((await readdir(runsDir)).sort()).toEqual([
      'corrupt-state',
      'no-project',
      'no-state',
    ]);
  });

  it('ignores loose files in the runs root', async () => {
    const runsDir = await makeRunsDir([
      { id: 'owned', state: { id: 'owned', projectId: 'delete-me' } },
    ]);
    await writeFile(path.join(runsDir, 'stray.log'), 'not a run directory');

    const removed = await removeRunDirsOwnedByProject(runsDir, 'delete-me');

    expect(removed).toBe(1);
    expect(await readdir(runsDir)).toEqual(['stray.log']);
  });

  it('is a no-op when the runs root does not exist', async () => {
    const missing = path.join(tmpdir(), `od-runs-missing-${Date.now()}`);
    await expect(removeRunDirsOwnedByProject(missing, 'delete-me')).resolves.toBe(0);
  });

  it('is a no-op without a runs dir or project id', async () => {
    const runsDir = await makeRunsDir([
      { id: 'owned', state: { id: 'owned', projectId: 'delete-me' } },
    ]);

    expect(await removeRunDirsOwnedByProject('', 'delete-me')).toBe(0);
    expect(await removeRunDirsOwnedByProject(runsDir, '')).toBe(0);
    expect((await readdir(runsDir)).sort()).toEqual(['owned']);
  });
});

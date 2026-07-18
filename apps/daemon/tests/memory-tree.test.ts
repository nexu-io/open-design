import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildMemoryTree,
  memoryDir,
  readMemoryEntry,
  updateMemoryTreeNode,
  upsertMemoryEntry,
} from '../src/memory.js';

let dataDir = '';

beforeEach(async () => {
  dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-memory-tree-'));
});

afterEach(async () => {
  await fsp.rm(dataDir, { recursive: true, force: true });
});

describe('memory tree helpers', () => {
  it('derives folder and entry nodes from the markdown memory store', async () => {
    await upsertMemoryEntry(
      dataDir,
      {
        name: 'Design agent goal',
        description: 'Open Design should evolve from accepted work',
        type: 'project',
        body: '- Keep design-system extraction in the loop',
      },
      { silent: true },
    );

    const tree = await buildMemoryTree(dataDir);

    expect(tree).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'folder:project',
          kind: 'folder',
          path: '/project',
          childrenCount: 1,
        }),
        expect.objectContaining({
          id: 'project_design_agent_goal',
          parentId: 'folder:project',
          kind: 'entry',
          path: '/project/project_design_agent_goal',
          scope: 'project',
        }),
      ]),
    );
  });

  it('edits and moves an entry through the tree-aware patch helper', async () => {
    const entry = await upsertMemoryEntry(
      dataDir,
      {
        name: 'Reusable pattern',
        description: 'Skill candidate',
        type: 'reference',
        body: '- Draft artifacts with provenance',
      },
      { silent: true },
    );

    const updated = await updateMemoryTreeNode(dataDir, entry.id, {
      name: 'Reusable pattern',
      description: 'Skill candidate promoted from automation',
      type: 'project',
      body: '- Draft artifacts with provenance\n- Promote repeatable work into skills',
    });

    expect(updated.type).toBe('project');
    expect(updated.description).toContain('promoted from automation');
    expect(updated.body).toContain('Promote repeatable work into skills');

    const stored = await readMemoryEntry(dataDir, entry.id);
    expect(stored?.type).toBe('project');

    const tree = await buildMemoryTree(dataDir);
    expect(tree).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: entry.id,
          parentId: 'folder:project',
          path: `/project/${entry.id}`,
        }),
      ]),
    );
  });

  it('rejects derived folder edits', async () => {
    await expect(
      updateMemoryTreeNode(dataDir, 'folder:project', { name: 'Project' }),
    ).rejects.toThrow('memory tree folders are derived');
  });

  it('returns an empty folder tree when the store is empty', async () => {
    await fsp.rm(memoryDir(dataDir), { recursive: true, force: true });
    const tree = await buildMemoryTree(dataDir);

    // One folder per memory type: profile, user, feedback, project, reference,
    // rule (the two new types — profile + rule — added two folders).
    expect(tree.filter((node) => node.kind === 'folder')).toHaveLength(6);
    expect(tree.filter((node) => node.kind === 'entry')).toHaveLength(0);
  });
});

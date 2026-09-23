// Phase 4 / spec §23.3.2 patch 2 — atom SKILL.md body loader.
//
// The substrate slice for lifting `composeSystemPrompt`'s prompt
// constants into the bundled atom plugins. The daemon-side helper
// reads `<bundled-fsPath>/SKILL.md` and strips frontmatter; the
// pure renderer in @open-design/contracts then assembles the stage
// prompt block. This test pins both halves of the contract so a
// future PR that lifts system.ts has zero scaffolding to build.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migratePlugins } from '../src/plugins/persistence.js';
import { registerBundledPlugins } from '../src/plugins/bundled.js';
import { loadAtomBodies } from '../src/plugins/atom-bodies.js';
import { renderActiveStageBlock, renderActiveStageBlocks } from '@open-design/contracts';

const SAMPLE_MANIFEST = (id: string) =>
  JSON.stringify({
    $schema: 'https://open-design.ai/schemas/plugin.v1.json',
    name: id,
    title: id,
    version: '0.1.0',
    description: `${id} fixture`,
    license: 'MIT',
    od: { kind: 'atom', capabilities: ['prompt:inject'] },
  });

const SAMPLE_SKILL = (id: string, body: string) =>
  `---\nname: ${id}\ndescription: ${id} fixture\n---\n\n# ${id}\n\n${body}\n`;

let db: Database.Database;
let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'od-atom-bodies-'));
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT, title TEXT);
  `);
  migratePlugins(db);

  // Build a minimal bundled root with two atom plugins so the loader has
  // something to find.
  const atomA = path.join(tmpRoot, 'atoms', 'discovery-question-form');
  const atomB = path.join(tmpRoot, 'atoms', 'todo-write');
  await mkdir(atomA, { recursive: true });
  await mkdir(atomB, { recursive: true });
  await writeFile(path.join(atomA, 'open-design.json'), SAMPLE_MANIFEST('discovery-question-form'));
  await writeFile(path.join(atomA, 'SKILL.md'), SAMPLE_SKILL('discovery-question-form', 'Ask the user about audience.'));
  await writeFile(path.join(atomB, 'open-design.json'), SAMPLE_MANIFEST('todo-write'));
  await writeFile(path.join(atomB, 'SKILL.md'), SAMPLE_SKILL('todo-write', 'Commit a numbered plan.'));

  await registerBundledPlugins({ db, bundledRoot: tmpRoot });
});

afterEach(async () => {
  db.close();
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('loadAtomBodies', () => {
  it('reads SKILL.md bodies for bundled atoms (frontmatter stripped)', async () => {
    const out = await loadAtomBodies(db, ['discovery-question-form', 'todo-write']);
    expect(out.map((e) => e.atomId)).toEqual(['discovery-question-form', 'todo-write']);
    expect(out[0]!.body).toContain('# discovery-question-form');
    expect(out[0]!.body).toContain('Ask the user about audience.');
    expect(out[0]!.body.startsWith('---')).toBe(false);
  });

  it('skips ids without an installed plugin or readable SKILL.md', async () => {
    const out = await loadAtomBodies(db, ['unknown-atom', 'todo-write']);
    expect(out.map((e) => e.atomId)).toEqual(['todo-write']);
  });

  it('returns an empty array for an empty input', async () => {
    expect(await loadAtomBodies(db, [])).toEqual([]);
  });
});

describe('renderActiveStageBlock + loadAtomBodies (end-to-end stage block)', () => {
  it('builds a `## Active stage` header followed by every atom body', async () => {
    const bodies = await loadAtomBodies(db, ['discovery-question-form', 'todo-write']);
    const block = renderActiveStageBlock({ stageId: 'plan', bodies });
    expect(block).toContain('## Active stage: plan');
    expect(block).toContain('### discovery-question-form');
    expect(block).toContain('Ask the user about audience.');
    expect(block).toContain('### todo-write');
    expect(block).toContain('Commit a numbered plan.');
  });
});

describe('renderActiveStageBlocks + loadAtomBodies (issue #6238 cross-stage dedup)', () => {
  it('inlines an atom shared by two stages exactly once, mirroring the server composer loop', async () => {
    // Same shape as the `activeStageBlocks` build in server.ts and the
    // od-default pipeline: `discovery-question-form` declared by both
    // `task-type` and `discovery`.
    const stages = [
      { id: 'task-type', atoms: ['discovery-question-form'] },
      { id: 'discovery', atoms: ['discovery-question-form', 'todo-write'] },
    ];
    const stageViews = [];
    for (const stage of stages) {
      stageViews.push({ stageId: stage.id, bodies: await loadAtomBodies(db, stage.atoms) });
    }
    const blocks = renderActiveStageBlocks(stageViews);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain('## Active stage: task-type');
    expect(blocks[1]).toContain('## Active stage: discovery');
    // Full body once, under the first stage only.
    const joined = blocks.join('\n');
    expect(joined.split('Ask the user about audience.').length - 1).toBe(1);
    expect(blocks[0]).toContain('Ask the user about audience.');
    // Second stage keeps the subsection but points back instead of repeating.
    expect(blocks[1]).toContain('### discovery-question-form');
    expect(blocks[1]).toContain('already included');
    // Unshared atoms are unaffected.
    expect(blocks[1]).toContain('Commit a numbered plan.');
  });
});

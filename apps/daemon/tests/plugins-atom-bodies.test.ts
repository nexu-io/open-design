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
import { renderActiveStageBlock } from '@open-design/contracts';

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

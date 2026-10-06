import { mkdtemp, readFile, rm, symlink, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import type { SkillInfo } from '../../../src/skills.js';
import {
  InvalidFrozenSkillPackageError,
  captureFrozenSkillPackage,
  createEmptyFrozenSkillPackage,
  getFrozenSkillPackage,
  insertFrozenSkillPackage,
  materializeFrozenSkillPackage,
  migrateFrozenSkillPackageStore,
  normalizeSelectedSkillIds,
  renderFrozenSkillRosterContext,
  resolveFrozenSkillBundleBodies,
} from '../../../src/strategies/od-next/frozen-skill-package.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })));
});

async function fixtureSkill(id = 'frontend-design'): Promise<SkillInfo> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'od-frozen-skill-'));
  temporaryRoots.push(dir);
  await mkdir(path.join(dir, 'references'));
  await writeFile(path.join(dir, 'references', 'guide.md'), 'frozen guide\n');
  await writeFile(path.join(dir, 'SKILL.md'), [
    '---',
    `name: ${id}`,
    'description: test',
    '---',
    '# Frozen workflow',
    '',
    'Read `references/guide.md` before Build.',
  ].join('\n'));
  return {
    id,
    name: id,
    body: 'live registry body is deliberately not trusted',
    dir,
  } as SkillInfo;
}

function packageDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec('CREATE TABLE strategy_task_executions (task_execution_id TEXT PRIMARY KEY);');
  migrateFrozenSkillPackageStore(db);
  db.prepare('INSERT INTO strategy_task_executions (task_execution_id) VALUES (?)').run('task-1');
  return db;
}

describe('OD Next frozen user-selected Skill package', () => {
  it('normalizes legacy and array forms through aliases without reordering', () => {
    expect(normalizeSelectedSkillIds({
      skillId: ' editorial-collage ',
      skillIds: ['open-design-landing', 'frontend-design', 'frontend-design'],
    })).toEqual(['open-design-landing', 'frontend-design']);
  });

  it('persists immutable bytes and materializes them after live source mutation/deletion', async () => {
    const skill = await fixtureSkill();
    const frozen = await captureFrozenSkillPackage({
      skillIds: [skill.id],
      catalog: [skill],
    });
    expect(frozen.selections[0]?.files.map((file) => file.path)).toEqual([
      'references/guide.md',
    ]);
    // The roster carries identity only; bodies are a separate Bundle slot.
    expect(renderFrozenSkillRosterContext(frozen)).not.toContain('# Frozen workflow');
    expect(renderFrozenSkillRosterContext(frozen)).not.toContain(skill.dir);
    expect(resolveFrozenSkillBundleBodies(frozen)?.body).toContain('# Frozen workflow');
    expect(resolveFrozenSkillBundleBodies(frozen)?.body).not.toContain(skill.dir);

    const db = packageDb();
    insertFrozenSkillPackage(db, 'task-1', frozen);
    const replacement = await fixtureSkill('replacement-skill');
    await writeFile(path.join(replacement.dir, 'references', 'guide.md'), 'mutated live guide\n');
    await rm(skill.dir, { recursive: true, force: true });
    await symlink(replacement.dir, skill.dir);

    const restarted = getFrozenSkillPackage(db, 'task-1');
    expect(restarted).toEqual(frozen);
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-frozen-cwd-'));
    temporaryRoots.push(cwd);
    const aliases = await materializeFrozenSkillPackage({ frozen: restarted!, cwd });
    expect(aliases).toHaveLength(1);
    expect(await readFile(path.join(cwd, aliases[0]!, 'references/guide.md'), 'utf8'))
      .toBe('frozen guide\n');
    db.close();
  });

  it('fails closed on persisted tampering, unknown Skills, and side-file symlinks', async () => {
    const skill = await fixtureSkill();
    const frozen = await captureFrozenSkillPackage({ skillId: skill.id, catalog: [skill] });
    const db = packageDb();
    insertFrozenSkillPackage(db, 'task-1', frozen);
    const payload = db.prepare(
      'SELECT payload_json AS payload FROM strategy_task_frozen_skill_packages WHERE task_execution_id = ?',
    ).get('task-1') as { payload: string };
    const tampered = JSON.parse(payload.payload) as {
      selections: Array<{ files: Array<{ bytesBase64: string }> }>;
    };
    tampered.selections[0]!.files[0]!.bytesBase64 = Buffer.from('tampered guide\n').toString('base64');
    db.prepare(
      'UPDATE strategy_task_frozen_skill_packages SET payload_json = ? WHERE task_execution_id = ?',
    ).run(JSON.stringify(tampered), 'task-1');
    expect(() => getFrozenSkillPackage(db, 'task-1')).toThrow(InvalidFrozenSkillPackageError);
    db.close();

    await expect(captureFrozenSkillPackage({ skillId: 'missing', catalog: [skill] }))
      .rejects.toThrow(/unavailable/i);
    await rm(path.join(skill.dir, 'references', 'guide.md'));
    await symlink(path.join(skill.dir, 'SKILL.md'), path.join(skill.dir, 'references', 'guide.md'));
    await expect(captureFrozenSkillPackage({ skillId: skill.id, catalog: [skill] }))
      .rejects.toThrow(/symlinked/i);
  });

  it('requires an explicit row even for an empty selection package', () => {
    const db = packageDb();
    expect(() => getFrozenSkillPackage(db, 'task-1')).toThrow(/missing its frozen Skill package/i);
    const empty = createEmptyFrozenSkillPackage();
    insertFrozenSkillPackage(db, 'task-1', empty);
    expect(getFrozenSkillPackage(db, 'task-1')).toEqual(empty);
    db.close();
  });

  it('rejects a symlinked root and a symlinked intermediate directory', async () => {
    const skill = await fixtureSkill();
    const linkedRoot = `${skill.dir}-linked`;
    temporaryRoots.push(linkedRoot);
    await symlink(skill.dir, linkedRoot);
    await expect(captureFrozenSkillPackage({
      skillId: skill.id,
      catalog: [{ ...skill, dir: linkedRoot }],
    })).rejects.toThrow(/root is not a real directory/i);

    const realReferences = path.join(skill.dir, 'real-references');
    await mkdir(realReferences);
    await writeFile(path.join(realReferences, 'guide.md'), 'linked guide\n');
    await rm(path.join(skill.dir, 'references'), { recursive: true });
    await symlink(realReferences, path.join(skill.dir, 'references'));
    await expect(captureFrozenSkillPackage({ skillId: skill.id, catalog: [skill] }))
      .rejects.toThrow(/symlinked directory/i);
  });

  it('fails closed when a file path is inode-swapped after its no-follow fd opens', async () => {
    const skill = await fixtureSkill();
    let swapped = false;
    await expect(captureFrozenSkillPackage({
      skillId: skill.id,
      catalog: [skill],
      ioHooks: {
        afterOpen: async (filePath) => {
          if (swapped || path.basename(filePath) !== 'guide.md') return;
          swapped = true;
          await rm(filePath);
          await writeFile(filePath, 'replacement inode\n');
        },
      },
    })).rejects.toThrow(/path changed while freezing/i);
  });

  it('leaves a side file above the byte cap out of the package instead of failing', async () => {
    // The cap exists so oversized bytes are never read into memory, and that
    // still holds: the file is skipped before any read, and `readBoundedNoFollow`
    // re-enforces the same limit on whatever it does read. What must NOT follow
    // is deleting the Skill — `example-open-design-landing` links a bundled
    // `assets/hero.png`, and rejecting the capture over one screenshot dropped
    // every word of that card's prose.
    const skill = await fixtureSkill();
    await writeFile(
      path.join(skill.dir, 'references', 'guide.md'),
      Buffer.alloc(256 * 1024 + 1, 0x61),
    );
    const frozen = await captureFrozenSkillPackage({ skillId: skill.id, catalog: [skill] });
    expect(frozen.selections[0]?.files).toEqual([]);
    // The oversized bytes reached neither the package nor its byte budget.
    expect(JSON.stringify(frozen).length).toBeLessThan(256 * 1024);
  });

  it('does not scan unreferenced files into the explicit roster', async () => {
    const skill = await fixtureSkill();
    await writeFile(path.join(skill.dir, 'secret.env'), 'DO_NOT_FREEZE=1');
    const frozen = await captureFrozenSkillPackage({ skillId: skill.id, catalog: [skill] });
    expect(frozen.selections[0]?.files.map((file) => file.path)).toEqual([
      'references/guide.md',
    ]);
    expect(JSON.stringify(frozen)).not.toContain('DO_NOT_FREEZE');
  });

  it('freezes a derived example through its owning manifest without changing its canonical id', async () => {
    const parent = await fixtureSkill('live-artifact');
    const derived = {
      ...parent,
      id: 'live-artifact:portfolio',
      name: 'Portfolio',
    };
    const frozen = await captureFrozenSkillPackage({ skillId: derived.id, catalog: [derived] });
    expect(frozen.selections[0]).toMatchObject({
      canonicalId: 'live-artifact:portfolio',
      name: 'Portfolio',
    });
  });

  it('uses canonical-id and selection digests to avoid sanitized segment collisions', async () => {
    const first = await fixtureSkill('Foo Bar');
    const second = await fixtureSkill('foo-bar');
    await writeFile(path.join(second.dir, 'references', 'guide.md'), 'second guide\n');
    const frozen = await captureFrozenSkillPackage({
      skillIds: [first.id, second.id],
      catalog: [first, second],
    });
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-frozen-collision-'));
    temporaryRoots.push(cwd);
    const roots = await materializeFrozenSkillPackage({ frozen, cwd });
    expect(new Set(roots).size).toBe(2);
    expect(roots[0]).not.toBe(roots[1]);
    expect(await readFile(path.join(cwd, roots[0]!, 'references/guide.md'), 'utf8'))
      .toBe('frozen guide\n');
    expect(await readFile(path.join(cwd, roots[1]!, 'references/guide.md'), 'utf8'))
      .toBe('second guide\n');
  });
});

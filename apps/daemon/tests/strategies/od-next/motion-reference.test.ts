import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile, lstat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppliedStrategyBindingV2 } from '@open-design/contracts';
import { buildStrategyPackageIdentity } from '@open-design/plugin-runtime';
import {
  materializeOdNextMotionReference,
  OD_NEXT_MOTION_REFERENCE_OWNERSHIP,
  OD_NEXT_MOTION_REFERENCE_ROOT,
} from '../../../src/strategies/od-next/motion-reference.js';
import { loadOdNextTaskResourcesForSnapshot, materializeOdNextDeviceFrames, type OdNextTaskResource } from '../../../src/strategies/od-next/device-frames.js';

import { resolvePluginFolder } from '../../../src/plugins/registry.js';
import { createBundledStrategyBindingV2 } from '../../../src/plugins/strategy-package.js';
import { listSkills } from '../../../src/skills.js';
import { skillCwdAliasSegment, stageActiveSkill } from '../../../src/cwd-aliases.js';
import { captureFrozenSkillPackage, materializeFrozenSkillPackage, resolveFrozenSkillBundleBodies } from '../../../src/strategies/od-next/frozen-skill-package.js';

const BUNDLED_PLUGINS = path.resolve(import.meta.dirname, '../../../../../plugins/_official');
const SOURCE = './assets/task-profiles/motion-design/glyph-unfold/';
const SOURCES = [
  { path: `${SOURCE}guide.md`, text: '# Reference\n模板与实际字体\n' },
  { path: `${SOURCE}runtime.html`, text: '<main>Use actual copy: é / 中文</main>\n' },
  { path: `${SOURCE}prepare.ts`, text: 'export const version = 1;\n' },
];
const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function projectDir(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-motion-reference-'));
  temporaryRoots.push(root);
  return root;
}
function binding(resources = SOURCES, taskType: 'motion-design' | 'discovery' | 'prototype' = 'motion-design'): AppliedStrategyBindingV2 {
  const profilePath = `./assets/task-profiles/${taskType}.md`;
  const profile = Buffer.from('# Profile');
  return {
    schema: 'open-design.applied-strategy/v2', id: 'od-next-strategy', version: 'test',
    ...buildStrategyPackageIdentity({ assets: [
      { path: profilePath, bytes: profile },
      ...resources.map((resource) => ({ path: resource.path, bytes: Buffer.from(resource.text, 'utf8') })),
    ] }),
    selectedTaskProfile: { taskType, version: 'test', path: profilePath, sha256: createHash('sha256').update(profile).digest('hex') },
    taskProfileVersions: ['test'], promptRecipe: 'od-next-plan-build-v2',
  };
}
function stage(input: Omit<Parameters<typeof materializeOdNextMotionReference>[0], 'snapshotId'>) {
  return materializeOdNextMotionReference({ ...input, snapshotId: 'snapshot-test' });
}
async function snapshot(cwd: string): Promise<Record<string, string>> {
  const root = path.join(cwd, OD_NEXT_MOTION_REFERENCE_ROOT);
  const entries = await readdir(root);
  return Object.fromEntries(await Promise.all(entries.map(async (name) => [name, (await readFile(path.join(root, name))).toString('base64')])));
}

describe('local glyph reference staging', () => {
  it('publishes complete UTF-8 bytes with one binding and repeats without replacing the directory', async () => {
    const cwd = await projectDir();
    const frozen = binding();
    const first = stage({ cwd, binding: frozen, resources: SOURCES });
    expect(first.skipped).toEqual([]);
    expect(first.usable).toBe(true);
    expect(first.appliedSnapshot).toBe('snapshot-test');
    expect(first.staged).toHaveLength(3);
    const root = path.join(cwd, OD_NEXT_MOTION_REFERENCE_ROOT);
    const before = await lstat(root);
    for (const source of SOURCES) {
      expect(await readFile(path.join(root, path.posix.basename(source.path)))).toEqual(Buffer.from(source.text, 'utf8'));
    }
    const ownership = JSON.parse(await readFile(path.join(root, OD_NEXT_MOTION_REFERENCE_OWNERSHIP), 'utf8'));
    expect(ownership.packageHash).toBe(frozen.packageHash);
    expect(ownership.files['guide.md'].bytes).toBe(Buffer.byteLength(SOURCES[0]!.text, 'utf8'));
    const previous = await snapshot(cwd);
    expect(stage({ cwd, binding: frozen, resources: SOURCES })).toEqual(first);
    expect((await lstat(root)).ino).toBe(before.ino);
    expect(await snapshot(cwd)).toEqual(previous);
  });

  it('reports the current identity unusable while preserving a complete older snapshot on conflict', async () => {
    const cwd = await projectDir();
    const frozen = binding();
    materializeOdNextMotionReference({ cwd, binding: frozen, resources: SOURCES, snapshotId: 'older-snapshot' });
    const before = await snapshot(cwd);
    const result = materializeOdNextMotionReference({ cwd, binding: frozen, resources: SOURCES.slice(0, 2), snapshotId: 'current-snapshot' });
    expect(result.usable).toBe(false);
    expect(result.appliedSnapshot).toBe('current-snapshot');
    expect(result.packageHash).toBe(frozen.packageHash);
    expect(result.staged).toEqual([]);
    expect(await snapshot(cwd)).toEqual(before);
    const record = JSON.parse(await readFile(path.join(cwd, OD_NEXT_MOTION_REFERENCE_ROOT, OD_NEXT_MOTION_REFERENCE_OWNERSHIP), 'utf8'));
    expect(record.appliedSnapshot).toBe('older-snapshot');
    const current = materializeOdNextMotionReference({ cwd, binding: frozen, resources: SOURCES, snapshotId: 'current-snapshot' });
    expect(current.usable).toBe(true);
    expect(JSON.parse(await readFile(path.join(cwd, OD_NEXT_MOTION_REFERENCE_ROOT, OD_NEXT_MOTION_REFERENCE_OWNERSHIP), 'utf8')).appliedSnapshot).toBe('current-snapshot');
  });

  it('replaces a fully owned old bundle as a whole', async () => {
    const cwd = await projectDir();
    stage({ cwd, binding: binding(), resources: SOURCES });
    const next = SOURCES.map((source) => ({ ...source, text: source.text.replace(/\n$/, '') + ' version 2\n' }));
    expect(stage({ cwd, binding: binding(next), resources: next }).skipped).toEqual([]);
    for (const source of next) {
      expect(await readFile(path.join(cwd, OD_NEXT_MOTION_REFERENCE_ROOT, path.posix.basename(source.path)), 'utf8')).toBe(source.text);
    }
    expect(await readdir(path.join(cwd, '.od-motion'))).toEqual(['glyph-unfold']);
  });

  it.each(['missing', 'duplicate', 'extra', 'mixed', 'package', 'unicode', 'absolute', 'traversal'])('does not publish a %s resource set over an old complete bundle', async (kind) => {
    const cwd = await projectDir();
    stage({ cwd, binding: binding(), resources: SOURCES });
    const previous = await snapshot(cwd);
    const next = SOURCES.map((source) => ({ ...source, text: `${source.text}new version\n` }));
    let resources: OdNextTaskResource[] = [...next];
    let frozen = binding(next);
    if (kind === 'missing') resources.pop();
    if (kind === 'duplicate') resources[2] = resources[1]!;
    if (kind === 'extra') resources.push({ path: `${SOURCE}preview.png`, text: 'not a permitted resource' });
    if (kind === 'mixed') resources[1] = SOURCES[1]!;
    if (kind === 'package') frozen = { ...frozen, packageHash: '0'.repeat(64) };
    if (kind === 'unicode') { resources[0] = { ...resources[0]!, text: '\ud800' }; frozen = binding(resources); }
    if (kind === 'absolute') resources[0] = { ...resources[0]!, path: `/outside/${SOURCE.slice(2)}guide.md` };
    if (kind === 'traversal') resources[0] = { ...resources[0]!, path: `${SOURCE}../guide.md` };
    const result = stage({ cwd, binding: frozen, resources });
    expect(result.staged).toEqual([]);
    expect(result.usable).toBe(false);
    expect(result.skipped).toHaveLength(3);
    expect(await snapshot(cwd)).toEqual(previous);
  });

  it.each(['foreign-file', 'edited-code', 'extra-file', 'missing-owned-file', 'foreign-record'])('leaves every existing byte alone for %s', async (kind) => {
    const cwd = await projectDir();
    const root = path.join(cwd, OD_NEXT_MOTION_REFERENCE_ROOT);
    if (kind === 'foreign-file') {
      await mkdir(root, { recursive: true });
      await writeFile(path.join(root, 'guide.md'), 'user guide');
    } else {
      stage({ cwd, binding: binding(), resources: SOURCES });
      if (kind === 'edited-code') await writeFile(path.join(root, 'prepare.ts'), 'user modification');
      if (kind === 'extra-file') await writeFile(path.join(root, 'notes.txt'), 'unrelated user work');
      if (kind === 'missing-owned-file') await rm(path.join(root, 'runtime.html'));
      if (kind === 'foreign-record') await writeFile(path.join(root, OD_NEXT_MOTION_REFERENCE_OWNERSHIP), '{"files":{},"note":"mine"}');
    }
    const previous = await snapshot(cwd);
    const next = SOURCES.map((source) => ({ ...source, text: `${source.text}new version\n` }));
    expect(stage({ cwd, binding: binding(next), resources: next }).staged).toEqual([]);
    expect(await snapshot(cwd)).toEqual(previous);
  });

  it.each(['packageHash', 'appliedSnapshot', 'sha256'])('refuses array-valued ownership identity %s without updating any file', async (field) => {
    const cwd = await projectDir();
    stage({ cwd, binding: binding(), resources: SOURCES });
    const target = path.join(cwd, OD_NEXT_MOTION_REFERENCE_ROOT, OD_NEXT_MOTION_REFERENCE_OWNERSHIP);
    const record = JSON.parse(await readFile(target, 'utf8'));
    if (field === 'sha256') record.files['guide.md'].sha256 = [record.files['guide.md'].sha256];
    else record[field] = [record[field]];
    await writeFile(target, JSON.stringify(record));
    const before = await snapshot(cwd);
    const next = SOURCES.map(source => ({ ...source, text: source.text + 'new bundle\n' }));
    const result = stage({ cwd, binding: binding(next), resources: next });
    expect(result.usable).toBe(false);
    expect(result.staged).toEqual([]);
    expect(await snapshot(cwd)).toEqual(before);
  });

  it.each(['parent', 'directory', 'guide', 'ownership'])('does not traverse a symlinked %s', async (kind) => {
    const cwd = await projectDir();
    const outside = await projectDir();
    const root = path.join(cwd, OD_NEXT_MOTION_REFERENCE_ROOT);
    const sentinel = path.join(outside, 'sentinel');
    await writeFile(sentinel, 'outside user bytes');
    if (kind === 'parent') await symlink(outside, path.join(cwd, '.od-motion'));
    if (kind === 'directory') {
      await mkdir(path.join(cwd, '.od-motion'));
      await symlink(outside, root);
    }
    if (kind === 'guide' || kind === 'ownership') {
      stage({ cwd, binding: binding(), resources: SOURCES });
      const name = kind === 'guide' ? 'guide.md' : OD_NEXT_MOTION_REFERENCE_OWNERSHIP;
      await rm(path.join(root, name));
      await symlink(sentinel, path.join(root, name));
    }
    expect(stage({ cwd, binding: binding(), resources: SOURCES }).staged).toEqual([]);
    expect(await readFile(sentinel, 'utf8')).toBe('outside user bytes');
    expect(await readdir(outside)).toEqual(['sentinel']);
  });

  it('is absent for legacy/wrong profiles and does not alter device-frame staging', async () => {
    const cwd = await projectDir();
    expect(stage({ cwd, binding: binding([]), resources: [] })).toEqual({ usable: false, staged: [], skipped: [] });
    expect(stage({ cwd, binding: binding(SOURCES, 'prototype'), resources: SOURCES })).toEqual({ usable: false, staged: [], skipped: [] });
    expect(stage({ cwd, binding: null, resources: SOURCES })).toEqual({ usable: false, staged: [], skipped: [] });
    await expect(lstat(path.join(cwd, '.od-motion'))).rejects.toThrow();
    const shell = { path: './assets/task-profiles/prototype/device-frames/iphone.html', text: '<div data-phone-shell>phone</div>' };
    const frame = await materializeOdNextDeviceFrames({ cwd, resources: [shell, ...SOURCES] });
    expect(frame).toEqual({ staged: ['.od-frames/iphone.html'], skipped: [] });
    expect(await readFile(path.join(cwd, '.od-frames', 'iphone.html'), 'utf8')).toBe(shell.text);
    const result = stage({ cwd, binding: binding(SOURCES, 'discovery'), resources: [shell, ...SOURCES] });
    expect(result.skipped).toEqual([]);
    expect(await readFile(path.join(cwd, '.od-frames', 'iphone.html'), 'utf8')).toBe(shell.text);
  });
});


describe('actual declared motion resource binding', () => {
  async function plugin(folder = path.join(BUNDLED_PLUGINS, 'scenarios/od-next-strategy')) {
    const resolved = await resolvePluginFolder({ folder, folderId: 'od-next-strategy', sourceKind: 'bundled', source: folder, trust: 'bundled' });
    if (!resolved.ok) throw new Error(resolved.errors.join('; '));
    return resolved.record;
  }

  it('carries real declared UTF-8 files through the loader to a new project with their bound bytes', async () => {
    const record = await plugin();
    const frozen = createBundledStrategyBindingV2({ plugin: record, taskType: 'motion-design' });
    const resources = await loadOdNextTaskResourcesForSnapshot({ bundledPluginsDir: BUNDLED_PLUGINS, snapshot: { pluginId: 'od-next-strategy', strategy: frozen } });
    const cwd = await projectDir();
    const result = stage({ cwd, binding: frozen, resources });
    expect(result.usable).toBe(true);
    expect(result.staged).toHaveLength(3);
    for (const relative of result.staged) {
      const sourcePath = SOURCE + path.posix.basename(relative);
      const sourceBytes = await readFile(path.join(record.fsPath, sourcePath.slice(2)));
      const stagedBytes = await readFile(path.join(cwd, relative));
      expect(stagedBytes).toEqual(sourceBytes);
      expect(new TextDecoder('utf-8', { fatal: true }).decode(stagedBytes)).toBe(resources.find(resource => resource.path === sourcePath)?.text);
      expect(createHash('sha256').update(stagedBytes).digest('hex')).toBe(frozen.assetDigests.find(asset => asset.path === sourcePath)?.sha256);
    }
  });

  it('rejects actual resource drift and a freshly bound file that is not UTF-8', async () => {
    const cwd = await projectDir();
    const folder = path.join(cwd, 'scenarios/od-next-strategy');
    await cp(path.join(BUNDLED_PLUGINS, 'scenarios/od-next-strategy'), folder, { recursive: true });
    const record = await plugin(folder);
    const frozen = createBundledStrategyBindingV2({ plugin: record, taskType: 'motion-design' });
    await writeFile(path.join(folder, SOURCE.slice(2), 'runtime.html'), Buffer.from([0xff]));
    const load = (strategy: AppliedStrategyBindingV2) => loadOdNextTaskResourcesForSnapshot({ bundledPluginsDir: cwd, snapshot: { pluginId: 'od-next-strategy', strategy } });
    await expect(load(frozen)).rejects.toThrow('snapshot identity');
    const changed = createBundledStrategyBindingV2({ plugin: record, taskType: 'motion-design' });
    await expect(load(changed)).rejects.toThrow('not valid UTF-8');
  });

  it('makes all real module side files reachable through legacy skill staging and frozen selections', async () => {
    const repo = path.resolve(BUNDLED_PLUGINS, '../..');
    const catalog = await listSkills([path.join(repo, 'skills')]);
    const skill = catalog.find(entry => entry.id === 'motion-design')!;
    expect(skill).toBeDefined();
    const cwd = await projectDir();
    const alias = skillCwdAliasSegment(skill.dir);
    expect((await stageActiveSkill(cwd, alias, skill.dir)).staged).toBe(true);
    for (const name of ['guide.md', 'runtime.html', 'prepare.ts']) {
      const relative = 'references/glyph-unfold/' + name;
      expect(await readFile(path.join(cwd, '.od-skills', alias, relative))).toEqual(await readFile(path.join(skill.dir, relative)));
    }
    const frozen = await captureFrozenSkillPackage({ skillId: 'motion-design', catalog });
    expect(frozen.selections[0]!.files.map(file => file.path)).toEqual(expect.arrayContaining([
      'references/glyph-unfold/guide.md', 'references/glyph-unfold/runtime.html', 'references/glyph-unfold/prepare.ts',
    ]));
    const isolated = await projectDir();
    const staged = await materializeFrozenSkillPackage({ cwd: isolated, frozen });
    expect(staged).toHaveLength(1);
    for (const name of ['guide.md', 'runtime.html', 'prepare.ts']) {
      const relative = 'references/glyph-unfold/' + name;
      expect(await readFile(path.join(isolated, staged[0]!, relative))).toEqual(await readFile(path.join(skill.dir, relative)));
    }
    const body = resolveFrozenSkillBundleBodies(frozen)!.body;
    expect(body).toContain('Frozen side-file root: ' + staged[0]);
    expect(body).not.toContain('function edt(');
  });
});

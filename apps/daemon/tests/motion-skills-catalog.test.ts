import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { listSkills, type SkillInfo } from '../src/skills.js';
import { captureOdNextSessionSkillPackage } from '../src/strategies/od-next/session-skill-package.js';
import { resolveFrozenSkillBundleBodies } from '../src/strategies/od-next/frozen-skill-package.js';

const root = path.resolve(import.meta.dirname, '../../..');
const skillsRoot = path.join(root, 'skills');
const ids = [
  'animate', 'ui-animation', 'gsap-core', 'gsap-timeline', 'gsap-scrolltrigger',
  'gsap-react', 'gsap-frameworks', 'gsap-plugins', 'gsap-performance', 'gsap-utils',
];
let catalog: SkillInfo[];

beforeAll(async () => {
  catalog = await listSkills([path.join(root, '.tmp/nonexistent-user-skills'), skillsRoot]);
});

describe('bundled motion helpers selected through the skill catalogue', () => {
  it.each(ids)('%s is a searchable functional helper with a pinned source and license', async (id) => {
    const entries = catalog.filter((skill) => skill.id === id);
    expect(entries).toHaveLength(1);
    const skill = entries[0]!;
    expect(skill.source).toBe('built-in');
    expect(skill.mode).toBe('utility');
    expect(skill.category).toBe('animation-motion');
    expect(skill.aggregatesExamples).toBe(false);
    expect(skill.displayName?.['zh-CN']).toBeTruthy();
    expect(skill.descriptionI18n?.['zh-CN']).toBeTruthy();
    expect(skill.triggers).toEqual(expect.arrayContaining(['动效', '动画', 'motion']));
    const manifest = await readFile(path.join(skillsRoot, id, 'SKILL.md'), 'utf8');
    expect(manifest).toMatch(/source-commit: [a-f0-9]{40}/);
    expect(await readFile(path.join(skillsRoot, id, 'LICENSE'), 'utf8')).toContain('MIT License');
    expect(await readFile(path.join(skillsRoot, id, 'SOURCES.md'), 'utf8')).toContain('Open Design changes');
  });

  it.each(ids)('%s reaches the actual OD Next session package without missing runtime files', async (id) => {
    const frozen = await captureOdNextSessionSkillPackage({
      metadata: { kind: 'prototype' },
      getLocalPluginBySource: undefined,
      selection: { skillIds: [id] },
      listSkillCatalog: async () => catalog,
    });
    expect(frozen.selections.map((s) => s.canonicalId)).toEqual([id]);
    const selection = frozen.selections[0]!;
    expect(resolveFrozenSkillBundleBodies(frozen)?.skillNames).toEqual([id]);
    const expectedFiles: string[] = [];
    for (const directory of ['references', 'scripts']) {
      const files = await readdir(path.join(skillsRoot, id, directory)).catch(() => []);
      expectedFiles.push(...files.map((file) => `${directory}/${file}`));
    }
    // Compare to the shipped files, not the scanner's own regex: a root-level
    // recipe or a script mentioned only by a reference must not silently vanish.
    expect(selection.files.map((f) => f.path).sort()).toEqual(expectedFiles.sort());
    for (const file of selection.files) {
      expect(Buffer.from(file.bytesBase64, 'base64')).toEqual(
        await readFile(path.join(skillsRoot, id, file.path)),
      );
    }
  });

  it('can combine UI craft, recorded-motion analysis and GSAP without dropping a selection', async () => {
    const selected = ['animate', 'ui-animation', 'gsap-core', 'gsap-react'];
    const frozen = await captureOdNextSessionSkillPackage({
      metadata: { kind: 'prototype' },
      getLocalPluginBySource: undefined,
      selection: { skillIds: selected },
      listSkillCatalog: async () => catalog,
    });
    expect(frozen.selections.map((s) => s.canonicalId)).toEqual(selected);
    expect(frozen.selections.find((s) => s.canonicalId === 'animate')?.files)
      .toEqual(expect.arrayContaining([expect.objectContaining({ path: 'references/RECIPES.md' })]));
    expect(frozen.selections.find((s) => s.canonicalId === 'ui-animation')?.files).toHaveLength(21);
  });
});

import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';

import { listSkills, type SkillInfo } from '../src/skills.js';
import { captureOdNextSessionSkillPackage } from '../src/strategies/od-next/session-skill-package.js';
import { materializeFrozenSkillPackage, resolveFrozenSkillBundleBodies } from '../src/strategies/od-next/frozen-skill-package.js';

const root = path.resolve(import.meta.dirname, '../../..');
const skillsRoot = path.join(root, 'skills');
const ids = [
  'animate', 'ui-animation', 'gsap-core', 'gsap-timeline', 'gsap-scrolltrigger',
  'gsap-react', 'gsap-frameworks', 'gsap-plugins', 'gsap-performance', 'gsap-utils',
  'huashu-art-motion', 'oil-motion', 'motion-lab',
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
    for (const directory of ['references', 'scripts', 'assets']) {
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

  it('materializes all three creative adapters together within the existing package limits', async () => {
    const selected = ['huashu-art-motion', 'oil-motion', 'motion-lab'];
    const frozen = await captureOdNextSessionSkillPackage({
      metadata: { kind: 'prototype' },
      getLocalPluginBySource: undefined,
      selection: { skillIds: selected },
      listSkillCatalog: async () => catalog,
    });
    expect(frozen.selections.map((s) => s.canonicalId)).toEqual(selected);
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'motion-adapters-'));
    try {
      const roots = await materializeFrozenSkillPackage({ frozen, cwd });
      for (const [index, relativeRoot] of roots.entries()) {
        for (const file of frozen.selections[index]!.files) {
          expect(await readFile(path.join(cwd, relativeRoot, file.path)))
            .toEqual(Buffer.from(file.bytesBase64, 'base64'));
        }
      }
      const oilRoot = path.join(cwd, roots[1]!);
      expect(await readFile(path.join(oilRoot, 'scripts/create_explainer.py'), 'utf8'))
        .toContain('motion-explainer-template.html');
      expect(await readFile(path.join(oilRoot, 'assets/motion-explainer-template.html'), 'utf8'))
        .toContain('__MOTION_EXPLAINER_CONFIG__');
      expect(await readdir(path.join(oilRoot, 'scripts'))).not.toContain('video_job.py');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('ships 160 unique Motion.Lab records and all 35 art / nine grammar cards', async () => {
    const categories = await Promise.all(['basic', 'text', 'interaction', 'advanced'].map((name) =>
      readFile(path.join(skillsRoot, 'motion-lab/references', `${name}.md`), 'utf8')));
    const effectIds = categories.flatMap((body) => [...body.matchAll(/^## ([A-Za-z0-9-]+) —/gm)].map((m) => m[1]));
    expect(effectIds).toHaveLength(160);
    expect(new Set(effectIds).size).toBe(160);
    for (const body of categories) {
      const count = [...body.matchAll(/^## /gm)].length;
      expect([...body.matchAll(/^```html$/gm)]).toHaveLength(count);
      expect([...body.matchAll(/^```css$/gm)]).toHaveLength(count);
      expect([...body.matchAll(/^```javascript$/gm)]).toHaveLength(count);
    }
    const styles = await Promise.all([1, 2].map((n) =>
      readFile(path.join(skillsRoot, `huashu-art-motion/references/art-styles-${n}.md`), 'utf8')));
    expect([...styles.join('\n').matchAll(/<a id="\d+_[^"]+"><\/a>/g)]).toHaveLength(35);
    const grammar = await readFile(path.join(skillsRoot, 'huashu-art-motion/references/explainer-grammars.md'), 'utf8');
    expect([...grammar.matchAll(/<a id="[ty]\d_[^"]+"><\/a>/g)]).toHaveLength(9);
  });

  it('loads pure geometry and timing helpers and preserves deterministic motion', async () => {
    const body = await readFile(path.join(skillsRoot, 'huashu-art-motion/references/canvas-helpers.md'), 'utf8');
    const code = [...body.matchAll(/```javascript\n([\s\S]*?)\n```/g)].map((m) => m[1]!);
    expect(code).toHaveLength(8);
    const context = vm.createContext({});
    vm.runInContext('window = globalThis', context);
    // Canvas paint modules require browser Path2D; exercise numerical modules here.
    for (const index of [0, 2, 6, 7]) vm.runInContext(code[index]!, context, { timeout: 1000 });
    expect(vm.runInContext('U.rng(42)() === U.rng(42)()', context)).toBe(true);
    expect(vm.runInContext('KIT.densify([[0,0],[10,10]], 4).length', context)).toBe(5);
    expect(vm.runInContext('MO.anim(1, 0, 1)', context)).toBe(1);
    expect(vm.runInContext(`U.setStage(640,360); JSON.stringify(CAM.toWorld({x:100,y:100,z:2}, ...CAM.toScreen({x:100,y:100,z:2}, 150, 200)))`, context))
      .toBe('[150,200]');
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

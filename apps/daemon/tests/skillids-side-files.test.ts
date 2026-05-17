import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { findSkillById, listSkills, withSkillRootPreamble, type SkillInfo } from '../src/skills.js';
import {
  collectAdHocSkillDirs,
  resolveAdHocSkillMode,
  resolveAdHocSkillsWithAliases,
  resolveChatExtraAllowedDirs,
} from '../src/server.js';

// Regression coverage for ad-hoc (@-mention) skills with side files.
// PR #1636 restores skillIds processing and adds side-file staging.
// These tests verify the full chain:
//   skillIds → collectAdHocSkillDirs → resolved { id, dir } pairs → stage/allowlist

let skillsRoot: string;

function writeSkillWithSideFiles(
  root: string,
  folder: string,
  body: string,
  mode = 'prototype',
): string {
  const dir = path.join(root, folder);
  mkdirSync(path.join(dir, 'assets'), { recursive: true });
  mkdirSync(path.join(dir, 'references'), { recursive: true });
  writeFileSync(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${folder}\ndescription: test skill\nmode: ${mode}\n---\n\n${body}`,
    'utf8',
  );
  writeFileSync(
    path.join(dir, 'assets', 'template.html'),
    '<html>template</html>',
    'utf8',
  );
  writeFileSync(
    path.join(dir, 'references', 'guide.md'),
    '# guide',
    'utf8',
  );
  return dir;
}

beforeAll(async () => {
  skillsRoot = mkdtempSync(path.join(tmpdir(), 'od-skillids-sidefiles-'));
  writeSkillWithSideFiles(skillsRoot, 'faq-page', '## FAQ Page workflow');
  writeSkillWithSideFiles(skillsRoot, 'web-search', '## Web Search workflow');
  writeSkillWithSideFiles(skillsRoot, 'image-gen', '## Image Gen workflow', 'image');
});

afterAll(() => {
  if (skillsRoot) rmSync(skillsRoot, { recursive: true, force: true });
});

describe('collectAdHocSkillDirs', () => {
  it('resolves skillIds to { id, dir } pairs', async () => {
    const allSkills = await listSkills(skillsRoot);
    const result = collectAdHocSkillDirs(
      ['faq-page', 'web-search'],
      null,
      allSkills,
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'faq-page',
      dir: path.join(skillsRoot, 'faq-page'),
    });
    expect(result[1]).toEqual({
      id: 'web-search',
      dir: path.join(skillsRoot, 'web-search'),
    });
  });

  it('filters out the effectiveSkillId so project-level skill is not duplicated', async () => {
    const allSkills = await listSkills(skillsRoot);
    const result = collectAdHocSkillDirs(
      ['faq-page', 'web-search'],
      'faq-page', // project already has faq-page
      allSkills,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('web-search');
  });

  it('deduplicates repeated skill ids', async () => {
    const allSkills = await listSkills(skillsRoot);
    const result = collectAdHocSkillDirs(
      ['faq-page', 'faq-page'],
      null,
      allSkills,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('faq-page');
  });

  it('excludes skillIds whose resolved dir matches the active skill dir', async () => {
    // Even if skillIds contains a different id (e.g. an alias) that
    // resolves to the same on-disk directory as effectiveSkillId, it
    // must be excluded because seenDir is seeded with the active skill's dir.
    const allSkills = await listSkills(skillsRoot);
    const result = collectAdHocSkillDirs(
      ['faq-page', 'web-search'],
      'faq-page', // active skill
      allSkills,
    );
    // faq-page is excluded by id match; web-search is kept
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('web-search');
    // Verify none of the results share a dir with the active skill
    const activeSkill = findSkillById(allSkills, 'faq-page');
    for (const r of result) {
      expect(r.dir).not.toBe(activeSkill!.dir);
    }
  });

  it('excludes alias id that resolves to the same dir as active skill', () => {
    // Construct a scenario where 'faq-page-v2' is an alias pointing to
    // the same on-disk directory as canonical 'faq-page'.
    const faqDir = path.join(skillsRoot, 'faq-page');
    const mockSkills: SkillInfo[] = [
      {
        id: 'faq-page',
        name: 'FAQ Page',
        description: '',
        triggers: [],
        mode: 'prototype',
        surface: 'web',
        source: 'built-in',
        craftRequires: [],
        platform: null,
        scenario: '',
        category: null,
        previewType: '',
        designSystemRequired: false,
        defaultFor: [],
        upstream: null,
        featured: null,
        fidelity: null,
        speakerNotes: null,
        animations: null,
        examplePrompt: '',
        aggregatesExamples: false,
        critiquePolicy: null,
        body: '## FAQ',
        rawBody: '## FAQ',
        dir: faqDir,
      },
      {
        id: 'faq-page-v2',
        name: 'FAQ Page V2',
        description: '',
        triggers: [],
        mode: 'prototype',
        surface: 'web',
        source: 'built-in',
        craftRequires: [],
        platform: null,
        scenario: '',
        category: null,
        previewType: '',
        designSystemRequired: false,
        defaultFor: [],
        upstream: null,
        featured: null,
        fidelity: null,
        speakerNotes: null,
        animations: null,
        examplePrompt: '',
        aggregatesExamples: false,
        critiquePolicy: null,
        body: '## FAQ V2',
        rawBody: '## FAQ V2',
        dir: faqDir, // same dir as canonical
      },
    ];

    // Active skill is canonical 'faq-page'; skillIds has alias 'faq-page-v2'
    const result = collectAdHocSkillDirs(
      ['faq-page-v2'],
      'faq-page',
      mockSkills,
    );
    // The alias resolves to the same dir → excluded by seenDir seed
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty/invalid input', async () => {
    const allSkills = await listSkills(skillsRoot);
    expect(collectAdHocSkillDirs([], null, allSkills)).toEqual([]);
    expect(collectAdHocSkillDirs(null, null, allSkills)).toEqual([]);
    expect(collectAdHocSkillDirs(undefined, null, allSkills)).toEqual([]);
  });

  it('skips unknown skill ids', async () => {
    const allSkills = await listSkills(skillsRoot);
    const result = collectAdHocSkillDirs(
      ['faq-page', 'nonexistent-skill'],
      null,
      allSkills,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('faq-page');
  });
});

// Regression: when no project skill is active, a single ad-hoc @-mention
// skill's mode must be propagated to skillMode so that composeDaemonSystemPrompt
// passes it to composeSystemPrompt (deck framework injection, isMediaSurface, etc.).
describe('resolveAdHocSkillMode', () => {
  it('returns mode for a single ad-hoc skill with no project skill', async () => {
    const allSkills = await listSkills(skillsRoot);
    const resolved = collectAdHocSkillDirs(['image-gen'], null, allSkills);
    expect(resolved).toHaveLength(1);

    const mode = resolveAdHocSkillMode(resolved, allSkills);
    expect(mode).toBe('image');
  });

  it('returns undefined for multiple ad-hoc skills', async () => {
    const allSkills = await listSkills(skillsRoot);
    const resolved = collectAdHocSkillDirs(
      ['faq-page', 'image-gen'],
      null,
      allSkills,
    );
    expect(resolved).toHaveLength(2);

    const mode = resolveAdHocSkillMode(resolved, allSkills);
    expect(mode).toBeUndefined();
  });

  it('returns undefined for empty resolved list', async () => {
    const allSkills = await listSkills(skillsRoot);
    const mode = resolveAdHocSkillMode([], allSkills);
    expect(mode).toBeUndefined();
  });
});

// Regression: ad-hoc skill side files must reach Codex runs (whose
// `resolveChatExtraAllowedDirs` branch drops `linkedDirs` entirely)
// and projectless runs (where the cwd-relative stage step is skipped),
// or `@`-mentioning a skill on Codex / without a project would render
// its assets/references/example.html unreadable. PR follow-up.
describe('resolveChatExtraAllowedDirs ad-hoc skill bypass', () => {
  it('includes ad-hoc skill dirs in the Codex allow-list even though linkedDirs is dropped', () => {
    const dirs = resolveChatExtraAllowedDirs({
      agentId: 'codex',
      skillsDir: skillsRoot,
      designSystemsDir: skillsRoot,
      linkedDirs: [skillsRoot],
      adHocSkillDirs: [path.join(skillsRoot, 'image-gen')],
      codexGeneratedImagesDir: null,
      existsSync: () => true,
    });
    // Codex branch drops skillsDir / designSystemsDir / linkedDirs.
    expect(dirs).not.toContain(skillsRoot);
    // ...but ad-hoc skill dirs survive because the user explicitly @-mentioned them.
    expect(dirs).toContain(path.join(skillsRoot, 'image-gen'));
  });

  it('still includes ad-hoc skill dirs on non-Codex agents alongside skillsDir / linkedDirs', () => {
    const adHoc = path.join(skillsRoot, 'image-gen');
    const dirs = resolveChatExtraAllowedDirs({
      agentId: 'claude',
      skillsDir: skillsRoot,
      designSystemsDir: null,
      linkedDirs: [],
      adHocSkillDirs: [adHoc],
      codexGeneratedImagesDir: null,
      existsSync: () => true,
    });
    expect(dirs).toContain(skillsRoot);
    expect(dirs).toContain(adHoc);
  });

  it('dedupes ad-hoc skill dirs that also appear in linkedDirs', () => {
    const adHoc = path.join(skillsRoot, 'image-gen');
    const dirs = resolveChatExtraAllowedDirs({
      agentId: 'claude',
      skillsDir: null,
      designSystemsDir: null,
      linkedDirs: [adHoc],
      adHocSkillDirs: [adHoc],
      codexGeneratedImagesDir: null,
      existsSync: () => true,
    });
    expect(dirs.filter((d) => d === adHoc)).toHaveLength(1);
  });
});

// Alias allocation: when two ad-hoc skills resolve to dirs with the same
// basename (e.g. bundled skills/foo and user .od/skills/foo),
// `resolveAdHocSkillsWithAliases` must assign collision-safe aliases so
// each skill gets its own `.od-skills/<alias>/` slot and the regenerated
// preamble points the agent at the correct copy.
describe('resolveAdHocSkillsWithAliases', () => {
  it('assigns a deterministic hash suffix to every ad-hoc skill', () => {
    const resolved = [
      { id: 'faq-page', dir: '/skills/faq-page' },
      { id: 'web-search', dir: '/skills/web-search' },
    ];
    const result = resolveAdHocSkillsWithAliases(resolved);
    expect(result).toHaveLength(2);
    // md5('/skills/faq-page').slice(0,7) === '328f4be'
    expect(result[0]!.alias).toBe('faq-page-328f4be');
    // md5('/skills/web-search').slice(0,7) === 'c97ffac'
    expect(result[1]!.alias).toBe('web-search-c97ffac');
  });

  it('gives different hash suffixes for skills that share a basename', () => {
    const resolved = [
      { id: 'image-gen', dir: '/built-in/image-gen' },
      { id: 'image-gen', dir: '/user/image-gen' },
    ];
    const result = resolveAdHocSkillsWithAliases(resolved);
    expect(result).toHaveLength(2);
    // md5('/built-in/image-gen').slice(0,7) === 'f1316f2'
    expect(result[0]!.alias).toBe('image-gen-f1316f2');
    // md5('/user/image-gen').slice(0,7) === '7f22aee'
    expect(result[1]!.alias).toBe('image-gen-7f22aee');
  });

  it('gives unique hash suffixes for three skills that share a basename', () => {
    const resolved = [
      { id: 'a', dir: '/r1/foo' },
      { id: 'b', dir: '/r2/foo' },
      { id: 'c', dir: '/r3/foo' },
    ];
    const result = resolveAdHocSkillsWithAliases(resolved);
    expect(result.map((r) => r.alias)).toEqual([
      'foo-7c0509e',
      'foo-149ac81',
      'foo-0af723d',
    ]);
  });

  it('is deterministic regardless of input order', () => {
    const resolvedA = [
      { id: 'a', dir: '/r1/foo' },
      { id: 'b', dir: '/r2/foo' },
    ];
    const resolvedB = [
      { id: 'b', dir: '/r2/foo' },
      { id: 'a', dir: '/r1/foo' },
    ];
    const resultA = resolveAdHocSkillsWithAliases(resolvedA);
    const resultB = resolveAdHocSkillsWithAliases(resolvedB);
    // Each dir must map to the same alias no matter the input order
    const getAlias = (dir: string, result: typeof resultA) =>
      result.find((r) => r.dir === dir)!.alias;
    expect(getAlias('/r1/foo', resultA)).toBe(getAlias('/r1/foo', resultB));
    expect(getAlias('/r2/foo', resultA)).toBe(getAlias('/r2/foo', resultB));
  });

  it('ignores active skill dir (all ad-hoc skills always get a hash suffix)', () => {
    const resolved = [{ id: 'my-skill', dir: '/user/my-skill' }];
    const result = resolveAdHocSkillsWithAliases(resolved);
    // md5('/user/my-skill').slice(0,7) === '7a849c9'
    expect(result[0]!.alias).toBe('my-skill-7a849c9');
  });

  it('gives hash suffix even when there is no active skill collision', () => {
    const resolved = [{ id: 'other', dir: '/skills/other' }];
    const result = resolveAdHocSkillsWithAliases(resolved);
    // md5('/skills/other').slice(0,7) === '37bc38e'
    expect(result[0]!.alias).toBe('other-37bc38e');
  });
});

// Regression: two distinct skill dirs that share a basename must both
// survive resolution so the alias allocator has something to work with.
describe('collectAdHocSkillDirs basename collisions', () => {
  it('keeps two distinct skill dirs that share a basename', async () => {
    const altRoot = mkdtempSync(path.join(tmpdir(), 'od-skillids-collide-'));
    try {
      writeSkillWithSideFiles(altRoot, 'image-gen', '## Alt Image Gen');
      const allSkills: SkillInfo[] = [
        ...(await listSkills(skillsRoot)),
        ...(await listSkills(altRoot)),
      ];
      const imageGenDirs = allSkills.filter((s) => s.id === 'image-gen').map((s) => s.dir);
      expect(new Set(imageGenDirs).size).toBeGreaterThanOrEqual(2);
      for (const dir of imageGenDirs) {
        expect(path.basename(dir)).toBe('image-gen');
      }
    } finally {
      rmSync(altRoot, { recursive: true, force: true });
    }
  });
});

describe('withSkillRootPreamble alias propagation', () => {
  it('embeds the provided alias into the relative path guidance', () => {
    const body = '## Test workflow\nOpen `assets/template.html`.';
    const dir = '/skills/my-skill';
    const result = withSkillRootPreamble(body, dir, 'my-skill-2');
    expect(result).toContain('.od-skills/my-skill-2/');
    expect(result).not.toContain('.od-skills/my-skill/');
  });

  it('falls back to basename when no alias is provided', () => {
    const body = '## Test workflow';
    const dir = '/skills/my-skill';
    const result = withSkillRootPreamble(body, dir);
    expect(result).toContain('.od-skills/my-skill/');
  });
});

describe('ad-hoc skill side files on disk', () => {
  it('each resolved dir contains the expected side files', async () => {
    const allSkills = await listSkills(skillsRoot);
    const result = collectAdHocSkillDirs(['faq-page'], null, allSkills);
    expect(result).toHaveLength(1);
    const { existsSync } = await import('node:fs');
    const dir = result[0]!.dir;
    expect(existsSync(path.join(dir, 'assets', 'template.html'))).toBe(true);
    expect(existsSync(path.join(dir, 'references', 'guide.md'))).toBe(true);
  });
});

describe('resolveChatExtraAllowedDirs with ad-hoc skill dirs', () => {
  it('includes ad-hoc skill dirs for non-Codex agents', async () => {
    const allSkills = await listSkills(skillsRoot);
    const resolved = collectAdHocSkillDirs(
      ['faq-page', 'web-search'],
      null,
      allSkills,
    );
    const dirs = resolved.map((r) => r.dir);

    const extraAllowed = resolveChatExtraAllowedDirs({
      agentId: 'claude',
      skillsDir: skillsRoot,
      designSystemsDir: null,
      linkedDirs: dirs,
      codexGeneratedImagesDir: null,
      existsSync: () => true,
    });

    expect(extraAllowed).toContain(path.join(skillsRoot, 'faq-page'));
    expect(extraAllowed).toContain(path.join(skillsRoot, 'web-search'));
  });

  it('deduplicates dirs in allowlist', async () => {
    const allSkills = await listSkills(skillsRoot);
    const resolved = collectAdHocSkillDirs(['faq-page'], null, allSkills);
    const dirs = resolved.map((r) => r.dir);

    // Pass the same dir twice — should appear once in the result
    const extraAllowed = resolveChatExtraAllowedDirs({
      agentId: 'claude',
      skillsDir: skillsRoot,
      designSystemsDir: null,
      linkedDirs: [...dirs, ...dirs],
      codexGeneratedImagesDir: null,
      existsSync: () => true,
    });

    const count = extraAllowed.filter(
      (d) => d === path.join(skillsRoot, 'faq-page'),
    ).length;
    expect(count).toBe(1);
  });

  it('does not include ad-hoc dirs for Codex agents', async () => {
    const allSkills = await listSkills(skillsRoot);
    const resolved = collectAdHocSkillDirs(['faq-page'], null, allSkills);
    const dirs = resolved.map((r) => r.dir);

    const extraAllowed = resolveChatExtraAllowedDirs({
      agentId: 'codex',
      skillsDir: skillsRoot,
      designSystemsDir: null,
      linkedDirs: dirs,
      codexGeneratedImagesDir: '/tmp/codex-images',
      existsSync: () => true,
    });

    expect(extraAllowed).not.toContain(path.join(skillsRoot, 'faq-page'));
    expect(extraAllowed).toContain('/tmp/codex-images');
  });
});

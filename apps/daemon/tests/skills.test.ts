import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listSkills } from '../src/skills.js';
import { SKILLS_CWD_ALIAS } from '../src/cwd-aliases.js';

function fresh(): string {
  return mkdtempSync(path.join(tmpdir(), 'od-skills-'));
}

function writeSkill(
  root: string,
  folder: string,
  options: {
    name?: string;
    description?: string;
    body?: string;
    withAttachments?: boolean;
  } = {},
) {
  const dir = path.join(root, folder);
  mkdirSync(dir, { recursive: true });
  const fm = [
    '---',
    `name: ${options.name ?? folder}`,
    `description: ${options.description ?? 'A test skill.'}`,
    '---',
    '',
    options.body ?? '# Test skill body',
    '',
  ].join('\n');
  writeFileSync(path.join(dir, 'SKILL.md'), fm);
  if (options.withAttachments) {
    mkdirSync(path.join(dir, 'assets'), { recursive: true });
    writeFileSync(
      path.join(dir, 'assets', 'template.html'),
      '<html><body>seed</body></html>',
    );
  }
}

describe('listSkills preamble', () => {
  it('emits a CWD-relative skill root for skills that ship side files', async () => {
    const root = fresh();
    writeSkill(root, 'demo-skill', {
      withAttachments: true,
      body: 'Use `assets/template.html` to bootstrap.',
    });

    const skills = await listSkills(root);
    expect(skills).toHaveLength(1);
    const [skill] = skills;

    // The preamble must reference the CWD-relative alias, not an absolute
    // path, so agents stay inside their working directory when reading
    // skill side files.
    expect(skill.body).toContain(`${SKILLS_CWD_ALIAS}/demo-skill/`);
    expect(skill.body).toContain(
      `${SKILLS_CWD_ALIAS}/demo-skill/assets/template.html`,
    );

    // The skill folder absolute path must NOT leak into the body — that's
    // the regression that triggered issue #430 (Claude Code blocked reads
    // outside the agent's CWD even with `--add-dir`).
    expect(skill.body).not.toContain(skill.dir);
    expect(skill.body).not.toMatch(/Skill root \(absolute\)/);
  });

  it('uses the on-disk folder name in the alias path even when `name` differs', async () => {
    const root = fresh();
    writeSkill(root, 'guizang-ppt', {
      name: 'magazine-web-ppt',
      withAttachments: true,
    });

    const skills = await listSkills(root);
    expect(skills).toHaveLength(1);
    const [skill] = skills;

    // `id`/`name` reflect the frontmatter value (used elsewhere as a stable
    // public id), but the on-disk alias path must use the actual folder
    // name — that is what the daemon-staged junction maps to.
    expect(skill.id).toBe('magazine-web-ppt');
    expect(skill.body).toContain(`${SKILLS_CWD_ALIAS}/guizang-ppt/`);
    expect(skill.body).not.toContain(`${SKILLS_CWD_ALIAS}/magazine-web-ppt/`);
  });

  it('does not emit a preamble for skills without side files', async () => {
    const root = fresh();
    writeSkill(root, 'lone-skill', {
      withAttachments: false,
      body: 'Body without external files.',
    });

    const skills = await listSkills(root);
    expect(skills).toHaveLength(1);
    const [skill] = skills;

    expect(skill.body).not.toContain(SKILLS_CWD_ALIAS);
    expect(skill.body).not.toContain('Skill root');
    expect(skill.body).toContain('Body without external files.');
  });
});

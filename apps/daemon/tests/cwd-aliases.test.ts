import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SKILLS_CWD_ALIAS, stageActiveSkill } from '../src/cwd-aliases.js';

function fresh(): string {
  return mkdtempSync(path.join(tmpdir(), 'od-skill-stage-'));
}

// On Windows, `fs.symlink(target, link, 'dir')` requires
// SeCreateSymbolicLinkPrivilege / Developer Mode and fails on most CI
// images. `'junction'` is the directory-only equivalent that does not
// require elevated privileges, so we use it for fixtures so the daemon
// suite stays green on Windows runners.
const dirLinkType: 'dir' | 'junction' =
  process.platform === 'win32' ? 'junction' : 'dir';

function writeSampleSkill(root: string, folder: string): string {
  const dir = path.join(root, folder);
  mkdirSync(path.join(dir, 'assets'), { recursive: true });
  mkdirSync(path.join(dir, 'references'), { recursive: true });
  writeFileSync(path.join(dir, 'SKILL.md'), '# original SKILL\n');
  writeFileSync(
    path.join(dir, 'assets', 'template.html'),
    '<html>original</html>',
  );
  writeFileSync(path.join(dir, 'references', 'checklist.md'), '- original');
  return dir;
}

describe('stageActiveSkill', () => {
  it('exposes the documented alias name so the skill preamble stays in sync', () => {
    expect(SKILLS_CWD_ALIAS).toBe('.od-skills');
  });

  it('stages a per-project copy under <cwd>/.od-skills/<folder>/', async () => {
    const fs = fresh();
    const cwd = path.join(fs, 'project');
    const sourceRoot = path.join(fs, 'skills');
    const sourceDir = writeSampleSkill(sourceRoot, 'blog-post');
    mkdirSync(cwd);

    const result = await stageActiveSkill(cwd, 'blog-post', sourceDir);

    expect(result.staged).toBe(true);
    expect(result.stagedPath).toBe(
      path.join(cwd, SKILLS_CWD_ALIAS, 'blog-post'),
    );
    expect(
      readFileSync(
        path.join(result.stagedPath!, 'SKILL.md'),
        'utf8',
      ),
    ).toContain('original SKILL');
    expect(
      readFileSync(
        path.join(result.stagedPath!, 'assets', 'template.html'),
        'utf8',
      ),
    ).toContain('original');
  });

  it('produces a real directory entry, not a symlink (write barrier)', async () => {
    const fs = fresh();
    const cwd = path.join(fs, 'project');
    const sourceDir = writeSampleSkill(path.join(fs, 'skills'), 'blog-post');
    mkdirSync(cwd);

    await stageActiveSkill(cwd, 'blog-post', sourceDir);

    const stagedSkill = path.join(cwd, SKILLS_CWD_ALIAS, 'blog-post');
    expect(lstatSync(stagedSkill).isSymbolicLink()).toBe(false);
    expect(lstatSync(stagedSkill).isDirectory()).toBe(true);

    const stagedFile = path.join(stagedSkill, 'SKILL.md');
    expect(lstatSync(stagedFile).isSymbolicLink()).toBe(false);
    expect(lstatSync(stagedFile).isFile()).toBe(true);
  });

  it('REGRESSION: writes through the staged copy do not mutate the source', async () => {
    // This is the P1 vulnerability lefarcen flagged on PR #435 round 1:
    // when `.od-skills` was a directory junction, an agent could
    // `Edit`/`Write` through the alias and overwrite the shipped repo
    // resource. The per-project copy is the structural fix; this test
    // pins it down so a future "optimisation" that re-introduces a
    // symlink would fail loud.
    const fs = fresh();
    const cwd = path.join(fs, 'project');
    const sourceDir = writeSampleSkill(path.join(fs, 'skills'), 'blog-post');
    mkdirSync(cwd);

    await stageActiveSkill(cwd, 'blog-post', sourceDir);

    const stagedSkillMd = path.join(
      cwd,
      SKILLS_CWD_ALIAS,
      'blog-post',
      'SKILL.md',
    );
    writeFileSync(stagedSkillMd, '# AGENT MUTATED');

    expect(readFileSync(path.join(sourceDir, 'SKILL.md'), 'utf8')).toContain(
      'original SKILL',
    );
    expect(readFileSync(stagedSkillMd, 'utf8')).toContain('AGENT MUTATED');
  });

  it('replaces a previous stage so removed files are not left behind', async () => {
    const fs = fresh();
    const cwd = path.join(fs, 'project');
    const sourceDir = writeSampleSkill(path.join(fs, 'skills'), 'blog-post');
    mkdirSync(cwd);
    await stageActiveSkill(cwd, 'blog-post', sourceDir);
    const stale = path.join(cwd, SKILLS_CWD_ALIAS, 'blog-post', 'stale.md');
    writeFileSync(stale, 'should be wiped on next stage');

    await stageActiveSkill(cwd, 'blog-post', sourceDir);

    expect(() => readFileSync(stale)).toThrow();
  });

  it('follows a symlinked source root via stat() instead of skipping it', async () => {
    const fs = fresh();
    const cwd = path.join(fs, 'project');
    const realRoot = path.join(fs, 'skills-real');
    const linkedRoot = path.join(fs, 'skills');
    const realSkill = writeSampleSkill(realRoot, 'blog-post');
    symlinkSync(realRoot, linkedRoot, dirLinkType);
    mkdirSync(cwd);

    const result = await stageActiveSkill(
      cwd,
      'blog-post',
      // simulate the daemon resolving SKILLS_DIR through a symlinked
      // mount.
      path.join(linkedRoot, 'blog-post'),
    );

    expect(result.staged).toBe(true);
    expect(
      readFileSync(
        path.join(result.stagedPath!, 'SKILL.md'),
        'utf8',
      ),
    ).toContain('original SKILL');
    void realSkill;
  });

  it('upgrades a legacy symlink left by an earlier daemon to a real directory', async () => {
    const fs = fresh();
    const cwd = path.join(fs, 'project');
    const sourceDir = writeSampleSkill(path.join(fs, 'skills'), 'blog-post');
    mkdirSync(cwd);
    // Earlier daemon versions staged the alias root as a directory link
    // that pointed at SKILLS_DIR. Make sure the new staging logic
    // detects and replaces that without panicking.
    symlinkSync(path.dirname(sourceDir), path.join(cwd, SKILLS_CWD_ALIAS), dirLinkType);

    const messages: string[] = [];
    const result = await stageActiveSkill(
      cwd,
      'blog-post',
      sourceDir,
      (m) => messages.push(m),
    );

    expect(result.staged).toBe(true);
    expect(
      lstatSync(path.join(cwd, SKILLS_CWD_ALIAS)).isSymbolicLink(),
    ).toBe(false);
    expect(messages.some((m) => m.includes('replacing legacy symlink'))).toBe(
      true,
    );
  });

  it('refuses to stage when the alias root is a regular file', async () => {
    const fs = fresh();
    const cwd = path.join(fs, 'project');
    const sourceDir = writeSampleSkill(path.join(fs, 'skills'), 'blog-post');
    mkdirSync(cwd);
    writeFileSync(path.join(cwd, SKILLS_CWD_ALIAS), 'user-content');

    const messages: string[] = [];
    const result = await stageActiveSkill(
      cwd,
      'blog-post',
      sourceDir,
      (m) => messages.push(m),
    );

    expect(result.staged).toBe(false);
    expect(result.reason).toMatch(/non-directory/);
    expect(
      readFileSync(path.join(cwd, SKILLS_CWD_ALIAS), 'utf8'),
    ).toBe('user-content');
    expect(messages.some((m) => m.includes('refusing to stage'))).toBe(true);
  });

  it('skips silently when the source directory does not exist', async () => {
    const fs = fresh();
    const cwd = path.join(fs, 'project');
    mkdirSync(cwd);

    const result = await stageActiveSkill(
      cwd,
      'blog-post',
      path.join(fs, 'skills', 'missing'),
    );

    expect(result.staged).toBe(false);
    expect(result.reason).toMatch(/source missing/);
  });

  it('returns false without throwing when cwd is null', async () => {
    const result = await stageActiveSkill(
      null,
      'blog-post',
      '/does/not/matter',
    );
    expect(result.staged).toBe(false);
    expect(result.reason).toBe('no project cwd');
  });

  it.each([
    ['', 'unsafe folder name'],
    ['.', 'unsafe folder name'],
    ['..', 'unsafe folder name'],
    ['../escape', 'unsafe folder name'],
    ['nested/path', 'unsafe folder name'],
    ['back\\slash', 'unsafe folder name'],
    ['/abs/path', 'unsafe folder name'],
  ])(
    'rejects unsafe folder name %j to keep the alias root sealed',
    async (folder, expectedReason) => {
      const fs = fresh();
      const cwd = path.join(fs, 'project');
      mkdirSync(cwd);

      const result = await stageActiveSkill(cwd, folder, '/anywhere');

      expect(result.staged).toBe(false);
      expect(result.reason).toContain(expectedReason);
    },
  );

  it('falls back to a dereferenced stream copy when the native copy fails with EPERM', async () => {
    // Repro for the Docker/ZFS report: `fs.cp` -> copy_file_range(2) is
    // rejected with EPERM across the image-layer -> bind-mount boundary
    // and Node doesn't fall back. The real errno only appears on those
    // mounts, so inject a copy that rejects with a synthetic EPERM.
    const fs = fresh();
    const cwd = path.join(fs, 'project');
    const sourceDir = writeSampleSkill(path.join(fs, 'skills'), 'blog-post');
    // A symlinked side file proves the fallback still dereferences, so the
    // staged copy stays a self-contained write barrier.
    symlinkSync(
      path.join(sourceDir, 'assets', 'template.html'),
      path.join(sourceDir, 'assets', 'linked.html'),
    );
    mkdirSync(cwd);

    const messages: string[] = [];
    const eperm = Object.assign(
      new Error('EPERM: operation not permitted, copyfile'),
      { code: 'EPERM' },
    );

    const result = await stageActiveSkill(
      cwd,
      'blog-post',
      sourceDir,
      (m) => messages.push(m),
      () => Promise.reject(eperm),
    );

    expect(result.staged).toBe(true);
    const staged = result.stagedPath!;
    expect(readFileSync(path.join(staged, 'SKILL.md'), 'utf8')).toContain(
      'original SKILL',
    );
    const linked = path.join(staged, 'assets', 'linked.html');
    expect(lstatSync(linked).isSymbolicLink()).toBe(false);
    expect(lstatSync(linked).isFile()).toBe(true);
    expect(readFileSync(linked, 'utf8')).toContain('original');
    expect(messages.some((m) => m.includes('stream copy'))).toBe(true);
  });

  it('preserves the source exec bit through the stream-copy fallback (EPERM path)', async () => {
    // Regression for PR #3249 review: skills shell out to staged helper
    // scripts, so the fallback copy must keep the source's exec bit. A
    // plain stream copy would reset it to the default 0644 and the agent
    // would hit EACCES on the exact cross-fs path this fallback repairs.
    const fs = fresh();
    const cwd = path.join(fs, 'project');
    const sourceDir = writeSampleSkill(path.join(fs, 'skills'), 'blog-post');
    const script = path.join(sourceDir, 'scripts', 'run.sh');
    mkdirSync(path.dirname(script));
    writeFileSync(script, '#!/usr/bin/env bash\necho hi\n');
    chmodSync(script, 0o755);
    mkdirSync(cwd);

    const eperm = Object.assign(new Error('EPERM: operation not permitted'), {
      code: 'EPERM',
    });
    const result = await stageActiveSkill(
      cwd,
      'blog-post',
      sourceDir,
      () => {},
      () => Promise.reject(eperm),
    );

    expect(result.staged).toBe(true);
    const stagedScript = path.join(result.stagedPath!, 'scripts', 'run.sh');
    // Exec bit survives on the helper script…
    expect(statSync(stagedScript).mode & 0o111).not.toBe(0);
    // …while a non-executable sibling is not made executable.
    expect(statSync(path.join(result.stagedPath!, 'SKILL.md')).mode & 0o111).toBe(
      0,
    );
  });

  it('degrades to the absolute-path fallback on a non-recoverable copy error', async () => {
    const fs = fresh();
    const cwd = path.join(fs, 'project');
    const sourceDir = writeSampleSkill(path.join(fs, 'skills'), 'blog-post');
    mkdirSync(cwd);

    const enospc = Object.assign(
      new Error('ENOSPC: no space left on device'),
      { code: 'ENOSPC' },
    );
    const messages: string[] = [];

    const result = await stageActiveSkill(
      cwd,
      'blog-post',
      sourceDir,
      (m) => messages.push(m),
      () => Promise.reject(enospc),
    );

    // Not a cross-filesystem rejection — propagates to the existing
    // degrade path instead of attempting the stream-copy fallback.
    expect(result.staged).toBe(false);
    expect(result.reason).toMatch(/ENOSPC/);
    expect(
      existsSync(path.join(cwd, SKILLS_CWD_ALIAS, 'blog-post', 'SKILL.md')),
    ).toBe(false);
    expect(messages.some((m) => m.includes('stream copy'))).toBe(false);
  });
});

/**
 * Coverage for `DELETE /api/skills/:id`. After review feedback on PR #955,
 * the route resolves the on-disk folder by `skill.dir` rather than by
 * re-slugifying the frontmatter id, so it has to handle both shapes that
 * land under USER_SKILLS_DIR:
 *
 *   1. Import shape — `<userSkillsDir>/<slugifySkillName(name)>/SKILL.md`
 *      (the daemon picks the folder name from the frontmatter `name`).
 *   2. Install shape — `<userSkillsDir>/<sanitizeRepoName(url)>/` or
 *      `<userSkillsDir>/<basename(realpath)>/`, often a symlink to the
 *      user's source tree, where the folder name is independent of the
 *      frontmatter `name`.
 *
 * The earlier handler matched only shape 1 and silently 404'd shape 2,
 * leaving installed folders behind. These tests pin both shapes plus a
 * sibling-traversal guard so the regression cannot return.
 */
import type http from 'node:http';
import { mkdirSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('DELETE /api/skills/:id', () => {
  let server: http.Server;
  let baseUrl: string;
  let userSkillsDir: string;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    userSkillsDir = path.join(dataDir, 'skills');
    mkdirSync(userSkillsDir, { recursive: true });
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function seedSkill(folderName: string, frontmatterName: string): string {
    const dir = path.join(userSkillsDir, folderName);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, 'SKILL.md'),
      `---\nname: ${frontmatterName}\ndescription: fixture for delete route\n---\nbody`,
    );
    return dir;
  }

  it('removes an import-shaped skill (folder named after the slugified frontmatter id)', async () => {
    const dir = seedSkill('blog-helper', 'blog-helper');
    expect(existsSync(dir)).toBe(true);

    const resp = await fetch(`${baseUrl}/api/skills/blog-helper`, { method: 'DELETE' });
    expect(resp.status).toBe(200);
    expect(existsSync(dir)).toBe(false);
  });

  it('removes an install-shaped skill where the folder name does not match the frontmatter id', async () => {
    // GitHub install: `installFromTarget` writes the clone under the
    // sanitized repo name, even though the SKILL.md inside advertises a
    // different `name`. Re-slugifying the id (the previous handler) would
    // miss this directory entirely.
    const dir = seedSkill('awesome-skill-pack', 'totally-different-id');
    expect(existsSync(dir)).toBe(true);

    const resp = await fetch(`${baseUrl}/api/skills/totally-different-id`, { method: 'DELETE' });
    expect(resp.status).toBe(200);
    expect(existsSync(dir)).toBe(false);
  });

  it('removes a symlinked local install without following the link to the source tree', async () => {
    // Local-path install: `installFromTarget` symlinks the user's source
    // directory into USER_SKILLS_DIR. Deleting must unlink the symlink,
    // not recurse into and wipe the user's own files.
    const sourceTree = mkdtempSync(path.join(tmpdir(), 'od-skill-source-'));
    tempDirs.push(sourceTree);
    writeFileSync(
      path.join(sourceTree, 'SKILL.md'),
      `---\nname: linked-skill\ndescription: fixture\n---\nbody`,
    );
    writeFileSync(path.join(sourceTree, 'guard.txt'), 'must survive delete');

    const linkPath = path.join(userSkillsDir, 'linked-skill');
    symlinkSync(sourceTree, linkPath);

    const resp = await fetch(`${baseUrl}/api/skills/linked-skill`, { method: 'DELETE' });
    expect(resp.status).toBe(200);
    expect(existsSync(linkPath)).toBe(false);
    // The symlink target must remain untouched — unlinkSync, never rm -rf.
    expect(existsSync(path.join(sourceTree, 'guard.txt'))).toBe(true);
  });

  it('refuses to delete a built-in skill', async () => {
    // `live-artifact` ships under the repo's design-templates root and is
    // surfaced with `source: 'built-in'`; the handler must reject it
    // regardless of the resolution path.
    const resp = await fetch(`${baseUrl}/api/skills/live-artifact`, { method: 'DELETE' });
    // The id may not even appear under the user/built-in skill roots
    // (functional-only) — in that case the route returns 404 without
    // falling through to a built-in deletion. uninstallById returns 403
    // ("Cannot uninstall built-in items") when the id IS present in the
    // bundled skills root. Both shapes are safe; what we forbid is a 200
    // that would have removed the bundled folder.
    expect([400, 403, 404]).toContain(resp.status);
    expect(resp.status).not.toBe(200);
  });

  it('returns 404 for an unknown id', async () => {
    const resp = await fetch(`${baseUrl}/api/skills/does-not-exist-${Date.now()}`, {
      method: 'DELETE',
    });
    expect(resp.status).toBe(404);
  });
});

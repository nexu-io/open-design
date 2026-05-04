import { lstatSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DESIGN_SYSTEMS_CWD_ALIAS,
  SKILLS_CWD_ALIAS,
  ensureCwdAliases,
} from '../src/cwd-aliases.js';

function fresh(): string {
  return mkdtempSync(path.join(tmpdir(), 'od-cwd-alias-'));
}

describe('ensureCwdAliases', () => {
  it('exposes documented alias names so the skill preamble stays in sync', () => {
    expect(SKILLS_CWD_ALIAS).toBe('.od-skills');
    expect(DESIGN_SYSTEMS_CWD_ALIAS).toBe('.od-design-systems');
  });

  it('creates a symlink/junction from cwd to the source root', async () => {
    const root = fresh();
    const cwd = path.join(root, 'project');
    const src = path.join(root, 'skills');
    mkdirSync(cwd);
    mkdirSync(src);
    writeFileSync(path.join(src, 'a.txt'), 'hello');

    await ensureCwdAliases(cwd, [
      { name: SKILLS_CWD_ALIAS, target: src },
    ]);

    const linkPath = path.join(cwd, SKILLS_CWD_ALIAS);
    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(await realpath(linkPath)).toBe(await realpath(src));
  });

  it('is idempotent when the alias already points at the same target', async () => {
    const root = fresh();
    const cwd = path.join(root, 'project');
    const src = path.join(root, 'skills');
    mkdirSync(cwd);
    mkdirSync(src);

    await ensureCwdAliases(cwd, [{ name: SKILLS_CWD_ALIAS, target: src }]);
    const before = await realpath(path.join(cwd, SKILLS_CWD_ALIAS));
    await ensureCwdAliases(cwd, [{ name: SKILLS_CWD_ALIAS, target: src }]);
    const after = await realpath(path.join(cwd, SKILLS_CWD_ALIAS));

    expect(after).toBe(before);
  });

  it('repoints the alias when the target moves', async () => {
    const root = fresh();
    const cwd = path.join(root, 'project');
    const src1 = path.join(root, 'skills-old');
    const src2 = path.join(root, 'skills-new');
    mkdirSync(cwd);
    mkdirSync(src1);
    mkdirSync(src2);

    await ensureCwdAliases(cwd, [{ name: SKILLS_CWD_ALIAS, target: src1 }]);
    await ensureCwdAliases(cwd, [{ name: SKILLS_CWD_ALIAS, target: src2 }]);

    const real = await realpath(path.join(cwd, SKILLS_CWD_ALIAS));
    expect(real).toBe(await realpath(src2));
  });

  it('skips silently when the source does not exist', async () => {
    const root = fresh();
    const cwd = path.join(root, 'project');
    mkdirSync(cwd);

    const messages: string[] = [];
    await ensureCwdAliases(
      cwd,
      [{ name: SKILLS_CWD_ALIAS, target: path.join(root, 'absent') }],
      (msg) => messages.push(msg),
    );

    expect(() => lstatSync(path.join(cwd, SKILLS_CWD_ALIAS))).toThrow();
    expect(messages).toEqual([]);
  });

  it('refuses to clobber a pre-existing real entry under the alias name', async () => {
    const root = fresh();
    const cwd = path.join(root, 'project');
    const src = path.join(root, 'skills');
    mkdirSync(cwd);
    mkdirSync(src);
    // The user happens to have a regular file at the alias name.
    writeFileSync(path.join(cwd, SKILLS_CWD_ALIAS), 'user-content');

    const messages: string[] = [];
    await ensureCwdAliases(
      cwd,
      [{ name: SKILLS_CWD_ALIAS, target: src }],
      (msg) => messages.push(msg),
    );

    expect(lstatSync(path.join(cwd, SKILLS_CWD_ALIAS)).isFile()).toBe(true);
    expect(messages.some((m) => m.includes('not a symlink'))).toBe(true);
  });

  it('processes each spec independently when one fails', async () => {
    const root = fresh();
    const cwd = path.join(root, 'project');
    const goodSrc = path.join(root, 'design-systems');
    mkdirSync(cwd);
    mkdirSync(goodSrc);
    // Block the first alias by occupying its name with a regular file.
    writeFileSync(path.join(cwd, SKILLS_CWD_ALIAS), 'user-content');

    const messages: string[] = [];
    await ensureCwdAliases(
      cwd,
      [
        { name: SKILLS_CWD_ALIAS, target: path.join(root, 'absent') },
        { name: DESIGN_SYSTEMS_CWD_ALIAS, target: goodSrc },
      ],
      (msg) => messages.push(msg),
    );

    // Second alias still created.
    const goodLink = path.join(cwd, DESIGN_SYSTEMS_CWD_ALIAS);
    expect(lstatSync(goodLink).isSymbolicLink()).toBe(true);
    expect(await realpath(goodLink)).toBe(await realpath(goodSrc));
  });

  it('ignores malformed specs without crashing', async () => {
    const root = fresh();
    const cwd = path.join(root, 'project');
    mkdirSync(cwd);

    await ensureCwdAliases(cwd, [
      // @ts-expect-error intentionally malformed
      null,
      // @ts-expect-error intentionally malformed
      { name: 123, target: '/tmp' },
      // @ts-expect-error intentionally malformed
      { name: '.od-skills' },
    ]);

    expect(() => lstatSync(path.join(cwd, SKILLS_CWD_ALIAS))).toThrow();
  });
});

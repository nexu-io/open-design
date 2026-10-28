import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, copyFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Script } from 'node:vm';
import { afterEach, expect, test } from 'vitest';

const exec = promisify(execFile), roots: string[] = [];
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const canonical = path.join(repo, 'skills/motion-design/references/glyph-unfold');
const mirror = path.join(repo, 'plugins/_official/scenarios/od-next-strategy/assets/task-profiles/motion-design/glyph-unfold');
const names = ['guide.md', 'runtime.html', 'prepare.ts'];
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function setup(next = false) {
  const root = await mkdtemp(path.join(tmpdir(), 'od-glyph-unfold-')); roots.push(root);
  const reference = path.join(root, next ? '.od-motion/glyph-unfold' : '.od-skills/motion-design/references/glyph-unfold');
  await mkdir(reference, { recursive: true });
  const hash = createHash('sha256'), files: Record<string, { sha256: string; bytes: number }> = {};
  for (const name of names) {
    const bytes = await readFile(path.join(canonical, name));
    hash.update(name + '\0').update(bytes);files[name] = { sha256: sha(bytes), bytes: bytes.length };
    await copyFile(path.join(canonical, name), path.join(reference, name));
  }
  const resourceHash = hash.digest('hex');
  if (next) await writeFile(path.join(reference, '.ownership.json'), JSON.stringify({ appliedSnapshot: 'current-snapshot', packageHash: 'a'.repeat(64), files }));
  const command = (args: string[] = [], expected = resourceHash) => exec(process.execPath, [path.join(reference, 'prepare.ts'), '--resource-hash', expected, ...(next ? ['--applied-snapshot', 'current-snapshot'] : []), ...args]);
  return { root, reference, resourceHash, command };
}

test('[P1] canonical skill, generated profile and resource mirrors share the actual declared identity', async () => {
  const fixture = await setup();
  const skill = await readFile(path.join(repo, 'skills/motion-design/SKILL.md'), 'utf8');
  expect(skill).toContain('Glyph unfold resource hash: `' + fixture.resourceHash + '`');
  expect(await readFile(path.join(repo, 'plugins/_official/scenarios/od-next-strategy/assets/task-profiles/motion-design.md'), 'utf8')).toBe(skill);
  for (const name of names) expect(await readFile(path.join(mirror, name))).toEqual(await readFile(path.join(canonical, name)));
  const manifest = JSON.parse(await readFile(path.join(repo, 'plugins/_official/scenarios/od-next-strategy/open-design.json'), 'utf8'));
  for (const taskType of ['motion-design', 'discovery']) {
    const profile = manifest.od.strategy.assets.taskProfiles.find((entry: { taskType: string }) => entry.taskType === taskType);
    for (const name of names) expect(profile.resources).toContainEqual({ path: './assets/task-profiles/motion-design/glyph-unfold/' + name, version: '1.0.0' });
  }
  expect(skill).not.toContain('read [runtime.html]');
});

test.each([false, true])('[P1] actual helper prepares a local executable asset through the %s Next route without replacing a film', async next => {
  const fixture = await setup(next), film = path.join(fixture.root, 'film');await mkdir(film);
  const source = '<html><body>Existing caller owns its full film, GSAP and player.</body></html>';
  await writeFile(path.join(film, 'index.html'), source);
  const check = JSON.parse((await fixture.command(['--check'])).stdout);
  expect(check.sourceKind).toBe(next ? 'od-next-profile' : 'skill-side-files');
  const result = JSON.parse((await fixture.command(['--out-dir', path.join(film, 'glyph-assets')])).stdout);
  expect(result).toMatchObject({ status: 'prepared', resourceHash: fixture.resourceHash, rendered: false, retainedInFinalSource: 'unknown' });
  const runtime = await readFile(path.join(film, 'glyph-assets/runtime.js'), 'utf8');
  expect(() => new Script(runtime)).not.toThrow();
  expect(sha(runtime)).toBe(result.runtimeSha256);
  expect(runtime).toContain('window.ODGlyphUnfold');
  expect(runtime).not.toMatch(/gsap\.timeline|requestAnimationFrame|__timelines|__odMotionPlayer/);
  expect(await readFile(path.join(film, 'index.html'), 'utf8')).toBe(source);
  await expect(fixture.command(['--out-dir', path.join(film, 'glyph-assets')])).rejects.toThrow(/already exists/);
});

test('[P1] stale or edited resources fail closed to ordinary authoring and preserve existing work', async () => {
  const fixture = await setup(true);
  await expect(fixture.command(['--check'], '0'.repeat(64))).rejects.toThrow(/differ from the current/);
  await expect(exec(process.execPath, [path.join(fixture.reference, 'prepare.ts'), '--check', '--resource-hash', fixture.resourceHash, '--applied-snapshot', 'old'])).rejects.toThrow(/current applied snapshot/);
  await writeFile(path.join(fixture.reference, 'guide.md'), 'user modified reference');
  await expect(fixture.command(['--check'])).rejects.toThrow(/changed/);
  expect(await readFile(path.join(fixture.reference, 'guide.md'), 'utf8')).toBe('user modified reference');
  const legacy = await setup();
  await expect(exec(process.execPath, [path.join(legacy.reference, 'prepare.ts'), '--check', '--resource-hash', legacy.resourceHash, '--applied-snapshot', 'invented'])).rejects.toThrow(/must use its staged/);
});

test('[P1] supplied font keeps its license; absent license and symlink parents never create an output', async () => {
  const fixture = await setup(), font = path.join(fixture.root, 'supplied.woff2'), license = path.join(fixture.root, 'license.txt');
  await writeFile(font, 'user supplied fixture bytes');await writeFile(license, 'fixture permission');
  const output = path.join(fixture.root, 'module');
  await expect(fixture.command(['--out-dir', output, '--font-file', font])).rejects.toThrow(/license/);
  await fixture.command(['--out-dir', output, '--font-file', font, '--font-license', license]);
  expect(await readFile(path.join(output, 'font.woff2'))).toEqual(await readFile(font));
  expect(await readFile(path.join(output, 'font-license.txt'), 'utf8')).toBe('fixture permission');
  const alias = path.join(fixture.root, 'alias');await symlink(output, alias);
  await expect(fixture.command(['--out-dir', path.join(alias, 'new')])).rejects.toThrow(/real existing directory/);
});

/** Keep the sealed OD Next task asset byte-identical to the public @ skill. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'skills/motion-design/SKILL.md');
const target = resolve(root, 'plugins/_official/scenarios/od-next-strategy/assets/task-profiles/motion-design.md');
const resources = ['guide.md', 'runtime.html', 'prepare.ts'];
const resourceSource = resolve(root, 'skills/motion-design/references/glyph-unfold');
const resourceTarget = resolve(root, 'plugins/_official/scenarios/od-next-strategy/assets/task-profiles/motion-design/glyph-unfold');
const hash = createHash('sha256');
const files = await Promise.all(resources.map(async name => ({ name, bytes: await readFile(resolve(resourceSource, name)) })));
for (const file of files) hash.update(file.name + '\0').update(file.bytes);
const original = await readFile(source, 'utf8');
const resourceHash = hash.digest('hex');
const body = original.replace(/(Glyph unfold resource hash: `)[a-f0-9]{64}(`)/, (_match, before: string, after: string) => before + resourceHash + after);
if (body === original && !original.includes('Glyph unfold resource hash:')) throw new Error('Motion skill is missing its resource hash slot.');
if (process.argv.includes('--check')) {
  if (original !== body || await readFile(target, 'utf8') !== body) {
    throw new Error('Motion Design task asset has drifted. Run pnpm exec tsx scripts/sync-motion-design-skill.ts');
  }
  for (const file of files) if (!(await readFile(resolve(resourceTarget, file.name))).equals(file.bytes)) throw new Error('Motion reference mirror has drifted: ' + file.name);
} else {
  await writeFile(source, body);
  await writeFile(target, body);
  await mkdir(resourceTarget, { recursive: true });
  for (const file of files) await writeFile(resolve(resourceTarget, file.name), file.bytes);
}

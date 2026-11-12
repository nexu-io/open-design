/** Keep the sealed OD Next task asset byte-identical to the public @ skill. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'skills/motion-design/SKILL.md');
const target = resolve(root, 'plugins/_official/scenarios/od-next-strategy/assets/task-profiles/motion-design.md');
const body = await readFile(source, 'utf8');
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== body) {
    throw new Error('Motion Design task asset has drifted. Run pnpm exec tsx scripts/sync-motion-design-skill.ts');
  }
} else {
  await writeFile(target, body);
}

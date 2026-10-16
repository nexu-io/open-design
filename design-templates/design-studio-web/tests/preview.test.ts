import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const inputs = join(root, 'examples/inputs.form-shift.json');
const bake = join(root, 'examples/form-shift.html');
const slots = ['work-1', 'work-2', 'work-3', 'work-4', 'studio'];

async function checkInlinePlates(html: string): Promise<void> {
  const images = [...html.matchAll(/<img\b[^>]*\bsrc=['"]([^'"]+)['"]/g)].map(m => m[1]);
  assert.equal(images.length, slots.length);
  for (const [index, src] of images.entries()) {
    assert.ok(src.startsWith('data:image/svg+xml;base64,'), `External preview plate: ${src}`);
    const svg = Buffer.from(src.split(',')[1], 'base64');
    assert.deepEqual(svg, await readFile(join(root, 'assets', slots[index] + '.svg')));
  }
}

test('English gallery bake embeds all five SVG plates', async () => {
  await checkInlinePlates(await readFile(bake, 'utf8'));
});

test('composer reproduces the self-contained English bake in a new directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-gallery-'));
  try {
    const output = join(dir, 'nested/index.html');
    execFileSync(process.execPath, [join(root, 'scripts/compose.ts'), inputs, output, '--inline-svg'], { stdio: 'pipe' });
    const html = await readFile(output, 'utf8');
    await checkInlinePlates(html);
    assert.ok(html === await readFile(bake, 'utf8'), 'English bake must match a fresh composition');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

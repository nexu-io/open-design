import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const run = (script, args, env = {}) => spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], { encoding: 'utf8', env: { ...process.env, ...env } });

test('export includes all media, honors custom chapter anchors, and rejects missing assets', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'heritage-export-'));
  try {
    const input = JSON.parse(await fs.readFile(path.join(root, 'inputs.example.json'), 'utf8'));
    input.imagery.strategy = 'placeholder';
    input.imagery.provided_assets = {};
    input.chapters[0].id = 'custom-hero';
    input.navigation.chapter_ids[0] = 'custom-hero';
    const inputPath = path.join(dir, 'input.json');
    const output = path.join(dir, 'nested/index.html');
    await fs.writeFile(inputPath, JSON.stringify(input));
    const built = run('compose.ts', [inputPath, output]);
    assert.equal(built.status, 0, built.stderr);
    const html = await fs.readFile(output, 'utf8');
    const images = [...html.matchAll(/<img src="([^"]+)"/g)].map(m => m[1]);
    assert.ok(images.length >= input.chapters.length);
    for (const chapter of input.chapters) assert.ok(html.includes(`id="${chapter.id}"`));
    for (const src of images) assert.ok((await fs.stat(path.resolve(path.dirname(output), src))).size > 0);
    assert.ok(html.includes('class="brand" href="#custom-hero"'));
    assert.equal((html.match(/<h1 /g) || []).length, 1);
    input.imagery.strategy = 'generate';
    input.imagery.assets_path = 'missing';
    await fs.writeFile(inputPath, JSON.stringify(input));
    assert.notEqual(run('compose.ts', [inputPath, path.join(dir, 'bad.html')]).status, 0);
    await assert.rejects(fs.access(path.join(dir, 'bad.html')));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('image generation handles queued results, preserves real extensions, and reuses completed slots', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'heritage-media-'));
  try {
    const inputPath = path.join(dir, 'input.json');
    const input = JSON.parse(await fs.readFile(path.join(root, 'inputs.example.json'), 'utf8'));
    input.imagery.provided_assets = {};
    await fs.writeFile(inputPath, JSON.stringify(input));
    await fs.writeFile(path.join(dir, 'result.png'), 'fake image bytes for adapter transport test');
    const mock = path.join(dir, 'mock.ts');
    await fs.writeFile(mock, `import fs from 'node:fs';
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALLS, JSON.stringify(args) + '\\n');
if (args[1] === 'generate') console.log(JSON.stringify({ taskId: 'queued', nextSince: 7 }));
else { if (!args.includes('7')) process.exit(5); console.log(JSON.stringify({ file: { name: 'result.png' } })); }
`);
    const calls = path.join(dir, 'calls');
    const env = { OD_BIN: mock, OD_NODE_BIN: process.execPath, CALLS: calls };
    const args = [inputPath, '--execute', '--model', 'test', '--project', 'test-project', '--files-dir', dir, '--slot', 'encounter-master'];
    const first = run('imagegen.ts', args, env);
    assert.equal(first.status, 0, first.stderr);
    const result = JSON.parse(await fs.readFile(path.join(dir, 'inputs.generated.json'), 'utf8'));
    assert.equal(result.imagery.provided_assets['encounter-master'], 'result.png');
    assert.equal(run('imagegen.ts', args, env).status, 0);
    assert.equal((await fs.readFile(calls, 'utf8')).trim().split('\n').length, 2);
    await fs.writeFile(path.join(dir, 'pending-detail-master.json'), '{"taskId":"pending"}');
    args[args.length - 1] = 'detail-master';
    assert.notEqual(run('imagegen.ts', args, env).status, 0);
    assert.equal((await fs.readFile(calls, 'utf8')).trim().split('\n').length, 2);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('reduced motion keeps navigation current and stops scheduling animation frames', async () => {
  const { runInNewContext } = await import('node:vm');
  const properties = new Map();
  const attributes = new Map();
  const classes = new Set();
  let queued;
  const scene = { id: 'first', dataset: {}, style: { setProperty: (k, v) => properties.set(k, v) }, getBoundingClientRect: () => ({ top: 0, bottom: 900, height: 900 }) };
  const link = { hash: '#first', classList: { toggle() {} }, setAttribute: (k, v) => attributes.set(k, v), removeAttribute: k => attributes.delete(k) };
  const context = {
    document: {
      documentElement: { classList: { toggle: (k, on) => on ? classes.add(k) : classes.delete(k), add() {} } },
      body: { dataset: { motionTier: 'high' } }, hidden: false,
      querySelectorAll: selector => selector === '.scene' ? [scene] : selector.includes('.progress-rail') ? [link] : [],
      querySelector: () => null, addEventListener() {}
    },
    window: {}, matchMedia: query => ({ matches: query.includes('reduced-motion'), addEventListener() {} }),
    requestAnimationFrame: callback => { queued = callback; return 1; }, addEventListener() {}, innerHeight: 900, scrollY: 0
  };
  runInNewContext(await fs.readFile(path.join(root, 'motion-runtime.ts'), 'utf8'), context);
  const firstFrame = queued;
  queued = undefined;
  firstFrame(16);
  assert.equal(properties.get('--scene-scale'), '1.0000');
  assert.equal(properties.get('--scene-x'), '0.00px');
  assert.equal(attributes.get('aria-current'), 'location');
  assert.ok(classes.has('motion-static'));
  assert.equal(queued, undefined);
});

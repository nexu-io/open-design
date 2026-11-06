import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { checkReleaseLocks, packageNpm } from '../scripts/package-npm.mjs';
import { extractArchive, runFile, sha256 } from '../scripts/runtime-assets.mjs';
import { protocolClient } from '../scripts/smoke-test-package.mjs';
import { phase1Skills } from '../shared/workflow.ts';
import { mcpRegistry } from '../mcp.ts';

const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));

test('release packaging rejects floating npm versions, lock drift, unpinned native assets and a mismatched browser', async () => {
  const pkg = await json('package.json'), lock = await json('package-lock.json'), runtime = await json('scripts/runtime-lock.json');
  checkReleaseLocks(pkg, lock, runtime);
  const floating = structuredClone(pkg); floating.dependencies.gsap = '^' + pkg.dependencies.gsap;
  const floatingLock = structuredClone(lock); floatingLock.packages[''].dependencies = floating.dependencies;
  assert.throws(() => checkReleaseLocks(floating, floatingLock, runtime), /exact npm/);
  const drift = structuredClone(lock); drift.packages['node_modules/gsap'].version = '0.0.1';
  assert.throws(() => checkReleaseLocks(pkg, drift, runtime), /Resolved npm/);
  const unpinned = structuredClone(runtime); unpinned.targets['mac-arm64'].ffprobe.sha256 = '';
  assert.throws(() => checkReleaseLocks(pkg, lock, unpinned), /SHA256/);
  const browser = structuredClone(runtime); browser.chromium = '1.2.3.4';
  assert.throws(() => checkReleaseLocks(pkg, lock, browser), /Browser must match/);
});

test('beta npm artifacts carry one immutable version, both lock identities and no bundled native runtime', { timeout: 60_000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'motion-npm-pack-'));
  const before = await readFile('package.json', 'utf8');
  try {
    const version = '0.6.2-beta.999001.1', output = path.join(directory, 'build');
    const built = await packageNpm(output, version), release = await json(built.manifest);
    assert.equal(release.version, version); assert.equal(release.installer.version, version); assert.equal(release.format, 'npm');
    assert.equal(release.mcp.profile, 'phase1'); assert.deepEqual(release.mcp.tools, mcpRegistry().tools.map(tool => tool.name));
    assert.deepEqual(release.skills, [...phase1Skills].sort());
    assert.equal(release.installer.sha256, await sha256(built.installer)); assert.equal(release.application.sha256, await sha256(built.application));
    assert.match(release.commit, /^[a-f0-9]{40}$/);
    const application = path.join(directory, 'app'), installer = path.join(directory, 'installer');
    await extractArchive(built.application, application); await extractArchive(built.installer, installer);
    assert.equal((await json(path.join(application, 'package.json'))).version, version);
    assert.equal((await json(path.join(application, 'package-lock.json'))).packages[''].version, version);
    assert.equal((await json(path.join(installer, 'package/package.json'))).version, version);
    assert.equal((await json(path.join(installer, 'package/package.json'))).private, true);
    assert.deepEqual((await readdir(path.join(application, 'skills'))).sort(), [...phase1Skills].sort());
    assert.equal(await sha256(path.join(application, 'package-lock.json')), release.locks.npm);
    assert.equal(await sha256(path.join(application, 'scripts/runtime-lock.json')), release.locks.native);
    const entries = await runFile('tar', ['-tf', built.application]);
    assert(!/\/(node_modules|runtime)\//.test(entries));
    assert(entries.includes('skills/motion-production/SKILL.md'));
    await assert.rejects(packageNpm(output, version), /immutable/);
    await assert.rejects(packageNpm(path.join(directory, 'invalid'), 'latest'), /unique beta/);
    assert.equal(await readFile('package.json', 'utf8'), before, 'Packaging must not bump the checkout');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('the actual dispatch validation permits unpublished npm and backup ZIP, and rejects npm publication', async () => {
  const workflow = await readFile(new URL('../../../.github/workflows/motion.yml', import.meta.url), 'utf8');
  const step = workflow.split('      - name: Validate manual package selection\n')[1].split('      - name:')[0];
  const script = step.split('        run: |\n')[1].replace(/^ {10}/gm, '');
  for (const [format, publish] of [['npm', 'false'], ['full', 'false']]) await runFile('bash', ['-c', script], { env: { ...process.env, PACKAGE_FORMAT: format, PUBLISH: publish } });
  await assert.rejects(runFile('bash', ['-c', script], { env: { ...process.env, PACKAGE_FORMAT: 'npm', PUBLISH: 'true' } }), /publishing is disabled/);
  await assert.rejects(runFile('bash', ['-c', script], { env: { ...process.env, PACKAGE_FORMAT: 'full', PUBLISH: 'true' } }), /publishing is disabled/);
  await assert.rejects(runFile('bash', ['-c', script], { env: { ...process.env, PACKAGE_FORMAT: 'unknown', PUBLISH: 'false' } }), /Unknown package/);
});

test('the shared native acceptance client propagates a child failure instead of reporting a successful check', async () => {
  const client = protocolClient({ command: process.execPath, args: ['-e', 'console.error("fixture startup failed"); process.exit(1)'] }, process.env);
  try { await assert.rejects(client.rpc('initialize', {}), /MCP exited 1.*fixture startup failed/); }
  finally { client.child.kill('SIGTERM'); }
});

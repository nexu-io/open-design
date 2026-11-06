import { cp, mkdir, mkdtemp, readFile, readdir, rm, chmod } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeComponents, runFile, sha256, writeAtomic, writeJSON } from './runtime-assets.mjs';
import assert from 'node:assert/strict';
import { PUPPETEER_REVISIONS } from 'puppeteer-core';
import { releaseProfile } from '../shared/mcp-registry.ts';
import { distributionFiles } from './distribution.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
export function checkReleaseLocks(pkg, lockfile, runtime) {
  assert.equal(lockfile.packages[''].version, pkg.version, 'npm root version differs from lockfile');
  for (const group of ['dependencies', 'devDependencies']) {
    assert.deepEqual(lockfile.packages[''][group], pkg[group], 'npm dependency declarations differ from lockfile');
    for (const [name, version] of Object.entries(pkg[group] || {})) {
      assert.match(version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/, 'Pin an exact npm version: ' + name);
      assert.equal(lockfile.packages['node_modules/' + name]?.version, version, 'Resolved npm version differs: ' + name);
    }
  }
  for (const key of ['node', 'chromium', 'ffmpeg', 'hyperframes']) assert.match(runtime[key], /^\d+\.\d+\.\d+(?:\.\d+)?$/, 'Pin native runtime version: ' + key);
  assert.equal(runtime.hyperframes, pkg.dependencies.hyperframes);
  assert.equal(runtime.chromium, PUPPETEER_REVISIONS['chrome-headless-shell'], 'Browser must match the locked Puppeteer release');
  assert(Object.keys(runtime.targets || {}).length, 'At least one native target is required');
  for (const target of Object.values(runtime.targets)) {
    assert(target.platform && target.arch && target.minimumOS, 'Native runtime requires an OS/CPU and minimum system version');
    for (const key of ['node', ...nativeComponents(target)]) {
      assert.equal(new URL(target[key].url).protocol, 'https:', 'Native sources require HTTPS');
      assert.match(target[key].sha256, /^[a-f0-9]{64}$/, 'Pin native SHA256: ' + key);
    }
  }
}

export async function packageNpm(output = path.join(root, 'dist/npm-local'), version) {
  output = path.resolve(output);
  if (version) assert.match(version, /^\d+\.\d+\.\d+-beta\.[1-9]\d*\.[1-9]\d*$/, 'Use a unique beta run and attempt');
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const lockfile = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  const runtime = JSON.parse(await readFile(path.join(root, 'scripts/runtime-lock.json'), 'utf8'));
  checkReleaseLocks(pkg, lockfile, runtime);
  const { mcpRegistry } = await import('../mcp.ts');
  const registry = mcpRegistry();
  await mkdir(output, { recursive: true });
  if (version) assert.equal((await readdir(output)).length, 0, 'Use a new output directory; beta artifacts are immutable');
  const temporary = await mkdtemp(path.join(output, '.build-'));
  try {
    const application = path.join(temporary, 'application'), installer = path.join(temporary, 'installer');
    await mkdir(application); await mkdir(path.join(installer, 'scripts'), { recursive: true });
    for (const name of await distributionFiles(releaseProfile)) {
      await mkdir(path.dirname(path.join(application, name)), { recursive: true });
      await cp(path.join(root, name), path.join(application, name));
    }
    const skills = (await readdir(path.join(application, 'skills'))).sort();
    for (const name of ['runtime-assets.mjs', 'npm-runtime.mjs', 'npm-hosts.mjs', 'npm-installer.mjs']) await cp(path.join(root, 'scripts', name), path.join(installer, 'scripts', name));
    await chmod(path.join(installer, 'scripts/npm-installer.mjs'), 0o755);
    const installerPkg = JSON.parse(await readFile(path.join(root, 'packages/npm/package.json'), 'utf8'));
    if (version) installerPkg.version = version;
    assert.equal(installerPkg.private, true, 'The installer must remain unpublished');
    await writeJSON(path.join(installer, 'package.json'), installerPkg);
    await cp(path.join(root, 'docs/npm-installation.md'), path.join(installer, 'README.md'));
    if (version) {
      pkg.version = version; lockfile.version = version; lockfile.packages[''].version = version;
      await writeJSON(path.join(application, 'package.json'), pkg);
      await writeJSON(path.join(application, 'package-lock.json'), lockfile);
      const plugin = JSON.parse(await readFile(path.join(application, '.codex-plugin/plugin.json'), 'utf8'));
      plugin.version = version;
      await writeJSON(path.join(application, '.codex-plugin/plugin.json'), plugin);
    }
    const archive = path.join(output, `openmotion-application-${pkg.version}.tar.gz`);
    await runFile(process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32/tar.exe') : 'tar', ['-czf', archive, '-C', application, '.'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
    const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : '../lib/node_modules/npm/bin/npm-cli.js');
    const packed = JSON.parse(await runFile(process.execPath, [npm, 'pack', '--json', '--ignore-scripts', '--pack-destination', output], { cwd: installer }))[0];
    const installerFile = path.join(output, packed.filename);
    const manifest = { schemaVersion: 1, version: pkg.version, format: 'npm',
      commit: (await runFile('git', ['rev-parse', 'HEAD'], { cwd: root })).trim(), run: process.env.GITHUB_RUN_ID || null, attempt: process.env.GITHUB_RUN_ATTEMPT || '1',
      application: { url: './' + path.basename(archive), sha256: await sha256(archive) },
      installer: { version: installerPkg.version, url: './' + packed.filename, sha256: await sha256(installerFile) },
      locks: { npm: await sha256(path.join(application, 'package-lock.json')), native: await sha256(path.join(root, 'scripts/runtime-lock.json')) },
      mcp: { profile: registry.profile, tools: registry.tools.map(tool => tool.name) }, skills, runtime };
    const manifestPath = path.join(output, version ? 'release-npm.json' : 'release.local.json');
    await writeJSON(manifestPath, manifest);
    for (const file of [archive, installerFile, manifestPath]) await writeAtomic(file + '.sha256', `${await sha256(file)}  ${path.basename(file)}\n`);
    return { installer: installerFile, installerBytes: packed.size, application: archive, manifest: manifestPath };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await packageNpm(process.argv[2], process.argv[3]), null, 2));

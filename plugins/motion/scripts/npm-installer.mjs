#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { canonical, extractArchive, nativeComponents, obtainAsset, readJSON, relativePath, runFile, withLock, writeAtomic, writeJSON } from './runtime-assets.mjs';
import { ensureNativeRuntime } from './npm-runtime.mjs';
import { hostPlan, skillTargets, obsoleteSkills, checkSkillOwner, copyHostSkills } from './npm-hosts.mjs';

export const managedBy = '@openmotion/installer';
const defaultHome = () => path.join(process.platform === 'win32' ? process.env.LOCALAPPDATA || os.homedir() : path.join(os.homedir(), '.local/share'), 'openmotion');
const contains = (parent, child) => { const rel = path.relative(parent, child); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); };

export async function localManifest(filename) {
  const file = path.resolve(filename), manifest = await readJSON(file);
  assert(manifest?.schemaVersion === 1 && /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(manifest.version), 'Invalid OpenMotion release manifest');
  assert(/^[a-f0-9]{64}$/.test(manifest.application?.sha256), 'Application requires a pinned SHA256');
  assert(manifest.runtime?.targets && !Array.isArray(manifest.runtime.targets) && Object.keys(manifest.runtime.targets).length, 'Missing native runtime manifest');
  const resolveAsset = asset => {
    assert(asset && /^[a-f0-9]{64}$/.test(asset.sha256), 'Asset requires a pinned SHA256');
    const url = new URL(asset.url, pathToFileURL(file));
    assert(['https:', 'file:'].includes(url.protocol), 'Assets require HTTPS or explicit local files');
    assert(!url.username && !url.password, 'Do not put credentials in asset URLs');
    return { ...asset, url: url.href };
  };
  manifest.application = resolveAsset(manifest.application);
  for (const target of Object.values(manifest.runtime.targets)) {
    for (const component of nativeComponents(target)) {
      target[component] = resolveAsset(target[component]);
      relativePath('/', component === 'media' ? target.media.directory : target[component].executable);
    }
  }
  return manifest;
}

export async function setup(options) {
  let { manifest: filename, home = defaultHome(), dataDirectory } = options;
  const manifest = await localManifest(filename);
  home = await canonical(home);
  dataDirectory = await canonical(dataDirectory || path.join(home, 'data'));
  assert(!contains(dataDirectory, home) && !['apps', 'cache', 'hosts'].some(name => contains(path.join(home, name), dataDirectory)),
    'Keep user data and application/cache directories separate');
  await mkdir(home, { recursive: true });
  return withLock(path.join(home, 'install.lock'), async () => {
    const stateFile = path.join(home, 'install.json'), previous = await readJSON(stateFile);
    assert(previous === null || previous.managedBy === managedBy, 'Installation directory belongs to another application');
    assert(!previous || previous.dataDirectory === dataDirectory, 'This installation already uses another data directory; choose a separate --home');
    const launcher = path.join(home, 'run-mcp.mjs');
    if (!previous) await readFile(launcher).then(() => { throw new Error('Refusing to replace an unowned MCP launcher'); }, error => { if (error.code !== 'ENOENT') throw error; });
    const plan = await hostPlan(options, home, launcher, previous);
    assert(!plan.metadata.configFile || !contains(dataDirectory, plan.metadata.configFile), 'Keep host configuration outside user data');
    assert(!plan.metadata.configFile || !['apps', 'cache', 'hosts'].some(name => contains(path.join(home, name), plan.metadata.configFile)), 'Keep host configuration outside managed application/cache/host directories');
    if (plan.layout !== 'deepseek') assert(!contains(dataDirectory, plan.skillsDirectory) && !contains(plan.skillsDirectory, dataDirectory)
      && !contains(plan.skillsDirectory, home) && !contains(home, plan.skillsDirectory), 'Keep user data, installed Skills and application/cache directories separate');
    if (plan.layout === 'bundle') await checkSkillOwner(path.join(plan.skillsDirectory, 'openmotion'), home, plan.host, plan.layout);
    const appRoot = path.join(home, 'apps', manifest.version + '-' + manifest.application.sha256.slice(0, 16));
    if (!await readJSON(path.join(appRoot, '.npm-install.json'))) {
      const archive = path.join(home, 'cache/downloads', manifest.application.sha256 + '.tar.gz');
      console.error('OpenMotion: preparing application ' + manifest.version);
      await obtainAsset(manifest.application, archive, true);
      await mkdir(path.dirname(appRoot), { recursive: true });
      const temporary = await mkdtemp(path.join(home, 'apps', '.install-'));
      try {
        await extractArchive(archive, temporary);
        const pkg = await readJSON(path.join(temporary, 'package.json'));
        assert.equal(pkg?.version, manifest.version, 'Application version does not match manifest');
        for (const file of ['mcp.ts', 'scripts/npm-runtime.mjs', 'studio/build/index.html', 'skills/motion-production/SKILL.md']) await readFile(path.join(temporary, file));
        assert(!contains(temporary, process.execPath), 'Node must remain external to the lightweight application');
        const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : '../lib/node_modules/npm/bin/npm-cli.js');
        console.error('OpenMotion: installing locked npm runtime (no native media/browser download).');
        await runFile(process.execPath, [npm, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: temporary });
        await writeJSON(path.join(temporary, '.npm-install.json'), { schemaVersion: 1, applicationSHA256: manifest.application.sha256,
          cacheDirectory: path.join(home, 'cache/native'), runtime: manifest.runtime, allowLocalAssets: true });
        await rename(temporary, appRoot);
      } finally { await rm(temporary, { recursive: true, force: true }); }
    }
    const installed = await readJSON(path.join(appRoot, '.npm-install.json'));
    assert.equal(installed.applicationSHA256, manifest.application.sha256, 'Installed application identity mismatch');
    assert.equal(JSON.stringify(installed.runtime), JSON.stringify(manifest.runtime), 'Native manifest changed for the same application; rebuild the application release');
    const targets = await skillTargets(plan, appRoot), directories = [];
    for (const target of targets) directories.push({ target, existed: await checkSkillOwner(target, home, plan.host, plan.layout), movedOld: false, movedNew: false });
    for (const target of await obsoleteSkills(plan, home, targets)) directories.push({ target, existed: true, removeOnly: true, movedOld: false, movedNew: false });
    let wroteState = false, wroteLauncher = false;
    try {
      for (const item of directories) {
        await mkdir(path.dirname(item.target), { recursive: true });
        item.stage = await mkdtemp(path.join(path.dirname(item.target), '.openmotion-'));
        item.backup = item.stage + '-previous';
        if (!item.removeOnly) await copyHostSkills(item.stage, item.target, appRoot, plan, home, manifest.version, dataDirectory);
      }
      for (const item of directories) {
        if (item.existed) { await rename(item.target, item.backup); item.movedOld = true; }
        if (!item.removeOnly) { await rename(item.stage, item.target); item.movedNew = true; }
      }
      await writeAtomic(launcher, `import { readFile } from 'node:fs/promises';\nimport { spawn } from 'node:child_process';\nimport { pathToFileURL } from 'node:url';\nconst state = JSON.parse(await readFile(new URL('./install.json', import.meta.url), 'utf8'));\nawait (await import(pathToFileURL(state.appRoot + '/scripts/npm-runtime.mjs'))).configureNativeEnvironment(state.appRoot);\nconst child = spawn(process.execPath, ['--experimental-strip-types', state.appRoot + '/mcp.ts'], { cwd: state.appRoot, env: { ...process.env, MOTION_DATA_DIR: state.dataDirectory }, stdio: 'inherit', windowsHide: true });\nfor (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));\nchild.once('error', error => { console.error(error.message); process.exitCode = 1; });\nchild.once('exit', code => { process.exitCode = code ?? 1; });\n`);
      wroteLauncher = true;
      const registered = previous?.hosts || (previous?.skillsDirectory ? { codex: { skillsDirectory: previous.skillsDirectory } } : {});
      const state = { ...previous, managedBy, version: manifest.version, appRoot, dataDirectory, launcher,
        hosts: { ...registered, [plan.host]: plan.metadata },
        ...(plan.host === 'codex' ? { skillsDirectory: targets[0] } : {}) };
      await writeJSON(stateFile, state); wroteState = true;
      await plan.register();
      for (const item of directories) await rm(item.backup, { recursive: true, force: true }).catch(error => console.error('Old instruction backup retained: ' + error.message));
      return { ...state, host: plan.host, hostInstallation: plan.metadata, nativeDependencies: 'deferred-until-native-operation-or-prepare' };
    } catch (error) {
      if (wroteLauncher && !previous) await rm(launcher, { force: true });
      if (wroteState) { if (previous) await writeJSON(stateFile, previous); else await rm(stateFile, { force: true }); }
      for (const item of [...directories].reverse()) {
        if (item.movedNew) await rm(item.target, { recursive: true, force: true });
        if (item.movedOld) await rename(item.backup, item.target);
      }
      throw error;
    } finally { for (const item of directories) if (item.stage) await rm(item.stage, { recursive: true, force: true }); }

  });
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    manifest: { type: 'string' }, home: { type: 'string' }, 'data-dir': { type: 'string' }, 'skills-dir': { type: 'string' }, host: { type: 'string' }, codex: { type: 'string' }, claude: { type: 'string' }, dsh: { type: 'string' }, profile: { type: 'string' },
  } });
  const [command] = positionals;
  assert(positionals.length === 1, 'Usage: openmotion setup --host codex|claude|deepseek|workbuddy --manifest FILE [--home DIR] [--data-dir DIR] [--skills-dir DIR] [--codex EXECUTABLE] | prepare --home DIR');
  if (command === 'setup') {
    assert(values.manifest, 'Local validation requires --manifest FILE; no public release is configured');
    console.log(JSON.stringify(await setup({ manifest: values.manifest, home: values.home, dataDirectory: values['data-dir'], skillsDirectory: values['skills-dir'], host: values.host, codex: values.codex, claude: values.claude, dsh: values.dsh, profile: values.profile }), null, 2));
  } else if (command === 'prepare') {
    const state = await readJSON(path.join(values.home || defaultHome(), 'install.json'));
    assert(state?.managedBy === managedBy, 'Run setup first');
    await ensureNativeRuntime(state.appRoot);
    console.log('Pinned FFmpeg, ffprobe and browser are ready.');
  } else throw new Error('Supported commands: setup, prepare');
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main().catch(error => { console.error(error.message); process.exitCode = 1; });

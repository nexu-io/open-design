import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptTransport, protocolClient, testPort } from './smoke-test-package.mjs';
import { canonical, relativePath, runFile, sha256 } from './runtime-assets.mjs';
import { nativeConfiguration } from './npm-runtime.mjs';

export async function smokeNpm(filename, codexJS) {
  filename = path.resolve(filename); codexJS = path.resolve(codexJS);
  const manifest = JSON.parse(await readFile(filename, 'utf8'));
  assert.equal(manifest.format, 'npm');
  const target = Object.entries(manifest.runtime.targets).find(([, info]) => info.platform === process.platform && info.arch === process.arch)?.[0];
  assert(target, 'Run acceptance on a supported target OS/CPU');
  const assetPath = asset => relativePath(path.dirname(filename), asset.url.replace(/^\.\//, ''));
  const installer = assetPath(manifest.installer), application = assetPath(manifest.application);
  assert.equal(await sha256(installer), manifest.installer.sha256);
  assert.equal(await sha256(application), manifest.application.sha256);
  const out = await canonical(await mkdtemp(path.join(os.tmpdir(), 'om-npm-'))), home = path.join(out, 'app'), data = path.join(out, 'data');
  const profile = path.join(out, 'codex'), project = path.join(out, 'project'), skills = path.join(project, '.agents/skills');
  await mkdir(profile); await mkdir(project);
  await writeFile(path.join(profile, 'config.toml'), 'cli_auth_credentials_store = "file"\nmcp_oauth_credentials_store = "file"\n[mcp_servers.unrelated]\ncommand = "keep-this-server"\n');
  const env = { ...process.env, CODEX_HOME: profile, PORT: process.env.D4_LANE_PORT_RANGE?.split('-')[0] || process.env.SEATS_PORT || process.env.PORT || String(await testPort()) };
  for (const key of ['HYPERFRAMES_FFMPEG_PATH', 'HYPERFRAMES_FFPROBE_PATH', 'HYPERFRAMES_BROWSER_PATH', 'FFMPEG_PATH', 'FFPROBE_PATH', 'MOTION_BROWSER_PATH']) delete env[key];
  const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : '../lib/node_modules/npm/bin/npm-cli.js');
  const setup = [npm, 'exec', '--yes', '--package', installer, '--', 'openmotion', 'setup', '--host', 'codex', '--manifest', filename, '--home', home, '--data-dir', data, '--skills-dir', skills, '--codex', codexJS];
  console.error('Install final npm artifact into isolated profile: ' + out);
  const first = JSON.parse(await runFile(process.execPath, setup, { env, cwd: project }));
  const again = JSON.parse(await runFile(process.execPath, setup, { env, cwd: project }));
  assert.equal(first.appRoot, again.appRoot); assert.equal((await readdir(path.join(home, 'apps'))).length, 1);
  assert.equal(await sha256(path.join(first.appRoot, 'package-lock.json')), manifest.locks.npm);
  assert.equal(await sha256(path.join(first.appRoot, 'scripts/runtime-lock.json')), manifest.locks.native);
  assert.match(await readFile(path.join(profile, 'config.toml'), 'utf8'), /keep-this-server/);
  for (const name of manifest.skills) await access(path.join(skills, 'openmotion/skills', name, 'SKILL.md'));
  const host = protocolClient({ command: process.execPath, args: [codexJS, 'app-server', '--stdio'], cwd: project }, env);
  try {
    await host.rpc('initialize', { clientInfo: { name: 'OpenMotion-npm-acceptance', version: '1' } });
    host.child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
    const catalog = await host.rpc('skills/list', { cwds: [project], forceReload: true });
    const discovered = catalog.data.flatMap(item => item.skills);
    for (const name of manifest.skills) assert(discovered.some(skill => skill.name === name && path.resolve(skill.path) === path.join(skills, 'openmotion/skills', name, 'SKILL.md')), 'Native Codex did not discover the installed Skill: ' + name);
  } finally { host.child.kill('SIGTERM'); }
  const installed = JSON.parse(await runFile(process.execPath, [codexJS, 'mcp', 'get', 'openmotion', '--json'], { env, cwd: project }));
  assert.equal(installed.transport.command, process.execPath); assert.deepEqual(installed.transport.args, [first.launcher]);
  const native = await nativeConfiguration(first.appRoot);
  const reportFile = path.join(path.dirname(filename), `smoke-npm-${target}.json`);
  const report = await acceptTransport({ transport: { ...installed.transport, cwd: first.appRoot },
    env: { ...env, PATH: process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32') : '/usr/bin:/bin' }, data,
    metadata: { ...manifest, target }, archive: installer, ffmpeg: native.paths.HYPERFRAMES_FFMPEG_PATH, reportFile,
    deferredNativeDirectory: path.join(home, 'cache/native'),
    installation: { format: 'npm', applicationSHA256: manifest.application.sha256, npmLockSHA256: manifest.locks.npm, nativeLockSHA256: manifest.locks.native, repeatInstall: 'passed', nativeSkills: 'passed', deferredNativeDownload: 'passed', isolatedDirectory: out } });
  const before = await readFile(path.join(native.cache, 'browser-' + native.info.browser.sha256, 'ready.json'), 'utf8');
  await runFile(process.execPath, [npm, 'exec', '--yes', '--package', installer, '--', 'openmotion', 'prepare', '--home', home], { env, cwd: project });
  assert.equal(await readFile(path.join(native.cache, 'browser-' + native.info.browser.sha256, 'ready.json'), 'utf8'), before);
  report.nativeCacheReuse = 'passed';
  await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await smokeNpm(...process.argv.slice(2));

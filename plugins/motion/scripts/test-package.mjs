import assert from 'node:assert/strict';
import { download, nativeComponents, relativePath, sha256 } from './runtime-assets.mjs';
export { download, sha256 } from './runtime-assets.mjs';
import { access, cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { releaseProfile } from '../shared/mcp-registry.ts';
import { distributionFiles } from './distribution.ts';

export const root = fileURLToPath(new URL('../', import.meta.url));
// Git Bash tar interprets C: as a remote host; use Windows' native archive tool.
export const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar';
export const lock = JSON.parse(await readFile(new URL('./runtime-lock.json', import.meta.url), 'utf8'));
export function targetInfo(target) {
  const info = lock.targets[target];
  assert(info, `Unsupported target: ${target}`);
  return info;
}
export function testVersion(base, run, attempt = '1') {
  assert(/^\d+\.\d+\.\d+$/.test(base), 'Source version must be MAJOR.MINOR.PATCH');
  assert(/^[1-9]\d*$/.test(String(run)) && /^[1-9]\d*$/.test(String(attempt)), 'Use positive run and attempt numbers');
  const [major, minor, patch] = base.split('.').map(Number);
  return `${major}.${minor}.${patch + 1}-beta.${run}.${attempt}`;
}
export async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', windowsHide: true, ...options });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}
export async function prepare(target) {
  const info = targetInfo(target), work = path.join(root, '.artifacts', 'test-runtime', target);
  const runtime = path.join(work, 'runtime');
  const suffix = info.platform === 'win32' ? '.exe' : '';
  await mkdir(work, { recursive: true });
  for (const component of ['node', ...nativeComponents(info)]) {
    const asset = info[component], filename = path.join(root, '.artifacts', 'downloads', asset.filename || path.basename(new URL(asset.url).pathname));
    console.error(`Preparing ${target}: ${component} (${new URL(asset.url).hostname})`);
    try { await download(asset, filename); }
    catch (error) { throw new Error(`${target} ${component} download failed: ${new URL(asset.url).hostname}`, { cause: error }); }
    console.error(`Verified ${component} SHA256; extracting native files`);
    const extracted = path.join(work, component + '-unpack');
    await rm(extracted, { recursive: true, force: true }); await mkdir(extracted);
    if (process.platform === 'linux' && filename.endsWith('.zip')) await run('unzip', ['-q', filename, '-d', extracted]);
    else await run(tar, ['-xf', filename, '-C', extracted]);
    const separateTool = component === 'ffmpeg' || component === 'ffprobe';
    const destination = separateTool ? path.join(runtime, 'media/bin', component + suffix) : path.join(runtime, component);
    await mkdir(path.dirname(destination), { recursive: true });
    await rm(destination, { recursive: true, force: true });
    await cp(component === 'browser' ? extracted : relativePath(extracted, separateTool ? asset.executable : asset.directory), destination, { recursive: true, verbatimSymlinks: true });
    await rm(extracted, { recursive: true, force: true });
  }
  const node = path.join(runtime, 'node', info.platform === 'win32' ? 'node.exe' : 'bin/node');
  const env = {
    HYPERFRAMES_BROWSER_PATH: path.join(runtime, 'browser', info.browser.executable),
    HYPERFRAMES_FFMPEG_PATH: path.join(runtime, 'media', 'bin', 'ffmpeg' + suffix),
    HYPERFRAMES_FFPROBE_PATH: path.join(runtime, 'media', 'bin', 'ffprobe' + suffix),
    HYPERFRAMES_NO_TELEMETRY: '1',
  };
  for (const filename of [node, ...Object.values(env).filter(value => path.isAbsolute(value))]) await access(filename);
  await writeFile(path.join(work, 'environment.json'), JSON.stringify(env, null, 2));
  if (info.platform === process.platform && info.arch === process.arch) {
    if (process.env.GITHUB_ENV) await writeFile(process.env.GITHUB_ENV, Object.entries(env).map(([key, value]) => `${key}=${value}\n`).join(''), { flag: 'a' });
    if (process.env.GITHUB_PATH) await writeFile(process.env.GITHUB_PATH, path.dirname(node) + '\n', { flag: 'a' });
  }
  return { runtime, node, env };
}
export async function build(target, version, profile = releaseProfile) {
  const info = targetInfo(target);
  assert(/^\d+\.\d+\.\d+-beta\.\d+\.\d+$/.test(version), 'Only uniquely numbered beta packages are supported');
  const { mcpRegistry } = await import('../mcp.ts');
  const registry = mcpRegistry(profile);
  const directory = path.join(root, 'dist', version), name = `OpenMotion-Codex-${version}-${target}`;
  const stage = path.join(directory, name), runtime = path.join(root, '.artifacts', 'test-runtime', target, 'runtime');
  await mkdir(directory, { recursive: true }); await mkdir(stage);
  for (const file of await distributionFiles(profile)) {
    await mkdir(path.dirname(path.join(stage, file)), { recursive: true });
    await cp(path.join(root, file), path.join(stage, file));
  }
  await writeFile(path.join(stage, 'shared/mcp-release.json'), JSON.stringify({ profile }, null, 2) + '\n');
  await cp(runtime, path.join(stage, 'runtime'), { recursive: true, verbatimSymlinks: true });
  for (const file of ['package.json', 'package-lock.json', '.codex-plugin/plugin.json']) {
    const filename = path.join(stage, file), json = JSON.parse(await readFile(filename, 'utf8'));
    json.version = version; if (json.packages?.['']) json.packages[''].version = version;
    await writeFile(filename, JSON.stringify(json, null, 2) + '\n');
  }
  const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : '../lib/node_modules/npm/bin/npm-cli.js');
  await run(process.execPath, [npm, 'ci', `--os=${info.platform}`, `--cpu=${info.arch}`, '--omit=dev', '--ignore-scripts', '--bin-links=false', '--no-audit', '--no-fund'], { cwd: stage });
  for (const name of [`@esbuild/${info.platform}-${info.arch}`, `@img/sharp-${info.platform}-${info.arch}`, ...(info.platform === 'darwin' ? [`@img/sharp-libvips-${info.platform}-${info.arch}`] : [])]) {
    await access(path.join(stage, 'node_modules', name, 'package.json'));
  }
  const bootstrap = await readFile(path.join(root, 'scripts/bundle/bootstrap.mjs'), 'utf8');
  await writeFile(path.join(stage, 'bootstrap.mjs'), bootstrap);
  await mkdir(path.join(stage, 'scripts'), { recursive: true });
  for (const file of ['run-mcp.sh', 'run-mcp.cmd', 'install.command', 'install.ps1', 'configure-plugin.mjs']) await cp(path.join(root, 'scripts/bundle', file), path.join(stage, 'scripts', file));
  const mcp = JSON.parse(await readFile(path.join(root, '.mcp.json'), 'utf8'));
  Object.assign(mcp.mcpServers.motion, info.platform === 'win32' ? { command: 'cmd.exe', args: ['/d', '/s', '/c', 'scripts\\run-mcp.cmd'] } : { command: '/bin/sh', args: ['scripts/run-mcp.sh'] });
  await writeFile(path.join(stage, '.mcp.json'), JSON.stringify(mcp, null, 2) + '\n');
  const catalog = JSON.parse(await readFile(path.join(root, 'marketplace.example.json'), 'utf8'));
  catalog.name = 'openmotion-test'; catalog.interface.displayName = 'OpenMotion test packages';
  catalog.plugins[0].source.path = './plugin';
  for (const item of ['.codex-plugin', 'skills', 'docs', 'README.md', 'AGENTS.md', 'CLAUDE.md']) await cp(path.join(stage, item), path.join(stage, 'plugin', item), { recursive: true });
  await writeFile(path.join(stage, 'plugin/.mcp.json'), JSON.stringify({ mcpServers: {} }) + '\n');
  await mkdir(path.join(stage, '.agents/plugins'), { recursive: true });
  await writeFile(path.join(stage, '.agents/plugins/marketplace.json'), JSON.stringify(catalog, null, 2) + '\n');
  const commit = await new Promise((resolve, reject) => {
    const child = spawn('git', ['rev-parse', 'HEAD'], { cwd: root }); let value = '';
    child.stdout.on('data', chunk => { value += chunk; }); child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve(value.trim()) : reject(new Error('git rev-parse failed')));
  });
  const metadata = { schemaVersion: 1, version, channel: 'prerelease', commit, run: process.env.GITHUB_RUN_ID || null,
    mcp: { profile, tools: registry.tools.map(tool => tool.name) },
    attempt: process.env.GITHUB_RUN_ATTEMPT || '1', target, minimumOS: info.minimumOS, builtOn: `${process.platform}-${process.arch}`,
    runtime: { node: lock.node, chromium: lock.chromium, ffmpeg: lock.ffmpeg, hyperframes: lock.hyperframes } };
  await writeFile(path.join(stage, 'release.json'), JSON.stringify(metadata, null, 2) + '\n');
  await cp(path.join(root, 'docs/test-packages.md'), path.join(stage, 'INSTALL.md'));
  const archive = path.join(directory, name + '.zip');
  await run('zip', ['-q', '-r', '-y', '-UN=UTF8', archive, name], { cwd: directory, env: { ...process.env, ...(process.platform === 'linux' ? { LC_ALL: 'C.UTF-8' } : {}) } });
  const sum = await sha256(archive);
  await writeFile(archive + '.sha256', `${sum}  ${path.basename(archive)}\n`);
  const result = { ...metadata, files: [{ name: path.basename(archive), sha256: sum, platform: target.split('-')[0], arch: info.arch, kind: 'archive' }] };
  await writeFile(path.join(directory, `release-${target}.json`), JSON.stringify(result, null, 2) + '\n');
  return { archive, stage, ...result };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, target, version, profile] = process.argv.slice(2);
  if (command === 'prepare') console.log(JSON.stringify(await prepare(target)));
  else if (command === 'build') console.log(JSON.stringify(await build(target, version, profile)));
  else if (command === 'version') console.log(testVersion(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version, target, version));
  else throw new Error('Usage: test-package.mjs prepare <target> | build <target> <beta-version> [legacy|phase1] | version <run> <attempt>');
}

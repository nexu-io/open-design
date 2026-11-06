import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { run, sha256, tar } from './test-package.mjs';

export async function testPort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port <= 65526 ? port : testPort();
}

export async function smoke(archive, codexJS, preparedBundle) {
  archive = path.resolve(archive); codexJS = path.resolve(codexJS);
  // Windows browser launch fails beyond MAX_PATH; test a fresh, realistic install location.
  const out = preparedBundle ? path.dirname(path.dirname(preparedBundle)) : await realpath(await mkdtemp(path.join(tmpdir(), 'om-smoke-')));
  const expanded = path.join(out, 'fresh 中文 path');
  await mkdir(expanded, { recursive: true });
  if (!preparedBundle) {
    console.error('Extract final ZIP to: ' + expanded);
    await run(tar, ['-xf', archive, '-C', expanded]);
    console.error('Final ZIP extracted');
  }
  const bundle = path.join(expanded, path.basename(archive).replace(/(?:\.zip)+$/i, ''));
  const metadata = JSON.parse(await readFile(path.join(bundle, 'release.json'), 'utf8'));
  assert.equal(metadata.target, process.platform === 'darwin' && process.arch === 'arm64' ? 'mac-arm64' : process.platform === 'win32' && process.arch === 'x64' ? 'win-x64' : '', 'Run acceptance on the target OS/CPU');
  const node = path.join(bundle, 'runtime/node', process.platform === 'win32' ? 'node.exe' : 'bin/node');
  if (!preparedBundle) {
    await run(node, [fileURLToPath(import.meta.url), archive, codexJS, bundle]);
    return JSON.parse(await readFile(path.join(path.dirname(archive), `smoke-${metadata.target}.json`), 'utf8'));
  }
  assert.equal(path.resolve(preparedBundle), bundle);
  const data = path.join(out, 'user-projects'), profile = path.join(out, 'isolated-codex');
  await mkdir(profile, { recursive: true });
  await writeFile(path.join(profile, 'config.toml'), 'cli_auth_credentials_store = "file"\nmcp_oauth_credentials_store = "file"\n');
  const env = { ...process.env, CODEX_HOME: profile, MOTION_DATA_DIR: data, PORT: process.env.D4_LANE_PORT_RANGE?.split('-')[0] || process.env.SEATS_PORT || process.env.PORT || String(await testPort()) };
  await run(node, ['--import', './bootstrap.mjs', '-e', 'console.log("Bundled runtime ready")'], { cwd: bundle, env });
  await run(node, ['scripts/configure-plugin.mjs'], { cwd: bundle, env });
  const timings = {};
  const cli = (args, timeout = 120_000) => {
    const command = args.slice(0, 3).join(' '), started = Date.now();
    console.error(`Codex ${command}: starting`);
    const result = spawnSync(process.execPath, [codexJS, ...args], { env, encoding: 'utf8', timeout });
    timings[command] = (Date.now() - started) / 1000;
    if (result.error) throw new Error(`Codex ${command}: ${result.error.message}`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    console.error(`Codex ${command}: passed in ${timings[command]}s`);
    return result.stdout;
  };
  cli(['--version']);
  cli(['plugin', 'marketplace', 'add', bundle]);
  cli(['plugin', 'add', 'motion@openmotion-test'], 600_000);
  const installed = JSON.parse(cli(['mcp', 'get', 'motion', '--json']));
  assert(installed.enabled && installed.transport.type === 'stdio');
  const transport = installed.transport;
  assert.equal(path.resolve(transport.cwd), path.resolve(bundle));
  assert.equal(path.resolve(transport.command), path.resolve(node));
  const processEnv = { ...env, ...(transport.env || {}), PATH: process.platform === 'win32' ? `${process.env.SystemRoot}\\System32` : '/usr/bin:/bin' };
  return acceptTransport({ transport, env: processEnv, data, metadata, archive, timings,
    ffmpeg: path.join(bundle, 'runtime/media/bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
    reportFile: path.join(path.dirname(archive), `smoke-${metadata.target}.json`) });
}

export function protocolClient(transport, env) {
  const child = spawn(transport.command, transport.args, { cwd: transport.cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let seq = 0, stderr = ''; const pending = new Map();
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
  const listeners = new Map();
  const failPending = error => {
    for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(error); }
    pending.clear(); listeners.clear();
  };
  child.on('error', failPending);
  child.on('exit', code => failPending(new Error(`MCP exited ${code}: ${stderr}`)));
  createInterface({ input: child.stdout }).on('line', line => {
    try { const value = JSON.parse(line); listeners.get(value.id)?.(value); }
    catch (error) { failPending(error); }
  });
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq, timer = setTimeout(() => { listeners.delete(id); pending.delete(id); reject(new Error(`${method} timed out: ${stderr}`)); }, 240_000);
    pending.set(id, { reject, timer });
    listeners.set(id, reply => { clearTimeout(timer); listeners.delete(id); pending.delete(id); reply.error ? reject(new Error(JSON.stringify(reply.error))) : resolve(reply.result); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  return { child, rpc, getStderr: () => stderr };
}

export async function acceptTransport({ transport, env, data, metadata, archive, ffmpeg, reportFile, timings = {}, deferredNativeDirectory, installation = {} }) {
  const { child, rpc, getStderr } = protocolClient(transport, env);
  const tool = async (name, args = {}) => {
    if (name !== 'motion_get_project') console.error(`MCP ${name}: starting`);
    const result = await rpc('tools/call', { name, arguments: args });
    assert(!result.isError, JSON.stringify(result));
    if (name !== 'motion_get_project') console.error(`MCP ${name}: passed`);
    return result.structuredContent;
  };
  let preview, registration;
  try {
    const hello = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'OpenMotion-package-smoke', version: '1' } });
    assert.equal(hello.serverInfo.version, metadata.version);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const tools = await rpc('tools/list', {}); assert.equal(tools.tools.length, 9); assert.deepEqual(tools.tools.map(item => item.name), metadata.mcp.tools);
    await rpc('resources/read', { uri: 'motion://workflow/production/start' });
    await rpc('resources/read', { uri: 'motion://engine/SKILL.md' });
    const hidden = await rpc('tools/call', { name: 'motion_write_files', arguments: {} });
    assert.equal(hidden.structuredContent.error.code, 'MCP_TOOL_NOT_EXPOSED');
    if (deferredNativeDirectory) await assert.rejects(access(deferredNativeDirectory), { code: 'ENOENT' });
    const created = await tool('motion_create_project', { requestId: 'smoke-create', projectType: 'natural_language', title: 'Packaged smoke', requirements: '真实音视频原生导出检查' });
    preview = await tool('motion_open_preview', { projectId: created.projectId });
    registration = JSON.parse(await readFile(path.join(data, 'preview.json'), 'utf8'));
    assert(Number.isInteger(registration.pid) && registration.pid > 0, 'Capture ownership before later preview reuse rewrites the registration');
    assert.equal(path.resolve(preview.dataDirectory), path.resolve(data));
    console.error('Studio GET: ' + preview.previewUrl);
    const page = await fetch(preview.previewUrl, { signal: AbortSignal.timeout(10_000) }).catch(error => { throw new Error('Studio GET failed: ' + preview.studioUrl, { cause: error }); });
    assert.equal(page.status, 200);
    console.error('Studio GET: passed');
    const project = await tool('motion_get_project', { projectId: preview.projectId });
    await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-y', path.join(project.project.directory, 'assets/tone.wav')]);
    const current = await tool('motion_get_project', { projectId: preview.projectId });
    const html = '<!doctype html><html><head><meta charset="utf-8"><script src="assets/gsap.min.js"></script><style>body{margin:0}#main{position:relative;width:320px;height:180px;overflow:hidden;background:#d3e7ae}#box{position:absolute;top:60px;left:20px;width:40px;height:40px;background:#203021}</style></head><body><div id="main" data-composition-id="main" data-start="0" data-duration="1" data-width="320" data-height="180" data-fps="24"><div id="box"></div><audio id="tone" class="clip" src="assets/tone.wav" data-start="0" data-duration="1" data-track-index="1" data-volume="0.3"></audio></div><script>const tl=gsap.timeline({paused:true});tl.fromTo("#box",{x:0},{x:200,duration:1,ease:"none"},0);window.__timelines={main:tl};</script></body></html>';
    const saved = await tool('motion_edit_project', { projectId: current.projectId, requestId: 'smoke-edit', expectedRevision: current.revision, expectedVersionId: current.currentVersionId, files: [{ path: 'index.html', content: html }] });
    const requested = await tool('motion_export_request', { projectId: current.projectId, requestId: 'smoke-export', expectedRevision: saved.revision, versionId: saved.version.versionId, audio: 'required' });
    const deadline = Date.now() + 180_000; let exported;
    do {
      exported = (await tool('motion_get_project', { projectId: current.projectId, exportJobId: requested.job.id })).exportJob;
      assert.notEqual(exported?.state, 'failed', JSON.stringify(exported));
      if (exported?.state === 'completed') break;
      await new Promise(resolve => setTimeout(resolve, 500));
    } while (Date.now() < deadline);
    assert.equal(exported?.state, 'completed', JSON.stringify(exported));
    const verification = exported.verification;
    assert.equal(verification.status, 'passed', JSON.stringify(verification));
    const frames = spawnSync(ffmpeg, ['-v', 'error', '-i', exported.path, '-map', '0:v:0', '-an', '-vf', 'select=eq(n\\,0)+eq(n\\,12)', '-fps_mode', 'passthrough', '-f', 'framemd5', '-'], { encoding: 'utf8', timeout: 30_000 });
    assert.equal(frames.status, 0, frames.stderr);
    const hashes = frames.stdout.split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1).trim());
    assert.equal(hashes.length, 2); assert.notEqual(hashes[0], hashes[1], 'Video must contain actual motion');
    const download = await fetch(exported.downloadUrl); assert.equal(download.status, 200);
    const report = { ...installation, version: metadata.version, commit: metadata.commit, target: metadata.target,
      sha256: await sha256(archive), nativeCodexInstall: 'passed', minimalPATH: 'passed', mcpTools: tools.tools.length,
      phase1Contract: 'passed', studio: 'passed', realVideo: 'passed', motionFrames: 'passed', verification,
      timings, modelTurn: 'not_run', independentPlayer: 'not_run' };
    await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    return report;
  } catch (error) {
    for (const name of ['preview.log', 'studio.log']) {
      const log = await readFile(path.join(data, name), 'utf8').catch(() => '(not created)');
      console.error(`${name}:\n${log.slice(-16000)}`);
    }
    console.error('MCP stderr: ' + getStderr());
    throw error;
  } finally {
    child.stdin.end();
    if (preview && registration) {
      const health = await fetch(`http://127.0.0.1:${registration.port}/api/health`, { signal: AbortSignal.timeout(5000) }).then(response => response.json()).catch(() => null);
      if (registration.version === metadata.version && health?.service === 'motion-preview' && health.version === metadata.version && path.resolve(health.dataDirectory) === path.resolve(data)) {
        if (process.platform === 'win32') {
          const stopped = spawnSync(path.join(process.env.SystemRoot, 'System32/taskkill.exe'), ['/pid', String(registration.pid), '/t', '/f'], { stdio: 'ignore', timeout: 15_000 });
          assert.equal(stopped.status, 0, 'Failed to stop the preview process owned by this test');
        }
        else process.kill(registration.pid, 'SIGTERM');
      }
    }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await smoke(...process.argv.slice(2));

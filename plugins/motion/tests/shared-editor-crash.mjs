// Fault injection through the production MCP entry: kill only its daemon, then observe before test cleanup.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from './shared-editor-client.mjs';
import { readEditor as readRegistry, editorRequest } from '../editor-runtime.ts';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const request = (registry, route, body, timeout) => editorRequest(registry, '/editor-api' + route, body, timeout);

assert.equal(process.platform, 'darwin', 'This process-observation check uses macOS ps output');
const evidence = process.env.OPENMOTION_CRASH_EVIDENCE || fileURLToPath(new URL('../.artifacts/shared-editor-crash/', import.meta.url));
await mkdir(evidence, { recursive: true });
const summary = { scope: 'SIGKILL during real rendering; production Studio owner lifecycle regression', startedAt: new Date().toISOString(), node: process.version, cases: [], status: 'failed' };
const identity = p => `${p.pid}:${p.started}`;
const live = p => !p.state.startsWith('Z');

function processes() {
  const output = execFileSync('ps', ['-ww', '-axo', 'pid=,ppid=,pgid=,lstart=,state=,command='], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return output.trimEnd().split('\n').map(line => {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(\S+)\s+(.*)$/);
    assert.ok(m, `Unexpected ps record: ${line.slice(0, 80)}`);
    return { pid: Number(m[1]), ppid: Number(m[2]), pgid: Number(m[3]), started: m[4], state: m[5], command: m[6] };
  });
}
assert.ok(processes().some(p => p.pid === process.pid && p.command.includes(path.basename(fileURLToPath(import.meta.url)))), 'ps parser must find this runner');

function role(p) {
  if (/owned-studio\.mjs --owner /.test(p.command)) return 'studio-owner';
  if (/hyperframes\.mjs preview /.test(p.command)) return 'studio';
  if (/hyperframes\.mjs render /.test(p.command)) return 'renderer';
  if (/Google Chrome|chrome-headless|chromium|chrome_crashpad/.test(p.command)) return 'chrome';
  if (/(?:^|\/)ffmpeg(?:\s|$)/.test(p.command)) return 'ffmpeg';
  if (/editor-daemon\.ts --serve /.test(p.command)) return 'daemon';
  return 'helper';
}
const counts = records => Object.fromEntries(['daemon', 'studio-owner', 'studio', 'renderer', 'chrome', 'ffmpeg', 'helper'].map(r => [r, records.filter(p => p.role === r && live(p)).length]));
async function json(filename) { return JSON.parse(await readFile(filename, 'utf8')); }
async function size(filename) { return stat(filename).then(s => s.size, () => 0); }

async function run(stage) {
  const root = await mkdtemp(path.join(evidence, `${stage}-`));
  const known = new Map(), profiles = new Set(), ownedGroups = new Set();
  const clients = [new Client(root, { legacy: true })];
  const result = { stage, dataDirectory: root, snapshots: [], status: 'failed', observationWindowMs: 10_000 };
  let registry, oldDaemon, killedAt, projectId, jobId, previewUrl;
  function discover() {
    const all = processes(), selected = new Map();
    for (const p of all) {
      if (known.has(identity(p)) || p.command.includes(root) || [...profiles].some(profile => p.command.includes(profile)) || ownedGroups.has(p.pgid)) {
        // Direct roots must be actual daemon / engine processes, never this test's shell command.
        if (known.has(identity(p)) || ['studio-owner', 'studio', 'renderer', 'chrome', 'ffmpeg', 'daemon'].includes(role(p)) || ownedGroups.has(p.pgid)) selected.set(p.pid, p);
      }
    }
    let changed;
    do {
      changed = false;
      for (const p of all) if (!selected.has(p.pid) && selected.has(p.ppid)) { selected.set(p.pid, p); changed = true; }
    } while (changed);
    for (const p of selected.values()) {
      p.role = role(p); known.set(identity(p), p);
      if (p.pid === p.pgid) ownedGroups.add(p.pgid);
      const profile = p.command.match(/--user-data-dir=("[^"]+"|\S+)/)?.[1];
      if (profile) profiles.add(profile.replace(/^"|"$/g, ''));
    }
    return [...selected.values()];
  }
  function snapshot(phase) {
    const owned = discover();
    const record = { phase, at: new Date().toISOString(), msAfterKill: killedAt ? Date.now() - killedAt : null, counts: counts(owned), processes: owned };
    result.snapshots.push(record); return record;
  }
  try {
    await clients[0].initialize(); await clients[0].call('motion_open_preview'); registry = await readRegistry(root);
    oldDaemon = await request(registry, '/health');
    assert.equal(oldDaemon.dataDirectory, root);
    const project = await clients[0].call('motion_get_project');
    projectId = project.projectId;
    const html = `<!doctype html><html><head><meta charset="utf-8"><script src="assets/gsap.min.js"></script><style>body{margin:0}#main{width:1280px;height:720px;overflow:hidden;background:#f3efe4;color:#0078b4;font:800 72px Arial;position:relative}#pattern{position:absolute;inset:-500px;background:repeating-conic-gradient(#0078b4 0% 25%,#ff4fa5 0% 50%) 0 0/53px 53px;opacity:.45}#label{position:absolute;top:260px;left:60px}</style></head><body><div id="main" data-composition-id="main" data-start="0" data-duration="12" data-width="1280" data-height="720" data-fps="30"><div id="pattern"></div><div id="label">CRASH RECOVERY TEST</div></div><script>window.__timelines={main:gsap.timeline({paused:true}).fromTo('#label',{x:0},{x:250,duration:12,ease:'none'}).to('#pattern',{x:300,rotation:40,duration:12,ease:'none'},0)};</script></body></html>`;
    await clients[0].call('motion_write_files', { projectId, expectedRevision: project.revision, files: [{ path: 'index.html', content: html }] });
    const publicPreview = await clients[0].call('motion_open_preview', { projectId });
    result.publicPreviewUrl = publicPreview.previewUrl;
    previewUrl = (await (await fetch(new URL('/api/health', publicPreview.previewUrl))).json()).nativeStudioUrl;
    assert.ok(previewUrl, 'Observe the native Studio URL, not only the killed proxy');
    const current = await clients[0].call('motion_get_project', { projectId });
    const submitted = await clients[0].call('motion_request_export', { projectId, expectedRevision: current.revision });
    jobId = submitted.job.id;
    const jobFile = path.join(root, 'export.json');
    const archive = path.join(root, 'jobs', jobId, 'job.json');
    const output = path.join(root, 'exports', jobId + '.mp4');
    const deadline = Date.now() + 90_000;
    let before;
    while (Date.now() < deadline) {
      const owned = discover(), job = await json(jobFile);
      const n = counts(owned);
      const activeChromePage = owned.some(p => p.role === 'chrome' && live(p) && p.command.includes('--type=renderer'));
      const encoder = owned.find(p => p.role === 'ffmpeg' && live(p) && /(?:-i |pipe:|rawvideo)/.test(p.command));
      const encoderOutput = encoder?.command.match(/\s(\/\S+\.mp4)\s*$/)?.[1];
      const encoderBytes = encoderOutput ? await size(encoderOutput) : 0;
      const activeEncoder = encoderBytes > 48;
      if (job.state === 'running' && n.studio > 0 && n.renderer > 0 && (stage === 'ffmpeg-encode' ? activeEncoder : activeChromePage)) {
        before = { phase: 'before-kill', at: new Date().toISOString(), msAfterKill: null, counts: n, processes: owned };
        result.snapshots.push(before); result.jobBeforeKill = job;
        result.encoderAtKill = encoder ? { pid: encoder.pid, output: encoderOutput, bytes: encoderBytes } : null;
        break;
      }
      assert.notEqual(job.state, 'failed', job.error);
      if (job.state === 'completed') throw new Error(`${stage} injection point missed: export already completed`);
      await pause(40);
    }
    assert.ok(before, `${stage} real process was not observed while job was running`);
    const daemonProcess = before.processes.find(p => p.pid === oldDaemon.pid);
    assert.ok(daemonProcess && daemonProcess.command.includes(root));
    result.identityBefore = oldDaemon; result.projectId = projectId; result.jobId = jobId;
    result.outputBytesBeforeKill = await size(output);
    if (stage === 'studio-unresponsive') {
      result.stoppedStudioPid = before.processes.find(p => p.role === 'studio').pid;
      process.kill(result.stoppedStudioPid, 'SIGSTOP');
      snapshot('studio-paused-to-exercise-sigkill-escalation');
    }
    killedAt = Date.now(); process.kill(oldDaemon.pid, 'SIGKILL');
    console.log(`INJECT ${stage}: SIGKILL daemon ${oldDaemon.pid}; processes=${JSON.stringify(before.counts)}`);
    await pause(250);
    snapshot('250ms-after-kill-before-reconnect');
    result.diskJobBeforeReconnect = await json(jobFile);
    if (stage === 'chrome-capture') {
      await pause(Math.max(0, killedAt + 3000 - Date.now()));
      const record = snapshot('cleanup-without-any-reconnect');
      result.cleanupWithoutReconnectPassed = record.processes.filter(live).length === 0;
    }
    const replacements = Array.from({ length: 4 }, () => new Client(root, { legacy: true })); clients.push(...replacements);
    const reconnectStarted = Date.now();
    await Promise.all(replacements.map(c => c.initialize()));
    const identities = await Promise.all(replacements.map(async c => { await c.call('motion_get_project', { projectId }); return request(await readRegistry(root), '/health'); }));
    result.reconnectElapsedMs = Date.now() - reconnectStarted;
    assert.equal(new Set(identities.map(i => i.instanceId)).size, 1);
    assert.notEqual(identities[0].instanceId, oldDaemon.instanceId);
    registry = await readRegistry(root); result.identityAfter = identities[0];
    const recovered = await replacements[0].call('motion_get_export', { projectId, jobId });
    result.recoveredJob = recovered.job;
    result.persistedJob = await json(jobFile); result.persistedArchive = await json(archive);
    assert.equal(recovered.job.id, jobId); assert.equal(recovered.job.projectId, projectId);
    assert.equal(recovered.job.state, 'failed');
    assert.match(recovered.job.error, /restarted|interrupted/i);
    assert.equal(result.persistedJob.state, 'failed'); assert.equal(result.persistedArchive.state, 'failed');
    for (const job of [result.persistedJob, result.persistedArchive]) { assert.ok(!('workerPid' in job)); assert.ok(!('token' in job)); }
    result.jobRecoveryPassed = true;
    result.totalStarts = (await readFile(path.join(root, '.editor-runtime', 'starts.jsonl'), 'utf8')).trim().split('\n').length;
    assert.equal(result.totalStarts, 2);
    const afterReconnect = snapshot('after-four-client-reconnect');
    if (stage === 'studio-unresponsive') {
      assert.ok(result.reconnectElapsedMs >= 4000, 'Replacement must wait for the old owner to finish forced cleanup');
      assert.equal(afterReconnect.counts.studio, 0);
      assert.equal(afterReconnect.counts['studio-owner'], 0);
      result.guardLockWaitPassed = true;
    }
    for (const offset of [3000, 10_000]) {
      await pause(Math.max(0, killedAt + offset - Date.now()));
      snapshot(`${offset}ms-after-kill`);
      result[`outputBytesAt${offset}ms`] = await size(output);
      result[`jobAt${offset}ms`] = (await replacements[0].call('motion_get_export', { projectId, jobId })).job;
    }
    const last = result.snapshots.at(-1);
    const oldIdentities = new Set(before.processes.map(identity));
    const old = last.processes.filter(p => oldIdentities.has(identity(p)) && live(p));
    result.survivorsBeforeHarnessCleanup = old;
    result.automaticChildCleanupPassed = old.length === 0 && result.cleanupWithoutReconnectPassed !== false;
    result.oldPreviewStillResponds = await fetch(new URL('/__hyperframes_config', previewUrl), { signal: AbortSignal.timeout(1500) }).then(r => r.ok, () => false);
    assert.equal(result.jobAt10000ms.state, 'failed');
    assert.equal(result.oldPreviewStillResponds, false, 'Old native Studio must be unreachable');
    result.status = result.automaticChildCleanupPassed ? 'passed' : 'failed-child-cleanup';
    console.log(`RESULT ${stage}: task=failed (correct), oldChildrenAt10s=${JSON.stringify(counts(old))}, oldStudioResponds=${result.oldPreviewStillResponds}`);
  } catch (error) {
    result.error = error.stack; console.error(error.stack);
  } finally {
    // This cleanup is test hygiene, never counted as product recovery. Never use pkill or a global browser kill.
    await Promise.all(clients.map(c => c.close().catch(() => {})));
    if (registry) await request(registry, '/shutdown', {}, 5000).catch(() => {});
    const signals = [];
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      for (const p of discover().filter(live)) {
        const current = processes().find(item => identity(item) === identity(p));
        if (!current || !live(current)) continue;
        assert.notEqual(current.pid, process.pid);
        try { process.kill(current.pid, signal); signals.push({ pid: current.pid, started: current.started, role: role(current), signal }); }
        catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
      await pause(signal === 'SIGTERM' ? 2000 : 500);
    }
    result.harnessCleanup = { signals, remaining: snapshot('after-harness-cleanup').processes.filter(live) };
    assert.equal(result.harnessCleanup.remaining.length, 0, 'Test-owned processes must be removed');
    result.clientTraces = clients.map(c => c.trace);
    // Export records are evidence; redact ownership tokens that are irrelevant to the comparison.
    for (const key of ['jobBeforeKill', 'diskJobBeforeReconnect']) if (result[key]) delete result[key].token;
    await writeFile(path.join(root, 'crash-result.json'), JSON.stringify(result, null, 2));
    summary.cases.push(result);
    await writeFile(path.join(evidence, 'result.json'), JSON.stringify(summary, null, 2));
  }
}

await run('chrome-capture');
await run('ffmpeg-encode');
await run('studio-unresponsive');
summary.finishedAt = new Date().toISOString();
summary.status = summary.cases.every(c => c.status === 'passed') ? 'passed' : 'failed';
await writeFile(path.join(evidence, 'result.json'), JSON.stringify(summary, null, 2));
if (summary.status !== 'passed') process.exitCode = 1;

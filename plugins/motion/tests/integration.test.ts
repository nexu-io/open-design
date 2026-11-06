import test from 'node:test';
import { Client } from './shared-editor-client.mjs';
import { sharedEditorEnabled } from '../editor-runtime.ts';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startServer } from '../server.ts';
import { callTool } from '../mcp.ts';
import { delay } from '../hyperframes.ts';
import { fixture } from './fixtures.ts';

const ffmpeg = process.env.HYPERFRAMES_FFMPEG_PATH || process.env.FFMPEG_PATH || 'ffmpeg';
const chrome = process.env.HYPERFRAMES_BROWSER_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
const canRender = existsSync(chrome) && spawnSync(ffmpeg, ['-version']).status === 0;

test('cold export preserves source revision without starting Studio, then preview upgrades the same service', { skip: !canRender, timeout: 180_000 }, () => fixture(async store => {
  await store.writeFiles((await store.get()).revision, [{ path: 'index.html', content: '<!doctype html><html><head><script src="assets/gsap.min.js"></script><style>body{margin:0}#main{width:320px;height:180px;background:#2f6feb}</style></head><body><div id="main" data-composition-id="main" data-start="0" data-duration="0.5" data-width="320" data-height="180" data-fps="24"></div><script>window.__timelines={main:gsap.timeline({paused:true})};</script></body></html>' }]);
  const before = await store.get();
  const running = await startServer(store, 0, { editor: false });
  const address = running.server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  await writeFile(path.join(store.directory, 'preview.json'), JSON.stringify({ port: address.port }));
  try {
    assert.deepEqual(await store.get(), before);
    const requested = await callTool('motion_request_export', { expectedRevision: before.revision }, store);
    const deadline = Date.now() + 120_000;
    let result = await callTool('motion_get_export', {}, store);
    while (result.job && ['pending', 'running'].includes(result.job.state) && Date.now() < deadline) { await delay(300); result = await callTool('motion_get_export', {}, store); }
    assert.equal(result.job!.state, 'completed', result.job!.error);
    assert.equal(result.job!.id, requested.job!.id); assert.equal(result.job!.revision, before.revision);
    assert.deepEqual(await store.get(), before, 'rendering must not stamp or normalize the active source');
    assert.equal(running.studio, undefined);
    assert.equal((await callTool('motion_verify_export', { jobId: result.job!.id, expectedRevision: before.revision, audio: 'silent' }, store)).status, 'passed');
    await store.writeFiles(before.revision, [{ path: 'notes.md', content: 'real concurrent user edit' }]);
    await assert.rejects(callTool('motion_request_export', { expectedRevision: before.revision }, store), /重新读取 revision/);
    assert.equal((await store.job())!.id, requested.job!.id);
    const opened = await callTool('motion_open_preview', {}, store);
    assert.equal(new URL(opened.previewUrl!).port, String(address.port)); assert.ok(running.studio?.alive());
    assert.equal((await store.readFile('notes.md')).content, 'real concurrent user edit');
    assert.equal((await (await fetch(base + '/api/health')).json()).editorReady, true);
  } finally { await running.close(); }
}));

test('real Studio API and MCP share edits; background export contains video, audio and exact native dimensions', { skip: !canRender, timeout: 180_000 }, () => fixture(async store => {
  // Exercise a short native composition with seekable GSAP and a real audio track.
  const audio = path.join(store.projectDirectory, 'assets/tone.wav');
  const tone = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-y', audio]);
  assert.equal(tone.status, 0, tone.stderr?.toString());
  const initial = await store.get();
  await store.writeFiles(initial.revision, [{ path: 'index.html', content: `<!doctype html><html><head><meta charset="utf-8"><title>Native integration</title><script src="assets/gsap.min.js"></script><style>body{margin:0}#main{position:relative;width:320px;height:180px;overflow:hidden}#background{position:absolute;inset:0;background:#d3e7ae}#box{position:absolute;top:60px;left:20px;width:40px;height:40px;background:#203021}</style></head><body><div id="main" data-composition-id="main" data-start="0" data-duration="1" data-width="320" data-height="180" data-fps="24"><div id="background"></div><div id="box"></div><audio id="tone" class="clip" src="assets/tone.wav" data-start="0" data-duration="1" data-track-index="1" data-volume="0.3"></audio></div><script>const tl=gsap.timeline({paused:true});tl.fromTo('#box',{x:0},{x:200,duration:1,ease:'none'},0);window.__timelines={main:tl};</script></body></html>` }]);
  const running = await startServer(store, 0);
  const address = running.server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  // Register the actual socket so the MCP export startup reuses this exact service.
  await writeFile(path.join(store.directory, 'preview.json'), JSON.stringify({ port: address.port }));
  try {
    const health = await (await fetch(base + '/api/health')).json(); assert.equal(health.ready, true); assert.equal(health.engineVersion, '0.9.7');
    const nativeBase = new URL(health.studioUrl).origin;
    const studioPage = await fetch(nativeBase); assert.equal(studioPage.status, 200);
    const html = await studioPage.text(); assert.match(html, /assets\/.+\.js/); assert.doesNotMatch(html, /Studio bundle missing/);
    assert.equal(studioPage.headers.get('x-frame-options'), null);
    // The local editor proxy must preserve native uploads, seeking and file-change streams.
    const eventsController = new AbortController();
    const eventsTimeout = setTimeout(() => eventsController.abort(), 15_000);
    const events = fetch(nativeBase + '/api/events', { signal: eventsController.signal });
    void events.catch(() => {});
    try {
      await delay(100);
      const audioBytes = await readFile(audio);
      const form = new FormData();
      form.append('files', new Blob([audioBytes], { type: 'audio/wav' }), 'uploaded.wav');
      const upload = await fetch(nativeBase + '/api/projects/project/upload?dir=assets', { method: 'POST', headers: { Origin: nativeBase }, body: form });
      assert.equal(upload.status, 201);
      assert.deepEqual((await upload.json()).files, ['assets/uploaded.wav']);
      assert.deepEqual(await readFile(path.join(store.projectDirectory, 'assets/uploaded.wav')), audioBytes);
      const range = await fetch(nativeBase + '/api/projects/project/preview/assets/uploaded.wav', { headers: { Range: 'bytes=0-63' } });
      assert.equal(range.status, 206);
      assert.equal(range.headers.get('content-range'), `bytes 0-63/${audioBytes.length}`);
      assert.deepEqual(Buffer.from(await range.arrayBuffer()), audioBytes.subarray(0, 64));
      const response = await events;
      assert.match(response.headers.get('content-type') || '', /text\/event-stream/);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder(); let received = '';
      while (!received.includes('uploaded.wav')) {
        const chunk = await reader.read();
        assert.equal(chunk.done, false, 'native file-change stream ended early');
        received += decoder.decode(chunk.value, { stream: true });
      }
      assert.match(received, /event: file-change/);
      assert.match(received, /"projectId":"project"/);
    } finally { clearTimeout(eventsTimeout); eventsController.abort(); }
    const fileUrl = nativeBase + '/api/projects/project/files/index.html';
    const nativeFile = await (await fetch(fileUrl)).json();
    const before = await store.get();
    const edited = await fetch(fileUrl, { method: 'PUT', headers: { 'Content-Type': 'text/html', 'If-Match': nativeFile.version, Origin: nativeBase }, body: nativeFile.content.replace('Native integration', 'Studio edit') });
    assert.equal(edited.status, 200, await edited.text());
    const agentRead = await callTool('motion_get_project', {}, store); assert.notEqual(agentRead.revision, before.revision); assert.match(agentRead.project!.html!, /Studio edit/);
    await callTool('motion_write_files', { expectedRevision: agentRead.revision, files: [{ path: 'index.html', content: agentRead.project!.html!.replace('Studio edit', 'Agent edit') }] }, store);
    assert.match((await (await fetch(fileUrl)).json()).content, /Agent edit/);
    const revision = (await store.get()).revision;
    const requested = await callTool('motion_request_export', { expectedRevision: revision }, store);
    assert.equal(requested.job!.state, 'pending');
    // No browser is involved. Editing after queuing must not alter the rendered snapshot.
    const oldSource = (await store.get()).project!.html!;
    await store.writeFiles((await store.get()).revision, [{ path: 'index.html', content: oldSource.replace('data-width="320"', 'data-width="640"') }]);
    const deadline = Date.now() + 120_000;
    let result = await callTool('motion_get_export', {}, store);
    while (result.job && ['pending', 'running'].includes(result.job.state) && Date.now() < deadline) { await delay(300); result = await callTool('motion_get_export', {}, store); }
    assert.equal(result.job!.state, 'completed', result.job!.error); assert.equal(result.job!.revision, revision);
    assert.deepEqual(result.job!.expected, { width: 320, height: 180, fps: 24, duration: 1, audio: 'optional' });
    const verified = await callTool('motion_verify_export', { jobId: result.job!.id, expectedRevision: revision, audio: 'required' }, store);
    assert.equal(verified.status, 'passed', JSON.stringify(verified));
    assert.match(verified.sha256!, /^[a-f0-9]{64}$/);
    const output = await readFile(result.path!); assert.equal(output.subarray(4, 8).toString(), 'ftyp');
    const probe = spawnSync(process.env.HYPERFRAMES_FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', result.path!], { encoding: 'utf8' });
    assert.equal(probe.status, 0, probe.stderr);
    const metadata = JSON.parse(probe.stdout), video = metadata.streams.find(stream => stream.codec_type === 'video');
    assert.equal(video.codec_name, 'h264'); assert.equal(video.width, 320); assert.equal(video.height, 180); assert.equal(video.r_frame_rate, '24/1');
    assert.ok(metadata.streams.some(stream => stream.codec_type === 'audio')); assert.ok(Math.abs(Number(metadata.format.duration) - 1) < 0.1);
    const download = await fetch(result.downloadUrl!); assert.equal(download.status, 200); assert.equal(download.headers.get('content-type'), 'video/mp4');
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), output);
    // A rendered second with a deterministic moving square must contain different frames.
    const frames = spawnSync(ffmpeg, ['-v', 'error', '-i', result.path!, '-vf', 'select=eq(n\\,0)+eq(n\\,12)', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 1024 * 1024 });
    assert.equal(frames.status, 0, frames.stderr.toString());
    const size = 320 * 180 * 3; assert.equal(frames.stdout.length, size * 2);
    assert.notDeepEqual(frames.stdout.subarray(0, size), frames.stdout.subarray(size));
  } finally { await running.close(); }
}));

test('production stdio cold export keeps the revision and does not open Studio', { skip: !canRender || !sharedEditorEnabled, timeout: 180_000 }, () => fixture(async store => {
  await store.writeFiles((await store.get()).revision, [{ path: 'index.html', content: '<!doctype html><html><head><script src="assets/gsap.min.js"></script></head><body><div id="main" data-composition-id="main" data-start="0" data-duration="0.5" data-width="320" data-height="180" data-fps="10"></div><script>window.__timelines={main:gsap.timeline({paused:true})};</script></body></html>' }]);
  const before = await store.get(), client = new Client(store.directory);
  try {
    await client.initialize();
    const project = await client.call('motion_get_project', { projectId: 'project' });
    const requested = await client.call('motion_export_request', { projectId: 'project', requestId: 'cold-export', versionId: project.currentVersionId, expectedRevision: before.revision, audio: 'silent' });
    let result;
    const deadline = Date.now() + 120_000;
    do { await delay(200); result = { job: (await client.call('motion_get_project', { projectId: 'project', exportJobId: requested.job.id })).exportJob }; }
    while (['pending', 'running'].includes(result.job.state) && Date.now() < deadline);
    assert.equal(result.job.state, 'completed', result.job.error);
    assert.deepEqual(await store.get(), before);
    assert.equal(existsSync(path.join(store.directory, 'studio.log')), false);
    const verified = result.job.verification;
    assert.equal(verified.status, 'passed');
  } finally { await client.close(); }
}));

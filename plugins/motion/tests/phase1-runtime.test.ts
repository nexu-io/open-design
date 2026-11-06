import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './fixtures.ts';
import { startServer } from '../server.ts';
import { rpc } from '../mcp.ts';
import { delay } from '../hyperframes.ts';

const film = (duration = 1) => `<!doctype html><html><head><meta charset="utf-8"><script src="assets/gsap.min.js"></script><style>body{margin:0}#main{position:relative;width:320px;height:180px;background:#d3e7ae;overflow:hidden}#box{position:absolute;top:60px;left:20px;width:40px;height:40px;background:#203021}</style></head><body><div id="main" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="320" data-height="180" data-fps="10"><div id="box"></div></div><script>const tl=gsap.timeline({paused:true});tl.fromTo('#box',{x:0},{x:200,duration:${duration},ease:'none'},0);window.__timelines={main:tl};</script></body></html>`;

test('real phase1 MCP, active Studio history, confirmed running cancellation and automatically verified MP4', { timeout: 180_000 }, () => fixture(async store => {
  const running = await startServer(store, 0, { editor: false });
  const address = running.server.address(); assert.ok(address && typeof address !== 'string');
  await writeFile(path.join(store.directory, 'preview.json'), JSON.stringify({ port: address.port }));
  const call = async (name: string, args: any = {}) => {
    const response: any = await rpc({ jsonrpc: '2.0', id: crypto.randomUUID(), method: 'tools/call', params: { name, arguments: args } }, store);
    assert.ok(!response.result.isError, JSON.stringify(response)); return response.result.structuredContent;
  };
  const waitFor = async (pid: string, jobId: string, predicate: (job: any) => boolean) => {
    const end = Date.now() + 100_000;
    for (;;) {
      const value = await call('motion_get_project', { projectId: pid, exportJobId: jobId });
      assert.notEqual(value.exportJob.state, 'failed', JSON.stringify(value.exportJob));
      if (predicate(value.exportJob)) return value.exportJob;
      assert.ok(Date.now() < end, JSON.stringify(value.exportJob)); await delay(250);
    }
  };
  try {
    let p = await call('motion_create_project', { requestId: 'create', projectType: 'natural_language', title: 'Runtime smoke', requirements: '静音小方块原生动画' });
    let saved = await call('motion_edit_project', { projectId: p.projectId, requestId: 'long', expectedRevision: p.revision, expectedVersionId: p.version.versionId, files: [{ path: 'index.html', content: film(90) }] });
    p = await call('motion_open_preview', { projectId: p.projectId });
    assert.equal((await fetch(p.previewUrl)).status, 200);
    assert.equal((await call('motion_open_preview')).projectId, p.projectId, 'same MCP client binds only its own session');
    const activeSave = await call('motion_edit_project', { projectId: p.projectId, requestId: 'active-edit', expectedRevision: p.revision, expectedVersionId: p.version.versionId, files: [{ path: 'note.txt', content: 'Studio owns history' }] });
    assert.equal(activeSave.previewSync, 'file_watcher_notified');
    p = await call('motion_get_project', { projectId: p.projectId });
    const long = await call('motion_export_request', { projectId: p.projectId, requestId: 'long-export', expectedRevision: p.revision, versionId: p.version.versionId, audio: 'silent' });
    await waitFor(p.projectId, long.job.id, job => job.stage === 'rendering');
    const cancelled = await call('motion_export_cancel', { projectId: p.projectId, requestId: 'cancel', jobId: long.job.id });
    assert.ok(['cancelling', 'cancelled'].includes(cancelled.job.state));
    const stopped = await waitFor(p.projectId, long.job.id, job => job.state === 'cancelled');
    assert.equal(stopped.state, 'cancelled');
    await assert.rejects(access(path.join(store.directory, 'exports', long.job.id + '.mp4')));
    saved = await call('motion_edit_project', { projectId: p.projectId, requestId: 'short', expectedRevision: p.revision, expectedVersionId: p.version.versionId, files: [{ path: 'index.html', content: film() }] });
    const requested = await call('motion_export_request', { projectId: p.projectId, requestId: 'short-export', expectedRevision: saved.revision, versionId: saved.version.versionId, audio: 'silent' });
    const completed = await waitFor(p.projectId, requested.job.id, job => job.state === 'completed');
    assert.equal(completed.verification.status, 'passed', JSON.stringify(completed.verification));
    assert.equal(completed.expected.width, 320); assert.equal(completed.expected.fps, 10);
    assert.equal((await fetch(completed.downloadUrl)).status, 200);
    assert.ok((await readFile(completed.path)).length > 1000);
    assert.equal((await call('motion_get_project', { projectId: p.projectId, exportJobId: long.job.id })).exportJob.state, 'cancelled');
    assert.equal((await call('motion_export_cancel', { projectId: p.projectId, requestId: 'cancel-completed', jobId: completed.id })).job.state, 'completed');
    const review = await call('motion_export_request', { action: 'record_review', projectId: p.projectId, jobId: completed.id, requestId: 'review', review: { objectId: completed.id, versionId: completed.versionId, source: 'agent', conclusion: 'pending', evidence: 'Technical checks passed; actual playback not yet reviewed' } });
    assert.equal(review.review.verifiedUserAdoption, false); assert.equal(review.changed, false);
  } finally { await running.close(); }
}, false));

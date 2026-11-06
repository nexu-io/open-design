import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from './shared-editor-client.mjs';
import { readEditor as readRegistry, editorRequest } from '../editor-runtime.ts';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const request = (registry, route, body, timeout) => editorRequest(registry, '/editor-api' + route, body, timeout);
import { WorkspaceStore } from '../workspace.ts';
import { randomUUID } from 'node:crypto';
import { verifyExport } from '../scripts/verify-export.ts';

const evidence = process.env.OPENMOTION_MEDIA_EVIDENCE || fileURLToPath(new URL('../.artifacts/shared-editor-media/', import.meta.url));
const root = await mkdtemp(path.join(evidence, 'media-data-'));
const clients = [new Client(root, { legacy: true }), new Client(root, { legacy: true })];
const result = { scope: 'real-local-media-smoke', dataDirectory: root, checks: [], status: 'failed' };
function checked(name, details) { result.checks.push({ name, status: 'passed', ...details }); console.log(`PASS ${name}`); }
let registry;
try {
  await Promise.all(clients.map(client => client.initialize()));
  await clients[0].call('motion_open_preview');
  registry = await readRegistry(root);
  const identities = await Promise.all(clients.map(async client => { await client.call('motion_get_project'); return request(registry, '/health'); }));
  assert.equal(identities[0].instanceId, identities[1].instanceId);
  const project = await clients[0].call('motion_get_project');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Shared editor acceptance</title><script src="assets/gsap.min.js"></script><style>body{margin:0}#main{position:relative;width:320px;height:180px;overflow:hidden;background:#1a1a3a;color:#f4ead3;font:700 28px Arial}#label{position:absolute;left:20px;top:65px}</style></head><body><div id="main" data-composition-id="main" data-start="0" data-duration="1" data-width="320" data-height="180" data-fps="10"><div id="label">ONE EDITOR</div></div><script>window.__timelines={main:gsap.timeline({paused:true}).fromTo('#label',{x:0},{x:40,duration:1,ease:'none'})};</script></body></html>`;
  const edited = await clients[0].call('motion_write_files', { projectId: project.projectId, expectedRevision: project.revision, files: [{ path: 'index.html', content: html }] });
  const previews = await Promise.all(clients.map(client => client.call('motion_open_preview', { projectId: project.projectId })));
  assert.equal(previews[0].previewUrl, previews[1].previewUrl);
  const nativeIdentity = await (await fetch(new URL('/__hyperframes_config', previews[0].previewUrl))).json();
  assert.equal(nativeIdentity.isHyperframes, true); assert.equal(nativeIdentity.projectDir, edited.project.directory);
  checked('two MCP clients reuse the same real Hyperframes Studio', { previewUrl: previews[0].previewUrl, projectId: project.projectId, instanceId: identities[0].instanceId, daemonPid: identities[0].pid, engineVersion: nativeIdentity.version });

  const processes = () => execFileSync('ps', ['-ww', '-axo', 'pid=,command='], { encoding: 'utf8' }).split('\n').map(line => line.match(/^\s*(\d+)\s+(.*)$/)).filter(Boolean).map(m => ({ pid: Number(m[1]), command: m[2] }));
  const oldStudio = processes().find(p => p.command.includes('hyperframes.mjs preview ' + edited.project.directory));
  const oldOwner = processes().find(p => p.command.includes('owned-studio.mjs --owner ' + root) && p.command.includes(edited.project.directory));
  assert.ok(oldStudio && oldOwner);
  process.kill(oldStudio.pid, 'SIGTERM');
  for (let attempt = 0; attempt < 60 && processes().some(p => p.pid === oldOwner.pid); attempt++) await pause(50);
  assert.ok(!processes().some(p => p.pid === oldOwner.pid), 'Owner must notice Studio exit');
  const reopened = await clients[0].call('motion_open_preview', { projectId: project.projectId });
  const newStudio = processes().find(p => p.command.includes('hyperframes.mjs preview ' + edited.project.directory));
  assert.ok(newStudio); assert.notEqual(newStudio.pid, oldStudio.pid);
  assert.equal((await clients[1].call('motion_open_preview', { projectId: project.projectId })).previewUrl, reopened.previewUrl);
  const reopenedIdentity = await (await fetch(new URL('/__hyperframes_config', reopened.previewUrl))).json();
  assert.equal(reopenedIdentity.projectDir, edited.project.directory);
  assert.equal((await request(registry, '/health')).instanceId, identities[0].instanceId);
  checked('Studio exit retires its owner and a fresh preview is shared without restarting the daemon', { oldStudioPid: oldStudio.pid, oldOwnerPid: oldOwner.pid, newPreviewUrl: reopened.previewUrl });

  const catalogStore = new WorkspaceStore(root), otherId = randomUUID();
  await cp(catalogStore.projectDirectory, catalogStore.projectDirectoryFor(otherId), { recursive: true });
  await catalogStore.lock(async () => { await catalogStore.selectProject(otherId, { id: otherId, title: 'Other project' }); await catalogStore.selectProject(project.projectId); });
  await clients[1].call('motion_open_preview', { projectId: otherId });
  assert.equal((await (await fetch(new URL('/__hyperframes_config', reopened.previewUrl))).json()).projectDir, catalogStore.projectDirectoryFor(otherId));
  await clients[0].call('motion_open_preview');
  assert.equal((await (await fetch(new URL('/__hyperframes_config', reopened.previewUrl))).json()).projectDir, edited.project.directory);
  assert.equal((await clients[1].call('motion_get_project')).projectId, otherId);
  checked('preview selects the connection project while another MCP keeps its own binding', { firstProject: project.projectId, secondProject: otherId });

  const current = await clients[0].call('motion_get_project', { projectId: project.projectId });
  const submitted = await clients[0].call('motion_request_export', { projectId: project.projectId, expectedRevision: current.revision });
  assert.equal(submitted.job.state, 'pending');
  const during = await clients[1].call('motion_get_export', { projectId: project.projectId, jobId: submitted.job.id });
  assert.ok(['pending', 'running'].includes(during.job.state));
  await assert.rejects(request(registry, '/shutdown', {}), /active work/);
  checked('explicit shutdown is refused while the real export is active', { state: during.job.state });
  await Promise.all(clients.map(client => client.close()));
  const next = new Client(root, { legacy: true }); clients.push(next); await next.initialize();
  assert.equal((await request(await readRegistry(root), '/health')).instanceId, identities[0].instanceId);
  let exported;
  for (let attempt = 0; attempt < 180; attempt++) {
    exported = await next.call('motion_get_export', { projectId: project.projectId, jobId: submitted.job.id });
    if (['completed', 'failed'].includes(exported.job.state)) break;
    await pause(500);
  }
  assert.equal(exported.job.state, 'completed', exported.job.error);
  checked('real export continues after every original MCP process exits', { stateAtDisconnect: during.job.state, jobId: submitted.job.id, projectId: project.projectId, revision: current.revision, output: exported.path });
  const verification = await verifyExport(exported.path, { ...exported.job.expected, audio: 'silent' });
  await writeFile(path.join(evidence, 'media-technical-verification.json'), JSON.stringify(verification, null, 2));
  assert.equal(verification.status, 'passed', JSON.stringify(verification));
  checked('existing verifier passes metadata, full decode and seeks on the MP4', { sha256: verification.sha256, expected: verification.expected });
  result.output = exported.path; result.projectId = project.projectId; result.previewUrl = reopened.previewUrl;
  result.status = 'passed';
} catch (error) { result.error = error.stack; process.exitCode = 1; console.error(error.stack); }
finally {
  result.traces = clients.map(client => client.trace);
  await Promise.all(clients.map(client => client.close()));
  if (registry) await request(registry, '/shutdown', {}).catch(() => {});
  await writeFile(path.join(evidence, 'media-result.json'), JSON.stringify(result, null, 2));
  // Keep the native project, job and MP4 as inspectable acceptance evidence; remove no user data.
}

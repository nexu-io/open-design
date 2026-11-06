import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { WorkspaceStore } from '../workspace.ts';
import { pluginRoot } from '../hyperframes.ts';
import { editorDirectory, ensureEditor, readEditor, editorRequest, sharedEditorEnabled } from '../editor-runtime.ts';
import { Client } from './shared-editor-client.mjs';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('macOS startup retries after the previous lock owner finishes cleanup', { skip: !sharedEditorEnabled, timeout: 25_000 }, async () => {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'opendesign-lock-handoff-')));
  const { runtime } = await editorDirectory(directory);
  const holder = spawn('/usr/bin/perl', ['-e', 'use Fcntl qw(:DEFAULT :flock); $|=1; sysopen(my $f,$ARGV[0],O_CREAT|O_RDWR,0600) or die $!; flock($f,LOCK_EX) or die $!; print "ready\n"; <STDIN>;', path.join(runtime, 'runtime.lock')], { stdio: ['pipe', 'pipe', 'pipe'] });
  const exited = once(holder, 'exit');
  let starting: ReturnType<typeof ensureEditor> | undefined;
  let editor: Awaited<ReturnType<typeof readEditor>>;
  try {
    await once(holder.stdout, 'data'); starting = ensureEditor(directory);
    for (let i = 0; i < 50; i++) {
      if (await stat(path.join(runtime, 'editor.log')).then(() => true, () => false)) break;
      await pause(20);
    }
    await pause(300);
    assert.equal(await stat(path.join(runtime, 'starts.jsonl')).then(() => true, () => false), false);
    holder.stdin.end('\n'); await exited; editor = await starting;
    assert.equal((await editorRequest(editor, '/editor-api/health')).dataDirectory, directory);
    assert.equal((await readFile(path.join(runtime, 'starts.jsonl'), 'utf8')).trim().split('\n').length, 1);
  } finally {
    if (holder.exitCode === null) { holder.stdin.end('\n'); await exited; }
    editor ||= await starting?.catch(() => null);
    if (editor) await editorRequest(editor, '/editor-api/shutdown', {}).catch(() => {});
    await pause(150); await rm(directory, { recursive: true, force: true });
  }
});

test('production stdio connections use one authority and keep project identity', { skip: !sharedEditorEnabled, timeout: 60_000 }, async t => {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'opendesign-shared-mcp-')));
  const store = new WorkspaceStore(directory); await store.initialize(pluginRoot);
  const clients = Array.from({ length: 6 }, () => new Client(directory, { legacy: true }));
  const observations: unknown[] = [];
  let editor: any, first: any, a: any, bId: string;
  t.after(async () => {
    await Promise.all(clients.map(c => c.close()));
    const current = await readEditor(directory);
    if (current) await editorRequest(current, '/editor-api/shutdown', {}).catch(() => {});
    await pause(150);
    if (process.env.OPENMOTION_EDITOR_EVIDENCE) await writeFile(path.join(process.env.OPENMOTION_EDITOR_EVIDENCE, 'shared-process-observations.json'), JSON.stringify({ observations, traces: clients.map(c => c.trace) }, null, 2));
    await rm(directory, { recursive: true, force: true });
  });
  await t.test('six first project calls start one backend and no Studio', async () => {
    await Promise.all(clients.map(c => c.initialize()));
    const template = await clients[0].call('motion_get_workflow', { workflow: 'template' });
    const manufacturing = await clients[1].call('motion_get_workflow', { workflow: 'video-to-template' });
    assert.equal(template.documentId, 'skills/template-to-video/SKILL.md');
    assert.equal(template.status, 'ready');
    assert.equal(manufacturing.documentId, 'skills/video-to-template/SKILL.md');
    assert.equal(manufacturing.status, 'ready');
    assert.equal(await stat(path.join(directory, '.editor-runtime/starts.jsonl')).then(() => true, () => false), false);
    await Promise.all(clients.map(c => c.call('motion_get_project'))); editor = await readEditor(directory);
    first = await editorRequest(editor, '/editor-api/health');
    assert.equal((await readFile(path.join(directory, '.editor-runtime/starts.jsonl'), 'utf8')).trim().split('\n').length, 1);
    assert.equal(await stat(path.join(directory, 'studio.log')).then(() => true, () => false), false);
    assert.equal((await clients[0].rpc('tools/list')).tools.length, 28);
    a = await clients[0].call('motion_get_project'); assert.equal(a.projectId, 'project');
    observations.push({ scenario: 'six-initialize', instanceId: first.instanceId, pid: first.pid, starts: 1, tools: 28, studioStarted: false });
  });
  await t.test('private credentials, Origin and Host checks reject foreign requests', async () => {
    assert.equal((await fetch(new URL('/editor-api/health', editor.endpoint))).status, 401);
    assert.equal((await fetch(new URL('/editor-api/health', editor.endpoint), { headers: { Authorization: `Bearer ${editor.token}`, Origin: 'https://example.com' } })).status, 403);
    const invalidHost = await new Promise<number>(resolve => {
      const req = httpRequest(new URL('/editor-api/health', editor.endpoint), { headers: { Authorization: `Bearer ${editor.token}`, Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode!); });
      req.end();
    });
    assert.equal(invalidHost, 403);
    assert.equal((await stat(path.join(directory, '.editor-runtime/runtime.json'))).mode & 0o777, 0o600);
    assert.ok(!JSON.stringify(a).includes(editor.token));
  });
  await t.test('equal revisions do not route a connection to the UI-selected project', async () => {
    bId = crypto.randomUUID();
    await cp(store.projectDirectory, store.projectDirectoryFor(bId), { recursive: true });
    await store.lock(() => store.selectProject(bId, { id: bId, title: 'Project B' }));
    const b = await clients[1].call('motion_get_project', { projectId: bId });
    assert.equal(b.revision, a.revision, 'fixture projects must have identical content');
    await clients[0].call('motion_get_workflow', { workflow: 'template' });
    await clients[1].call('motion_get_workflow', { workflow: 'video-to-template' });
    const committed = await clients[0].call('motion_write_files', { expectedRevision: a.revision, files: [{ path: 'belongs-to-a.md', content: 'A' }] });
    assert.notEqual(committed.revision, a.revision);
    const unchangedB = await clients[1].call('motion_get_project');
    assert.equal(unchangedB.projectId, bId); assert.equal(unchangedB.revision, b.revision);
    assert.ok(!unchangedB.project.files.some((f: any) => f.path === 'belongs-to-a.md'));
    a = await clients[0].call('motion_get_project'); assert.equal(a.projectId, 'project');
    observations.push({ scenario: 'equal-hash-project-isolation', activeUiProject: bId, connectionProject: a.projectId, misdirectedWrites: 0 });
  });
  await t.test('two MCP writers receive one commit and one revision conflict', async () => {
    const result = await Promise.allSettled([0, 2].map((index, value) => clients[index].call('motion_write_files', { projectId: 'project', expectedRevision: a.revision, files: [{ path: 'race.md', content: String(value) }] })));
    assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((result.find(r => r.status === 'rejected') as PromiseRejectedResult).reason.code, 'REVISION_CONFLICT');
    a = await clients[0].call('motion_get_project');
  });
  await t.test('invalid scopes and unknown arguments do not crash the backend queue', async () => {
    await assert.rejects(clients[0].call('motion_get_project', { projectId: '../outside' }), /工程/);
    await assert.rejects(clients[0].call('motion_write_files', { expectedRevision: a.revision, files: [{ path: '../outside.md', content: 'no' }] }), /路径/);
    await assert.rejects(clients[0].call('motion_get_project', { secret: 'not-in-schema' }), /参数/);
    assert.equal((await editorRequest(editor, '/editor-api/health')).instanceId, first.instanceId);
    assert.equal((await clients[0].call('motion_get_project')).revision, a.revision);
  });
  await t.test('all MCP processes exit while the same backend retains both projects', async () => {
    await Promise.all(clients.map(c => c.close()));
    const next = new Client(directory, { legacy: true }); clients.push(next); await next.initialize();
    assert.equal((await editorRequest(editor, '/editor-api/health')).instanceId, first.instanceId);
    assert.equal((await next.call('motion_get_project', { projectId: 'project' })).revision, a.revision);
    assert.equal((await next.call('motion_get_project', { projectId: bId })).projectId, bId);
  });
  await t.test('idle SIGKILL and four reconnects create one replacement', async () => {
    process.kill(first.pid, 'SIGKILL'); await pause(100);
    const next = Array.from({ length: 4 }, () => new Client(directory, { legacy: true })); clients.push(...next);
    await Promise.all(next.map(c => c.initialize()));
    await Promise.all(next.map(c => c.call('motion_get_project'))); editor = await readEditor(directory);
    const replacement = await editorRequest(editor, '/editor-api/health');
    assert.notEqual(replacement.instanceId, first.instanceId);
    assert.equal((await readFile(path.join(directory, '.editor-runtime/starts.jsonl'), 'utf8')).trim().split('\n').length, 2);
    assert.equal((await next[0].call('motion_get_project', { projectId: 'project' })).revision, a.revision);
    observations.push({ scenario: 'idle-crash-reconnect', reconnects: 4, startsIncludingOriginal: 2, newPid: replacement.pid });
  });
  await t.test('incompatible live service refuses without a competing backend', async () => {
    const registry = editor;
    const fake = createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ...registry, protocol: 999, token: undefined })); });
    await new Promise<void>(resolve => fake.listen(0, '127.0.0.1', resolve));
    try {
      await writeFile(path.join(directory, '.editor-runtime/runtime.json'), JSON.stringify({ ...registry, endpoint: `http://127.0.0.1:${(fake.address() as any).port}/` }));
      await assert.rejects(ensureEditor(directory), /不兼容/);
      assert.equal((await readFile(path.join(directory, '.editor-runtime/starts.jsonl'), 'utf8')).trim().split('\n').length, 2);
    } finally {
      await writeFile(path.join(directory, '.editor-runtime/runtime.json'), JSON.stringify(registry));
      fake.closeAllConnections(); await new Promise<void>(resolve => fake.close(() => resolve()));
    }
  });
});

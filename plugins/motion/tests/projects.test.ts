import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { startServer } from '../server.ts';
import { WorkspaceStore } from '../workspace.ts';
import { inspectProject, pluginRoot, startStudio } from '../hyperframes.ts';
import { fixture } from './fixtures.ts';

test('project sessions create blank editable projects, isolate uploads and restore the selected project after restart', { timeout: 180_000 }, () => fixture(async store => {
  let running = await startServer(store, 0);
  const baseUrl = () => `http://127.0.0.1:${(running.server.address() as { port: number }).port}`;
  async function mutate(route: string, body: unknown, method = 'POST') {
    return fetch(baseUrl() + route, { method, headers: { Origin: baseUrl(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  async function create(title?: string, instruction?: string) {
    const state = await store.status();
    const response = await mutate('/motion-api/projects', { title, instruction, expectedRevision: state.revision, expectedProjectId: state.projectId });
    assert.equal(response.status, 201, await response.clone().text());
    return response.json();
  }
  try {
    const initial = await store.get();
    const first = await create('素材剪辑 <一>', '  做一个产品演示\n保留字幕  ');
    const conversationUrl = `/motion-api/projects/${first.projectId}/conversation`;
    const conversation = await (await fetch(baseUrl() + conversationUrl)).json();
    assert.equal(conversation.messages[0].content, '做一个产品演示\n保留字幕');
    const beforeMessage = (await store.get()).revision;
    const message = { id: crypto.randomUUID(), content: '再缩短到 12 秒' };
    for (let retry = 0; retry < 2; retry++) assert.equal((await mutate(conversationUrl, message)).status, 201);
    assert.equal((await store.conversation(first.projectId)).messages.length, 2, 'an uncertain network retry must not duplicate the request');
    assert.equal((await store.get()).revision, beforeMessage, 'conversation metadata is not a video edit');
    for (const content of ['', 'a'.repeat(8001), 123]) assert.equal((await mutate(conversationUrl, { id: crypto.randomUUID(), content })).status, 400);
    assert.equal((await mutate(conversationUrl, { id: '-'.repeat(36), content: 'Invalid message' })).status, 400);
    const firstDirectory = store.projectDirectory;
    assert.notEqual(first.projectId, 'project');
    assert.match((await store.get()).project!.html!, /素材剪辑 &lt;一&gt;/);
    assert.doesNotMatch((await store.get()).project!.html!, /class="clip"|compositions\//);
    assert.equal((await inspectProject(pluginRoot, firstDirectory, 'lint')).exitCode, 0);
    assert.equal((await store.get()).project!.files.some(file => file.path === 'assets/gsap.min.js'), true);
    const upload = new FormData();
    upload.append('files', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')], { type: 'image/png' }), 'clip.png');
    const uploaded = await fetch(`${baseUrl()}/api/projects/${first.projectId}/upload?dir=assets`, { method: 'POST', headers: { Origin: baseUrl() }, body: upload });
    assert.equal(uploaded.status, 201, await uploaded.clone().text());
    assert.ok((await readdir(path.join(firstDirectory, 'assets'))).some(name => name.endsWith('.png')));
    const firstSource = (await store.get()).project!.html!;
    await store.writeFiles((await store.get()).revision, [{ path: 'notes.md', content: 'Only in project one' }]);
    const second = await create();
    assert.deepEqual((await store.conversation(second.projectId)).messages, []);
    assert.equal((await store.conversation(first.projectId)).messages[1].content, message.content);
    assert.notEqual(first.projectId, second.projectId);
    assert.equal((await store.get()).project!.files.some(file => file.path.endsWith('.png') || file.path === 'notes.md'), false);
    const catalog = new WorkspaceStore(store.directory).projectCatalog();
    assert.equal(catalog.projects.length, 3);
    assert.equal(catalog.activeId, second.projectId);
    assert.ok(catalog.projects.every(item => item.id === 'project' || item.openedAt));
    // An old tab's native endpoints may not resolve to the newly active native directory.
    for (const method of ['GET', 'PUT']) {
      const stale = await fetch(`${baseUrl()}/api/projects/${first.projectId}/files/index.html`, { method, headers: { Origin: baseUrl(), 'Content-Type': 'text/html' }, ...(method === 'PUT' ? { body: firstSource } : {}) });
      assert.equal(stale.status, 409);
    }
    assert.equal((await mutate('/motion-api/projects', { expectedRevision: initial.revision })).status, 409);
    assert.equal((await mutate('/motion-api/projects', { expectedRevision: (await store.get()).revision, expectedProjectId: first.projectId })).status, 409);
    for (const title of ['', '   ', 'a'.repeat(101), 12]) assert.equal((await mutate('/motion-api/projects', { title, expectedRevision: (await store.get()).revision })).status, 400);
    assert.equal(store.projectCatalog().projects.length, 3);
    assert.equal((await readdir(path.join(store.directory, 'projects'))).length, 2);
    assert.equal((await mutate(`/motion-api/projects/${first.projectId}`, { title: '  已整理素材  ' }, 'PATCH')).status, 200);
    assert.equal((await mutate(`/motion-api/projects/${first.projectId}`, { title: '' }, 'PATCH')).status, 400);
    assert.equal(store.projectCatalog().activeId, second.projectId);
    assert.equal((await mutate(`/motion-api/projects/${first.projectId}/open`, { expectedRevision: (await store.get()).revision })).status, 200);
    assert.equal((await store.readFile('notes.md')).content, 'Only in project one');
    assert.equal((await store.get()).project!.html, firstSource);
    assert.equal((await store.status()).projectTitle, '已整理素材');
    await running.close();
    running = await startServer(new WorkspaceStore(store.directory), 0);
    assert.equal((await (await fetch(baseUrl() + conversationUrl)).json()).messages.length, 2);
    assert.equal((await (await fetch(baseUrl() + '/motion-api/project/status')).json()).projectId, first.projectId);
    assert.equal((await (await fetch(baseUrl() + '/__hyperframes_config')).json()).projectDir, firstDirectory);
    assert.equal(await readFile(path.join(store.directory, 'project/index.html'), 'utf8'), initial.project!.html);
  } finally { await running.close(); }
}));

test('native project service avoids Fetch-restricted ports after repeated switches', { timeout: 30_000 }, () => fixture(async store => {
  const studio = await startStudio(pluginRoot, store.projectDirectory, path.join(store.directory, 'studio.log'), 4190);
  try {
    assert.ok(Number(new URL(studio.url).port) >= 20_000);
    const response = await fetch(new URL('/__hyperframes_config', studio.url));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).projectDir, store.projectDirectory);
  } finally { await studio.close(); }
}));

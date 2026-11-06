import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startServer } from '../server.ts';
import { callTool } from '../mcp.ts';
import { WorkspaceStore } from '../workspace.ts';
import { inspectProject, pluginRoot } from '../hyperframes.ts';
import { fixture } from './fixtures.ts';

test('official templates open in native Studio, preserve edits and switch the project shared by MCP processes', { timeout: 180_000 }, () => fixture(async store => {
  const original = await store.get();
  const originalDirectory = store.projectDirectory;
  await store.writeFiles(original.revision, [{ path: 'notes.md', content: 'Keep the original project' }]);
  const running = await startServer(store, 0);
  // Studio adds stable data-hf-id attributes on its first start.
  const initialized = await store.get();
  const address = running.server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  await writeFile(path.join(store.directory, 'preview.json'), JSON.stringify({ port: address.port }));
  const post = (url: string, expectedRevision: string) => fetch(base + url, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision }) });
  try {
    const catalog = await (await fetch(base + '/api/templates')).json();
    assert.deepEqual(catalog.templates.map(item => item.id), ['product-promo', 'nyt-graph', 'decision-tree']);
    const opened: { id: string; directory: string }[] = [];
    for (const template of catalog.templates) {
      const before = await store.get(), previousStudio = running.studio;
      const poster = await fetch(base + template.poster); assert.equal(poster.status, 200); assert.equal(poster.headers.get('content-type'), 'image/jpeg');
      assert.ok((await poster.arrayBuffer()).byteLength > 5000);
      const response = await post(`/api/templates/${template.id}/open`, before.revision);
      assert.equal(response.status, 200, await response.clone().text());
      const openedProject = await response.json();
      assert.notEqual(openedProject.projectId, 'project'); assert.equal(previousStudio.alive(), false);
      const agent = await callTool('motion_get_project', {}, new WorkspaceStore(store.directory));
      assert.equal(agent.project!.directory, store.projectDirectory); assert.match(agent.project!.html!, new RegExp(template.title));
      assert.equal(agent.project!.files.some(file => file.path === 'assets/gsap.min.js'), true);
      const lint = await inspectProject(pluginRoot, store.projectDirectory, 'lint'); assert.equal(lint.exitCode, 0, JSON.stringify(lint.result));
      const nativeBase = new URL(openedProject.studioUrl).origin;
      const identity = await (await fetch(nativeBase + '/__hyperframes_config')).json(); assert.equal(identity.projectDir, store.projectDirectory);
      const fileUrl = `${nativeBase}/api/projects/${openedProject.projectId}/files/index.html`;
      const file = await (await fetch(fileUrl)).json();
      assert.equal(typeof file.content, 'string');
      const edited = await fetch(fileUrl, { method: 'PUT', headers: { 'Content-Type': 'text/html', 'If-Match': file.version, Origin: nativeBase }, body: file.content.replace('<title>', '<title>Edited ') });
      assert.equal(edited.status, 200, await edited.text());
      assert.match((await callTool('motion_get_project', {}, new WorkspaceStore(store.directory))).project!.html!, /<title>Edited /);
      opened.push({ id: openedProject.projectId, directory: store.projectDirectory });
      assert.equal((await post(`/api/templates/${template.id}/open`, before.revision)).status, 409);
    }
    const saved = await (await fetch(base + '/motion-api/projects')).json(); assert.equal(saved.projects.length, 4);
    assert.equal((await post('/api/templates/unknown/open', (await store.get()).revision)).status, 400);
    assert.equal(store.projectDirectory, opened.at(-1)!.directory);
    assert.equal((await post('/motion-api/projects/project/open', (await store.get()).revision)).status, 200);
    assert.equal(store.projectDirectory, originalDirectory);
    assert.equal((await store.readFile('notes.md')).content, 'Keep the original project');
    assert.equal((await store.get()).project!.html, initialized.project!.html);
    for (const project of opened) assert.match(await readFile(path.join(project.directory, 'index.html'), 'utf8'), /<title>Edited /);
    const reopened = await post(`/motion-api/projects/${opened[0].id}/open`, (await store.get()).revision);
    assert.equal(reopened.status, 200, await reopened.clone().text());
    assert.equal(store.projectDirectory, opened[0].directory);
    assert.match((await store.get()).project!.html!, /<title>Edited Product Promo/);
    const beforeAgentTemplate = await store.get();
    const applied = await callTool('motion_apply_template', { expectedRevision: beforeAgentTemplate.revision, templateId: 'nyt-graph' }, new WorkspaceStore(store.directory));
    assert.match(applied.project!.html!, /NYT Graph/);
    assert.notEqual(applied.project!.directory, opened[0].directory);
    assert.match(await readFile(path.join(opened[0].directory, 'index.html'), 'utf8'), /<title>Edited Product Promo/);
    await assert.rejects(() => callTool('motion_apply_template', { expectedRevision: beforeAgentTemplate.revision, templateId: 'nyt-graph' }, store));
  } finally { await running.close(); }
}));

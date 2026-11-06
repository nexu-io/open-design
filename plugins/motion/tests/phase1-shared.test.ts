import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.ts';
import { Client } from './shared-editor-client.mjs';
import { editorRequest, readEditor, sharedEditorEnabled } from '../editor-runtime.ts';

test('real phase1 MCP clients share one editor while retaining explicit projects and conflict protection', { skip: !sharedEditorEnabled, timeout: 90_000 }, () => fixture(async store => {
  const clients = Array.from({ length: 3 }, () => new Client(store.directory));
  try {
    await Promise.all(clients.map(client => client.initialize()));
    const a = await clients[0].call('motion_create_project', { requestId: 'shared-a', projectType: 'natural_language', title: 'A', requirements: 'Project A' });
    const b = await clients[1].call('motion_create_project', { requestId: 'shared-b', projectType: 'natural_language', title: 'B', requirements: 'Project B' });
    const openedB = await clients[1].call('motion_open_preview', { projectId: b.projectId });
    const authority = (await readEditor(store.directory))!;
    const initial = await editorRequest(authority, '/editor-api/health');
    const currentA = await clients[0].call('motion_get_project', { projectId: a.projectId });
    const saved = await clients[0].call('motion_edit_project', { projectId: a.projectId, requestId: 'write-a', expectedRevision: currentA.revision, expectedVersionId: currentA.currentVersionId, files: [{ path: 'only-a.txt', content: 'owned by A' }] });
    const currentB = await clients[1].call('motion_get_project', { projectId: b.projectId });
    assert.equal(currentB.revision, openedB.revision);
    assert.ok(!currentB.project.files.some((file: any) => file.path === 'only-a.txt'));
    await assert.rejects(clients[2].call('motion_open_preview'), /PROJECT_NOT_BOUND/);
    assert.equal((await clients[0].call('motion_open_preview')).projectId, a.projectId);
    const sameA = await clients[2].call('motion_get_project', { projectId: a.projectId });
    const results = await Promise.allSettled([0, 2].map((i, j) => clients[i].call('motion_edit_project', { projectId: a.projectId, requestId: 'race-' + j, expectedRevision: sameA.revision, expectedVersionId: sameA.currentVersionId, files: [{ path: 'race.txt', content: String(j) }] })));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.match(String((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason), /VERSION_CONFLICT/);
    const next = await clients[0].call('motion_get_project', { projectId: a.projectId });
    assert.ok((await clients[0].call('motion_list_versions', { projectId: a.projectId })).versions.some((version: any) => version.versionId === saved.version.versionId));
    assert.equal((await editorRequest(authority, '/editor-api/health')).instanceId, initial.instanceId);
    await Promise.all(clients.map(client => client.close()));
    const resumed = new Client(store.directory); clients.push(resumed); await resumed.initialize();
    assert.equal((await resumed.call('motion_get_project', { projectId: a.projectId })).revision, next.revision);
    assert.equal((await editorRequest(authority, '/editor-api/health')).instanceId, initial.instanceId);
  } finally { await Promise.all(clients.map(client => client.close())); }
}, false));

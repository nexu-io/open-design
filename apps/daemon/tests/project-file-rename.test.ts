import type http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { projectFileRenameTestHooks } from '../src/projects.js';
import { startServer } from '../src/server.js';

describe('project file rename route', () => {
  let server: http.Server;
  let baseUrl: string;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterEach(() => {
    projectFileRenameTestHooks.beforeCommit = null;
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  async function createProject() {
    const id = `rename-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: id }),
    });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { project: { id: string } };
    return body.project.id;
  }

  async function writeText(projectId: string, name: string, content = 'hello') {
    const resp = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content }),
    });
    expect(resp.status).toBe(200);
  }

  async function renameFile(projectId: string, from: string, to: string) {
    return fetch(`${baseUrl}/api/projects/${projectId}/files/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    });
  }

  async function importFolder(folder: string) {
    const importResp = await fetch(`${baseUrl}/api/import/folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseDir: folder }),
    });
    expect(importResp.status).toBe(200);
    const { project } = (await importResp.json()) as { project: { id: string } };
    return project.id;
  }

  it('renames a text file and preserves non-ASCII target names', async () => {
    const projectId = await createProject();
    await writeText(projectId, 'paste-1.txt', 'body');

    const resp = await renameFile(projectId, 'paste-1.txt', '需求说明.txt');
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { oldName: string; newName: string; file: { name: string } };
    expect(body.oldName).toBe('paste-1.txt');
    expect(body.newName).toBe('需求说明.txt');
    expect(body.file.name).toBe('需求说明.txt');

    const renamed = await fetch(`${baseUrl}/api/projects/${projectId}/raw/${encodeURIComponent('需求说明.txt')}`);
    expect(renamed.status).toBe(200);
    expect(await renamed.text()).toBe('body');
  });

  it('renames case-only filename changes instead of treating them as no-ops', async () => {
    const projectId = await createProject();
    await writeText(projectId, 'paste-1.txt', 'body');

    const resp = await renameFile(projectId, 'paste-1.txt', 'Paste-1.txt');
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { oldName: string; newName: string; file: { name: string } };
    expect(body.oldName).toBe('paste-1.txt');
    expect(body.newName).toBe('Paste-1.txt');
    expect(body.file.name).toBe('Paste-1.txt');

    const filesResp = await fetch(`${baseUrl}/api/projects/${projectId}/files`);
    const filesBody = (await filesResp.json()) as { files: Array<{ name: string }> };
    expect(filesBody.files.some((file) => file.name === 'Paste-1.txt')).toBe(true);
    expect(filesBody.files.some((file) => file.name === 'paste-1.txt')).toBe(false);
  });

  it('rejects target file conflicts without overwriting', async () => {
    const projectId = await createProject();
    await writeText(projectId, 'a.txt', 'first');
    await writeText(projectId, 'b.txt', 'second');

    const resp = await renameFile(projectId, 'a.txt', 'b.txt');
    expect(resp.status).toBe(409);

    const existing = await fetch(`${baseUrl}/api/projects/${projectId}/raw/b.txt`);
    expect(await existing.text()).toBe('second');
  });

  it('does not overwrite a target file created during rename', async () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'od-rename-race-'));
    tempDirs.push(folder);
    await writeFile(path.join(folder, 'source.txt'), 'source');
    const projectId = await importFolder(folder);
    projectFileRenameTestHooks.beforeCommit = async ({ target }) => {
      await writeFile(target, 'concurrent');
    };

    const resp = await renameFile(projectId, 'source.txt', 'target.txt');
    expect(resp.status).toBe(409);
    expect(await readFile(path.join(folder, 'source.txt'), 'utf8')).toBe('source');
    expect(await readFile(path.join(folder, 'target.txt'), 'utf8')).toBe('concurrent');
  });

  it('rejects invalid and escaping paths', async () => {
    const projectId = await createProject();
    await writeText(projectId, 'a.txt');

    expect((await renameFile(projectId, 'a.txt', '../outside.txt')).status).toBe(400);
    expect((await renameFile(projectId, 'a.txt', '/tmp/outside.txt')).status).toBe(400);
    expect((await renameFile(projectId, 'a.txt', '.live-artifacts/x.txt')).status).toBe(400);
  });

  it('returns 404 when the source file is missing', async () => {
    const projectId = await createProject();
    const resp = await renameFile(projectId, 'missing.txt', 'next.txt');
    expect(resp.status).toBe(404);
  });

  it('renames artifact manifests alongside their entry file', async () => {
    const projectId = await createProject();
    const resp = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'old.html',
        content: '<!doctype html>',
        artifactManifest: {
          kind: 'html',
          renderer: 'html',
          exports: ['html'],
          title: 'Old',
        },
      }),
    });
    expect(resp.status).toBe(200);

    const renamed = await renameFile(projectId, 'old.html', 'new.html');
    expect(renamed.status).toBe(200);

    const filesResp = await fetch(`${baseUrl}/api/projects/${projectId}/files`);
    const filesBody = (await filesResp.json()) as {
      files: Array<{ name: string; artifactManifest?: { entry?: string } }>;
    };
    expect(filesBody.files.find((file) => file.name === 'new.html')?.artifactManifest?.entry).toBe('new.html');
  });

  it('renames files in imported folders on disk', async () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'od-rename-import-'));
    tempDirs.push(folder);
    await writeFile(path.join(folder, 'note.txt'), 'imported');

    const projectId = await importFolder(folder);

    const renamed = await renameFile(projectId, 'note.txt', 'renamed-note.txt');
    expect(renamed.status).toBe(200);
    await expect(stat(path.join(folder, 'note.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(path.join(folder, 'renamed-note.txt'), 'utf8')).toBe('imported');
  });

  it('renames imported folder files whose existing names contain spaces', async () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'od-rename-import-spaces-'));
    tempDirs.push(folder);
    await writeFile(path.join(folder, 'my note.txt'), 'imported');

    const projectId = await importFolder(folder);

    const renamed = await renameFile(projectId, 'my note.txt', 'renamed-note.txt');
    expect(renamed.status).toBe(200);
    await expect(stat(path.join(folder, 'my note.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(path.join(folder, 'renamed-note.txt'), 'utf8')).toBe('imported');
  });

  it('rejects source paths that escape through a symlinked directory', async () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'od-rename-symlink-source-'));
    const outside = mkdtempSync(path.join(tmpdir(), 'od-rename-outside-source-'));
    tempDirs.push(folder, outside);
    await writeFile(path.join(outside, 'secret.txt'), 'outside');
    await symlink(outside, path.join(folder, 'linked'), 'dir');
    const projectId = await importFolder(folder);

    const renamed = await renameFile(projectId, 'linked/secret.txt', 'renamed.txt');
    expect(renamed.status).toBe(400);
    expect(await readFile(path.join(outside, 'secret.txt'), 'utf8')).toBe('outside');
    await expect(stat(path.join(folder, 'renamed.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects target paths that escape through a symlinked directory', async () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'od-rename-symlink-target-'));
    const outside = mkdtempSync(path.join(tmpdir(), 'od-rename-outside-target-'));
    tempDirs.push(folder, outside);
    await writeFile(path.join(folder, 'note.txt'), 'inside');
    await mkdir(path.join(outside, 'sink'));
    await symlink(path.join(outside, 'sink'), path.join(folder, 'linked'), 'dir');
    const projectId = await importFolder(folder);

    const renamed = await renameFile(projectId, 'note.txt', 'linked/note.txt');
    expect(renamed.status).toBe(400);
    expect(await readFile(path.join(folder, 'note.txt'), 'utf8')).toBe('inside');
    await expect(stat(path.join(outside, 'sink', 'note.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

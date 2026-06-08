import type http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('project file management routes', () => {
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
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  async function createProject() {
    const id = `manage-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: id }),
    });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      project: { id: string };
      conversationId: string;
    };
    return { projectId: body.project.id, conversationId: body.conversationId };
  }

  async function writeText(projectId: string, name: string, content = 'hello') {
    const resp = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content }),
    });
    expect(resp.status).toBe(200);
  }

  async function postPreviewComment(
    projectId: string,
    conversationId: string,
    filePath: string,
    note: string,
    slideIndex?: number,
  ) {
    const resp = await fetch(
      `${baseUrl}/api/projects/${projectId}/conversations/${conversationId}/comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: {
            filePath,
            elementId: 'hero',
            selector: '#hero',
            label: 'Hero',
            text: 'Hello',
            position: { x: 0, y: 0, width: 10, height: 10 },
            htmlHint: '<main id="hero">',
            ...(slideIndex === undefined ? {} : { slideIndex }),
          },
          note,
        }),
      },
    );
    expect(resp.status).toBe(200);
  }

  function createFolder(projectId: string, folderPath: string) {
    return fetch(`${baseUrl}/api/projects/${projectId}/files/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath }),
    });
  }

  function moveFile(projectId: string, from: string, toFolder: string) {
    return fetch(`${baseUrl}/api/projects/${projectId}/files/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, toFolder }),
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

  it('creates a nested folder and rejects escaping folder paths', async () => {
    const { projectId } = await createProject();

    const created = await createFolder(projectId, 'assets/icons');
    expect(created.status).toBe(200);
    const body = (await created.json()) as { folder: { path: string; type: string } };
    expect(body.folder).toMatchObject({ path: 'assets/icons', type: 'dir' });

    expect((await createFolder(projectId, '../outside')).status).toBe(400);
    expect((await createFolder(projectId, '/tmp/outside')).status).toBe(400);
    expect((await createFolder(projectId, '.live-artifacts/cache')).status).toBe(400);
  });

  it('moves a project file into a folder and preserves content', async () => {
    const { projectId } = await createProject();
    await writeText(projectId, 'index.html', '<main>Hello</main>');
    await createFolder(projectId, 'pages');

    const moved = await moveFile(projectId, 'index.html', 'pages');
    expect(moved.status).toBe(200);
    const body = (await moved.json()) as {
      oldName: string;
      newName: string;
      file: { name: string; path: string };
    };
    expect(body.oldName).toBe('index.html');
    expect(body.newName).toBe('pages/index.html');
    expect(body.file).toMatchObject({ name: 'pages/index.html', path: 'pages/index.html' });

    const raw = await fetch(`${baseUrl}/api/projects/${projectId}/raw/pages/index.html`);
    expect(raw.status).toBe(200);
    expect(await raw.text()).toBe('<main>Hello</main>');
  });

  it('migrates open tabs and preview comment anchors when a file moves', async () => {
    const { projectId, conversationId } = await createProject();
    await writeText(projectId, 'index.html', '<main id="hero">Hello</main>');

    const tabs = await fetch(`${baseUrl}/api/projects/${projectId}/tabs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabs: ['index.html'], active: 'index.html' }),
    });
    expect(tabs.status).toBe(200);

    const comment = await fetch(
      `${baseUrl}/api/projects/${projectId}/conversations/${conversationId}/comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: {
            filePath: 'index.html',
            elementId: 'hero',
            selector: '#hero',
            label: 'Hero',
            text: 'Hello',
            position: { x: 0, y: 0, width: 10, height: 10 },
            htmlHint: '<main id="hero">',
          },
          note: 'Tighten this section.',
        }),
      },
    );
    expect(comment.status).toBe(200);

    await createFolder(projectId, 'pages');
    const moved = await moveFile(projectId, 'index.html', 'pages');
    expect(moved.status).toBe(200);

    const nextTabsResp = await fetch(`${baseUrl}/api/projects/${projectId}/tabs`);
    const nextTabs = (await nextTabsResp.json()) as {
      tabs: string[];
      active: string | null;
      hasSavedState: boolean;
      updatedAt?: number;
    };
    expect(nextTabs).toMatchObject({
      tabs: ['pages/index.html'],
      active: 'pages/index.html',
      hasSavedState: true,
    });
    expect(typeof nextTabs.updatedAt).toBe('number');

    const commentsResp = await fetch(
      `${baseUrl}/api/projects/${projectId}/conversations/${conversationId}/comments`,
    );
    const comments = (await commentsResp.json()) as { comments: Array<{ filePath: string }> };
    expect(comments.comments).toHaveLength(1);
    expect(comments.comments[0]!.filePath).toBe('pages/index.html');
  });

  it('keeps preview comments when moving a file to its current folder', async () => {
    const { projectId, conversationId } = await createProject();
    await createFolder(projectId, 'pages');
    await writeText(projectId, 'pages/index.html', '<main id="hero">Hello</main>');

    const comment = await fetch(
      `${baseUrl}/api/projects/${projectId}/conversations/${conversationId}/comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: {
            filePath: 'pages/index.html',
            elementId: 'hero',
            selector: '#hero',
            label: 'Hero',
            text: 'Hello',
            position: { x: 0, y: 0, width: 10, height: 10 },
            htmlHint: '<main id="hero">',
          },
          note: 'Keep this anchor.',
        }),
      },
    );
    expect(comment.status).toBe(200);

    const moved = await moveFile(projectId, 'pages/index.html', 'pages');
    expect(moved.status).toBe(200);

    const commentsResp = await fetch(
      `${baseUrl}/api/projects/${projectId}/conversations/${conversationId}/comments`,
    );
    const comments = (await commentsResp.json()) as { comments: Array<{ filePath: string }> };
    expect(comments.comments).toHaveLength(1);
    expect(comments.comments[0]!.filePath).toBe('pages/index.html');
  });

  it('preserves distinct preview comments that only differ by slide when moving a file', async () => {
    const { projectId, conversationId } = await createProject();
    await writeText(projectId, 'index.html', '<main id="hero">Hello</main>');

    await postPreviewComment(projectId, conversationId, 'index.html', 'Slide A', 0);
    await postPreviewComment(projectId, conversationId, 'pages/index.html', 'Slide B', 1);

    await createFolder(projectId, 'pages');
    const moved = await moveFile(projectId, 'index.html', 'pages');
    expect(moved.status).toBe(200);

    const commentsResp = await fetch(
      `${baseUrl}/api/projects/${projectId}/conversations/${conversationId}/comments`,
    );
    const comments = (await commentsResp.json()) as {
      comments: Array<{ filePath: string; note: string; slideIndex?: number }>;
    };
    expect(comments.comments).toHaveLength(2);
    expect(comments.comments.map((comment) => ({
      filePath: comment.filePath,
      note: comment.note,
      slideIndex: comment.slideIndex,
    }))).toEqual([
      { filePath: 'pages/index.html', note: 'Slide A', slideIndex: 0 },
      { filePath: 'pages/index.html', note: 'Slide B', slideIndex: 1 },
    ]);
  });

  it('rejects move target conflicts without overwriting', async () => {
    const { projectId } = await createProject();
    await writeText(projectId, 'note.txt', 'source');
    await writeText(projectId, 'docs/note.txt', 'existing');

    const moved = await moveFile(projectId, 'note.txt', 'docs');
    expect(moved.status).toBe(409);

    const existing = await fetch(`${baseUrl}/api/projects/${projectId}/raw/docs/note.txt`);
    expect(await existing.text()).toBe('existing');
    const source = await fetch(`${baseUrl}/api/projects/${projectId}/raw/note.txt`);
    expect(await source.text()).toBe('source');
  });

  it('rejects move paths that escape through a symlinked folder', async () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'od-move-symlink-target-'));
    const outside = mkdtempSync(path.join(tmpdir(), 'od-move-outside-target-'));
    tempDirs.push(folder, outside);
    await writeFile(path.join(folder, 'note.txt'), 'inside');
    await mkdir(path.join(outside, 'sink'));
    await symlink(path.join(outside, 'sink'), path.join(folder, 'linked'), 'dir');
    const projectId = await importFolder(folder);

    const moved = await moveFile(projectId, 'note.txt', 'linked');
    expect(moved.status).toBe(400);
    expect(await readFile(path.join(folder, 'note.txt'), 'utf8')).toBe('inside');
    await expect(stat(path.join(outside, 'sink', 'note.txt'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

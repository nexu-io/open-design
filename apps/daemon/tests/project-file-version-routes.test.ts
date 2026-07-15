import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getProjectFileVersionRootStats } from '../src/project-file-versions.js';
import { projectFileWriteTestHooks } from '../src/projects.js';
import { snapshotAiHtmlVersionsForRun } from '../src/run-html-version-snapshots.js';
import { startServer } from '../src/server.js';

describe('project file version routes', () => {
  let server: http.Server;
  let baseUrl: string;
  const projectsToClean: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    for (const id of projectsToClean.splice(0)) {
      await fetch(`${baseUrl}/api/projects/${id}`, { method: 'DELETE' }).catch(() => {});
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function createProject(): Promise<string> {
    const id = `file-versions-${randomUUID()}`;
    const response = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, name: 'File version route project' }),
    });
    expect(response.status).toBe(200);
    projectsToClean.push(id);
    return id;
  }

  async function writeProjectFile(projectId: string, name: string, content: string): Promise<void> {
    const response = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, content }),
    });
    expect(response.status).toBe(200);
  }

  function projectsRoot(): string {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    return path.join(dataDir, 'projects');
  }

  async function blockVersionRoot(projectId: string): Promise<void> {
    const projectDir = path.join(projectsRoot(), projectId);
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(path.join(projectDir, '.file-versions'), 'blocked');
  }

  it('lists and restores HTML history after the working file is deleted', async () => {
    const projectId = await createProject();
    await writeProjectFile(projectId, 'brand.html', '<html><body>recover me</body></html>');

    const createResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files/brand.html/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Known good checkpoint', source: 'manual' }),
    });
    expect(createResponse.status).toBe(200);
    const created = (await createResponse.json()) as { version: { id: string; size: number } };

    const deleteResponse = await fetch(`${baseUrl}/api/projects/${projectId}/raw/brand.html`, {
      method: 'DELETE',
    });
    expect(deleteResponse.status).toBe(200);

    const listResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files/brand.html/versions`);
    expect(listResponse.status).toBe(200);
    const listed = (await listResponse.json()) as {
      file: { name: string; size: number; kind: string; mime: string };
      versions: Array<{ id: string; current: boolean; label: string }>;
    };
    expect(listed.file).toMatchObject({
      name: 'brand.html',
      size: created.version.size,
      kind: 'html',
      mime: 'text/html; charset=utf-8',
    });
    expect(listed.versions.length).toBeGreaterThanOrEqual(1);
    const listedCheckpoint = listed.versions.find((version) => version.id === created.version.id);
    expect(listedCheckpoint).toMatchObject({
      id: created.version.id,
      current: true,
      label: 'Known good checkpoint',
    });

    const restoreResponse = await fetch(
      `${baseUrl}/api/projects/${projectId}/files/brand.html/versions/${created.version.id}/restore`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) },
    );
    expect(restoreResponse.status).toBe(200);

    const rawResponse = await fetch(`${baseUrl}/api/projects/${projectId}/raw/brand.html`);
    expect(rawResponse.status).toBe(200);
    expect(await rawResponse.text()).toBe('<html><body>recover me</body></html>');
  });

  it('does not mix deleted HTML history into a recreated file at the same path', async () => {
    const projectId = await createProject();
    await writeProjectFile(projectId, 'brand.html', '<html><body>old file</body></html>');

    const oldResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files/brand.html/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Deleted file checkpoint', source: 'manual' }),
    });
    expect(oldResponse.status).toBe(200);

    const deleteResponse = await fetch(`${baseUrl}/api/projects/${projectId}/raw/brand.html`, {
      method: 'DELETE',
    });
    expect(deleteResponse.status).toBe(200);

    await writeProjectFile(projectId, 'brand.html', '<html><body>new file</body></html>');
    const newResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files/brand.html/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Recreated file checkpoint', source: 'manual' }),
    });
    expect(newResponse.status).toBe(200);

    const listResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files/brand.html/versions`);
    expect(listResponse.status).toBe(200);
    const listed = (await listResponse.json()) as {
      versions: Array<{ label: string; current: boolean }>;
    };
    expect(listed.versions.some((version) => version.label === 'Deleted file checkpoint')).toBe(false);
    expect(listed.versions.some((version) => version.label === 'Recreated file checkpoint')).toBe(true);
    expect(listed.versions.filter((version) => version.current)).toHaveLength(1);
  });

  it('creates an initial version when listing an existing HTML file with no history', async () => {
    const projectId = await createProject();
    await fs.mkdir(path.join(projectsRoot(), projectId), { recursive: true });
    await fs.writeFile(
      path.join(projectsRoot(), projectId, 'legacy.html'),
      '<html><body>initial legacy file</body></html>',
    );

    const initialListResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files/legacy.html/versions`);
    expect(initialListResponse.status).toBe(200);
    const initialList = (await initialListResponse.json()) as {
      versions: Array<{ id: string; version: number; source: string; current: boolean }>;
    };
    expect(initialList.versions).toHaveLength(1);
    expect(initialList.versions[0]).toMatchObject({
      version: 1,
      source: 'manual',
      current: true,
    });

    await writeProjectFile(projectId, 'legacy.html', '<html><body>edited legacy file</body></html>');
    const editedListResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files/legacy.html/versions`);
    expect(editedListResponse.status).toBe(200);
    const editedList = (await editedListResponse.json()) as {
      versions: Array<{ id: string; version: number; current: boolean }>;
    };
    expect(editedList.versions).toHaveLength(2);
    expect(editedList.versions.filter((version) => version.current)).toHaveLength(1);
  });

  it('preserves AI-generated HTML history after a manual edit', async () => {
    const projectId = await createProject();
    const projectRoot = path.join(projectsRoot(), projectId);
    const htmlPath = path.join(projectRoot, 'proposal.html');
    await fs.mkdir(projectRoot, { recursive: true });

    await fs.writeFile(htmlPath, '<html><body>generated proposal</body></html>');
    await snapshotAiHtmlVersionsForRun({
      projectsRoot: projectsRoot(),
      projectId,
      projectRoot,
      diff: { touchedPaths: [htmlPath] },
      prompt: 'Generate a proposal',
      promptSource: 'message',
    });
    await fs.writeFile(htmlPath, '<html><body>polished proposal</body></html>');
    await snapshotAiHtmlVersionsForRun({
      projectsRoot: projectsRoot(),
      projectId,
      projectRoot,
      diff: { touchedPaths: [htmlPath] },
      prompt: 'Polish the proposal',
      promptSource: 'message',
    });

    const manualEditResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'proposal.html',
        content: '<html><body>manually edited proposal</body></html>',
        versionSource: 'manual',
        versionLabel: 'Manual copy edit',
      }),
    });
    expect(manualEditResponse.status).toBe(200);

    const listResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files/proposal.html/versions`);
    expect(listResponse.status).toBe(200);
    const listed = (await listResponse.json()) as {
      versions: Array<{ version: number; source: string; current: boolean }>;
    };
    expect(listed.versions.map((version) => version.source)).toEqual(['ai', 'ai', 'manual']);
    expect(listed.versions.map((version) => version.version)).toEqual([1, 2, 3]);
    expect(listed.versions.filter((version) => version.current)).toHaveLength(1);
  });

  it('captures initial HTML versions for batch project uploads', async () => {
    const projectId = await createProject();
    const form = new FormData();
    form.append('files', new Blob(['<html><body>batch uploaded</body></html>'], { type: 'text/html' }), 'batch.html');

    const uploadResponse = await fetch(`${baseUrl}/api/projects/${projectId}/upload`, {
      method: 'POST',
      body: form,
    });
    expect(uploadResponse.status).toBe(200);
    await expect(uploadResponse.json()).resolves.toMatchObject({
      files: [expect.objectContaining({ name: 'batch.html', path: 'batch.html' })],
    });

    const listResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files/batch.html/versions`);
    expect(listResponse.status).toBe(200);
    const listed = (await listResponse.json()) as {
      versions: Array<{ version: number; source: string; current: boolean }>;
    };
    expect(listed.versions).toHaveLength(1);
    expect(listed.versions[0]).toMatchObject({
      version: 1,
      source: 'manual',
      current: true,
    });
  });

  it('returns a typed warning when JSON HTML write succeeds but version capture fails', async () => {
    const projectId = await createProject();
    await blockVersionRoot(projectId);

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'brand.html', content: '<html><body>saved</body></html>' }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      file: { name: string };
      versionWarning?: { code: string; message: string };
    };
    expect(body.file.name).toBe('brand.html');
    expect(body.versionWarning).toMatchObject({
      code: 'PROJECT_FILE_VERSION_CAPTURE_FAILED',
    });

    const rawResponse = await fetch(`${baseUrl}/api/projects/${projectId}/raw/brand.html`);
    expect(rawResponse.status).toBe(200);
    expect(await rawResponse.text()).toBe('<html><body>saved</body></html>');
  });

  it('returns a typed warning when multipart HTML upload succeeds but version capture fails', async () => {
    const projectId = await createProject();
    await blockVersionRoot(projectId);
    const form = new FormData();
    form.append('file', new Blob(['<html><body>uploaded</body></html>'], { type: 'text/html' }), 'upload.html');

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      body: form,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      file: { name: string };
      versionWarning?: { code: string; message: string };
    };
    expect(body.file.name).toBe('upload.html');
    expect(body.versionWarning).toMatchObject({
      code: 'PROJECT_FILE_VERSION_CAPTURE_FAILED',
    });

    const rawResponse = await fetch(`${baseUrl}/api/projects/${projectId}/raw/upload.html`);
    expect(rawResponse.status).toBe(200);
    expect(await rawResponse.text()).toBe('<html><body>uploaded</body></html>');
  });

  it('returns a typed warning when restore writes the file but cannot append the restore version', async () => {
    const projectId = await createProject();
    await writeProjectFile(projectId, 'brand.html', '<html><body>old</body></html>');
    const createResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files/brand.html/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Old checkpoint', source: 'manual' }),
    });
    expect(createResponse.status).toBe(200);
    const created = (await createResponse.json()) as { version: { id: string } };
    await writeProjectFile(projectId, 'brand.html', '<html><body>new</body></html>');

    const stats = await getProjectFileVersionRootStats(projectsRoot(), projectId, 'brand.html');
    await fs.chmod(stats.root, 0o555);
    try {
      const restoreResponse = await fetch(
        `${baseUrl}/api/projects/${projectId}/files/brand.html/versions/${created.version.id}/restore`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) },
      );
      expect(restoreResponse.status).toBe(200);
      const restored = (await restoreResponse.json()) as {
        file: { name: string };
        version: null;
        versionWarning?: { code: string; message: string };
      };
      expect(restored.file.name).toBe('brand.html');
      expect(restored.version).toBeNull();
      expect(restored.versionWarning).toMatchObject({
        code: 'PROJECT_FILE_VERSION_CAPTURE_FAILED',
      });

      const rawResponse = await fetch(`${baseUrl}/api/projects/${projectId}/raw/brand.html`);
      expect(rawResponse.status).toBe(200);
      expect(await rawResponse.text()).toBe('<html><body>old</body></html>');
    } finally {
      await fs.chmod(stats.root, 0o755).catch(() => {});
    }
  });

  it('rejects invalid version source values before mutating HTML files', async () => {
    const projectId = await createProject();
    await writeProjectFile(projectId, 'brand.html', '<html><body>valid</body></html>');

    const explicitResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files/brand.html/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'typo' }),
    });
    expect(explicitResponse.status).toBe(400);
    await expect(explicitResponse.json()).resolves.toMatchObject({
      error: { code: 'BAD_REQUEST', message: expect.stringContaining('invalid source') },
    });

    const jsonSaveResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'bad-save.html',
        content: '<html><body>should not persist</body></html>',
        versionSource: 'typo',
      }),
    });
    expect(jsonSaveResponse.status).toBe(400);
    await expect(jsonSaveResponse.json()).resolves.toMatchObject({
      error: { code: 'BAD_REQUEST', message: expect.stringContaining('invalid versionSource') },
    });
    const rejectedJsonRaw = await fetch(`${baseUrl}/api/projects/${projectId}/raw/bad-save.html`);
    expect(rejectedJsonRaw.status).toBe(404);

    const form = new FormData();
    form.append('source', 'typo');
    form.append('file', new Blob(['<html><body>should not upload</body></html>'], { type: 'text/html' }), 'bad-upload.html');
    const multipartResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      body: form,
    });
    expect(multipartResponse.status).toBe(400);
    await expect(multipartResponse.json()).resolves.toMatchObject({
      error: { code: 'BAD_REQUEST', message: expect.stringContaining('invalid source') },
    });
    const rejectedMultipartRaw = await fetch(`${baseUrl}/api/projects/${projectId}/raw/bad-upload.html`);
    expect(rejectedMultipartRaw.status).toBe(404);
  });

  it('rejects folder operations against internal version storage paths', async () => {
    const projectId = await createProject();

    const createResponse = await fetch(`${baseUrl}/api/projects/${projectId}/folders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '.file-versions' }),
    });
    expect(createResponse.status).toBe(400);

    const deleteResponse = await fetch(`${baseUrl}/api/projects/${projectId}/folders`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: '.file-versions' }),
    });
    expect(deleteResponse.status).toBe(400);
  });

  it('captures concurrent JSON HTML writes as distinct recoverable checkpoints', async () => {
    const projectId = await createProject();
    let resolveSecondCommit!: () => void;
    const secondCommitted = new Promise<void>((resolve) => {
      resolveSecondCommit = resolve;
    });
    projectFileWriteTestHooks.afterCommit = async ({ safeName, body }) => {
      if (safeName !== 'race.html') return;
      const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body);
      if (text.includes('second')) {
        resolveSecondCommit();
        return;
      }
      if (text.includes('first')) {
        await Promise.race([
          secondCommitted,
          new Promise<void>((resolve) => setTimeout(resolve, 150)),
        ]);
      }
    };
    try {
      const writeHtml = (label: string, content: string) =>
        fetch(`${baseUrl}/api/projects/${projectId}/files`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: 'race.html',
            content,
            versionLabel: label,
            versionSource: 'manual',
          }),
        });

      const firstWrite = writeHtml('First write', '<html><body>first</body></html>');
      await new Promise((resolve) => setTimeout(resolve, 10));
      const secondWrite = writeHtml('Second write', '<html><body>second</body></html>');
      const [firstResponse, secondResponse] = await Promise.all([firstWrite, secondWrite]);
      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(200);
    } finally {
      projectFileWriteTestHooks.afterCommit = null;
    }

    const listResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files/race.html/versions`);
    expect(listResponse.status).toBe(200);
    const listed = (await listResponse.json()) as {
      versions: Array<{ id: string; label: string; current: boolean }>;
    };
    expect(listed.versions).toHaveLength(2);
    expect(new Set(listed.versions.map((version) => version.label))).toEqual(
      new Set(['First write', 'Second write']),
    );

    const contentByLabel = new Map<string, string>();
    for (const version of listed.versions) {
      const response = await fetch(`${baseUrl}/api/projects/${projectId}/files/race.html/versions/${version.id}`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { content: string };
      contentByLabel.set(version.label, body.content);
    }
    expect(contentByLabel.get('First write')).toBe('<html><body>first</body></html>');
    expect(contentByLabel.get('Second write')).toBe('<html><body>second</body></html>');

    const current = listed.versions.find((version) => version.current);
    expect(current).toBeDefined();
    const currentVersionResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files/race.html/versions/${current!.id}`);
    expect(currentVersionResponse.status).toBe(200);
    const currentVersion = (await currentVersionResponse.json()) as { content: string };
    const rawResponse = await fetch(`${baseUrl}/api/projects/${projectId}/raw/race.html`);
    expect(rawResponse.status).toBe(200);
    expect(await rawResponse.text()).toBe(currentVersion.content);
  });
});

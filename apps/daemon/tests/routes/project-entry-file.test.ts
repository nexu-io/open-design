/**
 * `PUT /api/projects/:id/entry-file`: the entry file as a project attribute.
 *
 * The UI's "set as entry" control and `od project entry` both call this
 * route, so its contract is what both surfaces rely on: a project-relative
 * file that exists becomes the recorded entry the preview opens, `null`
 * clears the record so inference takes over again, and anything else is
 * refused with a named error instead of being stored.
 *
 * The attribute names a path, so the file mutation routes carry it along:
 * a rename of the entry moves the record, a delete of the entry or of the
 * folder holding it clears the record, and the preview follows each time.
 */
import type http from 'node:http';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../../src/server.js';
import { withProjectMutation } from '../../src/project-mutation-queue.js';

const execFileP = promisify(execFile);
const DAEMON_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = path.resolve(DAEMON_ROOT, '..', '..');
const CLI_SRC = path.resolve(DAEMON_ROOT, 'src/cli.ts');
const TSX_CLI = path.resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');

describe('PUT /api/projects/:id/entry-file', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(() => {
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function createProjectWithFiles(label: string, files: Record<string, string>) {
    const projectId = `proj-entry-${label}-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Entry file fixture',
        metadata: { kind: 'prototype' },
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createResp.status).toBe(200);
    for (const [name, content] of Object.entries(files)) {
      const writeResp = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content }),
      });
      expect(writeResp.status).toBe(200);
    }
    return projectId;
  }

  async function putEntry(projectId: string, entryFile: unknown) {
    const response = await fetch(`${baseUrl}/api/projects/${projectId}/entry-file`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryFile }),
    });
    return { status: response.status, body: await response.json() as Record<string, any> };
  }

  async function readEntry(projectId: string): Promise<string | undefined> {
    const response = await fetch(`${baseUrl}/api/projects/${projectId}`);
    expect(response.status).toBe(200);
    const body = await response.json() as { project: { metadata?: { entryFile?: string } } };
    return body.project.metadata?.entryFile;
  }

  it('records an existing file as the entry and reads it back on the project', async () => {
    const projectId = await createProjectWithFiles('set', {
      'screens/home.html': '<!doctype html><title>Home</title>',
      'screens/about.html': '<!doctype html><title>About</title>',
    });
    expect(await readEntry(projectId)).toBeUndefined();

    const set = await putEntry(projectId, 'screens/home.html');
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body).toMatchObject({
      entryFile: 'screens/home.html',
      project: { id: projectId, metadata: { kind: 'prototype', entryFile: 'screens/home.html' } },
    });
    expect(await readEntry(projectId)).toBe('screens/home.html');

    // The preview resolves to the recorded entry when no file is named.
    const preview = await fetch(`${baseUrl}/api/projects/${projectId}/preview-url`);
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({ file: 'screens/home.html' });
  });

  it('accepts a leading ./ and switches the entry to another file', async () => {
    const projectId = await createProjectWithFiles('switch', {
      'a.html': '<!doctype html><title>A</title>',
      'b.html': '<!doctype html><title>B</title>',
    });
    expect((await putEntry(projectId, './a.html')).body.entryFile).toBe('a.html');
    expect((await putEntry(projectId, 'b.html')).body.entryFile).toBe('b.html');
    expect(await readEntry(projectId)).toBe('b.html');
  });

  it('clears the record with null so inference takes over again', async () => {
    const projectId = await createProjectWithFiles('clear', {
      'index.html': '<!doctype html><title>Index</title>',
      'other.html': '<!doctype html><title>Other</title>',
    });
    expect((await putEntry(projectId, 'other.html')).status).toBe(200);
    const cleared = await putEntry(projectId, null);
    expect(cleared.status).toBe(200);
    expect(cleared.body.entryFile).toBeNull();
    expect(await readEntry(projectId)).toBeUndefined();
    // Back on inference: the root index.html is what the preview opens.
    const preview = await fetch(`${baseUrl}/api/projects/${projectId}/preview-url`);
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({ file: 'index.html' });
  });

  it('refuses a file that is not in the project, a directory, and an unsafe path', async () => {
    const projectId = await createProjectWithFiles('refuse', {
      'screens/home.html': '<!doctype html><title>Home</title>',
    });
    const missing = await putEntry(projectId, 'nope.html');
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ error: { code: 'FILE_NOT_FOUND' } });

    const directory = await putEntry(projectId, 'screens');
    expect(directory.status).toBe(404);

    for (const unsafe of ['../outside.html', '/etc/passwd', '', 42]) {
      const refused = await putEntry(projectId, unsafe);
      expect(refused.status, String(unsafe)).toBe(400);
      expect(refused.body).toMatchObject({ error: { code: 'BAD_REQUEST' } });
    }
    expect(await readEntry(projectId)).toBeUndefined();
  });

  it('sets, prints, and clears the entry through od project entry', async () => {
    const projectId = await createProjectWithFiles('cli', {
      'screens/home.html': '<!doctype html><title>Home</title>',
    });
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    const run = (args: string[]) => execFileP(process.execPath, [TSX_CLI, CLI_SRC, ...args], {
      cwd: DAEMON_ROOT,
      env,
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    });

    const set = await run(['project', 'entry', projectId, '--file', 'screens/home.html', '--daemon-url', baseUrl, '--json']);
    expect(set.stderr).toBe('');
    expect(JSON.parse(set.stdout)).toMatchObject({ entryFile: 'screens/home.html', project: { id: projectId } });
    expect(await readEntry(projectId)).toBe('screens/home.html');

    const read = await run(['project', 'entry', projectId, '--daemon-url', baseUrl, '--json']);
    expect(JSON.parse(read.stdout)).toEqual({ projectId, entryFile: 'screens/home.html' });

    const cleared = await run(['project', 'entry', projectId, '--clear', '--daemon-url', baseUrl, '--json']);
    expect(JSON.parse(cleared.stdout)).toMatchObject({ entryFile: null });
    expect(await readEntry(projectId)).toBeUndefined();

    await expect(run(['project', 'entry', projectId, '--file', 'missing.html', '--daemon-url', baseUrl, '--json']))
      .rejects.toMatchObject({ code: expect.any(Number) });
  }, 60_000);

  async function previewFile(projectId: string): Promise<{ status: number; file: string | undefined; code: string | undefined }> {
    const response = await fetch(`${baseUrl}/api/projects/${projectId}/preview-url`);
    const body = await response.json() as { file?: string; error?: { code?: string } };
    return { status: response.status, file: body.file, code: body.error?.code };
  }

  it('follows the entry file through a rename', async () => {
    const projectId = await createProjectWithFiles('rename', {
      'screens/home.html': '<!doctype html><title>Home</title>',
      'screens/about.html': '<!doctype html><title>About</title>',
    });
    expect((await putEntry(projectId, 'screens/home.html')).status).toBe(200);

    // Renaming another file leaves the record alone.
    const other = await fetch(`${baseUrl}/api/projects/${projectId}/files/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'screens/about.html', to: 'screens/team.html' }),
    });
    expect(other.status).toBe(200);
    expect(await readEntry(projectId)).toBe('screens/home.html');

    const renamed = await fetch(`${baseUrl}/api/projects/${projectId}/files/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'screens/home.html', to: 'screens/start.html' }),
    });
    expect(renamed.status, await renamed.text().catch(() => '')).toBe(200);
    expect(await readEntry(projectId)).toBe('screens/start.html');
    expect(await previewFile(projectId)).toMatchObject({ status: 200, file: 'screens/start.html' });
  });

  it('clears the entry when its file is deleted, so the preview falls back to inference', async () => {
    const projectId = await createProjectWithFiles('delete-file', {
      'index.html': '<!doctype html><title>Index</title>',
      'screens/home.html': '<!doctype html><title>Home</title>',
    });
    expect((await putEntry(projectId, 'screens/home.html')).status).toBe(200);
    expect(await previewFile(projectId)).toMatchObject({ status: 200, file: 'screens/home.html' });

    // Deleting another file leaves the record alone.
    const other = await fetch(`${baseUrl}/api/projects/${projectId}/raw/index.html`, { method: 'DELETE' });
    expect(other.status).toBe(200);
    expect(await readEntry(projectId)).toBe('screens/home.html');
    const restored = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'index.html', content: '<!doctype html><title>Index</title>' }),
    });
    expect(restored.status).toBe(200);

    const deleted = await fetch(`${baseUrl}/api/projects/${projectId}/raw/screens/home.html`, { method: 'DELETE' });
    expect(deleted.status).toBe(200);
    expect(await readEntry(projectId)).toBeUndefined();
    // Back on inference: the root index.html is what the preview opens, not a
    // FILE_NOT_FOUND for the path that is gone.
    expect(await previewFile(projectId)).toMatchObject({ status: 200, file: 'index.html' });
  });

  it('clears the entry when a root file is deleted through the files route', async () => {
    const projectId = await createProjectWithFiles('delete-root', {
      'index.html': '<!doctype html><title>Index</title>',
      'landing.html': '<!doctype html><title>Landing</title>',
    });
    expect((await putEntry(projectId, 'landing.html')).status).toBe(200);
    const deleted = await fetch(`${baseUrl}/api/projects/${projectId}/files/landing.html`, { method: 'DELETE' });
    expect(deleted.status).toBe(200);
    expect(await readEntry(projectId)).toBeUndefined();
    expect(await previewFile(projectId)).toMatchObject({ status: 200, file: 'index.html' });
  });

  it('clears the entry when the folder holding it is deleted', async () => {
    const projectId = await createProjectWithFiles('delete-folder', {
      'index.html': '<!doctype html><title>Index</title>',
      'screens/home.html': '<!doctype html><title>Home</title>',
      'assets/app.css': 'body{}',
    });
    expect((await putEntry(projectId, 'screens/home.html')).status).toBe(200);

    // A folder that does not hold the entry leaves the record alone.
    const other = await fetch(`${baseUrl}/api/projects/${projectId}/folders`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'assets' }),
    });
    expect(other.status).toBe(200);
    expect(await readEntry(projectId)).toBe('screens/home.html');

    const deleted = await fetch(`${baseUrl}/api/projects/${projectId}/folders`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'screens' }),
    });
    expect(deleted.status).toBe(200);
    expect(await readEntry(projectId)).toBeUndefined();
    expect(await previewFile(projectId)).toMatchObject({ status: 200, file: 'index.html' });
  });

  it('keeps a selection made while a rename was in flight', async () => {
    // The rename route loads the project, awaits filesystem work, then
    // carries the entry. A `PUT /entry-file` that lands inside that window
    // must win: the carry judges the entry the project records at that
    // moment, not the snapshot the route started from, so it neither
    // overwrites the newer choice with the renamed old one nor loses it.
    const projectId = await createProjectWithFiles('race', {
      'a.html': '<!doctype html><title>A</title>',
      'b.html': '<!doctype html><title>B</title>',
    });
    expect((await putEntry(projectId, 'a.html')).status).toBe(200);

    const rename = fetch(`${baseUrl}/api/projects/${projectId}/files/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'a.html', to: 'a2.html' }),
    });
    const select = putEntry(projectId, 'b.html');
    const [renamed, selected] = await Promise.all([rename, select]);
    expect(renamed.status).toBe(200);
    expect(selected.status).toBe(200);
    // Whichever order the two landed in, the user's newer selection stands.
    expect(await readEntry(projectId)).toBe('b.html');
    expect(await previewFile(projectId)).toMatchObject({ status: 200, file: 'b.html' });
  });

  it('never leaves the record on a file that a concurrent delete removed', async () => {
    // The setter's existence check and write, and the delete's removal and
    // carry, are steps in the project's mutation queue, so they land in one
    // order or the other but never interleaved. Holding the queue from the
    // test forces each order deterministically: selection first, the delete
    // then clears the record; delete first, the selection is refused. In
    // neither order does the record end on the removed file.
    const projectId = await createProjectWithFiles('race-delete', {
      'index.html': '<!doctype html><title>Index</title>',
    });
    const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 150));
    for (const order of ['select-then-delete', 'delete-then-select'] as const) {
      for (const [target, remove] of [
        ['a.html', () => fetch(`${baseUrl}/api/projects/${projectId}/raw/a.html`, { method: 'DELETE' })],
        ['screens/home.html', () => fetch(`${baseUrl}/api/projects/${projectId}/folders`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: 'screens' }),
        })],
      ] as const) {
        const restore = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: target, content: '<!doctype html><title>Target</title>' }),
        });
        expect(restore.status).toBe(200);

        let release!: () => void;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        void withProjectMutation(projectId, () => gate);
        const first = order === 'select-then-delete' ? putEntry(projectId, target) : remove();
        await settle();
        const second = order === 'select-then-delete' ? remove() : putEntry(projectId, target);
        await settle();
        // Both requests are parked behind the held queue: neither has answered.
        const parked = Symbol('parked');
        const sentinel = new Promise<typeof parked>((resolve) => setTimeout(() => resolve(parked), 50));
        expect(await Promise.race([first, sentinel]), `${order} ${target} first parked`).toBe(parked);
        expect(await Promise.race([second, sentinel]), `${order} ${target} second parked`).toBe(parked);
        release();
        const [a, b] = await Promise.all([first, second]);
        const [selected, removed] = order === 'select-then-delete' ? [a, b] : [b, a];
        expect((selected as { status: number }).status, `${order} ${target} select`)
          .toBe(order === 'select-then-delete' ? 200 : 404);
        expect((removed as Response).status, `${order} ${target} delete`).toBe(200);
        expect(await readEntry(projectId), `${order} ${target}`).toBeUndefined();
        expect(await previewFile(projectId)).toMatchObject({ status: 200, file: 'index.html' });
      }
    }
  });

  it('returns 404 for an unknown project', async () => {
    const response = await putEntry('proj-does-not-exist', 'index.html');
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: 'PROJECT_NOT_FOUND' } });
  });
});

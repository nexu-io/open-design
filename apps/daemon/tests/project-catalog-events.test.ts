import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';
import {
  openProjectCatalogStream,
  type ProjectCatalogStream,
} from './helpers/project-catalog-stream.js';

// Every client of one daemon (web UI, `od` CLI, MCP bridge) changes the same
// project catalogue, but the web shell only learns about changes it made
// itself. The daemon therefore announces any change to what the project list
// shows on a catalogue-wide stream, and the web re-reads the list on receipt.
describe('GET /api/project-catalog/events', () => {
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

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const SIGNAL = 'event: project-catalog-changed';

  const openStream = () => openProjectCatalogStream(baseUrl);

  async function createProject(id: string, name = id) {
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name }),
    });
    expect(resp.status).toBe(200);
    return (await resp.json()) as { project: { id: string } };
  }

  async function listedProjects() {
    const resp = await fetch(`${baseUrl}/api/projects`);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { projects: Array<{ id: string; name: string }> };
    return body.projects;
  }

  async function withStream(run: (stream: ProjectCatalogStream) => Promise<void>) {
    const stream = await openStream();
    try {
      await run(stream);
    } finally {
      await stream.close();
    }
  }

  it('announces a project created by another client without leaking its content', async () => {
    await withStream(async (stream) => {
      await createProject('catalog-events-created');
      await stream.nextSignal();

      expect(stream.raw).toContain('"type":"project-catalog-changed"');
      expect(stream.raw).not.toContain('catalog-events-created');
    });
  });

  it('does not announce a create that the daemon rejected', async () => {
    await withStream(async (stream) => {
      const rejected = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'catalog-events-rejected' }),
      });
      expect(rejected.ok).toBe(false);

      await createProject('catalog-events-after-rejection');
      await stream.nextSignal();

      expect(stream.raw.split(SIGNAL).length - 1).toBe(1);
    });
  });

  it('announces a rename so the list shows the new name', async () => {
    await withStream(async (stream) => {
      await createProject('catalog-events-rename', 'Before rename');
      await stream.nextSignal();

      const patched = await fetch(`${baseUrl}/api/projects/catalog-events-rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'After rename' }),
      });
      expect(patched.ok).toBe(true);

      await stream.untilSeen(async () =>
        (await listedProjects()).some(
          (project) => project.id === 'catalog-events-rename' && project.name === 'After rename',
        ),
      );
    });
  });

  it('announces a delete so the list stops showing the project', async () => {
    await withStream(async (stream) => {
      await createProject('catalog-events-delete');
      await stream.nextSignal();

      const deleted = await fetch(`${baseUrl}/api/projects/catalog-events-delete`, {
        method: 'DELETE',
      });
      expect(deleted.ok).toBe(true);

      await stream.untilSeen(async () =>
        (await listedProjects()).every((project) => project.id !== 'catalog-events-delete'),
      );
    });
  });

  it('announces a duplicate so the copy appears in the list', async () => {
    await withStream(async (stream) => {
      await createProject('catalog-events-duplicate-source', 'Original');
      await stream.nextSignal();

      const duplicated = await fetch(
        `${baseUrl}/api/projects/catalog-events-duplicate-source/duplicate`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      expect(duplicated.ok).toBe(true);
      const { project } = (await duplicated.json()) as { project: { id: string } };

      await stream.untilSeen(async () =>
        (await listedProjects()).some((listed) => listed.id === project.id),
      );
    });
  });
});

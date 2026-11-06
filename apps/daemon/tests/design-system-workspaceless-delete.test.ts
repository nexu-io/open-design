import type { Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

const originalDataDir = process.env.OD_DATA_DIR;
const originalWorkspaceContextSource = process.env.OD_WORKSPACE_CONTEXT_SOURCE;
let dataDir: string | null = null;
let started: StartedServer | null = null;

afterEach(async () => {
  const current = started;
  started = null;
  if (current) {
    await Promise.resolve(current.shutdown?.());
    current.server.closeAllConnections?.();
    current.server.closeIdleConnections?.();
    if (current.server.listening) {
      await new Promise<void>((resolve) => current.server.close(() => resolve()));
    }
  }
  const { closeDatabase } = await import('../src/db.js');
  closeDatabase();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
  dataDir = null;
  if (originalDataDir === undefined) delete process.env.OD_DATA_DIR;
  else process.env.OD_DATA_DIR = originalDataDir;
  if (originalWorkspaceContextSource === undefined) {
    delete process.env.OD_WORKSPACE_CONTEXT_SOURCE;
  } else {
    process.env.OD_WORKSPACE_CONTEXT_SOURCE = originalWorkspaceContextSource;
  }
  vi.resetModules();
}, 30_000);

it('allows headerless deletion but rejects malformed workspace metadata in workspace-less local mode', async () => {
  // Given a workspace-less local daemon with a user-created design system
  dataDir = await mkdtemp(join(tmpdir(), 'od-design-system-workspaceless-delete-'));
  process.env.OD_DATA_DIR = dataDir;
  delete process.env.OD_WORKSPACE_CONTEXT_SOURCE;
  vi.resetModules();
  const { startServer } = await import('../src/server.js');
  started = await startServer({ port: 0, returnServer: true }) as StartedServer;

  const createResponse = await fetch(`${started.url}/api/design-systems`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Workspace-less Delete' }),
  });
  expect(createResponse.status).toBe(201);
  const created = await createResponse.json() as {
    designSystem: { id: string };
  };
  const designSystemUrl = `${started.url}/api/design-systems/${encodeURIComponent(created.designSystem.id)}`;

  const getResponse = await fetch(designSystemUrl);
  expect(getResponse.status).toBe(200);
  await expect(getResponse.json()).resolves.toMatchObject({ canMutate: true });

  // When the mutable design system is deleted without workspace headers
  const deleteResponse = await fetch(designSystemUrl, { method: 'DELETE' });
  const deleteBody: unknown = deleteResponse.status === 204
    ? null
    : await deleteResponse.json();

  // Then the local delete proceeds instead of requiring Team workspace context
  expect({ status: deleteResponse.status, body: deleteBody }).toEqual({
    status: 204,
    body: null,
  });

  const malformedCreateResponse = await fetch(`${started.url}/api/design-systems`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Malformed Workspace Delete' }),
  });
  expect(malformedCreateResponse.status).toBe(201);
  const malformedCreated = await malformedCreateResponse.json() as {
    designSystem: { id: string };
  };

  const malformedDeleteResponse = await fetch(
    `${started.url}/api/design-systems/${encodeURIComponent(malformedCreated.designSystem.id)}`,
    {
      method: 'DELETE',
      headers: { 'x-od-workspace-type': 'team' },
    },
  );

  expect(malformedDeleteResponse.status).toBe(400);
  await expect(malformedDeleteResponse.json()).resolves.toMatchObject({
    error: 'WORKSPACE_CONTEXT_REQUIRED',
  });
}, 60_000);

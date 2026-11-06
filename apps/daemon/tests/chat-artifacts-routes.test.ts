import type http from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';
import { closeDatabase, openDatabase } from '../src/db.js';
import { createChatArtifactBlobStore } from '../src/chat-artifacts/blob-store.js';
import { captureChatArtifactSnapshotFromBytes } from '../src/chat-artifacts/capture.js';
import { replaceMessageArtifacts } from '../src/chat-artifacts/store.js';

// ---------------------------------------------------------------------------
// GET /api/projects/:id/chat-artifact-snapshots/* and the message-refs route.
//
// The point of these routes is that a chat card can re-open the EXACT bytes a
// past turn produced, even after the workspace file at that path was
// overwritten — and that knowing a snapshot id gets a caller nothing without
// read authority over the owning project.
// ---------------------------------------------------------------------------

const bytes = (text: string) => Buffer.from(text, 'utf8');
const sha256 = (buf: Buffer) => `sha256:${createHash('sha256').update(buf).digest('hex')}`;

describe('chat artifact snapshot routes', () => {
  let server: http.Server;
  let baseUrl: string;
  const projectId = 'proj-chat-artifact-routes';
  const otherProjectId = 'proj-chat-artifact-other';
  const conversationId = 'conv-chat-artifact-routes';
  const messageId = 'msg-chat-artifact-routes';
  const original = bytes('the-original-image-bytes');
  let snapshotId = '';
  let workspaceArtifactId = '';

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;

    for (const id of [projectId, otherProjectId]) {
      const created = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, name: id }),
      });
      expect(created.status).toBe(200);
    }

    const dataDir = process.env.OD_DATA_DIR!;
    const dir = path.join(dataDir, 'projects', projectId);
    await mkdir(dir, { recursive: true });
    // The workspace file has ALREADY moved on to different bytes.
    await writeFile(path.join(dir, 'hero.png'), bytes('a-newer-overwriting-image'));

    const db = openDatabase(dataDir, { dataDir });
    db.prepare(
      `INSERT INTO conversations (id, project_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run(conversationId, projectId, Date.now(), Date.now());
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, position, created_at)
       VALUES (?, ?, 'assistant', '', 0, ?)`,
    ).run(messageId, conversationId, Date.now());

    const captured = await captureChatArtifactSnapshotFromBytes(
      { db, blobs: createChatArtifactBlobStore({ dataDir }) },
      {
        projectId,
        projectRelativePath: 'hero.png',
        kind: 'image',
        mime: 'image/png',
        bytes: original,
      },
    );
    expect(captured.state).toBe('ready');
    snapshotId = captured.snapshotId;
    workspaceArtifactId = captured.workspaceArtifactId;

    replaceMessageArtifacts(db, messageId, [{
      label: 'hero.png',
      kind: 'image',
      displayPolicy: 'immutable_snapshot',
      snapshotId,
      workspaceArtifactId,
    }]);
  });

  afterAll(async () => {
    closeDatabase();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('projects the message refs with a snapshot URL and no filesystem path', async () => {
    const res = await fetch(
      `${baseUrl}/api/projects/${projectId}/conversations/${conversationId}/messages/${messageId}/artifacts`,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { artifacts: Array<Record<string, unknown>> };
    expect(body.artifacts).toHaveLength(1);
    const ref = body.artifacts[0]!;
    // No open policy on the wire: a click always opens the workspace's latest
    // file, so there is nothing per-ref to announce.
    expect(ref).not.toHaveProperty('openPolicy');
    expect(ref.snapshotState).toBe('ready');
    expect(ref.snapshotUrl)
      .toBe(`/api/projects/${projectId}/chat-artifact-snapshots/${snapshotId}/content`);
    // No absolute path, no storage key, anywhere in the payload.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(process.env.OD_DATA_DIR!);
    expect(serialized).not.toContain('objects/');
  });

  it('serves the historical bytes, not the overwriting workspace file', async () => {
    const res = await fetch(
      `${baseUrl}/api/projects/${projectId}/chat-artifact-snapshots/${snapshotId}/content`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('etag')).toBe(`"${sha256(original)}"`);
    expect(res.headers.get('cache-control')).toContain('immutable');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf).toEqual(original);

    // And the current workspace file is genuinely different.
    const raw = await fetch(`${baseUrl}/api/projects/${projectId}/raw/hero.png`);
    expect(Buffer.from(await raw.arrayBuffer())).toEqual(bytes('a-newer-overwriting-image'));
  });

  it('answers a conditional request with 304 on the digest ETag', async () => {
    const res = await fetch(
      `${baseUrl}/api/projects/${projectId}/chat-artifact-snapshots/${snapshotId}/content`,
      { headers: { 'if-none-match': `"${sha256(original)}"` } },
    );
    expect(res.status).toBe(304);
  });

  it('404s a snapshot requested through a different project', async () => {
    const res = await fetch(
      `${baseUrl}/api/projects/${otherProjectId}/chat-artifact-snapshots/${snapshotId}/content`,
    );
    expect(res.status).toBe(404);
  });

  it('404s a thumbnail that was never captured instead of falling back', async () => {
    const res = await fetch(
      `${baseUrl}/api/projects/${projectId}/chat-artifact-snapshots/${snapshotId}/thumbnail`,
    );
    expect(res.status).toBe(404);
  });

  it('resolves the workspace artifact to its current path', async () => {
    const res = await fetch(
      `${baseUrl}/api/projects/${projectId}/workspace-artifacts/${workspaceArtifactId}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { artifact: Record<string, unknown> };
    expect(body.artifact.currentPath).toBe('hero.png');
    expect(body.artifact.deleted).toBe(false);
    expect(JSON.stringify(body)).not.toContain(process.env.OD_DATA_DIR!);
  });

  it('reports the digest and byte size on the metadata endpoint, not on the card', async () => {
    const res = await fetch(
      `${baseUrl}/api/projects/${projectId}/chat-artifact-snapshots/${snapshotId}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { snapshot: Record<string, unknown> };
    expect(body.snapshot.contentDigest).toBe(sha256(original));
    expect(body.snapshot.byteSize).toBe(original.byteLength);
    expect(body.snapshot.sourcePathAtCapture).toBe('hero.png');
    expect(JSON.stringify(body)).not.toContain(process.env.OD_DATA_DIR!);
  });

  it('404s an unknown snapshot id', async () => {
    const res = await fetch(
      `${baseUrl}/api/projects/${projectId}/chat-artifact-snapshots/00000000-0000-4000-8000-000000000000`,
    );
    expect(res.status).toBe(404);
  });
});

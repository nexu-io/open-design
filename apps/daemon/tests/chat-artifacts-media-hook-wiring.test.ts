// ---------------------------------------------------------------------------
// GUARDRAIL: the media route actually hands `generateMedia` a snapshot hook.
//
// `routes/media.ts` passes an `onBytesWritten` callback into `generateMedia`.
// That callback is the STRONGEST capture path in the design (§5.1.1): it holds
// the provider's own bytes in memory, so no later overwrite of the same output
// name can be mistaken for this turn's result. Every other path re-reads a file
// and can only ever prove "this is what is at that path now".
//
// The hook had zero test coverage. Deleting it broke nothing red: the capture
// module's own tests still passed (they call the capture function directly),
// the route still returned 202, the file was still written, and the only
// symptom was a chat card that silently drifted to the newest bytes.
//
// This test refuses to look at the hook. It drives the real HTTP route, lets
// the real generator write real bytes, then OVERWRITES the workspace file and
// asserts the stored snapshot still returns the provider's original bytes.
// ---------------------------------------------------------------------------

import type http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { startServer } from '../src/server.js';
import { closeDatabase, openDatabase } from '../src/db.js';
import { createChatArtifactBlobStore } from '../src/chat-artifacts/blob-store.js';

const projectId = 'proj-media-hook-wiring';

describe('media generation freezes provider bytes through the route hook', () => {
  let server: http.Server;
  let baseUrl: string;
  let dataDir: string;

  beforeAll(async () => {
    // The unintegrated-provider branch renders deterministic local bytes with
    // no network call, which is exactly what this test needs: real bytes from
    // the real generator, no provider credentials, no flake.
    vi.stubEnv('OD_MEDIA_ALLOW_STUBS', '1');
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
    dataDir = process.env.OD_DATA_DIR!;

    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: projectId }),
    });
    expect(created.status).toBe(200);
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    closeDatabase();
    vi.unstubAllEnvs();
  });

  it('stores the exact bytes the provider produced, not whatever later takes the path', async () => {
    const generated = await fetch(`${baseUrl}/api/projects/${projectId}/media/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        surface: 'image',
        model: 'midjourney-v7',
        prompt: 'a guardrail',
        output: 'hero.png',
      }),
    });
    expect(generated.status).toBe(202);
    const { taskId } = (await generated.json()) as { taskId: string };
    expect(typeof taskId).toBe('string');

    // Wait for the generator's write to land.
    let status = '';
    for (let attempt = 0; attempt < 20 && status !== 'done' && status !== 'failed'; attempt += 1) {
      const waited = await fetch(`${baseUrl}/api/media/tasks/${taskId}/wait`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ timeoutMs: 2_000 }),
      });
      expect(waited.status).toBe(200);
      status = ((await waited.json()) as { status: string }).status;
    }
    expect(status).toBe('done');

    const workspaceFile = path.join(dataDir, 'projects', projectId, 'hero.png');
    const providerBytes = await readFile(workspaceFile);
    expect(providerBytes.byteLength).toBeGreaterThan(0);

    // The workspace moves on. This is the exact event the snapshot exists for.
    const overwritten = Buffer.from('a-completely-different-later-image', 'utf8');
    await writeFile(workspaceFile, overwritten);

    const db = openDatabase(dataDir, { dataDir });
    const snapshot = db
      .prepare(
        `SELECT s.id AS id, s.capture_state AS captureState, s.source_path_at_capture AS sourcePath,
                b.storage_key AS storageKey, b.byte_size AS byteSize
           FROM chat_artifact_snapshots AS s
           JOIN chat_artifact_blobs AS b ON b.digest = s.content_digest
          WHERE s.project_id = ? AND s.media_task_id = ?`,
      )
      .get(projectId, taskId) as
      | { id: string; captureState: string; sourcePath: string; storageKey: string; byteSize: number }
      | undefined;

    // A missing row means the route never handed the generator a hook — the
    // one place a provider's in-memory bytes were still reachable.
    expect(snapshot, 'the media route captured a snapshot bound to this task').toBeTruthy();
    expect(snapshot!.captureState).toBe('ready');
    expect(snapshot!.sourcePath).toBe('hero.png');

    const blobs = createChatArtifactBlobStore({ dataDir });
    const stored = await blobs.readBlob(snapshot!.storageKey);
    expect(stored.equals(providerBytes)).toBe(true);
    expect(stored.equals(overwritten)).toBe(false);
  }, 60_000);
});

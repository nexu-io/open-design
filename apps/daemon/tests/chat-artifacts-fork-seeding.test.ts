// ---------------------------------------------------------------------------
// GUARDRAIL: forking a conversation carries its artifact evidence.
//
// A fork copies each source message under a FRESH id. `message_artifacts` rows
// are keyed by message id and cascade-delete with the message, so the copy owns
// nothing until `seedMessageArtifactRefsIfAbsent` re-seeds it from the DTO the
// projection just produced. That function had zero test hits: removing its one
// call site left every test green and every forked conversation's cards blank,
// because the transcript still copied fine and only the refs vanished.
//
// The two properties that matter, and the two ways to get this wrong:
//
//   * the copy gets its OWN ref rows pointing at the SAME snapshot — not a
//     duplicated blob, and not a shared row that one branch's delete would
//     take from the other.
//   * refs are seeded only when the message has none, so a browser PUT echoing
//     a stale projection cannot overwrite what the daemon wrote at the run's
//     terminal chokepoint.
// ---------------------------------------------------------------------------

import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';
import { closeDatabase, openDatabase } from '../src/db.js';
import { createChatArtifactBlobStore } from '../src/chat-artifacts/blob-store.js';
import { captureChatArtifactSnapshotFromBytes } from '../src/chat-artifacts/capture.js';
import { listMessageArtifactRows, replaceMessageArtifacts } from '../src/chat-artifacts/store.js';

const projectId = 'proj-fork-seeding';
const messageId = 'msg-fork-seeding-source';

describe('conversation fork re-seeds artifact refs onto the copied messages', () => {
  let server: http.Server;
  let baseUrl: string;
  let dataDir: string;
  let sourceConversationId = '';
  let snapshotId = '';

  beforeAll(async () => {
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

    const convRes = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'source' }),
    });
    expect(convRes.status).toBe(200);
    sourceConversationId = ((await convRes.json()) as { conversation: { id: string } })
      .conversation.id;

    const saved = await fetch(
      `${baseUrl}/api/projects/${projectId}/conversations/${sourceConversationId}/messages/${messageId}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: messageId, role: 'assistant', content: 'here is your image' }),
      },
    );
    expect(saved.status).toBe(200);

    // The turn's evidence, produced the way a real capture produces it.
    const db = openDatabase(dataDir, { dataDir });
    const blobs = createChatArtifactBlobStore({ dataDir });
    const capture = await captureChatArtifactSnapshotFromBytes(
      { db, blobs },
      {
        projectId,
        projectRelativePath: 'hero.png',
        kind: 'image',
        mime: 'image/png',
        bytes: Buffer.from('the-frozen-turn-bytes', 'utf8'),
      },
    );
    expect(capture.state).toBe('ready');
    snapshotId = capture.snapshotId;
    replaceMessageArtifacts(db, messageId, [
      {
        snapshotId,
        workspaceArtifactId: capture.workspaceArtifactId,
        displayPolicy: 'immutable_snapshot',
        label: 'hero.png',
        kind: 'image',
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    closeDatabase();
  });

  it('gives the forked copy its own ref rows pointing at the same snapshot', async () => {
    const forked = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'branch',
        seedFromConversationId: sourceConversationId,
        forkAfterMessageId: messageId,
      }),
    });
    expect(forked.status).toBe(200);
    const forkedId = ((await forked.json()) as { conversation: { id: string } }).conversation.id;
    expect(forkedId).not.toBe(sourceConversationId);

    const listed = await fetch(
      `${baseUrl}/api/projects/${projectId}/conversations/${forkedId}/messages`,
    );
    expect(listed.status).toBe(200);
    const { messages } = (await listed.json()) as {
      messages: Array<{ id: string; artifactRefs?: Array<{ snapshotId?: string; snapshotUrl?: string }> }>;
    };
    expect(messages).toHaveLength(1);
    const copy = messages[0]!;
    expect(copy.id).not.toBe(messageId);

    // The card the user actually sees on the branch.
    expect(copy.artifactRefs, 'the forked message projects its own artifact refs').toBeTruthy();
    expect(copy.artifactRefs).toHaveLength(1);
    expect(copy.artifactRefs![0]!.snapshotId).toBe(snapshotId);

    const db = openDatabase(dataDir, { dataDir });
    const copyRows = listMessageArtifactRows(db, copy.id);
    const sourceRows = listMessageArtifactRows(db, messageId);
    expect(copyRows).toHaveLength(1);
    expect(sourceRows).toHaveLength(1);
    // Independent rows, shared snapshot: deleting one branch cannot take the
    // other branch's evidence with it.
    expect(copyRows[0]!.id).not.toBe(sourceRows[0]!.id);
    expect(copyRows[0]!.snapshotId).toBe(sourceRows[0]!.snapshotId);

    // Shared, never copied: one snapshot, one blob, two refs.
    const blobCount = db
      .prepare(`SELECT COUNT(*) AS n FROM chat_artifact_blobs`)
      .get() as { n: number };
    const snapshotCount = db
      .prepare(`SELECT COUNT(*) AS n FROM chat_artifact_snapshots WHERE project_id = ?`)
      .get(projectId) as { n: number };
    expect(snapshotCount.n).toBe(1);
    expect(blobCount.n).toBe(1);
  });

  it('will not let a stale client projection overwrite refs the daemon already wrote', async () => {
    const db = openDatabase(dataDir, { dataDir });
    const before = listMessageArtifactRows(db, messageId);
    expect(before).toHaveLength(1);

    const echoed = await fetch(
      `${baseUrl}/api/projects/${projectId}/conversations/${sourceConversationId}/messages/${messageId}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: messageId,
          role: 'assistant',
          content: 'here is your image',
          artifactRefs: [
            {
              label: 'stale.png',
              kind: 'image',
              displayPolicy: 'latest_with_static_preview',
            },
          ],
        }),
      },
    );
    expect(echoed.status).toBe(200);

    const after = listMessageArtifactRows(db, messageId);
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(before[0]!.id);
    expect(after[0]!.labelAtCapture).toBe('hero.png');
    expect(after[0]!.snapshotId).toBe(snapshotId);
  });
});

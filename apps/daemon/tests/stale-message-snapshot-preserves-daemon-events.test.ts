import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

// #6396 regression: the daemon is the single writer of a daemon-backed
// assistant message's run events / content / last-run-event-id / run status.
// The web client still saves whole-message snapshots through
// PUT /messages/:mid, and a STALE snapshot (captured in memory before a
// reconnect / project-switch, then PUT after the daemon appended more events)
// used to overwrite `events_json` and wipe early events — including the
// `status:model` event the UI renders the Model module from.
//
// This drives a real run to completion so the daemon persists the early event,
// then replays a stale snapshot through the real PUT route and asserts the
// early event + content survived.

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = { id: string; status: string };

type PersistedEvent = {
  kind?: string;
  label?: string;
  detail?: string;
  text?: string;
};

type StoredMessage = {
  id: string;
  role: string;
  content?: string;
  runId?: string;
  runStatus?: string;
  lastRunEventId?: string | null;
  events?: PersistedEvent[];
  feedback?: { rating?: number };
  startedAt?: number;
  endedAt?: number;
};

type RunHandles = {
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  status: RunStatus;
};

describe('stale web message snapshot does not wipe daemon-owned run events', () => {
  const originalEnv = snapshotEnv();
  let started: StartedServer | null = null;
  let binDir: string | null = null;

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (binDir) await removeTempDir(binDir);
    binDir = null;
    restoreEnv(originalEnv);
  });

  it('retains an early daemon-persisted event after a stale web snapshot PUT', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-stale-put-msg-bin-'));
    const fakeClaude = await writeCleanClaude(binDir, 'claude-stale-put');

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createConversation(started.url);
    const { assistantMessageId, status } = await sendRunAndWait(
      started.url,
      projectId,
      conversationId,
    );
    expect(status.status).toBe('succeeded');

    // The daemon persisted the early status event + text before we replay the
    // stale snapshot.
    const before = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      assistantMessageId,
    );
    expect(before).not.toBeNull();
    expect(
      before?.events?.some((event) => event.kind === 'status' && event.label === 'initializing'),
    ).toBe(true);
    expect(before?.content).toBe('Hello from the model.');

    // Simulate TWO stale web snapshots, both captured before the daemon
    // appended any run events AND before `/api/runs` assigned a run id — so the
    // payload omits `runId` entirely (a genuinely pre-run snapshot). PUT both
    // after the daemon persisted them. events/content/runStatus are all the
    // pre-run values; feedback is a genuine client-owned metadata write that
    // must still land.
    const staleSnapshot = (runId: string | undefined) => ({
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      ...(runId ? { runId } : {}),
      runStatus: 'running',
      events: [],
      lastRunEventId: null,
      // An explicitly OLDER startedAt: the daemon-written first-start time
      // must not regress to this earlier value (looper review on #6418).
      startedAt: (before?.startedAt ?? 0) - 1000,
      feedback: {
        rating: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    });
    const putUrl = `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(assistantMessageId)}`;
    const firstPut = await fetch(putUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(staleSnapshot(undefined)),
    });
    expect(firstPut.status).toBe(200);
    // A second stale PUT (no runId, empty events) must not be able to drop the
    // message back out of the protected path now that `run_id` was preserved.
    const secondPut = await fetch(putUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(staleSnapshot(undefined)),
    });
    expect(secondPut.status).toBe(200);

    // The daemon-owned run events/content AND the daemon-ownership marker
    // (runId) must survive both stale PUTs.
    const after = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      assistantMessageId,
    );
    expect(after?.runId).toBe(before?.runId);
    expect(after?.content).toBe('Hello from the model.');
    expect(
      after?.events?.some((event) => event.kind === 'status' && event.label === 'initializing'),
      'early daemon-persisted event should survive stale web snapshot PUTs',
    ).toBe(true);
    expect(after?.runStatus).toBe('succeeded');
    // Daemon-written lifecycle timestamps survive the stale PUTs too.
    expect(after?.startedAt).toBe(before?.startedAt);
    expect(after?.endedAt).toBe(before?.endedAt);
    // Client-owned metadata writes still land on daemon-backed messages.
    expect(after?.feedback?.rating).toBe(1);
  });

  it('does not regress a daemon-written terminal run status from an equal-length stale snapshot', async () => {
    // The daemon writes the terminal run_status separately (no event appended),
    // so a web snapshot captured after the final event but before that write has
    // the SAME event count while still carrying a non-terminal status. It must
    // not be able to regress the stored terminal status (#6396 / looper review).
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-terminal-latch-bin-'));
    const fakeClaude = await writeCleanClaude(binDir, 'claude-terminal-latch');

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createConversation(started.url);
    const { assistantMessageId, status } = await sendRunAndWait(
      started.url,
      projectId,
      conversationId,
    );
    expect(status.status).toBe('succeeded');

    const before = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      assistantMessageId,
    );
    expect(before?.runStatus).toBe('succeeded');
    expect(before?.events?.length).toBeGreaterThan(0);

    // Same event count, but the pre-finalize status — the exact shape that
    // previously slipped through the length-based freshness check.
    const equalLengthSnapshot = {
      id: assistantMessageId,
      role: 'assistant',
      content: before?.content ?? '',
      runId: before?.runId,
      runStatus: 'running',
      events: before?.events ?? [],
    };
    const putResponse = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(assistantMessageId)}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(equalLengthSnapshot),
      },
    );
    expect(putResponse.status).toBe(200);

    const after = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      assistantMessageId,
    );
    expect(after?.runStatus, 'terminal run status must not regress').toBe('succeeded');
    expect(after?.runId).toBe(before?.runId);
  });

  it('preserves the stored event cursor on equal-length stale snapshots', async () => {
    // nettee review (#6418): the accepted merge path must not let an
    // equal-length snapshot omit or rewind lastRunEventId, or reattach can
    // replay from the wrong cursor.
    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createConversation(started.url);
    const messageId = `cursor_${randomUUID()}`;
    const url = `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`;

    const seeded = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'assistant',
        content: 'model output',
        runId: 'run-cursor',
        runStatus: 'running',
        lastRunEventId: '5',
        events: [
          { kind: 'status', label: 'model' },
          { kind: 'text', text: 'model output' },
        ],
      }),
    });
    expect(seeded.status).toBe(200);

    const equalLengthWithoutCursor = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'assistant',
        content: 'model output',
        runId: 'run-cursor',
        runStatus: 'running',
        events: [
          { kind: 'status', label: 'model' },
          { kind: 'text', text: 'model output' },
        ],
      }),
    });
    expect(equalLengthWithoutCursor.status).toBe(200);
    expect(
      (await fetchAssistantMessage(started.url, projectId, conversationId, messageId))
        ?.lastRunEventId,
    ).toBe('5');

    const equalLengthOlderCursor = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'assistant',
        content: 'model output',
        runId: 'run-cursor',
        runStatus: 'running',
        lastRunEventId: '3',
        events: [
          { kind: 'status', label: 'model' },
          { kind: 'text', text: 'model output' },
        ],
      }),
    });
    expect(equalLengthOlderCursor.status).toBe(200);
    expect(
      (await fetchAssistantMessage(started.url, projectId, conversationId, messageId))
        ?.lastRunEventId,
    ).toBe('5');

    const equalLengthNewerCursor = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'assistant',
        content: 'model output',
        runId: 'run-cursor',
        runStatus: 'running',
        lastRunEventId: '6',
        events: [
          { kind: 'status', label: 'model' },
          { kind: 'text', text: 'model output' },
        ],
      }),
    });
    expect(equalLengthNewerCursor.status).toBe(200);
    expect(
      (await fetchAssistantMessage(started.url, projectId, conversationId, messageId))
        ?.lastRunEventId,
    ).toBe('6');

    const opaqueMessageId = `cursor_opaque_${randomUUID()}`;
    const opaqueUrl = `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(opaqueMessageId)}`;
    const opaqueSeed = await fetch(opaqueUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: opaqueMessageId,
        role: 'assistant',
        content: 'model output',
        runId: 'run-cursor-opaque',
        runStatus: 'running',
        lastRunEventId: 'evt-5',
        events: [{ kind: 'text', text: 'model output' }],
      }),
    });
    expect(opaqueSeed.status).toBe(200);

    const equalLengthOpaqueOlderCursor = await fetch(opaqueUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: opaqueMessageId,
        role: 'assistant',
        content: 'model output',
        runId: 'run-cursor-opaque',
        runStatus: 'running',
        lastRunEventId: 'evt-3',
        events: [{ kind: 'text', text: 'model output' }],
      }),
    });
    expect(equalLengthOpaqueOlderCursor.status).toBe(200);
    expect(
      (await fetchAssistantMessage(started.url, projectId, conversationId, opaqueMessageId))
        ?.lastRunEventId,
    ).toBe('evt-5');
  });

  it('preserves daemon content on equal-length stale snapshots', async () => {
    // nettee review (#6418): the accepted equal-length merge path must not let
    // a stale client snapshot clear content after the daemon has already
    // written it. This can happen when events persisted before the client
    // reducer/content update, so event counts match while content is stale.
    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createConversation(started.url);
    const messageId = `content_${randomUUID()}`;
    const url = `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`;
    const events = [
      { kind: 'status', label: 'model' },
      { kind: 'text', text: 'model output' },
    ];

    const seeded = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'assistant',
        content: 'model output',
        runId: 'run-content',
        runStatus: 'running',
        lastRunEventId: '2',
        events,
      }),
    });
    expect(seeded.status).toBe(200);

    const staleEmptyContent = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'assistant',
        content: '',
        runId: 'run-content',
        runStatus: 'running',
        lastRunEventId: '2',
        events,
      }),
    });
    expect(staleEmptyContent.status).toBe(200);
    expect(
      (await fetchAssistantMessage(started.url, projectId, conversationId, messageId))
        ?.content,
    ).toBe('model output');

    const stalePartialContent = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'assistant',
        content: 'model',
        runId: 'run-content',
        runStatus: 'running',
        lastRunEventId: '2',
        events,
      }),
    });
    expect(stalePartialContent.status).toBe(200);
    expect(
      (await fetchAssistantMessage(started.url, projectId, conversationId, messageId))
        ?.content,
    ).toBe('model output');
  });

  it('preserves fuller daemon content when a stale snapshot has more events', async () => {
    // #6418 review: event growth is not a freshness proof for content. A delayed
    // whole-message snapshot can carry one additional client/status event while
    // still holding older partial text.
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-event-growth-content-bin-'));
    const fakeClaude = await writeCleanClaude(binDir, 'claude-event-growth-content');

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createConversation(started.url);
    const { assistantMessageId, status } = await sendRunAndWait(
      started.url,
      projectId,
      conversationId,
    );
    expect(status.status).toBe('succeeded');

    const before = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      assistantMessageId,
    );
    expect(before?.runId).toBeTypeOf('string');
    expect(before?.content).toBe('Hello from the model.');
    expect(before?.events?.length).toBeGreaterThan(0);

    const staleSnapshot = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(assistantMessageId)}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: assistantMessageId,
          role: 'assistant',
          content: 'Hello',
          runId: before?.runId,
          runStatus: before?.runStatus,
          lastRunEventId: before?.lastRunEventId,
          events: [
            ...(before?.events ?? []),
            { kind: 'status', label: 'client-only-status' },
          ],
        }),
      },
    );
    expect(staleSnapshot.status).toBe(200);

    const after = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      assistantMessageId,
    );
    expect(after?.content).toBe('Hello from the model.');
    expect(after?.events?.length).toBe((before?.events?.length ?? 0) + 1);
  });

  it('lets a metadata update write a fresh endedAt while preserving daemon events', async () => {
    // The retry flow persists the completion timestamp as a metadata update
    // whose events array is empty (the web never carries the daemon's detailed
    // events). It must not be treated as a stale full snapshot: the fresh
    // endedAt should land while the daemon-owned events/status survive.
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-meta-update-bin-'));
    const fakeClaude = await writeCleanClaude(binDir, 'claude-meta-update');

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createConversation(started.url);
    const { assistantMessageId, status } = await sendRunAndWait(
      started.url,
      projectId,
      conversationId,
    );
    expect(status.status).toBe('succeeded');

    const before = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      assistantMessageId,
    );
    expect(before?.events?.length).toBeGreaterThan(0);
    expect(before?.endedAt).toBeTypeOf('number');

    // Metadata-only update: empty events, matching terminal status, a NEW
    // endedAt the web observed on completion.
    const freshEndedAt = Date.now() + 10_000;
    const metadataUpdate = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      runStatus: 'succeeded',
      events: [],
      endedAt: freshEndedAt,
    };
    const putResponse = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(assistantMessageId)}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(metadataUpdate),
      },
    );
    expect(putResponse.status).toBe(200);

    const after = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      assistantMessageId,
    );
    // The web's fresh endedAt lands (metadata write), while daemon-owned
    // events and terminal status survive.
    expect(after?.endedAt).toBe(freshEndedAt);
    expect(after?.events?.length).toBeGreaterThan(0);
    expect(after?.runStatus).toBe('succeeded');
  });

  it('rejects a message id that belongs to another conversation', async () => {
    // The route must not read or rewrite a daemon-backed message through a
    // different conversation's endpoint (looper review on #6418).
    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createConversation(started.url);

    // A second conversation in the same project.
    const secondConvResponse = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'other conversation' }),
      },
    );
    expect(secondConvResponse.status).toBe(200);
    const secondConv = (await secondConvResponse.json()) as { conversation: { id: string } };

    // Seed a daemon-backed message in conversation 1.
    const messageId = `cross_conv_${randomUUID()}`;
    const seedUrl = `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`;
    const seeded = await fetch(seedUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'assistant',
        content: 'original',
        runId: 'run-cross-conv',
        runStatus: 'succeeded',
        events: [{ kind: 'status', label: 'model', detail: 'm' }],
        startedAt: 1000,
        endedAt: 2000,
      }),
    });
    expect(seeded.status).toBe(200);

    // PUT the same id through conversation 2's endpoint: must be rejected.
    const wrongConvUrl = `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(secondConv.conversation.id)}/messages/${encodeURIComponent(messageId)}`;
    const rejected = await fetch(wrongConvUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'assistant',
        content: 'overwritten',
        runStatus: 'running',
        events: [],
      }),
    });
    expect(rejected.status).toBe(404);

    // Conversation 1's message is untouched.
    const stored = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      messageId,
    );
    expect(stored?.content).toBe('original');
    expect(stored?.runStatus).toBe('succeeded');
  });

  it('lets a mock-agent flow persist events/runStatus when the daemon never wrote any', async () => {
    // e2e Playwright suites mock the run SSE end-to-end, so the daemon never
    // persists events for the assistant message — the web client is the only
    // writer. The no-regression guard must NOT block that: a web write that
    // grows the stored event list (from empty to non-empty) must flow through,
    // including the terminal runStatus. Regression for the UI P0
    // app-restoration suite after the #6396 guard.
    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createConversation(started.url);
    const messageId = `mock_flow_${randomUUID()}`;
    const url = `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`;

    // Web creates the daemon-backed-looking row (runId from the mocked run
    // response) with no events yet.
    const created = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'assistant',
        content: '',
        runId: 'mock-run',
        runStatus: 'running',
        events: [],
      }),
    });
    expect(created.status).toBe(200);

    // Web streams the artifact via mocked SSE and persists the final snapshot.
    const persisted = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'assistant',
        content: 'artifact payload',
        runId: 'mock-run',
        runStatus: 'succeeded',
        events: [
          { kind: 'status', label: 'starting', detail: 'mock-agent' },
          { kind: 'text', text: 'artifact payload' },
        ],
      }),
    });
    expect(persisted.status).toBe(200);

    const stored = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      messageId,
    );
    expect(stored?.runStatus).toBe('succeeded');
    expect(stored?.content).toBe('artifact payload');
    expect(stored?.events).toEqual([
      { kind: 'status', label: 'starting', detail: 'mock-agent' },
      { kind: 'text', text: 'artifact payload' },
    ]);
  });

  it('lets a client-owned terminal snapshot with fewer events finalize the row', async () => {
    // nettee on #6418: if the daemon has no live record for the run, the
    // client/mock path is the writer. A terminal PUT with fewer/omitted events
    // must be able to finalize status/content instead of preserving a stale
    // non-terminal row forever.
    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createConversation(started.url);
    const messageId = `client_terminal_${randomUUID()}`;
    const url = `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`;

    const seeded = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'assistant',
        content: 'client partial',
        runId: 'mock-unknown',
        runStatus: 'running',
        lastRunEventId: '2',
        events: [
          { kind: 'status', label: 'starting', detail: 'mock' },
          { kind: 'text', text: 'client partial' },
        ],
      }),
    });
    expect(seeded.status).toBe(200);

    const terminal = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'assistant',
        content: 'client failed result',
        runId: 'mock-unknown',
        runStatus: 'failed',
        lastRunEventId: '1',
        events: [],
        endedAt: 5000,
      }),
    });
    expect(terminal.status).toBe(200);

    const stored = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      messageId,
    );
    expect(stored?.runStatus).toBe('failed');
    expect(stored?.content).toBe('client failed result');
    expect(stored?.events).toEqual([]);
    expect(stored?.lastRunEventId).toBe('2');
    expect(stored?.endedAt).toBe(5000);
  });

  it('does not let a stale pre-run snapshot clear the pinned runId', async () => {
    // nettee review (#6418): a daemon-backed row pinned by /api/runs (runId
    // set, runStatus queued, no events yet) followed by a stale web snapshot
    // that omits runId must not null `run_id` — otherwise the row drops out of
    // the protected path and the next stale PUT can wipe events once they land.
    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createConversation(started.url);
    const messageId = `pinned_${randomUUID()}`;
    const url = `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`;

    // Daemon pins the run (assistant placeholder + runId + start time, no
    // events yet).
    const pinned = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'assistant',
        content: '',
        runId: 'run-pinned',
        runStatus: 'queued',
        events: [],
        startedAt: 100,
      }),
    });
    expect(pinned.status).toBe(200);

    // A stale pre-run snapshot (no runId, no startedAt) lands after the pin.
    const stale = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'assistant',
        content: 'client copy',
        runStatus: 'running',
        events: [],
      }),
    });
    expect(stale.status).toBe(200);

    const stored = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      messageId,
    );
    // run_id and the pin-written start time must survive the stale snapshot;
    // the non-terminal status the client carries is still allowed to flow.
    expect(stored?.runId).toBe('run-pinned');
    expect(stored?.runStatus).toBe('running');
    expect(stored?.startedAt).toBe(100);
  });

  it('lets a same-message retry snapshot replace the pinned generation', async () => {
    // mrcfps review (#6418): pinAssistantMessageOnRunCreate is the generation
    // boundary — it rebinds run_id and resets the run-owned fields to the new
    // run's start, so the retry's final PUT shares the pinned runId with a
    // non-terminal stored status and must flow through the no-regression guard
    // even though it carries fewer client events and a fresh terminal status.
    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createConversation(started.url);
    const messageId = `retry_${randomUUID()}`;
    const url = `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`;

    // Post-pin shape: the retry's run B is pinned with a non-terminal status,
    // no events yet, and its own startedAt (the old attempt was reset).
    const pinned = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'assistant',
        content: '',
        runId: 'run-b',
        runStatus: 'running',
        events: [],
        startedAt: 100,
      }),
    });
    expect(pinned.status).toBe(200);

    // The retry's final PUT carries the new attempt (fewer events + terminal).
    const retried = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'assistant',
        content: 'retry result',
        runId: 'run-b',
        runStatus: 'succeeded',
        events: [{ kind: 'text', text: 'retry result' }],
      }),
    });
    expect(retried.status).toBe(200);

    const stored = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      messageId,
    );
    expect(stored?.runId).toBe('run-b');
    expect(stored?.runStatus).toBe('succeeded');
    expect(stored?.content).toBe('retry result');
    expect(stored?.events).toEqual([{ kind: 'text', text: 'retry result' }]);
  });

  it('discards a delayed PUT from a superseded run generation', async () => {
    // nettee P2 on #6418: after a retry pins run B, a delayed snapshot from the
    // old run A must not repopulate run B's data — the guard keeps the current
    // generation's run fields while letting metadata land.
    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createConversation(started.url);
    const messageId = `generation_${randomUUID()}`;
    const url = `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`;

    // Current generation run B is pinned with its terminal result.
    const pinned = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'assistant',
        content: 'run-b result',
        runId: 'run-b',
        runStatus: 'succeeded',
        events: [{ kind: 'text', text: 'run-b result' }],
      }),
    });
    expect(pinned.status).toBe(200);

    // A delayed snapshot from the superseded run A lands afterwards.
    const delayed = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'assistant',
        content: 'run-a old attempt',
        runId: 'run-a',
        runStatus: 'succeeded',
        events: [{ kind: 'text', text: 'run-a old attempt' }],
      }),
    });
    expect(delayed.status).toBe(200);

    const stored = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      messageId,
    );
    expect(stored?.runId).toBe('run-b');
    expect(stored?.runStatus).toBe('succeeded');
    expect(stored?.content).toBe('run-b result');
    expect(stored?.events).toEqual([{ kind: 'text', text: 'run-b result' }]);
  });

  it('still lets the client write non-daemon-backed messages', async () => {
    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createConversation(started.url);
    const messageId = `user_stale_put_${randomUUID()}`;
    const url = `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`;

    const created = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: messageId, role: 'user', content: 'original' }),
    });
    expect(created.status).toBe(200);

    const updated = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'user',
        content: 'updated',
        events: [{ kind: 'text', text: 'client event' }],
      }),
    });
    expect(updated.status).toBe(200);

    const stored = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      messageId,
    );
    expect(stored?.content).toBe('updated');
    expect(stored?.events).toEqual([{ kind: 'text', text: 'client event' }]);
  });
});

// Fake Claude CLI: emits the init frame (persisted as the early status event),
// one text block (persisted as a text event + content), then completes cleanly.
async function writeCleanClaude(dir: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(
    bin,
    `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.includes('--version')) { console.log('claude-code 1.0.0-stale-put'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: claude -p'); process.exit(0); }
const W = (o) => fs.writeSync(1, JSON.stringify(o) + '\\n');
W({ type: 'system', subtype: 'init', model: 'stale-put-test-model' });
W({ type: 'assistant', message: { id: 'm-stale-put', content: [{ type: 'text', text: 'Hello from the model.' }], stop_reason: 'end_turn' } });
setTimeout(() => process.exit(0), 20);
`,
    'utf8',
  );
  await chmod(bin, 0o755);
  return bin;
}

function snapshotEnv(): Record<string, string | undefined> {
  return {
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    OPEN_DESIGN_TELEMETRY_RELAY_URL: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL,
    POSTHOG_KEY: process.env.POSTHOG_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
  };
}

function restoreEnv(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function putConfig(url: string, patch: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  expect(response.status).toBe(200);
}

async function createConversation(
  url: string,
): Promise<{ projectId: string; conversationId: string }> {
  const projectId = `stale_put_msg_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Stale snapshot message smoke',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = (await projectResponse.json()) as { conversationId: string; id: string };
  return { projectId, conversationId: projectBody.conversationId };
}

async function sendRunAndWait(
  url: string,
  projectId: string,
  conversationId: string,
): Promise<RunHandles> {
  const assistantMessageId = `assistant_stale_put_msg_${randomUUID()}`;
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'stale-put-msg-test',
      'x-od-analytics-session-id': 'stale-put-msg-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId,
      clientRequestId: `client_stale_put_msg_${randomUUID()}`,
      agentId: 'claude',
      message: 'please do the task',
      currentPrompt: 'please do the task',
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = (await runResponse.json()) as { runId: string };
  const status = await waitForRun(url, body.runId);
  return { projectId, conversationId, assistantMessageId, status };
}

async function waitForRun(url: string, runId: string): Promise<RunStatus> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
    expect(response.status).toBe(200);
    const run = (await response.json()) as RunStatus;
    if (run.status === 'failed' || run.status === 'succeeded' || run.status === 'canceled') {
      return run;
    }
    await delay(100);
  }
  throw new Error(`run ${runId} did not finish`);
}

async function fetchAssistantMessage(
  url: string,
  projectId: string,
  conversationId: string,
  assistantMessageId: string,
): Promise<StoredMessage | null> {
  const response = await fetch(
    `${url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { messages?: StoredMessage[] };
  return body.messages?.find((message) => message.id === assistantMessageId) ?? null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = {
  url: string;
  server: http.Server;
  shutdown?: () => Promise<void> | void;
};

describe('POST /api/runs headless fallbacks', () => {
  let started: StartedServer | null = null;
  const oldPath = process.env.PATH;
  const oldAgentHome = process.env.OD_AGENT_HOME;

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
    if (oldAgentHome === undefined) delete process.env.OD_AGENT_HOME;
    else process.env.OD_AGENT_HOME = oldAgentHome;
  });

  it('rejects incomplete BYOK OpenCode config before creating a run', async () => {
    started = await startTestServer();
    const incompleteConfigs = [
      {
        name: 'provider',
        body: {
          agentId: 'byok-opencode',
          message: 'Headless BYOK prompt',
          model: 'gpt-4o',
        },
      },
      {
        name: 'api key',
        body: {
          agentId: 'byok-opencode',
          message: 'Headless BYOK prompt',
          model: 'gpt-4o',
          byokProvider: {
            protocol: 'openai',
            apiKey: '',
            baseUrl: 'https://api.openai.com/v1',
          },
        },
      },
      {
        name: 'model',
        body: {
          agentId: 'byok-opencode',
          message: 'Headless BYOK prompt',
          model: '',
          byokProvider: {
            protocol: 'openai',
            apiKey: 'test-key',
            baseUrl: 'https://api.openai.com/v1',
          },
        },
      },
    ];

    for (const endpoint of ['/api/runs', '/api/chat']) {
      for (const incomplete of incompleteConfigs) {
        const runResponse = await fetch(`${started.url}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(incomplete.body),
        });
        expect(runResponse.status, `${endpoint}: ${incomplete.name}`).toBe(400);
        await expect(runResponse.json()).resolves.toMatchObject({
          error: {
            code: 'VALIDATION_FAILED',
            message: expect.stringMatching(
              /secure credential profile|raw BYOK credentials are not accepted/iu,
            ),
          },
        });
      }
    }

    const runsResponse = await fetch(`${started.url}/api/runs`);
    expect(runsResponse.status).toBe(200);
    await expect(runsResponse.json()).resolves.toEqual({ runs: [] });
  });

  it('binds omitted conversationId to the seeded project conversation', async () => {
    started = await startTestServer();
    const { projectId, conversationId: seededConversationId } = await createProject(
      started.url,
      'Headless default conversation project',
    );
    await delay(5);
    const newerConversationId = await createConversation(started.url, projectId, 'Newer user chat');

    const conversationsResponse = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations`,
    );
    expect(conversationsResponse.status).toBe(200);
    const conversationsBody = await conversationsResponse.json() as {
      conversations: Array<{ id: string }>;
    };
    expect(conversationsBody.conversations[0]?.id).toBe(newerConversationId);

    const runResponse = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: `missing-agent-${randomUUID()}`,
        projectId,
        message: 'Headless prompt',
      }),
    });
    expect(runResponse.status).toBe(202);
    const runBody = await runResponse.json() as {
      conversationId: string | null;
      assistantMessageId: string | null;
    };
    expect(runBody.conversationId).toBe(seededConversationId);
    // Headless omit path must still mint a pin id for session resume cursor.
    expect(typeof runBody.assistantMessageId).toBe('string');
    expect(runBody.assistantMessageId).toBeTruthy();
  });

  it('mints assistantMessageId when conversationId is present but pin id is omitted', async () => {
    started = await startTestServer();
    const { projectId, conversationId } = await createProject(
      started.url,
      'API client omitted assistantMessageId',
    );

    const runResponse = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: `missing-agent-${randomUUID()}`,
        projectId,
        conversationId,
        message: 'Eval multi-turn prompt without client pin',
      }),
    });
    expect(runResponse.status).toBe(202);
    const runBody = await runResponse.json() as {
      runId: string;
      conversationId: string | null;
      assistantMessageId: string | null;
    };
    expect(runBody.conversationId).toBe(conversationId);
    expect(typeof runBody.assistantMessageId).toBe('string');
    expect(runBody.assistantMessageId).toBeTruthy();

    const messagesResponse = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
    );
    expect(messagesResponse.status).toBe(200);
    const messagesBody = await messagesResponse.json() as {
      messages: Array<{ id: string; role: string; content: string; runId?: string | null }>;
    };
    const assistant = messagesBody.messages.find((m) => m.id === runBody.assistantMessageId);
    expect(assistant?.role).toBe('assistant');
    expect(assistant?.runId).toBe(runBody.runId);
    const user = messagesBody.messages.find(
      (m) => m.role === 'user' && m.content.includes('Eval multi-turn prompt without client pin'),
    );
    expect(user).toBeTruthy();

    // Client-supplied id must still win (no double-mint overwrite).
    const clientId = `client-pin-${randomUUID()}`;
    const run2 = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: `missing-agent-${randomUUID()}`,
        projectId,
        conversationId,
        message: 'second turn with client pin',
        assistantMessageId: clientId,
      }),
    });
    expect(run2.status).toBe(202);
    const run2Body = await run2.json() as { assistantMessageId: string | null };
    expect(run2Body.assistantMessageId).toBe(clientId);
  });

  it('seeds only currentPrompt when message is a full ChatRequest transcript', async () => {
    started = await startTestServer();
    const { projectId, conversationId } = await createProject(
      started.url,
      'Omit-pin prefers currentPrompt',
    );
    const latestTurn = `latest user turn ${randomUUID()}`;
    const transcript = `## user\nprior turn\n\n## assistant\nprior reply\n\n## user\n${latestTurn}`;

    const runResponse = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: `missing-agent-${randomUUID()}`,
        projectId,
        conversationId,
        message: transcript,
        currentPrompt: latestTurn,
      }),
    });
    expect(runResponse.status).toBe(202);
    const runBody = await runResponse.json() as { assistantMessageId: string | null };
    expect(runBody.assistantMessageId).toBeTruthy();

    const messagesResponse = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
    );
    expect(messagesResponse.status).toBe(200);
    const messagesBody = await messagesResponse.json() as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessages = messagesBody.messages.filter((m) => m.role === 'user');
    expect(userMessages.some((m) => m.content === latestTurn)).toBe(true);
    expect(userMessages.some((m) => m.content.includes('prior turn'))).toBe(false);
    expect(userMessages.some((m) => m.content === transcript)).toBe(false);
  });

  it('preserves attachments and commentAttachments on omit-pin seeded user turns', async () => {
    started = await startTestServer();
    const { projectId, conversationId } = await createProject(
      started.url,
      'Omit-pin seeds attachment metadata',
    );
    const prompt = `omit-pin with attachments ${randomUUID()}`;
    const attachmentPath = 'assets/hero.png';
    const bmpAttachmentPath = 'assets/scan.bmp';
    const commentAttachment = {
      id: `comment-${randomUUID()}`,
      order: 1,
      filePath: 'deck.html',
      elementId: 'hero-title',
      selector: '#hero-title',
      label: 'Hero title',
      comment: 'Make this larger',
      currentText: 'Welcome',
      pagePosition: { x: 12, y: 24, width: 180, height: 40 },
      htmlHint: '<h1 id="hero-title">Welcome</h1>',
      // Deck annotations need slideIndex after reload for queuedSlideNavTarget.
      slideIndex: 2,
    };

    const runResponse = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: `missing-agent-${randomUUID()}`,
        projectId,
        conversationId,
        message: prompt,
        attachments: [attachmentPath, bmpAttachmentPath],
        commentAttachments: [commentAttachment],
      }),
    });
    expect(runResponse.status).toBe(202);

    const messagesResponse = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
    );
    expect(messagesResponse.status).toBe(200);
    const messagesBody = await messagesResponse.json() as {
      messages: Array<{
        role: string;
        content: string;
        attachments?: Array<{ path: string; name: string; kind: string; order?: number }>;
        commentAttachments?: Array<{
          id: string;
          filePath: string;
          elementId: string;
          comment: string;
          selector: string;
          slideIndex?: number;
        }>;
      }>;
    };
    const user = messagesBody.messages.find(
      (m) => m.role === 'user' && m.content.includes(prompt),
    );
    expect(user).toBeTruthy();
    expect(user?.attachments).toEqual([
      {
        path: attachmentPath,
        name: 'hero.png',
        kind: 'image',
        order: 0,
      },
      {
        path: bmpAttachmentPath,
        name: 'scan.bmp',
        kind: 'image',
        order: 1,
      },
    ]);
    expect(user?.commentAttachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: commentAttachment.id,
          filePath: commentAttachment.filePath,
          elementId: commentAttachment.elementId,
          comment: commentAttachment.comment,
          selector: commentAttachment.selector,
          slideIndex: 2,
        }),
      ]),
    );
  });

  it('preserves sessionMode and runContext on omit-pin seeded user turns', async () => {
    started = await startTestServer();
    const { projectId, conversationId } = await createProject(
      started.url,
      'Omit-pin seeds turn metadata',
    );
    const prompt = `omit-pin turn metadata ${randomUUID()}`;
    const runContext = {
      files: ['src/app.ts'],
      designSystemId: 'ds_test',
    };

    const runResponse = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: `missing-agent-${randomUUID()}`,
        projectId,
        conversationId,
        message: prompt,
        sessionMode: 'chat',
        context: runContext,
      }),
    });
    expect(runResponse.status).toBe(202);

    const messagesResponse = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
    );
    expect(messagesResponse.status).toBe(200);
    const messagesBody = await messagesResponse.json() as {
      messages: Array<{
        role: string;
        content: string;
        sessionMode?: string;
        runContext?: Record<string, unknown>;
      }>;
    };
    const user = messagesBody.messages.find(
      (m) => m.role === 'user' && m.content.includes(prompt),
    );
    expect(user).toBeTruthy();
    expect(user?.sessionMode).toBe('chat');
    expect(user?.runContext).toEqual(runContext);
  });

  it('bumps project updatedAt after omit-pin user message seed', async () => {
    started = await startTestServer();
    const older = await createProject(started.url, 'Older project for activity order');
    await delay(5);
    const newer = await createProject(started.url, 'Newer project for activity order');

    // Confirm newer project currently sorts first.
    const beforeResponse = await fetch(`${started.url}/api/projects`);
    expect(beforeResponse.status).toBe(200);
    const beforeBody = await beforeResponse.json() as {
      projects: Array<{ id: string }>;
    };
    const beforeIds = beforeBody.projects.map((p) => p.id);
    expect(beforeIds.indexOf(newer.projectId)).toBeLessThan(beforeIds.indexOf(older.projectId));

    await delay(5);
    const runResponse = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: `missing-agent-${randomUUID()}`,
        projectId: older.projectId,
        conversationId: older.conversationId,
        message: `activity bump seed ${randomUUID()}`,
      }),
    });
    expect(runResponse.status).toBe(202);

    const afterResponse = await fetch(`${started.url}/api/projects`);
    expect(afterResponse.status).toBe(200);
    const afterBody = await afterResponse.json() as {
      projects: Array<{ id: string }>;
    };
    const afterIds = afterBody.projects.map((p) => p.id);
    // Seeding the older project's user turn must promote it above the newer one.
    expect(afterIds.indexOf(older.projectId)).toBeLessThan(afterIds.indexOf(newer.projectId));
  });

  it('preserves empty currentPrompt for attachments-only omit-pin sends', async () => {
    started = await startTestServer();
    const { projectId, conversationId } = await createProject(
      started.url,
      'Omit-pin empty currentPrompt attachments-only',
    );
    const attachmentPath = 'assets/only-file.png';
    // ChatRequest shape: message is the flattened transcript; currentPrompt is
    // intentionally empty for attachments-only turns.
    const transcript = `## user\nprior turn\n\n## assistant\nprior reply\n\n## user\n`;

    const runResponse = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: `missing-agent-${randomUUID()}`,
        projectId,
        conversationId,
        message: transcript,
        currentPrompt: '',
        attachments: [attachmentPath],
      }),
    });
    expect(runResponse.status).toBe(202);

    const messagesResponse = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
    );
    expect(messagesResponse.status).toBe(200);
    const messagesBody = await messagesResponse.json() as {
      messages: Array<{
        role: string;
        content: string;
        attachments?: Array<{ path: string; name: string; kind: string; order?: number }>;
      }>;
    };
    const userMessages = messagesBody.messages.filter((m) => m.role === 'user');
    // Must not fall back to the full transcript when currentPrompt is empty.
    expect(userMessages.some((m) => m.content === transcript)).toBe(false);
    expect(userMessages.some((m) => m.content.includes('prior turn'))).toBe(false);
    const emptyAttachmentTurn = userMessages.find(
      (m) => m.content === '' && m.attachments?.some((a) => a.path === attachmentPath),
    );
    expect(emptyAttachmentTurn).toBeTruthy();
    expect(emptyAttachmentTurn?.attachments).toEqual([
      {
        path: attachmentPath,
        name: 'only-file.png',
        kind: 'image',
        order: 0,
      },
    ]);
  });

  it('seeds empty message attachments-only turns when currentPrompt is unset', async () => {
    started = await startTestServer();
    // Use a normal project kind (prototype) so default-scenario resolution can
    // rewrite meta.message with a rendered brief for the run. Seeded chat
    // content must still come from the original empty requestBody.message.
    const { projectId, conversationId } = await createProject(
      started.url,
      'Omit-pin empty message attachments without currentPrompt',
    );
    const attachmentPath = 'assets/no-prompt.png';
    const commentAttachment = {
      id: `comment-${randomUUID()}`,
      order: 0,
      filePath: 'deck.html',
      elementId: 'title',
      selector: '#title',
      label: 'Title',
      comment: 'Bold this',
      currentText: 'Hello',
      pagePosition: { x: 1, y: 2, width: 10, height: 20 },
      htmlHint: '<h1 id="title">Hello</h1>',
      slideIndex: 0,
    };

    // Minimal omit-pin client: empty text, optional currentPrompt omitted,
    // but attachment metadata present — must still seed the user turn with
    // the original empty content (not a scenario plugin brief).
    const runResponse = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: `missing-agent-${randomUUID()}`,
        projectId,
        conversationId,
        message: '',
        attachments: [attachmentPath],
        commentAttachments: [commentAttachment],
      }),
    });
    expect(runResponse.status).toBe(202);
    const runBody = await runResponse.json() as {
      assistantMessageId: string | null;
      appliedPluginSnapshotId?: string | null;
    };
    expect(runBody.assistantMessageId).toBeTruthy();

    const messagesResponse = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
    );
    expect(messagesResponse.status).toBe(200);
    const messagesBody = await messagesResponse.json() as {
      messages: Array<{
        role: string;
        content: string;
        attachments?: Array<{ path: string; name: string; kind: string; order?: number }>;
        commentAttachments?: Array<{ id: string; filePath: string; comment: string; slideIndex?: number }>;
      }>;
    };
    // Default scenario may fill the run prompt, but visible user content must
    // remain the original empty message — never the rendered plugin brief.
    const emptyAttachmentTurn = messagesBody.messages.find(
      (m) => m.role === 'user' && m.content === '',
    );
    expect(emptyAttachmentTurn).toBeTruthy();
    expect(
      messagesBody.messages.some(
        (m) =>
          m.role === 'user' &&
          typeof m.content === 'string' &&
          m.content.includes('product-studio'),
      ),
    ).toBe(false);
    expect(emptyAttachmentTurn?.attachments).toEqual([
      {
        path: attachmentPath,
        name: 'no-prompt.png',
        kind: 'image',
        order: 0,
      },
    ]);
    expect(emptyAttachmentTurn?.commentAttachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: commentAttachment.id,
          filePath: commentAttachment.filePath,
          comment: commentAttachment.comment,
          slideIndex: 0,
        }),
      ]),
    );
  });

  it('seeds user prompt after conversation fallback even when pin is client-supplied', async () => {
    started = await startTestServer();
    const { projectId, conversationId: seededConversationId } = await createProject(
      started.url,
      'Fallback seed with client pin',
    );
    const prompt = `fallback seed with client pin ${randomUUID()}`;
    const clientPin = `client-pin-${randomUUID()}`;

    const runResponse = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: `missing-agent-${randomUUID()}`,
        projectId,
        // conversationId omitted → server binds default conversation
        assistantMessageId: clientPin,
        message: prompt,
      }),
    });
    expect(runResponse.status).toBe(202);
    const runBody = await runResponse.json() as {
      conversationId: string | null;
      assistantMessageId: string | null;
    };
    expect(runBody.conversationId).toBe(seededConversationId);
    expect(runBody.assistantMessageId).toBe(clientPin);

    const messagesResponse = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(seededConversationId)}/messages`,
    );
    expect(messagesResponse.status).toBe(200);
    const messagesBody = await messagesResponse.json() as {
      messages: Array<{ id: string; role: string; content: string; runId?: string | null }>;
    };
    const assistant = messagesBody.messages.find((m) => m.id === clientPin);
    expect(assistant?.role).toBe('assistant');
    const user = messagesBody.messages.find(
      (m) => m.role === 'user' && m.content.includes(prompt),
    );
    expect(user).toBeTruthy();
  });

  it('rejects cross-project conversationId before seeding omit-pin prompt', async () => {
    started = await startTestServer();
    const projectA = await createProject(started.url, 'Ownership project A');
    const projectB = await createProject(started.url, 'Ownership project B');
    const foreignPrompt = `cross-project omit-pin seed ${randomUUID()}`;

    const runResponse = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: `missing-agent-${randomUUID()}`,
        projectId: projectA.projectId,
        conversationId: projectB.conversationId,
        message: foreignPrompt,
      }),
    });
    expect(runResponse.status).toBe(404);
    await expect(runResponse.json()).resolves.toMatchObject({
      error: {
        code: 'CONVERSATION_NOT_FOUND',
        message: 'conversation not found for project',
      },
    });

    const messagesResponse = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectB.projectId)}/conversations/${encodeURIComponent(projectB.conversationId)}/messages`,
    );
    expect(messagesResponse.status).toBe(200);
    const messagesBody = await messagesResponse.json() as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(
      messagesBody.messages.some(
        (m) => m.role === 'user' && m.content.includes(foreignPrompt),
      ),
    ).toBe(false);
  });

  it('rejects conversationId without projectId before seeding omit-pin prompt', async () => {
    started = await startTestServer();
    const { projectId, conversationId } = await createProject(
      started.url,
      'Missing projectId ownership project',
    );
    const prompt = `omit-pin without projectId ${randomUUID()}`;

    const runResponse = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: `missing-agent-${randomUUID()}`,
        conversationId,
        message: prompt,
      }),
    });
    expect(runResponse.status).toBe(404);
    await expect(runResponse.json()).resolves.toMatchObject({
      error: {
        code: 'CONVERSATION_NOT_FOUND',
        message: 'conversation not found for project',
      },
    });

    const messagesResponse = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
    );
    expect(messagesResponse.status).toBe(200);
    const messagesBody = await messagesResponse.json() as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(
      messagesBody.messages.some(
        (m) => m.role === 'user' && m.content.includes(prompt),
      ),
    ).toBe(false);
  });

  it('rejects nonexistent conversationId before minting omit-pin assistantMessageId', async () => {
    started = await startTestServer();
    const { projectId } = await createProject(started.url, 'Stale conversation project');
    const missingConversationId = `missing-conv-${randomUUID()}`;

    const runResponse = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: `missing-agent-${randomUUID()}`,
        projectId,
        conversationId: missingConversationId,
        message: 'stale conversation omit-pin prompt',
      }),
    });
    expect(runResponse.status).toBe(404);
    await expect(runResponse.json()).resolves.toMatchObject({
      error: {
        code: 'CONVERSATION_NOT_FOUND',
        message: 'conversation not found for project',
      },
    });
  });

  it('falls back past a stale saved agent to the first detected available runtime', async () => {
    started = await startTestServer();
    const binDir = await mkdtemp(path.join(os.tmpdir(), 'od-headless-run-bin-'));
    const emptyAgentHome = await mkdtemp(path.join(os.tmpdir(), 'od-headless-run-home-'));
    const priorConfig = await readAppConfigFromServer(started.url);
    try {
      const opencodeBin = await writeFakeOpencode(binDir);
      process.env.PATH = '';
      process.env.OD_AGENT_HOME = emptyAgentHome;

      const configResponse = await fetch(`${started.url}/api/app-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: 'claude',
          agentCliEnv: {
            claude: { CLAUDE_BIN: path.join(binDir, 'missing-claude') },
            opencode: { OPENCODE_BIN: opencodeBin },
          },
        }),
      });
      expect(configResponse.status).toBe(200);

      const { projectId } = await createProject(started.url, 'Headless stale agent project');
      const runResponse = await fetch(`${started.url}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          message: 'Headless prompt',
        }),
      });
      expect(runResponse.status).toBe(202);
      const runBody = await runResponse.json() as { runId: string };
      const statusResponse = await fetch(
        `${started.url}/api/runs/${encodeURIComponent(runBody.runId)}`,
      );
      expect(statusResponse.status).toBe(200);
      const statusBody = await statusResponse.json() as { agentId: string | null };
      expect(statusBody.agentId).toBe('opencode');
    } finally {
      await restoreAppConfig(started.url, priorConfig);
      await rm(binDir, { recursive: true, force: true });
      await rm(emptyAgentHome, { recursive: true, force: true });
    }
  });
});

async function startTestServer(): Promise<StartedServer> {
  return await startServer({ port: 0, returnServer: true }) as StartedServer;
}

async function createProject(url: string, name: string): Promise<{
  projectId: string;
  conversationId: string;
}> {
  const projectId = `project_${randomUUID()}`;
  const response = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name,
      metadata: { kind: 'prototype' },
    }),
  });
  expect(response.status).toBe(200);
  const body = await response.json() as { conversationId: string };
  return { projectId, conversationId: body.conversationId };
}

async function createConversation(
  url: string,
  projectId: string,
  title: string,
): Promise<string> {
  const response = await fetch(`${url}/api/projects/${encodeURIComponent(projectId)}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  expect(response.status).toBe(200);
  const body = await response.json() as { conversation: { id: string } };
  return body.conversation.id;
}

async function readAppConfigFromServer(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${url}/api/app-config`);
  expect(response.status).toBe(200);
  const body = await response.json() as { config?: Record<string, unknown> };
  return body.config ?? {};
}

async function restoreAppConfig(url: string, config: Record<string, unknown>): Promise<void> {
  await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId: Object.hasOwn(config, 'agentId') ? config.agentId : null,
      agentCliEnv: Object.hasOwn(config, 'agentCliEnv') ? config.agentCliEnv : null,
    }),
  });
}

async function writeFakeOpencode(dir: string): Promise<string> {
  const bin = path.join(dir, 'opencode');
  await writeFile(bin, `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  console.log('opencode 0.0.0');
  process.exit(0);
}
if (process.argv[2] === 'models') {
  console.log('test/model');
  process.exit(0);
}
if (process.argv[2] === 'run') {
  process.stdin.resume();
  process.stdin.on('end', () => process.exit(0));
  setTimeout(() => process.exit(0), 50);
} else {
  process.exit(0);
}
`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

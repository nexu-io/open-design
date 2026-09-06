/**
 * 分叉出来的那一截上下文,必须把每一轮**到底成没成**一起带过来。
 *
 * 真机 2026-08-27:一轮明明成功的 Codex 回答(正文完整、产物卡都在),分叉之后
 * 壳头变成红色的「运行失败 4m 32s」。落库的 run 状态是对的,错的是复制出来的那条
 * 消息 —— fork 把 `runStatus` 一并丢了,前端拿不到结论就只能回退到「从事件里猜」
 * (`AssistantMessage.legacyTurnFailed`),而那条判据看到任何一条报错的 `tool_result`
 * 就判整轮失败。那一轮里恰好有一次 `desktop renderer unavailable`。
 *
 * `runId` / `lastRunEventId` 是**指针**(指向源会话那次 run,重连/通知去重/续流都按它
 * 认人),丢掉是对的;`runStatus` 是**结论**,不该跟着一起丢。
 *
 * 活的状态(`queued` / `running`)仍然不带:那说的是「源会话此刻还在跑」,复制过来
 * 会让新会话里那一条永远转圈。
 */
import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../../src/server.js';

type SeedMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  runId?: string;
  runStatus?: string;
  lastRunEventId?: string;
  startedAt?: number;
  // Explicit `undefined` is a MEANINGFUL override here: a still-running turn
  // must clear the default `endedAt` through the spread below, so under
  // `exactOptionalPropertyTypes` the type has to admit it.
  endedAt?: number | undefined;
  events?: unknown[];
};

type ForkedMessage = {
  id: string;
  role: string;
  content: string;
  runId?: string;
  runStatus?: string;
  lastRunEventId?: string;
};

describe('conversation fork carries each turn verdict', () => {
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

  async function createProject(): Promise<string> {
    const projectId = `proj-fork-verdict-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Fork verdict fixture',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(resp.status).toBe(200);
    return projectId;
  }

  async function seedConversation(
    projectId: string,
    messages: SeedMessage[],
  ): Promise<string> {
    const resp = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Source', sessionMode: 'chat' }),
    });
    expect(resp.status).toBe(200);
    const conversationId = ((await resp.json()) as { conversation: { id: string } })
      .conversation.id;
    for (const message of messages) {
      const saveResp = await fetch(
        `${baseUrl}/api/projects/${projectId}/conversations/${conversationId}/messages/${message.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        },
      );
      expect(saveResp.status).toBe(200);
    }
    return conversationId;
  }

  async function forkThrough(
    projectId: string,
    sourceId: string,
    forkAfterMessageId: string,
  ): Promise<ForkedMessage[]> {
    const forkResp = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Fork',
        sessionMode: 'chat',
        seedFromConversationId: sourceId,
        forkAfterMessageId,
      }),
    });
    expect(forkResp.status).toBe(200);
    const forkId = ((await forkResp.json()) as { conversation: { id: string } })
      .conversation.id;
    const messagesResp = await fetch(
      `${baseUrl}/api/projects/${projectId}/conversations/${forkId}/messages`,
    );
    expect(messagesResp.status).toBe(200);
    return ((await messagesResp.json()) as { messages: ForkedMessage[] }).messages;
  }

  /** 消息 id 全局唯一:PUT 会拒绝写一个已经属于别的会话的 id。 */
  function assistantIdFor(projectId: string): string {
    return `${projectId}-assistant-1`;
  }

  /** 真机那一条的形状:整轮成功,中途一次工具调用报了错。 */
  function turnWithOneFailedToolCall(
    projectId: string,
    overrides: Partial<SeedMessage>,
  ): SeedMessage {
    return {
      id: assistantIdFor(projectId),
      role: 'assistant',
      content: '已完成长篇深度文章页面。静态检查已通过;桌面渲染服务当前不可用。',
      runId: 'source-run-1',
      lastRunEventId: 'evt-1',
      startedAt: 1787796127536,
      endedAt: 1787796469549,
      events: [
        { kind: 'tool_use', id: 'item_6', name: 'render_screenshot', input: {} },
        {
          kind: 'tool_result',
          toolUseId: 'item_6',
          content:
            '{"error":{"code":"UPSTREAM_UNAVAILABLE","message":"desktop renderer unavailable"}}',
          isError: true,
        },
        { kind: 'text', text: '已完成长篇深度文章页面。' },
      ],
      ...overrides,
    };
  }

  it('keeps a succeeded verdict on the copied turn even when one tool call errored', async () => {
    const projectId = await createProject();
    const sourceId = await seedConversation(projectId, [
      { id: `${projectId}-user-1`, role: 'user', content: '写一篇长文' },
      turnWithOneFailedToolCall(projectId, { runStatus: 'succeeded' }),
    ]);

    const forked = await forkThrough(projectId, sourceId, assistantIdFor(projectId));
    const copiedAssistant = forked.find((message) => message.role === 'assistant');
    expect(copiedAssistant).toBeDefined();
    expect(copiedAssistant?.runStatus).toBe('succeeded');
  });

  /*
   * 反向那一条:光把状态写死成 succeeded 也能让上面那条绿,那等于把真正失败的
   * 一轮藏起来 —— 比原来的 bug 更糟。所以本来就失败的那一轮,分叉之后必须还是失败。
   */
  it('keeps a failed verdict on the copied turn', async () => {
    const projectId = await createProject();
    const sourceId = await seedConversation(projectId, [
      { id: `${projectId}-user-1`, role: 'user', content: '写一篇长文' },
      turnWithOneFailedToolCall(projectId, { runStatus: 'failed' }),
    ]);

    const forked = await forkThrough(projectId, sourceId, assistantIdFor(projectId));
    const copiedAssistant = forked.find((message) => message.role === 'assistant');
    expect(copiedAssistant?.runStatus).toBe('failed');
  });

  it('keeps a canceled verdict on the copied turn', async () => {
    const projectId = await createProject();
    const sourceId = await seedConversation(projectId, [
      { id: `${projectId}-user-1`, role: 'user', content: '写一篇长文' },
      turnWithOneFailedToolCall(projectId, { runStatus: 'canceled' }),
    ]);

    const forked = await forkThrough(projectId, sourceId, assistantIdFor(projectId));
    const copiedAssistant = forked.find((message) => message.role === 'assistant');
    expect(copiedAssistant?.runStatus).toBe('canceled');
  });

  it('does not copy a live verdict, so the copied turn never spins forever', async () => {
    const projectId = await createProject();
    const sourceId = await seedConversation(projectId, [
      { id: `${projectId}-user-1`, role: 'user', content: '写一篇长文' },
      turnWithOneFailedToolCall(projectId, { runStatus: 'running', endedAt: undefined }),
    ]);

    const forked = await forkThrough(projectId, sourceId, assistantIdFor(projectId));
    const copiedAssistant = forked.find((message) => message.role === 'assistant');
    expect(copiedAssistant).toBeDefined();
    expect(copiedAssistant?.runStatus).toBeUndefined();
  });

  it('still drops the source run pointers', async () => {
    const projectId = await createProject();
    const sourceId = await seedConversation(projectId, [
      { id: `${projectId}-user-1`, role: 'user', content: '写一篇长文' },
      turnWithOneFailedToolCall(projectId, { runStatus: 'succeeded' }),
    ]);

    const forked = await forkThrough(projectId, sourceId, assistantIdFor(projectId));
    const copiedAssistant = forked.find((message) => message.role === 'assistant');
    expect(copiedAssistant?.id).not.toBe(assistantIdFor(projectId));
    expect(copiedAssistant?.runId).toBeUndefined();
    expect(copiedAssistant?.lastRunEventId).toBeUndefined();
  });
});

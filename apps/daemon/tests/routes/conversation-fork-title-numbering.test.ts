/*
 * 新会话的标题由 **daemon** 起,不是客户端。
 *
 * 2026-09-03 产品裁决把「{原标题} 分叉」换成了自增编号「{原标题} (n)」。编号要唯一,
 * 就必须先看一眼这个项目里已经有哪些标题 —— 那份名单只有 daemon 手上有。放在 web
 * 端算等于让每个客户端各拿一份可能过期的快照去算同一个号;放在 daemon 里,
 * 「读名单 → 算号 → 落库」在一个 Express handler 里**中间没有 await**,
 * better-sqlite3 又是同步的,所以同进程内它就是原子的:同一秒点两下 fork
 * 拿到的是 (1) 和 (2),不会双双撞成 (1)。
 *
 * 顺带白拿了 CLI 那条路(`od conversation new --seed-from` / `od chat new --fork-after`)——
 * 它们本来就不传 title,以前建出来是无名会话,现在跟 UI 一样有编号。
 *
 * 客户端显式传了 title 就照传的来:重命名、导入、以及任何「我知道我要叫什么」的
 * 调用点都不该被编号覆盖。
 */
import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../../src/server.js';

describe('新开会话的标题在 daemon 侧自增编号', () => {
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
    const projectId = `proj-fork-title-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Fork title fixture',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(resp.status).toBe(200);
    return projectId;
  }

  async function createConversation(
    projectId: string,
    body: Record<string, unknown>,
  ): Promise<{ id: string; title: string | null }> {
    const resp = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(resp.status).toBe(200);
    const json = (await resp.json()) as {
      conversation: { id: string; title: string | null };
    };
    return json.conversation;
  }

  async function seedMessage(
    projectId: string,
    conversationId: string,
    message: { id: string; role: string; content: string },
  ): Promise<void> {
    const resp = await fetch(
      `${baseUrl}/api/projects/${projectId}/conversations/${conversationId}/messages/${message.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      },
    );
    expect(resp.status).toBe(200);
  }

  /** 建一条有一轮问答的会话,拿它当分叉源。 */
  async function sourceConversation(projectId: string, title: string): Promise<string> {
    const conv = await createConversation(projectId, { title });
    await seedMessage(projectId, conv.id, { id: `${conv.id}-u`, role: 'user', content: 'ask' });
    await seedMessage(projectId, conv.id, {
      id: `${conv.id}-a`,
      role: 'assistant',
      content: 'answer',
    });
    return conv.id;
  }

  function forkBody(sourceId: string): Record<string, unknown> {
    return {
      seedFromConversationId: sourceId,
      forkAfterMessageId: `${sourceId}-a`,
    };
  }

  it('第一次新开会话是 (1),再来一次是 (2)', async () => {
    const projectId = await createProject();
    const sourceId = await sourceConversation(projectId, '商品列表页');

    const first = await createConversation(projectId, forkBody(sourceId));
    expect(first.title).toBe('商品列表页 (1)');

    const second = await createConversation(projectId, forkBody(sourceId));
    expect(second.title).toBe('商品列表页 (2)');
  });

  it('从「商品列表页 (1)」再新开一个是 (2),不是「(1) (1)」', async () => {
    const projectId = await createProject();
    await sourceConversation(projectId, '商品列表页');
    const numberedId = await sourceConversation(projectId, '商品列表页 (1)');

    const forked = await createConversation(projectId, forkBody(numberedId));
    expect(forked.title).toBe('商品列表页 (2)');
  });

  it('老的「分叉」会话保留原名,编号接在后面', async () => {
    // 线上已经有一批叫「XXX 分叉」的会话,产品明确不迁移 —— 老名字整个当基名。
    const projectId = await createProject();
    const legacyId = await sourceConversation(projectId, '商品列表页 分叉');

    const forked = await createConversation(projectId, forkBody(legacyId));
    expect(forked.title).toBe('商品列表页 分叉 (1)');
  });

  it('编号只在本项目内唯一,隔壁项目的同名会话不影响', async () => {
    const neighbour = await createProject();
    const neighbourSource = await sourceConversation(neighbour, '商品列表页');
    expect((await createConversation(neighbour, forkBody(neighbourSource))).title).toBe(
      '商品列表页 (1)',
    );

    const projectId = await createProject();
    const sourceId = await sourceConversation(projectId, '商品列表页');
    expect((await createConversation(projectId, forkBody(sourceId))).title).toBe('商品列表页 (1)');
  });

  it('同一瞬间连点两下,两个新会话拿到不同的号', async () => {
    const projectId = await createProject();
    const sourceId = await sourceConversation(projectId, '商品列表页');

    const [a, b] = await Promise.all([
      createConversation(projectId, forkBody(sourceId)),
      createConversation(projectId, forkBody(sourceId)),
    ]);
    expect([a.title, b.title].sort()).toEqual(['商品列表页 (1)', '商品列表页 (2)']);
  });

  it('反向对照:普通新建会话(没有源会话)照旧无名', async () => {
    const projectId = await createProject();
    await sourceConversation(projectId, '商品列表页');

    const plain = await createConversation(projectId, {});
    expect(plain.title).toBeNull();
  });

  it('反向对照:客户端显式传了标题就用它,不加编号', async () => {
    const projectId = await createProject();
    const sourceId = await sourceConversation(projectId, '商品列表页');

    const named = await createConversation(projectId, {
      ...forkBody(sourceId),
      title: '我自己起的名字',
    });
    expect(named.title).toBe('我自己起的名字');
  });

  it('反向对照:源会话没有标题时新会话也不硬造一个', async () => {
    const projectId = await createProject();
    const untitled = await createConversation(projectId, {});
    await seedMessage(projectId, untitled.id, {
      id: `${untitled.id}-u`,
      role: 'user',
      content: 'ask',
    });
    await seedMessage(projectId, untitled.id, {
      id: `${untitled.id}-a`,
      role: 'assistant',
      content: 'answer',
    });

    const forked = await createConversation(projectId, forkBody(untitled.id));
    expect(forked.title).toBeNull();
  });
});

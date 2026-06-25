// Regression guard: a conversation-less POST /api/runs (the MCP / SDK caller
// shape — projectId only, no conversationId) must bind to the project's SEEDED
// default conversation, NOT to whichever conversation is most-recently-active.
//
// Why this is a real bug, not a style nit: `listConversations` is ordered
// `ORDER BY c.updatedAt DESC` for the UI's recency sidebar. An earlier
// implementation of the /api/runs MCP fallback took `convs[0]` from that list,
// so any project where the user had since opened a newer chat would silently
// route MCP-spawned runs into that newer chat — orphaning the run's transcript
// from the studio page the outer agent (Codex/Cursor) hands back to the user.
// The fix sorts by `createdAt` ascending so the oldest (seeded) conversation
// wins regardless of recency. See server.ts POST /api/runs MCP fallback.
//
// This spec strengthens the existing mcp-spawn.test.ts case by also asserting
// the PRECONDITION (conversation B is genuinely first in the recency-ordered
// listing) — so the test cannot pass trivially if the recency bump no-ops.
// All state is seeded through production HTTP APIs only; no source backdoors.

import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

// Fake `claude` on PATH so the run reaches `succeeded` without a real install.
// We only care about WHICH conversation the run binds to, which is decided
// before the spawn — but driving the run to completion exercises the full path.
async function withFakeClaude<T>(run: () => Promise<T>): Promise<T> {
  const dir = await fsp.mkdtemp(join(tmpdir(), 'od-mcp-bind-bin-'));
  const oldPath = process.env.PATH;
  const oldClaudeBin = process.env.CLAUDE_BIN;
  const oldAgentHome = process.env.MAX_AGENT_HOME;
  const script = `
const out = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  duration_ms: 1,
  total_cost_usd: 0,
  usage: { input_tokens: 1, output_tokens: 1 },
  result: 'ok',
};
console.log(JSON.stringify(out));
process.exit(0);
`;
  try {
    if (process.platform === 'win32') {
      const runner = join(dir, 'claude-test-runner.cjs');
      await fsp.writeFile(runner, script);
      await fsp.writeFile(join(dir, 'claude.cmd'), `@echo off\r\nnode "${runner}" %*\r\n`);
    } else {
      const bin = join(dir, 'claude');
      await fsp.writeFile(bin, `#!/usr/bin/env node\n${script}`);
      await fsp.chmod(bin, 0o755);
    }
    process.env.PATH = `${dir}${delimiter}${oldPath ?? ''}`;
    delete process.env.CLAUDE_BIN;
    process.env.MAX_AGENT_HOME = dir;
    return await run();
  } finally {
    process.env.PATH = oldPath;
    if (oldClaudeBin === undefined) delete process.env.CLAUDE_BIN;
    else process.env.CLAUDE_BIN = oldClaudeBin;
    if (oldAgentHome === undefined) delete process.env.MAX_AGENT_HOME;
    else process.env.MAX_AGENT_HOME = oldAgentHome;
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

async function waitForRunStatus(baseUrl: string, runId: string): Promise<{ status: string }> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const r = await fetch(`${baseUrl}/api/runs/${runId}`);
    const body = (await r.json()) as { status: string };
    if (body.status !== 'queued' && body.status !== 'running') return body;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('run did not finish within 5s of polling');
}

describe('MCP-spawned run binds to the seeded default conversation', () => {
  let server: http.Server;
  let baseUrl: string;
  const projectsToClean: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    for (const id of projectsToClean.splice(0)) {
      await fetch(`${baseUrl}/api/projects/${id}`, { method: 'DELETE' }).catch(() => {});
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('routes a projectId-only run to the seeded conversation, not the most-recently-active one', async () => {
    await withFakeClaude(async () => {
      // (1) Create a project through the real API — this seeds the default
      // conversation A. create_project returns its id as `conversationId`.
      const projectId = `mcp-bind-${randomUUID()}`;
      const createRes = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: projectId, name: projectId }),
      });
      expect(createRes.ok).toBe(true);
      projectsToClean.push(projectId);
      const { conversationId: seededConversationId } = (await createRes.json()) as {
        conversationId: string;
      };
      expect(typeof seededConversationId).toBe('string');
      expect(seededConversationId.length).toBeGreaterThan(0);

      // (2) Create a SECOND conversation B and make it the most-recently-active
      // by pushing its updatedAt into the future. Real APIs only.
      const convBRes = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Recently active B' }),
      });
      expect(convBRes.ok).toBe(true);
      const recentConversationId = ((await convBRes.json()) as { conversation: { id: string } })
        .conversation.id;
      expect(recentConversationId).not.toBe(seededConversationId);

      const patchRes = await fetch(
        `${baseUrl}/api/projects/${projectId}/conversations/${recentConversationId}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title: 'Recently active B', updatedAt: Date.now() + 60_000 }),
        },
      );
      expect(patchRes.ok).toBe(true);

      // PRECONDITION: the recency-ordered listing returns B first. This is what
      // makes the test have teeth — if the fallback naively took convs[0], it
      // would bind to B here. (Guards against a trivially-green test where A
      // happened to sort first anyway.)
      const listRes = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`);
      expect(listRes.ok).toBe(true);
      const listedIds = ((await listRes.json()) as { conversations: Array<{ id: string }> })
        .conversations.map((c) => c.id);
      expect(listedIds[0]).toBe(recentConversationId);
      expect(listedIds).toContain(seededConversationId);

      // (3) POST /api/runs with ONLY a projectId — the MCP / SDK caller shape.
      // No conversationId, no assistantMessageId.
      const runRes = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentId: 'claude',
          projectId,
          message: 'mcp fallback prompt',
        }),
      });
      expect(runRes.status).toBe(202);
      const { runId, conversationId: resolvedConversationId } = (await runRes.json()) as {
        runId: string;
        conversationId: string;
      };

      // (4) The run must bind to the SEEDED conversation A, not the recent B.
      expect(resolvedConversationId).toBe(seededConversationId);
      expect(resolvedConversationId).not.toBe(recentConversationId);

      const status = await waitForRunStatus(baseUrl, runId);
      expect(status.status).toBe('succeeded');

      // Corroborate at the persistence layer: the prompt landed in A, not B.
      const seededMessagesRes = await fetch(
        `${baseUrl}/api/projects/${projectId}/conversations/${seededConversationId}/messages`,
      );
      expect(seededMessagesRes.ok).toBe(true);
      const seededMessages = ((await seededMessagesRes.json()) as {
        messages: Array<{ role: string; content: string }>;
      }).messages;
      expect(seededMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'mcp fallback prompt' }),
        ]),
      );

      const recentMessagesRes = await fetch(
        `${baseUrl}/api/projects/${projectId}/conversations/${recentConversationId}/messages`,
      );
      expect(recentMessagesRes.ok).toBe(true);
      const recentMessages = ((await recentMessagesRes.json()) as {
        messages: Array<{ content: string }>;
      }).messages;
      expect(recentMessages.some((m) => m.content === 'mcp fallback prompt')).toBe(false);
    });
  }, 30_000);
});

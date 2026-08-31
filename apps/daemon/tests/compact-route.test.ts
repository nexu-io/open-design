// POST /api/projects/:id/conversations/:cid/compact — manual context
// compaction. The route must:
//   1. refuse runtimes without `RuntimeAgentDef.manualCompact`
//      (COMPACT_UNSUPPORTED) — codex is deliberately undeclared until its
//      exec-mode `/compact` behavior is verified;
//   2. refuse conversations with no stored agent session (COMPACT_NO_SESSION)
//      — there is nothing to compact before the first completed turn;
//   3. otherwise dispatch the runtime's own compact command through the
//      normal run pipeline, resuming the STORED session (`--resume <id>`)
//      and delivering the BARE command as the sole user message. Prompt
//      composition must be bypassed: `# User request\n\n/compact` is literal
//      user text to the claude CLI, bare `/compact` compacts (verified
//      against Claude Code 2.1.217). A successful compact emits no assistant
//      text, so the run must still classify `succeeded` (empty-output guard
//      exemption).

import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';
import { ensureWorkspaceProject, openDatabase } from '../src/db.js';
import { readMemoryConfig, writeMemoryConfig } from '../src/memory.js';

type StartedServer = { url: string; server: http.Server };

type RunStatus = {
  id: string;
  status: string;
  error?: string | null;
  errorCode?: string | null;
};

describe('conversation compact route', () => {
  let server: http.Server;
  let baseUrl: string;
  let originalMemoryConfig: Awaited<ReturnType<typeof readMemoryConfig>> | null = null;
  const originalPath = process.env.PATH;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    if (process.env.OD_DATA_DIR) {
      originalMemoryConfig = await readMemoryConfig(process.env.OD_DATA_DIR);
      await writeMemoryConfig(process.env.OD_DATA_DIR, {
        enabled: false,
        extraction: null,
      });
    }
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    if (originalPath == null) delete process.env.PATH;
    else process.env.PATH = originalPath;
    for (const dir of tempDirs.splice(0)) {
      await fsp.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (process.env.OD_DATA_DIR && originalMemoryConfig) {
      await writeMemoryConfig(process.env.OD_DATA_DIR, {
        enabled: originalMemoryConfig.enabled,
        extraction: originalMemoryConfig.extraction,
      });
    }
  });

  it('refuses a runtime without manualCompact with COMPACT_UNSUPPORTED', async () => {
    const { projectId, conversationId } = await createProjectWithConversation(baseUrl, 'nocompact');

    const response = await postCompact(baseUrl, projectId, conversationId, { agentId: 'codex' });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('COMPACT_UNSUPPORTED');
  });

  it('refuses a conversation with no stored agent session with COMPACT_NO_SESSION', async () => {
    const { projectId, conversationId } = await createProjectWithConversation(baseUrl, 'nosession');

    const response = await postCompact(baseUrl, projectId, conversationId, { agentId: 'claude' });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('COMPACT_NO_SESSION');
  });

  it('404s a conversation owned by a different project', async () => {
    const projectA = await createProjectWithConversation(baseUrl, 'owner-a');
    const projectB = await createProjectWithConversation(baseUrl, 'owner-b');

    const response = await postCompact(
      baseUrl,
      projectA.projectId,
      projectB.conversationId,
      { agentId: 'claude' },
    );
    expect(response.status).toBe(404);
  });

  it('requires the exact Team Workspace writer and pins that scope on the compact run', async () => {
    const { binDir } = await writeFakeCompactClaude();
    process.env.PATH = `${binDir}${delimiter}${originalPath ?? ''}`;
    try {
      const { projectId, conversationId } = await createProjectWithConversation(
        baseUrl,
        'team-authority',
      );
      // Seed a genuine resumable session before binding the project. This
      // keeps the authority assertions focused on the compact mutation gate
      // while preserving the runtime's model/cwd/message-cursor invariants.
      const seedResponse = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          conversationId,
          assistantMessageId: `assistant_compact_team_${randomUUID()}`,
          agentId: 'claude',
          message: 'please reply ok',
          currentPrompt: 'please reply ok',
        }),
      });
      expect(seedResponse.status).toBe(202);
      const seededRun = (await seedResponse.json()) as { runId: string };
      const seededStatus = await waitForRun(baseUrl, seededRun.runId);
      expect(seededStatus.status, JSON.stringify(seededStatus)).toBe('succeeded');

      const db = openDatabase(process.cwd(), { dataDir: process.env.OD_DATA_DIR! });
      ensureWorkspaceProject(db, {
        projectId,
        workspaceId: 'workspace-compact-team',
        visibility: 'team',
        resourceState: 'active',
        createdByWorkspaceMemberId: 'member-compact-owner',
      });

      const headerless = await postCompact(baseUrl, projectId, conversationId, {
        agentId: 'claude',
      });
      expect(headerless.status).toBe(400);
      expect(await headerless.json()).toMatchObject({
        error: { code: 'WORKSPACE_CONTEXT_REQUIRED' },
      });

      const wrongWriter = await postCompact(
        baseUrl,
        projectId,
        conversationId,
        { agentId: 'claude' },
        workspaceHeaders('workspace-compact-team', 'member-compact-other'),
      );
      expect(wrongWriter.status).toBe(403);
      expect(await wrongWriter.json()).toMatchObject({
        error: { code: 'WORKSPACE_PROJECT_PERMISSION_DENIED' },
      });

      const authorized = await postCompact(
        baseUrl,
        projectId,
        conversationId,
        { agentId: 'claude' },
        workspaceHeaders('workspace-compact-team', 'member-compact-owner'),
      );
      expect(authorized.status).toBe(202);
      const body = (await authorized.json()) as { runId: string; conversationId: string };
      expect(body.conversationId).toBe(conversationId);
      const status = await waitForRun(baseUrl, body.runId);
      expect(status.status, JSON.stringify(status)).toBe('succeeded');
      const durableState = JSON.parse(await fsp.readFile(
        join(process.env.OD_DATA_DIR!, 'runs', body.runId, 'state.json'),
        'utf8',
      )) as { workspaceScope?: Record<string, unknown> | null };
      expect(durableState.workspaceScope).toMatchObject({
        workspaceId: 'workspace-compact-team',
        projectId,
      });
    } finally {
      if (originalPath == null) delete process.env.PATH;
      else process.env.PATH = originalPath;
    }
  });

  it('resumes the stored session and delivers the bare compact command', async () => {
    const { binDir, argsLogPath, stdinLogPath } = await writeFakeCompactClaude();
    process.env.PATH = `${binDir}${delimiter}${originalPath ?? ''}`;
    try {
      const { projectId, conversationId } = await createProjectWithConversation(baseUrl, 'happy');

      // Turn 1: a normal run creates + persists the CLI session
      // (`--session-id <uuid>` on the spawn, stored on clean success).
      const assistantMessageId = `assistant_compact_${randomUUID()}`;
      const runResponse = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          conversationId,
          assistantMessageId,
          agentId: 'claude',
          message: 'please reply ok',
          currentPrompt: 'please reply ok',
        }),
      });
      expect(runResponse.status).toBe(202);
      const firstRun = (await runResponse.json()) as { runId: string };
      const firstStatus = await waitForRun(baseUrl, firstRun.runId);
      expect(firstStatus.status, JSON.stringify(firstStatus)).toBe('succeeded');

      // Turn 2: manual compact.
      const compactResponse = await postCompact(baseUrl, projectId, conversationId, {
        agentId: 'claude',
      });
      expect(compactResponse.status).toBe(202);
      const compactBody = (await compactResponse.json()) as {
        runId: string;
        assistantMessageId: string | null;
      };
      expect(compactBody.runId).toBeTruthy();
      expect(compactBody.assistantMessageId).toBeTruthy();
      // A successful compaction emits no assistant text; the run must still
      // classify succeeded (empty-output guard exemption).
      const compactStatus = await waitForRun(baseUrl, compactBody.runId);
      expect(compactStatus.status).toBe('succeeded');

      // Spawn args: turn 1 minted the session (--session-id), the compact
      // run resumed THAT session (--resume <same id>).
      const turns = (await readJsonlLines<string[]>(argsLogPath)).filter(
        (args) => args.includes('--session-id') || args.includes('--resume'),
      );
      expect(turns).toHaveLength(2);
      const mintedSessionId = flagValue(turns[0] ?? [], '--session-id');
      expect(mintedSessionId).toBeTruthy();
      expect(flagValue(turns[1] ?? [], '--resume')).toBe(mintedSessionId);

      // Stdin payloads: turn 1 got the composed prompt (wrapped in the
      // `# User request` scaffold), the compact turn got the BARE command —
      // any composed wrapper would demote `/compact` to literal user text.
      const stdinTurns = await readJsonlLines<{
        message?: { content?: Array<{ type?: string; text?: string }> };
      }>(stdinLogPath);
      expect(stdinTurns).toHaveLength(2);
      const textOf = (turn: (typeof stdinTurns)[number]) =>
        (turn.message?.content ?? [])
          .map((block) => (typeof block.text === 'string' ? block.text : ''))
          .join('');
      expect(textOf(stdinTurns[0]!)).toContain('please reply ok');
      expect(textOf(stdinTurns[0]!)).toContain('# User request');
      expect(textOf(stdinTurns[1]!)).toBe('/compact');
    } finally {
      if (originalPath == null) delete process.env.PATH;
      else process.env.PATH = originalPath;
    }
  });

  // Fake Claude CLI speaking the stream-json protocol. Logs argv per
  // invocation and every stdin JSONL line, replies to a `/compact` message
  // with the real CLI's compact frames (status compacting -> compact_boundary
  // -> empty result) and to anything else with a normal text turn. Windows
  // needs the `.cmd` shim: the daemon resolves `claude` via PATHEXT, and a
  // `#!/usr/bin/env node` script is not spawnable there (same technique as
  // chat-route.test.ts withFakeAgent).
  async function writeFakeCompactClaude(): Promise<{
    binDir: string;
    argsLogPath: string;
    stdinLogPath: string;
  }> {
    const binDir = await fsp.mkdtemp(join(tmpdir(), 'od-compact-route-bin-'));
    tempDirs.push(binDir);
    const argsLogPath = join(binDir, 'claude-args.jsonl');
    const stdinLogPath = join(binDir, 'claude-stdin.jsonl');
    const script = `
const fs = require('node:fs');
const argsLogPath = ${JSON.stringify(argsLogPath)};
const stdinLogPath = ${JSON.stringify(stdinLogPath)};
const argv = process.argv.slice(2);
if (argv.includes('--version')) { console.log('claude-code 9.9.9-compact-route'); process.exit(0); }
if (argv.includes('--help')) { console.log('Usage: claude -p [--include-partial-messages] [--add-dir DIR]'); process.exit(0); }
if (argv.includes('auth')) { console.log('ok'); process.exit(0); }
fs.appendFileSync(argsLogPath, JSON.stringify(argv) + '\\n');
let buffered = '';
let handled = false;
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  if (handled) return;
  buffered += chunk;
  const nl = buffered.indexOf('\\n');
  if (nl === -1) return;
  handled = true;
  const line = buffered.slice(0, nl);
  fs.appendFileSync(stdinLogPath, line + '\\n');
  let text = '';
  try {
    const msg = JSON.parse(line);
    text = (msg.message.content || [])
      .map((block) => (typeof block.text === 'string' ? block.text : ''))
      .join('');
  } catch {}
  console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-compact-route' }));
  if (text === '/compact') {
    console.log(JSON.stringify({ type: 'system', subtype: 'status', status: 'compacting' }));
    console.log(JSON.stringify({
      type: 'system',
      subtype: 'compact_boundary',
      compact_metadata: { trigger: 'manual', pre_tokens: 1956 },
    }));
    console.log(JSON.stringify({
      type: 'result', subtype: 'success', is_error: false, result: '', stop_reason: null,
    }));
  } else {
    console.log(JSON.stringify({
      type: 'assistant',
      message: { id: 'msg-compact-route-1', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' },
    }));
    console.log(JSON.stringify({
      type: 'result', subtype: 'success', is_error: false, result: 'ok', stop_reason: 'end_turn',
    }));
  }
  setTimeout(() => process.exit(0), 30);
});
`;
    if (process.platform === 'win32') {
      const runner = join(binDir, 'claude-compact-runner.cjs');
      await fsp.writeFile(runner, script);
      await fsp.writeFile(join(binDir, 'claude.cmd'), `@echo off\r\nnode "${runner}" %*\r\n`);
    } else {
      const bin = join(binDir, 'claude');
      await fsp.writeFile(bin, `#!/usr/bin/env node\n${script}`);
      await fsp.chmod(bin, 0o755);
    }
    return { binDir, argsLogPath, stdinLogPath };
  }
});

async function createProjectWithConversation(
  url: string,
  slug: string,
): Promise<{ projectId: string; conversationId: string }> {
  const projectId = `compact_route_${slug}_${randomUUID()}`;
  const response = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: `Compact route ${slug}`,
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { conversationId: string };
  expect(body.conversationId).toBeTruthy();
  return { projectId, conversationId: body.conversationId };
}

async function postCompact(
  url: string,
  projectId: string,
  conversationId: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(
    `${url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/compact`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    },
  );
}

function workspaceHeaders(workspaceId: string, workspaceMemberId: string) {
  return {
    'x-od-workspace-id': workspaceId,
    'x-od-workspace-member-id': workspaceMemberId,
  };
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
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run ${runId} did not finish`);
}

async function readJsonlLines<T>(file: string): Promise<T[]> {
  const raw = await fsp.readFile(file, 'utf8');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function flagValue(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] ?? null) : null;
}

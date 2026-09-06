/**
 * The run-terminal HTML cover wiring (spec §4.1 + §6.3).
 *
 * This suite exists because every PART of the cover pipeline was green while
 * the PRODUCT had no covers at all: the desktop renderer had 24 passing tests,
 * `attachChatArtifactThumbnail` had unit coverage, and nothing in the daemon
 * ever called either of them. So the assertions here deliberately start at the
 * `/api/chat` boundary and go all the way to the `ChatArtifactRef` the web card
 * reads — a test that called the cover helper directly would have been green on
 * the broken build too.
 *
 * The second thing it pins is §6.3's freeze. The renderer is held at a gate
 * until the test has already overwritten BOTH the entry HTML and its stylesheet
 * on disk; the bytes the renderer was handed must still be the ones the turn
 * produced. That is the difference between a cover and a lie.
 */

import type http from 'node:http';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type {
  DesktopExportArtifactInput,
  DesktopExportArtifactResult,
} from '@open-design/sidecar-proto';

import { startServer } from '../src/server.js';
import { projectChatArtifactRefs } from '../src/chat-artifacts/refs.js';
import type { ChatArtifactRef } from '../src/chat-artifacts/types.js';

/** A real 1x1 PNG: the daemon hashes and stores whatever the renderer returns. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const V1_CSS_MARKER = 'V1-CSS-MARKER';
const V2_CSS_MARKER = 'V2-CSS-MARKER';
const V1_BODY_MARKER = 'V1-BODY-MARKER';
const V2_BODY_MARKER = 'V2-BODY-MARKER';

type ExporterCall = DesktopExportArtifactInput;

let baseUrl: string;
let server: http.Server;
let exporterCalls: ExporterCall[] = [];
let exporterResult: (call: ExporterCall) => Promise<DesktopExportArtifactResult>;
let renderGate: Promise<void> = Promise.resolve();
const tempDirs: string[] = [];

async function withFakeAgent<T>(binName: string, script: string, run: () => Promise<T>): Promise<T> {
  const dir = await fsp.mkdtemp(join(tmpdir(), 'od-cover-bin-'));
  tempDirs.push(dir);
  const oldPath = process.env.PATH;
  try {
    if (process.platform === 'win32') {
      const runner = join(dir, `${binName}-test-runner.cjs`);
      await fsp.writeFile(runner, script);
      await fsp.writeFile(join(dir, `${binName}.cmd`), `@echo off\r\nnode "${runner}" %*\r\n`);
    } else {
      const bin = join(dir, binName);
      await fsp.writeFile(bin, `#!/usr/bin/env node\n${script}`);
      await fsp.chmod(bin, 0o755);
    }
    process.env.PATH = `${dir}${delimiter}${oldPath ?? ''}`;
    return await run();
  } finally {
    process.env.PATH = oldPath;
  }
}

async function waitFor<T>(
  probe: () => T | Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 8_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last = await probe();
  while (!predicate(last) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
    last = await probe();
  }
  return last;
}

interface CapturedSseEvent {
  event: string;
  data: any;
}

/**
 * Read `/api/projects/:id/events` as raw SSE frames.
 *
 * `EventSource` does not exist in this runtime and the daemon writes one frame
 * per `res.write` (`createSseResponse`), so a body reader split on the blank
 * line is both sufficient and closer to the wire than any client shim: it sees
 * the event NAME, which is the thing under test.
 */
async function openProjectEventStream(projectId: string): Promise<{
  events: CapturedSseEvent[];
  ready: Promise<void>;
  close: () => void;
}> {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/api/projects/${projectId}/events`, {
    headers: { Accept: 'text/event-stream' },
    signal: controller.signal,
  });
  expect(response.ok, 'the project event stream should accept the subscription').toBe(true);

  const events: CapturedSseEvent[] = [];
  let markReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });

  void (async () => {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        let boundary = buffered.indexOf('\n\n');
        while (boundary !== -1) {
          const frame = buffered.slice(0, boundary);
          buffered = buffered.slice(boundary + 2);
          const name = /^event:\s*(.*)$/m.exec(frame)?.[1]?.trim();
          if (name) {
            const raw = /^data:\s*(.*)$/m.exec(frame)?.[1];
            let data: any = null;
            try {
              data = raw ? JSON.parse(raw) : null;
            } catch {
              // A frame we cannot parse is still a frame; keep the name.
            }
            events.push({ event: name, data });
            if (name === 'ready') markReady();
          }
          boundary = buffered.indexOf('\n\n');
        }
      }
    } catch {
      // Aborted by `close()` at the end of the test.
    }
  })();

  return { events, ready, close: () => controller.abort() };
}

function dataDir(): string {
  const dir = process.env.OD_DATA_DIR;
  if (!dir) throw new Error('OD_DATA_DIR is required for chat artifact cover tests');
  return dir;
}

function withDb<T>(fn: (db: Database.Database) => T): T {
  const db = new Database(resolve(dataDir(), 'app.sqlite'));
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function latestAssistantMessageId(conversationId: string): string | null {
  return withDb((db) => {
    const row = db
      .prepare(
        `SELECT id FROM messages
          WHERE conversation_id = ? AND role = 'assistant'
          ORDER BY rowid DESC LIMIT 1`,
      )
      .get(conversationId) as { id: string } | undefined;
    return row?.id ?? null;
  });
}

function refsFor(projectId: string, messageId: string): ChatArtifactRef[] {
  return withDb((db) => projectChatArtifactRefs(db, projectId, messageId));
}

/**
 * Drive one real turn that writes `index.html` + `style.css` into the run cwd,
 * and return everything the assertions need. The fake agent prints its own cwd
 * so the test never has to assume a projects-directory layout.
 */
async function runTurnThatWritesHtml(): Promise<{
  projectId: string;
  conversationId: string;
  messageId: string;
  cwd: string;
}> {
  const projectId = `proj-${randomUUID()}`;
  // The web client mints the assistant message id up front and hands it to the
  // daemon; the run's artifact refs hang off that row, so a turn without one
  // has nothing to attach a cover to.
  const assistantMessageId = `assistant-${randomUUID()}`;
  const created = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: projectId, name: 'chat artifact cover fixture' }),
  });
  expect(created.ok).toBe(true);

  const conversations = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`);
  expect(conversations.ok).toBe(true);
  const conversationId = ((await conversations.json()) as { conversations: Array<{ id: string }> })
    .conversations[0]?.id;
  expect(conversationId).toBeTruthy();

  const script = `
const fs = require('node:fs');
const path = require('node:path');
fs.writeFileSync(path.join(process.cwd(), 'style.css'), 'body{background:#0af}/* ${V1_CSS_MARKER} */');
fs.writeFileSync(
  path.join(process.cwd(), 'index.html'),
  '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body><h1>${V1_BODY_MARKER}</h1></body></html>',
);
console.log(JSON.stringify({ type: 'step_start' }));
console.log(JSON.stringify({ type: 'text', part: { text: 'cwd=' + process.cwd() + '=cwd' } }));
console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
process.exit(0);
`;

  const body = await withFakeAgent('opencode', script, async () => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'opencode',
        projectId,
        conversationId,
        assistantMessageId,
        message: 'build a page',
      }),
    });
    expect(response.ok).toBe(true);
    return await response.text();
  });

  const cwd = /cwd=(.+?)=cwd/.exec(body)?.[1];
  expect(cwd, 'the fake agent should report the run cwd').toBeTruthy();

  const messageId = await waitFor(
    () => latestAssistantMessageId(conversationId!),
    (value) => value === assistantMessageId,
    5_000,
  );
  expect(messageId, 'the turn should have persisted its assistant message').toBe(assistantMessageId);

  return { projectId, conversationId: conversationId!, messageId: assistantMessageId, cwd: cwd! };
}

describe('run terminal HTML cover wiring', () => {
  beforeAll(async () => {
    const started = (await startServer({
      port: 0,
      returnServer: true,
      desktopArtifactExporter: async (input) => {
        exporterCalls.push(input);
        await renderGate;
        return await exporterResult(input);
      },
    })) as { url: string; server: http.Server };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    for (const dir of tempDirs.splice(0)) {
      await fsp.rm(dir, { recursive: true, force: true });
    }
    if (server) await new Promise<void>((done) => server.close(() => done()));
  });

  it('attaches a first-viewport cover to the HTML card produced by a finished turn', async () => {
    exporterCalls = [];
    renderGate = Promise.resolve();
    const rendered: string[] = [];
    exporterResult = async () => {
      const out = join(await fsp.mkdtemp(join(tmpdir(), 'od-cover-out-')), 'cover.png');
      rendered.push(out);
      await fsp.writeFile(out, PNG_1X1);
      return { ok: true, path: out, mime: 'image/png', bytes: PNG_1X1.byteLength };
    };

    const turn = await runTurnThatWritesHtml();

    const refs = await waitFor(
      () => refsFor(turn.projectId, turn.messageId),
      (list) => list.some((ref) => ref.label === 'index.html' && ref.snapshotState === 'ready'),
    );

    const htmlRef = refs.find((ref) => ref.label === 'index.html');
    expect(htmlRef, 'the turn produced index.html, so the message should carry a ref').toBeTruthy();
    // §4.1: cover is the frozen shot, click target is the live workspace file.
    expect(htmlRef?.displayPolicy).toBe('latest_with_static_preview');
    expect(htmlRef?.workspaceArtifactId).toBeTruthy();
    // The actual defect: no cover ever reached the card.
    expect(htmlRef?.snapshotState).toBe('ready');
    expect(htmlRef?.thumbnailUrl).toBeTruthy();
    // A cover is a rendering OF the file, never a copy of it.
    expect(htmlRef?.snapshotUrl).toBeUndefined();

    // And the renderer was asked for a viewport cover, not the 20,000px long
    // image `od export` produces.
    expect(exporterCalls).toHaveLength(1);
    expect(exporterCalls[0]?.captureMode).toBe('first_viewport_thumbnail');
    expect(exporterCalls[0]?.format).toBe('image');

    // The cover must be servable, not just recorded.
    const cover = await fetch(`${baseUrl}${htmlRef!.thumbnailUrl!}`);
    expect(cover.status).toBe(200);
    expect(Buffer.from(await cover.arrayBuffer()).equals(PNG_1X1)).toBe(true);

    for (const file of rendered) {
      // The daemon owns the renderer's temp output and must not leak it.
      await expect(fsp.stat(file)).rejects.toThrow();
    }
  });

  it('renders the bytes of THAT turn even when the files are overwritten before the render runs', async () => {
    exporterCalls = [];
    let release!: () => void;
    renderGate = new Promise<void>((r) => {
      release = r;
    });
    exporterResult = async () => {
      const out = join(await fsp.mkdtemp(join(tmpdir(), 'od-cover-out-')), 'cover.png');
      await fsp.writeFile(out, PNG_1X1);
      return { ok: true, path: out, mime: 'image/png', bytes: PNG_1X1.byteLength };
    };

    const turn = await runTurnThatWritesHtml();

    // The turn is already terminal (the chat response above completed) while
    // the renderer is still parked at the gate — so the cover render does not
    // hold the chat turn open.
    await waitFor(() => exporterCalls.length, (n) => n > 0, 8_000);
    expect(exporterCalls.length, 'the terminal path should have asked for a cover').toBe(1);

    // Now the next turn's overwrite lands, before the renderer has drawn anything.
    await fsp.writeFile(
      join(turn.cwd, 'style.css'),
      `body{background:#f00}/* ${V2_CSS_MARKER} */`,
      'utf8',
    );
    await fsp.writeFile(
      join(turn.cwd, 'index.html'),
      `<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body><h1>${V2_BODY_MARKER}</h1></body></html>`,
      'utf8',
    );
    release();

    const frozen = exporterCalls[0]?.html ?? '';
    // §6.3: the renderer input was frozen at the chokepoint. The entry markup
    // AND its local stylesheet are the turn's, not today's.
    expect(frozen).toContain(V1_BODY_MARKER);
    expect(frozen).not.toContain(V2_BODY_MARKER);
    expect(frozen).toContain(V1_CSS_MARKER);
    expect(frozen).not.toContain(V2_CSS_MARKER);
    // Dependency-complete: nothing in the frozen document can reach back into
    // the live workspace while it renders.
    expect(frozen).not.toContain('href="style.css"');
    expect(exporterCalls[0]?.baseHref).toBeUndefined();

    const refs = await waitFor(
      () => refsFor(turn.projectId, turn.messageId),
      (list) => list.some((ref) => ref.label === 'index.html' && ref.snapshotState === 'ready'),
    );
    expect(refs.find((ref) => ref.label === 'index.html')?.thumbnailUrl).toBeTruthy();
  });

  it('falls back silently when the renderer cannot produce a cover', async () => {
    exporterCalls = [];
    renderGate = Promise.resolve();
    exporterResult = async () => ({
      ok: false,
      code: 'capture_blank',
      error: 'first-viewport thumbnail came back transparent',
    });

    const turn = await runTurnThatWritesHtml();

    const refs = await waitFor(
      () => refsFor(turn.projectId, turn.messageId),
      (list) => list.some((ref) => ref.label === 'index.html' && ref.snapshotState !== 'legacy_unavailable'),
    );
    const htmlRef = refs.find((ref) => ref.label === 'index.html');
    // Product ruling 2026-09-02: no placeholder, no failure copy — the card
    // just keeps its live preview. So the ref must stay openable and carry no
    // cover URL at all.
    expect(htmlRef?.thumbnailUrl).toBeUndefined();
    expect(htmlRef?.snapshotUrl).toBeUndefined();
    expect(htmlRef?.workspaceArtifactId).toBeTruthy();
    expect(htmlRef?.snapshotState).toBe('failed');
  });

  it('records the HTML version this turn wrote as the ref\'s lineage', async () => {
    exporterCalls = [];
    renderGate = Promise.resolve();
    exporterResult = async () => ({ ok: false, code: 'capture_blank', error: 'not the point here' });

    const turn = await runTurnThatWritesHtml();

    /*
     * §3.2 lists `html_version_id` as the ref's lineage into the existing HTML
     * version store, and nothing ever filled it: the versions are snapshotted
     * AFTER the refs are written, so at ref-write time there is no id to carry.
     * The backfill closes that, which is what makes "which stored version was
     * this card's page?" answerable at all.
     */
    const lineage = await waitFor(
      () =>
        withDb((db) =>
          db
            .prepare(
              `SELECT label_at_capture AS label, html_version_id AS versionId
                 FROM message_artifacts WHERE message_id = ?`,
            )
            .all(turn.messageId) as Array<{ label: string; versionId: string | null }>,
        ),
      (rows) => rows.some((row) => row.label === 'index.html' && Boolean(row.versionId)),
    );
    const html = lineage.find((row) => row.label === 'index.html');
    expect(html?.versionId, 'the HTML ref should carry the version this turn wrote').toBeTruthy();

    // And the id must be a real row in the version store, not a fabricated one.
    const versions = await fetch(
      `${baseUrl}/api/projects/${turn.projectId}/files/index.html/versions`,
    );
    expect(versions.ok).toBe(true);
    const body = (await versions.json()) as { versions?: Array<{ id: string }> };
    expect((body.versions ?? []).map((v) => v.id)).toContain(html!.versionId);
  });

  /**
   * 设计文档第 505 行:「pending thumbnail 不出 placeholder,直接走 §6.4 的降级支;
   * **后台 ready 后消息投影更新**」。
   *
   * 前半条早就成立(上面几条测的就是它),后半条一直是空的:封面**故意不 await**,
   * 它在终止帧之后几百毫秒才落库,而 daemon 落库时**一声不吭**。客户端在
   * run 终止后 150ms 拉一次(`ProjectView.scheduleConversationMessageRefresh`),
   * 那一拉必然早于封面,之后再也不拉 —— 于是卡片在整个会话里一直停在降级支的
   * live iframe 上,直到整页刷新。真机实测这一局输了 466 毫秒:ref 落库
   * 17:13:05,封面 ready 17:13:06。
   *
   * ── 这个量法能看见缺陷吗 ────────────────────────────────────────────────
   * 关键是**订阅发生在 run 已经终止之后**。这正是真实用户的处境:他盯着一条
   * 已经写完的消息。如果先订阅再跑,事件可能是被终止帧顺路带出来的,那就证不出
   * 「封面自己会说话」。所以这里先把 renderer 关在闸门后跑完一整轮,确认此刻
   * **还没有** ready 的 ref,再连上事件流,最后才放行渲染。
   *
   * 断言的是 wire 上的事件名和消息身份,不是某个内部函数被调用过 —— 后者在
   * daemon 不推送的今天也能被 mock 成绿的。
   */
  it('tells the project stream when a cover lands after the turn already ended', async () => {
    exporterCalls = [];
    let release!: () => void;
    renderGate = new Promise<void>((r) => {
      release = r;
    });
    exporterResult = async () => {
      const out = join(await fsp.mkdtemp(join(tmpdir(), 'od-cover-out-')), 'cover.png');
      await fsp.writeFile(out, PNG_1X1);
      return { ok: true, path: out, mime: 'image/png', bytes: PNG_1X1.byteLength };
    };

    const turn = await runTurnThatWritesHtml();

    // The turn is terminal and the renderer is parked at the gate, so the card
    // the user is looking at right now has no cover — it is on the live-iframe
    // degrade branch. That is the moment this test is about.
    await waitFor(() => exporterCalls.length, (n) => n > 0, 8_000);
    const beforeRelease = refsFor(turn.projectId, turn.messageId);
    expect(
      beforeRelease.find((ref) => ref.label === 'index.html')?.snapshotState,
      'the cover must still be outstanding, otherwise this test proves nothing',
    ).not.toBe('ready');

    // The viewer connects AFTER the run finished, exactly like someone sitting
    // on a completed message.
    const stream = await openProjectEventStream(turn.projectId);
    try {
      await stream.ready;

      release();

      const signal = await waitFor(
        () => stream.events.find((evt) => evt.event === 'chat-artifact-refs-changed'),
        (evt) => Boolean(evt),
        8_000,
      );

      expect(
        signal,
        'a cover that lands after the terminal frame must announce itself on the project stream',
      ).toBeTruthy();
      // The payload has to name the message whose projection went stale, or the
      // client cannot know which conversation to re-read.
      expect(signal?.data?.projectId).toBe(turn.projectId);
      expect(signal?.data?.conversationId).toBe(turn.conversationId);
      expect(signal?.data?.messageId).toBe(turn.messageId);

      // And the re-read the signal invites must actually return the cover.
      const refs = await waitFor(
        () => refsFor(turn.projectId, turn.messageId),
        (list) => list.some((ref) => ref.label === 'index.html' && ref.snapshotState === 'ready'),
      );
      expect(refs.find((ref) => ref.label === 'index.html')?.thumbnailUrl).toBeTruthy();
    } finally {
      stream.close();
    }
  });
});

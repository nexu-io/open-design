import fs from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, openDatabase, upsertMessage } from '../../src/db.js';
import { createChatArtifactBlobStore, resetChatArtifactBlobStoreCache } from '../../src/chat-artifacts/blob-store.js';
import { ensureWorkspaceArtifactForPath, getChatArtifactSnapshot, listMessageArtifactRows, replaceMessageArtifacts } from '../../src/chat-artifacts/store.js';
import { CHAT_ARTIFACT_COVER_BUDGET_MS, freezeAndRenderChatArtifactCovers, type ChatArtifactCoverRenderer } from '../../src/chat-artifacts/cover.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

describe('actual cover renderer failure persistence', () => {
  let root: string;
  let deps: { db: ReturnType<typeof openDatabase>; blobs: ReturnType<typeof createChatArtifactBlobStore> };
  let rows: ReturnType<typeof replaceMessageArtifacts>;
  const onRefsChanged = vi.fn();
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opend2949-renderer-audit-'));
    resetChatArtifactBlobStoreCache();
    onRefsChanged.mockReset();
    const dataDir = path.join(root, 'data');
    const db = openDatabase(root, { dataDir });
    db.prepare('INSERT INTO projects (id,name,created_at,updated_at) VALUES (?,?,?,?)').run('p', 'P', 1, 1);
    db.prepare('INSERT INTO conversations (id,project_id,created_at,updated_at) VALUES (?,?,?,?)').run('c', 'p', 1, 1);
    upsertMessage(db, 'c', { id: 'm', role: 'assistant', content: 'Delivered index.html', runId: 'original-run', runStatus: 'succeeded' });
    const artifact = ensureWorkspaceArtifactForPath(db, { projectId: 'p', path: 'index.html', kind: 'html', mime: 'text/html' });
    rows = replaceMessageArtifacts(db, 'm', [{ workspaceArtifactId: artifact.id, label: 'index.html', kind: 'html', displayPolicy: 'latest_with_static_preview' }]);
    deps = { db, blobs: createChatArtifactBlobStore({ dataDir }) };
    fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>Original</title><p>Light original</p>');
  });
  afterEach(() => {
    vi.useRealTimers(); vi.restoreAllMocks(); closeDatabase(); resetChatArtifactBlobStoreCache();
    fs.rmSync(root, { recursive: true, force: true });
  });
  function snapshot() {
    const id = listMessageArtifactRows(deps.db, 'm')[0]!.snapshotId;
    return id ? getChatArtifactSnapshot(deps.db, id) : null;
  }
  async function capture(renderer: ChatArtifactCoverRenderer | null) {
    return freezeAndRenderChatArtifactCovers(deps, { projectRoot: root, rows, renderer, onRefsChanged });
  }
  it('skips a genuinely absent exporter without creating a failed snapshot', async () => {
    expect(await capture(null)).toEqual({ frozen: 0, skipped: 1, failed: 0 });
    expect(snapshot()).toBeNull();
  });
  it.each([
    { code: 'render_timeout' as const, expected: 'timeout' },
    { code: 'capture_blank' as const, expected: 'renderer_unavailable' },
    { code: 'unsupported_capture_mode' as const, expected: 'renderer_unavailable' },
  ])('maps renderer result $code to $expected', async ({ code, expected }) => {
    vi.useFakeTimers();
    await capture(async () => ({ ok: false, code, error: `actual renderer reported ${code}` }));
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshot()?.failureCode).toBe(expected);
  });
  it('stores a disconnected renderer exception as renderer_unavailable', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await capture(async () => { throw new Error('desktop sidecar is unavailable'); });
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshot()?.failureCode).toBe('renderer_unavailable');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('desktop sidecar is unavailable'));
  });
  it('classifies the daemon outer renderer budget as a timeout', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await capture(() => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(CHAT_ARTIFACT_COVER_BUDGET_MS);
    expect(snapshot()?.failureCode).toBe('timeout');
  });
  it('cleans a renderer output arriving after the daemon budget has elapsed', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let finish!: (result: Awaited<ReturnType<ChatArtifactCoverRenderer>>) => void;
    await capture(() => new Promise((resolve) => { finish = resolve; }));
    await vi.advanceTimersByTimeAsync(CHAT_ARTIFACT_COVER_BUDGET_MS);
    expect(snapshot()?.captureState).toBe('failed');
    const output = path.join(root, 'late-renderer-output.png');
    const failedSnapshot = snapshot();
    fs.writeFileSync(output, PNG);
    finish({ ok: true, path: output, mime: 'image/png' });
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(fs.existsSync(output)).toBe(false), { timeout: 100, interval: 10 });
    expect(snapshot()).toEqual(failedSnapshot);
    expect(onRefsChanged).not.toHaveBeenCalled();
    expect(await deps.blobs.listObjectKeys()).toEqual([]);
  });
  it('does not mistake an exporter error with timeout-like text for the daemon deadline', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await capture(async () => { throw new Error(`chat artifact cover exceeded ${CHAT_ARTIFACT_COVER_BUDGET_MS}ms`); });
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshot()?.failureCode).toBe('renderer_unavailable');
  });

  it('persists and announces a cover returned before the deadline, then removes its temp file', async () => {
    vi.useFakeTimers();
    let finish!: (result: Awaited<ReturnType<ChatArtifactCoverRenderer>>) => void;
    await capture(() => new Promise((resolve) => { finish = resolve; }));
    await vi.advanceTimersByTimeAsync(CHAT_ARTIFACT_COVER_BUDGET_MS - 1);
    expect(snapshot()).toBeNull();
    const output = path.join(root, 'in-budget.png');
    fs.writeFileSync(output, PNG);
    finish({ ok: true, path: output, mime: 'image/png' });
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => {
      expect(onRefsChanged).toHaveBeenCalledOnce();
      expect(fs.existsSync(output)).toBe(false);
    });
    const stored = snapshot()!;
    expect(stored.captureState).toBe('ready');
    expect(stored.thumbnailDigest).toBe(`sha256:${createHash('sha256').update(PNG).digest('hex')}`);
    expect(await deps.blobs.readBlob(deps.blobs.storageKeyFor(stored.thumbnailDigest!))).toEqual(PNG);
    expect(onRefsChanged).toHaveBeenCalledWith(rows[0]);
  });

  it('keeps the timeout verdict when the original renderer later rejects', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let reject!: (error: Error) => void;
    await capture(() => new Promise((_, fail) => { reject = fail; }));
    await vi.advanceTimersByTimeAsync(CHAT_ARTIFACT_COVER_BUDGET_MS);
    const failedSnapshot = snapshot();
    reject(new Error('late desktop disconnect'));
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshot()).toEqual(failedSnapshot);
    expect(onRefsChanged).not.toHaveBeenCalled();
    expect(await deps.blobs.listObjectKeys()).toEqual([]);
  });

  it('continues the next cover after timeout and never attaches the first renderer late output', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const second = ensureWorkspaceArtifactForPath(deps.db, { projectId: 'p', path: 'second.html', kind: 'html', mime: 'text/html' });
    rows = replaceMessageArtifacts(deps.db, 'm', [
      { workspaceArtifactId: rows[0]!.workspaceArtifactId!, label: 'index.html', kind: 'html', displayPolicy: 'latest_with_static_preview' },
      { workspaceArtifactId: second.id, label: 'second.html', kind: 'html', displayPolicy: 'latest_with_static_preview' },
    ]);
    fs.writeFileSync(path.join(root, 'second.html'), '<!doctype html><p>Second document</p>');
    const secondOutput = path.join(root, 'second-output.png');
    fs.writeFileSync(secondOutput, PNG);
    let finishFirst!: (result: Awaited<ReturnType<ChatArtifactCoverRenderer>>) => void;
    const renderer = vi.fn<ChatArtifactCoverRenderer>()
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce({ ok: true, path: secondOutput, mime: 'image/png' });
    await capture(renderer);
    await vi.advanceTimersByTimeAsync(CHAT_ARTIFACT_COVER_BUDGET_MS);
    await vi.waitFor(() => {
      expect(onRefsChanged).toHaveBeenCalledExactlyOnceWith(rows[1]);
      expect(fs.existsSync(secondOutput)).toBe(false);
    });
    expect(renderer).toHaveBeenCalledTimes(2);
    const beforeLate = listMessageArtifactRows(deps.db, 'm').map((row) => getChatArtifactSnapshot(deps.db, row.snapshotId!));
    expect(beforeLate.map((entry) => entry?.captureState)).toEqual(['failed', 'ready']);
    const firstOutput = path.join(root, 'first-late.png');
    fs.writeFileSync(firstOutput, PNG);
    finishFirst({ ok: true, path: firstOutput, mime: 'image/png' });
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(fs.existsSync(firstOutput)).toBe(false), { timeout: 100, interval: 10 });
    const afterLate = listMessageArtifactRows(deps.db, 'm').map((row) => getChatArtifactSnapshot(deps.db, row.snapshotId!));
    expect(afterLate).toEqual(beforeLate);
    expect(onRefsChanged).toHaveBeenCalledExactlyOnceWith(rows[1]);
    expect(deps.db.prepare('SELECT COUNT(*) AS count FROM chat_artifact_snapshots').get()).toEqual({ count: 2 });
  });

});

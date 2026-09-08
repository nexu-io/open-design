// ---------------------------------------------------------------------------
// Design §10.3: what a finished turn reports about its own artifact capture,
// and the one counter in it that is an alarm rather than a metric.
//
// `source_changed` means the file on disk stopped being the file this turn
// produced BEFORE the copy was taken. Every other failure code says "we could
// not keep a copy"; this one says the capture WINDOW is wrong. Averaged into a
// failure rate it disappears — a store that is 2% full and a store that is
// fabricating history look identical — so it has to be countable on its own.
//
// The event carries counts and ids. The assertions below also pin what it must
// NOT carry: a snapshot is a copy of the user's own design work, so no path,
// label, digest, byte size or URL may ride along (§10.3, §11).
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { closeDatabase, openDatabase } from '../src/db.js';
import {
  createChatArtifactBlobStore,
  resetChatArtifactBlobStoreCache,
} from '../src/chat-artifacts/blob-store.js';
import { captureRunChatArtifactSnapshots } from '../src/chat-artifacts/run-capture.js';
import { chatArtifactCaptureResultProps } from '../src/chat-artifacts/telemetry.js';
import type { CaptureRunChatArtifactsReport } from '../src/chat-artifacts/run-capture.js';

function report(over: Partial<CaptureRunChatArtifactsReport> = {}): CaptureRunChatArtifactsReport {
  return { refs: 0, captured: 0, reused: 0, failed: 0, failureCodes: {}, rows: [], ...over };
}

describe('chat artifact capture telemetry', () => {
  it('breaks source_changed out of the failure total', () => {
    const props = chatArtifactCaptureResultProps({
      projectId: 'proj-1',
      runId: 'run-1',
      report: report({
        refs: 3,
        captured: 1,
        failed: 2,
        failureCodes: { source_changed: 1, quota_exceeded: 1 },
      }),
    });

    expect(props).toBeTruthy();
    // The alarm, visible without reconstructing it from anything else.
    expect(props!.source_changed_count).toBe(1);
    // A lens on the failures, not a bucket carved out of them: the total still
    // includes it, so a dashboard never has to sum disjoint columns.
    expect(props!.failed_count).toBe(2);
    expect(props!.result).toBe('degraded');
  });

  it('reports zero rather than nothing when no source changed', () => {
    const props = chatArtifactCaptureResultProps({
      projectId: 'proj-1',
      runId: 'run-1',
      report: report({ refs: 2, captured: 1, failed: 1, failureCodes: { quota_exceeded: 1 } }),
    });
    // An absent field and a zero are the same reading on a dashboard only if
    // the field is always present. A `quota_exceeded` turn must still say
    // "source_changed: 0" so the alarm's denominator is real.
    expect(props!.source_changed_count).toBe(0);
    expect(props!.failed_count).toBe(1);
  });

  it('calls a fully reused turn a success', () => {
    const props = chatArtifactCaptureResultProps({
      projectId: 'proj-1',
      runId: 'run-1',
      report: report({ refs: 2, reused: 2 }),
    });
    // Reuse IS the strong path — the media hook already froze provider bytes.
    // Scoring it as a shortfall would invert the health signal.
    expect(props!.result).toBe('success');
    expect(props!.reused_count).toBe(2);
    expect(props!.captured_count).toBe(0);
  });

  it('says nothing at all about a turn that produced no cards', () => {
    // Most turns write no artifacts. A row of zeroes for each of them buries
    // the failure rate this event exists to watch.
    expect(chatArtifactCaptureResultProps({
      projectId: 'proj-1',
      runId: 'run-1',
      report: report(),
    })).toBeNull();
  });

  it('carries counts and ids only', () => {
    const props = chatArtifactCaptureResultProps({
      projectId: 'proj-1',
      runId: 'run-1',
      report: report({ refs: 1, captured: 1 }),
    })!;
    // Exact key set: a future field cannot slip in without this failing.
    expect(Object.keys(props).sort()).toEqual([
      'area',
      'captured_count',
      'failed_count',
      'page_name',
      'project_id',
      'ref_count',
      'result',
      'reused_count',
      'run_id',
      'source_changed_count',
    ]);
    const serialized = JSON.stringify(props);
    for (const forbidden of ['sha256', '.png', '.html', '/', 'byte']) {
      expect(serialized, `event leaked ${forbidden}`).not.toContain(forbidden);
    }
  });
});

// The counter is only worth anything if the capture pass actually produces it.
describe('run capture counts a drifted source under source_changed', () => {
  let dataDir: string;
  let projectRoot: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'od-chatart-tel-data-'));
    projectRoot = mkdtempSync(path.join(os.tmpdir(), 'od-chatart-tel-proj-'));
    resetChatArtifactBlobStoreCache();
  });

  afterEach(() => {
    closeDatabase();
    resetChatArtifactBlobStoreCache();
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('files a missing source as its own code, not as an untyped failure', async () => {
    const db = openDatabase(dataDir, { dataDir });
    const blobs = createChatArtifactBlobStore({ dataDir });
    const now = Date.now();
    db.prepare(`INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`)
      .run('proj-1', 'proj-1', now, now);
    db.prepare(
      `INSERT INTO conversations (id, project_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run('conv-1', 'proj-1', now, now);
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at, position)
       VALUES (?, ?, 'assistant', '', ?, 0)`,
    ).run('msg-1', 'conv-1', now);

    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(path.join(projectRoot, 'kept.png'), Buffer.from('real-bytes', 'utf8'));

    const captured = await captureRunChatArtifactSnapshots({ db, blobs }, {
      projectId: 'proj-1',
      projectRoot,
      messageId: 'msg-1',
      runId: 'run-1',
      // The second path was touched by the run and is already gone by the time
      // the chokepoint reads it — the shape a same-turn cleanup produces.
      touchedPaths: [
        path.join(projectRoot, 'kept.png'),
        path.join(projectRoot, 'vanished.png'),
      ],
    });

    expect(captured.captured).toBe(1);
    expect(captured.failed).toBe(1);
    // Coded, so telemetry can tell this apart from a quota or drift failure.
    expect(captured.failureCodes).toEqual({ source_missing: 1 });

    const props = chatArtifactCaptureResultProps({
      projectId: 'proj-1',
      runId: 'run-1',
      report: captured,
    })!;
    expect(props.failed_count).toBe(1);
    expect(props.source_changed_count).toBe(0);
  });
});

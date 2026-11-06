import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import {
  getMediaTask,
  insertMediaTask,
  migrateMediaTasks,
  updateMediaTask,
} from '../../src/media/tasks.js';
import { mediaTaskErrorFromFailure } from '../../src/routes/media.js';
import { VelaMediaError } from '../../src/media/vela.js';

/** Shape of `StubProviderDisabledError` (apps/daemon/src/media/index.ts), which is module-private. */
function stubProviderDisabled(model: string): Error {
  return Object.assign(
    new Error(`provider not configured: ${model}. Add your API key in settings to enable real generation.`),
    { code: 'STUB_PROVIDER_DISABLED', status: 503 },
  );
}

/**
 * OPEND-2577. A recorded media failure is the only thing left to explain
 * itself with, so the classified next step has to survive the same two hops
 * `code` / `subject` / `retryable` already do: the failure → the persisted
 * task, and SQLite → the snapshot the agent and the chat host read back.
 */
function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    INSERT INTO projects (id, name, created_at, updated_at) VALUES ('project-1', 'p', 0, 0);
  `);
  migrateMediaTasks(db);
  return db;
}

function roundTrip(error: unknown): ReturnType<typeof mediaTaskErrorFromFailure> {
  const db = freshDb();
  try {
    insertMediaTask(db, { id: 'task-1', projectId: 'project-1', status: 'running' });
    updateMediaTask(db, 'task-1', {
      status: 'failed',
      error: mediaTaskErrorFromFailure(error),
      endedAt: Date.now(),
    });
    const row = getMediaTask(db, 'task-1');
    if (!row?.error) throw new Error('media task error was not persisted');
    return row.error;
  } finally {
    db.close();
  }
}

describe('recorded media failures carry a next step', () => {
  it('classifies a content refusal as something the user can fix', () => {
    const error = mediaTaskErrorFromFailure(
      new VelaMediaError('the request was refused', {
        code: 'safety_rejection',
        subject: 'prompt',
        retryable: false,
      }),
    );

    expect(error.nextStep).toBe('revise-request');
    expect(error.subject).toBe('prompt');
    expect(error.retryable).toBe(false);
  });

  it('classifies an upstream wobble as retryable rather than the user’s fault', () => {
    expect(mediaTaskErrorFromFailure(new Error('openai image 503: upstream busy')).nextStep)
      .toBe('retry-later');
  });

  it('classifies the failure the user was shown a bare code for as ours to fix', () => {
    const error = mediaTaskErrorFromFailure(
      Object.assign(new Error('media dispatcher failed before generation started'), {
        code: 'MEDIA_DISPATCH_FAILED',
      }),
    );

    expect(error.nextStep).toBe('contact-support');
  });

  it('sends a model with no configured renderer to Settings', () => {
    expect(mediaTaskErrorFromFailure(stubProviderDisabled('some-model')).nextStep)
      .toBe('open-settings');
  });

  it('reads an OD-owned credential failure as a sign-in, not a BYOK key', () => {
    expect(
      mediaTaskErrorFromFailure(new Error('vela image 401: unauthorized'), {
        model: 'vela/gpt-image-2',
      }).nextStep,
    ).toBe('sign-in');
    expect(
      mediaTaskErrorFromFailure(new Error('senseaudio image 401: unauthorized'), {
        model: 'senseaudio-image',
      }).nextStep,
    ).toBe('open-settings');
  });

  it('survives the SQLite round-trip the way code and retryable do', () => {
    const restored = roundTrip(
      new VelaMediaError('the reference image was refused', {
        code: 'safety_rejection',
        subject: 'input_image',
        retryable: false,
      }),
    );

    expect(restored.nextStep).toBe('revise-request');
    expect(restored.subject).toBe('input_image');
    expect(restored.code).toBe('safety_rejection');
  });

  it('never persists an unknown value smuggled through the JSON column', () => {
    const db = freshDb();
    try {
      insertMediaTask(db, { id: 'task-2', projectId: 'project-1', status: 'running' });
      updateMediaTask(db, 'task-2', {
        status: 'failed',
        error: { message: 'from a newer daemon', nextStep: 'ask-a-friend' } as never,
        endedAt: Date.now(),
      });
      expect(getMediaTask(db, 'task-2')?.error).not.toHaveProperty('nextStep');
    } finally {
      db.close();
    }
  });
});

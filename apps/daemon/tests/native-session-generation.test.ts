import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ChildProcess } from 'node:child_process';
import { PassThrough } from 'node:stream';
import {
  closeDatabase, getAgentSessionRecord, insertConversation, insertProject,
  openDatabase, upsertAgentSession, upsertMessage,
} from '../src/db.js';
import {
  persistCapturedAgentSession, resolveAgentResumeContext, resolveAgentResumePromptPolicy,
} from '../src/agent-session-resume.js';
import { attachDshProfileSession } from '../src/agent-protocol/dsh-profile/session.js';
import { parseDshProfileRuntimeFrame } from '../src/agent-protocol/dsh-profile/frames.js';

const resumable = { isResuming: true, resumeSessionId: 'saved', invalidationReason: null };

describe('native session compatibility generation', () => {
  it.each([
    ['legacy', null, 'generation-2'],
    ['missing active', 'generation-2', null],
    ['both missing', null, null],
    ['upgrade', 'generation-1', 'generation-2'],
    ['rollback', 'generation-2', 'generation-1'],
  ])('uses full context without a native handle on %s', (_label, storedGeneration, activeGeneration) => {
    expect(resolveAgentResumePromptPolicy(resumable, { storedGeneration, activeGeneration }))
      .toMatchObject({ resumeSessionId: null, skipTranscript: false, requiresFullTranscript: true });
  });

  it('resumes with incremental context on a matching generation', () => {
    expect(resolveAgentResumePromptPolicy(resumable, {
      storedGeneration: 'generation-2', activeGeneration: 'generation-2',
    })).toMatchObject({ resumeSessionId: 'saved', skipTranscript: true });
  });

  it('preserves non-opted-in adapters and the existing conversation guard', () => {
    expect(resolveAgentResumePromptPolicy(resumable).skipTranscript).toBe(true);
    expect(resolveAgentResumePromptPolicy({ ...resumable, invalidationReason: 'conversation_advanced' }, {
      storedGeneration: 'generation-2', activeGeneration: 'generation-2',
    }).skipTranscript).toBe(false);
  });

  it('does not expose opaque generation values in the decision diagnostic', () => {
    const policy = resolveAgentResumePromptPolicy(resumable, {
      storedGeneration: 'private-old', activeGeneration: 'private-new',
    });
    expect(policy.invalidationReason).toBe('compatibility_generation_changed');
    expect(JSON.stringify(policy)).not.toContain('private-');
  });
});

describe('compatibility generation persistence', () => {
  let directory: string;
  beforeEach(() => { directory = mkdtempSync(path.join(tmpdir(), 'od-generation-')); });
  afterEach(() => { closeDatabase(); rmSync(directory, { recursive: true, force: true }); });

  function seed() {
    const db = openDatabase(directory, { dataDir: directory });
    insertProject(db, { id: 'p', name: 'P', createdAt: 1, updatedAt: 1 });
    insertConversation(db, { id: 'c', projectId: 'p', title: 'C', createdAt: 1, updatedAt: 1 });
    upsertMessage(db, 'c', { id: 'm', role: 'assistant', content: 'prior', runStatus: 'canceled' });
    return db;
  }
  const binding = {
    conversationId: 'c', agentId: 'deepseek-harness', sessionId: 'validated',
    model: 'model', cwd: '/project', lastMessageId: 'm', compatibilityGeneration: 'generation-2',
  };

  it('migrates a legacy session once and admits the newly stamped generation', () => {
    const db = seed();
    upsertAgentSession(db, binding);
    db.exec('DROP TRIGGER agent_sessions_invalidate_compatibility');
    db.exec('ALTER TABLE agent_sessions DROP COLUMN compatibility_generation');
    closeDatabase();
    const migrated = openDatabase(directory, { dataDir: directory });
    expect(getAgentSessionRecord(migrated, 'c', binding.agentId)).toMatchObject({ compatibilityGeneration: null });
    upsertAgentSession(migrated, binding);
    expect(getAgentSessionRecord(migrated, 'c', binding.agentId)).toMatchObject(bindingRecord());
  });

  it('rolls back the handle and cursor if generation stamping fails', () => {
    const db = seed();
    upsertAgentSession(db, binding);
    db.exec("CREATE TRIGGER reject_generation BEFORE UPDATE OF compatibility_generation ON agent_sessions WHEN NEW.compatibility_generation = 'reject' BEGIN SELECT RAISE(ABORT, 'fixture'); END");
    expect(() => upsertAgentSession(db, { ...binding, sessionId: 'replacement', compatibilityGeneration: 'reject' })).toThrow('fixture');
    expect(getAgentSessionRecord(db, 'c', binding.agentId)).toMatchObject(bindingRecord());
  });

  it('stores the validated cancelled session generation with its cursor', () => {
    const db = seed();
    persistCapturedAgentSession(db, binding);
    expect(getAgentSessionRecord(db, 'c', binding.agentId)).toMatchObject(bindingRecord());
    expect(resolveAgentResumeContext(db, {
      conversationId: 'c', agentId: binding.agentId, currentModel: 'model', currentCwd: '/project',
    })).toMatchObject({ isResuming: true, storedCompatibilityGeneration: 'generation-2' });
  });

  it.each(['session_id', 'last_message_id', 'stable_prompt_hash'])('invalidates generation when a legacy writer updates %s', (column) => {
    const db = seed();
    upsertAgentSession(db, binding);
    db.prepare(`UPDATE agent_sessions SET ${column} = ? WHERE conversation_id = ?`).run('legacy-write', 'c');
    expect(getAgentSessionRecord(db, 'c', binding.agentId)).toMatchObject({ compatibilityGeneration: null });
  });

  it('invalidates even an identical legacy update and permits a new atomic writer to restamp', () => {
    const db = seed();
    upsertAgentSession(db, binding);
    db.prepare('UPDATE agent_sessions SET session_id = session_id').run();
    expect(getAgentSessionRecord(db, 'c', binding.agentId)).toMatchObject({ compatibilityGeneration: null });
    upsertAgentSession(db, binding);
    expect(getAgentSessionRecord(db, 'c', binding.agentId)).toMatchObject(bindingRecord());
  });

  function bindingRecord() {
    return { sessionId: 'validated', lastMessageId: 'm', compatibilityGeneration: 'generation-2' };
  }
});

describe('spawned DSH ready authority', () => {
  it('normalizes a structured missing or corrupt target to the shared reseed signal', () => {
    const child = new ChildProcess();
    const stdout = new PassThrough();
    child.stdin = new PassThrough();
    child.stdout = stdout;
    const events: unknown[] = [];
    attachDshProfileSession({ child, requestId: 'r', cwd: '/project', prompt: 'incremental',
      resumeSessionId: 'saved', send: (_event, payload) => events.push(payload) });
    stdout.write(`${JSON.stringify({ v: 1, type: 'ready', runtime: 'open-design', protocol_version: 1,
      plugin_version: 'fixture', capabilities: { session_resume: true, session_cancel: true, structured_events: true } })}\n`);
    stdout.write(`${JSON.stringify({ v: 1, type: 'result', request_id: 'r', session_id: 'saved',
      status: 'failed', resume_rejected: true, error: { code: 'DSH_SESSION_NOT_FOUND', message: 'private target detail' } })}\n`);
    expect(events).toContainEqual(expect.objectContaining({ error: expect.objectContaining({ code: 'DSH_PROFILE_RESUME_REJECTED' }) }));
    expect(JSON.stringify(events)).not.toContain('private target detail');
    child.stdin.destroy();
    stdout.destroy();
  });
  it.each(['secret value\nprivate', '', 'a'.repeat(129), 123])('rejects invalid generation without echoing it: %j', (generation) => {
    expect(() => parseDshProfileRuntimeFrame({
      v: 1, type: 'ready', runtime: 'open-design', protocol_version: 1, plugin_version: 'fixture',
      compatibility_generation: generation,
      capabilities: { session_resume: true, session_cancel: true, structured_events: true },
    })).toThrow('compatibility_generation must be a bounded opaque token');
  });
  it.each([
    ['generation-1', 'full-context', undefined],
    ['generation-2', 'incremental-context', 'saved'],
    [undefined, 'full-context', undefined],
  ])('selects both wire prompt and handle from ready %s', (activeGeneration, prompt, sessionId) => {
    const child = new ChildProcess();
    const stdout = new PassThrough();
    child.stdin = new PassThrough();
    child.stdout = stdout;
    const commands: string[] = [];
    child.stdin.on('data', (chunk: Buffer) => commands.push(chunk.toString()));
    attachDshProfileSession({
      child, requestId: 'r', cwd: '/project', prompt: 'pre-spawn-incorrect', resumeSessionId: 'saved',
      selectExecution: (ready) => {
        const policy = resolveAgentResumePromptPolicy(resumable, {
          storedGeneration: 'generation-2', activeGeneration: ready.compatibility_generation ?? null,
        });
        return { prompt: policy.skipTranscript ? 'incremental-context' : 'full-context', resumeSessionId: policy.resumeSessionId };
      },
      send: () => {},
    });
    expect(commands).toHaveLength(0);
    stdout.write(`${JSON.stringify({
      v: 1, type: 'ready', runtime: 'open-design', protocol_version: 1, plugin_version: 'fixture',
      compatibility_generation: activeGeneration,
      capabilities: { session_resume: true, session_cancel: true, structured_events: true },
    })}\n`);
    expect(commands).toHaveLength(1);
    expect(JSON.parse(commands[0] ?? '{}')).toMatchObject({ prompt });
    expect(JSON.parse(commands[0] ?? '{}').resume_session_id).toBe(sessionId);
    child.stdin.destroy();
    child.stdout.destroy();
  });
});

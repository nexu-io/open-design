// Regression coverage for #4594 (project isolation): a chat run must not
// operate with a conversation that belongs to a different project, because the
// resumable CLI agent session is keyed off the conversation — so a mismatched
// (projectId, conversationId) pair would resume another project's session /
// working memory into this run.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  getConversation,
  insertConversation,
  insertProject,
  openDatabase,
  upsertAgentSession,
} from '../src/db.js';
import { resolveAgentResumeContext } from '../src/agent-session-resume.js';
import { isCrossProjectConversation } from '../src/conversation-isolation.js';

describe('isCrossProjectConversation', () => {
  it('flags a definite cross-project mismatch', () => {
    expect(isCrossProjectConversation('proj-a', 'proj-b')).toBe(true);
  });

  it('allows a matching project', () => {
    expect(isCrossProjectConversation('proj-a', 'proj-a')).toBe(false);
  });

  it('does not flag when either id is absent or empty', () => {
    expect(isCrossProjectConversation(null, 'proj-b')).toBe(false);
    expect(isCrossProjectConversation('proj-a', null)).toBe(false);
    expect(isCrossProjectConversation(undefined, 'proj-b')).toBe(false);
    expect(isCrossProjectConversation('proj-a', undefined)).toBe(false);
    expect(isCrossProjectConversation('', 'proj-b')).toBe(false);
    expect(isCrossProjectConversation('proj-a', '')).toBe(false);
  });
});

describe('project isolation guard against cross-project session resume (#4594)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-conv-isolation-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects when a conversation belongs to a different project than the run', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, { id: 'proj-ios', name: 'iOS Application', createdAt: now, updatedAt: now });
    insertProject(db, { id: 'proj-godot', name: 'Godot Game Project', createdAt: now, updatedAt: now });
    insertConversation(db, {
      id: 'conv-godot',
      projectId: 'proj-godot',
      title: 'Godot work',
      createdAt: now,
      updatedAt: now,
    });

    // Simulate a CLI agent session created while working in the Godot project.
    upsertAgentSession(db, {
      conversationId: 'conv-godot',
      agentId: 'claude',
      sessionId: 'godot-session',
    });

    // The leak this guards against: the resume lookup is keyed only on the
    // conversation, so it would hand a run the Godot session regardless of which
    // project the run targets.
    const resume = resolveAgentResumeContext(db, {
      conversationId: 'conv-godot',
      agentId: 'claude',
    });
    expect(resume.resumeSessionId).toBe('godot-session');

    const conversation = getConversation(db, 'conv-godot');
    expect(conversation?.projectId).toBe('proj-godot');

    // A run targeting the iOS project with the Godot conversation is a
    // cross-project mismatch → blocked.
    expect(isCrossProjectConversation(conversation?.projectId, 'proj-ios')).toBe(true);
    // The same conversation under its own project proceeds normally.
    expect(isCrossProjectConversation(conversation?.projectId, 'proj-godot')).toBe(false);
  });
});

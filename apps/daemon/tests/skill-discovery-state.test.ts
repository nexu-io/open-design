import Database from 'better-sqlite3';
import { SKILL_DISCOVERY_MAX_SUPERSEDED_V1 } from '@open-design/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import {
  applySkillDiscoveryLoad,
  deactivateSkillDiscoveryAuxiliary,
  ensureSkillDiscoveryForRun,
  isSkillDiscoveryWrapperBlocked,
  migrateSkillDiscoveryState,
  planSkillDiscoveryLoad,
  readSkillDiscoveryState,
  recordSkillDiscoverySearch,
  renderSkillDiscoveryLifecycleCapsule,
  resolveSkillDiscovery,
} from '../src/skill-discovery/state.js';

const databases: Database.Database[] = [];
const digest = (seed: string): string =>
  `sha256:${seed.codePointAt(0)?.toString(16).padStart(2, '0').repeat(32)}`;

function database(): Database.Database {
  const db = new Database(':memory:');
  databases.push(db);
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY);
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    INSERT INTO projects (id) VALUES ('project-1');
    INSERT INTO conversations (id, project_id) VALUES ('conversation-1', 'project-1');
  `);
  migrateSkillDiscoveryState(db);
  return db;
}

function legacyEventDatabase(): Database.Database {
  const db = new Database(':memory:');
  databases.push(db);
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY);
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    INSERT INTO projects (id) VALUES ('project-1');
    INSERT INTO conversations (id, project_id) VALUES ('conversation-1', 'project-1');
    CREATE TABLE skill_discovery_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('search', 'load', 'reuse', 'replace', 'resolve_none', 'clarify')),
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    INSERT INTO skill_discovery_events (
      conversation_id, run_id, kind, payload_json, created_at
    ) VALUES ('conversation-1', 'run-0', 'search', '{"legacy":true}', 1);
  `);
  return db;
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

describe('conversation-scoped Agent Skill discovery state', () => {
  it('upgrades the event-kind constraint without losing existing evidence', () => {
    const db = legacyEventDatabase();
    migrateSkillDiscoveryState(db);

    expect(String(db.prepare(`
      SELECT sql FROM sqlite_master
       WHERE type = 'table' AND name = 'skill_discovery_events'
    `).pluck().get())).toContain("'deactivate'");
    expect(db.prepare(`
      SELECT kind, payload_json AS payloadJson FROM skill_discovery_events
    `).get()).toEqual({ kind: 'search', payloadJson: '{"legacy":true}' });
  });

  it('injects the full bootstrap once, then yields a compact durable capsule', () => {
    const db = database();
    const first = ensureSkillDiscoveryForRun(db, {
      projectId: 'project-1',
      conversationId: 'conversation-1',
      runId: 'run-1',
      catalogRevision: 'catalog-v1',
    });

    expect(first.bootstrapRunId).toBe('run-1');
    expect(first.status).toBe('pending');
    expect(isSkillDiscoveryWrapperBlocked(first)).toBe(true);

    const resumed = ensureSkillDiscoveryForRun(db, {
      projectId: 'project-1',
      conversationId: 'conversation-1',
      runId: 'run-2',
      catalogRevision: 'catalog-v1',
    });
    expect(resumed.bootstrapRunId).toBe('run-1');
    expect(renderSkillDiscoveryLifecycleCapsule(resumed)).toContain('catalog-v1');
    expect(renderSkillDiscoveryLifecycleCapsule(resumed)).not.toContain('Search every official Skill');
  });

  it('persists search evidence without storing the raw query', () => {
    const db = database();
    ensureSkillDiscoveryForRun(db, {
      projectId: 'project-1',
      conversationId: 'conversation-1',
      runId: 'run-1',
      catalogRevision: 'catalog-v1',
    });
    recordSkillDiscoverySearch(db, {
      conversationId: 'conversation-1',
      runId: 'run-1',
      queryDigest: digest('q'),
      filters: {
        role: 'primary',
        outputKind: 'prototype',
        limit: 3,
      },
      candidates: [
        { id: 'prototype', score: 19 },
        { id: 'ppt', score: -4 },
      ],
      catalogRevision: 'catalog-v1',
    });

    const payloadJson = String(db.prepare(
      `SELECT payload_json FROM skill_discovery_events WHERE kind = 'search'`,
    ).pluck().get());
    expect(JSON.parse(payloadJson)).toEqual({
      queryDigest: digest('q'),
      filters: {
        role: 'primary',
        outputKind: 'prototype',
        limit: 3,
      },
      candidates: [
        { id: 'prototype', score: 19 },
        { id: 'ppt', score: -4 },
      ],
      catalogRevision: 'catalog-v1',
    });
    expect(payloadJson).not.toContain('帮我做一个官网');
  });

  it('invalidates active Skills and reopens pending when the catalog revision changes', () => {
    const db = database();
    ensureSkillDiscoveryForRun(db, {
      projectId: 'project-1',
      conversationId: 'conversation-1',
      runId: 'run-1',
      catalogRevision: 'catalog-v1',
      now: 10,
    });
    applySkillDiscoveryLoad(db, {
      conversationId: 'conversation-1',
      runId: 'run-1',
      loaded: {
        id: 'prototype',
        kind: 'task-profile',
        role: 'primary',
        version: '2.2.0',
        candidateDigest: digest('p'),
        contentDigest: digest('c'),
        catalogRevision: 'catalog-v1',
        purposeDigest: digest('u'),
      },
      conflictsWith: [],
      now: 20,
    });
    applySkillDiscoveryLoad(db, {
      conversationId: 'conversation-1',
      runId: 'run-1',
      loaded: {
        id: 'imagegen',
        kind: 'functional',
        role: 'auxiliary',
        version: '1',
        candidateDigest: digest('i'),
        contentDigest: digest('m'),
        catalogRevision: 'catalog-v1',
        purposeDigest: digest('g'),
      },
      conflictsWith: [],
      now: 30,
    });

    const invalidated = ensureSkillDiscoveryForRun(db, {
      projectId: 'project-1',
      conversationId: 'conversation-1',
      runId: 'run-2',
      catalogRevision: 'catalog-v2',
      now: 40,
    });

    expect(invalidated).toMatchObject({
      catalogRevision: 'catalog-v2',
      status: 'pending',
      bootstrapRunId: 'run-2',
      activeRunId: 'run-2',
      activePrimary: null,
      activeAuxiliaries: [],
      superseded: [{ id: 'prototype' }, { id: 'imagegen' }],
      lastResolution: null,
      revision: 4,
      updatedAt: 40,
    });
    expect(isSkillDiscoveryWrapperBlocked(invalidated)).toBe(true);
  });

  it('invalidates old active Skills before applying a load from a new catalog revision', () => {
    const db = database();
    ensureSkillDiscoveryForRun(db, {
      projectId: 'project-1',
      conversationId: 'conversation-1',
      runId: 'run-1',
      catalogRevision: 'catalog-v1',
      now: 10,
    });
    applySkillDiscoveryLoad(db, {
      conversationId: 'conversation-1',
      runId: 'run-1',
      loaded: {
        id: 'prototype',
        kind: 'task-profile',
        role: 'primary',
        version: '2.2.0',
        candidateDigest: digest('p'),
        contentDigest: digest('c'),
        catalogRevision: 'catalog-v1',
        purposeDigest: digest('u'),
      },
      conflictsWith: [],
      now: 20,
    });
    applySkillDiscoveryLoad(db, {
      conversationId: 'conversation-1',
      runId: 'run-1',
      loaded: {
        id: 'imagegen',
        kind: 'functional',
        role: 'auxiliary',
        version: '1',
        candidateDigest: digest('i'),
        contentDigest: digest('m'),
        catalogRevision: 'catalog-v1',
        purposeDigest: digest('g'),
      },
      conflictsWith: [],
      now: 30,
    });

    const changed = applySkillDiscoveryLoad(db, {
      conversationId: 'conversation-1',
      runId: 'run-1',
      loaded: {
        id: 'copywriting',
        kind: 'functional',
        role: 'auxiliary',
        version: '1',
        candidateDigest: digest('w'),
        contentDigest: digest('t'),
        catalogRevision: 'catalog-v2',
        purposeDigest: digest('r'),
      },
      conflictsWith: [],
      now: 40,
    });

    expect(changed).toMatchObject({
      catalogRevision: 'catalog-v2',
      status: 'pending',
      activePrimary: null,
      activeAuxiliaries: [{ id: 'copywriting', catalogRevision: 'catalog-v2' }],
      superseded: [
        { id: 'prototype', catalogRevision: 'catalog-v1' },
        { id: 'imagegen', catalogRevision: 'catalog-v1' },
      ],
      lastResolution: null,
      updatedAt: 40,
    });
    expect(isSkillDiscoveryWrapperBlocked(changed)).toBe(true);
  });

  it('rejects a preflight plan when the ledger changes before commit', () => {
    const db = database();
    const initial = ensureSkillDiscoveryForRun(db, {
      projectId: 'project-1',
      conversationId: 'conversation-1',
      runId: 'run-1',
      catalogRevision: 'catalog-v1',
    });
    const input = {
      conversationId: 'conversation-1',
      runId: 'run-1',
      loaded: {
        id: 'prototype',
        kind: 'task-profile' as const,
        role: 'primary' as const,
        version: '2.2.0',
        candidateDigest: digest('p'),
        contentDigest: digest('c'),
        catalogRevision: 'catalog-v1',
        purposeDigest: digest('u'),
      },
      conflictsWith: [],
      now: 20,
    };
    const plan = planSkillDiscoveryLoad(initial, input);
    resolveSkillDiscovery(db, {
      conversationId: 'conversation-1',
      runId: 'run-1',
      resolution: 'none',
      reasonDigest: digest('n'),
      now: 15,
    });

    expect(() => applySkillDiscoveryLoad(db, {
      ...input,
      expectedStateRevision: plan.expectedStateRevision,
    })).toThrow(/changed after load preflight/);
    expect(readSkillDiscoveryState(db, 'conversation-1')).toMatchObject({
      status: 'resolved_none',
      activePrimary: null,
    });
  });

  it('enforces one primary, two auxiliaries, explicit replacement, and conflicts', () => {
    const db = database();
    ensureSkillDiscoveryForRun(db, {
      projectId: 'project-1',
      conversationId: 'conversation-1',
      runId: 'run-1',
      catalogRevision: 'catalog-v1',
    });
    applySkillDiscoveryLoad(db, {
      conversationId: 'conversation-1',
      runId: 'run-1',
      loaded: {
        id: 'prototype',
        kind: 'task-profile',
        role: 'primary',
        version: '2.2.0',
        candidateDigest: digest('p'),
        contentDigest: digest('c'),
        catalogRevision: 'catalog-v1',
        purposeDigest: digest('u'),
      },
      conflictsWith: ['ppt'],
    });
    expect(readSkillDiscoveryState(db, 'conversation-1')?.status).toBe('resolved_skill');

    expect(() => applySkillDiscoveryLoad(db, {
      conversationId: 'conversation-1',
      runId: 'run-1',
      loaded: {
        id: 'ppt',
        kind: 'task-profile',
        role: 'primary',
        version: '2.0.0',
        candidateDigest: digest('d'),
        contentDigest: digest('e'),
        catalogRevision: 'catalog-v1',
        purposeDigest: digest('s'),
      },
      conflictsWith: ['prototype'],
    })).toThrow(/replaceId/);

    ensureSkillDiscoveryForRun(db, {
      projectId: 'project-1',
      conversationId: 'conversation-1',
      runId: 'run-2',
      catalogRevision: 'catalog-v1',
    });
    applySkillDiscoveryLoad(db, {
      conversationId: 'conversation-1',
      runId: 'run-2',
      replaceId: 'prototype',
      loaded: {
        id: 'ppt',
        kind: 'task-profile',
        role: 'primary',
        version: '2.0.0',
        candidateDigest: digest('d'),
        contentDigest: digest('e'),
        catalogRevision: 'catalog-v1',
        purposeDigest: digest('s'),
      },
      conflictsWith: ['prototype'],
    });
    expect(readSkillDiscoveryState(db, 'conversation-1')).toMatchObject({
      activePrimary: { id: 'ppt' },
      superseded: [{ id: 'prototype' }],
    });

    for (const id of ['imagegen', 'copywriting']) {
      applySkillDiscoveryLoad(db, {
        conversationId: 'conversation-1',
        runId: 'run-2',
        loaded: {
          id,
          kind: 'functional',
          role: 'auxiliary',
          version: '1',
          candidateDigest: digest(id[0]!),
          contentDigest: digest(id.at(-1)!),
          catalogRevision: 'catalog-v1',
          purposeDigest: digest(id[1]!),
        },
        conflictsWith: [],
      });
    }
    expect(() => applySkillDiscoveryLoad(db, {
      conversationId: 'conversation-1',
      runId: 'run-2',
      loaded: {
        id: 'third-aux',
        kind: 'functional',
        role: 'auxiliary',
        version: '1',
        candidateDigest: digest('t'),
        contentDigest: digest('h'),
        catalogRevision: 'catalog-v1',
        purposeDigest: digest('i'),
      },
      conflictsWith: [],
    })).toThrow(/at most 2 active auxiliary/);
  });

  it('bounds the durable superseded index while retaining full event history', () => {
    const db = database();
    ensureSkillDiscoveryForRun(db, {
      projectId: 'project-1',
      conversationId: 'conversation-1',
      runId: 'run-1',
      catalogRevision: 'catalog-v1',
    });

    let previousId: string | undefined;
    const replacementCount = SKILL_DISCOVERY_MAX_SUPERSEDED_V1 + 4;
    for (let index = 0; index <= replacementCount; index += 1) {
      const id = `profile-${index}`;
      applySkillDiscoveryLoad(db, {
        conversationId: 'conversation-1',
        runId: 'run-1',
        ...(previousId ? { replaceId: previousId } : {}),
        loaded: {
          id,
          kind: 'task-profile',
          role: 'primary',
          version: '1',
          candidateDigest: digest('p'),
          contentDigest: digest('c'),
          catalogRevision: 'catalog-v1',
          purposeDigest: digest('u'),
        },
        conflictsWith: [],
      });
      previousId = id;
    }

    const current = readSkillDiscoveryState(db, 'conversation-1');
    expect(current?.superseded).toHaveLength(SKILL_DISCOVERY_MAX_SUPERSEDED_V1);
    expect(current?.superseded[0]?.id).toBe('profile-4');
    expect(current?.superseded.at(-1)?.id).toBe(`profile-${replacementCount - 1}`);
    expect(db.prepare(`
      SELECT COUNT(*) FROM skill_discovery_events
       WHERE kind IN ('load', 'replace')
    `).pluck().get()).toBe(replacementCount + 1);
  });

  it('treats none as a safe resolution and reopens clarification on the next run', () => {
    const db = database();
    ensureSkillDiscoveryForRun(db, {
      projectId: 'project-1',
      conversationId: 'conversation-1',
      runId: 'run-1',
      catalogRevision: 'catalog-v1',
    });
    const none = resolveSkillDiscovery(db, {
      conversationId: 'conversation-1',
      runId: 'run-1',
      resolution: 'none',
      reasonDigest: digest('n'),
    });
    expect(none.status).toBe('resolved_none');
    expect(isSkillDiscoveryWrapperBlocked(none)).toBe(false);

    ensureSkillDiscoveryForRun(db, {
      projectId: 'project-1',
      conversationId: 'conversation-1',
      runId: 'run-2',
      catalogRevision: 'catalog-v1',
    });
    const clarify = resolveSkillDiscovery(db, {
      conversationId: 'conversation-1',
      runId: 'run-2',
      resolution: 'clarify',
      reasonDigest: digest('l'),
    });
    expect(clarify.status).toBe('clarification');
    expect(isSkillDiscoveryWrapperBlocked(clarify)).toBe(true);

    expect(() => applySkillDiscoveryLoad(db, {
      conversationId: 'conversation-1',
      runId: 'run-2',
      loaded: {
        id: 'prototype',
        kind: 'task-profile',
        role: 'primary',
        version: '1',
        candidateDigest: digest('p'),
        contentDigest: digest('r'),
        catalogRevision: 'catalog-v1',
        purposeDigest: digest('o'),
      },
      conflictsWith: [],
    })).toThrow(/must wait for a later run/);
    expect(() => resolveSkillDiscovery(db, {
      conversationId: 'conversation-1',
      runId: 'run-2',
      resolution: 'none',
      reasonDigest: digest('n'),
    })).toThrow(/must wait for a later run/);
    expect(() => deactivateSkillDiscoveryAuxiliary(db, {
      conversationId: 'conversation-1',
      runId: 'run-2',
      id: 'imagegen',
      reasonDigest: digest('d'),
    })).toThrow(/must wait for a later run/);

    const answerTurn = ensureSkillDiscoveryForRun(db, {
      projectId: 'project-1',
      conversationId: 'conversation-1',
      runId: 'run-3',
      catalogRevision: 'catalog-v1',
    });
    expect(answerTurn.status).toBe('pending');
    const answered = resolveSkillDiscovery(db, {
      conversationId: 'conversation-1',
      runId: 'run-3',
      resolution: 'none',
      reasonDigest: digest('a'),
    });
    expect(answered.status).toBe('resolved_none');
  });

  it('retains auxiliary-only work through none-primary resolution and rejects replacing an auxiliary', () => {
    const db = database();
    ensureSkillDiscoveryForRun(db, {
      projectId: 'project-1',
      conversationId: 'conversation-1',
      runId: 'run-1',
      catalogRevision: 'catalog-v1',
    });
    applySkillDiscoveryLoad(db, {
      conversationId: 'conversation-1',
      runId: 'run-1',
      loaded: {
        id: 'imagegen',
        kind: 'functional',
        role: 'auxiliary',
        version: '1',
        candidateDigest: digest('i'),
        contentDigest: digest('m'),
        catalogRevision: 'catalog-v1',
        purposeDigest: digest('g'),
      },
      conflictsWith: [],
    });
    expect(readSkillDiscoveryState(db, 'conversation-1')).toMatchObject({
      status: 'pending',
      activeAuxiliaries: [{ id: 'imagegen' }],
    });

    expect(() => applySkillDiscoveryLoad(db, {
      conversationId: 'conversation-1',
      runId: 'run-1',
      replaceId: 'imagegen',
      loaded: {
        id: 'prototype',
        kind: 'task-profile',
        role: 'primary',
        version: '2.2.0',
        candidateDigest: digest('p'),
        contentDigest: digest('r'),
        catalogRevision: 'catalog-v1',
        purposeDigest: digest('o'),
      },
      conflictsWith: ['imagegen'],
    })).toThrow(/conflicts with active Skill imagegen/);

    const nonePrimary = resolveSkillDiscovery(db, {
      conversationId: 'conversation-1',
      runId: 'run-1',
      resolution: 'none',
      reasonDigest: digest('n'),
    });
    expect(nonePrimary).toMatchObject({
      status: 'resolved_none',
      activePrimary: null,
      activeAuxiliaries: [{ id: 'imagegen' }],
    });
    expect(isSkillDiscoveryWrapperBlocked(nonePrimary)).toBe(false);
  });

  it('deactivates one auxiliary into superseded without changing the primary resolution', () => {
    const db = database();
    ensureSkillDiscoveryForRun(db, {
      projectId: 'project-1',
      conversationId: 'conversation-1',
      runId: 'run-1',
      catalogRevision: 'catalog-v1',
    });
    for (const id of ['imagegen', 'copywriting']) {
      applySkillDiscoveryLoad(db, {
        conversationId: 'conversation-1',
        runId: 'run-1',
        loaded: {
          id,
          kind: 'functional',
          role: 'auxiliary',
          version: '1',
          candidateDigest: digest(id[0]!),
          contentDigest: digest(id.at(-1)!),
          catalogRevision: 'catalog-v1',
          purposeDigest: digest(id[1]!),
        },
        conflictsWith: [],
      });
    }
    const resolved = resolveSkillDiscovery(db, {
      conversationId: 'conversation-1',
      runId: 'run-1',
      resolution: 'none',
      reasonDigest: digest('n'),
      now: 50,
    });

    const deactivated = deactivateSkillDiscoveryAuxiliary(db, {
      conversationId: 'conversation-1',
      runId: 'run-1',
      id: 'imagegen',
      reasonDigest: digest('d'),
      now: 60,
    });

    expect(deactivated).toMatchObject({
      status: 'resolved_none',
      activeAuxiliaries: [{ id: 'copywriting' }],
      superseded: [{ id: 'imagegen' }],
      lastResolution: resolved.lastResolution,
      updatedAt: 60,
    });
    expect(JSON.parse(String(db.prepare(
      `SELECT payload_json FROM skill_discovery_events WHERE kind = 'deactivate'`,
    ).pluck().get()))).toMatchObject({
      id: 'imagegen',
      role: 'auxiliary',
      reasonDigest: digest('d'),
    });
    expect(() => deactivateSkillDiscoveryAuxiliary(db, {
      conversationId: 'conversation-1',
      runId: 'run-1',
      id: 'imagegen',
      reasonDigest: digest('x'),
    })).toThrow(/is not active/);
  });
});

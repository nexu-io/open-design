import { createHash } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';

import type { InstalledPluginRecord } from '@open-design/contracts';
import Database from 'better-sqlite3';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolvePluginFolder } from '../../src/plugins/registry.js';
import { registerSkillDiscoveryToolRoutes } from '../../src/routes/skill-discovery-tool.js';
import { migrateStrategyTaskStore } from '../../src/strategies/task-store.js';
import {
  ensureSkillDiscoveryForRun,
  migrateSkillDiscoveryState,
  readSkillDiscoveryState,
} from '../../src/skill-discovery/state.js';

const STRATEGY_SOURCE = path.resolve(
  import.meta.dirname,
  '../../../../plugins/_official/scenarios/od-next-strategy',
);
const BUILT_IN_SKILLS_ROOT = path.resolve(import.meta.dirname, '../../../../skills');

type JsonBody = Record<string, any>;

let db: Database.Database;
let server: http.Server | undefined;
let baseUrl: string;
let operations: string[];
let toolRunId: string;
let nowMs: number;

beforeEach(async () => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY);
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE
    );
    INSERT INTO projects (id) VALUES ('project-1');
    INSERT INTO conversations (id, project_id) VALUES ('conversation-1', 'project-1');
  `);
  migrateSkillDiscoveryState(db);
  migrateStrategyTaskStore(db);

  const bundledStrategyPlugin = await resolveStrategyRecord();
  ensureSkillDiscoveryForRun(db, {
    projectId: 'project-1',
    conversationId: 'conversation-1',
    runId: 'run-1',
    catalogRevision: `sha256:${'0'.repeat(64)}`,
  });

  operations = [];
  toolRunId = 'run-1';
  nowMs = 1_800_000_000_000;
  const app = express();
  app.use(express.json());
  registerSkillDiscoveryToolRoutes(app, {
    auth: {
      authorizeToolRequest: (_req, _res, operation) => {
        operations.push(operation);
        return {
          token: 'tool-token',
          runId: toolRunId,
          projectId: 'project-1',
          allowedEndpoints: [],
          allowedOperations: [],
          issuedAt: new Date(0).toISOString(),
          expiresAt: new Date(60_000).toISOString(),
        };
      },
    },
    http: {
      requireLocalDaemonRequest: (_req, _res, next) => next(),
      sendApiError: (res, status, code, message, extras = {}) => {
        res.status(status).json({ error: { code, message, ...extras } });
      },
    },
    discoveryEnabled: () => true,
    db,
    resolveCatalogSources: () => ({
      bundledStrategyPlugin,
      builtInFunctionalSkillsRoot: BUILT_IN_SKILLS_ROOT,
      builtInDesignTemplatesRoot: path.resolve(import.meta.dirname, '../../../../design-templates'),
    }),
    resolveRunScope: (grant) => ({
      runId: grant.runId,
      projectId: grant.projectId,
      conversationId: 'conversation-1',
    }),
    now: () => nowMs,
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('unexpected server address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve();
    server.close((error?: Error) => error ? reject(error) : resolve());
  });
  server = undefined;
  db.close();
});

async function resolveStrategyRecord(): Promise<InstalledPluginRecord> {
  const resolved = await resolvePluginFolder({
    folder: STRATEGY_SOURCE,
    folderId: 'od-next-strategy',
    sourceKind: 'bundled',
    source: STRATEGY_SOURCE,
    trust: 'bundled',
  });
  if (!resolved.ok) throw new Error(resolved.errors.join('; '));
  return resolved.record;
}

async function request(
  pathname: string,
  init: { method?: string; body?: Record<string, unknown> } = {},
): Promise<{ status: number; body: JsonBody }> {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      Authorization: 'Bearer tool-token',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
  return { status: response.status, body: await response.json() as JsonBody };
}

function materializationReceipt(prepared: JsonBody): Record<string, unknown> {
  const resources = (prepared.resources as Array<{
    relativePath: string;
    digest: string;
    size: number;
  }>)
    .map(({ relativePath, digest, size }) => ({ relativePath, digest, size }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'en'));
  return {
    materializedRoot: resources.length > 0 ? `.od-skills/${prepared.alias}` : null,
    resources,
  };
}

async function commitPrepared(prepared: JsonBody, receipt = materializationReceipt(prepared)) {
  return request('/api/tools/skills/load/commit', {
    body: {
      pendingToken: prepared.pendingToken,
      expectedStateRevision: prepared.expectedStateRevision,
      materialization: receipt,
    },
  });
}

async function prepareAndCommit(body: Record<string, unknown>) {
  const prepared = await request('/api/tools/skills/load', { body });
  if (prepared.status !== 200) return prepared;
  return commitPrepared(prepared.body);
}

async function preparePrototype() {
  const searched = await request('/api/tools/skills/search', {
    body: { query: '帮我做一个官网', role: 'primary', limit: 5 },
  });
  const candidate = searched.body.search.candidates.find(
    (item: { id: string }) => item.id === 'prototype',
  );
  expect(candidate).toBeDefined();
  return request('/api/tools/skills/load', {
    body: {
      id: candidate.id,
      revision: searched.body.search.revision,
      candidateDigest: candidate.candidateDigest,
      role: 'primary',
      purpose: 'Create the requested product website.',
    },
  });
}

it('exports a local observer snapshot without selecting or reading a task Skill', async () => {
  const before = readSkillDiscoveryState(db, 'conversation-1');
  const result = await request('/api/diagnostics/skill-discovery-catalog');
  expect(result.status).toBe(200);
  expect(result.body.schema).toBe('open-design.skill-discovery-diagnostics/v1');
  expect(result.body.enabled).toBe(true);
  expect(result.body.transportSchema).toBe('open-design.od-next-prompt-bundle/v2');
  expect(result.body.promptStrategy).toBe('od-next-plan-build-v2');
  expect(result.body.catalog.candidates).toHaveLength(64);
  expect(Object.keys(result.body.orchestrationDigests)).toHaveLength(64);
  expect(result.body.orchestrationDigests.prototype).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(result.body.catalogMarkdown).toContain(result.body.catalog.revision);
  expect(result.body.policyMarkdown).toContain('Agent-native Skill Discovery');
  expect(JSON.stringify(result.body)).not.toContain(STRATEGY_SOURCE);
  expect(JSON.stringify(result.body)).not.toContain('profileMarkdown');
  expect(operations).toEqual([]);
  expect(readSkillDiscoveryState(db, 'conversation-1')).toEqual(before);
});

describe('agent-native Skill discovery tool routes', () => {
  it('prepares verified bytes without ledger mutation, then commits a matching receipt', async () => {
    const searched = await request('/api/tools/skills/search', {
      body: { query: '帮我做一个官网', role: 'primary', limit: 5 },
    });

    expect(searched.status).toBe(200);
    expect(searched.body.search.candidates[0].id).toBe('prototype');
    expect(JSON.stringify(searched.body)).not.toContain('profileMarkdown');
    const candidate = searched.body.search.candidates[0];
    const searchEvent = db.prepare(`
      SELECT payload_json AS payloadJson
        FROM skill_discovery_events
       WHERE conversation_id = ? AND kind = 'search'
    `).get('conversation-1') as { payloadJson: string };
    expect(searchEvent.payloadJson).not.toContain('帮我做一个官网');
    expect(JSON.parse(searchEvent.payloadJson).queryDigest).toBe(
      `sha256:${createHash('sha256').update('帮我做一个官网').digest('hex')}`,
    );

    const prepared = await request('/api/tools/skills/load', {
      body: {
        id: candidate.id,
        revision: searched.body.search.revision,
        candidateDigest: candidate.candidateDigest,
        role: 'primary',
        purpose: 'Create the requested product website.',
      },
    });

    expect(prepared.status).toBe(200);
    expect(prepared.body.loaded.profileMarkdown).toContain('OD Next Prototype Task Profile v2');
    expect(prepared.body.loaded.materialization).toBeUndefined();
    expect(prepared.body.pendingToken).toMatch(/^odsp_[A-Za-z0-9_-]{43}$/u);
    expect(prepared.body.expectedStateRevision).toBe(1);
    expect(prepared.body.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        relativePath: 'device-frames/iphone.html',
        bytesBase64: expect.any(String),
      }),
    ]));
    expect(readSkillDiscoveryState(db, 'conversation-1')?.status).toBe('pending');
    expect(db.prepare(`
      SELECT COUNT(*) AS count
        FROM skill_discovery_events
       WHERE conversation_id = ? AND kind IN ('load', 'reuse', 'replace')
    `).get('conversation-1')).toEqual({ count: 0 });

    const loaded = await commitPrepared(prepared.body);
    expect(loaded.status).toBe(200);
    expect(loaded.body.loaded.profileMarkdown).toContain('OD Next Prototype Task Profile v2');
    expect(loaded.body.loaded.strategyBinding).toBeUndefined();
    expect(loaded.body.loaded.materialization.materializedRoot)
      .toMatch(/^\.od-skills\/discovered-prototype-[a-f0-9]{12}$/u);
    expect(loaded.body.state).toMatchObject({
      status: 'resolved_skill',
      activePrimary: { id: 'prototype', role: 'primary' },
    });
    expect(JSON.stringify(loaded.body)).not.toContain('bytesBase64');
    expect(operations).toEqual(['skills:search', 'skills:load', 'skills:load']);
  });

  it('fails closed on a stale candidate digest and keeps the ledger pending', async () => {
    const searched = await request('/api/tools/skills/search', {
      body: { query: 'make a website', role: 'primary' },
    });
    const candidate = searched.body.search.candidates.find(
      (item: { id: string }) => item.id === 'prototype',
    );
    expect(candidate).toBeDefined();

    const loaded = await request('/api/tools/skills/load', {
      body: {
        id: candidate.id,
        revision: searched.body.search.revision,
        candidateDigest: `sha256:${'f'.repeat(64)}`,
        role: 'primary',
        purpose: 'Create the site.',
      },
    });

    expect(loaded.status).toBe(409);
    expect(loaded.body.error).toMatchObject({
      code: 'SKILL_DISCOVERY_CATALOG_CHANGED',
      retryable: true,
    });
    expect(readSkillDiscoveryState(db, 'conversation-1')?.status).toBe('pending');
  });

  it('consumes a pending token once before concurrent commit validation', async () => {
    const prepared = await preparePrototype();
    expect(prepared.status).toBe(200);
    const commitBody = {
      pendingToken: prepared.body.pendingToken,
      expectedStateRevision: prepared.body.expectedStateRevision,
      materialization: materializationReceipt(prepared.body),
    };

    const results = await Promise.all([
      request('/api/tools/skills/load/commit', { body: commitBody }),
      request('/api/tools/skills/load/commit', { body: commitBody }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(db.prepare(`
      SELECT COUNT(*) AS count
        FROM skill_discovery_events
       WHERE conversation_id = ? AND kind = 'load'
    `).get('conversation-1')).toEqual({ count: 1 });
  });

  it('binds a pending token to its original run scope', async () => {
    const prepared = await preparePrototype();
    expect(prepared.status).toBe(200);
    ensureSkillDiscoveryForRun(db, {
      projectId: 'project-1',
      conversationId: 'conversation-1',
      runId: 'run-2',
      catalogRevision: readSkillDiscoveryState(db, 'conversation-1')!.catalogRevision,
      now: nowMs + 1,
    });
    toolRunId = 'run-2';

    const committed = await commitPrepared(prepared.body);

    expect(committed).toMatchObject({
      status: 409,
      body: { error: { code: 'SKILL_DISCOVERY_STATE_CONFLICT', retryable: true } },
    });
    expect(readSkillDiscoveryState(db, 'conversation-1')?.activePrimary).toBeNull();
  });

  it('fails closed when state changes between prepare and commit', async () => {
    const prepared = await preparePrototype();
    expect(prepared.status).toBe(200);
    const resolved = await request('/api/tools/skills/resolve', {
      body: { resolution: 'none', reason: 'No official Skill is needed anymore.' },
    });
    expect(resolved.status).toBe(200);

    const committed = await commitPrepared(prepared.body);

    expect(committed).toMatchObject({
      status: 409,
      body: { error: { code: 'SKILL_DISCOVERY_STATE_CONFLICT', retryable: true } },
    });
    expect(readSkillDiscoveryState(db, 'conversation-1')?.activePrimary).toBeNull();
  });

  it('consumes a token on receipt mismatch and never applies the ledger', async () => {
    const prepared = await preparePrototype();
    expect(prepared.status).toBe(200);
    const forgedReceipt = {
      ...materializationReceipt(prepared.body),
      materializedRoot: '.od-skills/discovered-forged-aaaaaaaaaaaa',
    };

    const forged = await commitPrepared(prepared.body, forgedReceipt);
    const retry = await commitPrepared(prepared.body);

    expect(forged.status).toBe(409);
    expect(retry.status).toBe(409);
    expect(readSkillDiscoveryState(db, 'conversation-1')?.status).toBe('pending');
  });

  it('rejects an expired pending token without applying the ledger', async () => {
    const prepared = await preparePrototype();
    expect(prepared.status).toBe(200);
    nowMs = prepared.body.expiresAt;

    const committed = await commitPrepared(prepared.body);

    expect(committed.status).toBe(409);
    expect(readSkillDiscoveryState(db, 'conversation-1')?.status).toBe('pending');
  });

  it('rejects a second primary before resource materialization publishes an alias', async () => {
    const pptSearch = await request('/api/tools/skills/search', {
      body: { query: '帮我做一份融资路演 PPT', role: 'primary', limit: 5 },
    });
    expect(pptSearch).toMatchObject({ status: 200 });
    const ppt = pptSearch.body.search.candidates.find(
      (candidate: { id: string }) => candidate.id === 'ppt',
    );
    expect(ppt).toBeDefined();
    const firstLoad = await prepareAndCommit({
        id: ppt.id,
        revision: pptSearch.body.search.revision,
        candidateDigest: ppt.candidateDigest,
        role: 'primary',
        purpose: 'Create the presentation.',
    });
    expect(firstLoad.status).toBe(200);

    const prototypeSearch = await request('/api/tools/skills/search', {
      body: { query: '帮我做一个官网', role: 'primary', limit: 5 },
    });
    const prototype = prototypeSearch.body.search.candidates.find(
      (candidate: { id: string }) => candidate.id === 'prototype',
    );
    expect(prototype).toBeDefined();
    const rejected = await request('/api/tools/skills/load', {
      body: {
        id: prototype.id,
        revision: prototypeSearch.body.search.revision,
        candidateDigest: prototype.candidateDigest,
        role: 'primary',
        purpose: 'Create the requested product website.',
      },
    });

    expect(rejected.status).toBe(409);
    expect(rejected.body.error.code).toBe('SKILL_DISCOVERY_STATE_CONFLICT');
  });

  it('records explicit none and clarification resolutions and exposes rehydration', async () => {
    const none = await request('/api/tools/skills/resolve', {
      body: { resolution: 'none', reason: 'No official Skill clearly applies.' },
    });
    expect(none.status).toBe(200);
    expect(none.body.state.status).toBe('resolved_none');

    const clarify = await request('/api/tools/skills/resolve', {
      body: { resolution: 'clarify', reason: 'Output kind changes the primary Skill.' },
    });
    expect(clarify.status).toBe(200);
    expect(clarify.body.state.status).toBe('clarification');
    const eventPayloads = db.prepare(`
      SELECT payload_json AS payloadJson
        FROM skill_discovery_events
       WHERE conversation_id = ? AND kind IN ('resolve_none', 'clarify')
       ORDER BY id
    `).all('conversation-1') as Array<{ payloadJson: string }>;
    expect(eventPayloads).toHaveLength(2);
    expect(eventPayloads.map((event) => event.payloadJson).join('\n'))
      .not.toContain('Output kind');

    const rehydrated = await request('/api/tools/skills/rehydrate', {
      body: {},
    });
    expect(rehydrated.status).toBe(200);
    expect(rehydrated.body.lifecycleCapsule).toContain('Decision state: `clarification`');
    expect(operations).toEqual(['skills:resolve', 'skills:resolve', 'skills:status']);
  });

  it('keeps clarification blocked until a later run reopens discovery', async () => {
    const searched = await request('/api/tools/skills/search', {
      body: { query: '帮我做一个官网', role: 'primary', limit: 5 },
    });
    const candidate = searched.body.search.candidates.find(
      (item: { id: string }) => item.id === 'prototype',
    );
    expect(candidate).toBeDefined();

    const clarified = await request('/api/tools/skills/resolve', {
      body: { resolution: 'clarify', reason: 'The output choice changes the workflow.' },
    });
    expect(clarified).toMatchObject({ status: 200, body: { state: { status: 'clarification' } } });

    const sameRunNone = await request('/api/tools/skills/resolve', {
      body: { resolution: 'none', reason: 'Trying to change the decision in the same run.' },
    });
    expect(sameRunNone).toMatchObject({
      status: 409,
      body: { error: { code: 'SKILL_DISCOVERY_STATE_CONFLICT' } },
    });

    const sameRunLoad = await request('/api/tools/skills/load', {
      body: {
        id: candidate.id,
        revision: searched.body.search.revision,
        candidateDigest: candidate.candidateDigest,
        role: 'primary',
        purpose: 'Trying to load before the answer arrives.',
      },
    });
    expect(sameRunLoad).toMatchObject({
      status: 409,
      body: { error: { code: 'SKILL_DISCOVERY_STATE_CONFLICT' } },
    });

    const current = readSkillDiscoveryState(db, 'conversation-1')!;
    ensureSkillDiscoveryForRun(db, {
      projectId: 'project-1',
      conversationId: 'conversation-1',
      runId: 'run-2',
      catalogRevision: current.catalogRevision,
    });
    toolRunId = 'run-2';
    const laterRunNone = await request('/api/tools/skills/resolve', {
      body: { resolution: 'none', reason: 'The user answer confirms no Skill is needed.' },
    });
    expect(laterRunNone).toMatchObject({ status: 200, body: { state: { status: 'resolved_none' } } });
  });

  it('rejects status and rehydration from a token whose run is no longer active', async () => {
    ensureSkillDiscoveryForRun(db, {
      projectId: 'project-1',
      conversationId: 'conversation-1',
      runId: 'run-2',
      catalogRevision: readSkillDiscoveryState(db, 'conversation-1')!.catalogRevision,
    });

    const status = await request('/api/tools/skills/status');
    expect(status.status).toBe(409);
    expect(status.body.error.code).toBe('SKILL_DISCOVERY_SCOPE_UNAVAILABLE');

    const rehydrated = await request('/api/tools/skills/rehydrate', { body: {} });
    expect(rehydrated.status).toBe(409);
    expect(rehydrated.body.error.code).toBe('SKILL_DISCOVERY_SCOPE_UNAVAILABLE');
  });

  it('deactivates an obsolete auxiliary before another auxiliary can replace it', async () => {
    const searched = await request('/api/tools/skills/search', {
      body: { query: 'decision memo', role: 'auxiliary', limit: 5 },
    });
    const candidate = searched.body.search.candidates.find(
      (item: { id: string }) => item.id === 'document-decision-memo',
    );
    expect(candidate).toBeDefined();
    const loaded = await prepareAndCommit({
        id: candidate.id,
        revision: searched.body.search.revision,
        candidateDigest: candidate.candidateDigest,
        role: 'auxiliary',
        purpose: 'Write the requested decision memo with its reference structure.',
    });
    expect(loaded.status).toBe(200);
    expect(loaded.body.state.activeAuxiliaries).toEqual([
      expect.objectContaining({ id: 'document-decision-memo' }),
    ]);

    const resolved = await request('/api/tools/skills/resolve', {
      body: { resolution: 'none', reason: 'No primary task profile fits this document deliverable.' },
    });
    expect(resolved).toMatchObject({ status: 200, body: { state: {
      status: 'resolved_none',
      activePrimary: null,
      activeAuxiliaries: [expect.objectContaining({ id: 'document-decision-memo' })],
    } } });

    const deactivated = await request('/api/tools/skills/deactivate', {
      body: { id: 'document-decision-memo', reason: 'The user changed from a memo to a new design.' },
    });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.state.activeAuxiliaries).toEqual([]);
    expect(deactivated.body.state.superseded).toEqual([
      expect.objectContaining({ id: 'document-decision-memo' }),
    ]);
    expect(operations.at(-1)).toBe('skills:deactivate');
  });

  it('strictly rejects unknown request fields before catalog access', async () => {
    const response = await request('/api/tools/skills/search', {
      body: { query: 'website', hiddenOverride: true },
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_REQUEST');
    expect(readSkillDiscoveryState(db, 'conversation-1')?.status).toBe('pending');
  });
});

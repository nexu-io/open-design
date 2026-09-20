import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import express, { type Request, type Response } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { strategyPackageHashFromDigests } from '@open-design/plugin-runtime';
import { closeDatabase, openDatabase, insertProject } from '../src/db.js';
import { createSnapshot } from '../src/plugins/snapshots.js';
import { listInstalledPlugins } from '../src/plugins/registry.js';
import { createChatRunService } from '../src/runtimes/runs.js';
import { registerRunRoutes } from '../src/routes/runs.js';
import { createStrategyTaskExecution, getStrategyTaskExecution } from '../src/strategies/task-store.js';
import { finalizeStrategyPlanningTurn } from '../src/strategies/od-next/coordinator.js';
import { OdNextMachineProtocolStream } from '../src/strategies/od-next/protocol.js';
import { strategyTaskCreateIdentityFixture } from './strategies/strategy-task-test-fixtures.js';

let tempDir: string;
let originalDataDir: string | undefined;
let createSseResponse: typeof import('../src/server.js')['createSseResponse'];
beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-chat-authority-'));
  originalDataDir = process.env.OD_DATA_DIR;
  process.env.OD_DATA_DIR = tempDir;
  ({ createSseResponse } = await import('../src/server.js'));
});
afterAll(() => {
  closeDatabase();
  if (originalDataDir === undefined) delete process.env.OD_DATA_DIR;
  else process.env.OD_DATA_DIR = originalDataDir;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

class LocalResponse extends EventEmitter {
  statusCode = 200;
  headers: Record<string, string> = {};
  body = '';
  writableEnded = false;
  destroyed = false;
  status(code: number) { this.statusCode = code; return this; }
  setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value; }
  write(value: string) { this.body += value; return true; }
  end() { this.writableEnded = true; this.emit('finish'); }
  json(value: unknown) { this.setHeader('Content-Type', 'application/json'); this.write(JSON.stringify(value)); this.end(); return this; }
}

function errorResponse(res: LocalResponse, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

describe('POST /api/chat internal strategy authority without a listening server', () => {
  it.each(['validated', 'ordinary-plugin', 'forged-internal-plugin', 'forged-task-scope'] as const)(
    '%s crosses only its permitted authority boundary', async (sample) => {
      closeDatabase();
      const dataDir = path.join(tempDir, sample);
      fs.mkdirSync(dataDir, { recursive: true });
      const db = openDatabase(dataDir, { dataDir });
      insertProject(db, { id: 'project', name: 'Project', createdAt: 1, updatedAt: 1 });
      db.prepare('INSERT INTO conversations(id,project_id,title,created_at,updated_at) VALUES (?,?,?,?,?)')
        .run('conversation', 'project', 'Conversation', 1, 1);
      const runs = createChatRunService({
        createSseResponse: (res: LocalResponse) => createSseResponse(res, { keepAliveIntervalMs: 0 }),
        createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
      });
      const assetDigests = [
        { path: './SKILL.md', sha256: 'a'.repeat(64) },
        { path: './assets/task-profiles/prototype.md', sha256: 'b'.repeat(64) },
      ];
      const snapshot = createSnapshot(db, {
        projectId: 'project', conversationId: 'conversation', pluginId: 'od-next-strategy', pluginVersion: '2.0.0',
        manifestSourceDigest: 'strategy-manifest',
        strategy: { schema: 'open-design.applied-strategy/v2', id: 'od-next-strategy', version: '2.0.0',
          packageHash: strategyPackageHashFromDigests(assetDigests), assetDigests,
          selectedTaskProfile: { taskType: 'prototype', version: '2.0.0', path: './assets/task-profiles/prototype.md', sha256: 'b'.repeat(64) },
          taskProfileVersions: ['2.0.0'], promptRecipe: 'od-next-plan-build-v2' },
        taskKind: 'new-generation', inputs: {}, resolvedContext: { items: [] },
        capabilitiesGranted: ['prompt:inject'], capabilitiesRequired: ['prompt:inject'], assetsStaged: [],
        connectorsRequired: [], connectorsResolved: [], mcpServers: [],
      });
      const source = runs.create({ projectId: 'project', conversationId: 'conversation', agentId: 'codex',
        appliedPluginSnapshotId: snapshot.snapshotId,
        odNextTaskInputSnapshot: { taskExecutionId: 'task', snapshotDir: path.join(dataDir, 'snapshot'), manifestSha256: 'd'.repeat(64) } });
      source.status = 'succeeded';
      createStrategyTaskExecution(db, { taskExecutionId: 'task', projectId: 'project', conversationId: 'conversation',
        snapshotId: snapshot.snapshotId, selectedAgentId: 'codex', initialRunId: source.id, ...strategyTaskCreateIdentityFixture(), createdAt: 100 });
      const protocol = new OdNextMachineProtocolStream();
      protocol.push('<question-form id="clarify">{"questions":[{"id":"audience","label":"Audience?"}]}</question-form>');
      expect(finalizeStrategyPlanningTurn(db, { taskExecutionId: 'task', runId: source.id, protocol, updatedAt: 110 }).action)
        .toBe('awaiting_clarification');
      // Match the server's headerless local registry lookup; the internal strategy is not installed as a public plugin.
      const authorizePluginRequest = vi.fn(async (_req: unknown, res: LocalResponse, pluginId: string) => {
        const found = listInstalledPlugins(db, null, null).find(plugin => plugin.id === pluginId);
        if (found) return true;
        errorResponse(res, 404, 'PLUGIN_NOT_FOUND', 'plugin not found');
        return false;
      });
      const app = express();
      const startChatRun = vi.fn(async (_body: unknown, run: ReturnType<typeof runs.create>) => {
        runs.finish(run, 'succeeded');
      });
      registerRunRoutes(app, {
        db, design: { runs, analytics: { capture() {} }, getAppVersion: () => 'fixture' },
        http: { createSseResponse, sendApiError: errorResponse },
        paths: { PROJECTS_DIR: dataDir, RUNTIME_DATA_DIR: dataDir },
        agents: { detectAgents: async () => [], getAgentDef: () => null },
        chat: { startChatRun }, lifecycle: { isDaemonShuttingDown: () => false },
        plugins: { authorizePluginRequest, connectorService: {}, detectSkillPluginCandidateOnRunSuccess() {},
          firePipelineForRun() {}, loadPluginRegistryView: async () => ({}), renderPluginBriefTemplate: (text: string) => text },
        telemetry: { reportRunCompletionTelemetryFallback() {}, resolveRunProjectKindForAnalytics: () => null,
          runArtifactBaselines: { take: () => undefined }, runRetryEventsForAnalytics: () => [] },
        messages: { pinAssistantMessageOnRunCreate: (_db: unknown, _run: unknown, options?: { beforeClaimCommit?: () => void }) => {
          options?.beforeClaimCommit?.(); return { ok: true };
        }, reconcileAssistantMessageOnRunEnd() {} },
        enforceWorkspaceProjectMutation: async () => true,
        projectStore: { getWorkspaceProject: () => null, getWorkspaceProjectByProjectId: () => null },
        amrWorkspaceScope: { isSignedIn: () => false },
      } as unknown as Parameters<typeof registerRunRoutes>[1]);
      // The exact production-registered handler; no HTTP listener or route reimplementation.
      const route = app.router.stack.find((layer: { route?: { path?: string } }) => layer.route?.path === '/api/chat');
      const handlerLayer = route?.route?.stack.at(-1);
      if (!handlerLayer) throw new Error('Production POST /api/chat handler was not registered.');
      const next = vi.fn((error?: unknown) => { if (error) throw error; });
      const req = Object.assign(new EventEmitter(), {
        method: 'POST', headers: {}, query: {}, get: () => undefined,
        body: { projectId: sample === 'forged-task-scope' ? 'other-project' : 'project', conversationId: 'conversation',
          agentId: 'codex', message: 'Investors', currentPrompt: 'Investors', assistantMessageId: 'answer',
          ...(['validated', 'forged-task-scope'].includes(sample) ? { taskExecutionId: 'task' } : { pluginId: sample === 'ordinary-plugin' ? 'ordinary' : 'od-next-strategy' }) },
      });
      const res = new LocalResponse();
      try {
        // Only the HTTP transport is substituted; the registered handler and services are real.
        await handlerLayer.handle(req as unknown as Request, res as unknown as Response, next);
        expect(next).not.toHaveBeenCalled();
        if (sample === 'validated') {
          expect(res.statusCode, res.body).toBe(200);
          expect(res.headers['content-type']).toBe('text/event-stream');
          expect(authorizePluginRequest).not.toHaveBeenCalled();
          await vi.waitFor(() => expect(startChatRun).toHaveBeenCalledTimes(1));
          expect(res.body).toContain('event: end');
          expect(getStrategyTaskExecution(db, 'task')?.runs).toHaveLength(2);
        } else {
          expect(res.statusCode).toBe(404);
          expect(res.body).toContain(sample === 'forged-task-scope' ? 'CONVERSATION_NOT_FOUND' : 'PLUGIN_NOT_FOUND');
          expect(authorizePluginRequest).toHaveBeenCalledTimes(sample === 'forged-task-scope' ? 0 : 1);
          expect(startChatRun).not.toHaveBeenCalled();
        }
      } finally { res.emit('close'); }
    },
  );
});

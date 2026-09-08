// Join test for the applied-plugin-snapshot -> run tool-bundle gap.
//
// `od.context.mcp[]` on a plugin manifest is persisted correctly onto the
// applied snapshot (`plugins/apply.ts` -> `plugins/snapshots.ts`, covered by
// `plugins-snapshots.test.ts`), but nothing carried those servers onto a
// run's tool bundle: `POST /api/runs` built `toolBundle` solely from the
// request body, so applying a plugin never actually attached its MCP
// server to a run. This file exercises the join at the route layer
// (`routes/runs.ts`) directly, the same way `run-create-workspace-gate.test.ts`
// does for its own POST /api/runs scenarios, rather than re-proving the
// plugin apply/persist half (already covered elsewhere).

import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  closeDatabase,
  getWorkspaceProject,
  getWorkspaceProjectByProjectId,
  insertProject,
  openDatabase,
} from '../src/db.js';
import { createSnapshot, linkSnapshotToProject } from '../src/plugins/snapshots.js';
import { createAuthorizeProjectRequest } from '../src/collab/project-request-authority.js';
import { createEnforceWorkspaceProjectMutation } from '../src/routes/project/index.js';
import { registerRunRoutes } from '../src/routes/runs.js';
import { connectorService } from '../src/connectors/service.js';
import type { McpServerSpec } from '@open-design/contracts';

let server: http.Server | null = null;
let tempDir: string | null = null;
let externalProjectDir: string | null = null;
let lastCreatedRun: any = null;

afterEach(async () => {
  if (server) {
    const toClose = server;
    server = null;
    await new Promise<void>((resolve) => toClose.close(() => resolve()));
  }
  closeDatabase();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
  if (externalProjectDir) fs.rmSync(externalProjectDir, { recursive: true, force: true });
  externalProjectDir = null;
  lastCreatedRun = null;
});

const PROJECT_ID = 'p-mcp-join';
// A folder-imported project: `metadata.baseDir` points outside PROJECTS_DIR,
// so `runToolBundleDeliveryTargetForProject` resolves it to 'external-project'
// rather than 'managed-project' — the same shape `/api/import/folder` produces.
const EXTERNAL_PROJECT_ID = 'p-mcp-join-external';

function sendApiError(
  res: any,
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
) {
  return res.status(status).json({ error: { code, message, ...details } });
}

function seedPluginSnapshot(mcpServers: McpServerSpec[], projectId: string = PROJECT_ID) {
  const db = openDatabase(tempDir!);
  const snapshot = createSnapshot(db, {
    projectId,
    conversationId: null,
    runId: null,
    pluginId: 'mcp-join-plugin',
    pluginVersion: '1.0.0',
    pluginTitle: 'MCP Join Fixture',
    pluginDescription: 'Fixture plugin declaring an MCP server for the run join test.',
    manifestSourceDigest: 'mcp-join-digest',
    sourceMarketplaceId: null,
    pinnedRef: null,
    taskKind: 'new-generation',
    inputs: {},
    resolvedContext: { items: [] },
    pipeline: undefined,
    genuiSurfaces: [],
    capabilitiesGranted: ['prompt:inject', 'mcp:*'],
    capabilitiesRequired: ['prompt:inject'],
    assetsStaged: [],
    connectorsRequired: [],
    connectorsResolved: [],
    mcpServers,
    query: 'Use the fixture MCP server',
  });
  linkSnapshotToProject(db, snapshot.snapshotId, projectId);
  return snapshot;
}

// A minimal in-memory ChatRunService stub, modeled on the one in
// `run-create-workspace-gate.test.ts`. It deliberately never spawns a
// process — this test only asserts on what `registerRunRoutes` hands to
// `design.runs.create(meta)`, specifically `meta.toolBundle`.
function createRunsServiceStub() {
  const runs = new Map<string, unknown>();
  let seq = 0;
  return {
    create(meta: any) {
      const run = {
        id: `run-${++seq}`,
        projectId: typeof meta.projectId === 'string' ? meta.projectId : null,
        conversationId: null,
        assistantMessageId:
          typeof meta.assistantMessageId === 'string' ? meta.assistantMessageId : null,
        agentId: typeof meta.agentId === 'string' ? meta.agentId : null,
        message: meta.message,
        currentPrompt: meta.currentPrompt,
        appliedPluginSnapshotId: meta.appliedPluginSnapshotId,
        clientRequestId: meta.clientRequestId,
        requestFingerprint: meta.requestFingerprint,
        workspaceScope: meta.workspaceScope,
        toolBundle: meta.toolBundle,
        status: 'queued',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        events: [],
        clients: new Set(),
      };
      runs.set(run.id, run);
      lastCreatedRun = run;
      return run;
    },
    createOrReuse(meta: any) {
      return { kind: 'created' as const, run: this.create(meta) };
    },
    get: (id: string) => runs.get(id) ?? null,
    list: () => Array.from(runs.values()),
    statusBody: (run: any) => ({ ...run }),
    stream: (run: any, req: any, res: any) => {
      res.status(req.method === 'GET' ? 200 : 202).json({ runId: run.id });
    },
    start: (run: any) => run,
    fail: () => {},
    wait: async () => ({ status: 'succeeded' }),
    cancel: async (run: any) => run,
    isTerminal: (status: string) =>
      status === 'succeeded' || status === 'failed' || status === 'canceled',
  };
}

async function startTestServer(): Promise<string> {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-run-mcp-join-'));
  externalProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-run-mcp-join-external-'));
  const db = openDatabase(tempDir);
  const now = Date.now();
  insertProject(db, { id: PROJECT_ID, name: PROJECT_ID, createdAt: now, updatedAt: now });
  insertProject(db, {
    id: EXTERNAL_PROJECT_ID,
    name: EXTERNAL_PROJECT_ID,
    metadata: { baseDir: externalProjectDir },
    createdAt: now,
    updatedAt: now,
  });
  // Deliberately no workspace_projects row: this project is unbound, the
  // same "headerless local run" case `run-create-workspace-gate.test.ts`
  // asserts stays open, so POST /api/runs needs no x-od-workspace-* headers.

  const app = express();
  app.use(express.json());
  registerRunRoutes(app, {
    db,
    design: {
      runs: createRunsServiceStub(),
      analytics: { capture: () => {} },
      getAppVersion: () => 'test',
    },
    http: {
      createSseResponse: () => ({ send() {}, end() {}, cleanup() {} }),
      sendApiError,
    },
    paths: { PROJECTS_DIR: tempDir, RUNTIME_DATA_DIR: tempDir },
    agents: {
      detectAgents: async () => [],
      getAgentDef: (agentId: string) => {
        // 'acp-merge' accepts any stdio-transport run-scoped MCP server
        // regardless of delivery target, so the stub doesn't need to model a
        // daemon-managed project just to clear `validateRunToolBundleForAgent`.
        if (agentId === 'claude') {
          return { id: 'claude', name: 'Claude Code', externalMcpInjection: 'acp-merge' };
        }
        // 'claude-mcp-json' only receives run-scoped servers via project
        // .mcp.json, which `validateRunToolBundleForAgent` gates on the run's
        // delivery target being a daemon-managed project.
        if (agentId === 'claude-mcp-json') {
          return {
            id: 'claude-mcp-json',
            name: 'Claude Code (mcp.json)',
            externalMcpInjection: 'claude-mcp-json',
          };
        }
        return null;
      },
    },
    chat: { startChatRun: async () => undefined },
    byokCredentials: { has: async () => false },
    lifecycle: { isDaemonShuttingDown: () => false },
    plugins: {
      connectorService,
      detectSkillPluginCandidateOnRunSuccess: () => {},
      firePipelineForRun: () => {},
      loadPluginRegistryView: async () => ({}) as never,
      renderPluginBriefTemplate: (template: string) => template,
    },
    telemetry: {
      reportRunCompletionTelemetryFallback: () => {},
      resolveRunProjectKindForAnalytics: () => null,
      runArtifactBaselines: { take: () => undefined },
      runRetryEventsForAnalytics: () => [],
    },
    messages: {
      pinAssistantMessageOnRunCreate: (_db: any, _run: any, options?: any) => {
        options?.beforeClaimCommit?.();
        return { ok: true };
      },
      reconcileAssistantMessageOnRunEnd: () => {},
    },
    enforceWorkspaceProjectMutation: createEnforceWorkspaceProjectMutation(),
    amrWorkspaceScope: { isSignedIn: () => false },
    authorizeProjectRequest: createAuthorizeProjectRequest({
      db,
      getWorkspaceProject: (dbArg: unknown, workspaceId: string, projectId: string) =>
        getWorkspaceProject(dbArg as ReturnType<typeof openDatabase>, workspaceId, projectId),
      getWorkspaceProjectByProjectId: (dbArg: unknown, projectId: string) =>
        getWorkspaceProjectByProjectId(dbArg as ReturnType<typeof openDatabase>, projectId),
      sendApiError,
    }),
    projectStore: {
      getWorkspaceProject,
      getWorkspaceProjectByProjectId,
      ensureWorkspaceProject: () => {},
    },
  } as any);

  const created = http.createServer(app);
  server = created;
  await new Promise<void>((resolve) => created.listen(0, resolve));
  const address = created.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return `http://127.0.0.1:${port}`;
}

describe('POST /api/runs — applied plugin snapshot MCP servers', () => {
  it('folds a snapshot-declared MCP server into a run started with no explicit toolBundle', async () => {
    const baseUrl = await startTestServer();
    const snapshot = seedPluginSnapshot([
      { name: 'bookboost-twig', command: 'node', args: ['/srv/twig-mcp/server.js'] },
    ]);

    const response = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: PROJECT_ID,
        agentId: 'claude',
        appliedPluginSnapshotId: snapshot.snapshotId,
        message: 'apply the plugin',
      }),
    });

    const responseText = await response.text();
    expect(response.status, responseText).toBe(202);
    expect(lastCreatedRun.toolBundle?.mcpServers).toEqual([
      expect.objectContaining({
        id: 'bookboost-twig',
        transport: 'stdio',
        command: 'node',
        args: ['/srv/twig-mcp/server.js'],
      }),
    ]);
  });

  it('leaves the run tool bundle empty when no appliedPluginSnapshotId is supplied', async () => {
    const baseUrl = await startTestServer();

    const response = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: PROJECT_ID,
        agentId: 'claude',
        message: 'no plugin involved',
      }),
    });

    const responseText = await response.text();
    expect(response.status, responseText).toBe(202);
    expect(lastCreatedRun.toolBundle?.mcpServers).toEqual([]);
  });

  it('leaves an explicit toolBundle untouched when no appliedPluginSnapshotId is supplied', async () => {
    const baseUrl = await startTestServer();

    const response = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: PROJECT_ID,
        agentId: 'claude',
        message: 'caller brought its own server',
        toolBundle: {
          mcpServers: [{ id: 'caller-tools', transport: 'stdio', command: 'node' }],
        },
      }),
    });

    const responseText = await response.text();
    expect(response.status, responseText).toBe(202);
    expect(lastCreatedRun.toolBundle?.mcpServers).toEqual([
      expect.objectContaining({ id: 'caller-tools', transport: 'stdio', command: 'node' }),
    ]);
  });

  it('merges a snapshot server alongside a differently-named explicit server', async () => {
    const baseUrl = await startTestServer();
    const snapshot = seedPluginSnapshot([
      { name: 'bookboost-twig', command: 'node', args: ['server.js'] },
    ]);

    const response = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: PROJECT_ID,
        agentId: 'claude',
        appliedPluginSnapshotId: snapshot.snapshotId,
        message: 'both a plugin default and a caller-supplied server',
        toolBundle: {
          mcpServers: [{ id: 'caller-tools', transport: 'stdio', command: 'python' }],
        },
      }),
    });

    const responseText = await response.text();
    expect(response.status, responseText).toBe(202);
    const ids = (lastCreatedRun.toolBundle?.mcpServers as Array<{ id: string }>)
      .map((server) => server.id)
      .sort();
    expect(ids).toEqual(['bookboost-twig', 'caller-tools']);
  });

  it('lets an explicit request-scoped server win a name collision with the snapshot default', async () => {
    const baseUrl = await startTestServer();
    const snapshot = seedPluginSnapshot([
      { name: 'bookboost-twig', command: 'node', args: ['plugin-default.js'] },
    ]);

    const response = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: PROJECT_ID,
        agentId: 'claude',
        appliedPluginSnapshotId: snapshot.snapshotId,
        message: 'this run pins its own instance of the same server id',
        toolBundle: {
          mcpServers: [
            { id: 'bookboost-twig', transport: 'stdio', command: 'node', args: ['override.js'] },
          ],
        },
      }),
    });

    const responseText = await response.text();
    expect(response.status, responseText).toBe(202);
    expect(lastCreatedRun.toolBundle?.mcpServers).toEqual([
      expect.objectContaining({
        id: 'bookboost-twig',
        command: 'node',
        args: ['override.js'],
      }),
    ]);
  });
});

describe('POST /api/runs — snapshot-merged tool bundle is validated, not the pre-merge request bundle', () => {
  // A run started with no explicit `toolBundle` has an empty PRE-merge bundle
  // (zero enabled servers), which `validateRunToolBundleForAgent` always
  // waves through regardless of agent or delivery target. If the route
  // validated that pre-merge bundle instead of the one actually attached to
  // the run, a plugin snapshot's MCP server would ride along unvalidated —
  // for `claude-mcp-json`, silently reproducing the exact bug this whole
  // snapshot-merge feature exists to fix, but only for imported-folder
  // projects: the daemon has no way to deliver that server (no managed-project
  // `.mcp.json` to write it into), so Claude Code simply never gets it, with
  // no error surfaced anywhere.
  it('rejects a snapshot MCP server for claude-mcp-json on an imported-folder project, even with no request-supplied toolBundle', async () => {
    const baseUrl = await startTestServer();
    const snapshot = seedPluginSnapshot(
      [{ name: 'bookboost-twig', command: 'node', args: ['/srv/twig-mcp/server.js'] }],
      EXTERNAL_PROJECT_ID,
    );

    const response = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: EXTERNAL_PROJECT_ID,
        agentId: 'claude-mcp-json',
        appliedPluginSnapshotId: snapshot.snapshotId,
        message: 'apply the plugin on an imported folder',
        // No toolBundle at all: the pre-merge request bundle is empty.
      }),
    });

    const responseText = await response.text();
    expect(response.status, responseText).toBe(400);
    const body = JSON.parse(responseText) as { error?: { message?: string } };
    expect(body.error?.message).toContain('requires a daemon-managed project');
    // The rejection must happen before a run is ever created.
    expect(lastCreatedRun).toBeNull();
  });
});

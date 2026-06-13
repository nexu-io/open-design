// Plan §6 Phase 2A.5 — `GET /api/runs/:runId/genui/:surfaceId` enriches
// the response with the surface spec (incl. JSON Schema) pulled out of
// the AppliedPluginSnapshot. This is the wire that lets `od ui show`
// (and the web JsonSchemaFormSurface fallback) inspect the schema for
// surfaces whose `schema_digest` is the only thing the genui_surfaces
// table holds. Without enrichment, headless callers can't render
// arbitrary form/choice surfaces.

import http from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = { server: http.Server; url: string };

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../../..');
const serverRuntimeDataRoot = process.env.OD_DATA_DIR
  ? path.resolve(projectRoot, process.env.OD_DATA_DIR)
  : path.join(projectRoot, '.od');

let server: http.Server | undefined;
let baseUrl: string;
let pluginRoot: string;
const cleanupRows: string[] = [];

const PLUGIN_ID = `phase2a5-form-${Date.now()}`;

beforeEach(async () => {
  pluginRoot = await mkdtemp(path.join(os.tmpdir(), 'od-genui-spec-'));
  // We have to materialise the plugin under a folder whose basename
  // becomes the plugin id (the local installer derives the id from
  // the folder name). Build the fixture nested inside pluginRoot.
  const pluginFolder = path.join(pluginRoot, PLUGIN_ID);
  await mkdir(pluginFolder, { recursive: true });
  await writeFile(
    path.join(pluginFolder, 'open-design.json'),
    JSON.stringify({
      $schema: 'https://open-design.ai/schemas/plugin.v1.json',
      name: PLUGIN_ID,
      title: 'Phase 2A.5 fixture',
      version: '1.0.0',
      description: 'fixture',
      license: 'MIT',
      od: {
        kind: 'skill',
        taskKind: 'new-generation',
        useCase: { query: 'demo' },
        capabilities: ['prompt:inject'],
        inputs: [],
        genui: {
          surfaces: [
            {
              id: 'discovery',
              kind: 'form',
              persist: 'project',
              prompt: 'Tell me about the brief',
              schema: {
                type: 'object',
                required: ['topic'],
                properties: {
                  topic: { type: 'string', title: 'Topic' },
                  audience: { type: 'string', enum: ['VC pitch', 'general'] },
                },
              },
            },
          ],
        },
      },
    }),
  );
  await writeFile(
    path.join(pluginFolder, 'SKILL.md'),
    `---\nname: ${PLUGIN_ID}\ndescription: phase 2a5 fixture\n---\n# fixture\n`,
  );

  const started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
  server = started.server;
  baseUrl = started.url;

  // Install the plugin via the SSE endpoint.
  const installResp = await fetch(`${baseUrl}/api/plugins/install`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ source: pluginFolder }),
  });
  if (installResp.body) {
    const reader = installResp.body.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  }
});

afterEach(async () => {
  await new Promise((resolve, reject) => {
    if (!server) return resolve(undefined);
    server.close((error?: Error) => (error ? reject(error) : resolve(undefined)));
  });
  server = undefined;

  // Best-effort cleanup of the plugin row + snapshot rows we created.
  // The user's real `.od/app.sqlite` is what the daemon talks to, so we
  // strip our PLUGIN_ID rows after each test to avoid polluting it.
  try {
    const dbPath = path.join(serverRuntimeDataRoot, 'app.sqlite');
    const db = new Database(dbPath);
    db.prepare('DELETE FROM applied_plugin_snapshots WHERE plugin_id = ?').run(PLUGIN_ID);
    db.prepare('DELETE FROM installed_plugins WHERE id = ?').run(PLUGIN_ID);
    for (const projectId of cleanupRows) {
      db.prepare('DELETE FROM genui_surfaces WHERE project_id = ?').run(projectId);
      db.prepare('DELETE FROM conversations WHERE project_id = ?').run(projectId);
      db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    }
    db.close();
  } catch {
    // ignore — DB might be locked / not yet created in some failure modes
  }
  cleanupRows.length = 0;

  await rm(pluginRoot, { recursive: true, force: true });
});

describe('GET /api/runs/:runId/genui/:surfaceId enriches with snapshot spec', () => {
  it('returns the surface spec (incl. JSON Schema) so headless callers can inspect the contract', async () => {
    // Drive the project create with the plugin so the daemon mints a
    // snapshot whose genuiSurfaces[] contains our form surface.
    const projectId = `phase2a5-${Date.now()}`;
    cleanupRows.push(projectId);
    const projResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'phase2a5 project',
        pluginId: PLUGIN_ID,
        pluginInputs: {},
        // Restricted-trust local installs need explicit grant. The
        // form surface auto-derives a `genui:form` capability via the
        // surface kind, so we grant both.
        grantCaps: ['prompt:inject', 'genui:form'],
      }),
    });
    if (projResp.status !== 200) {
      const errBody = await projResp.text();
      throw new Error(`POST /api/projects failed: ${projResp.status} ${errBody}`);
    }
    const projBody = await projResp.json() as { appliedPluginSnapshotId: string };
    const snapshotId = projBody.appliedPluginSnapshotId;
    expect(typeof snapshotId).toBe('string');

    // Insert a genui_surfaces row directly (no agent runs in the test
    // env). The runId is synthetic; the GET endpoint keys off it.
    const dbPath = path.join(serverRuntimeDataRoot, 'app.sqlite');
    const db = new Database(dbPath);
    const runId = `run-phase2a5-${Date.now()}`;
    const surfaceRowId = `srf-phase2a5-${Date.now()}`;
    db.prepare(
      `INSERT INTO genui_surfaces (
         id, project_id, conversation_id, run_id, plugin_snapshot_id,
         surface_id, kind, persist, schema_digest, value_json, status,
         responded_by, requested_at, responded_at, expires_at
       ) VALUES (?, ?, NULL, ?, ?, ?, 'form', 'project', NULL, NULL,
                 'pending', NULL, ?, NULL, NULL)`,
    ).run(
      surfaceRowId,
      projectId,
      runId,
      snapshotId,
      'discovery',
      Date.now(),
    );
    db.close();

    const resp = await fetch(`${baseUrl}/api/runs/${encodeURIComponent(runId)}/genui/discovery`);
    expect(resp.status).toBe(200);
    const body = await resp.json() as {
      surfaceId: string;
      kind: string;
      spec: {
        id: string;
        kind: string;
        schema?: {
          type?: string;
          required?: string[];
          properties?: Record<string, { type?: string; enum?: string[] }>;
        };
      };
    };
    expect(body.surfaceId).toBe('discovery');
    expect(body.kind).toBe('form');
    // The new `spec` field carries the snapshot's surface spec.
    expect(body.spec).toBeDefined();
    expect(body.spec.id).toBe('discovery');
    expect(body.spec.kind).toBe('form');
    expect(body.spec.schema?.type).toBe('object');
    expect(body.spec.schema?.required).toEqual(['topic']);
    expect(body.spec.schema?.properties?.topic).toBeDefined();
    expect(body.spec.schema?.properties?.audience?.enum).toEqual(['VC pitch', 'general']);
  });
});

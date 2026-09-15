// Regression for the QA-verified end-to-end journey on a local install that
// never signed into a Workspace (PR #7693 review): the legacy unattributed
// personal design system must be USABLE, not merely visible.
//
// The install's normal state (see local-install-personal-visibility.test.ts):
// the web shell sends the local personal Workspace scope on every request
// (`x-od-workspace-id` + `x-od-workspace-member-id` + `x-od-workspace-type:
// personal`), while lazy orphan adoption left the design system's editing
// project bound to that workspace with NO creator member, so the startup
// backfill wrote an equally unattributed `visibility: 'personal'` binding.
//
// Making that binding readable fixed the catalog and detail reads but left
// three sibling gates on the strict exact-creator rule, so the primary user
// journey still broke end to end: Home listed the system but project creation
// answered 400 DESIGN_SYSTEM_NOT_FOUND; the UI offered Publish/Edit/Delete but
// every mutation answered 403; existing projects could select it but the run
// path filtered it out of the prompt. These specs drive the whole chain
// through the real daemon (real startup backfill, real routes, real run
// composition with a stub agent that reports what reached its stdin):
// selection -> project creation -> mutation -> run, for both a project created
// from that selection and a legacy memberless project.
//
// Every allowance keys on the caller's EXPLICIT personal assertion CONFIRMED
// by the daemon's membership verification — on this local/dev install the
// explicit headers are that authority; local-install-personal-verified-
// workspace.test.ts covers the packaged runtime, where the membership
// directory is. A same-workspace caller that omits or contradicts the type
// stays refused at every one of these gates — pinned alongside each happy
// path.

import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import type http from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ensureWorkspaceProject,
  getWorkspaceResourceByResourceId,
  insertProject,
} from '../../src/db.js';
import { backfillDesignSystemWorkspaceResources } from '../../src/design-systems/index.js';
import { startServer } from '../../src/server.js';

const WORKSPACE = `local-personal-ws-${randomUUID()}`;
const LOCAL_MEMBER = `local-member-${randomUUID()}`;
const DIR_ID = `legacy-local-${randomUUID()}`;
const DESIGN_SYSTEM_ID = `user:${DIR_ID}`;
const EDITING_PROJECT_ID = `ds-editing-${randomUUID()}`;
const MARKER = `LEGACY_LOCAL_DS_${randomUUID().replace(/-/g, '')}`;

let server: http.Server;
let baseUrl: string;
let designSystemDir: string;
let createdProjectId: string | null = null;
let legacyProjectId: string | null = null;

function personalScopeHeaders(): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-od-workspace-id': WORKSPACE,
    'x-od-workspace-member-id': LOCAL_MEMBER,
    'x-od-workspace-type': 'personal',
  };
}

function unassertedScopeHeaders(): Record<string, string> {
  const { 'x-od-workspace-type': _type, ...rest } = personalScopeHeaders();
  return rest;
}

function teamAssertedScopeHeaders(): Record<string, string> {
  return { ...personalScopeHeaders(), 'x-od-workspace-type': 'team' };
}

function openSqlite(): Database.Database {
  return new Database(resolve(process.env.OD_DATA_DIR!, 'app.sqlite'));
}

/** The stub agent reports whether the design system's DESIGN.md reached the prompt. */
const PROMPT_PROBE = `
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  const result = prompt.includes(${JSON.stringify(MARKER)})
    ? 'legacy-design-system-visible'
    : 'legacy-design-system-missing';
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: result } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`;

function killProcessesUsingPath(pathFragment: string): void {
  if (process.platform === 'win32') return;
  let output = '';
  try {
    output = execFileSync('pgrep', ['-f', pathFragment], { encoding: 'utf8' });
  } catch {
    return;
  }
  for (const line of output.split('\n')) {
    const pid = Number(line.trim());
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
    }
  }
}

async function withPromptProbeAgent<T>(run: () => Promise<T>): Promise<T> {
  const dir = await fsp.mkdtemp(join(tmpdir(), 'od-legacy-ds-bin-'));
  const oldPath = process.env.PATH;
  try {
    if (process.platform === 'win32') {
      const runner = join(dir, 'opencode-test-runner.cjs');
      await fsp.writeFile(runner, PROMPT_PROBE);
      await fsp.writeFile(join(dir, 'opencode.cmd'), `@echo off\r\nnode "${runner}" %*\r\n`);
    } else {
      const bin = join(dir, 'opencode');
      await fsp.writeFile(bin, `#!/usr/bin/env node\n${PROMPT_PROBE}`);
      await fsp.chmod(bin, 0o755);
    }
    process.env.PATH = `${dir}${delimiter}${oldPath ?? ''}`;
    return await run();
  } finally {
    process.env.PATH = oldPath;
    killProcessesUsingPath(dir);
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

async function runProjectAndProbePrompt(
  projectId: string,
  headers: Record<string, string>,
): Promise<string> {
  return withPromptProbeAgent(async () => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        agentId: 'opencode',
        projectId,
        message: 'draft with my local brand',
      }),
    });
    const body = await response.text();
    expect(response.ok).toBe(true);
    return body;
  });
}

async function listCatalogIds(headers: Record<string, string>): Promise<string[]> {
  const response = await fetch(`${baseUrl}/api/design-systems`, { headers });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { designSystems: Array<{ id: string }> };
  return body.designSystems.map((system) => system.id);
}

async function createProject(
  headers: Record<string, string>,
  designSystemCatalogScope: Record<string, string>,
): Promise<{ id: string; response: Response }> {
  const id = `proj-legacy-ds-${randomUUID()}`;
  const response = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id,
      name: 'Legacy local design system project',
      designSystemId: DESIGN_SYSTEM_ID,
      designSystemCatalogScope,
      skipDiscoveryBrief: true,
    }),
  });
  return { id, response };
}

beforeAll(async () => {
  if (!process.env.OD_DATA_DIR) {
    throw new Error('OD_DATA_DIR is required for the local-install design-system journey');
  }
  const started = (await startServer({ port: 0, returnServer: true })) as {
    url: string;
    server: http.Server;
  };
  baseUrl = started.url;
  server = started.server;

  // The exact on-disk + DB state of the reported install, reproduced through
  // the same startup backfill `server.ts` runs.
  designSystemDir = resolve(process.env.OD_DATA_DIR, 'design-systems', DIR_ID);
  await fsp.mkdir(designSystemDir, { recursive: true });
  await fsp.writeFile(
    resolve(designSystemDir, 'DESIGN.md'),
    `# Legacy local design system\n\n## Colors\n\n${MARKER}\n`,
    'utf8',
  );
  await fsp.writeFile(
    resolve(designSystemDir, 'metadata.json'),
    `${JSON.stringify({
      title: 'Legacy local design system',
      status: 'published',
      projectId: EDITING_PROJECT_ID,
    }, null, 2)}\n`,
    'utf8',
  );
  // The design system's editing project exists on disk too, as it does on a
  // real install (the run path re-reads DESIGN.md through that project).
  const editingProjectDir = resolve(process.env.OD_DATA_DIR, 'projects', EDITING_PROJECT_ID);
  await fsp.mkdir(editingProjectDir, { recursive: true });
  await fsp.copyFile(resolve(designSystemDir, 'DESIGN.md'), resolve(editingProjectDir, 'DESIGN.md'));
  const sqlite = openSqlite();
  try {
    insertProject(sqlite as never, {
      id: EDITING_PROJECT_ID,
      name: 'Legacy local design system',
      createdAt: 1,
      updatedAt: 1,
    });
    // Legacy orphan adoption shape: bound to the personal workspace with NO
    // creator member (`ensureWorkspaceProjection` writes exactly this).
    ensureWorkspaceProject(sqlite as never, {
      workspaceId: WORKSPACE,
      projectId: EDITING_PROJECT_ID,
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: null,
    });
    await backfillDesignSystemWorkspaceResources(
      sqlite as never,
      resolve(process.env.OD_DATA_DIR, 'design-systems'),
    );
    const binding = getWorkspaceResourceByResourceId(
      sqlite as never,
      'design_system',
      DESIGN_SYSTEM_ID,
    );
    expect(binding).toMatchObject({
      workspaceId: WORKSPACE,
      visibility: 'personal',
      createdByWorkspaceMemberId: null,
    });
  } finally {
    sqlite.close();
  }
});

afterAll(async () => {
  for (const id of [createdProjectId, legacyProjectId, EDITING_PROJECT_ID]) {
    if (!id) continue;
    await fetch(`${baseUrl}/api/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: personalScopeHeaders(),
    }).catch(() => {});
  }
  await fsp.rm(designSystemDir, { recursive: true, force: true }).catch(() => {});
  await new Promise<void>((done) => server.close(() => done()));
});

describe('legacy local personal design system: selection -> create -> mutate -> run', () => {
  const designSystemUrl = () =>
    `${baseUrl}/api/design-systems/${encodeURIComponent(DESIGN_SYSTEM_ID)}`;

  it('accepts the Home selection on project creation under the asserted personal scope', async () => {
    expect(await listCatalogIds(personalScopeHeaders())).toContain(DESIGN_SYSTEM_ID);

    const created = await createProject(personalScopeHeaders(), {
      workspaceId: WORKSPACE,
      workspaceMemberId: LOCAL_MEMBER,
      workspaceType: 'personal',
    });

    expect(created.response.status, await created.response.clone().text()).toBe(200);
    createdProjectId = created.id;
  });

  it('keeps refusing project creation for a same-workspace selection that does not assert its type', async () => {
    // A missing `x-od-workspace-type` is not an assertion of a personal
    // workspace; the project-create validator stays on the strict gate like
    // every other read lane (fail-closed).
    const created = await createProject(unassertedScopeHeaders(), {
      workspaceId: WORKSPACE,
      workspaceMemberId: LOCAL_MEMBER,
    });

    expect(created.response.status).toBe(400);
    expect(await created.response.text()).toContain('DESIGN_SYSTEM_NOT_FOUND');
  });

  it('injects the selected DESIGN.md into a run of the project created from that selection', async () => {
    expect(createdProjectId).not.toBeNull();

    const body = await runProjectAndProbePrompt(createdProjectId!, personalScopeHeaders());

    expect(body).toContain('legacy-design-system-visible');
    expect(body).not.toContain('legacy-design-system-missing');
  });

  it('injects the selected DESIGN.md into a run of a legacy memberless project', async () => {
    // An existing project adopted without a creator member — the same legacy
    // shape as the design system's own binding — selects the system through
    // the UI's PATCH, then runs from its persisted scope, which carries no
    // member and no type assertion of its own.
    legacyProjectId = `proj-legacy-memberless-${randomUUID()}`;
    const createResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: legacyProjectId,
        name: 'Legacy memberless project',
        skipDiscoveryBrief: true,
      }),
    });
    expect(createResponse.ok).toBe(true);
    const sqlite = openSqlite();
    try {
      ensureWorkspaceProject(sqlite as never, {
        workspaceId: WORKSPACE,
        projectId: legacyProjectId,
        visibility: 'personal',
        resourceState: 'active',
        createdByWorkspaceMemberId: null,
      });
    } finally {
      sqlite.close();
    }
    const selected = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(legacyProjectId)}`, {
      method: 'PATCH',
      headers: personalScopeHeaders(),
      body: JSON.stringify({ designSystemId: DESIGN_SYSTEM_ID }),
    });
    expect(selected.status, await selected.clone().text()).toBe(200);

    const body = await runProjectAndProbePrompt(legacyProjectId, personalScopeHeaders());

    expect(body).toContain('legacy-design-system-visible');
    expect(body).not.toContain('legacy-design-system-missing');
  });

  it('accepts a PATCH from the asserted personal scope and refuses team or unasserted scopes', async () => {
    const teamAsserted = await fetch(designSystemUrl(), {
      method: 'PATCH',
      headers: teamAssertedScopeHeaders(),
      body: JSON.stringify({ title: 'Must not rename' }),
    });
    expect(teamAsserted.status).toBe(403);
    const unasserted = await fetch(designSystemUrl(), {
      method: 'PATCH',
      headers: unassertedScopeHeaders(),
      body: JSON.stringify({ title: 'Must not rename' }),
    });
    expect(unasserted.status).toBe(403);

    const renamed = await fetch(designSystemUrl(), {
      method: 'PATCH',
      headers: personalScopeHeaders(),
      body: JSON.stringify({ title: 'Renamed legacy local design system' }),
    });
    expect(renamed.status, await renamed.clone().text()).toBe(200);

    // The detail read's `canMutate` is what enables the UI's Publish/Edit/
    // Delete controls; it must agree with the verdict the mutation routes
    // just gave.
    const detail = await fetch(designSystemUrl(), { headers: personalScopeHeaders() });
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as { title?: string; canMutate?: boolean };
    expect(detailBody.title).toBe('Renamed legacy local design system');
    expect(detailBody.canMutate).toBe(true);
  });

  it('opens the editor on the legacy editing project itself and syncs assets under the asserted personal scope', async () => {
    const denied = await fetch(`${designSystemUrl()}/workspace`, {
      method: 'POST',
      headers: teamAssertedScopeHeaders(),
    });
    expect(denied.status).toBe(403);

    const opened = await fetch(`${designSystemUrl()}/workspace`, {
      method: 'POST',
      headers: personalScopeHeaders(),
    });
    expect(opened.status, await opened.clone().text()).toBe(201);
    const openedBody = (await opened.json()) as { project?: { id?: string } };
    // The system's own editing project — the one run-time prompt loading
    // reads DESIGN.md through — not a forked workspace-scoped copy whose
    // edits the run would never see.
    expect(openedBody.project?.id).toBe(EDITING_PROJECT_ID);

    const synced = await fetch(`${designSystemUrl()}/sync-assets`, {
      method: 'POST',
      headers: personalScopeHeaders(),
    });
    expect(synced.status, await synced.clone().text()).toBe(200);
  });

  it('accepts a DELETE from the asserted personal scope and refuses a team-asserted one', async () => {
    const denied = await fetch(designSystemUrl(), {
      method: 'DELETE',
      headers: teamAssertedScopeHeaders(),
    });
    expect(denied.status).toBe(403);

    const deleted = await fetch(designSystemUrl(), {
      method: 'DELETE',
      headers: personalScopeHeaders(),
    });
    expect(deleted.status, await deleted.clone().text()).toBe(204);
    expect(await listCatalogIds(personalScopeHeaders())).not.toContain(DESIGN_SYSTEM_ID);
  });
});

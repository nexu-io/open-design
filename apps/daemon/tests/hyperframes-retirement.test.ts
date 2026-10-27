import type { Server } from 'node:http';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase, openDatabase, insertProject, insertConversation, getProject, insertRoutine, ensureWorkspaceResource } from '../src/db.js';
import { startServer } from '../src/server.js';
import { deleteInstalledPlugin, getInstalledPlugin, upsertInstalledPlugin } from '../src/plugins/registry.js';
import { resolvePluginSnapshot } from '../src/plugins/resolve-snapshot.js';
import { captureOdNextSessionSkillPackage } from '../src/strategies/od-next/session-skill-package.js';
import { materializeFrozenSkillPackage } from '../src/strategies/od-next/frozen-skill-package.js';
import { listSkills } from '../src/skills.js';
import { isRetiredOfficialSnapshot } from '../src/registry/hyperframes-retirement.js';

describe('retired official HyperFrames content', () => {
  let started: { url: string; server: Server; shutdown?: () => Promise<void> | void };
  beforeAll(async () => {
    started = await startServer({ port: 0, returnServer: true }) as typeof started;
  }, 60_000);
  afterAll(async () => {
    await started?.shutdown?.();
    if (started?.server.listening) await new Promise<void>((resolve) => started.server.close(() => resolve()));
    closeDatabase();
  }, 60_000);
  const post = (route: string, body: unknown) => fetch(`${started.url}${route}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const database = () => openDatabase(path.join(process.env.OD_DATA_DIR!, 'projects'), { dataDir: process.env.OD_DATA_DIR! });
  function historicalProject(id: string, extra: Record<string, unknown> = {}) {
    const db = database();
    const now = Date.now() - 86_400_000;
    insertProject(db, { id, name: id, createdAt: now, updatedAt: now, ...extra });
    insertConversation(db, { id: `${id}-chat`, projectId: id, createdAt: now, updatedAt: now });
    return id;
  }

  it('omits retired official content from every public catalogue while retaining Motion templates', async () => {
    const read = async <T>(route: string): Promise<T> => (await fetch(`${started.url}${route}`)).json() as Promise<T>;
    const [skills, templates, plugins, prompts] = await Promise.all([
      read<{ skills: { id: string }[] }>('/api/skills'),
      read<{ designTemplates: { id: string }[] }>('/api/design-templates'),
      read<{ plugins: { id: string }[] }>('/api/plugins'),
      read<{ promptTemplates: { id: string }[] }>('/api/prompt-templates'),
    ]);
    expect(skills.skills.map((entry: { id: string }) => entry.id)).not.toContain('video-hyperframes');
    expect(templates.designTemplates.map((entry: { id: string }) => entry.id)).not.toContain('hyperframes');
    expect(plugins.plugins.map((entry: { id: string }) => entry.id)).not.toContain('example-hyperframes');
    expect(plugins.plugins.map((entry: { id: string }) => entry.id)).toContain('video-template-frame-product-promo');
    expect(prompts.promptTemplates.some((entry: { id: string }) => entry.id.startsWith('hyperframes-'))).toBe(false);
  });

  it.each([
    '/api/skills/video-hyperframes', '/api/design-templates/hyperframes',
    '/api/plugins/example-hyperframes',
    '/api/prompt-templates/video/hyperframes-brand-sizzle-reel',
  ])('explains retirement for a direct detail request: %s', async (route) => {
    const response = await fetch(`${started.url}${route}`);
    expect(response.status).toBe(410);
    expect(await response.text()).toContain('Motion');
  });

  it.each([
    { skillId: 'hyperframes' },
    { skillId: 'video-hyperframes' },
    { pluginId: 'example-hyperframes' },
    { automaticStrategyTaskProfile: 'hyperframes', metadata: { kind: 'video', intent: 'hyperframes' } },
    { metadata: { kind: 'video', promptTemplate: { id: 'hyperframes-brand-sizzle-reel', surface: 'video', title: 'Legacy', prompt: 'Legacy template content remains available in historical projects.' } } },
  ])('rejects new project selection without silently replacing it: %j', async (selection) => {
    const response = await post('/api/projects', {
      id: `retired-new-${process.hrtime.bigint()}`, name: 'new retired selection', ...selection,
    });
    expect(response.status).toBe(410);
    expect(await response.text()).toContain('Motion');
  });

  it('rejects direct plugin apply even when a caller knows its exact bundled source', async () => {
    const response = await post('/api/plugins/example-hyperframes/apply', { inputs: {} });
    expect(response.status).toBe(410);
    expect(await response.text()).toContain('Motion');
    const plugin = getInstalledPlugin(database(), 'example-hyperframes')!;
    const local = await post('/api/plugins/example-hyperframes/apply-local', { source: plugin.source });
    expect(local.status).toBe(410);
    const example = await post('/api/projects', { id: 'retired-new-example', name: 'old example', metadata: { kind: 'prototype' }, exampleReference: { pluginId: plugin.id, source: plugin.source } });
    expect(example.status).toBe(410);
  });

  it('rejects new run skill selections and PATCH introductions, including forged history metadata', async () => {
    const id = historicalProject('retired-plain-project');
    for (const selection of [{ skillId: 'hyperframes' }, { skillIds: ['video-hyperframes'] }, { pluginId: 'example-hyperframes' }]) {
      const response = await post('/api/runs', { projectId: id, conversationId: `${id}-chat`, agentId: 'codex', message: 'new work', ...selection });
      expect(response.status, JSON.stringify(selection)).toBe(410);
    }
    for (const patch of [
      { skillId: 'hyperframes' },
      { metadata: { kind: 'video', intent: 'hyperframes' } },
      { metadata: { kind: 'video', promptTemplate: { id: 'hyperframes-brand-sizzle-reel', surface: 'video', title: 'Old', prompt: 'old instructions' } } },
    ]) {
      const response = await fetch(`${started.url}/api/projects/${id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
      });
      expect(response.status).toBe(410);
    }
    const spoofed = await post('/api/projects', {
      id: 'retired-spoofed-project', name: 'spoofed', skillId: 'hyperframes',
      metadata: { strategyBinding: { schemaVersion: 1, provenance: 'automatic_default', taskProfile: 'hyperframes', boundAt: 0 } },
    });
    expect(spoofed.status).toBe(410);
    expect(getProject(database(), 'retired-spoofed-project')).toBeNull();
  });

  it('retains persisted skill, prompt body and same-project plugin pins but rejects new-project snapshot reuse', async () => {
    const metadata = { kind: 'video', intent: 'hyperframes', promptTemplate: {
      id: 'hyperframes-brand-sizzle-reel', surface: 'video', title: 'Old', prompt: 'User-edited historical prompt body.',
    } };
    const id = historicalProject('retired-bound-project', { skillId: 'hyperframes', metadata });
    const patch = await fetch(`${started.url}/api/projects/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ skillId: 'hyperframes', metadata }),
    });
    expect(patch.status).toBe(200);
    expect(getProject(database(), id)?.metadata?.promptTemplate).toEqual(metadata.promptTemplate);
    const plugin = getInstalledPlugin(database(), 'example-hyperframes')!;
    const resolved = resolvePluginSnapshot({
      db: database(), projectId: id, conversationId: `${id}-chat`, body: { pluginId: plugin.id },
      registry: { skills: [], designSystems: [], craft: [], atoms: [], scenarios: [] }, requireSnapshotProjectMatch: true,
    });
    expect(resolved?.ok).toBe(true);
    if (!resolved?.ok) throw new Error('historical fixture failed to bind');
    const applied = await post(`/api/plugins/${plugin.id}/apply`, { projectId: id });
    expect(applied.status).toBe(200);
    const resumed = resolvePluginSnapshot({ db: database(), projectId: id, body: {}, registry: { skills: [], designSystems: [], craft: [], atoms: [], scenarios: [] }, requireSnapshotProjectMatch: true });
    expect(resumed?.ok && resumed.snapshotId).toBe(resolved.snapshotId);
    for (const projectId of [id, 'retired-snapshot-copy']) {
      const copied = await post('/api/projects', { id: projectId, name: 'snapshot copy', appliedPluginSnapshotId: resolved.snapshotId });
      expect(copied.status).toBe(410);
    }
    // Removing a bundled registry row must not erase the immutable snapshot's
    // official provenance and reopen it for new projects.
    deleteInstalledPlugin(database(), plugin.id);
    try {
      const withoutRegistry = await post('/api/projects', { id: 'retired-uninstalled-snapshot-copy', name: 'snapshot copy', appliedPluginSnapshotId: resolved.snapshotId });
      expect(withoutRegistry.status).toBe(410);
      const sameOwner = resolvePluginSnapshot({ db: database(), projectId: id, body: {}, registry: { skills: [], designSystems: [], craft: [], atoms: [], scenarios: [] }, requireSnapshotProjectMatch: true });
      expect(sameOwner?.ok && sameOwner.snapshotId).toBe(resolved.snapshotId);
    } finally { upsertInstalledPlugin(database(), plugin); }
    const other = historicalProject('retired-other-project');
    const foreign = await post('/api/runs', { projectId: other, conversationId: `${other}-chat`, agentId: 'codex', appliedPluginSnapshotId: resolved.snapshotId, message: 'copy old snapshot' });
    expect(foreign.status).toBe(404);
    expect(getProject(database(), id)?.appliedPluginSnapshotId).toBe(resolved.snapshotId);
  });

  it('restores an already frozen legacy Skill package after public retirement', async () => {
    const root = path.resolve(import.meta.dirname, '../../..');
    const catalog = await listSkills([path.join(root, '.tmp/missing-user-skills'), path.join(root, 'design-templates')]);
    const frozen = await captureOdNextSessionSkillPackage({ metadata: { kind: 'video', intent: 'hyperframes' }, selection: { skillId: 'hyperframes' }, listSkillCatalog: async () => catalog, getLocalPluginBySource: undefined });
    expect(frozen.selections.map((entry) => entry.canonicalId)).toEqual(['hyperframes']);
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-retired-frozen-'));
    try {
      const [materialized] = await materializeFrozenSkillPackage({ cwd, frozen });
      const first = frozen.selections[0]!.files[0]!;
      expect(await readFile(path.join(cwd, materialized!, first.path)))
        .toEqual(Buffer.from(first.bytesBase64, 'base64'));
    } finally { await rm(cwd, { recursive: true, force: true }); }
  });

  it('allows a user template shadow and a third-party plugin with the same legacy IDs', async () => {
    const directory = path.join(process.env.OD_DATA_DIR!, 'design-templates', 'hyperframes');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'SKILL.md'), '---\nname: hyperframes\ndescription: User-owned animation template.\n---\nUse my custom animation source.\n');
    const original = getInstalledPlugin(database(), 'example-hyperframes')!;
    try {
      const template = await fetch(`${started.url}/api/design-templates/hyperframes`);
      expect(template.status).toBe(200);
      const created = await post('/api/projects', { id: 'retired-user-shadow', name: 'user template', skillId: 'hyperframes', metadata: { kind: 'prototype' } });
      expect(created.status).toBe(200);
      upsertInstalledPlugin(database(), { ...original, sourceKind: 'user', source: 'third-party:own-hyperframes', resolvedSource: 'third-party:own-hyperframes' });
      const detail = await fetch(`${started.url}/api/plugins/example-hyperframes`);
      expect(detail.status).toBe(200);
      const applied = await post('/api/plugins/example-hyperframes/apply', {});
      expect(applied.status).toBe(200);
    } finally {
      upsertInstalledPlugin(database(), original);
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('blocks new routine selections and future independent creations while retaining the stored routine', async () => {
    const body = { name: 'retired routine', prompt: 'Create animation', schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' }, target: { mode: 'create_each_run' }, skillId: 'hyperframes' };
    expect((await post('/api/routines', body)).status).toBe(410);
    const now = Date.now();
    insertRoutine(database(), { id: 'retired-existing-routine', name: body.name, prompt: body.prompt, scheduleKind: 'daily', scheduleValue: '09:00', scheduleJson: JSON.stringify(body.schedule), projectMode: 'create_each_run', skillId: body.skillId, agentId: 'codex', contextJson: '{}', enabled: false, createdAt: now, updatedAt: now });
    const unchanged = await fetch(`${started.url}/api/routines/retired-existing-routine`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ skillId: body.skillId }) });
    expect(unchanged.status).toBe(200);
    const run = await post('/api/routines/retired-existing-routine/run', {});
    expect(run.status).toBe(500);
    expect(await run.text()).toContain('Motion');
    expect((await fetch(`${started.url}/api/routines/retired-existing-routine`)).status).toBe(200);
  });

  it('resolves a same-ID personal Skill from a routine explicit Workspace scope', async () => {
    const directory = path.join(process.env.OD_DATA_DIR!, 'skills', 'video-hyperframes');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'SKILL.md'), '---\nname: video-hyperframes\ndescription: My own animation helper.\n---\nUse my custom workflow.\n');
    const workspaceId = 'retired-same-id-workspace';
    const workspaceMemberId = 'retired-same-id-member';
    ensureWorkspaceResource(database(), 'skill', workspaceId, 'video-hyperframes', { visibility: 'personal', resourceState: 'active', createdByWorkspaceMemberId: workspaceMemberId });
    try {
      const response = await fetch(`${started.url}/api/routines`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-od-workspace-id': workspaceId, 'x-od-workspace-member-id': workspaceMemberId }, body: JSON.stringify({ name: 'my own routine', prompt: 'Use my helper', enabled: false, schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' }, target: { mode: 'create_each_run' }, skillId: 'video-hyperframes', context: { workspaceScope: { workspaceId, workspaceMemberId } } }) });
      expect(response.status).toBe(201);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('filters official marketplace manifests and rejects named or direct official installs', async () => {
    const response = await fetch(`${started.url}/api/marketplaces/official`);
    const detail = await response.json() as { manifest: { plugins: { name: string }[] } };
    expect(detail.manifest.plugins.some((entry) => entry.name === 'open-design/example-hyperframes')).toBe(false);
    expect(detail.manifest.plugins.some((entry) => entry.name === 'open-design/video-template-frame-product-promo')).toBe(true);
    const plugins = await (await fetch(`${started.url}/api/marketplaces/official/plugins`)).json() as { plugins: { name: string }[] };
    expect(plugins.plugins.some((entry) => entry.name === 'open-design/example-hyperframes')).toBe(false);
    for (const source of ['open-design/example-hyperframes', 'github:nexu-io/open-design@main/plugins/_official/examples/hyperframes']) {
      const install = await post('/api/plugins/install', { source });
      expect(install.status).toBe(410);
      expect(await install.text()).toContain('Motion');
    }
  });

  it('does not mistake third-party snapshot paths containing _official for bundled provenance', () => {
    const root = path.resolve(import.meta.dirname, '../../../plugins/_official');
    for (const source of ['https://third-party.example/plugins/_official/examples/hyperframes', path.join(os.tmpdir(), 'third-party/plugins/_official/examples/hyperframes')]) {
      expect(isRetiredOfficialSnapshot({ pluginId: 'example-hyperframes', resolvedSource: source }, root)).toBe(false);
    }
    expect(isRetiredOfficialSnapshot({ pluginId: 'example-hyperframes' }, root)).toBe(true);
    expect(isRetiredOfficialSnapshot({ pluginId: 'example-hyperframes', resolvedSource: 'github:nexu-io/open-design/plugins/_official/examples/hyperframes' }, root)).toBe(true);
  });
});

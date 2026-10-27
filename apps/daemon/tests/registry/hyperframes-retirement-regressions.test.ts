import path from 'node:path';
import os from 'node:os';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, getProject, getRoutine, insertProject, insertRoutine, openDatabase } from '../../src/db.js';
import { resolvePluginFolder, upsertInstalledPlugin } from '../../src/plugins/registry.js';
import { resolvePluginSnapshot } from '../../src/plugins/resolve-snapshot.js';
import { hasRetiredRoutineSkillSelection, persistedRoutinePluginIdsForTarget } from '../../src/registry/hyperframes-retirement.js';

afterEach(() => { closeDatabase(); vi.restoreAllMocks(); });

describe('retirement preserves unrelated and historical backend behavior', () => {
  it.each(['local', 'relative-local', 'github'] as const)('retains the real %s apply source when a same-ID third-party snapshot is reused', async (sourceKind) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-retirement-source-'));
    try {
      const folder = path.join(root, 'third-party');
      await mkdir(folder);
      await writeFile(path.join(folder, 'open-design.json'), JSON.stringify({ name: 'example-hyperframes', title: 'Third-party animation', version: '1.0.0', description: 'A user-installed workflow.', od: { kind: 'skill', capabilities: ['prompt:inject'] } }));
      const source = sourceKind === 'github' ? 'github:third-party/animations@main' : sourceKind === 'relative-local' ? path.relative(process.cwd(), folder) : folder;
      const expectedSource = sourceKind === 'github' ? source : path.resolve(source);
      const parsed = await resolvePluginFolder({ folder, folderId: 'example-hyperframes', sourceKind: sourceKind === 'github' ? 'github' : 'local', source, trust: 'trusted' });
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
      expect(parsed.record.resolvedSource).toBeUndefined();
      const db = openDatabase(path.join(root, 'projects'), { dataDir: root });
      const now = Date.now();
      for (const id of ['source-project', 'new-project']) insertProject(db, { id, name: id, createdAt: now, updatedAt: now });
      upsertInstalledPlugin(db, parsed.record);
      const registry = { skills: [], designSystems: [], craft: [], atoms: [], scenarios: [] };
      const applied = resolvePluginSnapshot({ db, projectId: 'source-project', body: { pluginId: parsed.record.id }, registry });
      expect(applied?.ok).toBe(true);
      if (!applied?.ok) throw new Error('real plugin apply failed');
      expect.soft(applied.snapshot.resolvedSource).toBe(expectedSource);
      const reused = resolvePluginSnapshot({ db, projectId: 'new-project', body: { appliedPluginSnapshotId: applied.snapshotId }, registry });
      expect(reused?.ok).toBe(true);
    } finally { closeDatabase(); await rm(root, { recursive: true, force: true }); }
  });

  it('keeps the shared runner preflight scan-free and honors only persisted routine or project bindings', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-retirement-routine-'));
    try {
      const db = openDatabase(path.join(root, 'projects'), { dataDir: root });
      const now = Date.now();
      for (const [id, skillId] of [['legacy-target', null], ['other-target', null], ['bound-target', 'hyperframes']] as const) insertProject(db, { id, name: id, skillId, createdAt: now, updatedAt: now });
      const officialRoot = path.join(root, 'official-skills');
      const catalog = [{ id: 'hyperframes', dir: path.join(officialRoot, 'hyperframes') }, { id: 'video-hyperframes', dir: path.join(officialRoot, 'video-hyperframes') }];
      const check = (ids: string[], projectId: string | null, routineId?: string) => {
        const resolve = vi.fn(async () => ({ catalog, projectSkillId: projectId ? getProject(db, projectId)?.skillId : null, persistedRoutine: routineId ? getRoutine(db, routineId) : null }));
        const result = hasRetiredRoutineSkillSelection({ ids, target: projectId ? { mode: 'reuse', projectId } : { mode: 'create_each_run' }, execution: true, officialRoots: [officialRoot], resolve });
        return { resolve, result };
      };
      for (const ids of [[], ['ordinary-helper']]) {
        const attempt = check(ids, 'legacy-target');
        expect(await attempt.result).toBe(false);
        expect(attempt.resolve).not.toHaveBeenCalled();
      }
      for (const [id, skillId, context] of [['legacy-primary', 'hyperframes', {}], ['legacy-context', null, { skillIds: ['hyperframes'] }]] as const) {
        insertRoutine(db, { id, name: id, prompt: 'Edit existing source', scheduleKind: 'daily', scheduleValue: '09:00', scheduleJson: '{}', projectMode: 'reuse', projectId: 'legacy-target', skillId, agentId: 'codex', contextJson: JSON.stringify(context), enabled: false, createdAt: now, updatedAt: now });
        expect(await check(['hyperframes'], 'legacy-target', id).result).toBe(false);
        expect(await check(['hyperframes'], 'other-target', id).result).toBe(true);
        expect(await check(['hyperframes', 'video-hyperframes'], 'legacy-target', id).result).toBe(true);
        expect(await check(['hyperframes'], null, id).result).toBe(true);
      }
      expect(await check(['hyperframes'], 'bound-target').result).toBe(false);
      expect(await check(['hyperframes'], 'legacy-target').result).toBe(true);
      const row = { projectMode: 'reuse', projectId: 'legacy-target', contextJson: JSON.stringify({ pluginIds: ['example-hyperframes'] }) };
      expect(persistedRoutinePluginIdsForTarget({ mode: 'reuse', projectId: 'legacy-target' }, row)).toEqual(['example-hyperframes']);
      expect(persistedRoutinePluginIdsForTarget({ mode: 'reuse', projectId: 'other-target' }, row)).toEqual([]);
      expect(persistedRoutinePluginIdsForTarget({ mode: 'create_each_run' }, row)).toEqual([]);
    } finally { closeDatabase(); await rm(root, { recursive: true, force: true }); }
  });

  it('rechecks a daemon-only historical routine plugin proof against the persisted target', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-retirement-routine-plugin-'));
    try {
      await writeFile(path.join(root, 'open-design.json'), JSON.stringify({ name: 'example-hyperframes', title: 'Legacy', version: '1.0.0', od: { kind: 'skill' } }));
      const plugin = await resolvePluginFolder({ folder: root, folderId: 'example-hyperframes', sourceKind: 'bundled', source: root, trust: 'bundled' });
      if (!plugin.ok) throw new Error(plugin.errors.join('\n'));
      const db = openDatabase(path.join(root, 'projects'), { dataDir: root });
      const now = Date.now();
      for (const id of ['original', 'unrelated']) insertProject(db, { id, name: id, createdAt: now, updatedAt: now });
      upsertInstalledPlugin(db, plugin.record);
      insertRoutine(db, { id: 'legacy-plugin', name: 'Legacy routine', prompt: 'Edit source', scheduleKind: 'daily', scheduleValue: '09:00', scheduleJson: '{}', projectMode: 'reuse', projectId: 'original', skillId: null, contextJson: JSON.stringify({ pluginIds: [plugin.record.id] }), enabled: false, createdAt: now, updatedAt: now });
      const registry = { skills: [], designSystems: [], craft: [], atoms: [] };
      const forgedBody = resolvePluginSnapshot({ db, projectId: 'original', body: { pluginId: plugin.record.id, historicalRoutineId: 'legacy-plugin' }, registry, requireSnapshotProjectMatch: true });
      expect(forgedBody?.ok).toBe(false);
      const wrongTarget = resolvePluginSnapshot({ db, projectId: 'unrelated', body: { pluginId: plugin.record.id }, registry, historicalRoutineId: 'legacy-plugin', requireSnapshotProjectMatch: true });
      expect(wrongTarget?.ok).toBe(false);
      const historical = resolvePluginSnapshot({ db, projectId: 'original', body: { pluginId: plugin.record.id }, registry, historicalRoutineId: 'legacy-plugin', requireSnapshotProjectMatch: true });
      expect(historical?.ok).toBe(true);
    } finally { closeDatabase(); await rm(root, { recursive: true, force: true }); }
  });
});

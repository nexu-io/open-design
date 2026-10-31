import { cp, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DELIVERABLE_SKILLS, type AppliedPluginSnapshot } from '@open-design/contracts';
import { resolvePluginFolder } from '../src/plugins/registry.js';
import { createBundledStrategyBindingV2, loadBundledStrategyPromptAssetsV2 } from '../src/plugins/strategy-package.js';
import { resolveChatExtraAllowedDirs } from '../src/runtimes/chat-prompt-inputs.js';
import { loadOdNextTaskAssetsForSnapshot } from '../src/strategies/od-next/device-frames.js';
import { buildOpenCodeMcpConfigContent } from '../src/mcp-config.js';

const SOURCE = path.resolve(import.meta.dirname, '../../../plugins/_official/scenarios/od-next-strategy');
let tmp: string;
let folder: string;
let snapshot: Pick<AppliedPluginSnapshot, 'pluginId' | 'strategy'>;

beforeAll(async () => {
  tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'od-strategy-permissions-')));
  folder = path.join(tmp, 'Open Design.app/Contents/Resources/plugins/scenarios/od-next-strategy');
  await cp(SOURCE, folder, { recursive: true });
  const resolved = await resolvePluginFolder({ folder, folderId: 'od-next-strategy', sourceKind: 'bundled', source: folder, trust: 'bundled' });
  if (!resolved.ok) throw new Error(resolved.errors.join('; '));
  snapshot = { pluginId: resolved.record.id, strategy: createBundledStrategyBindingV2({ plugin: resolved.record, taskType: 'discovery' }) };
});

afterAll(async () => { await rm(tmp, { recursive: true, force: true }); });

describe('bundled strategy resource directory access', () => {
  it.each(['opencode', 'byok-opencode'])('authorizes the exact directory advertised by Discovery for %s without permission bypass or MCP', async (agentId) => {
    const resolved = await resolvePluginFolder({ folder, folderId: 'od-next-strategy', sourceKind: 'bundled', source: folder, trust: 'bundled' });
    if (!resolved.ok) throw new Error(resolved.errors.join('; '));
    const assets = loadBundledStrategyPromptAssetsV2({ plugin: resolved.record, binding: snapshot.strategy! });
    const root = path.join(folder, 'assets/task-profiles');
    const directories = resolveChatExtraAllowedDirs({ agentId, strategyResourceDirs: [root] });
    const config = JSON.parse(buildOpenCodeMcpConfigContent([], {}, { allowedDirectories: directories }) ?? '{}');
    for (const skill of DELIVERABLE_SKILLS) {
      expect(assets.taskSkill).toContain(path.join(root, `${skill.id}.md`));
    }
    // OpenCode asks external_directory using the file's parent + "/*".
    expect(config.permission?.external_directory?.[path.join(root, '*')]).toBe('allow');
    expect(Object.keys(config.permission.external_directory).sort()).toEqual([root, path.join(root, '*'), path.join(root, '**')].sort());
    expect(assets.taskProfileRoot).toBe(root);
    expect(config.mcp).toBeUndefined();
    expect(config.permission.read).toBeUndefined();
    expect(config.permission.edit).toBeUndefined();
    expect(config.permission.external_directory[path.join(tmp, '*')]).toBeUndefined();
  });

  it.each(['discovery', 'motion-design', 'prototype'] as const)('loads %s access from the verified applied package, independent of prompt composition', async (taskType) => {
    const resolved = await resolvePluginFolder({ folder, folderId: 'od-next-strategy', sourceKind: 'bundled', source: folder, trust: 'bundled' });
    if (!resolved.ok) throw new Error(resolved.errors.join('; '));
    const binding = createBundledStrategyBindingV2({ plugin: resolved.record, taskType });
    const assets = await loadOdNextTaskAssetsForSnapshot({
      bundledPluginsDir: path.resolve(folder, '../..'),
      snapshot: { pluginId: 'od-next-strategy', strategy: binding },
    });
    expect(assets.taskProfileRoot).toBe(path.join(folder, 'assets/task-profiles'));
    expect(assets.resources).toEqual(expect.any(Array));
    const dirs = resolveChatExtraAllowedDirs({ agentId: 'byok-opencode', strategyResourceDirs: [assets.taskProfileRoot] });
    const config = JSON.parse(buildOpenCodeMcpConfigContent([], {}, { allowedDirectories: dirs }) ?? '{}');
    expect(config.permission.external_directory[path.join(assets.taskProfileRoot!, '*')]).toBe('allow');
  });

  it('returns no resource root for a non-strategy snapshot', async () => {
    expect(await loadOdNextTaskAssetsForSnapshot({ bundledPluginsDir: tmp, snapshot: null }))
      .toEqual({ taskProfileRoot: null, resources: [] });
    expect(await loadOdNextTaskAssetsForSnapshot({ bundledPluginsDir: tmp, snapshot: { pluginId: 'untrusted-plugin', strategy: snapshot.strategy } }))
      .toEqual({ taskProfileRoot: null, resources: [] });
  });

  it('rejects package drift before returning any directory grant', async () => {
    const bundledRoot = path.join(tmp, 'drifted-plugins');
    const copiedFolder = path.join(bundledRoot, 'scenarios/od-next-strategy');
    await cp(folder, copiedFolder, { recursive: true });
    await writeFile(path.join(copiedFolder, 'assets/core-system-prompt.md'), 'changed after snapshot');
    await expect(loadOdNextTaskAssetsForSnapshot({ bundledPluginsDir: bundledRoot, snapshot }))
      .rejects.toThrow(/no longer matches/i);
  });

  it('does not grant shipped resource directories to Codex', () => {
    expect(resolveChatExtraAllowedDirs({ agentId: 'codex', strategyResourceDirs: [path.join(folder, 'assets/task-profiles')] })).toEqual([]);
  });

  it('leaves ordinary tasks without a strategy resource grant', () => {
    expect(resolveChatExtraAllowedDirs({ agentId: 'byok-opencode' })).toEqual([]);
  });
});

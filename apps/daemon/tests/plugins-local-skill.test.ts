// Stage A of plugin-driven-flow-plan — plugin-local SKILL.md flow.
//
// Covers:
//   - `pickFirstSkillId` returns undefined for local `./SKILL.md` refs
//     (so the project record never stores a phantom skill id).
//   - `pickFirstLocalSkillPath` exposes the local path for the daemon's
//     prompt composer to read on demand.
//   - `loadPluginLocalSkill` reads the file, strips frontmatter and
//     produces the `{ body, name, dir }` shape the composer drops into
//     the `## Active skill` slot.

import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
  applyPlugin,
  pickFirstLocalSkillPath,
} from '../src/plugins/apply.js';
import { loadPluginLocalSkill } from '../src/plugins/local-skill.js';
import type { InstalledPluginRecord, PluginManifest } from '@open-design/contracts';

function manifestWithSkills(skills: Array<{ ref?: string; path?: string }>): PluginManifest {
  return {
    name: 'fixture-plugin',
    title: 'Fixture Plugin',
    version: '0.1.0',
    description: 'Stage A test fixture.',
    od: {
      kind: 'scenario',
      taskKind: 'new-generation',
      useCase: { query: 'Generate a {{topic}} brief.' },
      inputs: [{ name: 'topic', type: 'string', required: false, default: 'design' }],
      context: { skills },
      capabilities: ['prompt:inject'],
    },
  };
}

function pluginRecord(fsPath: string, manifest: PluginManifest): InstalledPluginRecord {
  return {
    id: 'fixture-plugin',
    title: 'Fixture Plugin',
    version: '0.1.0',
    sourceKind: 'local',
    source: fsPath,
    sourceMarketplaceId: undefined,
    pinnedRef: undefined,
    sourceDigest: undefined,
    trust: 'trusted',
    capabilitiesGranted: ['prompt:inject'],
    fsPath,
    installedAt: 0,
    updatedAt: 0,
    manifest,
  };
}

const REGISTRY = {
  skills: [{ id: 'sample-skill', title: 'Sample Skill' }],
  designSystems: [],
  craft: [],
  atoms: [],
};

describe('plugin-local SKILL.md ref detection', () => {
  it('pickFirstLocalSkillPath returns the relative path for `./SKILL.md`', () => {
    const manifest = manifestWithSkills([{ path: './SKILL.md' }]);
    expect(pickFirstLocalSkillPath(manifest)).toBe('./SKILL.md');
  });

  it('pickFirstLocalSkillPath ignores `ref` entries (those are global skill ids)', () => {
    const manifest = manifestWithSkills([{ ref: 'sample-skill' }]);
    expect(pickFirstLocalSkillPath(manifest)).toBeUndefined();
  });

  it('apply does not leak `./SKILL.md` into projectMetadata.skillId', () => {
    const manifest = manifestWithSkills([{ path: './SKILL.md' }]);
    const computed = applyPlugin({
      plugin: pluginRecord('/tmp/does-not-need-to-exist', manifest),
      inputs: { topic: 'design' },
      registry: REGISTRY,
    });
    // A local skill ref is plugin-private and must never set the
    // project's skill id; otherwise `findSkillById` later returns null
    // and the active-skill block silently drops out.
    expect(computed.result.projectMetadata.skillId).toBeUndefined();
  });

  it('apply keeps the global `ref` skill id flowing through to projectMetadata', () => {
    const manifest = manifestWithSkills([{ ref: 'sample-skill' }]);
    const computed = applyPlugin({
      plugin: pluginRecord('/tmp/does-not-need-to-exist', manifest),
      inputs: { topic: 'design' },
      registry: REGISTRY,
    });
    expect(computed.result.projectMetadata.skillId).toBe('sample-skill');
  });
});

describe('loadPluginLocalSkill', () => {
  it('reads SKILL.md, strips frontmatter, and returns body/name/dir', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'od-plugin-local-skill-'));
    try {
      const skillPath = path.join(dir, 'SKILL.md');
      await writeFile(
        skillPath,
        ['---', 'name: fixture-plugin', 'mode: deck', '---', '', '# Body header', '', 'Body line.'].join('\n'),
        'utf8',
      );
      const manifest = manifestWithSkills([{ path: './SKILL.md' }]);
      const local = await loadPluginLocalSkill(pluginRecord(dir, manifest));
      expect(local).not.toBeNull();
      expect(local!.body.startsWith('# Body header')).toBe(true);
      expect(local!.body).toContain('Body line.');
      expect(local!.name).toBe('Fixture Plugin');
      expect(local!.dir).toBe(dir);
      expect(local!.relpath).toBe('SKILL.md');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns null when the manifest has no local skill ref', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'od-plugin-local-skill-'));
    try {
      const manifest = manifestWithSkills([{ ref: 'sample-skill' }]);
      const local = await loadPluginLocalSkill(pluginRecord(dir, manifest));
      expect(local).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns null when the referenced file is missing', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'od-plugin-local-skill-'));
    try {
      const manifest = manifestWithSkills([{ path: './SKILL.md' }]);
      const local = await loadPluginLocalSkill(pluginRecord(dir, manifest));
      expect(local).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses `..` path traversal in the ref', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'od-plugin-local-skill-'));
    try {
      // Create a SKILL.md outside the plugin folder and try to point at it.
      const escapeRoot = await mkdtemp(path.join(os.tmpdir(), 'od-plugin-escape-'));
      await writeFile(path.join(escapeRoot, 'SKILL.md'), '# bad', 'utf8');
      const pluginDir = path.join(dir, 'plugin');
      await mkdir(pluginDir, { recursive: true });
      const manifest = manifestWithSkills([
        { path: '../SKILL.md' },
      ]);
      const local = await loadPluginLocalSkill(pluginRecord(pluginDir, manifest));
      expect(local).toBeNull();
      await rm(escapeRoot, { recursive: true, force: true });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

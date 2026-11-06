// Phase 4 / spec §14 — `od plugin export <projectId> --as <target>`.
//
// Materialises a publish-ready folder from the AppliedPluginSnapshot
// the project was created against. The exporter does NOT modify the
// source plugin; it freezes the snapshot's view (manifest source
// digest, inputs, resolved context) into a new directory the author
// can re-publish to anthropics/skills, awesome-agent-skills, clawhub,
// or skills.sh. Three targets:
//
//   - `od`            → SKILL.md + open-design.json (canonical OD shape).
//   - `claude-plugin` → SKILL.md + .claude-plugin/plugin.json (Claude
//                       Code listing format).
//   - `agent-skill`   → SKILL.md only (every catalog accepts this).
//
// The export is best-effort: it pulls SKILL.md straight off the
// installed plugin's fs_path, and reconstructs open-design.json from
// the cached `manifest_json` so a publishable snapshot is reproducible
// even after an `od plugin update` rotates the live source.

import path from 'node:path';
import { promises as fsp } from 'node:fs';
import type Database from 'better-sqlite3';
import type { AppliedPluginSnapshot } from '@open-design/contracts';
import { getInstalledPlugin } from './registry.js';
import { getSnapshot } from './snapshots.js';

type SqliteDb = Database.Database;

export type ExportTarget = 'od' | 'claude-plugin' | 'agent-skill';

export interface ExportInput {
  db: SqliteDb;
  // Either pass a snapshot id directly (recommended; lets a code agent
  // export the exact view that produced a particular run), or pass a
  // project id and the most-recent snapshot row is used.
  snapshotId?: string;
  projectId?: string;
  target: ExportTarget;
  outDir: string;
}

export interface ExportResult {
  folder: string;
  files: string[];
  snapshotId: string;
}

export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportError';
  }
}

export async function exportPlugin(input: ExportInput): Promise<ExportResult> {
  const snapshot = pickSnapshot(input);
  if (!snapshot) {
    throw new ExportError(
      input.snapshotId
        ? `snapshot ${input.snapshotId} not found`
        : `no snapshot found for project ${input.projectId}`,
    );
  }
  const plugin = getInstalledPlugin(input.db, snapshot.pluginId);
  // It's legal to export a snapshot whose plugin has since been
  // uninstalled — we fall back to the snapshot's frozen manifest
  // metadata. The .fs_path / SKILL.md copy is best-effort in that
  // case (skip on miss).
  const folder = path.join(input.outDir, snapshot.pluginId);
  await fsp.mkdir(folder, { recursive: true });
  const written: string[] = [];

  // SKILL.md — copy from the installed plugin if available, otherwise
  // synthesize from the snapshot's plugin title + description.
  const skillBody = await readSkillBody(plugin?.fsPath, snapshot);
  if (input.target !== 'od') {
    const skillPath = path.join(folder, 'SKILL.md');
    await fsp.writeFile(skillPath, skillBody, 'utf8');
    written.push(skillPath);
  } else {
    // 'od' target: still ship SKILL.md as the portable anchor (per
    // spec §3 the canonical floor).
    const skillPath = path.join(folder, 'SKILL.md');
    await fsp.writeFile(skillPath, skillBody, 'utf8');
    written.push(skillPath);
  }

  if (input.target === 'od') {
    const manifest = buildPortableManifest(snapshot);
    const manifestPath = path.join(folder, 'open-design.json');
    await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    written.push(manifestPath);
  }

  if (input.target === 'claude-plugin') {
    const cpDir = path.join(folder, '.claude-plugin');
    await fsp.mkdir(cpDir, { recursive: true });
    const cp = {
      name:        snapshot.pluginId,
      description: snapshot.pluginDescription ?? '',
      version:     snapshot.pluginVersion,
    };
    const cpPath = path.join(cpDir, 'plugin.json');
    await fsp.writeFile(cpPath, JSON.stringify(cp, null, 2) + '\n', 'utf8');
    written.push(cpPath);
  }

  // Always ship a small README that records the source snapshot id
  // and digest. This is the audit trail for "which version of the
  // plugin produced this folder" — exactly the contract spec §8.2.1
  // expects from a replay.
  const readme = [
    `# ${snapshot.pluginTitle ?? snapshot.pluginId}`,
    '',
    snapshot.pluginDescription ?? '',
    '',
    '## Provenance',
    '',
    `- Snapshot id: \`${snapshot.snapshotId}\``,
    `- Plugin version: \`${snapshot.pluginVersion}\``,
    `- Manifest digest: \`${snapshot.manifestSourceDigest}\``,
    `- Task kind: \`${snapshot.taskKind}\``,
    '',
    'This folder was produced by `od plugin export`.',
    '',
  ].join('\n');
  const readmePath = path.join(folder, 'README.md');
  await fsp.writeFile(readmePath, readme, 'utf8');
  written.push(readmePath);

  return { folder, files: written, snapshotId: snapshot.snapshotId };
}

function pickSnapshot(input: ExportInput): AppliedPluginSnapshot | null {
  if (input.snapshotId) {
    return getSnapshot(input.db, input.snapshotId);
  }
  if (input.projectId) {
    const row = input.db
      .prepare(`SELECT id FROM applied_plugin_snapshots WHERE project_id = ? ORDER BY applied_at DESC LIMIT 1`)
      .get(input.projectId) as { id?: string } | undefined;
    if (!row?.id) return null;
    return getSnapshot(input.db, row.id);
  }
  return null;
}

async function readSkillBody(
  fsPath: string | undefined,
  snapshot: AppliedPluginSnapshot,
): Promise<string> {
  if (fsPath) {
    try {
      return await fsp.readFile(path.join(fsPath, 'SKILL.md'), 'utf8');
    } catch {
      // fall through to synthesis
    }
  }
  return [
    '---',
    `name: ${snapshot.pluginId}`,
    `description: ${snapshot.pluginDescription ?? snapshot.pluginTitle ?? snapshot.pluginId}`,
    `od:`,
    `  scenario: general`,
    '---',
    '',
    `# ${snapshot.pluginTitle ?? snapshot.pluginId}`,
    '',
    snapshot.pluginDescription ?? '',
    '',
    `Snapshot id: ${snapshot.snapshotId}`,
    `Manifest digest: ${snapshot.manifestSourceDigest}`,
    '',
  ].join('\n');
}

function buildPortableManifest(snapshot: AppliedPluginSnapshot): Record<string, unknown> {
  return {
    $schema:     'https://open-design.ai/schemas/plugin.v1.json',
    specVersion: snapshot.pluginSpecVersion ?? '1.0.0',
    name:        snapshot.pluginId,
    title:       snapshot.pluginTitle ?? snapshot.pluginId,
    version:     snapshot.pluginVersion,
    description: snapshot.pluginDescription ?? '',
    license:     'MIT',
    od: {
      kind:     'skill',
      taskKind: snapshot.taskKind,
      ...(snapshot.query ? { useCase: { query: snapshot.query } } : {}),
      context:  {
        ...(snapshot.resolvedContext.items.length > 0
          ? { atoms: snapshot.resolvedContext.items.filter((i) => i.kind === 'atom').map((i) => (i as { id: string }).id) }
          : {}),
      },
      capabilities: snapshot.capabilitiesGranted,
      ...(snapshot.pipeline ? { pipeline: snapshot.pipeline } : {}),
    },
    provenance: {
      snapshotId:           snapshot.snapshotId,
      manifestSourceDigest: snapshot.manifestSourceDigest,
      appliedAt:            snapshot.appliedAt,
    },
  };
}

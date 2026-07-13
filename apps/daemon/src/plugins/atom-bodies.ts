// Phase 4 / spec §23.3.2 patch 2 — atom SKILL.md body loader.
//
// `composeSystemPrompt()` today inlines every atom's prompt fragment as
// a TypeScript string constant in `apps/daemon/src/prompts/system.ts`.
// Spec §23 wants those constants migrated into the matching
// `plugins/_official/atoms/<atom>/SKILL.md` so the prompt becomes
// data-driven (the same registry path third-party plugins use).
//
// This module is the substrate slice. It owns the bundled-atom →
// SKILL.md resolution; the actual `composeSystemPrompt` rewiring is the
// next PR (spec §23.4 sketch). Today the helper is consumed by the
// pipeline runner's stage-entry block via the renderer in
// `packages/contracts/src/prompts/atom-block.ts`.

import path from 'node:path';
import { promises as fsp } from 'node:fs';
import type Database from 'better-sqlite3';
import { getInstalledPlugin } from './registry.js';

type SqliteDb = Database.Database;

export interface AtomBodyEntry {
  atomId: string;
  pluginId: string;
  // Trimmed SKILL.md body (frontmatter stripped). Empty when the
  // bundled plugin's SKILL.md is missing or unreadable; the caller
  // should drop empty entries from the prompt block.
  body: string;
}

// Load SKILL.md bodies for every requested atom id. Looks each id up
// in `installed_plugins` (source_kind='bundled' wins; falls back to
// any installed plugin with the same id), then reads `fs_path/SKILL.md`.
// Front-matter (`---\n…\n---`) is stripped so the body slot is ready to
// concatenate into the system prompt.
export async function loadAtomBodies(
  db: SqliteDb,
  atomIds: ReadonlyArray<string>,
): Promise<AtomBodyEntry[]> {
  const out: AtomBodyEntry[] = [];
  for (const id of atomIds) {
    const slug = id.toLowerCase();
    const plugin = preferBundledPlugin(db, slug);
    if (!plugin) continue;
    let raw: string;
    try {
      raw = await fsp.readFile(path.join(plugin.fsPath, 'SKILL.md'), 'utf8');
    } catch {
      continue;
    }
    const body = stripFrontmatter(raw).trim();
    if (!body) continue;
    out.push({ atomId: slug, pluginId: plugin.id, body });
  }
  return out;
}

function preferBundledPlugin(db: SqliteDb, id: string) {
  // Look first for a bundled record with the requested id.
  const bundled = db
    .prepare(`SELECT id FROM installed_plugins WHERE id = ? AND source_kind = 'bundled' LIMIT 1`)
    .get(id) as { id?: string } | undefined;
  if (bundled?.id) {
    return getInstalledPlugin(db, bundled.id);
  }
  return getInstalledPlugin(db, id);
}

// Strip the leading YAML/TOML-style frontmatter block. Any plugin
// SKILL.md that follows the spec §11.3 / skills-protocol.md shape
// starts with `---\n…\n---\n`. We only need the body; the frontmatter
// fields are already projected into `installed_plugins.manifest_json`.
function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---')) return raw;
  const closeIdx = raw.indexOf('\n---', 3);
  if (closeIdx === -1) return raw;
  // Skip past the closing `\n---` and any trailing newline.
  const after = raw.slice(closeIdx + 4);
  return after.replace(/^\r?\n/, '');
}

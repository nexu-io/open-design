// Wrap a `design-systems/<id>/DESIGN.md` as a bundled plugin under
// `plugins/_official/design-systems/<id>/`. The user-facing query is
// kept deliberately open: a design-system plugin describes "house
// style", so the user supplies the artifact kind + brief on apply
// and the agent reproduces the brand language faithfully via the
// embedded DESIGN.md.

import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import {
  DESIGN_SYSTEMS_DIR,
  PLUGINS_ROOT,
  TIER_DESIGN_SYSTEMS,
  buildManifest,
  copyFile,
  dedupeTags,
  pathExists,
  pluginName,
  writeManifest,
  type RunStats,
} from './lib.ts';

export interface DesignSystemGeneratorOptions {
  ids?: string[];
  limit?: number;
  dryRun?: boolean;
}

export async function runDesignSystemGenerator(
  opts: DesignSystemGeneratorOptions,
): Promise<RunStats> {
  const stats: RunStats = { generated: [], skipped: [] };
  let entries;
  try {
    entries = await readdir(DESIGN_SYSTEMS_DIR, { withFileTypes: true });
  } catch {
    return stats;
  }
  const folders = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((n) => !opts.ids || opts.ids.includes(n))
    .sort();
  const slice = opts.limit !== undefined ? folders.slice(0, opts.limit) : folders;

  for (const id of slice) {
    const srcFolder = path.join(DESIGN_SYSTEMS_DIR, id);
    const designPath = path.join(srcFolder, 'DESIGN.md');
    if (!(await pathExists(designPath))) {
      stats.skipped.push({ id, reason: 'missing DESIGN.md' });
      continue;
    }
    const raw = await readFile(designPath, 'utf8');
    const { title, category, summary } = extractMeta(raw, id);

    const name = pluginName('design-system', id);
    const folder = path.join(PLUGINS_ROOT, TIER_DESIGN_SYSTEMS, id);

    const manifest = buildManifest({
      name,
      title,
      description: summary,
      license: 'MIT',
      tags: dedupeTags([
        'design-system',
        'first-party',
        'design',
        category,
      ]),
      od: {
        kind: 'scenario',
        taskKind: 'new-generation',
        mode: 'design-system',
        scenario: 'design',
        surface: 'web',
        useCase: {
          query:
            `Generate a {{artifactKind}} using the ${title} design system. ` +
            `Stay faithful to its colour palette, typography, spacing, ` +
            `iconography, and component vocabulary as documented in DESIGN.md.`,
        },
        inputs: [
          {
            name: 'artifactKind',
            label: 'Artifact kind',
            type: 'select',
            options: ['landing page', 'dashboard', 'marketing site', 'app screen'],
            default: 'landing page',
          },
          {
            name: 'brief',
            label: 'Brief',
            type: 'text',
            placeholder: 'What should the page communicate?',
          },
        ],
        context: {
          designSystem: { ref: id, primary: true },
          assets: ['./DESIGN.md'],
        },
        pipeline: {
          stages: [{ id: 'generate', atoms: ['file-write', 'live-artifact'] }],
        },
        capabilities: ['prompt:inject', 'fs:write'],
      },
    });

    if (opts.dryRun) {
      stats.generated.push(id);
      continue;
    }
    await writeManifest(folder, manifest);
    await copyFile(designPath, path.join(folder, 'DESIGN.md'));
    stats.generated.push(id);
  }
  return stats;
}

interface ExtractedMeta { title: string; category: string; summary: string; }

function extractMeta(raw: string, fallbackId: string): ExtractedMeta {
  const titleMatch = /^#\s+(.+?)\s*$/m.exec(raw);
  const title = cleanTitle(titleMatch?.[1] ?? humanize(fallbackId));
  const categoryMatch = /^>\s*Category:\s*(.+?)\s*$/im.exec(raw);
  const category = categoryMatch?.[1]?.trim() ?? 'design-systems';
  const lines = raw.split(/\r?\n/);
  const firstH1Idx = lines.findIndex((l) => /^#\s+/.test(l));
  let summary = '';
  if (firstH1Idx !== -1) {
    const rest = lines.slice(firstH1Idx + 1);
    const nextHeading = rest.findIndex((l) => /^#{1,6}\s+/.test(l));
    const window = (nextHeading === -1 ? rest : rest.slice(0, nextHeading))
      .join('\n')
      .replace(/^>\s*Category:.*$/gim, '')
      .replace(/^>\s*/gm, '')
      .trim();
    summary = window.split(/\n\n/)[0]?.slice(0, 240) ?? '';
  }
  return { title, category, summary };
}

function cleanTitle(raw: string): string {
  return raw.replace(/^Design System (Inspired by|for)\s+/i, '').trim();
}

function humanize(id: string): string {
  return id
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

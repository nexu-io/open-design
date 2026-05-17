// Wrap a `skills/<id>/` folder as a bundled plugin under
// `plugins/_official/examples/<id>/`. We copy SKILL.md + side files
// (example.html, assets/, references/) so the daemon's bundled walker
// has everything it needs without reaching outside the plugin folder
// (the registry only resolves SKILL.md / .claude-plugin / open-design.json
// inside the plugin root — see `apps/daemon/src/plugins/registry.ts`).

import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import {
  PLUGINS_ROOT,
  SKILLS_DIR,
  TIER_EXAMPLES,
  buildManifest,
  copyFile,
  dedupeTags,
  parseFrontmatter,
  pathExists,
  pluginName,
  writeManifest,
  type RunStats,
} from './lib.ts';

export interface ExampleGeneratorOptions {
  ids?: string[];
  limit?: number;
  dryRun?: boolean;
}

interface SkillFrontmatter {
  name?: string;
  zh_name?: string;
  en_name?: string;
  description?: string;
  triggers?: unknown[];
  tags?: unknown[];
  od?: {
    mode?: string;
    surface?: string;
    platform?: string;
    scenario?: string;
    example_prompt?: string;
    fidelity?: string;
    speaker_notes?: unknown;
    animations?: unknown;
    featured?: unknown;
    design_system?: { requires?: boolean };
    craft?: { requires?: string[] };
    preview?: { type?: string; entry?: string };
    inputs?: Array<Record<string, unknown>>;
  };
}

export async function runExampleGenerator(opts: ExampleGeneratorOptions): Promise<RunStats> {
  const stats: RunStats = { generated: [], skipped: [] };
  let entries;
  try {
    entries = await readdir(SKILLS_DIR, { withFileTypes: true });
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
    const srcFolder = path.join(SKILLS_DIR, id);
    const skillPath = path.join(srcFolder, 'SKILL.md');
    if (!(await pathExists(skillPath))) {
      stats.skipped.push({ id, reason: 'missing SKILL.md' });
      continue;
    }
    const raw = await readFile(skillPath, 'utf8');
    const { data } = parseFrontmatter(raw);
    const fm = data as SkillFrontmatter;
    const name = pluginName('example', id);
    const folder = path.join(PLUGINS_ROOT, TIER_EXAMPLES, id);
    const title = deriveTitle(fm, id);

    const mode = fm.od?.mode ?? 'prototype';
    const surface = fm.od?.surface ?? inferSurface(mode);
    const scenario = fm.od?.scenario ?? 'design';
    const platform = fm.od?.platform;
    const exampleFile = await sideFiles(srcFolder);
    const featured = normaliseFeatured(fm.od?.featured);
    // The plugin folder ships `example.html` (the baked output), not
    // the original `index.html` the skill renders into the project
    // working directory. Always point preview at the in-folder file
    // so the daemon's preview surface has something to render without
    // running the agent first.
    const previewEntry = exampleFile.hasExample ? 'example.html' : (fm.od?.preview?.entry ?? 'example.html');

    const manifest = buildManifest({
      name,
      title,
      description: typeof fm.description === 'string' ? fm.description.trim() : '',
      license: 'MIT',
      author: { name: 'Open Design', url: 'https://github.com/nexu-io' },
      homepage: `https://github.com/nexu-io/open-design/tree/main/plugins/_official/${TIER_EXAMPLES}/${id}`,
      tags: dedupeTags([
        'example',
        'first-party',
        mode,
        scenario,
        surface,
        platform,
        ...(Array.isArray(fm.tags) ? fm.tags.map(String) : []),
        ...(Array.isArray(fm.triggers) ? fm.triggers.map(String) : []),
      ]),
      compat: { agentSkills: [{ path: './SKILL.md' }] },
      od: {
        kind: 'scenario',
        taskKind: 'new-generation',
        mode,
        ...(platform ? { platform } : {}),
        scenario,
        surface,
        ...(featured !== undefined ? { featured } : {}),
        preview: { type: fm.od?.preview?.type ?? 'html', entry: `./${previewEntry}` },
        useCase: {
          query: derivePrompt(fm),
          ...(exampleFile.hasExample
            ? { exampleOutputs: [{ path: './example.html', title }] }
            : {}),
        },
        ...(Array.isArray(fm.od?.inputs) && fm.od.inputs.length > 0
          ? { inputs: fm.od.inputs.map(normaliseInput) }
          : {}),
        context: {
          skills: [{ path: './SKILL.md' }],
          ...(fm.od?.design_system?.requires !== false
            ? { designSystem: { primary: true } }
            : {}),
          ...(Array.isArray(fm.od?.craft?.requires) && fm.od.craft.requires.length > 0
            ? { craft: fm.od.craft.requires }
            : {}),
          assets: exampleFile.assets,
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
    await copyFile(skillPath, path.join(folder, 'SKILL.md'));
    for (const rel of exampleFile.assets) {
      const cleanRel = rel.replace(/^\.\//, '');
      const srcAsset = path.join(srcFolder, cleanRel);
      if (await pathExists(srcAsset)) {
        await copyFile(srcAsset, path.join(folder, cleanRel));
      }
    }
    stats.generated.push(id);
  }
  return stats;
}

function inferSurface(mode: string): string {
  if (mode === 'image' || mode === 'video' || mode === 'audio') return mode;
  return 'web';
}

function derivePrompt(fm: SkillFrontmatter): string {
  const explicit = fm.od?.example_prompt;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const desc = typeof fm.description === 'string' ? fm.description.trim() : '';
  if (!desc) return 'Produce the artifact described in this skill, following its workflow exactly.';
  const collapsed = desc.replace(/\s+/g, ' ').trim();
  return collapsed.slice(0, 320);
}

function normaliseFeatured(value: unknown): number | true | undefined {
  if (value === true) return true;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'true') return true;
    const n = Number(trimmed);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  return undefined;
}

function deriveTitle(fm: SkillFrontmatter, id: string): string {
  for (const value of [fm.zh_name, fm.en_name]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return humanize(id);
}

function humanize(id: string): string {
  return id
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// The plugin manifest schema only accepts a fixed set of input types
// (`string | text | select | number | boolean`), but the legacy
// SKILL.md frontmatter freely uses `integer`, `float`, etc. — fine
// for the agent-level renderer, rejected by the plugin parser. We
// coerce the long tail down to the closest supported type so the
// daemon can register the generated plugin without dropping the
// authored input list.
function normaliseInput(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  const type = typeof raw.type === 'string' ? raw.type.toLowerCase() : undefined;
  if (type === 'integer' || type === 'int' || type === 'float' || type === 'double') {
    out.type = 'number';
  } else if (type && !['string', 'text', 'select', 'number', 'boolean'].includes(type)) {
    out.type = 'string';
  }
  return out;
}

interface SideFileSummary { hasExample: boolean; assets: string[]; }

// Side files are everything the SKILL.md references — `example.html`,
// `assets/*`, `references/*`. We restrict to a small, well-known set so
// the generated plugin folder stays compact and predictable. A future
// patch can broaden the allowlist once we audit which file types the
// daemon's compose path actually needs.
async function sideFiles(srcFolder: string): Promise<SideFileSummary> {
  const out: string[] = [];
  let hasExample = false;
  for (const candidate of ['example.html']) {
    if (await pathExists(path.join(srcFolder, candidate))) {
      out.push(`./${candidate}`);
      if (candidate === 'example.html') hasExample = true;
    }
  }
  for (const dir of ['assets', 'references']) {
    const abs = path.join(srcFolder, dir);
    if (!(await pathExists(abs))) continue;
    let entries;
    try {
      entries = await readdir(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (!/\.(md|html|css|js|json|txt|svg|png|jpg|jpeg|webp)$/i.test(e.name)) continue;
      out.push(`./${dir}/${e.name}`);
    }
  }
  return { hasExample, assets: out };
}

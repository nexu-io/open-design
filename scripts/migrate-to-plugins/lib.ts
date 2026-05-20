// Shared helpers for the migrate-to-plugins generators. Each of the
// four source categories (image templates, video templates, examples,
// design-systems) needs the same primitives: a small YAML-frontmatter
// parser, slug/name builders, a manifest writer with stable key order,
// and a tag-normaliser so the daemon's plugin walker ingests every
// generated folder under the same metadata vocabulary.
//
// Keep this file dependency-free so the generators can run with plain
// `tsx scripts/migrate-to-plugins/main.ts` — no workspace package
// linking step required.

import { mkdir, writeFile, copyFile as fsCopyFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
export const PLUGINS_ROOT = path.join(REPO_ROOT, 'plugins', '_official');
export const SKILLS_DIR = path.join(REPO_ROOT, 'skills');
export const DESIGN_SYSTEMS_DIR = path.join(REPO_ROOT, 'design-systems');
export const PROMPT_TEMPLATES_DIR = path.join(REPO_ROOT, 'prompt-templates');

export const PLUGIN_SCHEMA = 'https://open-design.ai/schemas/plugin.v1.json';
export const PLUGIN_VERSION = '0.1.0';

// Generated plugin tiers; each maps to a subfolder under PLUGINS_ROOT.
// The daemon's bundled walker recurses one level beneath PLUGINS_ROOT,
// so adding a tier here is purely a data-only operation.
export const TIER_IMAGE_TEMPLATES = 'image-templates';
export const TIER_VIDEO_TEMPLATES = 'video-templates';
export const TIER_EXAMPLES = 'examples';
export const TIER_DESIGN_SYSTEMS = 'design-systems';

export type Frontmatter = Record<string, unknown>;

// Minimal YAML subset parser — supports scalars, nested mappings, and
// flow/block sequences. Mirrors the daemon's parser (`apps/daemon/src/
// frontmatter.ts`) at the precision required for our skill frontmatter.
export function parseFrontmatter(src: string): { data: Frontmatter; body: string } {
  const text = src.replace(/^\uFEFF/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return { data: {}, body: text };
  const yaml = match[1] ?? '';
  const body = match[2] ?? '';
  return { data: parseYamlSubset(yaml), body };
}

interface StackEntry { indent: number; container: Frontmatter | unknown[]; }

function parseYamlSubset(src: string): Frontmatter {
  const lines = src.split(/\r?\n/);
  const root: Frontmatter = {};
  const stack: StackEntry[] = [{ indent: -1, container: root }];
  let pendingKey: string | null = null;
  let pendingBlockType: 'pipe' | 'fold' | null = null;
  let blockBuf: string[] = [];
  let blockIndent = -1;

  function flushBlock(): void {
    if (pendingKey === null) return;
    const value = pendingBlockType === 'pipe'
      ? blockBuf.join('\n')
      : blockBuf.join(' ').trim();
    const top = stack[stack.length - 1];
    if (top && !Array.isArray(top.container)) {
      (top.container as Frontmatter)[pendingKey] = value;
    }
    pendingKey = null;
    pendingBlockType = null;
    blockBuf = [];
    blockIndent = -1;
  }

  // Append a key/value pair to the current mapping frame. Used by both
  // the plain `key: value` branch and the list-item-with-inline-mapping
  // branch (`- key: value`).
  function applyKeyValue(
    targetContainer: Frontmatter,
    indent: number,
    key: string,
    rest: string,
    lookaheadIdx: number,
  ): void {
    if (rest === '') {
      const next = lines[lookaheadIdx] ?? '';
      const nextIndent = next.match(/^\s*/)?.[0].length ?? 0;
      const nextTrim = next.slice(nextIndent);
      if (nextIndent > indent && (nextTrim.startsWith('- ') || nextTrim === '-')) {
        const arr: unknown[] = [];
        targetContainer[key] = arr;
        stack.push({ indent, container: arr });
      } else {
        const child: Frontmatter = {};
        targetContainer[key] = child;
        stack.push({ indent, container: child });
      }
    } else if (rest === '|' || rest === '>') {
      pendingKey = key;
      pendingBlockType = rest === '|' ? 'pipe' : 'fold';
      blockBuf = [];
      const probe = lines[lookaheadIdx] ?? '';
      blockIndent = probe.match(/^\s*/)?.[0].length ?? indent + 2;
    } else if (rest.startsWith('[') && rest.endsWith(']')) {
      const inner = rest.slice(1, -1).trim();
      targetContainer[key] = inner === ''
        ? []
        : inner.split(/\s*,\s*/).map((piece) => coerceScalar(piece));
    } else {
      targetContainer[key] = coerceScalar(rest);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    if (pendingBlockType !== null) {
      const lineIndent = raw.match(/^\s*/)?.[0].length ?? 0;
      if (raw.trim() === '' || lineIndent >= blockIndent) {
        const trimmedLine = raw.slice(blockIndent);
        blockBuf.push(trimmedLine);
        continue;
      }
      flushBlock();
    }
    if (/^\s*(#.*)?$/.test(raw)) continue;

    const indent = raw.match(/^\s*/)?.[0].length ?? 0;
    while (stack.length > 1 && indent <= ((stack[stack.length - 1]?.indent) ?? -1)) {
      stack.pop();
    }
    const top = stack[stack.length - 1];
    if (!top) continue;
    const trimmed = raw.slice(indent);

    if (trimmed.startsWith('- ') || trimmed === '-') {
      if (!Array.isArray(top.container)) continue;
      const rest = trimmed.slice(2).trim();
      if (rest === '') {
        const child: Frontmatter = {};
        top.container.push(child);
        stack.push({ indent, container: child });
        continue;
      }
      const colon = rest.indexOf(':');
      // Inline mapping start: `- key: value`. Create a new object,
      // push it on the array, push it on the stack so subsequent
      // indented lines (matching the post-`- ` column, i.e. indent+2)
      // continue to fill the same object.
      if (colon !== -1 && /^[A-Za-z_][\w-]*$/.test(rest.slice(0, colon).trim())) {
        const itemObj: Frontmatter = {};
        top.container.push(itemObj);
        stack.push({ indent: indent + 1, container: itemObj });
        const key = rest.slice(0, colon).trim();
        const restValue = rest.slice(colon + 1).trim();
        applyKeyValue(itemObj, indent + 2, key, restValue, i + 1);
      } else {
        top.container.push(coerceScalar(rest));
      }
      continue;
    }

    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    const rest = trimmed.slice(colon + 1).trim();
    if (Array.isArray(top.container)) continue;
    applyKeyValue(top.container as Frontmatter, indent, key, rest, i + 1);
  }
  flushBlock();
  return root;
}

function coerceScalar(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  if ((trimmed.startsWith('"') && trimmed.endsWith('"'))
      || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (/^-?\d+\.\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 80) || 'untitled';
}

// Plugin manifest names must satisfy /^[a-z0-9][a-z0-9._-]*$/ — slugify
// guarantees lowercase + safe characters; we just stitch a tier prefix
// on top so the registry never collides with the legacy folder ids.
export function pluginName(prefix: string, source: string): string {
  const slug = slugify(source);
  return `${prefix}-${slug}`;
}

export async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true });
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// Write a manifest with a key order that keeps the diff human-readable:
// identity → metadata → compat → od → end. Inside `od`, we keep the
// taxonomy (kind/taskKind/mode/scenario/surface) first so a reviewer can
// understand the plugin's category before drilling into pipeline/inputs.
const TOP_ORDER = [
  '$schema',
  'name',
  'title',
  'version',
  'description',
  'license',
  'author',
  'homepage',
  'icon',
  'tags',
  'compat',
  'od',
];
const OD_ORDER = [
  'kind',
  'taskKind',
  'mode',
  'platform',
  'scenario',
  'surface',
  'featured',
  'engineRequirements',
  'preview',
  'useCase',
  'inputs',
  'context',
  'pipeline',
  'genui',
  'connectors',
  'capabilities',
];

function sortKeys<T extends Record<string, unknown>>(obj: T, order: string[]): T {
  const out: Record<string, unknown> = {};
  for (const key of order) {
    if (key in obj) out[key] = obj[key];
  }
  for (const key of Object.keys(obj)) {
    if (!(key in out)) out[key] = obj[key];
  }
  return out as T;
}

export interface PluginManifestSeed {
  name: string;
  title: string;
  description?: string;
  license?: string;
  author?: { name?: string; url?: string };
  homepage?: string;
  tags?: string[];
  compat?: { agentSkills?: Array<{ path: string }> };
  od?: Record<string, unknown>;
}

export function buildManifest(seed: PluginManifestSeed): Record<string, unknown> {
  const base: Record<string, unknown> = {
    $schema: PLUGIN_SCHEMA,
    version: PLUGIN_VERSION,
    ...seed,
  };
  if (seed.od) base.od = sortKeys(seed.od, OD_ORDER);
  return sortKeys(base, TOP_ORDER);
}

export async function writeManifest(folder: string, manifest: unknown): Promise<void> {
  await ensureDir(folder);
  const target = path.join(folder, 'open-design.json');
  await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export async function copyFile(src: string, dst: string): Promise<void> {
  await ensureDir(path.dirname(dst));
  await fsCopyFile(src, dst);
}

// Tag normalisation. The home UI's scenario-driven chip row keys off
// these stable kebab-case tokens; mix-cased originals would explode the
// chip count without any user benefit.
export function normaliseTag(tag: string): string {
  return slugify(tag);
}

export function dedupeTags(tags: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    if (!raw) continue;
    const slug = normaliseTag(String(raw));
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

export interface RunStats {
  generated: string[];
  skipped: Array<{ id: string; reason: string }>;
}

export function emptyStats(): RunStats {
  return { generated: [], skipped: [] };
}

// Filesystem-backed markdown memory store.
//
// Layout (under <dataDir>/memory/):
//   MEMORY.md            ← short index; one bullet per fact file
//   <type>_<slug>.md     ← per-fact body + frontmatter
//   .config.json         ← switches: { "enabled": true, "chatExtractionEnabled": true }
//
// Frontmatter format (matches Claude Code's auto-memory pattern):
//   ---
//   name: User role
//   description: User is a senior FE engineer working on Open Design.
//   type: user
//   ---
//
//   {markdown body}
//
// The store is intentionally dependency-free. We piggyback on the
// existing daemon `frontmatter.ts` parser. Concurrency: writes are
// last-writer-wins on a per-file basis; the daemon only ever has one
// chat run at a time touching memory so we don't need locking yet.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { parseFrontmatter } from './frontmatter.js';
import { recordHeuristic, recordSkip } from './memory-extractions.js';

export const memoryEvents = new EventEmitter();
memoryEvents.setMaxListeners(64);

export type MemoryChangeKind =
  | 'upsert'
  | 'delete'
  | 'index'
  | 'config'
  | 'extract';

export interface MemoryChangeEvent {
  kind: MemoryChangeKind;
  id?: string;
  name?: string;
  description?: string;
  type?: string;
  count?: number;
  source?: 'heuristic' | 'llm' | 'manual';
  enabled?: boolean;
  at: number;
}

function emitChange(event: Omit<MemoryChangeEvent, 'at'>): void {
  memoryEvents.emit('change', { ...event, at: Date.now() });
}

// ---- Types -----------------------------------------------------------------

type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

interface ExtractionOverride {
  provider: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  apiVersion?: string;
}

interface MemoryConfig {
  enabled: boolean;
  extraction: ExtractionOverride | null;
}

interface MemoryConfigPatch {
  enabled?: boolean;
  extraction?: ExtractionOverride | null;
}

interface MaskedExtractionConfig {
  provider: string;
  model: string;
  baseUrl: string;
  apiVersion: string;
  apiKeyTail: string;
  apiKeyConfigured: boolean;
}

interface MemoryEntrySummary {
  id: string;
  name: string;
  description: string;
  type: string;
  updatedAt: number;
}

interface MemoryEntry extends MemoryEntrySummary {
  body: string;
}

interface UpsertInput {
  id?: string;
  name?: string;
  description?: string;
  type?: string;
  body?: string;
}

interface WriteOptions {
  silent?: boolean;
  source?: 'heuristic' | 'llm' | 'manual';
}

interface ChangedEntry {
  id: string;
  name: string;
  description: string;
  type: string;
  updatedAt: number;
}

interface MemoryTreeNode {
  id: string;
  parentId: string | null;
  path: string;
  name: string;
  description: string;
  kind: 'folder' | 'entry';
  type: string;
  scope: string;
  sourcePacketIds: string[];
  proposalIds: string[];
  createdAt: string;
  updatedAt: string;
  childrenCount: number;
}

// ---- Constants -------------------------------------------------------------

const INDEX_FILE = 'MEMORY.md';
const CONFIG_FILE = '.config.json';

const VALID_TYPES = new Set<string>(['user', 'feedback', 'project', 'reference']);

const DEFAULT_INDEX = `# Memory

This is your auto-memory index. Each line points to a per-fact \`.md\`
file in the same folder. Lines you delete here stop being injected into
new chats; the underlying fact file stays on disk so you can paste it
back if you change your mind.

`;

// ---- Helpers ---------------------------------------------------------------

export function memoryDir(dataDir: string): string {
  return path.join(dataDir, 'memory');
}

async function ensureDir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}

function isValidType(t: unknown): t is MemoryType {
  return typeof t === 'string' && VALID_TYPES.has(t);
}

export function deriveMemoryId(type: unknown, name: unknown): string {
  const safeType: string = isValidType(type) ? type : 'user';
  const raw = String(name || '');
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  if (cleaned.length > 0) return `${safeType}_${cleaned}`;
  // FNV-1a 32-bit on the original name.
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < raw.length; i++) {
    h = (h ^ raw.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${safeType}_n${h.toString(36)}`;
}

function entryPath(dataDir: string, id: string): string {
  if (typeof id !== 'string' || !/^[a-z0-9_]+$/.test(id) || id.length > 96) {
    throw new Error('invalid memory id');
  }
  return path.join(memoryDir(dataDir), `${id}.md`);
}

function indexPath(dataDir: string): string {
  return path.join(memoryDir(dataDir), INDEX_FILE);
}

function configPath(dataDir: string): string {
  return path.join(memoryDir(dataDir), CONFIG_FILE);
}

const VALID_EXTRACTION_PROVIDERS = new Set([
  'anthropic',
  'openai',
  'azure',
  'google',
  'ollama',
]);

interface NormalizedExtractionPatch {
  provider: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  apiVersion?: string;
}

function normalizeExtractionPatch(input: unknown): NormalizedExtractionPatch | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  const provider = obj.provider;
  if (!VALID_EXTRACTION_PROVIDERS.has(provider as string)) return null;
  const out: NormalizedExtractionPatch = { provider: provider as string };
  if (typeof obj.model === 'string' && obj.model.trim()) {
    out.model = obj.model.trim();
  }
  if (typeof obj.baseUrl === 'string' && obj.baseUrl.trim()) {
    out.baseUrl = obj.baseUrl.trim();
  }
  if (typeof obj.apiKey === 'string' && obj.apiKey.trim()) {
    out.apiKey = obj.apiKey.trim();
  }
  if (typeof obj.apiVersion === 'string' && obj.apiVersion.trim()) {
    out.apiVersion = obj.apiVersion.trim();
  }
  return out;
}

// ---- Config ----------------------------------------------------------------

export async function readMemoryConfig(dataDir: string): Promise<MemoryConfig> {
  try {
    const raw = await fsp.readFile(configPath(dataDir), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      enabled: parsed?.enabled !== false,
      chatExtractionEnabled: parsed?.chatExtractionEnabled !== false,
      extraction: normalizeExtractionPatch(parsed?.extraction),
    };
  } catch {
    // Default-on. The whole point of the feature is to surface user
    // context across runs; making it opt-in would mean the first 3
    // chats happen with no memory and no warning.
    return { enabled: true, chatExtractionEnabled: true, extraction: null };
  }
}

// Patch shape:
//   { enabled?: boolean, chatExtractionEnabled?: boolean, extraction?: object | null }
// `extraction: null` clears the override (reverting to auto-pick); an
// object replaces it whole; an absent key leaves the existing override
// untouched.
export async function writeMemoryConfig(
  dataDir: string,
  patch: MemoryConfigPatch,
): Promise<MemoryConfig> {
  const current = await readMemoryConfig(dataDir);
  const next: { enabled: boolean; extraction: ExtractionOverride | null } = {
    enabled:
      typeof patch?.enabled === 'boolean' ? patch.enabled : current.enabled,
    chatExtractionEnabled:
      typeof patch?.chatExtractionEnabled === 'boolean'
        ? patch.chatExtractionEnabled
        : current.chatExtractionEnabled,
    extraction: current.extraction,
  };
  if (Object.prototype.hasOwnProperty.call(patch || {}, 'extraction')) {
    next.extraction = patch.extraction === null
      ? null
      : normalizeExtractionPatch(patch.extraction);
  }
  if (typeof next.enabled !== 'boolean') next.enabled = true;
  if (typeof next.chatExtractionEnabled !== 'boolean') {
    next.chatExtractionEnabled = true;
  }
  await ensureDir(memoryDir(dataDir));
  await fsp.writeFile(configPath(dataDir), JSON.stringify(next, null, 2));
  if (
    current.enabled !== next.enabled
    || current.chatExtractionEnabled !== next.chatExtractionEnabled
  ) {
    emitChange({ kind: 'config', enabled: next.enabled });
  }
  return next;
}

export function maskMemoryExtractionConfig(
  extraction: ExtractionOverride | null,
): MaskedExtractionConfig | null {
  if (!extraction) return null;
  const apiKey = typeof extraction.apiKey === 'string' ? extraction.apiKey : '';
  return {
    provider: extraction.provider,
    model: typeof extraction.model === 'string' ? extraction.model : '',
    baseUrl: typeof extraction.baseUrl === 'string' ? extraction.baseUrl : '',
    apiVersion:
      typeof extraction.apiVersion === 'string' ? extraction.apiVersion : '',
    apiKeyTail: apiKey ? apiKey.slice(-4) : '',
    apiKeyConfigured: Boolean(apiKey),
  };
}

// ---- Index -----------------------------------------------------------------

export async function readMemoryIndex(dataDir: string): Promise<string> {
  try {
    return await fsp.readFile(indexPath(dataDir), 'utf8');
  } catch {
    return DEFAULT_INDEX;
  }
}

export async function writeMemoryIndex(
  dataDir: string,
  body: unknown,
  options?: WriteOptions,
): Promise<void> {
  await ensureDir(memoryDir(dataDir));
  await fsp.writeFile(indexPath(dataDir), String(body ?? ''));
  if (!options?.silent) emitChange({ kind: 'index' });
}

// ---- Entries ---------------------------------------------------------------

function summarize(
  id: string,
  raw: string,
  mtime: number,
): { summary: MemoryEntrySummary; body: string } {
  const { data, body } = parseFrontmatter(raw);
  const pdata = data as Record<string, unknown> | undefined;
  const type: string = isValidType(pdata?.type) ? (pdata!.type as string) : 'user';
  return {
    summary: {
      id,
      name: typeof pdata?.name === 'string' && pdata.name ? pdata.name : id,
      description: typeof pdata?.description === 'string' ? pdata.description : '',
      type,
      updatedAt: mtime,
    },
    body: typeof body === 'string' ? body.trimStart() : '',
  };
}

export async function listMemoryEntries(dataDir: string): Promise<MemoryEntrySummary[]> {
  const dir = memoryDir(dataDir);
  let names: string[] = [];
  try {
    names = await fsp.readdir(dir);
  } catch {
    return [];
  }
  const out: MemoryEntrySummary[] = [];
  for (const name of names) {
    if (!name.endsWith('.md')) continue;
    if (name === INDEX_FILE) continue;
    const id = name.slice(0, -3);
    if (!/^[a-z0-9_]+$/.test(id)) continue;
    try {
      const filePath = path.join(dir, name);
      const [raw, stat] = await Promise.all([
        fsp.readFile(filePath, 'utf8'),
        fsp.stat(filePath),
      ]);
      const { summary } = summarize(id, raw, stat.mtimeMs);
      out.push(summary);
    } catch {
      continue;
    }
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}

const MEMORY_TREE_TYPES = ['user', 'feedback', 'project', 'reference'];

function memoryTreeFolderId(type: string): string {
  return `folder:${type}`;
}

function memoryTreeScopeForType(type: string): string {
  return type === 'project' ? 'project' : 'global';
}

function toIsoTime(ms: number): string {
  return new Date(Number.isFinite(ms) ? ms : 0).toISOString();
}

function extractAutomationRefs(body: string | undefined, label: string): string[] {
  const refs = new Set<string>();
  const re = new RegExp(`^${label}:\\s*([A-Za-z0-9_-]+)\\s*$`, 'gim');
  let match: RegExpExecArray | null;
  while ((match = re.exec(String(body || ''))) !== null) {
    if (match[1]) refs.add(match[1]);
  }
  return Array.from(refs);
}

export async function buildMemoryTree(dataDir: string): Promise<MemoryTreeNode[]> {
  const entries = await listMemoryEntries(dataDir);
  const byType = new Map<string, MemoryEntry[]>();
  for (const type of MEMORY_TREE_TYPES) byType.set(type, []);
  for (const entry of entries) {
    const list = byType.get(entry.type) ?? [];
    list.push(entry);
    byType.set(entry.type, list);
  }

  const nodes: MemoryTreeNode[] = [];
  for (const type of MEMORY_TREE_TYPES) {
    const children = byType.get(type) ?? [];
    const folderUpdatedAt = children.reduce(
      (latest, entry) => Math.max(latest, entry.updatedAt ?? 0),
      0,
    );
    const folderId = memoryTreeFolderId(type);
    nodes.push({
      id: folderId,
      parentId: null,
      path: `/${type}`,
      name: capitalize(type),
      description: `${capitalize(type)} memory`,
      kind: 'folder',
      type,
      scope: memoryTreeScopeForType(type),
      sourcePacketIds: [],
      proposalIds: [],
      createdAt: toIsoTime(folderUpdatedAt),
      updatedAt: toIsoTime(folderUpdatedAt),
      childrenCount: children.length,
    });
    for (const entry of children) {
      const detail = await readMemoryEntry(dataDir, entry.id);
      const detailBody = detail?.body ?? '';
      nodes.push({
        id: entry.id,
        parentId: folderId,
        path: `/${type}/${entry.id}`,
        name: entry.name,
        description: entry.description,
        kind: 'entry',
        type: entry.type,
        scope: memoryTreeScopeForType(entry.type),
        sourcePacketIds: extractAutomationRefs(detailBody, 'Source packet'),
        proposalIds: extractAutomationRefs(detailBody, 'Proposal'),
        createdAt: toIsoTime(entry.updatedAt),
        updatedAt: toIsoTime(entry.updatedAt),
        childrenCount: 0,
      });
    }
  }
  return nodes;
}

export async function readMemoryEntry(
  dataDir: string,
  id: string,
): Promise<MemoryEntry | null> {
  let raw: string;
  let stat: { mtimeMs: number };
  try {
    const filePath = entryPath(dataDir, id);
    const results = await Promise.all([
      fsp.readFile(filePath, 'utf8'),
      fsp.stat(filePath),
    ]);
    raw = results[0];
    stat = results[1];
  } catch {
    return null;
  }
  const { summary, body } = summarize(id, raw, stat.mtimeMs);
  return { ...summary, body };
}

function renderEntryFile(
  name: unknown,
  description: unknown,
  type: unknown,
  body: unknown,
): string {
  const safeName = String(name || 'Untitled').replace(/\r?\n/g, ' ').trim();
  const safeDesc = String(description || '').replace(/\r?\n/g, ' ').trim();
  const safeType = isValidType(type) ? type : 'user';
  const trimmedBody = String(body || '').replace(/^\s+/, '');
  return `---\nname: ${safeName}\ndescription: ${safeDesc}\ntype: ${safeType}\n---\n\n${trimmedBody}\n`;
}

export async function updateMemoryTreeNode(
  dataDir: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<MemoryEntry> {
  if (typeof id !== 'string' || id.startsWith('folder:')) {
    throw new Error('memory tree folders are derived and cannot be edited');
  }
  const current = await readMemoryEntry(dataDir, id);
  if (!current) throw new Error('memory not found');
  const nextType = isValidType(patch?.type as string) ? (patch.type as string) : current.type;
  return upsertMemoryEntry(dataDir, {
    id,
    name:
      typeof patch?.name === 'string' && patch.name.trim()
        ? patch.name
        : current.name,
    description:
      typeof patch?.description === 'string'
        ? patch.description
        : current.description,
    type: nextType,
    body: typeof patch?.body === 'string' ? patch.body : current.body,
  });
}

export async function upsertMemoryEntry(
  dataDir: string,
  input: UpsertInput | null | undefined,
  options?: WriteOptions,
): Promise<MemoryEntry> {
  const { name, description, type, body } = input || {};
  if (!name || !isValidType(type)) {
    throw new Error('memory entry requires `name` and a valid `type`');
  }
  const id = input?.id && /^[a-z0-9_]+$/.test(input.id)
    ? input.id
    : deriveMemoryId(type, name);
  await ensureDir(memoryDir(dataDir));
  await fsp.writeFile(
    entryPath(dataDir, id),
    renderEntryFile(name, description, type, body),
  );
  await ensureIndexHasEntry(dataDir, id, name as string, description as string);
  const entry = await readMemoryEntry(dataDir, id);
  if (!entry) throw new Error('failed to read memory entry after write');
  if (!options?.silent) {
    emitChange({
      kind: 'upsert',
      id: entry.id,
      name: entry.name,
      description: entry.description,
      type: entry.type,
      source: options?.source ?? 'manual',
    });
  }
  return entry;
}

export async function deleteMemoryEntry(dataDir: string, id: string): Promise<void> {
  try {
    await fsp.unlink(entryPath(dataDir, id));
  } catch {
    // Already gone — fine.
  }
  await removeIndexLine(dataDir, id);
  emitChange({ kind: 'delete', id });
}

// ---- Index maintenance -----------------------------------------------------

const INDEX_LINK_RE = /^\s*-\s+\[([^\]]+)\]\(([^)]+)\)(\s+—\s+(.*))?$/;

function parseIndexLinkIds(indexBody: string): Set<string> {
  const ids = new Set<string>();
  for (const line of String(indexBody ?? '').split(/\r?\n/)) {
    const m = INDEX_LINK_RE.exec(line);
    if (!m) continue;
    const target = typeof m[2] === 'string' ? m[2] : '';
    if (!target.endsWith('.md')) continue;
    if (target === INDEX_FILE) continue;
    const id = target.slice(0, -3);
    if (/^[a-z0-9_]+$/.test(id)) ids.add(id);
  }
  return ids;
}

async function ensureIndexHasEntry(
  dataDir: string,
  id: string,
  name: string,
  description: string,
): Promise<void> {
  const current = await readMemoryIndex(dataDir);
  const lines = current.split(/\r?\n/);
  const link = `${id}.md`;
  const desc = String(description || '').replace(/\r?\n/g, ' ').trim();
  const newLine = desc
    ? `- [${name}](${link}) — ${desc}`
    : `- [${name}](${link})`;
  let replaced = false;
  for (let i = 0; i < lines.length; i++) {
    const m = INDEX_LINK_RE.exec(lines[i] ?? '');
    if (m && m[2] === link) {
      lines[i] = newLine;
      replaced = true;
      break;
    }
  }
  if (!replaced) {
    if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
    lines.push(newLine);
  }
  await writeMemoryIndex(dataDir, lines.join('\n'), { silent: true });
}

async function removeIndexLine(dataDir: string, id: string): Promise<void> {
  const current = await readMemoryIndex(dataDir);
  const link = `${id}.md`;
  const lines = current.split(/\r?\n/).filter((line) => {
    const m = INDEX_LINK_RE.exec(line);
    return !m || m[2] !== link;
  });
  await writeMemoryIndex(dataDir, lines.join('\n'), { silent: true });
}

// ---- System-prompt body ----------------------------------------------------

export async function composeMemoryBody(dataDir: string): Promise<string> {
  const cfg = await readMemoryConfig(dataDir);
  if (!cfg.enabled) return '';
  const allEntries = await listMemoryEntries(dataDir);
  if (allEntries.length === 0) return '';
  const indexBody = await readMemoryIndex(dataDir);
  const linkedIds = parseIndexLinkIds(indexBody);
  const entries = allEntries.filter((e) => linkedIds.has(e.id));
  if (entries.length === 0) return '';
  const grouped = new Map<string, MemoryEntrySummary[]>();
  for (const e of entries) {
    const list = grouped.get(e.type) ?? [];
    list.push(e);
    grouped.set(e.type, list);
  }
  const ordered = ['user', 'feedback', 'project', 'reference']
    .filter((t) => grouped.has(t));
  const parts: string[] = [];
  for (const type of ordered) {
    parts.push(`### ${capitalize(type)}`);
    for (const e of grouped.get(type) ?? []) {
      const body = await readEntryBodyById(dataDir, e.id);
      if (!body) continue;
      parts.push(`- **${e.name}** — ${e.description || '(no description)'}`);
      const indented = body
        .trim()
        .split(/\r?\n/)
        .map((l) => `  ${l}`)
        .join('\n');
      if (indented.length > 0) parts.push(indented);
    }
    parts.push('');
  }
  return parts.join('\n').trim();
}

async function readEntryBodyById(dataDir: string, id: string): Promise<string> {
  const entry = await readMemoryEntry(dataDir, id);
  return entry?.body ?? '';
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

// ---- Heuristic auto-extraction ---------------------------------------------

interface ExtractionPattern {
  re: RegExp;
  type: 'user' | 'feedback' | 'project' | 'reference';
  name: string;
  descriptionTemplate: string;
  bodyTemplate: string;
}

const REMEMBER_PATTERNS: ExtractionPattern[] = [
  // English
  {
    re: /(?:^|\b)(?:please\s+)?remember(?:\s+that)?[:\s]+([^\n]{4,400})/i,
    type: 'feedback',
    name: 'Remembered note',
    descriptionTemplate: 'User asked to remember: $1',
    bodyTemplate:
      '- Remembered: $1\n\nWhen to apply: keep this in mind for future replies.',
  },
  {
    re: /(?:^|\b)note\s+to\s+self[:\s]+([^\n]{4,400})/i,
    type: 'feedback',
    name: 'Note to self',
    descriptionTemplate: 'Note: $1',
    bodyTemplate: '- Note: $1',
  },
  {
    re: /(?:^|\b)i(?:'m|\s+am)\s+(?:a|an|the)\s+([^.\n]{3,200})/i,
    type: 'user',
    name: 'User role',
    descriptionTemplate: 'User is a $1',
    bodyTemplate:
      '- Role / identity: $1\n\nWhen to apply: any chat — frame examples and recommendations around this background.',
  },
  {
    re: /(?:^|\b)i\s+prefer\s+([^.\n]{3,200})/i,
    type: 'feedback',
    name: 'User preference',
    descriptionTemplate: 'User prefers $1',
    bodyTemplate:
      '- Preference: $1\n\nWhen to apply: factor this in whenever a relevant choice comes up.',
  },
  {
    re: /(?:^|\b)i(?:'m|\s+am)\s+(?:in|based\s+in|located\s+in|living\s+in)\s+([^.\n,]{2,80})/i,
    type: 'user',
    name: 'User location',
    descriptionTemplate: 'User is based in $1',
    bodyTemplate:
      '- Location: $1\n\nWhen to apply: localise time-of-day phrasing, currency, and cultural references.',
  },
  {
    re: /(?:^|\b)i\s+live\s+in\s+([^.\n,]{2,80})/i,
    type: 'user',
    name: 'User location',
    descriptionTemplate: 'User lives in $1',
    bodyTemplate:
      '- Location: $1\n\nWhen to apply: localise time-of-day phrasing, currency, and cultural references.',
  },
  {
    re: /(?:^|\b)i(?:'d\s+like|\s+would\s+like|\s+want|\s+wanna|\s+hope)\s+to\s+([^.\n]{4,200})/i,
    type: 'project',
    name: 'User goal',
    descriptionTemplate: 'User wants to $1',
    bodyTemplate:
      '- Goal: $1\n\nWhen to apply: surface relevance to this goal whenever the conversation drifts close to it.',
  },
  // Chinese
  {
    re: /记住[:：\s]+([^\n。]{2,200})/,
    type: 'feedback',
    name: '重要备忘',
    descriptionTemplate: '用户要求记住：$1',
    bodyTemplate: '- 备忘：$1\n\n何时适用：在后续对话里始终保持这一前提。',
  },
  {
    re: /我是\s*([^\n。，]{2,80})/,
    type: 'user',
    name: '用户身份',
    descriptionTemplate: '用户的身份/职业：$1',
    bodyTemplate:
      '- 身份 / 角色：$1\n\n何时适用：在所有对话里把用户的背景纳入考虑（举例、措辞、深度）。',
  },
  {
    re: /我喜欢\s*([^\n。，]{2,200})/,
    type: 'feedback',
    name: '用户偏好',
    descriptionTemplate: '用户喜欢：$1',
    bodyTemplate: '- 偏好：$1\n\n何时适用：在涉及该选择时优先采用这一倾向。',
  },
  {
    re: /我偏好\s*([^\n。，]{2,200})/,
    type: 'feedback',
    name: '用户偏好',
    descriptionTemplate: '用户偏好：$1',
    bodyTemplate: '- 偏好：$1\n\n何时适用：在涉及该选择时优先采用这一倾向。',
  },
  {
    re: /我[在再]\s*([^\n。，！？!?,]{2,80})/,
    type: 'user',
    name: '用户所在地',
    descriptionTemplate: '用户所在地：$1',
    bodyTemplate:
      '- 所在地：$1\n\n何时适用：在时区、货币、文化语境相关的回答里把这一点纳入考虑。',
  },
  {
    re: /我住在\s*([^\n。，！？!?,]{2,80})/,
    type: 'user',
    name: '用户所在地',
    descriptionTemplate: '用户居住在：$1',
    bodyTemplate:
      '- 所在地：$1\n\n何时适用：在时区、货币、文化语境相关的回答里把这一点纳入考虑。',
  },
  {
    re: /我(?:想|希望|打算|计划)\s*([^\n。！？!?]{4,200})/,
    type: 'project',
    name: '用户目标',
    descriptionTemplate: '用户希望：$1',
    bodyTemplate:
      '- 目标：$1\n\n何时适用：当对话靠近这一目标时主动呼应它，并把建议与目标对齐。',
  },
  {
    re: /备忘[:：\s]+([^\n]{2,200})/,
    type: 'reference',
    name: '速记备忘',
    descriptionTemplate: '$1',
    bodyTemplate: '- $1',
  },
];

function applyTemplate(template: string, captured: string): string {
  return String(template || '').replace(/\$1/g, String(captured));
}

export async function extractFromMessage(
  dataDir: string,
  userMessage: string,
): Promise<ChangedEntry[]> {
  if (typeof userMessage !== 'string' || userMessage.trim().length === 0) {
    recordSkip({ userMessage: userMessage ?? '', reason: 'empty-message', kind: 'heuristic' });
    return [];
  }
  const cfg = await readMemoryConfig(dataDir);
  if (!cfg.enabled) {
    recordSkip({ userMessage, reason: 'memory-disabled', kind: 'heuristic' });
    return [];
  }
  if (!cfg.chatExtractionEnabled) {
    return [];
  }
  const seen = new Set<string>();
  const changed: ChangedEntry[] = [];
  for (const pattern of REMEMBER_PATTERNS) {
    const m = pattern.re.exec(userMessage);
    if (!m) continue;
    const captured = (m[1] || '').trim();
    if (captured.length < 3) continue;
    const trimmedCaptured = truncate(captured, 200);
    const dedupeKey = `${pattern.type}::${pattern.name}::${trimmedCaptured.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const description = truncate(
      applyTemplate(pattern.descriptionTemplate, trimmedCaptured),
      200,
    );
    const body = applyTemplate(pattern.bodyTemplate, trimmedCaptured);
    const id = deriveMemoryId(pattern.type, trimmedCaptured);
    try {
      const entry = await upsertMemoryEntry(
        dataDir,
        {
          id,
          type: pattern.type,
          name: pattern.name,
          description,
          body,
        },
        { silent: true, source: 'heuristic' },
      );
      changed.push({
        id: entry.id,
        name: entry.name,
        description: entry.description,
        type: entry.type,
        updatedAt: entry.updatedAt,
      });
    } catch (err) {
      console.warn('[memory] auto-extract write failed', err);
    }
  }
  if (changed.length > 0) {
    emitChange({
      kind: 'extract',
      count: changed.length,
      source: 'heuristic',
    });
  }
  recordHeuristic({
    userMessage,
    writtenCount: changed.length,
    writtenIds: changed.map((c) => c.id),
  });
  return changed;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trim()}…`;
}

// @ts-nocheck
// Filesystem-backed markdown memory store.
//
// Layout (under <dataDir>/memory/):
//   MEMORY.md            ← short index; one bullet per fact file
//   <type>_<slug>.md     ← per-fact body + frontmatter
//   .config.json         ← single boolean: { "enabled": true }
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
// Imported lazily through the memory-extractions module by the call
// sites below so a future test-only build of memory.ts that stubs the
// store can still tree-shake the ring buffer. We use a static import
// here because memory.ts is the chat hot path — a dynamic import per
// turn would add a microtask hop for no real benefit.
import { recordHeuristic, recordSkip } from './memory-extractions.js';

// Tiny in-process bus. The HTTP layer (`/api/memory/events`) subscribes
// to this and forwards events to any open SSE client; the storage
// helpers below emit on every write so the web UI auto-refreshes
// whenever memory changes — whether the change came from the chat
// hook, the LLM extractor, the settings panel, or `curl`.
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
  // Optional details — populated for upsert / delete; absent for index /
  // config so the frontend just re-fetches the list.
  id?: string;
  name?: string;
  description?: string;
  type?: string;
  // For 'extract' events, the size of the batch that was added in one
  // pass. Lets the toast say "Memory updated (3 new)" instead of three
  // separate toasts.
  count?: number;
  source?: 'heuristic' | 'llm' | 'manual';
  enabled?: boolean;
  at: number;
}

function emitChange(event: Omit<MemoryChangeEvent, 'at'>): void {
  memoryEvents.emit('change', { ...event, at: Date.now() });
}

const INDEX_FILE = 'MEMORY.md';
const CONFIG_FILE = '.config.json';

const VALID_TYPES = new Set(['user', 'feedback', 'project', 'reference']);

const DEFAULT_INDEX = `# Memory

This is your auto-memory index. Each line points to a per-fact \`.md\`
file in the same folder. Lines you delete here stop being injected into
new chats; the underlying fact file stays on disk so you can paste it
back if you change your mind.

`;

export function memoryDir(dataDir) {
  return path.join(dataDir, 'memory');
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

function isValidType(t) {
  return typeof t === 'string' && VALID_TYPES.has(t);
}

// Slug rules: lowercase, alphanumeric + underscore. Strip everything
// else. Always prefixed by `<type>_` so a file's category is visible
// in `ls` without parsing frontmatter. When the source name is purely
// non-ASCII (CJK / emoji) the cleaned slug ends up empty; in that case
// we hash the raw name so two distinct Chinese memories don't collide
// on the `<type>_note` fallback.
export function deriveMemoryId(type, name) {
  const safeType = isValidType(type) ? type : 'user';
  const raw = String(name || '');
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  if (cleaned.length > 0) return `${safeType}_${cleaned}`;
  // FNV-1a 32-bit on the original name. Tiny, deterministic, no
  // dependencies. Collisions are still possible, but for the dozens of
  // memories a user is likely to accumulate, the birthday risk is
  // negligible.
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < raw.length; i++) {
    h = (h ^ raw.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${safeType}_n${h.toString(36)}`;
}

function entryPath(dataDir, id) {
  // Defence in depth: the id arrives from the network. Reject anything
  // that could escape the memory dir or break the .md convention.
  if (typeof id !== 'string' || !/^[a-z0-9_]+$/.test(id) || id.length > 96) {
    throw new Error('invalid memory id');
  }
  return path.join(memoryDir(dataDir), `${id}.md`);
}

function indexPath(dataDir) {
  return path.join(memoryDir(dataDir), INDEX_FILE);
}

function configPath(dataDir) {
  return path.join(memoryDir(dataDir), CONFIG_FILE);
}

// Whitelist of fields the extraction override may contain. Anything else
// in the patch is dropped to keep `.config.json` from accumulating
// arbitrary user-supplied keys (e.g. a typo'd field that quietly breaks
// the extractor on the next restart).
const VALID_EXTRACTION_PROVIDERS = new Set([
  'anthropic',
  'openai',
  'azure',
  'google',
  'ollama',
]);

function normalizeExtractionPatch(input) {
  if (!input || typeof input !== 'object') return null;
  const provider = input.provider;
  if (!VALID_EXTRACTION_PROVIDERS.has(provider)) return null;
  const out = { provider };
  if (typeof input.model === 'string' && input.model.trim()) {
    out.model = input.model.trim();
  }
  if (typeof input.baseUrl === 'string' && input.baseUrl.trim()) {
    out.baseUrl = input.baseUrl.trim();
  }
  if (typeof input.apiKey === 'string' && input.apiKey.trim()) {
    out.apiKey = input.apiKey.trim();
  }
  if (typeof input.apiVersion === 'string' && input.apiVersion.trim()) {
    out.apiVersion = input.apiVersion.trim();
  }
  return out;
}

export async function readMemoryConfig(dataDir) {
  try {
    const raw = await fsp.readFile(configPath(dataDir), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed?.enabled !== false,
      extraction: normalizeExtractionPatch(parsed?.extraction),
    };
  } catch {
    // Default-on. The whole point of the feature is to surface user
    // context across runs; making it opt-in would mean the first 3
    // chats happen with no memory and no warning.
    return { enabled: true, extraction: null };
  }
}

// Patch shape:
//   { enabled?: boolean, extraction?: object | null }
// `extraction: null` clears the override (reverting to auto-pick); an
// object replaces it whole; an absent key leaves the existing override
// untouched.
export async function writeMemoryConfig(dataDir, patch) {
  const current = await readMemoryConfig(dataDir);
  const next = {
    enabled:
      typeof patch?.enabled === 'boolean' ? patch.enabled : current.enabled,
    extraction: current.extraction,
  };
  if (Object.prototype.hasOwnProperty.call(patch || {}, 'extraction')) {
    next.extraction = patch.extraction === null
      ? null
      : normalizeExtractionPatch(patch.extraction);
  }
  if (typeof next.enabled !== 'boolean') next.enabled = true;
  await ensureDir(memoryDir(dataDir));
  await fsp.writeFile(configPath(dataDir), JSON.stringify(next, null, 2));
  if (current.enabled !== next.enabled) {
    emitChange({ kind: 'config', enabled: next.enabled });
  }
  // We don't emit a separate change event for extraction overrides — the
  // chat hot path doesn't need to react, and the settings panel re-reads
  // the config on every PATCH response anyway. Adding an extra event
  // would just trigger redundant entry-list re-fetches in MemorySection.
  return next;
}

// Public — returns the masked shape consumed by GET /api/memory.
// Keeps the secret out of the DOM but lets the UI render "configured" /
// "•••• abcd" affordances without round-tripping through writeConfig.
export function maskMemoryExtractionConfig(extraction) {
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

export async function readMemoryIndex(dataDir) {
  try {
    return await fsp.readFile(indexPath(dataDir), 'utf8');
  } catch {
    return DEFAULT_INDEX;
  }
}

export async function writeMemoryIndex(dataDir, body, options) {
  await ensureDir(memoryDir(dataDir));
  await fsp.writeFile(indexPath(dataDir), String(body ?? ''));
  if (!options?.silent) emitChange({ kind: 'index' });
}

function summarize(id, raw, mtime) {
  const { data, body } = parseFrontmatter(raw);
  const type = isValidType(data?.type) ? data.type : 'user';
  return {
    summary: {
      id,
      name: typeof data?.name === 'string' && data.name ? data.name : id,
      description: typeof data?.description === 'string' ? data.description : '',
      type,
      updatedAt: mtime,
    },
    body: typeof body === 'string' ? body.trimStart() : '',
  };
}

export async function listMemoryEntries(dataDir) {
  const dir = memoryDir(dataDir);
  let names = [];
  try {
    names = await fsp.readdir(dir);
  } catch {
    return [];
  }
  const out = [];
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
      // Skip unreadable / malformed files; never let one bad file
      // shadow the rest of the listing.
      continue;
    }
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}

export async function readMemoryEntry(dataDir, id) {
  let raw;
  let stat;
  try {
    const filePath = entryPath(dataDir, id);
    [raw, stat] = await Promise.all([
      fsp.readFile(filePath, 'utf8'),
      fsp.stat(filePath),
    ]);
  } catch {
    return null;
  }
  const { summary, body } = summarize(id, raw, stat.mtimeMs);
  return { ...summary, body };
}

function renderEntryFile(name, description, type, body) {
  const safeName = String(name || 'Untitled').replace(/\r?\n/g, ' ').trim();
  const safeDesc = String(description || '').replace(/\r?\n/g, ' ').trim();
  const safeType = isValidType(type) ? type : 'user';
  const trimmedBody = String(body || '').replace(/^\s+/, '');
  return `---\nname: ${safeName}\ndescription: ${safeDesc}\ntype: ${safeType}\n---\n\n${trimmedBody}\n`;
}

export async function upsertMemoryEntry(dataDir, input, options) {
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
  await ensureIndexHasEntry(dataDir, id, name, description);
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

export async function deleteMemoryEntry(dataDir, id) {
  try {
    await fsp.unlink(entryPath(dataDir, id));
  } catch {
    // Already gone — fine. Caller doesn't care.
  }
  await removeIndexLine(dataDir, id);
  emitChange({ kind: 'delete', id });
}

// ----- Index maintenance --------------------------------------------------

const INDEX_LINK_RE = /^\s*-\s+\[([^\]]+)\]\(([^)]+)\)(\s+—\s+(.*))?$/;

// Pull the linked entry ids out of MEMORY.md. The index is the user's
// editable list — every bullet that points at `<id>.md` is a fact the
// user wants injected into future system prompts. Removing a bullet
// disables that fact while leaving the underlying file on disk, so the
// user can paste the line back later. Anything that doesn't parse as a
// valid `<id>.md` link is ignored (free-form prose, headings, blank
// lines, `MEMORY.md` itself).
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

async function ensureIndexHasEntry(dataDir, id, name, description) {
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
  // Silent: the upsert path emits its own change event, so a redundant
  // 'index' event would just cause the frontend to re-fetch twice.
  await writeMemoryIndex(dataDir, lines.join('\n'), { silent: true });
}

async function removeIndexLine(dataDir, id) {
  const current = await readMemoryIndex(dataDir);
  const link = `${id}.md`;
  const lines = current.split(/\r?\n/).filter((line) => {
    const m = INDEX_LINK_RE.exec(line);
    return !m || m[2] !== link;
  });
  await writeMemoryIndex(dataDir, lines.join('\n'), { silent: true });
}

// ----- System-prompt body -------------------------------------------------

// Build the markdown block that the prompt composer folds into every
// run. Returns `''` when memory is disabled, missing, or empty so the
// composer can drop the block without an extra `if`.
//
// Active set is derived from MEMORY.md's link bullets, NOT from every
// `*.md` file in the directory. The user's hand-edited index is the
// source of truth for which facts get injected: removing a `- [Name](id.md)`
// line disables that fact in future prompts while keeping the file on
// disk (paste the line back in the settings panel to re-enable it).
// Without this filter, deleted index lines had no effect — the daemon
// kept reading every entry file and the index editor was cosmetic only.
export async function composeMemoryBody(dataDir) {
  const cfg = await readMemoryConfig(dataDir);
  if (!cfg.enabled) return '';
  const allEntries = await listMemoryEntries(dataDir);
  if (allEntries.length === 0) return '';
  const indexBody = await readMemoryIndex(dataDir);
  const linkedIds = parseIndexLinkIds(indexBody);
  const entries = allEntries.filter((e) => linkedIds.has(e.id));
  if (entries.length === 0) return '';
  const grouped = new Map();
  for (const e of entries) {
    const list = grouped.get(e.type) ?? [];
    list.push(e);
    grouped.set(e.type, list);
  }
  const ordered = ['user', 'feedback', 'project', 'reference']
    .filter((t) => grouped.has(t));
  const parts = [];
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

async function readEntryBodyById(dataDir, id) {
  const entry = await readMemoryEntry(dataDir, id);
  return entry?.body ?? '';
}

function capitalize(s) {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

// ----- Heuristic auto-extraction -----------------------------------------

// Look for explicit "save this" markers in the user message. The aim is
// not to be a clever miner — that's what an LLM extractor is for. The
// aim is to make `/记住 X` and `remember: X` actually do something
// without spinning up a second model call. Returns an array of upserts
// applied (caller can surface them in the SSE stream / log).
//
// Each pattern is responsible for declaring the *shape* of the entry it
// produces — not just the regex. That way a Chinese "我是 X" capture
// gets a stable, human-readable label like `用户身份` with body
// `- 身份 / 角色：X` instead of three identical fields all set to the
// raw captured phrase ("一名软件工程师"). The regex captures `$1` once;
// the templates below decide how that phrase becomes a useful memory.
//
// Fields per pattern:
//   re                  — regex with exactly one capture group
//   type                — memory type bucket (`user` / `feedback` / …)
//   name                — stable label used as the entry's display name
//   descriptionTemplate — short summary; `$1` is the captured phrase
//   bodyTemplate        — markdown body injected into future system
//                         prompts; `$1` is the captured phrase
//
// Id derivation: each captured fact gets a unique id derived from
// `(type, capturedPhrase)` so two distinct "我是" matches (e.g. user
// name vs. role) live in separate files instead of clobbering each
// other under one shared `用户身份` slot.
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
  // "I'm in Berlin", "I live in Amsterdam", "I'm based in Lisbon" — pin
  // the user's location so future replies can localise time/currency/
  // tone without re-asking. We deliberately exclude the role pattern
  // ("I am a/an/the …") so this doesn't double-fire on the same line.
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
  // "I want to ship a course", "I'd like to redesign the dashboard" —
  // long-running goals that change how the assistant frames every
  // related ask. Capped at 200 chars so a runaway sentence doesn't blow
  // up the body.
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
  // 我在 / 我住在 — 用户所在地。用 [在再] 同时容忍输入法常见的把
  // "在" 错按成 "再" 的拼写：用户原文 "我再德国，我希望基于…" 在过去
  // 的 pattern 表里没有任何匹配，于是只能等 LLM 兜底；现在两条都直接
  // 命中所在地与目标。
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
  // 我想 / 我希望 / 我打算 — 长期目标，常常贯穿多次对话。和"记住"
  // 这种命令式不同，这些表述往往伴随项目本身，所以归到 project 类。
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

function applyTemplate(template, captured) {
  return String(template || '').replace(/\$1/g, String(captured));
}

export async function extractFromMessage(dataDir, userMessage) {
  // Mirror the LLM extractor's skip surface so the settings panel shows
  // both extractors for the same turn — even when there's nothing to
  // record. Without this, a turn with memory disabled or an empty
  // message produces no row at all and the user can't tell whether the
  // hook ran.
  if (typeof userMessage !== 'string' || userMessage.trim().length === 0) {
    recordSkip({ userMessage: userMessage ?? '', reason: 'empty-message', kind: 'heuristic' });
    return [];
  }
  const cfg = await readMemoryConfig(dataDir);
  if (!cfg.enabled) {
    recordSkip({ userMessage, reason: 'memory-disabled', kind: 'heuristic' });
    return [];
  }
  const seen = new Set();
  const changed = [];
  for (const pattern of REMEMBER_PATTERNS) {
    const m = pattern.re.exec(userMessage);
    if (!m) continue;
    const captured = (m[1] || '').trim();
    if (captured.length < 3) continue;
    // Cap captured length so a runaway sentence doesn't blow up the
    // description / body. The regex already bounds it but we want a
    // hard ceiling for the templated fields.
    const trimmedCaptured = truncate(captured, 200);
    // Dedupe within a single message: same category + same captured
    // phrase shouldn't fire twice (two patterns matching the same
    // chunk, or the regex matching a phrase that already passed an
    // earlier pattern in this loop).
    const dedupeKey = `${pattern.type}::${pattern.name}::${trimmedCaptured.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const description = truncate(
      applyTemplate(pattern.descriptionTemplate, trimmedCaptured),
      200,
    );
    const body = applyTemplate(pattern.bodyTemplate, trimmedCaptured);
    // Each captured fact gets its own file. Deriving the id from the
    // captured phrase (rather than the stable display name) lets two
    // "我是" matches — e.g. "我是张三" then "我是软件工程师" — coexist
    // instead of overwriting one another.
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
        // Silence the per-entry upsert event so the batched 'extract'
        // emit below produces exactly one frontend toast.
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
  // Always log the heuristic attempt — even when no pattern matched —
  // so the settings panel's "Extraction history" shows a row for every
  // turn instead of leaving the user wondering whether the regex ran.
  // 0-match runs land as `phase: 'skipped'` with reason `'no-match'`.
  recordHeuristic({
    userMessage,
    writtenCount: changed.length,
    writtenIds: changed.map((c) => c.id),
  });
  return changed;
}

function truncate(s, max) {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trim()}…`;
}

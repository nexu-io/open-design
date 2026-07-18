// @ts-nocheck
// Filesystem-backed markdown memory store.
//
// Layout (under <dataDir>/memory/):
//   MEMORY.md            ← short index; one bullet per fact file
//   <type>_<slug>.md     ← per-fact body + frontmatter
//   .config.json         ← switches: { "enabled": true, "chatExtractionEnabled": false }
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
import { MEMORY_TYPES, PROFILE_MEMORY_ID, parseFormAnswers } from '@open-design/contracts';
import { parseFrontmatter } from './design-systems/frontmatter.js';
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
  source?: MemoryEntrySource;
  enabled?: boolean;
  at: number;
}

// Writer provenance. Persisted into entry frontmatter (`source:`) so later
// audits, migrations, and per-pipeline stats can tell an auto-extracted fact
// from one the user typed by hand. Entries written before this field existed
// have no marker and must be classified by content fingerprints instead.
export type MemoryEntrySource =
  | 'heuristic'
  | 'llm'
  | 'manual'
  | 'connector'
  | 'brand'
  | 'annotation';

const VALID_SOURCES = new Set<string>([
  'heuristic',
  'llm',
  'manual',
  'connector',
  'brand',
  'annotation',
]);

function emitChange(event: Omit<MemoryChangeEvent, 'at'>): void {
  memoryEvents.emit('change', { ...event, at: Date.now() });
}

const INDEX_FILE = 'MEMORY.md';
const CONFIG_FILE = '.config.json';

// Sourced from the shared contract's MEMORY_TYPES so the new `profile` /
// `rule` buckets can't drift out of sync with the type union the web UI and
// od-card payloads already speak. Canonical order: [profile, user, feedback,
// project, reference, rule].
const VALID_TYPES = new Set<string>(MEMORY_TYPES);

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
      // Chat auto-extraction (regex pack + chat-form profile capture + LLM
      // extractor) is retired by default: it minted junk facts from ordinary
      // chat text ("我在…" progressive-aspect sentences became "user
      // location"). Only an explicit opt-in (`=== true`) re-enables it;
      // injection of existing/manual memory stays governed by `enabled`.
      chatExtractionEnabled: parsed?.chatExtractionEnabled === true,
      // Two-loop memory per-hook flags. All default-ON (`!== false`) so a
      // config written before these existed still injects the profile,
      // rewrites short queries, and self-verifies output.
      profileEnabled: parsed?.profileEnabled !== false,
      rewriteEnabled: parsed?.rewriteEnabled !== false,
      verifyEnabled: parsed?.verifyEnabled !== false,
      extraction: normalizeExtractionPatch(parsed?.extraction),
    };
  } catch {
    // Injection defaults on — the whole point of the feature is to surface
    // user context across runs. Chat auto-extraction defaults OFF (see the
    // parse path above): writing memory is opt-in, reading it is not.
    return {
      enabled: true,
      chatExtractionEnabled: false,
      profileEnabled: true,
      rewriteEnabled: true,
      verifyEnabled: true,
      extraction: null,
    };
  }
}

// Patch shape:
//   { enabled?: boolean, chatExtractionEnabled?: boolean,
//     profileEnabled?: boolean, rewriteEnabled?: boolean,
//     verifyEnabled?: boolean, extraction?: object | null }
// `extraction: null` clears the override (reverting to auto-pick); an
// object replaces it whole; an absent key leaves the existing override
// untouched. The three per-hook booleans default-on and only flip when an
// explicit boolean is supplied.
export async function writeMemoryConfig(dataDir, patch) {
  const current = await readMemoryConfig(dataDir);
  const next = {
    enabled:
      typeof patch?.enabled === 'boolean' ? patch.enabled : current.enabled,
    chatExtractionEnabled:
      typeof patch?.chatExtractionEnabled === 'boolean'
        ? patch.chatExtractionEnabled
        : current.chatExtractionEnabled,
    // Per-hook flags carry forward when the patch omits them, and only flip
    // when the patch sends an explicit boolean.
    profileEnabled:
      typeof patch?.profileEnabled === 'boolean'
        ? patch.profileEnabled
        : current.profileEnabled,
    rewriteEnabled:
      typeof patch?.rewriteEnabled === 'boolean'
        ? patch.rewriteEnabled
        : current.rewriteEnabled,
    verifyEnabled:
      typeof patch?.verifyEnabled === 'boolean'
        ? patch.verifyEnabled
        : current.verifyEnabled,
    extraction: current.extraction,
  };
  if (Object.prototype.hasOwnProperty.call(patch || {}, 'extraction')) {
    next.extraction = patch.extraction === null
      ? null
      : normalizeExtractionPatch(patch.extraction);
  }
  if (typeof next.enabled !== 'boolean') next.enabled = true;
  if (typeof next.chatExtractionEnabled !== 'boolean') {
    next.chatExtractionEnabled = false;
  }
  // Default-on if a prior config or a malformed patch left these undefined.
  if (typeof next.profileEnabled !== 'boolean') next.profileEnabled = true;
  if (typeof next.rewriteEnabled !== 'boolean') next.rewriteEnabled = true;
  if (typeof next.verifyEnabled !== 'boolean') next.verifyEnabled = true;
  await ensureDir(memoryDir(dataDir));
  await fsp.writeFile(configPath(dataDir), JSON.stringify(next, null, 2));
  if (
    current.enabled !== next.enabled
    || current.chatExtractionEnabled !== next.chatExtractionEnabled
    || current.profileEnabled !== next.profileEnabled
    || current.rewriteEnabled !== next.rewriteEnabled
    || current.verifyEnabled !== next.verifyEnabled
  ) {
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
      // Absent on files written before provenance landed; those must be
      // classified by content fingerprints, never assumed manual.
      source: VALID_SOURCES.has(data?.source) ? data.source : undefined,
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

// Mirror the canonical contract order so the tree folders render
// profile-first … rule-last, matching the prompt-section order below.
const MEMORY_TREE_TYPES = [...MEMORY_TYPES];

function memoryTreeFolderId(type) {
  return `folder:${type}`;
}

function memoryTreeScopeForType(type) {
  return type === 'project' ? 'project' : 'global';
}

function toIsoTime(ms) {
  return new Date(Number.isFinite(ms) ? ms : 0).toISOString();
}

function extractAutomationRefs(body, label) {
  const refs = new Set();
  const re = new RegExp(`^${label}:\\s*([A-Za-z0-9_-]+)\\s*$`, 'gim');
  let match;
  while ((match = re.exec(String(body || ''))) !== null) {
    if (match[1]) refs.add(match[1]);
  }
  return Array.from(refs);
}

export async function buildMemoryTree(dataDir) {
  const entries = await listMemoryEntries(dataDir);
  const byType = new Map();
  for (const type of MEMORY_TREE_TYPES) byType.set(type, []);
  for (const entry of entries) {
    const list = byType.get(entry.type) ?? [];
    list.push(entry);
    byType.set(entry.type, list);
  }

  const nodes = [];
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

function renderEntryFile(name, description, type, body, source) {
  const safeName = String(name || 'Untitled').replace(/\r?\n/g, ' ').trim();
  const safeDesc = String(description || '').replace(/\r?\n/g, ' ').trim();
  const safeType = isValidType(type) ? type : 'user';
  const safeSource = VALID_SOURCES.has(source) ? source : 'manual';
  const trimmedBody = String(body || '').replace(/^\s+/, '');
  return `---\nname: ${safeName}\ndescription: ${safeDesc}\ntype: ${safeType}\nsource: ${safeSource}\n---\n\n${trimmedBody}\n`;
}

export async function updateMemoryTreeNode(dataDir, id, patch) {
  if (typeof id !== 'string' || id.startsWith('folder:')) {
    throw new Error('memory tree folders are derived and cannot be edited');
  }
  const current = await readMemoryEntry(dataDir, id);
  if (!current) throw new Error('memory not found');
  const nextType = isValidType(patch?.type) ? patch.type : current.type;
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
    renderEntryFile(name, description, type, body, options?.source ?? 'manual'),
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
  // Canonical section order: profile FIRST (the foundational "who I am / how I
  // work" facts the intent gateway expands a query against), the original four
  // in the middle, and rule LAST (the verified checks the self-verify pass
  // reads as a rubric). `profile` is gated on the per-hook `profileEnabled`
  // flag so a user can keep the rest of memory on while suppressing the
  // structured profile injection.
  const ordered = [...MEMORY_TYPES].filter((t) => {
    if (t === 'profile' && cfg.profileEnabled === false) return false;
    return grouped.has(t);
  });
  const parts = [];
  for (const type of ordered) {
    if (type === 'profile') {
      // Render the profile as a structured KEY/VALUE block of facts, not
      // prose. The body is already line-per-field (e.g. `- Role: …`), so we
      // surface those lines directly under a single heading rather than the
      // `**name** — description` shape the other buckets use.
      parts.push('### Profile');
      for (const e of grouped.get(type) ?? []) {
        const body = await readEntryBodyById(dataDir, e.id);
        if (!body) continue;
        const lines = body.trim().split(/\r?\n/);
        for (const line of lines) {
          if (line.trim().length > 0) parts.push(line.trimEnd());
        }
      }
      parts.push('');
      continue;
    }
    if (type === 'rule') {
      // Render verified rules as a rubric the self-verify (POST) pass can read
      // back: each rule shows its name plus the `Assertion:` / `Check:` lines
      // from its body so the verifier can score the output against the Check.
      parts.push('### Verified rules');
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
      continue;
    }
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

// Return the `rule` memory entries that are ACTIVE — i.e. linked in MEMORY.md
// — with their bodies. The POST self-verify enforcement (memory-verify.ts)
// reads these as the rubric an artifact turn must be checked against. We honor
// the same active-set gate composeMemoryBody uses so a rule the user removed
// from the index stops being enforced without deleting the file. Returns an
// empty array when memory is disabled (the master switch turns enforcement
// off for free).
export async function listActiveRuleEntries(dataDir) {
  const cfg = await readMemoryConfig(dataDir);
  if (!cfg.enabled) return [];
  const allEntries = await listMemoryEntries(dataDir);
  const rules = allEntries.filter((e) => e.type === 'rule');
  if (rules.length === 0) return [];
  const indexBody = await readMemoryIndex(dataDir);
  const linkedIds = parseIndexLinkIds(indexBody);
  const active = rules.filter((e) => linkedIds.has(e.id));
  const out = [];
  for (const e of active) {
    const body = await readEntryBodyById(dataDir, e.id);
    out.push({ id: e.id, name: e.name, description: e.description, body });
  }
  return out;
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

// ----- Heuristic-artifact fingerprinting -----------------------------------

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// One matcher per retired regex-pack pattern: the entry's display `name`
// must equal the pattern's fixed name AND the body must be an instance of
// its bodyTemplate (template `$1` slots widened to a wildcard). Entries from
// before source provenance landed carry no `source:` frontmatter, so this
// content fingerprint is the only reliable classifier for them.
const HEURISTIC_ARTIFACT_MATCHERS = REMEMBER_PATTERNS.map((pattern) => ({
  name: pattern.name,
  bodyRe: new RegExp(
    `^${escapeRegExp(pattern.bodyTemplate.trim()).replace(/\\\$1/g, '[\\s\\S]*')}$`,
  ),
}));

/**
 * True when a memory entry is provably an artifact of the retired chat
 * regex pack — its name matches one of the pack's fixed display names and
 * its body is an instance of that pattern's fill-in template. Used by the
 * one-time cleanup migration; LLM, connector, and hand-written entries never
 * match because their bodies are free prose, not template instances.
 */
export function isHeuristicExtractionArtifact(entry) {
  const name = typeof entry?.name === 'string' ? entry.name : '';
  const body = typeof entry?.body === 'string' ? entry.body.trim() : '';
  if (!name || !body) return false;
  return HEURISTIC_ARTIFACT_MATCHERS.some(
    (m) => m.name === name && m.bodyRe.test(body),
  );
}

// ----- Onboarding → structured profile ------------------------------------

// Form ids that should seed / update the singleton `user_profile`. Discovery
// briefs, task-type forms, and any explicitly profile-tagged form all feed the
// "who I am / how I work" facts the intent gateway expands a short query
// against. An empty id (a bare `[form answers]` header with no tag) also
// qualifies — the onboarding flow doesn't always stamp an id.
function isProfileFormId(id) {
  const lower = typeof id === 'string' ? id.trim().toLowerCase() : '';
  if (lower.length === 0) return true;
  return (
    lower.includes('discovery')
    || lower.includes('profile')
    || lower.includes('task')
  );
}

// Parse an existing profile body (line-per-field `- Label: value`) into an
// ordered label→value map so later answers ADD or overwrite individual fields
// instead of wiping unrelated ones. Lines that don't match the `- Label: …`
// shape are dropped on rewrite — the profile is a structured fact block, not
// free prose.
const PROFILE_FIELD_LINE_RE = /^\s*-\s+([^:]+):\s*(.*)$/;

// Canonical profile field labels — kept in sync with the web profile editor
// (apps/web/src/components/MemoryProfilePanel.tsx PROFILE_FIELDS). Incoming
// labels are matched case-insensitively to a canonical label so a hand-typed
// or differently-cased answer ("role") updates the existing field ("Role")
// rather than creating a duplicate entry in the merged map.
const CANONICAL_PROFILE_LABELS = [
  'Role',
  'Organization size',
  'Use cases',
  'Discovery source',
  'Company / Team',
  'Domain',
  'Primary audience',
  'Aesthetic / taste',
  'Default deliverables',
  'Locale / Language',
  'Current goals',
];

function canonicalProfileLabel(label) {
  const trimmed = String(label || '').trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  const match = CANONICAL_PROFILE_LABELS.find(
    (canonical) => canonical.toLowerCase() === lower,
  );
  return match ?? trimmed;
}

function parseProfileBody(body) {
  const map = new Map();
  for (const line of String(body || '').split(/\r?\n/)) {
    const m = PROFILE_FIELD_LINE_RE.exec(line);
    if (!m) continue;
    const label = canonicalProfileLabel(m[1] ?? '');
    const value = (m[2] ?? '').trim();
    if (!label) continue;
    map.set(label, value);
  }
  return map;
}

function renderProfileBody(map) {
  const lines = [];
  for (const [label, value] of map) {
    lines.push(`- ${label}: ${value}`);
  }
  return lines.join('\n');
}

/**
 * Reduce a user_profile body to the canonical field set the settings-panel
 * profile editor writes (`CANONICAL_PROFILE_LABELS`). Rows under any other
 * label were accumulated by the retired chat-form capture — per-project
 * discovery answers re-keyed by whatever the form question's wording was
 * ("要做什么？", "What should I build?", …) — and are dropped. Returns null
 * when no canonical row survives, i.e. the whole profile was form residue.
 */
export function pruneProfileBodyToCanonical(body) {
  const canonical = new Set(CANONICAL_PROFILE_LABELS.map((l) => l.toLowerCase()));
  const kept = new Map();
  for (const line of String(body || '').split(/\r?\n/)) {
    const m = PROFILE_FIELD_LINE_RE.exec(line);
    if (!m) continue;
    const label = canonicalProfileLabel(m[1] ?? '');
    if (!canonical.has(label.toLowerCase())) continue;
    const value = (m[2] ?? '').trim();
    if (!value) continue;
    kept.set(label, value);
  }
  if (kept.size === 0) return null;
  return renderProfileBody(kept);
}

// Merge freshly-answered form pairs into the existing profile, by label, and
// upsert the singleton `user_profile` entry. Runs synchronously pre-turn so
// the profile is visible to the SAME turn's prompt composition. Returns the
// written entry summary, or null when there was nothing to write or the
// profile hook is disabled.
async function captureProfileFromForm(dataDir, parsed) {
  if (!parsed || !Array.isArray(parsed.pairs) || parsed.pairs.length === 0) {
    return null;
  }
  // Read the existing profile (if any) and merge by label so a later
  // discovery answer adds/overwrites individual fields rather than clobbering
  // the whole block.
  const existing = await readMemoryEntry(dataDir, PROFILE_MEMORY_ID);
  const merged = parseProfileBody(existing?.body ?? '');
  for (const pair of parsed.pairs) {
    const label = canonicalProfileLabel(typeof pair?.label === 'string' ? pair.label : '');
    const value = typeof pair?.value === 'string' ? pair.value.trim() : '';
    if (!label) continue;
    merged.set(label, value);
  }
  if (merged.size === 0) return null;
  const entry = await upsertMemoryEntry(
    dataDir,
    {
      id: PROFILE_MEMORY_ID,
      type: 'profile',
      name: 'Work profile',
      description:
        'Role, audience, domain, and delivery defaults captured at onboarding.',
      body: renderProfileBody(merged),
    },
    // Silence the per-entry event; the batched 'extract' emit in
    // extractFromMessage produces exactly one toast for the turn.
    { silent: true, source: 'heuristic' },
  );
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    type: entry.type,
    updatedAt: entry.updatedAt,
  };
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
  if (!cfg.chatExtractionEnabled) {
    return [];
  }
  const seen = new Set();
  const changed = [];
  // Onboarding → profile capture. When the user's message is the round-tripped
  // answer block from a discovery / task-type / profile question-form, seed (or
  // merge into) the singleton `user_profile` BEFORE the regex pack runs so the
  // structured profile is available to this same turn's prompt. Gated on the
  // per-hook `profileEnabled` flag — when off we skip the profile write but
  // still let the ordinary heuristics below run.
  if (cfg.profileEnabled !== false) {
    const parsedForm = parseFormAnswers(userMessage);
    if (parsedForm && isProfileFormId(parsedForm.id)) {
      try {
        const profileEntry = await captureProfileFromForm(dataDir, parsedForm);
        if (profileEntry) changed.push(profileEntry);
      } catch (err) {
        console.warn('[memory] profile capture failed', err);
      }
    }
  }
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

import { mkdir, readFile, readdir, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import JSZip from 'jszip';
import type Database from 'better-sqlite3';
import {
  getProject,
  insertConversation,
  insertProject,
  setTabs,
  upsertMessage,
} from './db.js';
import { isIgnoredProjectDirName } from './project-ignored-dirs.js';
import { projectDir, resolveProjectDir } from './projects.js';

export const OPEN_DESIGN_PROJECT_BUNDLE_SCHEMA = 'open-design.project-bundle.v1';

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

const MAX_BUNDLE_FILES = 5000;
const MAX_BUNDLE_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_BUNDLE_FILE_BYTES = 25 * 1024 * 1024;

type Db = Database.Database;
type Row = Record<string, any>;

interface BuildProjectBundleOptions {
  db: Db;
  projectsRoot: string;
  projectId: string;
  metadata?: unknown;
}

interface ImportProjectBundleOptions {
  db: Db;
  projectsRoot: string;
  buffer: Buffer;
  originalName: string;
  randomId: () => string;
}

interface BundleFileEntry {
  relPath: string;
  fullPath: string;
}

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
  isDirectory: boolean;
};

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function parseJsonArray(value: unknown): unknown[] | undefined {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed : undefined;
}

function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  const parsed = parseJson(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : undefined;
}

function sanitizedMetadata(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const out = { ...(input as Record<string, unknown>) };
  delete out.baseDir;
  delete out.fromTrustedPicker;
  delete out.orchestratorWorkspace;
  return out;
}

async function collectBundleFiles(dir: string, relDir: string, out: BundleFileEntry[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err: any) {
    if (err?.code === 'ENOENT') return;
    throw err;
  }

  for (const entry of entries) {
    if (isIgnoredProjectDirName(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
    const stat = await lstat(fullPath);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      await collectBundleFiles(fullPath, relPath, out);
      continue;
    }
    if (!stat.isFile()) continue;
    out.push({ relPath, fullPath });
  }
}

function assertSafeBundlePath(name: string): string {
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (
    parts.length === 0 ||
    path.isAbsolute(name) ||
    parts.some((part) => part === '.' || part === '..')
  ) {
    throw new Error(`unsafe project bundle path: ${name}`);
  }
  return parts.join('/');
}

function rows(db: Db, sql: string, ...params: unknown[]): Row[] {
  return db.prepare(sql).all(...params) as Row[];
}

function row(db: Db, sql: string, ...params: unknown[]): Row | undefined {
  return db.prepare(sql).get(...params) as Row | undefined;
}

function bundleProjectRow(db: Db, projectId: string): Row {
  const project = row(
    db,
    `SELECT id, name, skill_id AS skillId, design_system_id AS designSystemId,
            pending_prompt AS pendingPrompt, metadata_json AS metadataJson,
            custom_instructions AS customInstructions,
            created_at AS createdAt, updated_at AS updatedAt
       FROM projects
      WHERE id = ?`,
    projectId,
  );
  if (!project) {
    const err = new Error('project not found') as Error & { code?: string };
    err.code = 'ENOENT';
    throw err;
  }
  return {
    id: project.id,
    name: project.name,
    skillId: project.skillId ?? null,
    designSystemId: project.designSystemId ?? null,
    pendingPrompt: project.pendingPrompt ?? null,
    metadata: sanitizedMetadata(parseJsonObject(project.metadataJson)),
    customInstructions: project.customInstructions ?? null,
    createdAt: Number(project.createdAt),
    updatedAt: Number(project.updatedAt),
  };
}

function bundleConversations(db: Db, projectId: string): Row[] {
  return rows(
    db,
    `SELECT id, title, session_mode AS sessionMode,
            created_at AS createdAt, updated_at AS updatedAt
       FROM conversations
      WHERE project_id = ?
      ORDER BY created_at ASC, rowid ASC`,
    projectId,
  ).map((conv) => ({
    id: conv.id,
    title: conv.title ?? null,
    sessionMode: conv.sessionMode ?? 'design',
    createdAt: Number(conv.createdAt),
    updatedAt: Number(conv.updatedAt),
  }));
}

function bundleMessages(db: Db, conversationIds: string[]): Row[] {
  if (conversationIds.length === 0) return [];
  const placeholders = conversationIds.map(() => '?').join(',');
  return rows(
    db,
    `SELECT id, conversation_id AS conversationId, role, content,
            agent_id AS agentId, agent_name AS agentName,
            events_json AS eventsJson, attachments_json AS attachmentsJson,
            comment_attachments_json AS commentAttachmentsJson,
            produced_files_json AS producedFilesJson,
            trace_object_files_json AS traceObjectFilesJson,
            feedback_json AS feedbackJson,
            pre_turn_file_names_json AS preTurnFileNamesJson,
            session_mode AS sessionMode, run_context_json AS runContextJson,
            applied_plugin_snapshot_json AS appliedPluginSnapshotJson,
            started_at AS startedAt, ended_at AS endedAt,
            position, created_at AS createdAt
       FROM messages
      WHERE conversation_id IN (${placeholders})
      ORDER BY conversation_id ASC, position ASC`,
    ...conversationIds,
  ).map((message) => ({
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content ?? '',
    agentId: message.agentId ?? null,
    agentName: message.agentName ?? null,
    events: parseJsonArray(message.eventsJson),
    attachments: parseJsonArray(message.attachmentsJson),
    commentAttachments: parseJsonArray(message.commentAttachmentsJson),
    producedFiles: parseJsonArray(message.producedFilesJson),
    traceObjectFiles: parseJsonArray(message.traceObjectFilesJson),
    feedback: parseJsonObject(message.feedbackJson),
    preTurnFileNames: parseJsonArray(message.preTurnFileNamesJson),
    sessionMode: message.sessionMode ?? null,
    runContext: parseJsonObject(message.runContextJson),
    appliedPluginSnapshot: parseJsonObject(message.appliedPluginSnapshotJson),
    startedAt: message.startedAt == null ? null : Number(message.startedAt),
    endedAt: message.endedAt == null ? null : Number(message.endedAt),
    position: Number(message.position),
    createdAt: Number(message.createdAt),
  }));
}

function bundleTabs(db: Db, projectId: string): { tabs: Row[]; state: Row | null } {
  const tabs = rows(
    db,
    `SELECT name, position, is_active AS isActive
       FROM tabs
      WHERE project_id = ?
      ORDER BY position ASC`,
    projectId,
  ).map((tab) => ({
    name: tab.name,
    position: Number(tab.position),
    isActive: Number(tab.isActive) === 1,
  }));
  const state = row(
    db,
    `SELECT updated_at AS updatedAt, state_json AS stateJson
       FROM tabs_state
      WHERE project_id = ?`,
    projectId,
  );
  return {
    tabs,
    state: state
      ? {
          updatedAt: Number(state.updatedAt),
          state: parseJsonObject(state.stateJson) ?? null,
        }
      : null,
  };
}

export async function buildOpenDesignProjectBundle(options: BuildProjectBundleOptions) {
  const project = bundleProjectRow(options.db, options.projectId);
  const projectRoot = resolveProjectDir(
    options.projectsRoot,
    options.projectId,
    options.metadata,
  );
  const fileEntries: BundleFileEntry[] = [];
  await collectBundleFiles(projectRoot, '', fileEntries);

  const conversations = bundleConversations(options.db, options.projectId);
  const messages = bundleMessages(options.db, conversations.map((conv) => String(conv.id)));
  const tabs = bundleTabs(options.db, options.projectId);

  const zip = new JSZip();
  const manifest = {
    schema: OPEN_DESIGN_PROJECT_BUNDLE_SCHEMA,
    exportedAt: new Date().toISOString(),
    sourceProjectId: options.projectId,
    includeConversations: true,
    projectName: project.name,
    counts: {
      files: fileEntries.length,
      conversations: conversations.length,
      messages: messages.length,
    },
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('db/project.json', JSON.stringify(project, null, 2));
  zip.file('db/conversations.json', JSON.stringify(conversations, null, 2));
  zip.file('db/messages.json', JSON.stringify(messages, null, 2));
  zip.file('db/tabs.json', JSON.stringify(tabs, null, 2));

  for (const entry of fileEntries) {
    const buf = await readFile(entry.fullPath);
    zip.file(`files/${entry.relPath}`, buf, { binary: true });
  }

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return { buffer, projectName: project.name };
}

function readJsonEntry<T>(entries: Map<string, Buffer>, name: string): T {
  const entry = entries.get(name);
  if (!entry) throw new Error(`missing ${name}`);
  return JSON.parse(entry.toString('utf8')) as T;
}

function unsupportedProjectBundleError(message = 'expected an Open Design project bundle') {
  const err = new Error(message) as Error & { code?: string };
  err.code = 'PROJECT_BUNDLE_UNSUPPORTED';
  return err;
}

function readBundleManifest(entries: Map<string, Buffer>): Row {
  const entry = entries.get('manifest.json');
  if (!entry) {
    throw unsupportedProjectBundleError('missing Open Design project bundle manifest');
  }
  try {
    return JSON.parse(entry.toString('utf8')) as Row;
  } catch {
    throw unsupportedProjectBundleError('unreadable Open Design project bundle manifest');
  }
}

function readBoundedBundleEntries(zip: Buffer): Map<string, Buffer> {
  const entries = readCentralDirectory(zip)
    .filter((entry) => !entry.isDirectory);
  if (entries.length > MAX_BUNDLE_FILES) {
    throw new Error('project bundle contains too many files');
  }

  let declaredBytes = 0;
  for (const entry of entries) {
    assertSafeBundlePath(entry.name);
    if (entry.uncompressedSize > MAX_BUNDLE_FILE_BYTES) {
      throw new Error(`project bundle file too large: ${entry.name}`);
    }
    declaredBytes += entry.uncompressedSize;
    if (declaredBytes > MAX_BUNDLE_TOTAL_BYTES) {
      throw new Error('project bundle is too large');
    }
  }

  const out = new Map<string, Buffer>();
  let totalBytes = 0;
  for (const entry of entries) {
    const body = readEntryBody(zip, entry);
    if (body.length > MAX_BUNDLE_FILE_BYTES) {
      throw new Error(`project bundle file too large: ${entry.name}`);
    }
    if (entry.uncompressedSize > 0 && body.length !== entry.uncompressedSize) {
      throw new Error(`project bundle entry size mismatch: ${entry.name}`);
    }
    totalBytes += body.length;
    if (totalBytes > MAX_BUNDLE_TOTAL_BYTES) {
      throw new Error('project bundle is too large');
    }
    out.set(entry.name, body);
  }
  return out;
}

function readCentralDirectory(zip: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(zip);
  const entryCount = zip.readUInt16LE(eocdOffset + 10);
  const centralSize = zip.readUInt32LE(eocdOffset + 12);
  const centralOffset = zip.readUInt32LE(eocdOffset + 16);
  if (centralOffset + centralSize > zip.length) {
    throw new Error('invalid project bundle central directory');
  }

  const entries: ZipEntry[] = [];
  let offset = centralOffset;
  for (let i = 0; i < entryCount; i += 1) {
    if (zip.readUInt32LE(offset) !== CENTRAL_SIG) {
      throw new Error('invalid project bundle central directory entry');
    }
    const flags = zip.readUInt16LE(offset + 8);
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const uncompressedSize = zip.readUInt32LE(offset + 24);
    const nameLen = zip.readUInt16LE(offset + 28);
    const extraLen = zip.readUInt16LE(offset + 30);
    const commentLen = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.slice(offset + 46, offset + 46 + nameLen).toString('utf8');
    if ((flags & 1) !== 0) {
      throw new Error('encrypted project bundle entries are not supported');
    }
    if (method !== 0 && method !== 8) {
      throw new Error(`unsupported project bundle compression method: ${method}`);
    }
    entries.push({
      name,
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
      isDirectory: name.endsWith('/'),
    });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function findEndOfCentralDirectory(zip: Buffer): number {
  const min = Math.max(0, zip.length - 0xffff - 22);
  for (let i = zip.length - 22; i >= min; i -= 1) {
    if (zip.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error('invalid project bundle: missing central directory');
}

function readEntryBody(zip: Buffer, entry: ZipEntry): Buffer {
  const offset = entry.localOffset;
  if (zip.readUInt32LE(offset) !== LOCAL_SIG) {
    throw new Error(`invalid project bundle local header: ${entry.name}`);
  }
  const nameLen = zip.readUInt16LE(offset + 26);
  const extraLen = zip.readUInt16LE(offset + 28);
  const bodyStart = offset + 30 + nameLen + extraLen;
  const bodyEnd = bodyStart + entry.compressedSize;
  if (bodyEnd > zip.length) {
    throw new Error(`project bundle entry exceeds archive: ${entry.name}`);
  }
  const compressed = zip.slice(bodyStart, bodyEnd);
  if (entry.method === 0) return Buffer.from(compressed);
  if (compressed.length === 0) return Buffer.alloc(0);
  const cap = entry.uncompressedSize > 0
    ? Math.min(entry.uncompressedSize, MAX_BUNDLE_FILE_BYTES)
    : MAX_BUNDLE_FILE_BYTES;
  return inflateRawSync(compressed, { maxOutputLength: cap });
}

function importMetadata(project: Row, originalName: string): Record<string, unknown> {
  return {
    ...(sanitizedMetadata(project.metadata) ?? {}),
    importedFrom: 'open-design-project',
    importedAt: new Date().toISOString(),
    sourceProjectId: typeof project.id === 'string' ? project.id : undefined,
    sourceFileName: originalName,
  };
}

function chooseEntryFile(files: string[], metadata: unknown): string | null {
  const metaEntry =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).entryFile
      : undefined;
  if (typeof metaEntry === 'string' && files.includes(metaEntry)) return metaEntry;
  if (files.includes('index.html')) return 'index.html';
  return files.find((file) => file.toLowerCase().endsWith('.html')) ?? null;
}

export async function importOpenDesignProjectBundle(options: ImportProjectBundleOptions) {
  const bundleEntries = readBoundedBundleEntries(options.buffer);
  const manifest = readBundleManifest(bundleEntries);
  if (manifest.schema !== OPEN_DESIGN_PROJECT_BUNDLE_SCHEMA) {
    throw unsupportedProjectBundleError();
  }

  const sourceProject = readJsonEntry<Row>(bundleEntries, 'db/project.json');
  const rawConversations = bundleEntries.has('db/conversations.json')
    ? readJsonEntry<unknown>(bundleEntries, 'db/conversations.json')
    : [];
  const rawMessages = bundleEntries.has('db/messages.json')
    ? readJsonEntry<unknown>(bundleEntries, 'db/messages.json')
    : [];
  const conversations = Array.isArray(rawConversations) ? rawConversations as Row[] : [];
  const messages = Array.isArray(rawMessages) ? rawMessages as Row[] : [];
  const tabs = bundleEntries.has('db/tabs.json')
    ? readJsonEntry<{ state?: { state?: unknown } | null; tabs?: Row[] }>(bundleEntries, 'db/tabs.json')
    : null;

  const projectId = options.randomId();
  const now = Date.now();
  const targetRoot = projectDir(options.projectsRoot, projectId);
  await mkdir(targetRoot, { recursive: true });

  const fileNames: string[] = [];
  for (const [name, body] of bundleEntries.entries()) {
    if (!name.startsWith('files/')) continue;
    const relPath = assertSafeBundlePath(name.slice('files/'.length));
    const target = path.resolve(targetRoot, relPath);
    const rootWithSep = `${path.resolve(targetRoot)}${path.sep}`;
    if (target !== path.resolve(targetRoot) && !target.startsWith(rootWithSep)) {
      throw new Error(`unsafe project bundle path: ${name}`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    fileNames.push(relPath);
  }

  const metadata = importMetadata(sourceProject, options.originalName);
  const project = options.db.transaction(() => {
    const inserted = insertProject(options.db, {
      id: projectId,
      name:
        typeof sourceProject.name === 'string' && sourceProject.name.trim()
          ? sourceProject.name.trim()
          : options.originalName.replace(/\.zip$/i, '') || 'Imported project',
      skillId: typeof sourceProject.skillId === 'string' ? sourceProject.skillId : null,
      designSystemId:
        typeof sourceProject.designSystemId === 'string'
          ? sourceProject.designSystemId
          : null,
      pendingPrompt:
        typeof sourceProject.pendingPrompt === 'string'
          ? sourceProject.pendingPrompt
          : null,
      metadata,
      customInstructions:
        typeof sourceProject.customInstructions === 'string'
          ? sourceProject.customInstructions
          : null,
      createdAt: now,
      updatedAt: now,
    });

    const conversationIdMap = new Map<string, string>();
    for (const conv of conversations) {
      if (!conv || typeof conv.id !== 'string') continue;
      const nextId = options.randomId();
      conversationIdMap.set(conv.id, nextId);
      insertConversation(options.db, {
        id: nextId,
        projectId,
        title: typeof conv.title === 'string' ? conv.title : null,
        sessionMode: conv.sessionMode,
        createdAt: typeof conv.createdAt === 'number' ? conv.createdAt : now,
        updatedAt: typeof conv.updatedAt === 'number' ? conv.updatedAt : now,
      });
    }

    for (const message of [...messages].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))) {
      if (!message || typeof message.conversationId !== 'string') continue;
      const conversationId = conversationIdMap.get(message.conversationId);
      if (!conversationId) continue;
      upsertMessage(options.db, conversationId, {
        ...message,
        id: options.randomId(),
        runId: undefined,
        runStatus: undefined,
        lastRunEventId: undefined,
      });
    }

    if (tabs?.state?.state && typeof tabs.state.state === 'object') {
      setTabs(options.db, projectId, tabs.state.state as any);
    } else if (Array.isArray(tabs?.tabs) && tabs.tabs.length > 0) {
      const tabNames = tabs.tabs
        .map((tab) => (typeof tab.name === 'string' ? tab.name : ''))
        .filter(Boolean);
      const active = tabs.tabs.find((tab) => tab.isActive)?.name ?? tabNames[0] ?? null;
      setTabs(options.db, projectId, tabNames, active);
    } else {
      const entryFile = chooseEntryFile(fileNames, metadata);
      setTabs(options.db, projectId, entryFile ? [entryFile] : [], entryFile);
    }

    if (conversationIdMap.size === 0) {
      const conversationId = options.randomId();
      insertConversation(options.db, {
        id: conversationId,
        projectId,
        title: 'Imported project',
        sessionMode: 'design',
        createdAt: now,
        updatedAt: now,
      });
      conversationIdMap.set('', conversationId);
    }

    return {
      project: inserted ?? getProject(options.db, projectId),
      conversationId: conversationIdMap.values().next().value as string,
      entryFile: chooseEntryFile(fileNames, metadata),
      files: fileNames,
    };
  })();

  return project;
}

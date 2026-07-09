import { mkdir, readFile, readdir, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
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

async function readJsonEntry<T>(zip: JSZip, name: string): Promise<T> {
  const entry = zip.file(name);
  if (!entry) throw new Error(`missing ${name}`);
  return JSON.parse(await entry.async('string')) as T;
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
  const zip = await JSZip.loadAsync(options.buffer);
  const manifest = await readJsonEntry<Row>(zip, 'manifest.json');
  if (manifest.schema !== OPEN_DESIGN_PROJECT_BUNDLE_SCHEMA) {
    const err = new Error('expected an Open Design project bundle') as Error & { code?: string };
    err.code = 'PROJECT_BUNDLE_UNSUPPORTED';
    throw err;
  }

  const sourceProject = await readJsonEntry<Row>(zip, 'db/project.json');
  const rawConversations = zip.file('db/conversations.json')
    ? await readJsonEntry<unknown>(zip, 'db/conversations.json')
    : [];
  const rawMessages = zip.file('db/messages.json')
    ? await readJsonEntry<unknown>(zip, 'db/messages.json')
    : [];
  const conversations = Array.isArray(rawConversations) ? rawConversations as Row[] : [];
  const messages = Array.isArray(rawMessages) ? rawMessages as Row[] : [];
  const tabs = zip.file('db/tabs.json')
    ? await readJsonEntry<{ state?: { state?: unknown } | null; tabs?: Row[] }>(zip, 'db/tabs.json')
    : null;

  const projectId = options.randomId();
  const now = Date.now();
  const targetRoot = projectDir(options.projectsRoot, projectId);
  await mkdir(targetRoot, { recursive: true });

  const fileNames: string[] = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !entry.name.startsWith('files/')) continue;
    const relPath = assertSafeBundlePath(entry.name.slice('files/'.length));
    const target = path.resolve(targetRoot, relPath);
    const rootWithSep = `${path.resolve(targetRoot)}${path.sep}`;
    if (target !== path.resolve(targetRoot) && !target.startsWith(rootWithSep)) {
      throw new Error(`unsafe project bundle path: ${entry.name}`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await entry.async('nodebuffer'));
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

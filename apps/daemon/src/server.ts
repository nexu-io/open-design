// @ts-nocheck
import express from 'express';
import multer from 'multer';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { composeSystemPrompt } from './prompts/system.js';
import {
  detectAgents,
  getAgentDef,
  isKnownModel,
  resolveAgentBin,
  sanitizeCustomModel,
} from './agents.js';
import { listSkills } from './skills.js';
import { listDesignSystems, readDesignSystem } from './design-systems.js';
import { attachAcpSession } from './acp.js';
import { attachPiRpcSession } from './pi-rpc.js';
import { createClaudeStreamHandler } from './claude-stream.js';
import { createCopilotStreamHandler } from './copilot-stream.js';
import { createJsonEventStreamHandler } from './json-event-stream.js';
import { renderDesignSystemPreview } from './design-system-preview.js';
import { renderDesignSystemShowcase } from './design-system-showcase.js';
import { createChatRunService } from './runs.js';
import { importClaudeDesignZip } from './claude-design-import.js';
import { buildDocumentPreview } from './document-preview.js';
import { lintArtifact, renderFindingsForAgent } from './lint-artifact.js';
import {
  decodeMultipartFilename,
  deleteProjectFile,
  ensureProject,
  listFiles,
  projectDir,
  readProjectFile,
  removeProjectDir,
  sanitizeName,
  writeProjectFile,
} from './projects.js';
import { validateArtifactManifestInput } from './artifact-manifest.js';
import {
  deleteConversation,
  deleteProject as dbDeleteProject,
  deleteTemplate,
  getConversation,
  getProject,
  getTemplate,
  insertConversation,
  insertProject,
  insertTemplate,
  listProjectsAwaitingInput,
  listConversations,
  listLatestProjectRunStatuses,
  listMessages,
  listProjects,
  listTabs,
  listTemplates,
  openDatabase,
  setTabs,
  updateConversation,
  updateProject,
  upsertMessage,
} from './db.js';

/** @typedef {import('@open-design/contracts').ApiErrorCode} ApiErrorCode */
/** @typedef {import('@open-design/contracts').ApiError} ApiError */
/** @typedef {import('@open-design/contracts').ApiErrorResponse} ApiErrorResponse */
/** @typedef {import('@open-design/contracts').ChatRequest} ChatRequest */
/** @typedef {import('@open-design/contracts').ChatSseEvent} ChatSseEvent */
/** @typedef {import('@open-design/contracts').ProxyStreamRequest} ProxyStreamRequest */
/** @typedef {import('@open-design/contracts').ProxySseEvent} ProxySseEvent */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export function resolveProjectRoot(moduleDir: string): string {
  const base = path.basename(moduleDir);
  const daemonDir = base === 'dist' || base === 'src'
    ? path.dirname(moduleDir)
    : moduleDir;
  return path.resolve(daemonDir, '../..');
}

const PROJECT_ROOT = resolveProjectRoot(__dirname);
// Built web app lives in `out/` — that's where Next.js writes the static
// export configured in next.config.ts. The folder name used to be `dist/`
// when this project shipped with Vite; the daemon serves whatever the
// frontend toolchain emits, no further config needed.
const STATIC_DIR = path.join(PROJECT_ROOT, 'apps', 'web', 'out');
const SKILLS_DIR = path.join(PROJECT_ROOT, 'skills');
const DESIGN_SYSTEMS_DIR = path.join(PROJECT_ROOT, 'design-systems');
const RUNTIME_DATA_DIR = process.env.OD_DATA_DIR
  ? path.resolve(PROJECT_ROOT, process.env.OD_DATA_DIR)
  : path.join(PROJECT_ROOT, '.od');
const ARTIFACTS_DIR = path.join(RUNTIME_DATA_DIR, 'artifacts');
const PROJECTS_DIR = path.join(RUNTIME_DATA_DIR, 'projects');
fs.mkdirSync(PROJECTS_DIR, { recursive: true });

// Windows ENAMETOOLONG mitigation constants
const CMD_BAT_RE = /\.(cmd|bat)$/i;
const PROMPT_TEMP_FILE = () =>
  '.od-prompt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.md';
const promptFileBootstrap = (fp) =>
  `Your full instructions are stored in the file: ${fp.replace(/\\/g, '/')}. ` +
  'Open that file first and follow every instruction in it exactly — ' +
  'it contains the system prompt, design system, skill workflow, and user request. ' +
  'Do not begin your response until you have read the entire file.';
export const SSE_KEEPALIVE_INTERVAL_MS = 25_000;

export function normalizeProjectDisplayStatus(status) {
  return status === 'starting' || status === 'queued' ? 'running' : status;
}

export function composeProjectDisplayStatus(baseStatus, awaitingInputProjects, projectId) {
  if (baseStatus.value === 'succeeded' && awaitingInputProjects.has(projectId)) {
    return { ...baseStatus, value: 'awaiting_input' };
  }
  return {
    ...baseStatus,
    value: normalizeProjectDisplayStatus(baseStatus.value),
  };
}

/**
 * @param {ApiErrorCode} code
 * @param {string} message
 * @param {Omit<ApiError, 'code' | 'message'>} [init]
 * @returns {ApiError}
 */
export function createCompatApiError(code, message, init = {}) {
  return { code, message, ...init };
}

/**
 * @param {ApiErrorCode} code
 * @param {string} message
 * @param {Omit<ApiError, 'code' | 'message'>} [init]
 * @returns {ApiErrorResponse}
 */
export function createCompatApiErrorResponse(code, message, init = {}) {
  return { error: createCompatApiError(code, message, init) };
}

/**
 * @param {import('express').Response} res
 * @param {number} status
 * @param {ApiErrorCode} code
 * @param {string} message
 * @param {Omit<ApiError, 'code' | 'message'>} [init]
 */
function sendApiError(res, status, code, message, init = {}) {
  return res.status(status).json(createCompatApiErrorResponse(code, message, init));
}

/**
 * @param {ApiErrorCode} code
 * @param {string} message
 * @param {Omit<ApiError, 'code' | 'message'>} [init]
 */
function createSseErrorPayload(code, message, init = {}) {
  return { message, error: createCompatApiError(code, message, init) };
}

const UPLOAD_DIR = path.join(os.tmpdir(), 'od-uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      file.originalname = decodeMultipartFilename(file.originalname);
      const safe = sanitizeName(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const importUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      file.originalname = decodeMultipartFilename(file.originalname);
      const safe = sanitizeName(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
});

// Project-scoped multi-file upload. Lands files directly in the project
// folder (flat — same shape FileWorkspace expects), so the composer's
// pasted/dropped/picked images become referenceable filenames the agent
// can Read or @-mention without any cross-folder gymnastics.
const projectUpload = multer({
  storage: multer.diskStorage({
    destination: async (req, _file, cb) => {
      try {
        const dir = await ensureProject(PROJECTS_DIR, req.params.id);
        cb(null, dir);
      } catch (err) {
        cb(err, '');
      }
    },
    filename: (_req, file, cb) => {
      // multer@1 hands us latin1-decoded multipart filenames; restore the
      // original UTF-8 so the response (and the on-disk name) preserves
      // non-ASCII characters instead of mangling them. Then run the
      // shared sanitiser and prepend a base36 timestamp so multiple
      // uploads with the same original name don't clobber each other.
      file.originalname = decodeMultipartFilename(file.originalname);
      const safe = sanitizeName(file.originalname);
      cb(null, `${Date.now().toString(36)}-${safe}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

function handleProjectUpload(req, res, next) {
  projectUpload.array('files', 12)(req, res, (err) => {
    if (err) {
      return sendMulterError(res, err);
    }
    next();
  });
}

function sendMulterError(res, err) {
  if (err instanceof multer.MulterError) {
    const code = err.code || 'UPLOAD_ERROR';
    const statusByCode = {
      LIMIT_FILE_SIZE: 413,
      LIMIT_FILE_COUNT: 400,
      LIMIT_UNEXPECTED_FILE: 400,
      LIMIT_PART_COUNT: 400,
      LIMIT_FIELD_KEY: 400,
      LIMIT_FIELD_VALUE: 400,
      LIMIT_FIELD_COUNT: 400,
    };
    const errorByCode = {
      LIMIT_FILE_SIZE: 'file too large',
      LIMIT_FILE_COUNT: 'too many files',
      LIMIT_UNEXPECTED_FILE: 'unexpected file field',
      LIMIT_PART_COUNT: 'too many form parts',
      LIMIT_FIELD_KEY: 'field name too long',
      LIMIT_FIELD_VALUE: 'field value too long',
      LIMIT_FIELD_COUNT: 'too many form fields',
    };
    const status = statusByCode[code] ?? 400;
    const message = errorByCode[code] ?? 'upload failed';
    return sendApiError(
      res,
      status,
      code === 'LIMIT_FILE_SIZE' ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
      message,
      { details: { legacyCode: code } },
    );
  }

  if (err) {
    return sendApiError(res, 500, 'INTERNAL_ERROR', 'upload failed');
  }

  return sendApiError(res, 500, 'INTERNAL_ERROR', 'upload failed');
}

export function createSseResponse(res, { keepAliveIntervalMs = SSE_KEEPALIVE_INTERVAL_MS } = {}) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const canWrite = () => !res.destroyed && !res.writableEnded;
  const writeKeepAlive = () => {
    if (canWrite()) {
      res.write(': keepalive\n\n');
      return true;
    }
    return false;
  };

  let heartbeat = null;
  if (keepAliveIntervalMs > 0) {
    heartbeat = setInterval(writeKeepAlive, keepAliveIntervalMs);
    heartbeat.unref?.();
  }

  const cleanup = () => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  res.on('close', cleanup);
  res.on('finish', cleanup);

  return {
    /** @param {ChatSseEvent['event'] | ProxySseEvent['event'] | string} event */
    send(event, data, id = null) {
      if (!canWrite()) return false;
      if (id !== null && id !== undefined) res.write(`id: ${id}\n`);
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      return true;
    },
    writeKeepAlive,
    cleanup,
    end() {
      cleanup();
      if (canWrite()) {
        res.end();
      }
    },
  };
}

export async function startServer({ port = 7456, returnServer = false } = {}) {
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  const db = openDatabase(PROJECT_ROOT, { dataDir: RUNTIME_DATA_DIR });

  if (process.env.OD_CODEX_DISABLE_PLUGINS === '1') {
    console.log('[od] Codex plugins disabled via OD_CODEX_DISABLE_PLUGINS=1');
  }

  // Warm agent-capability probes (e.g. whether the installed Claude Code
  // build advertises --include-partial-messages) so the first /api/chat
  // hits a populated cache even if /api/agents hasn't been called yet.
  void detectAgents().catch(() => {});

  if (fs.existsSync(STATIC_DIR)) {
    app.use(express.static(STATIC_DIR));
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, version: '0.1.0' });
  });

  // ---- Projects (DB-backed) -------------------------------------------------

  app.get('/api/projects', (_req, res) => {
    try {
      const latestRunStatuses = listLatestProjectRunStatuses(db);
      const awaitingInputProjects = listProjectsAwaitingInput(db);
      const activeRunStatuses = new Map();
      for (const run of design.runs.list()) {
        if (!run.projectId) continue;
        const runStatus = projectStatusFromRun(run);
        if (design.runs.isTerminal(run.status)) {
          const existing = latestRunStatuses.get(run.projectId);
          if (!existing || run.updatedAt > (existing.updatedAt ?? 0)) {
            latestRunStatuses.set(run.projectId, runStatus);
          }
        } else {
          const existing = activeRunStatuses.get(run.projectId);
          if (!existing || run.updatedAt > (existing.updatedAt ?? 0)) {
            activeRunStatuses.set(run.projectId, runStatus);
          }
        }
      }
      /** @type {import('@open-design/contracts').ProjectsResponse} */
      const body = {
        projects: listProjects(db).map((project) => ({
          ...project,
          status: composeProjectDisplayStatus(
            activeRunStatuses.get(project.id) ?? latestRunStatuses.get(project.id) ?? { value: 'not_started' },
            awaitingInputProjects,
            project.id,
          ),
        })),
      };
      res.json(body);
    } catch (err) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  function projectStatusFromRun(run) {
    return {
      value: normalizeProjectDisplayStatus(run.status),
      updatedAt: run.updatedAt,
      runId: run.id,
    };
  }

  app.post('/api/projects', async (req, res) => {
    try {
      const { id, name, skillId, designSystemId, pendingPrompt, metadata } =
        req.body || {};
      if (typeof id !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(id)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'invalid project id');
      }
      if (typeof name !== 'string' || !name.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'name required');
      }
      const now = Date.now();
      const project = insertProject(db, {
        id,
        name: name.trim(),
        skillId: skillId ?? null,
        designSystemId: designSystemId ?? null,
        pendingPrompt: pendingPrompt || null,
        metadata: metadata && typeof metadata === 'object' ? metadata : null,
        createdAt: now,
        updatedAt: now,
      });
      // Seed a default conversation so the UI always has somewhere to write.
      const cid = randomId();
      insertConversation(db, {
        id: cid,
        projectId: id,
        title: null,
        createdAt: now,
        updatedAt: now,
      });
      // For "from template" projects, seed the chosen template's snapshot
      // HTML into the new project folder so the agent can Read/edit files
      // on disk (the system prompt also embeds them, but a real on-disk
      // copy lets the agent treat them as the project's working state).
      if (
        metadata &&
        typeof metadata === 'object' &&
        metadata.kind === 'template' &&
        typeof metadata.templateId === 'string'
      ) {
        const tpl = getTemplate(db, metadata.templateId);
        if (tpl && Array.isArray(tpl.files) && tpl.files.length > 0) {
          await ensureProject(PROJECTS_DIR, id);
          for (const f of tpl.files) {
            if (!f || typeof f.name !== 'string' || typeof f.content !== 'string') {
              continue;
            }
            try {
              await writeProjectFile(
                PROJECTS_DIR,
                id,
                f.name,
                Buffer.from(f.content, 'utf8'),
              );
            } catch {
              // Skip individual file failures — the template snapshot is
              // best-effort; the agent still has the embedded copy.
            }
          }
        }
      }
      /** @type {import('@open-design/contracts').CreateProjectResponse} */
      const body = { project, conversationId: cid };
      res.json(body);
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.post('/api/import/claude-design', importUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'zip file required' });
      const originalName = req.file.originalname || 'Claude Design export.zip';
      if (!/\.zip$/i.test(originalName)) {
        fs.promises.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ error: 'expected a .zip file' });
      }
      const id = randomId();
      const now = Date.now();
      const baseName = originalName.replace(/\.zip$/i, '').trim() || 'Claude Design import';
      const imported = await importClaudeDesignZip(req.file.path, projectDir(PROJECTS_DIR, id));
      fs.promises.unlink(req.file.path).catch(() => {});

      const project = insertProject(db, {
        id,
        name: baseName,
        skillId: null,
        designSystemId: null,
        pendingPrompt: `Imported from Claude Design ZIP: ${originalName}. Continue editing ${imported.entryFile}.`,
        metadata: {
          kind: 'prototype',
          importedFrom: 'claude-design',
          entryFile: imported.entryFile,
          sourceFileName: originalName,
        },
        createdAt: now,
        updatedAt: now,
      });
      const cid = randomId();
      insertConversation(db, {
        id: cid,
        projectId: id,
        title: 'Imported Claude Design project',
        createdAt: now,
        updatedAt: now,
      });
      setTabs(db, id, [imported.entryFile], imported.entryFile);
      res.json({
        project,
        conversationId: cid,
        entryFile: imported.entryFile,
        files: imported.files,
      });
    } catch (err) {
      if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
      res.status(400).json({ error: String(err) });
    }
  });

  app.get('/api/projects/:id', (req, res) => {
    const project = getProject(db, req.params.id);
    if (!project) return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
    /** @type {import('@open-design/contracts').ProjectResponse} */
    const body = { project };
    res.json(body);
  });

  app.patch('/api/projects/:id', (req, res) => {
    try {
      const patch = req.body || {};
      const project = updateProject(db, req.params.id, patch);
      if (!project) return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
      /** @type {import('@open-design/contracts').ProjectResponse} */
      const body = { project };
      res.json(body);
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.delete('/api/projects/:id', async (req, res) => {
    try {
      dbDeleteProject(db, req.params.id);
      await removeProjectDir(PROJECTS_DIR, req.params.id).catch(() => {});
      /** @type {import('@open-design/contracts').OkResponse} */
      const body = { ok: true };
      res.json(body);
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // ---- Conversations --------------------------------------------------------

  app.get('/api/projects/:id/conversations', (req, res) => {
    if (!getProject(db, req.params.id)) {
      return res.status(404).json({ error: 'project not found' });
    }
    res.json({ conversations: listConversations(db, req.params.id) });
  });

  app.post('/api/projects/:id/conversations', (req, res) => {
    if (!getProject(db, req.params.id)) {
      return res.status(404).json({ error: 'project not found' });
    }
    const { title } = req.body || {};
    const now = Date.now();
    const conv = insertConversation(db, {
      id: randomId(),
      projectId: req.params.id,
      title: typeof title === 'string' ? title.trim() || null : null,
      createdAt: now,
      updatedAt: now,
    });
    res.json({ conversation: conv });
  });

  app.patch('/api/projects/:id/conversations/:cid', (req, res) => {
    const conv = getConversation(db, req.params.cid);
    if (!conv || conv.projectId !== req.params.id) {
      return res.status(404).json({ error: 'not found' });
    }
    const updated = updateConversation(db, req.params.cid, req.body || {});
    res.json({ conversation: updated });
  });

  app.delete('/api/projects/:id/conversations/:cid', (req, res) => {
    const conv = getConversation(db, req.params.cid);
    if (!conv || conv.projectId !== req.params.id) {
      return res.status(404).json({ error: 'not found' });
    }
    deleteConversation(db, req.params.cid);
    res.json({ ok: true });
  });

  // ---- Messages -------------------------------------------------------------

  app.get(
    '/api/projects/:id/conversations/:cid/messages',
    (req, res) => {
      const conv = getConversation(db, req.params.cid);
      if (!conv || conv.projectId !== req.params.id) {
        return res.status(404).json({ error: 'conversation not found' });
      }
      res.json({ messages: listMessages(db, req.params.cid) });
    },
  );

  app.put(
    '/api/projects/:id/conversations/:cid/messages/:mid',
    (req, res) => {
      const conv = getConversation(db, req.params.cid);
      if (!conv || conv.projectId !== req.params.id) {
        return res.status(404).json({ error: 'conversation not found' });
      }
      const m = req.body || {};
      if (m.id && m.id !== req.params.mid) {
        return res.status(400).json({ error: 'id mismatch' });
      }
      const saved = upsertMessage(db, req.params.cid, { ...m, id: req.params.mid });
      // Bump the parent project's updatedAt so the project list re-orders.
      updateProject(db, req.params.id, {});
      res.json({ message: saved });
    },
  );

  // ---- Tabs -----------------------------------------------------------------

  app.get('/api/projects/:id/tabs', (req, res) => {
    if (!getProject(db, req.params.id)) {
      return res.status(404).json({ error: 'project not found' });
    }
    res.json(listTabs(db, req.params.id));
  });

  app.put('/api/projects/:id/tabs', (req, res) => {
    if (!getProject(db, req.params.id)) {
      return res.status(404).json({ error: 'project not found' });
    }
    const { tabs = [], active = null } = req.body || {};
    if (!Array.isArray(tabs) || !tabs.every((t) => typeof t === 'string')) {
      return res.status(400).json({ error: 'tabs must be string[]' });
    }
    const result = setTabs(
      db,
      req.params.id,
      tabs,
      typeof active === 'string' ? active : null,
    );
    res.json(result);
  });

  // ---- Templates ----------------------------------------------------------
  // User-saved snapshots of a project's HTML files. Surfaced in the
  // "From template" tab of the new-project panel so a user can spin up
  // a fresh project pre-seeded with another project's design as a
  // starting point. Created via the project's Share menu (snapshots
  // every .html file in the project folder at the moment of save).

  app.get('/api/templates', (_req, res) => {
    res.json({ templates: listTemplates(db) });
  });

  app.get('/api/templates/:id', (req, res) => {
    const t = getTemplate(db, req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    res.json({ template: t });
  });

  app.post('/api/templates', async (req, res) => {
    try {
      const { name, description, sourceProjectId } = req.body || {};
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name required' });
      }
      if (typeof sourceProjectId !== 'string') {
        return res.status(400).json({ error: 'sourceProjectId required' });
      }
      if (!getProject(db, sourceProjectId)) {
        return res.status(404).json({ error: 'source project not found' });
      }
      // Snapshot every HTML / sketch / text file in the source project.
      // We deliberately skip binary uploads — templates are about the
      // generated design, not the user's reference imagery.
      const files = await listFiles(PROJECTS_DIR, sourceProjectId);
      const snapshot = [];
      for (const f of files) {
        if (f.kind !== 'html' && f.kind !== 'text' && f.kind !== 'code') continue;
        const entry = await readProjectFile(PROJECTS_DIR, sourceProjectId, f.name);
        if (entry && Buffer.isBuffer(entry.buffer)) {
          snapshot.push({ name: f.name, content: entry.buffer.toString('utf8') });
        }
      }
      const t = insertTemplate(db, {
        id: randomId(),
        name: name.trim(),
        description: typeof description === 'string' ? description : null,
        sourceProjectId,
        files: snapshot,
        createdAt: Date.now(),
      });
      res.json({ template: t });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.delete('/api/templates/:id', (req, res) => {
    deleteTemplate(db, req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/agents', async (_req, res) => {
    try {
      const list = await detectAgents();
      res.json({ agents: list });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/skills', async (_req, res) => {
    try {
      const skills = await listSkills(SKILLS_DIR);
      // Strip full body + on-disk dir from the listing — frontend fetches the
      // body via /api/skills/:id when needed (keeps the listing payload small).
      res.json({
        skills: skills.map(({ body, dir: _dir, ...rest }) => ({
          ...rest,
          hasBody: typeof body === 'string' && body.length > 0,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/skills/:id', async (req, res) => {
    try {
      const skills = await listSkills(SKILLS_DIR);
      const skill = skills.find((s) => s.id === req.params.id);
      if (!skill) return res.status(404).json({ error: 'skill not found' });
      const { dir: _dir, ...serializable } = skill;
      res.json(serializable);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/design-systems', async (_req, res) => {
    try {
      const systems = await listDesignSystems(DESIGN_SYSTEMS_DIR);
      res.json({
        designSystems: systems.map(({ body, ...rest }) => rest),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/design-systems/:id', async (req, res) => {
    try {
      const body = await readDesignSystem(DESIGN_SYSTEMS_DIR, req.params.id);
      if (body === null) return res.status(404).json({ error: 'design system not found' });
      res.json({ id: req.params.id, body });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Showcase HTML for a design system — palette swatches, typography
  // samples, sample components, and the full DESIGN.md rendered as prose.
  // Built at request time from the on-disk DESIGN.md so any update to the
  // file shows up on the next view, no rebuild needed.
  app.get('/api/design-systems/:id/preview', async (req, res) => {
    try {
      const body = await readDesignSystem(DESIGN_SYSTEMS_DIR, req.params.id);
      if (body === null) return res.status(404).type('text/plain').send('not found');
      const html = renderDesignSystemPreview(req.params.id, body);
      res.type('text/html').send(html);
    } catch (err) {
      res.status(500).type('text/plain').send(String(err));
    }
  });

  // Marketing-style showcase derived from the same DESIGN.md — full landing
  // page parameterised by the system's tokens. Same lazy-render strategy as
  // /preview: built at request time, no caching.
  app.get('/api/design-systems/:id/showcase', async (req, res) => {
    try {
      const body = await readDesignSystem(DESIGN_SYSTEMS_DIR, req.params.id);
      if (body === null) return res.status(404).type('text/plain').send('not found');
      const html = renderDesignSystemShowcase(req.params.id, body);
      res.type('text/html').send(html);
    } catch (err) {
      res.status(500).type('text/plain').send(String(err));
    }
  });

  // Pre-built example HTML for a skill — what a typical artifact from this
  // skill looks like. Lets users browse skills without running an agent.
  //
  // The skill's `id` (from SKILL.md frontmatter `name`) can differ from its
  // on-disk folder name (e.g. id `magazine-web-ppt` lives in `skills/guizang-ppt/`),
  // so we resolve the actual directory via listSkills() rather than guessing.
  //
  // Resolution order:
  //   1. <skillDir>/example.html — fully-baked static example (preferred)
  //   2. <skillDir>/assets/template.html  +
  //      <skillDir>/assets/example-slides.html — assemble at request time
  //      by replacing the `<!-- SLIDES_HERE -->` marker with the snippet
  //      and patching the placeholder <title>. Lets a skill ship one
  //      canonical seed plus a small content fragment, so the example
  //      never drifts from the seed.
  //   3. <skillDir>/assets/template.html — raw template, no content slides
  //   4. <skillDir>/assets/index.html — generic fallback
  app.get('/api/skills/:id/example', async (req, res) => {
    try {
      const skills = await listSkills(SKILLS_DIR);
      const skill = skills.find((s) => s.id === req.params.id);
      if (!skill) {
        return res.status(404).type('text/plain').send('skill not found');
      }

      const baked = path.join(skill.dir, 'example.html');
      if (fs.existsSync(baked)) {
        return res.type('text/html').sendFile(baked);
      }

      const tpl = path.join(skill.dir, 'assets', 'template.html');
      const slides = path.join(skill.dir, 'assets', 'example-slides.html');
      if (fs.existsSync(tpl) && fs.existsSync(slides)) {
        try {
          const tplHtml = await fs.promises.readFile(tpl, 'utf8');
          const slidesHtml = await fs.promises.readFile(slides, 'utf8');
          const assembled = assembleExample(tplHtml, slidesHtml, skill.name);
          return res.type('text/html').send(assembled);
        } catch {
          // Fall through to raw template on read failure.
        }
      }
      if (fs.existsSync(tpl)) {
        return res.type('text/html').sendFile(tpl);
      }
      const idx = path.join(skill.dir, 'assets', 'index.html');
      if (fs.existsSync(idx)) {
        return res.type('text/html').sendFile(idx);
      }
      res
        .status(404)
        .type('text/plain')
        .send('no example.html, assets/template.html, or assets/index.html for this skill');
    } catch (err) {
      res.status(500).type('text/plain').send(String(err));
    }
  });

  app.post('/api/upload', upload.array('images', 8), (req, res) => {
    const files = (req.files || []).map((f) => ({
      name: f.originalname,
      path: f.path,
      size: f.size,
    }));
    res.json({ files });
  });

  // Persist a generated artifact (HTML) to disk so the user can re-open it
  // in their browser or hand it off. Returns the on-disk path + a served URL.
  // The body is also passed through the anti-slop linter; findings are
  // returned alongside the path so the UI can render a P0/P1 badge and the
  // chat layer can splice them into a system reminder for the agent.
  app.post('/api/artifacts/save', (req, res) => {
    try {
      const { identifier, title, html } = req.body || {};
      if (typeof html !== 'string' || html.length === 0) {
        return res.status(400).json({ error: 'html required' });
      }
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      const slug = sanitizeSlug(identifier || title || 'artifact');
      const dir = path.join(ARTIFACTS_DIR, `${stamp}-${slug}`);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, 'index.html');
      fs.writeFileSync(file, html, 'utf8');
      const findings = lintArtifact(html);
      res.json({
        path: file,
        url: `/artifacts/${path.basename(dir)}/index.html`,
        lint: findings,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Standalone lint endpoint — POST raw HTML, get findings back.
  // The chat layer uses this to lint streamed-in artifacts without writing
  // them to disk first, so a P0 issue can be surfaced before save.
  app.post('/api/artifacts/lint', (req, res) => {
    try {
      const { html } = req.body || {};
      if (typeof html !== 'string' || html.length === 0) {
        return res.status(400).json({ error: 'html required' });
      }
      const findings = lintArtifact(html);
      res.json({
        findings,
        agentMessage: renderFindingsForAgent(findings),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.use('/artifacts', express.static(ARTIFACTS_DIR));

  // Shared device frames (iPhone, Android, iPad, MacBook, browser chrome).
  // Skills can compose multi-screen / multi-device layouts by pointing at
  // these files via `<iframe src="/frames/iphone-15-pro.html?screen=...">`.
  // No mtime-based caching — frames are static and small.
  app.use('/frames', express.static(path.join(PROJECT_ROOT, 'assets', 'frames')));

  // Project files. Each project owns a flat folder under .od/projects/<id>/
  // containing every file the user has uploaded, pasted, sketched, or that
  // the agent has generated. Names are sanitized; paths are confined to the
  // project's own folder (see apps/daemon/src/projects.ts).
  app.get('/api/projects/:id/files', async (req, res) => {
    try {
      const files = await listFiles(PROJECTS_DIR, req.params.id);
      /** @type {import('@open-design/contracts').ProjectFilesResponse} */
      const body = { files };
      res.json(body);
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.get('/api/projects/:id/raw/*', async (req, res) => {
    try {
      const relPath = req.params[0];
      const file = await readProjectFile(PROJECTS_DIR, req.params.id, relPath);
      res.type(file.mime).send(file.buffer);
    } catch (err) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(res, status, status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST', String(err));
    }
  });

  app.delete('/api/projects/:id/raw/*', async (req, res) => {
    try {
      await deleteProjectFile(PROJECTS_DIR, req.params.id, req.params[0]);
      /** @type {import('@open-design/contracts').DeleteProjectFileResponse} */
      const body = { ok: true };
      res.json(body);
    } catch (err) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(res, status, status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST', String(err));
    }
  });

  app.get('/api/projects/:id/files/:name/preview', async (req, res) => {
    try {
      const file = await readProjectFile(PROJECTS_DIR, req.params.id, req.params.name);
      const preview = await buildDocumentPreview(file);
      res.json(preview);
    } catch (err) {
      const status = err && err.statusCode ? err.statusCode : err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(res, status, status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST', err?.message || 'preview unavailable');
    }
  });

  app.get('/api/projects/:id/files/:name', async (req, res) => {
    try {
      const file = await readProjectFile(PROJECTS_DIR, req.params.id, req.params.name);
      res.type(file.mime).send(file.buffer);
    } catch (err) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(res, status, status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST', String(err));
    }
  });

  // Two ways to upload: multipart for binary files (images), and JSON
  // {name, content, encoding} for sketches and pasted text. The frontend
  // uses both depending on the file source.
  app.post(
    '/api/projects/:id/files',
    (req, res, next) => {
      upload.single('file')(req, res, (err) => {
        if (err) return sendMulterError(res, err);
        next();
      });
    },
    async (req, res) => {
      try {
        await ensureProject(PROJECTS_DIR, req.params.id);
        if (req.file) {
          const buf = await fs.promises.readFile(req.file.path);
          const desiredName = sanitizeName(req.body?.name || req.file.originalname);
          const meta = await writeProjectFile(
            PROJECTS_DIR,
            req.params.id,
            desiredName,
            buf,
          );
          fs.promises.unlink(req.file.path).catch(() => {});
          /** @type {import('@open-design/contracts').ProjectFileResponse} */
          const body = { file: meta };
          return res.json(body);
        }
        const { name, content, encoding, artifactManifest } = req.body || {};
        if (typeof name !== 'string' || typeof content !== 'string') {
          return sendApiError(res, 400, 'BAD_REQUEST', 'name and content required');
        }
        if (artifactManifest !== undefined && artifactManifest !== null) {
          const validated = validateArtifactManifestInput(artifactManifest, name);
          if (!validated.ok) {
            return sendApiError(res, 400, 'BAD_REQUEST', `invalid artifactManifest: ${validated.error}`);
          }
        }
        const buf =
          encoding === 'base64'
            ? Buffer.from(content, 'base64')
            : Buffer.from(content, 'utf8');
        const meta = await writeProjectFile(PROJECTS_DIR, req.params.id, name, buf, {
          artifactManifest,
        });
        /** @type {import('@open-design/contracts').ProjectFileResponse} */
        const body = { file: meta };
        res.json(body);
      } catch (err) {
        sendApiError(res, 500, 'INTERNAL_ERROR', 'upload failed');
      }
    },
  );

  app.delete('/api/projects/:id/files/:name', async (req, res) => {
    try {
      await deleteProjectFile(PROJECTS_DIR, req.params.id, req.params.name);
      /** @type {import('@open-design/contracts').DeleteProjectFileResponse} */
      const body = { ok: true };
      res.json(body);
    } catch (err) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(res, status, status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST', String(err));
    }
  });

  // Multi-file upload that the chat composer uses for paste/drop/picker.
  // Files land flat in the project folder; the response carries the same
  // metadata as listFiles so the client can stage them as ChatAttachments
  // without a separate refetch.
  app.post(
    '/api/projects/:id/upload',
    handleProjectUpload,
    async (req, res) => {
      try {
        const incoming = Array.isArray(req.files) ? req.files : [];
        const out = [];
        for (const f of incoming) {
          try {
            const stat = await fs.promises.stat(f.path);
            out.push({
              name: f.filename,
              path: f.filename,
              size: stat.size,
              mtime: stat.mtimeMs,
              originalName: f.originalname,
            });
          } catch {
            // skip files that vanished mid-flight
          }
        }
        /** @type {import('@open-design/contracts').UploadProjectFilesResponse} */
        const body = { files: out };
        res.json(body);
      } catch (err) {
        sendApiError(res, 500, 'INTERNAL_ERROR', 'upload failed');
      }
    },
  );

  const design = {
    runs: createChatRunService({ createSseResponse, createSseErrorPayload }),
  };

  const composeDaemonSystemPrompt = async ({ projectId, skillId, designSystemId }) => {
    const project = typeof projectId === 'string' && projectId ? getProject(db, projectId) : null;
    const effectiveSkillId = typeof skillId === 'string' && skillId ? skillId : project?.skillId;
    const effectiveDesignSystemId = typeof designSystemId === 'string' && designSystemId ? designSystemId : project?.designSystemId;
    const metadata = project?.metadata;

    let skillBody;
    let skillName;
    let skillMode;
    if (effectiveSkillId) {
      const skill = (await listSkills(SKILLS_DIR)).find((s) => s.id === effectiveSkillId);
      if (skill) {
        skillBody = skill.body;
        skillName = skill.name;
        skillMode = skill.mode;
      }
    }

    let designSystemBody;
    let designSystemTitle;
    if (effectiveDesignSystemId) {
      const systems = await listDesignSystems(DESIGN_SYSTEMS_DIR);
      const summary = systems.find((s) => s.id === effectiveDesignSystemId);
      designSystemTitle = summary?.title;
      designSystemBody = await readDesignSystem(DESIGN_SYSTEMS_DIR, effectiveDesignSystemId) ?? undefined;
    }

    const template = metadata?.kind === 'template' && typeof metadata.templateId === 'string'
      ? getTemplate(db, metadata.templateId) ?? undefined
      : undefined;

    return composeSystemPrompt({
      skillBody,
      skillName,
      skillMode,
      designSystemBody,
      designSystemTitle,
      metadata,
      template,
    });
  };

  const startChatRun = async (chatBody, run) => {
    /** @type {Partial<ChatRequest> & { imagePaths?: string[] }} */
    chatBody = chatBody || {};
    const {
      agentId,
      message,
      systemPrompt,
      imagePaths = [],
      projectId,
      conversationId,
      assistantMessageId,
      clientRequestId,
      skillId,
      designSystemId,
      attachments = [],
      model,
      reasoning,
    } = chatBody;
    if (typeof projectId === 'string' && projectId) run.projectId = projectId;
    if (typeof conversationId === 'string' && conversationId) run.conversationId = conversationId;
    if (typeof assistantMessageId === 'string' && assistantMessageId) run.assistantMessageId = assistantMessageId;
    if (typeof clientRequestId === 'string' && clientRequestId) run.clientRequestId = clientRequestId;
    if (typeof agentId === 'string' && agentId) run.agentId = agentId;
    const def = getAgentDef(agentId);
    if (!def) return design.runs.fail(run, 'AGENT_UNAVAILABLE', `unknown agent: ${agentId}`);
    if (!def.bin) return design.runs.fail(run, 'AGENT_UNAVAILABLE', 'agent has no binary');
    if (typeof message !== 'string' || !message.trim()) {
      return design.runs.fail(run, 'BAD_REQUEST', 'message required');
    }
    if (run.cancelRequested || design.runs.isTerminal(run.status)) return;

    // Resolve the project working directory (creating the folder if it
    // doesn't exist yet). Without one we don't pass cwd to spawn — the
    // agent then runs in whatever inherited dir, which still lets API
    // mode work but loses file-tool addressability.
    let cwd = null;
    let existingProjectFiles = [];
    if (typeof projectId === 'string' && projectId) {
      try {
        cwd = await ensureProject(PROJECTS_DIR, projectId);
        existingProjectFiles = await listFiles(PROJECTS_DIR, projectId);
      } catch {
        cwd = null;
      }
    }
    if (run.cancelRequested || design.runs.isTerminal(run.status)) return;

    // Sanitise supplied image paths: must live under UPLOAD_DIR.
    const safeImages = imagePaths.filter((p) => {
      const resolved = path.resolve(p);
      return resolved.startsWith(UPLOAD_DIR + path.sep) && fs.existsSync(resolved);
    });

    // Project-scoped attachments: project-relative paths inside cwd. Each
    // is run through the same path-traversal guard the file CRUD endpoints
    // use, then existence-checked. Whatever survives shows up as an
    // explicit list at the bottom of the user message so the agent knows
    // to Read it.
    const safeAttachments = cwd
      ? (Array.isArray(attachments) ? attachments : [])
        .filter((p) => typeof p === 'string' && p.length > 0)
        .filter((p) => {
          try {
            const abs = path.resolve(cwd, p);
            return (
              (abs === cwd || abs.startsWith(cwd + path.sep)) &&
              fs.existsSync(abs)
            );
          } catch {
            return false;
          }
        })
      : [];

    // Local code agents don't accept a separate "system" channel the way the
    // Messages API does — we fold the skill + design-system prompt into the
    // user message. The <artifact> wrapping instruction comes from
    // systemPrompt. We also stitch in the cwd hint so the agent knows
    // where its file tools should write, and the attachment list so it
    // doesn't have to guess what the user just dropped in.
    // Also ship the current file listing so the agent can pick a unique
    // filename instead of clobbering a previous artifact.
    const filesListBlock = existingProjectFiles.length
      ? `\nFiles already in this folder (do NOT overwrite unless the user asks; pick a fresh, descriptive name for new artifacts):\n${existingProjectFiles
          .map((f) => `- ${f.name}`)
          .join('\n')}`
      : '\nThis folder is empty. Choose a clear, descriptive filename for whatever you create.';
    const cwdHint = cwd
      ? `\n\nYour working directory: ${cwd}\nWrite project files relative to it (e.g. \`index.html\`, \`assets/x.png\`). The user can browse those files in real time.${filesListBlock}`
      : '';
    const attachmentHint = safeAttachments.length
      ? `\n\nAttached project files: ${safeAttachments.map((p) => `\`${p}\``).join(', ')}`
      : '';
    const daemonSystemPrompt = await composeDaemonSystemPrompt({ projectId, skillId, designSystemId });
    const instructionPrompt = [daemonSystemPrompt, systemPrompt]
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean)
      .join('\n\n---\n\n');
    const composed = [
      instructionPrompt
        ? `# Instructions (read first)\n\n${instructionPrompt}${cwdHint}\n\n---\n`
        : cwdHint
          ? `# Instructions${cwdHint}\n\n---\n`
          : '',
      `# User request\n\n${message}${attachmentHint}`,
      safeImages.length ? `\n\n${safeImages.map((p) => `@${p}`).join(' ')}` : '',
    ].join('');

    // Skill seeds (`skills/<id>/assets/template.html`) and design-system
    // specs (`design-systems/<id>/DESIGN.md`) live outside the project cwd.
    // The composed system prompt asks the agent to Read them via absolute
    // paths in the skill-root preamble — without an explicit allowlist,
    // Claude Code blocks those reads (issue #6: "no permission to read
    // skills template"). We surface both roots so any agent that honours
    // `--add-dir` can resolve those side files.
    const extraAllowedDirs = [SKILLS_DIR, DESIGN_SYSTEMS_DIR].filter(
      (d) => fs.existsSync(d),
    );
    // Per-agent model + reasoning the user picked in the model menu.
    // Trust the value when it matches the most recent /api/agents listing
    // (live or fallback). Otherwise allow it through if it passes a
    // permissive sanitizer — that's the path for user-typed custom model
    // ids the CLI's listing didn't surface yet.
    const safeModel =
      typeof model === 'string'
        ? isKnownModel(def, model)
          ? model
          : sanitizeCustomModel(model)
        : null;
    const safeReasoning =
      typeof reasoning === 'string' && Array.isArray(def.reasoningOptions)
        ? def.reasoningOptions.find((r) => r.id === reasoning)?.id ?? null
        : null;
    const agentOptions = { model: safeModel, reasoning: safeReasoning };

    // Windows ENAMETOOLONG mitigation.  On Windows the OS caps the command
    // line passed to child_process.spawn: ~8 191 chars when shell:true is
    // needed (.cmd/.bat npm shims) and ~32 767 chars otherwise (CreateProcess).
    // The composed prompt (system prompt + design system + skill body + user
    // message) can exceed either limit.  Agents with `promptViaStdin` bypass
    // this by piping through stdin.  For the remaining agents we write the
    // prompt to a temp file in the project directory and pass a short
    // bootstrap message that tells the agent to Read it before responding.
    const resolvedBin = resolveAgentBin(agentId);
    const isWinShell = process.platform === 'win32' && resolvedBin && CMD_BAT_RE.test(resolvedBin);
    // Thresholds account for escaping overhead (~1.1-1.3x for cmd.exe shell)
    // plus other args (~500 chars).  6500 chars for shell:true, 30000 for
    // direct CreateProcess.
    const promptLimit = isWinShell ? 6500 : 30000;
    const needsFilePrompt =
      !def.promptViaStdin &&
      process.platform === 'win32' &&
      composed.length > promptLimit &&
      cwd;
    if (process.platform === 'win32') {
      console.log(
        `[od] prompt-delivery: agent=${agentId} promptLen=${composed.length} ` +
        `shell=${isWinShell} limit=${promptLimit} file=${!!needsFilePrompt} ` +
        `bin=${resolvedBin ? path.basename(resolvedBin) : 'null'}`,
      );
    }
    let effectivePrompt = composed;
    let promptFilePath = null;
    let promptFileCleaned = false;
    const cleanPromptFile = () => {
      if (promptFilePath && !promptFileCleaned) {
        promptFileCleaned = true;
        fs.unlink(promptFilePath, () => {});
      }
    };
    // ^^^ idempotency: promptFileCleaned is set synchronously BEFORE the
    // async fs.unlink callback, so a second call never races past the guard.
    if (needsFilePrompt) {
      promptFilePath = path.join(cwd, PROMPT_TEMP_FILE());
      try {
        fs.writeFileSync(promptFilePath, composed, 'utf8');
        effectivePrompt = promptFileBootstrap(promptFilePath);
        console.log(`[od] wrote prompt to ${promptFilePath}`);
      } catch (err) {
        console.error(`[od] failed to write prompt file: ${err.message}`);
        promptFilePath = null;
      }
    }

    run.promptFileCleaned = cleanPromptFile;
    const args = def.buildArgs(effectivePrompt, safeImages, extraAllowedDirs, agentOptions, { cwd });
    const send = (event, data) => design.runs.emit(run, event, data);

    // resolvedBin was already looked up above for the ENAMETOOLONG check.
    // If detection can't find the binary, surface a friendly SSE error
    // pointing at /api/agents instead of silently falling back to
    // spawn(def.bin) — that fallback re-introduces the exact ENOENT symptom
    // from issue #10 the rest of this block is meant to prevent.
    if (!resolvedBin) {
      cleanPromptFile();
      design.runs.emit(run, 'error', createSseErrorPayload(
        'AGENT_UNAVAILABLE',
        `Agent "${def.name}" (\`${def.bin}\`) is not installed or not on PATH. ` +
          'Install it and refresh the agent list (GET /api/agents) before retrying.',
        { retryable: true },
      ));
      return design.runs.finish(run, 'failed', 1, null);
    }
    // npm shims on Windows are .cmd/.bat files; Node ≥21 refuses to spawn
    // those without `shell: true` (CVE-2024-27980). When `shell: true` is set
    // on Windows, Node escapes argv items for the cmd.exe shell — that
    // escape is what currently keeps user-controlled prompt text in `args`
    // (composed via `def.buildArgs(prompt, ...)` above) from being
    // interpreted as shell metacharacters. Two caveats this leaves on the
    // table for a future contributor to be aware of:
    //   1. Defensibility relies on Node's escaper staying correct. The
    //      stronger fix is to keep user text out of argv entirely by piping
    //      the composed prompt through child stdin instead of passing it
    //      as a `-p $prompt`-style flag. Do NOT add a new prompt-bearing
    //      flag in `buildArgs` thinking shell:true makes it safe — route
    //      it through stdin instead.
    //   2. cmd.exe caps the full command line at ~8191 chars (well below
    //      Node's direct-spawn argv cap), so long prompts can fail with an
    //      ENAMETOOLONG-class error here. Same mitigation: stdin.
    //
    // We only flip shell:true for `.cmd`/`.bat` because those are the only
    // PATHEXT entries that strictly require cmd.exe to launch. `.exe`/`.com`
    // launch directly (no shell needed); `.ps1`/`.vbs` etc. would need a
    // different host (powershell / wscript) — `shell: true` (which uses
    // cmd.exe) wouldn't actually help those, so we don't pretend it would.
    // In practice npm-installed CLIs ship as `.cmd` shims, which is the
    // case this branch covers.
    const useShell =
      process.platform === 'win32' && CMD_BAT_RE.test(resolvedBin);

    if (run.cancelRequested || design.runs.isTerminal(run.status)) return;

    run.status = 'running';
    run.updatedAt = Date.now();
    send('start', {
      runId: run.id,
      agentId,
      bin: resolvedBin,
      streamFormat: def.streamFormat ?? 'plain',
      projectId: typeof projectId === 'string' ? projectId : null,
      cwd,
      model: safeModel,
      reasoning: safeReasoning,
    });

    let child;
    let acpSession = null;
    try {
      // When the agent definition sets `promptViaStdin`, pipe the composed
      // prompt through stdin instead of embedding it in argv. Bypasses the
      // OS command-line length limit (Windows CreateProcess caps at ~32 KB)
      // which causes `spawn ENAMETOOLONG` for any non-trivial prompt.
      const stdinMode = def.promptViaStdin || def.streamFormat === 'acp-json-rpc' || needsFilePrompt ? 'pipe' : 'ignore';
      child = spawn(resolvedBin, args, {
        env: { ...process.env },
        stdio: [stdinMode, 'pipe', 'pipe'],
        cwd: cwd || undefined,
        shell: useShell,
      });
      run.child = child;
      if ((def.promptViaStdin || needsFilePrompt) && child.stdin && def.streamFormat !== 'pi-rpc') {
        // EPIPE from a fast-exiting CLI (bad auth, missing model, exit on
        // launch) would otherwise surface as an unhandled stream error and
        // crash the daemon. Swallow it — the regular exit/close handlers
        // below already route the underlying failure to SSE via stderr.
        child.stdin.on('error', (err) => {
          if (err.code !== 'EPIPE') {
            send('error', createSseErrorPayload('AGENT_EXECUTION_FAILED', `stdin: ${err.message}`));
          }
        });
        child.stdin.end(composed, 'utf8');
      }
    } catch (err) {
      cleanPromptFile();
      design.runs.emit(run, 'error', createSseErrorPayload('AGENT_EXECUTION_FAILED', `spawn failed: ${err.message}`));
      return design.runs.finish(run, 'failed', 1, null);
    }

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    // Structured streams (Claude Code) go through a line-delimited JSON
    // parser that turns stream_event objects into UI-friendly events. For
    // plain streams (most other CLIs) we forward raw chunks unchanged so
    // the browser can append them to the assistant's text buffer.
    if (def.streamFormat === 'claude-stream-json') {
      const claude = createClaudeStreamHandler((ev) => send('agent', ev));
      child.stdout.on('data', (chunk) => claude.feed(chunk));
      child.on('close', () => claude.flush());
    } else if (def.streamFormat === 'copilot-stream-json') {
      const copilot = createCopilotStreamHandler((ev) => send('agent', ev));
      child.stdout.on('data', (chunk) => copilot.feed(chunk));
      child.on('close', () => copilot.flush());
    } else if (def.streamFormat === 'pi-rpc') {
      acpSession = attachPiRpcSession({
        child,
        prompt: composed,
        cwd: cwd || PROJECT_ROOT,
        model: safeModel,
        send,
      });
    } else if (def.streamFormat === 'acp-json-rpc') {
      acpSession = attachAcpSession({
        child,
        prompt: composed,
        cwd: cwd || PROJECT_ROOT,
        model: safeModel,
        send,
      });
    } else if (def.streamFormat === 'json-event-stream') {
      const handler = createJsonEventStreamHandler(def.eventParser || def.id, (ev) =>
        send('agent', ev),
      );
      child.stdout.on('data', (chunk) => handler.feed(chunk));
      child.on('close', () => handler.flush());
    } else {
      child.stdout.on('data', (chunk) => send('stdout', { chunk }));
    }
    child.stderr.on('data', (chunk) => send('stderr', { chunk }));

    child.on('error', (err) => {
      send('error', createSseErrorPayload('AGENT_EXECUTION_FAILED', err.message));
      design.runs.finish(run, 'failed', 1, null);
    });
    child.on('close', (code, signal) => {
      if (acpSession?.hasFatalError()) {
        return design.runs.finish(run, 'failed', code ?? 1, signal ?? null);
      }
      const status = run.cancelRequested
        ? 'canceled'
        : code === 0
          ? 'succeeded'
          : 'failed';
      design.runs.finish(run, status, code, signal);
    });
  };

  app.post('/api/runs', (req, res) => {
    const run = design.runs.create(req.body || {});
    /** @type {import('@open-design/contracts').ChatRunCreateResponse} */
    const body = { runId: run.id };
    res.status(202).json(body);
    design.runs.start(run, () => startChatRun(req.body || {}, run));
  });

  app.get('/api/runs', (req, res) => {
    const { projectId, conversationId, status } = req.query;
    const runs = design.runs.list({ projectId, conversationId, status });
    /** @type {import('@open-design/contracts').ChatRunListResponse} */
    const body = { runs: runs.map(design.runs.statusBody) };
    res.json(body);
  });

  app.get('/api/runs/:id', (req, res) => {
    const run = design.runs.get(req.params.id);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    res.json(design.runs.statusBody(run));
  });

  app.get('/api/runs/:id/events', (req, res) => {
    const run = design.runs.get(req.params.id);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    design.runs.stream(run, req, res);
  });

  app.post('/api/runs/:id/cancel', (req, res) => {
    const run = design.runs.get(req.params.id);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    design.runs.cancel(run);
    /** @type {import('@open-design/contracts').ChatRunCancelResponse} */
    const body = { ok: true };
    res.json(body);
  });

  app.post('/api/chat', (req, res) => {
    const run = design.runs.create();
    design.runs.stream(run, req, res);
    design.runs.start(run, () => startChatRun(req.body || {}, run));
  });

  // ---- API Proxy (SSE) for OpenAI-compatible endpoints ---------------------
  // Browser → daemon → external API. Avoids CORS issues with third-party
  // providers (MiMo, DeepSeek, Groq, etc.).

  app.post('/api/proxy/stream', async (req, res) => {
    /** @type {Partial<ProxyStreamRequest>} */
    const proxyBody = req.body || {};
    const { baseUrl, apiKey, model, systemPrompt, messages } = proxyBody;
    if (!baseUrl || !apiKey || !model) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'baseUrl, apiKey, and model are required');
    }

    // Validate baseUrl — only allow http/https and block internal IPs (SSRF).
    let parsed;
    try {
      parsed = new URL(baseUrl.replace(/\/+$/, ''));
    } catch {
      return sendApiError(res, 400, 'BAD_REQUEST', 'Invalid baseUrl');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'Only http/https allowed');
    }
    if (
      ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) ||
      parsed.hostname.startsWith('169.254.') ||
      parsed.hostname.startsWith('10.') ||
      /^192\.168\./.test(parsed.hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(parsed.hostname)
    ) {
      return sendApiError(res, 400, 'FORBIDDEN', 'Internal IPs blocked');
    }

    // Build the upstream URL. If the base URL already ends with /v1 (or
    // /v1/), append /chat/completions directly. Otherwise append
    // /v1/chat/completions for providers that expect a versioned prefix.
    let url;
    const clean = baseUrl.replace(/\/+$/, '');
    if (/\/v\d+$/.test(clean)) {
      url = clean + '/chat/completions';
    } else {
      url = clean + '/v1/chat/completions';
    }

    // Force MiMo to behave as a pure text generator (no tool calls)
    const isMiMo = model.toLowerCase().startsWith('mimo');
    console.log(`[proxy] ${req.method} ${parsed.hostname} model=${model} miMo=${isMiMo}`);

    const payload = {
      model,
      max_tokens: 8192,
      stream: true,
      ...(isMiMo ? { tool_choice: 'none', tools: [] } : {}),
      messages: [
        { role: 'system', content: systemPrompt || '' },
        ...(Array.isArray(messages) ? messages : []),
      ],
    };
    const body = JSON.stringify(payload);

    const sse = createSseResponse(res);
    const send = sse.send;

    let upstream;
    try {
      upstream = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body,
      });
    } catch (fetchErr) {
      send('error', createSseErrorPayload('UPSTREAM_UNAVAILABLE', `fetch failed: ${fetchErr.message}`, { retryable: true }));
      return sse.end();
    }

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      const safeErr = errText.slice(0, 500).replace(/Bearer [A-Za-z0-9_\-\.]+/g, 'Bearer [REDACTED]');
      console.error(`[proxy] upstream ${upstream.status}: ${safeErr.slice(0, 200)}`);
      send('error', createSseErrorPayload('UPSTREAM_UNAVAILABLE', `upstream ${upstream.status}: ${safeErr}`, { retryable: upstream.status >= 500 }));
      return sse.end();
    }

    send('start', { model });

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') {
          send('end', {});
          return sse.end();
        }
        try {
          const chunk = JSON.parse(payload);
          const delta = chunk.choices?.[0]?.delta;
          if (delta) {
            let text = delta.content ?? '';
            if (text) {
              send('delta', { text });
            }
            // Structured tool_calls from the API (not in content)
            if (Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const fn = tc.function;
                if (fn?.name) {
                  send('delta', { text: `\n\n[${fn.name}]\n` });
                }
              }
            }
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    send('end', {});
    sse.end();
  });

  // SPA fallback for the built web app. Put this LAST so it never shadows
  // /api routes. Only active when out/ exists (production mode).
  //
  // Next.js's static export writes a single shell HTML at out/index.html
  // for the optional catch-all route (`app/[[...slug]]/page.tsx`); project
  // IDs aren't pre-rendered, so any unknown deep link (e.g. /projects/abc)
  // needs to fall back to that shell so the client router can pick the
  // right view at runtime.
  if (fs.existsSync(STATIC_DIR)) {
    app.get(/^\/(?!api\/|artifacts\/|frames\/).*/, (_req, res) => {
      res.sendFile(path.join(STATIC_DIR, 'index.html'));
    });
  }

  return new Promise((resolve) => {
    const server = app.listen(port, '127.0.0.1', () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      const url = `http://127.0.0.1:${actualPort}`;
      resolve(returnServer ? { url, server } : url);
    });
  });
}

// Assemble a skill's example deck from its seed template + a slides
// snippet. The seed contains the full CSS / WebGL / nav-JS shell with a
// `<!-- SLIDES_HERE -->` marker; the snippet contributes the actual
// `<section class="slide ...">` content. We also patch the placeholder
// `<title>` so the iframe's tab name reads as the skill, not the
// "[必填] 替换为 PPT 标题" stub.
function assembleExample(tplHtml, slidesHtml, skillName) {
  const slidesMarker = /<!--\s*SLIDES_HERE\s*-->/i;
  const titleTag = /<title>[^<]*<\/title>/i;
  const safeTitle = `${skillName || 'Magazine Web PPT'} · Example Deck`;
  const withSlides = slidesMarker.test(tplHtml)
    ? tplHtml.replace(slidesMarker, slidesHtml)
    : tplHtml.replace(/<\/body>/i, `${slidesHtml}</body>`);
  return titleTag.test(withSlides)
    ? withSlides.replace(titleTag, `<title>${escapeHtml(safeTitle)}</title>`)
    : withSlides;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeSlug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'artifact';
}

function randomId() {
  return randomUUID();
}

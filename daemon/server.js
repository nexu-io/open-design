import express from 'express';
import multer from 'multer';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  detectAgents,
  getAgentDef,
  isKnownModel,
  resolveAgentBin,
  sanitizeCustomModel,
} from './agents.js';
import { listSkills } from './skills.js';
import { listDesignSystems, readDesignSystem } from './design-systems.js';
import { createClaudeStreamHandler } from './claude-stream.js';
import { createCopilotStreamHandler } from './copilot-stream.js';
import { renderDesignSystemPreview } from './design-system-preview.js';
import { renderDesignSystemShowcase } from './design-system-showcase.js';
import { lintArtifact, renderFindingsForAgent } from './lint-artifact.js';
import {
  deleteProjectFile,
  ensureProject,
  listFiles,
  readProjectFile,
  removeProjectDir,
  sanitizeName,
  writeProjectFile,
} from './projects.js';
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
  listConversations,
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const STATIC_DIR = path.join(PROJECT_ROOT, 'dist');
const SKILLS_DIR = path.join(PROJECT_ROOT, 'skills');
const DESIGN_SYSTEMS_DIR = path.join(PROJECT_ROOT, 'design-systems');
const ARTIFACTS_DIR = path.join(PROJECT_ROOT, '.od', 'artifacts');
const PROJECTS_DIR = path.join(PROJECT_ROOT, '.od', 'projects');
fs.mkdirSync(PROJECTS_DIR, { recursive: true });

const UPLOAD_DIR = path.join(os.tmpdir(), 'od-uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^\w.\-]/g, '_');
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
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
      // Reuse the same sanitiser used everywhere else, then prepend a
      // base36 timestamp so multiple uploads with the same original name
      // don't clobber each other.
      const safe = sanitizeName(file.originalname);
      cb(null, `${Date.now().toString(36)}-${safe}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

export async function startServer({ port = 7456 } = {}) {
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  const db = openDatabase(PROJECT_ROOT);

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
      res.json({ projects: listProjects(db) });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/projects', async (req, res) => {
    try {
      const { id, name, skillId, designSystemId, pendingPrompt, metadata } =
        req.body || {};
      if (typeof id !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(id)) {
        return res.status(400).json({ error: 'invalid project id' });
      }
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name required' });
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
      res.json({ project, conversationId: cid });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.get('/api/projects/:id', (req, res) => {
    const project = getProject(db, req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    res.json({ project });
  });

  app.patch('/api/projects/:id', (req, res) => {
    try {
      const patch = req.body || {};
      const project = updateProject(db, req.params.id, patch);
      if (!project) return res.status(404).json({ error: 'not found' });
      res.json({ project });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.delete('/api/projects/:id', async (req, res) => {
    try {
      dbDeleteProject(db, req.params.id);
      await removeProjectDir(PROJECTS_DIR, req.params.id).catch(() => {});
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: String(err) });
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
  // project's own folder (see daemon/projects.js).
  app.get('/api/projects/:id/files', async (req, res) => {
    try {
      const files = await listFiles(PROJECTS_DIR, req.params.id);
      res.json({ files });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.get('/api/projects/:id/files/:name', async (req, res) => {
    try {
      const file = await readProjectFile(PROJECTS_DIR, req.params.id, req.params.name);
      res.type(file.mime).send(file.buffer);
    } catch (err) {
      const code = err && err.code === 'ENOENT' ? 404 : 400;
      res.status(code).json({ error: String(err) });
    }
  });

  // Two ways to upload: multipart for binary files (images), and JSON
  // {name, content, encoding} for sketches and pasted text. The frontend
  // uses both depending on the file source.
  app.post(
    '/api/projects/:id/files',
    upload.single('file'),
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
          return res.json({ file: meta });
        }
        const { name, content, encoding } = req.body || {};
        if (typeof name !== 'string' || typeof content !== 'string') {
          return res.status(400).json({ error: 'name and content required' });
        }
        const buf =
          encoding === 'base64'
            ? Buffer.from(content, 'base64')
            : Buffer.from(content, 'utf8');
        const meta = await writeProjectFile(PROJECTS_DIR, req.params.id, name, buf);
        res.json({ file: meta });
      } catch (err) {
        res.status(400).json({ error: String(err) });
      }
    },
  );

  app.delete('/api/projects/:id/files/:name', async (req, res) => {
    try {
      await deleteProjectFile(PROJECTS_DIR, req.params.id, req.params.name);
      res.json({ ok: true });
    } catch (err) {
      const code = err && err.code === 'ENOENT' ? 404 : 400;
      res.status(code).json({ error: String(err) });
    }
  });

  // Multi-file upload that the chat composer uses for paste/drop/picker.
  // Files land flat in the project folder; the response carries the same
  // metadata as listFiles so the client can stage them as ChatAttachments
  // without a separate refetch.
  app.post(
    '/api/projects/:id/upload',
    projectUpload.array('files', 12),
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
        res.json({ files: out });
      } catch (err) {
        res.status(400).json({ error: String(err) });
      }
    },
  );

  app.post('/api/chat', async (req, res) => {
    const {
      agentId,
      message,
      systemPrompt,
      imagePaths = [],
      projectId,
      attachments = [],
      model,
      reasoning,
    } = req.body || {};
    const def = getAgentDef(agentId);
    if (!def) return res.status(400).json({ error: `unknown agent: ${agentId}` });
    if (!def.bin) return res.status(400).json({ error: 'agent has no binary' });
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message required' });
    }

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
    const composed = [
      systemPrompt && systemPrompt.trim()
        ? `# Instructions (read first)\n\n${systemPrompt.trim()}${cwdHint}\n\n---\n`
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
    const args = def.buildArgs(composed, safeImages, extraAllowedDirs, agentOptions);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (event, data) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Resolve the agent's bin to its absolute path. Detection (`/api/agents`)
    // already locates the executable via PATH, but spawning the bare name here
    // fails on Windows (ENOENT) when the child process's PATH doesn't contain
    // the user's npm-global / shim directory — see issue #10.
    //
    // If detection can't find the binary, surface a friendly SSE error
    // pointing at /api/agents instead of silently falling back to
    // spawn(def.bin) — that fallback re-introduces the exact ENOENT symptom
    // from issue #10 the rest of this block is meant to prevent.
    const resolvedBin = resolveAgentBin(agentId);
    if (!resolvedBin) {
      send('error', {
        message:
          `Agent "${def.name}" (\`${def.bin}\`) is not installed or not on PATH. ` +
          'Install it and refresh the agent list (GET /api/agents) before retrying.',
      });
      return res.end();
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
      process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolvedBin);

    send('start', {
      agentId,
      bin: resolvedBin,
      streamFormat: def.streamFormat ?? 'plain',
      projectId: typeof projectId === 'string' ? projectId : null,
      cwd,
      model: safeModel,
      reasoning: safeReasoning,
    });

    let child;
    try {
      child = spawn(resolvedBin, args, {
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: cwd || undefined,
        shell: useShell,
      });
    } catch (err) {
      send('error', { message: `spawn failed: ${err.message}` });
      return res.end();
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
    } else {
      child.stdout.on('data', (chunk) => send('stdout', { chunk }));
    }
    child.stderr.on('data', (chunk) => send('stderr', { chunk }));

    const kill = () => {
      if (child && !child.killed) child.kill('SIGTERM');
    };
    res.on('close', () => {
      if (!res.writableEnded) kill();
    });

    child.on('error', (err) => {
      send('error', { message: err.message });
      res.end();
    });
    child.on('close', (code, signal) => {
      send('end', { code, signal });
      res.end();
    });
  });

  // SPA fallback for the built web app. Put this LAST so it never shadows
  // /api routes. Only active when a dist/ exists (production mode).
  if (fs.existsSync(STATIC_DIR)) {
    app.get(/^\/(?!api\/|artifacts\/).*/, (_req, res) => {
      res.sendFile(path.join(STATIC_DIR, 'index.html'));
    });
  }

  return new Promise((resolve) => {
    app.listen(port, '127.0.0.1', () => resolve(`http://localhost:${port}`));
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

import type { Express } from 'express';
import fsp from 'node:fs/promises';
import type { RouteDeps } from '../server-context.js';
import type {
  DesignSystemFileDetail,
  DesignSystemFileSummary,
  DesignSystemPackageInfo,
  DesignSystemRevision,
  DesignSystemSummary,
  UserDesignSystemInput,
} from '../design-systems.js';
import type { DesignTokenContractRebuildPreparation } from '../design-token-contract-rebuild.js';
import type {
  DesignSystemGenerationJob,
  DesignSystemRevisionInput,
  DesignSystemTokenContractRebuildInput,
} from '../design-system-generation-jobs.js';
import type { openDatabase } from '../db.js';
import type { Project, ProjectFile } from '@open-design/contracts';

type DbHandle = ReturnType<typeof openDatabase>;

type DesignSystemWorkspaceProject = {
  project: Project;
  files: ProjectFile[];
};

type AvailableDesignSystemSummary = DesignSystemSummary & {
  source?: 'built-in' | 'installed' | 'user';
};

export interface RegisterDesignSystemRoutesDeps extends RouteDeps<'db' | 'paths' | 'projectFiles' | 'projectStore'> {
  designSystems: {
    createUserDesignSystem: (root: string, input: UserDesignSystemInput) => Promise<DesignSystemSummary>;
    deleteUserDesignSystem: (root: string, id: string) => Promise<boolean>;
    ensureUserDesignSystemWorkspaceProject: (db: DbHandle, id: string) => Promise<DesignSystemWorkspaceProject | null>;
    listAllDesignSystems: () => Promise<AvailableDesignSystemSummary[]>;
    listUserDesignSystemFiles: (root: string, id: string) => Promise<DesignSystemFileSummary[] | null>;
    listUserDesignSystemRevisions: (root: string, id: string) => Promise<DesignSystemRevision[] | null>;
    prepareDesignTokenContractRebuild: (root: string, id: string, options?: { force?: boolean }) => Promise<DesignTokenContractRebuildPreparation>;
    readAvailableDesignSystem: (id: string) => Promise<string | null>;
    readAvailableDesignSystemPackageInfo: (id: string) => Promise<DesignSystemPackageInfo | null>;
    readDesignSystemWorkspaceTextFile: (db: DbHandle, summary: AvailableDesignSystemSummary | undefined, filePath: string) => Promise<string | null>;
    readUserDesignSystemFile: (root: string, id: string, filePath: string) => Promise<DesignSystemFileDetail | null>;
    renderDesignSystemPreview: (id: string, body: string) => string;
    renderDesignSystemShowcase: (id: string, body: string) => string;
    updateUserDesignSystem: (root: string, id: string, input: UserDesignSystemInput) => Promise<DesignSystemSummary | null>;
    updateUserDesignSystemRevisionStatus: (root: string, id: string, revisionId: string, status: 'accepted' | 'rejected') => Promise<DesignSystemRevision | null>;
  };
  generationJobs: {
    get: (jobId: string) => DesignSystemGenerationJob | null;
    rebuildTokenContract: (input: DesignSystemTokenContractRebuildInput) => DesignSystemGenerationJob;
    revise: (input: DesignSystemRevisionInput) => DesignSystemGenerationJob;
    start: (input: UserDesignSystemInput) => DesignSystemGenerationJob;
  };
};

export function registerDesignSystemRoutes(app: Express, ctx: RegisterDesignSystemRoutesDeps) {
  const { db } = ctx;
  const { CRAFT_DIR, USER_DESIGN_SYSTEMS_DIR } = ctx.paths;
  const {
    createUserDesignSystem,
    deleteUserDesignSystem,
    ensureUserDesignSystemWorkspaceProject,
    listAllDesignSystems,
    listUserDesignSystemFiles,
    listUserDesignSystemRevisions,
    prepareDesignTokenContractRebuild,
    readAvailableDesignSystem,
    readAvailableDesignSystemPackageInfo,
    readDesignSystemWorkspaceTextFile,
    readUserDesignSystemFile,
    renderDesignSystemPreview,
    renderDesignSystemShowcase,
    updateUserDesignSystem,
    updateUserDesignSystemRevisionStatus,
  } = ctx.designSystems;
  const designSystemGenerationJobs = ctx.generationJobs;

  app.post('/api/design-systems', async (req, res) => {
    try {
      const created = await createUserDesignSystem(USER_DESIGN_SYSTEMS_DIR, req.body || {});
      res.status(201).json({ ...created as object, designSystem: created });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.post('/api/design-systems/generation-jobs', async (req, res) => {
    try {
      const job = designSystemGenerationJobs.start(req.body || {});
      res.status(202).json({ job });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.get('/api/design-systems/generation-jobs/:jobId', async (req, res) => {
    try {
      const job = designSystemGenerationJobs.get(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: 'design system generation job not found' });
      }
      res.json({ job });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/design-systems/:id/revision-jobs', async (req, res) => {
    try {
      const feedback = typeof req.body?.feedback === 'string' ? req.body.feedback : '';
      if (!feedback.trim()) return res.status(400).json({ error: 'feedback is required' });
      const job = designSystemGenerationJobs.revise({
        designSystemId: req.params.id,
        feedback,
        sectionTitle: typeof req.body?.sectionTitle === 'string' ? req.body.sectionTitle : undefined,
        body: typeof req.body?.body === 'string' ? req.body.body : undefined,
      });
      res.status(202).json({ job });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.post('/api/design-systems/:id/token-contract/rebuild-jobs', async (req, res) => {
    try {
      const preparation = await prepareDesignTokenContractRebuild(
        USER_DESIGN_SYSTEMS_DIR,
        req.params.id,
        { force: req.body?.force === true },
      );
      if (!preparation.decision.available) {
        return res.status(200).json({ decision: preparation.decision });
      }
      if (!preparation.revision) {
        return res.status(200).json({ decision: preparation.decision });
      }
      const job = designSystemGenerationJobs.rebuildTokenContract({
        designSystemId: req.params.id,
        decision: preparation.decision,
        ...preparation.revision,
      });
      res.status(202).json({ decision: preparation.decision, job });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.get('/api/design-systems/:id/revisions', async (req, res) => {
    try {
      const revisions = await listUserDesignSystemRevisions(
        USER_DESIGN_SYSTEMS_DIR,
        req.params.id,
      );
      if (!revisions) {
        return res.status(404).json({ error: 'editable design system not found' });
      }
      res.json({ revisions });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.patch('/api/design-systems/:id/revisions/:revisionId', async (req, res) => {
    try {
      const status = typeof req.body?.status === 'string' ? req.body.status : '';
      if (status !== 'accepted' && status !== 'rejected') {
        return res.status(400).json({ error: 'status must be accepted or rejected' });
      }
      const revision = await updateUserDesignSystemRevisionStatus(
        USER_DESIGN_SYSTEMS_DIR,
        req.params.id,
        req.params.revisionId,
        status,
      );
      if (!revision) {
        return res.status(404).json({ error: 'design system revision not found' });
      }
      res.json({ revision });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.get('/api/design-systems/:id', async (req, res) => {
    try {
      const systems = await listAllDesignSystems();
      const summary = systems.find((s) => s.id === req.params.id);
      const projectBody = await readDesignSystemWorkspaceTextFile(db, summary, 'DESIGN.md');
      const body = projectBody ?? await readAvailableDesignSystem(req.params.id);
      if (body === null || !summary) {
        return res.status(404).json({ error: 'design system not found' });
      }
      const packageInfo = await readAvailableDesignSystemPackageInfo(req.params.id);
      const detail = { ...summary, body, ...(packageInfo ? { packageInfo } : {}) };
      res.json({ ...detail, designSystem: detail });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/design-systems/:id/preview', async (req, res) => {
    try {
      const body = await readAvailableDesignSystem(req.params.id);
      if (body === null) return res.status(404).type('text/plain').send('not found');
      const html = renderDesignSystemPreview(req.params.id, body);
      res.type('text/html').send(html);
    } catch (err) {
      res.status(500).type('text/plain').send(String(err));
    }
  });

  app.get('/api/design-systems/:id/showcase', async (req, res) => {
    try {
      const body = await readAvailableDesignSystem(req.params.id);
      if (body === null) return res.status(404).type('text/plain').send('not found');
      const html = renderDesignSystemShowcase(req.params.id, body);
      res.type('text/html').send(html);
    } catch (err) {
      res.status(500).type('text/plain').send(String(err));
    }
  });

  app.post('/api/design-systems/:id/workspace', async (req, res) => {
    try {
      const workspace = await ensureUserDesignSystemWorkspaceProject(db, req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: 'editable design system not found' });
      }
      res.status(201).json(workspace);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.get('/api/design-systems/:id/files', async (req, res) => {
    try {
      const files = await listUserDesignSystemFiles(USER_DESIGN_SYSTEMS_DIR, req.params.id);
      if (!files) {
        return res.status(404).json({ error: 'editable design system not found' });
      }
      res.json({ files });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/design-systems/:id/file', async (req, res) => {
    try {
      const requestedPath = typeof req.query.path === 'string' ? req.query.path : '';
      const file = await readUserDesignSystemFile(
        USER_DESIGN_SYSTEMS_DIR,
        req.params.id,
        requestedPath,
      );
      if (!file) return res.status(404).json({ error: 'design system file not found' });
      res.json({ file });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.patch('/api/design-systems/:id', async (req, res) => {
    try {
      const updated = await updateUserDesignSystem(
        USER_DESIGN_SYSTEMS_DIR,
        req.params.id,
        req.body || {},
      );
      if (!updated) {
        return res.status(404).json({ error: 'editable design system not found' });
      }
      res.json({ ...updated as object, designSystem: updated });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.delete('/api/design-systems/:id', async (req, res) => {
    try {
      const ok = await deleteUserDesignSystem(USER_DESIGN_SYSTEMS_DIR, req.params.id);
      if (!ok) {
        return res.status(404).json({ error: 'editable design system not found' });
      }
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/craft', async (_req, res) => {
    try {
      let entries;
      try {
        entries = await fsp.readdir(CRAFT_DIR, { withFileTypes: true });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return res.json({ craft: [] });
        }
        throw err;
      }
      const out = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        const slug = entry.name.replace(/\.md$/, '');
        try {
          const fullPath = `${CRAFT_DIR}/${entry.name}`;
          const text = await fsp.readFile(fullPath, 'utf8');
          const heading = text.split('\n').find((line) => line.startsWith('# '));
          out.push({
            id: slug,
            label: heading ? heading.replace(/^#+\s*/, '').trim() : slug,
            bytes: Buffer.byteLength(text, 'utf8'),
          });
        } catch {
          // Skip unreadable files; surface what we can.
        }
      }
      res.json({ craft: out });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/craft/:id', async (req, res) => {
    try {
      const slug = req.params.id;
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
        return res.status(400).json({ error: 'invalid craft id' });
      }
      try {
        const text = await fsp.readFile(`${CRAFT_DIR}/${slug}.md`, 'utf8');
        res.json({ id: slug, body: text });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return res.status(404).json({ error: 'craft section not found' });
        }
        throw err;
      }
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
}

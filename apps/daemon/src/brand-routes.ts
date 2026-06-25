// Brands HTTP surface — list / extract / finalize / detail / delete / logo.
//
// A "brand" = brand metadata (brand.json + meta.json under
// `<brandsRoot>/<id>/`) PLUS a registered user design system. These routes are
// a thin HTTP wrapper over the agent-driven engine in `./brands/index.js`; they
// hold no brand business logic of their own.
//
//   POST /api/brands           — reserve the brand + stand up the extraction
//                                 project (browser tab + seeded prompt). JSON.
//   POST /api/brands/:id/finalize — register the agent's brand kit. JSON.

import fs from 'node:fs';
import path from 'node:path';

import type { Application, Request, Response } from 'express';

import {
  getProject,
  listLatestProjectRunStatuses,
  listProjectsAwaitingInput,
  type insertProject,
} from './db.js';
import { resolveProjectDir } from './projects.js';
import {
  extractBrandFromHtml,
  finalizeBrand,
  listBrandSummaries,
  readBrandDetail,
  removeBrand,
  renderBrandPreviewIntoProject,
  resolveBrandLogoPath,
  startBrandExtraction,
} from './brands/index.js';
import { patchMeta } from './brands/store.js';
import type { BrandDetailResponse, BrandMeta, BrandSummary } from '@open-design/contracts';

export interface BrandRoutesDeps {
  /** `<dataDir>/brands` — root of all brand directories. */
  brandsRoot: string;
  /** `<dataDir>/design-systems` — where extracted brands register their
   *  `user:<id>` design system, so selecting a brand in the composer reuses
   *  the existing design-system apply flow. */
  userDesignSystemsRoot: string;
  /** `<dataDir>/projects` — backing brand-extraction projects. */
  projectsRoot: string;
  /** Skills root — the agent-driven kit page is rendered from the bundled
   *  `brand-extract` template under here. */
  skillsRoot: string;
  /** Runtime data dir — passed to `finalizeBrand` so a finalized brand is
   *  sedimented into `<dataDir>/memory`. */
  dataDir: string;
  /** Shared app database used to register the backing project + conversation. */
  db: Parameters<typeof insertProject>[0];
  /** In-memory run registry, when available, so brand status can reconcile with
   *  active/just-finished backing extraction runs before they age out. */
  runs?: {
    list: (filter?: { projectId?: string }) => Array<{
      id: string;
      projectId?: string | null;
      status: string;
      updatedAt?: number;
      error?: string | null;
      errorCode?: string | null;
    }>;
  };
  /** Optional id factory; defaults inside the brand engine when omitted. */
  randomId?: () => string;
  /** Selected agent identity for programmatic transcript rows. */
  resolveTranscriptAgent?: () => Promise<{ agentId?: string | null; agentName?: string | null } | null>;
}

const LOGO_EXT_PRIORITY = ['.svg', '.png', '.webp', '.jpg', '.jpeg', '.gif', '.ico'];
const PROGRAMMATIC_CANCEL_ERROR = 'Programmatic extraction stopped by the user.';

export function registerBrandRoutes(app: Application, deps: BrandRoutesDeps): void {
  const { brandsRoot, userDesignSystemsRoot, projectsRoot, skillsRoot, dataDir, db, randomId } = deps;
  const activeProgrammaticBrandExtractions = new Map<string, AbortController>();

  // GET /api/brands — list every stored brand as a summary.
  app.get('/api/brands', (_req: Request, res: Response) => {
    try {
      const statusContext = createBrandStatusContext(deps);
      res.json({
        brands: listBrandSummaries(brandsRoot).map((summary) =>
          reconcileBrandSummaryStatus(brandsRoot, summary, statusContext),
        ),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/brands { url?, description?, designMd? } — reserve the brand and stand up its extraction
  // project (target site open in a browser tab + a seeded prompt that drives an
  // agent through the extraction chain). Returns the ids to navigate into.
  app.post('/api/brands', async (req: Request, res: Response) => {
    const url = typeof req.body?.url === 'string' ? req.body.url : '';
    const description = typeof req.body?.description === 'string' ? req.body.description : '';
    const designMd = typeof req.body?.designMd === 'string' ? req.body.designMd : '';
    const locale = typeof req.body?.locale === 'string' ? req.body.locale : '';
    if (!url.trim() && !designMd.trim()) {
      res.status(400).json({ error: 'url or designMd is required' });
      return;
    }
    try {
      const programmaticAbortController = new AbortController();
      const backgroundExtractionRef: { current: Promise<unknown> | null } = { current: null };
      const startOptions: Parameters<typeof startBrandExtraction>[0] = {
        brandsRoot,
        projectsRoot,
        skillsRoot,
        db,
        // Passing the registry root + data dir switches on the programmatic-first
        // extraction: the daemon seeds the real transcript and skeleton before
        // returning, then harvests + synthesizes + finalizes the design system
        // in the background.
        userDesignSystemsRoot,
        dataDir,
        programmaticAbortSignal: programmaticAbortController.signal,
        onBackgroundExtraction: (settled) => {
          backgroundExtractionRef.current = settled;
        },
      };
      if (url.trim()) startOptions.url = url;
      if (description.trim()) startOptions.description = description;
      if (designMd.trim()) startOptions.designMd = designMd;
      if (locale.trim()) startOptions.locale = locale;
      if (randomId) startOptions.randomId = randomId;
      const transcriptAgent = await deps.resolveTranscriptAgent?.().catch(() => null);
      if (transcriptAgent) startOptions.transcriptAgent = transcriptAgent;
      const result = await startBrandExtraction(startOptions);
      const backgroundExtraction = backgroundExtractionRef.current;
      if (backgroundExtraction) {
        activeProgrammaticBrandExtractions.set(result.id, programmaticAbortController);
        void backgroundExtraction.finally(() => {
          const latestStatus = readBrandDetail(brandsRoot, result.id)?.meta.status;
          if (
            latestStatus !== 'extracting'
            && activeProgrammaticBrandExtractions.get(result.id) === programmaticAbortController
          ) {
            activeProgrammaticBrandExtractions.delete(result.id);
          }
        });
      }
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A bad URL is the only expected throw; everything else is a 500.
      const status = /valid http/i.test(message) ? 400 : 500;
      res.status(status).json({ error: message });
    }
  });

  // POST /api/brands/:id/cancel-extraction — stop the daemon-owned
  // programmatic-first pass. This mirrors chat Stop for the synthetic transcript
  // row: the web marks the message canceled locally, while the daemon aborts
  // pending harvest/finalize work and moves the brand out of extracting.
  app.post('/api/brands/:id/cancel-extraction', (req: Request, res: Response) => {
    const id = String(req.params.id);
    try {
      const detail = readBrandDetail(brandsRoot, id);
      if (!detail) {
        res.status(404).json({ error: 'brand not found' });
        return;
      }
      const active = activeProgrammaticBrandExtractions.get(id);
      if (active) {
        active.abort();
        activeProgrammaticBrandExtractions.delete(id);
      }
      if (detail.meta.status !== 'ready') {
        patchMeta(brandsRoot, id, {
          status: 'failed',
          error: PROGRAMMATIC_CANCEL_ERROR,
          blocked: false,
          blockedReason: undefined,
          extractionTerminalRunId: undefined,
          extractionTerminalError: PROGRAMMATIC_CANCEL_ERROR,
        });
      }
      const next = readBrandDetail(brandsRoot, id)?.meta ?? detail.meta;
      res.json({ ok: true, status: next.status });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/brands/:id/preview — re-render brand.html from the project's
  // current brand.json. The extraction agent calls this (`od brand preview`)
  // after each measurement pass so the kit page fills in live.
  app.post('/api/brands/:id/preview', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const projectId =
      typeof req.body?.projectId === 'string' && req.body.projectId.trim()
        ? String(req.body.projectId)
        : undefined;
    const locale =
      typeof req.body?.locale === 'string' && req.body.locale.trim()
        ? String(req.body.locale)
        : undefined;
    try {
      const renderOptions: Parameters<typeof renderBrandPreviewIntoProject>[0] = {
        id,
        brandsRoot,
        skillsRoot,
        projectsRoot,
      };
      if (projectId) renderOptions.projectId = projectId;
      if (locale) renderOptions.locale = locale;
      const result = await renderBrandPreviewIntoProject(renderOptions);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = /not found/i.test(message) ? 404 : 500;
      res.status(status).json({ error: message });
    }
  });

  // POST /api/brands/:id/finalize — register the agent's extracted brand kit
  // (brand.json + assets in the backing project) as a `user:<id>` design system
  // and mark the brand ready. Called by the agent / `od brand finalize`.
  app.post('/api/brands/:id/finalize', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const projectId =
      typeof req.body?.projectId === 'string' && req.body.projectId.trim()
        ? String(req.body.projectId)
        : undefined;
    const locale =
      typeof req.body?.locale === 'string' && req.body.locale.trim()
        ? String(req.body.locale)
        : undefined;
    try {
      const finalizeOptions: Parameters<typeof finalizeBrand>[0] = {
        id,
        brandsRoot,
        userDesignSystemsRoot,
        projectsRoot,
        skillsRoot,
        dataDir,
        db,
      };
      if (projectId) finalizeOptions.projectId = projectId;
      if (locale) finalizeOptions.locale = locale;
      if (randomId) finalizeOptions.randomId = randomId;
      const result = await finalizeBrand(finalizeOptions);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = /not found/i.test(message) ? 404 : 422;
      res.status(status).json({ error: message });
    }
  });

  // POST /api/brands/:id/extract-from-html { html, css?, baseUrl? } — re-run the
  // programmatic harvest against HTML the web read out of the in-app browser tab
  // after the user cleared an anti-bot wall, instead of a fresh (blocked) fetch.
  // Registers the `user:<id>` design system and marks the brand `ready`.
  app.post('/api/brands/:id/extract-from-html', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const html = typeof req.body?.html === 'string' ? req.body.html : '';
    const css = typeof req.body?.css === 'string' ? req.body.css : '';
    const baseUrl = typeof req.body?.baseUrl === 'string' ? req.body.baseUrl : '';
    if (!html.trim()) {
      res.status(400).json({ error: 'html is required' });
      return;
    }
    try {
      const meta = readBrandDetail(brandsRoot, id)?.meta;
      if (!meta) {
        res.status(404).json({ error: 'brand not found' });
        return;
      }
      const result = await extractBrandFromHtml({
        id,
        meta,
        brandsRoot,
        userDesignSystemsRoot,
        projectsRoot,
        skillsRoot,
        dataDir,
        db,
        hasWebsiteSource: true,
        html,
        ...(css.trim() ? { css } : {}),
        ...(baseUrl.trim() ? { baseUrl } : {}),
      });
      if (!result) {
        res
          .status(422)
          .json({ error: 'Could not extract a design system from the provided page.' });
        return;
      }
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(/not found/i.test(message) ? 404 : 500).json({ error: message });
    }
  });

  // GET /api/brands/:id — full detail (meta + brand + guide). 404 if missing.
  app.get('/api/brands/:id', (req: Request, res: Response) => {
    try {
      const detail = readBrandDetail(brandsRoot, String(req.params.id));
      if (!detail) {
        res.status(404).json({ error: 'brand not found' });
        return;
      }
      res.json(reconcileBrandDetailStatus(brandsRoot, detail, createBrandStatusContext(deps)));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // DELETE /api/brands/:id — remove the brand and its registered design system.
  app.delete('/api/brands/:id', async (req: Request, res: Response) => {
    try {
      await removeBrand(brandsRoot, userDesignSystemsRoot, String(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/brands/:id/logo — serve the primary logo image. 404 if none.
  app.get('/api/brands/:id/logo', (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const logoPath =
        resolveBrandLogoPath(brandsRoot, id)
        ?? resolveBackingProjectLogoPath({ brandsRoot, projectsRoot, db }, id);
      if (!logoPath) {
        res.status(404).json({ error: 'logo not found' });
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(logoPath, { dotfiles: 'allow' }, (err) => {
        if (err && !res.headersSent) {
          res.status(404).json({ error: 'logo not found' });
        }
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
}

type BrandRunStatus = {
  value: string;
  updatedAt?: number;
  runId?: string;
  error?: string | null;
  errorCode?: string | null;
};

interface BrandStatusContext {
  latestByProject: Map<string, BrandRunStatus>;
  /** Projects whose latest assistant turn is a still-unanswered question form
   *  (anti-bot wall / clarifying question). Drives the reversible needs_input. */
  awaitingInput: Set<string>;
}

function createBrandStatusContext(deps: BrandRoutesDeps): BrandStatusContext {
  const latestByProject = new Map<string, BrandRunStatus>();
  for (const [projectId, status] of listLatestProjectRunStatuses(deps.db) as Map<string, BrandRunStatus>) {
    latestByProject.set(projectId, status);
  }
  for (const run of deps.runs?.list() ?? []) {
    if (!run.projectId) continue;
    const existing = latestByProject.get(run.projectId);
    const updatedAt = Number(run.updatedAt ?? 0);
    if (existing && updatedAt <= Number(existing.updatedAt ?? 0)) continue;
    latestByProject.set(run.projectId, {
      value: normalizeBrandRunStatus(run.status),
      updatedAt,
      runId: run.id,
      error: run.error ?? null,
      errorCode: run.errorCode ?? null,
    });
  }
  return { latestByProject, awaitingInput: listProjectsAwaitingInput(deps.db) };
}

function reconcileBrandSummaryStatus(
  brandsRoot: string,
  summary: BrandSummary,
  context: BrandStatusContext,
): BrandSummary {
  return {
    ...summary,
    meta: reconcileBrandMetaStatus(brandsRoot, summary.meta, context),
  };
}

function reconcileBrandDetailStatus(
  brandsRoot: string,
  detail: BrandDetailResponse,
  context: BrandStatusContext,
): BrandDetailResponse {
  return {
    ...detail,
    meta: reconcileBrandMetaStatus(brandsRoot, detail.meta, context),
  };
}

function reconcileBrandMetaStatus(
  brandsRoot: string,
  meta: BrandMeta,
  context: BrandStatusContext,
): BrandMeta {
  if (!meta.projectId) return meta;
  const status = context.latestByProject.get(meta.projectId);
  if (status && (status.value === 'failed' || status.value === 'canceled')) {
    const error = terminalBrandRunError(meta, status);
    if (!shouldReconcileTerminalBrandRun(meta, status)) return meta;
    if (meta.status === 'failed' && meta.error === error) return meta;
    const terminalPatch: Parameters<typeof patchMeta>[2] = {
      status: 'failed',
      error,
      extractionTerminalError: error,
    };
    if (status.runId) terminalPatch.extractionTerminalRunId = status.runId;
    return patchMeta(brandsRoot, meta.id, terminalPatch) ?? {
      ...meta,
      status: 'failed',
      error,
      extractionTerminalError: error,
      ...(status.runId ? { extractionTerminalRunId: status.runId } : {}),
    };
  }
  if (meta.status !== 'extracting') return meta;
  // The backing run paused on a question form (anti-bot wall / clarifying
  // question). Surface it as needs_input WITHOUT persisting — answering the
  // question resumes extraction, so the brand must be free to flip back.
  if (context.awaitingInput.has(meta.projectId)) {
    return { ...meta, status: 'needs_input' };
  }
  return meta;
}

function terminalBrandRunError(meta: BrandMeta, status: BrandRunStatus): string {
  return (
    status.error
    ?? (status.runId && meta.extractionTerminalRunId === status.runId
      ? meta.extractionTerminalError
      : undefined)
    ?? (status.value === 'canceled'
      ? 'Brand extraction was canceled.'
      : 'Brand extraction failed in the backing project.')
  );
}

function shouldReconcileTerminalBrandRun(meta: BrandMeta, status: BrandRunStatus): boolean {
  if (meta.status === 'extracting') return true;
  return Boolean(
    meta.status === 'ready'
    && status.runId
    && meta.extractionTerminalRunId === status.runId,
  );
}

function normalizeBrandRunStatus(status: string): string {
  if (status === 'starting' || status === 'queued') return 'running';
  if (status === 'cancelled') return 'canceled';
  return status;
}

function resolveBackingProjectLogoPath(
  deps: Pick<BrandRoutesDeps, 'brandsRoot' | 'projectsRoot' | 'db'>,
  id: string,
): string | null {
  const detail = readBrandDetail(deps.brandsRoot, id);
  const projectId = detail?.meta.projectId;
  if (!projectId) return null;
  const project = getProject(deps.db, projectId);
  if (!project) return null;
  const projectRoot = resolveProjectDir(deps.projectsRoot, projectId, project.metadata);
  const primary = detail.brand?.logo?.primary;
  if (primary) {
    const abs = resolveProjectLogoFile(projectRoot, primary);
    if (abs) return abs;
  }

  const logosDir = resolveProjectLogoDirectory(projectRoot, 'logos');
  if (!logosDir) return null;
  let names: string[];
  try {
    names = fs.readdirSync(logosDir);
  } catch {
    return null;
  }
  const pick = names
    .filter((name) => isKnownLogoFile(path.join(logosDir, name)))
    .sort((a, b) => extRank(a) - extRank(b) || a.localeCompare(b))[0];
  return pick ? path.join(logosDir, pick) : null;
}

function resolveProjectLogoFile(projectRoot: string, relPath: string): string | null {
  const abs = resolveProjectLogoPath(projectRoot, relPath);
  return abs && isKnownLogoFile(abs) ? abs : null;
}

function resolveProjectLogoDirectory(projectRoot: string, relPath: string): string | null {
  const abs = resolveProjectLogoPath(projectRoot, relPath);
  return abs && isDirectory(abs) ? abs : null;
}

function resolveProjectLogoPath(projectRoot: string, relPath: string): string | null {
  const segments = relPath.replace(/^\.?\/+/, '').split('/').filter(Boolean);
  if (
    segments.length === 0
    || segments.some((segment) => segment === '..' || segment.includes('\\') || segment.includes('\0'))
    || segments[0] !== 'logos'
  ) {
    return null;
  }
  const root = path.resolve(projectRoot);
  const abs = path.resolve(root, ...segments);
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) return null;
  return abs;
}

function extRank(name: string): number {
  const i = LOGO_EXT_PRIORITY.indexOf(path.extname(name).toLowerCase());
  return i === -1 ? LOGO_EXT_PRIORITY.length : i;
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isKnownLogoFile(p: string): boolean {
  return extRank(p) < LOGO_EXT_PRIORITY.length && isFile(p);
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

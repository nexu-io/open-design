import type { Express, Response } from 'express';
import type Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import type {
  DesignSystemTokenContractRebuildJobResponse,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import { TeamResourceCopyForbiddenError } from '@open-design/contracts';
import {
  enforceTeamResourceCopyAllowed,
  type TeamResourceStateProvider,
} from '../collab/team-resource-state.js';
import { detectAgents, detectAgentsStream } from '../agents.js';
import {
  SkillImportError,
  deleteUserSkill,
  findSkillById,
  importUserSkill,
  listSkillFiles,
  splitDerivedSkillId,
  updateUserSkill,
} from '../skills.js';
import {
  deleteWorkspaceResourceByResourceId,
  ensureWorkspaceResource,
  getWorkspaceResource,
  getWorkspaceResourceByResourceId,
} from '../db.js';
import {
  enforceVerifiedWorkspaceResourceMutation,
  resolveOptionalWorkspaceRequestAuthority,
  type VerifyWorkspaceRequestAuthority,
} from '../collab/workspace-resource-mutation.js';
import { listCodexPets, readCodexPetSpritesheet } from '../codex-pets.js';
import { syncCommunityPets } from '../community-pets-sync.js';
import { readDesignSystem } from '../design-systems/index.js';
import {
  LocalDesignSystemImportError,
  importLocalDesignSystemProject,
} from '../design-systems/import.js';
import { importGitHubDesignSystemProject } from '../design-systems/github-import.js';
import { importShadcnDesignSystemProject } from '../design-systems/shadcn-import.js';
import { renderDesignSystemPreview } from '../design-systems/preview.js';
import { renderDesignSystemShowcase } from '../design-systems/showcase.js';
import { listPromptTemplates, readPromptTemplate } from '../media/prompt-templates.js';
import { readAppConfig } from '../app-config.js';
import { installFromTarget, uninstallById } from '../library-install.js';
import {
  installSkillFromRemoteSource,
  type SkillInstallErrorCode,
} from '../services/skill-installation.js';
import type { RouteDeps } from '../server-context.js';

export interface RegisterAtomRoutesDeps {
  db: Database.Database;
  resources: { FIRST_PARTY_ATOMS: Array<{ id: string; taskKinds: string[]; [key: string]: unknown }> };
}

export interface RegisterStaticResourceRoutesDeps extends RouteDeps<'db' | 'http' | 'paths' | 'resources'> {
  verifyWorkspaceRequestAuthority?: VerifyWorkspaceRequestAuthority;
  tokenContractRebuild?: {
    maybeStartForImportedDesignSystem?: (
      designSystemId: string,
    ) => Promise<DesignSystemTokenContractRebuildJobResponse | undefined>;
  };
  /** Team-resource copy red-line (D3). When present, a frozen team skill cannot
   *  be edit-shadowed into a personal editable copy. Omit to skip (no-op). */
  teamResources?: TeamResourceStateProvider;
}

export function registerAtomRoutes(app: Express, ctx: RegisterAtomRoutesDeps) {
  const { db } = ctx;
  const atoms = ctx.resources.FIRST_PARTY_ATOMS ?? [];

  app.get('/api/atoms', (_req, res) => {
    res.json({ atoms: atoms.map((a) => ({ ...a, taskKinds: a.taskKinds.slice() })) });
  });

  app.get('/api/atoms/:id', async (req, res) => {
    const id = req.params.id;
    const atom = atoms.find((a) => a.id === id);
    if (!atom) {
      return res.status(404).json({ error: { code: 'atom-not-found', message: `Unknown atom "${id}"` } });
    }
    const body: Record<string, unknown> = { ...atom, taskKinds: atom.taskKinds.slice() };
    try {
      const { loadAtomBodies } = await import('../plugins/atom-bodies.js');
      const bodies = await loadAtomBodies(db, [id]);
      if (bodies[0] && typeof bodies[0].body === 'string') body.skillBody = bodies[0].body;
    } catch (err) {
      console.warn(`[atoms] failed to load SKILL.md body for ${id}:`, err);
    }
    res.json(body);
  });
}

export function registerStaticResourceRoutes(app: Express, ctx: RegisterStaticResourceRoutesDeps) {
  const { db } = ctx;
  const {
    RUNTIME_DATA_DIR,
    RUNTIME_DATA_DIR_CANONICAL,
    PROJECT_ROOT,
    DESIGN_SYSTEMS_DIR,
    USER_DESIGN_SYSTEMS_DIR,
    DESIGN_TEMPLATES_DIR,
    USER_DESIGN_TEMPLATES_DIR,
    SKILLS_DIR,
    USER_SKILLS_DIR,
    PROMPT_TEMPLATES_DIR,
    BUNDLED_PETS_DIR,
  } = ctx.paths;
  const {
    listAllSkills,
    listAllDesignTemplates,
    listAllSkillLikeEntries,
    listAllDesignSystems,
    resolveWorkspaceScope,
    canMutateUserDesignSystem,
    mimeFor,
  } = ctx.resources;
  const { isLocalSameOrigin, resolvedPortRef, sendApiError } = ctx.http;
  const teamResources = ctx.teamResources;
  const requireLocalOrigin = (req: any, res: any) => {
    if (isLocalSameOrigin(req, resolvedPortRef.current)) return true;
    sendApiError(res, 403, 'FORBIDDEN', 'local origin required');
    return false;
  };
  const sendWorkspaceScopeError = (res: Response, error: unknown): boolean => {
    if (
      !error
      || typeof error !== 'object'
      || !('status' in error)
      || (error.status !== 400 && error.status !== 403 && error.status !== 503)
      || !('code' in error)
      || typeof error.code !== 'string'
    ) {
      return false;
    }
    res.status(error.status).json({
      error: error.code,
      message: error instanceof Error ? error.message : String(error.code),
      ...('retryable' in error && error.retryable === true ? { retryable: true } : {}),
    });
    return true;
  };
  // Stamp a freshly imported/installed skill with the caller's workspace, the
  // same moment plugin install does (`installOrUpgradePlugin` in server.ts).
  // A caller with no workspace headers (`od skill import`, a not-logged-in
  // web session) leaves the skill unbound — visible everywhere, same as
  // every skill imported before this shipped ("no retroactive tagging").
  const bindImportedSkillToWorkspace = (
    authority: WorkspaceCollabContext | null,
    skillId: string,
  ): void => {
    if (!authority) return;
    ensureWorkspaceResource(db, 'skill', authority.workspaceId, skillId, {
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: authority.workspaceMemberId,
      updatedByWorkspaceMemberId: authority.workspaceMemberId,
    });
  };
  const requestWithNavigationScope = (req: any): any | 'conflict' => {
    const workspaceId = typeof req.query?.workspaceId === 'string'
      ? req.query.workspaceId.trim()
      : '';
    const workspaceMemberId = typeof req.query?.workspaceMemberId === 'string'
      ? req.query.workspaceMemberId.trim()
      : '';
    if (!workspaceId && !workspaceMemberId) return req;
    const headerWorkspaceId = req.get('x-od-workspace-id')?.trim() ?? '';
    const headerWorkspaceMemberId =
      req.get('x-od-workspace-member-id')?.trim() ?? '';
    if (
      (headerWorkspaceId || headerWorkspaceMemberId)
      && (
        headerWorkspaceId !== workspaceId
        || headerWorkspaceMemberId !== workspaceMemberId
      )
    ) {
      return 'conflict';
    }
    return {
      get(name: string) {
        const normalized = name.toLowerCase();
        if (normalized === 'x-od-workspace-id') return workspaceId || undefined;
        if (normalized === 'x-od-workspace-member-id') {
          return workspaceMemberId || undefined;
        }
        return req.get(name);
      },
    };
  };
  const resolveWorkspaceAuthority = async (
    req: any,
    res: Response,
    options: { allowNavigationQuery?: boolean } = {},
  ): Promise<WorkspaceCollabContext | null | undefined> => {
    const scopedRequest = options.allowNavigationQuery
      ? requestWithNavigationScope(req)
      : req;
    if (scopedRequest === 'conflict') {
      sendApiError(
        res,
        400,
        'WORKSPACE_CONTEXT_CONFLICT',
        'workspace header and navigation scope must match',
      );
      return undefined;
    }
    const authority = await resolveOptionalWorkspaceRequestAuthority(
      scopedRequest,
      ctx.verifyWorkspaceRequestAuthority,
    );
    if (!authority.ok) {
      sendApiError(res, authority.status, authority.code, authority.message, {
        ...(authority.retryable ? { retryable: true } : {}),
      });
      return undefined;
    }
    return authority.context;
  };
  // Gate a mutation route for a skill bound into `workspace_resources`. Only
  // applies when the skill actually carries a binding row (installed/imported
  // through the workspace-aware routes above after this shipped) — an unbound
  // legacy skill stays outside the isolation regime, mirroring the plugin
  // uninstall route's same conditional gate.
  const enforceSkillWorkspaceMutation = async (
    req: any,
    res: any,
    skillId: string,
    capability: 'delete' | 'writeFiles',
  ): Promise<boolean> => {
    const binding = getWorkspaceResourceByResourceId(db, 'skill', skillId);
    if (!binding) return true;
    return enforceVerifiedWorkspaceResourceMutation(
      'skill',
      req,
      res,
      sendApiError,
      (dbArg, workspaceId, resourceId) => getWorkspaceResource(dbArg as typeof db, 'skill', workspaceId, resourceId),
      (dbArg, resourceId) => getWorkspaceResourceByResourceId(dbArg as typeof db, 'skill', resourceId),
      db,
      skillId,
      capability,
      ctx.verifyWorkspaceRequestAuthority,
    );
  };
  const importedDesignSystemResponse = async <T extends { id: string }>(designSystem: T) => {
    let tokenContractRebuild: DesignSystemTokenContractRebuildJobResponse | undefined;
    try {
      tokenContractRebuild = await ctx.tokenContractRebuild?.maybeStartForImportedDesignSystem?.(designSystem.id);
    } catch (err) {
      console.warn('[design-systems] import token-contract rebuild auto-queue failed', err);
    }
    return {
      designSystem,
      ...(tokenContractRebuild ? { tokenContractRebuild } : {}),
    };
  };

  app.get('/api/agents', async (req, res) => {
    const wantsStream =
      req.query.stream === '1' || req.query.stream === 'true';
    let config;
    try {
      config = await readAppConfig(RUNTIME_DATA_DIR);
    } catch (err: any) {
      res.status(500).json({ error: String(err) });
      return;
    }
    const agentCliEnv = config.agentCliEnv ?? {};

    if (!wantsStream) {
      try {
        const list = await detectAgents(agentCliEnv);
        res.json({ agents: list });
      } catch (err: any) {
        res.status(500).json({ error: String(err) });
      }
      return;
    }

    // Server-Sent Events: emit each agent as its probe settles so the client
    // can paint cards incrementally instead of waiting for the slowest CLI.
    // Each `agent` event carries one AgentInfo; a terminal `done` event lets
    // the client distinguish "stream finished" from a dropped connection.
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    let aborted = false;
    req.on('close', () => {
      aborted = true;
    });
    try {
      for await (const agent of detectAgentsStream(agentCliEnv)) {
        if (aborted) break;
        res.write(`event: agent\ndata: ${JSON.stringify(agent)}\n\n`);
      }
      if (!aborted) {
        res.write('event: done\ndata: {}\n\n');
      }
    } catch (err: any) {
      if (!aborted) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`);
      }
    } finally {
      res.end();
    }
  });

  app.get('/api/skills', async (req, res) => {
    try {
      // Workspace-scoped (see `skillVisibleFromWorkspace` in skills.ts): a
      // skill imported into a different workspace than the caller's is
      // hidden, same one-way rule `GET /api/plugins` already applies.
      const authority = await resolveWorkspaceAuthority(req, res);
      if (authority === undefined) return;
      const workspaceId = authority?.workspaceId ?? null;
      const skills = await listAllSkills({ workspaceId });
      // Strip full body + on-disk dir from the listing — frontend fetches the
      // body via /api/skills/:id when needed (keeps the listing payload small).
      res.json({
        skills: skills.map(({ body, dir: _dir, ...rest }) => ({
          ...rest,
          hasBody: typeof body === 'string' && body.length > 0,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/skills/:id', async (req, res) => {
    try {
      const authority = await resolveWorkspaceAuthority(req, res);
      if (authority === undefined) return;
      const workspaceId = authority?.workspaceId ?? null;
      const skills = await listAllSkills({ workspaceId });
      const skill = findSkillById(skills, req.params.id);
      if (!skill) return res.status(404).json({ error: 'skill not found' });
      const { dir: _dir, ...serializable } = skill;
      res.json(serializable);
    } catch (err: any) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Design templates — the rendering catalogue. Same shape as /api/skills
  // (so the web client can reuse SkillSummary types) but rooted at
  // DESIGN_TEMPLATE_ROOTS so the listing stays focused on template-style
  // entries without bleeding functional skills into the EntryView gallery.
  app.get('/api/design-templates', async (_req, res) => {
    try {
      const templates = await listAllDesignTemplates();
      res.json({
        designTemplates: templates.map(({ body, dir: _dir, ...rest }) => ({
          ...rest,
          hasBody: typeof body === 'string' && body.length > 0,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/design-templates/:id', async (req, res) => {
    try {
      const templates = await listAllDesignTemplates();
      const template = findSkillById(templates, req.params.id);
      if (!template) return res.status(404).json({ error: 'design template not found' });
      const { dir: _dir, ...serializable } = template;
      res.json(serializable);
    } catch (err: any) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/skills/import — write a new SKILL.md under USER_SKILLS_DIR
  // from a UI-supplied body. The next /api/skills request surfaces it
  // automatically because listSkills walks USER_SKILLS_DIR first.
  app.post('/api/skills/import', async (req, res) => {
    try {
      const authority = await resolveWorkspaceAuthority(req, res);
      if (authority === undefined) return;
      const result = await importUserSkill(USER_SKILLS_DIR, req.body || {});
      bindImportedSkillToWorkspace(authority, result.id);
      const skills = await listAllSkills({ workspaceId: authority?.workspaceId ?? null });
      const skill = findSkillById(skills, result.id);
      if (!skill) {
        return sendApiError(
          res,
          500,
          'INTERNAL_ERROR',
          'imported skill was not found in catalog',
        );
      }
      const { dir: _dir, body: _body, ...serializable } = skill;
      res.status(201).json({
        skill: {
          ...serializable,
          hasBody: typeof skill.body === 'string' && skill.body.length > 0,
        },
      });
    } catch (err: any) {
      if (err instanceof SkillImportError) {
        const status = err.code === 'NOT_FOUND' ? 404 : err.code === 'BAD_REQUEST' ? 400 : 500;
        return sendApiError(res, status, err.code, err.message);
      }
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  // PUT /api/skills/:id — update an existing user-managed skill's
  // SKILL.md (and, when the user edits a built-in for the first time,
  // clone its side files into USER_SKILLS_DIR/<slug>/ so subsequent
  // /api/skills/:id/{files,example,assets/*} requests keep resolving
  // the bundled assets/references/scripts/examples). See PR #955 review.
  app.put('/api/skills/:id', async (req, res) => {
    try {
      const authority = await resolveWorkspaceAuthority(req, res);
      if (authority === undefined) return;
      const skills = await listAllSkills({ workspaceId: authority?.workspaceId ?? null });
      const skill = findSkillById(skills, req.params.id);
      if (!skill) {
        return sendApiError(res, 404, 'NOT_FOUND', 'skill not found');
      }
      // AC-9 copy red-line (D3): a frozen team skill cannot be edit-shadowed into
      // a personal editable copy. No-op until the resource-hub reports this skill
      // as a frozen team resource.
      if (teamResources) {
        await enforceTeamResourceCopyAllowed(teamResources, { kind: 'skill', resourceId: skill.id });
      }
      if (!await enforceSkillWorkspaceMutation(req, res, skill.id, 'writeFiles')) return;
      const result = await updateUserSkill(USER_SKILLS_DIR, {
        ...(req.body || {}),
        id: skill.id,
        sourceDir: skill.dir,
      });
      const next = await listAllSkills({ workspaceId: authority?.workspaceId ?? null });
      const updated = findSkillById(next, result.id);
      if (!updated) {
        return sendApiError(
          res,
          500,
          'INTERNAL_ERROR',
          'updated skill was not found in catalog',
        );
      }
      const { dir: _dir, body: _body, ...serializable } = updated;
      res.json({
        skill: {
          ...serializable,
          hasBody: typeof updated.body === 'string' && updated.body.length > 0,
        },
      });
    } catch (err: any) {
      if (err instanceof TeamResourceCopyForbiddenError) {
        return sendApiError(res, 403, err.code, err.message);
      }
      if (err instanceof SkillImportError) {
        const status = err.code === 'NOT_FOUND' ? 404 : err.code === 'BAD_REQUEST' ? 400 : 500;
        return sendApiError(res, status, err.code, err.message);
      }
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  // GET /api/skills/:id/files — flat listing of the files that ship with
  // a skill. Used by the Settings → Skills detail panel to render the
  // file tree (capped server-side to keep payload bounded).
  app.get('/api/skills/:id/files', async (req, res) => {
    try {
      const authority = await resolveWorkspaceAuthority(req, res);
      if (authority === undefined) return;
      const workspaceId = authority?.workspaceId ?? null;
      const skills = await listAllSkills({ workspaceId });
      const skill = findSkillById(skills, req.params.id);
      if (!skill) {
        return sendApiError(res, 404, 'NOT_FOUND', 'skill not found');
      }
      const files = await listSkillFiles(skill.dir);
      res.json({ files });
    } catch (err: any) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  // Codex hatch-pet registry — pets packaged by the upstream `hatch-pet`
  // skill under `${CODEX_HOME:-$HOME/.codex}/pets/`. Surfaced so the web
  // pet settings can offer one-click adoption of recently-hatched pets.
  app.get('/api/codex-pets', async (_req, res) => {
    try {
      const result = await listCodexPets({
        baseUrl: '',
        bundledRoot: BUNDLED_PETS_DIR,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: String(err) });
    }
  });

  // One-click community sync. Hits the Codex Pet Share + j20 Hatchery
  // catalogs and drops every pet into `${CODEX_HOME:-$HOME/.codex}/pets/`
  // so `GET /api/codex-pets` (and the web Pet settings) pick them up
  // immediately. The body is intentionally tiny — we keep the heavier
  // tuning knobs (`--limit`, `--concurrency`) on the CLI script and
  // only surface `force` + `source` here.
  app.post('/api/codex-pets/sync', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const sourceRaw = typeof body.source === 'string' ? body.source : 'all';
      const source =
        sourceRaw === 'petshare' || sourceRaw === 'hatchery'
          ? sourceRaw
          : 'all';
      const result = await syncCommunityPets({
        source,
        force: Boolean(body.force),
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: String((err && err.message) || err) });
    }
  });

  app.get('/api/codex-pets/:id/spritesheet', async (req, res) => {
    try {
      const sheet = await readCodexPetSpritesheet(req.params.id, {
        bundledRoot: BUNDLED_PETS_DIR,
      });
      if (!sheet) {
        return res
          .status(404)
          .type('text/plain')
          .send('codex pet spritesheet not found');
      }
      const mime =
        sheet.ext === 'webp'
          ? 'image/webp'
          : sheet.ext === 'gif'
            ? 'image/gif'
            : 'image/png';
      res.type(mime);
      // Same-origin callers (the web app proxies `/api/*` through to
      // the daemon, so PetSettings adoption fetches arrive same-origin)
      // do not need any CORS header here. We only echo
      // `Access-Control-Allow-Origin` for sandboxed iframes / data:
      // URIs (Origin: null) which need it to draw the bytes onto a
      // canvas without tainting. Local pet bytes should not be exposed
      // to arbitrary third-party origins via a wildcard ACAO.
      if (req.headers.origin === 'null') {
        res.setHeader('Access-Control-Allow-Origin', 'null');
      }
      res.setHeader('Cache-Control', 'no-store');
      const buf = await fs.promises.readFile(sheet.absPath);
      res.send(buf);
    } catch (err: any) {
      res.status(500).type('text/plain').send(String(err));
    }
  });

  app.get('/api/design-systems', async (req, res) => {
    try {
      // The library CATALOG is workspace-scoped (#145): user design systems all
      // share one directory on disk, so without this the systems authored in
      // one workspace also filled a brand-new one. Every other caller of
      // `listAllDesignSystems` resolves a system by id and stays unscoped.
      const systems = await listAllDesignSystems({
        workspaceId: (await resolveWorkspaceScope?.(req)) ?? null,
      });
      // recvqb6mfyqXLD: decorate every teamSynced entry with the same
      // mutate verdict the PATCH/DELETE routes enforce, so any surface that
      // renders straight off this list (e.g. `ProjectView`'s in-project
      // Design System tab, which resolves its own `designSystemEditable`
      // from this exact array rather than the single-item detail fetch) can
      // gate its Publish toggle / delete affordances on it too — not just
      // the detail route. Skipped for anything not `teamSynced` (the
      // overwhelming majority: every built-in preset plus the caller's own
      // systems) so a hot, frequently-polled list read does not pay a
      // per-item disk/hub round trip it already knows the answer to.
      const designSystems = canMutateUserDesignSystem
        ? await Promise.all(
            systems.map(async ({ body, ...rest }) => (
              rest.teamSynced
                ? { ...rest, canMutate: await canMutateUserDesignSystem(USER_DESIGN_SYSTEMS_DIR, rest.id, req) }
                : rest
            )),
          )
        : systems.map(({ body, ...rest }) => rest);
      res.json({ designSystems });
    } catch (err: any) {
      if (sendWorkspaceScopeError(res, err)) return;
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/prompt-templates', async (_req, res) => {
    try {
      const templates = await listPromptTemplates(PROMPT_TEMPLATES_DIR);
      res.json({
        promptTemplates: templates.map(({ prompt: _prompt, ...rest }) => rest),
      });
    } catch (err: any) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/prompt-templates/:surface/:id', async (req, res) => {
    try {
      const tpl = await readPromptTemplate(
        PROMPT_TEMPLATES_DIR,
        req.params.surface,
        req.params.id,
      );
      if (!tpl)
        return res.status(404).json({ error: 'prompt template not found' });
      res.json({ promptTemplate: tpl });
    } catch (err: any) {
      res.status(500).json({ error: String(err) });
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
  //   1. Derived id (`<parent>:<child>`):
  //      <parentDir>/examples/<child>.html — pre-baked single-file sample.
  //      Subfolder layouts (e.g. live-artifact's
  //      `examples/<name>/template.html`) are intentionally not served:
  //      they still contain `{{data.x}}` placeholders that only the
  //      daemon-side renderer fills in, and serving the raw template
  //      would render visible placeholder braces in the gallery.
  //   2. <skillDir>/example.html — fully-baked static example (preferred)
  //   3. <skillDir>/assets/template.html  +
  //      <skillDir>/assets/example-slides.html — assemble at request time
  //      by replacing the `<!-- SLIDES_HERE -->` marker with the snippet
  //      and patching the placeholder <title>. Lets a skill ship one
  //      canonical seed plus a small content fragment, so the example
  //      never drifts from the seed.
  //   4. <skillDir>/assets/template.html — raw template, no content slides
  //   5. <skillDir>/assets/index.html — generic fallback
  //   6. First .html in <skillDir>/examples/ — used as a friendly fallback
  //      so a skill that aggregates examples (like live-artifact) still has
  //      a real preview on its parent card instead of returning 404.
  app.get('/api/skills/:id/example', async (req, res) => {
    try {
      // Span both functional skills and design templates: rendered example
      // HTML rewrites assets to /api/skills/<id>/... and we want those URLs
      // to keep resolving regardless of which root owns the backing folder
      // after the skills/design-templates split.
      const authority = await resolveWorkspaceAuthority(req, res, {
        allowNavigationQuery: true,
      });
      if (authority === undefined) return;
      const workspaceId = authority?.workspaceId ?? null;
      const skills = await listAllSkillLikeEntries({ workspaceId });
      const workspaceQuery = authority
        ? `?workspaceId=${encodeURIComponent(authority.workspaceId)}&workspaceMemberId=${encodeURIComponent(authority.workspaceMemberId)}`
        : '';

      // 1. Derived `<parent>:<child>` id — resolve straight to the matching
      // file under <parentDir>/examples/. Done before findSkillById so the
      // parent's normal fallback chain never accidentally serves a stale
      // file when a sample is missing (we'd rather 404 explicitly).
      const derived = splitDerivedSkillId(req.params.id);
      if (derived) {
        const parent = findSkillById(skills, derived.parentId);
        if (!parent) {
          return res.status(404).type('text/plain').send('skill not found');
        }
        const candidate = path.join(
          parent.dir,
          'examples',
          `${derived.childKey}.html`,
        );
        if (fs.existsSync(candidate)) {
          const html = await fs.promises.readFile(candidate, 'utf8');
          return res
            .type('text/html')
            .send(rewriteSkillAssetUrls(html, parent.id, workspaceQuery));
        }
        return res
          .status(404)
          .type('text/plain')
          .send('derived example not found');
      }

      const skill = findSkillById(skills, req.params.id);
      if (!skill) {
        return res.status(404).type('text/plain').send('skill not found');
      }

      const baked = path.join(skill.dir, 'example.html');
      if (fs.existsSync(baked)) {
        const html = await fs.promises.readFile(baked, 'utf8');
        return res
          .type('text/html')
          .send(rewriteSkillAssetUrls(html, skill.id, workspaceQuery));
      }

      const tpl = path.join(skill.dir, 'assets', 'template.html');
      const slides = path.join(skill.dir, 'assets', 'example-slides.html');
      if (fs.existsSync(tpl) && fs.existsSync(slides)) {
        try {
          const tplHtml = await fs.promises.readFile(tpl, 'utf8');
          const slidesHtml = await fs.promises.readFile(slides, 'utf8');
          const assembled = assembleExample(tplHtml, slidesHtml, skill.name);
          return res
            .type('text/html')
            .send(rewriteSkillAssetUrls(assembled, skill.id, workspaceQuery));
        } catch {
          // Fall through to raw template on read failure.
        }
      }
      if (fs.existsSync(tpl)) {
        const html = await fs.promises.readFile(tpl, 'utf8');
        return res
          .type('text/html')
          .send(rewriteSkillAssetUrls(html, skill.id, workspaceQuery));
      }
      const idx = path.join(skill.dir, 'assets', 'index.html');
      if (fs.existsSync(idx)) {
        const html = await fs.promises.readFile(idx, 'utf8');
        return res
          .type('text/html')
          .send(rewriteSkillAssetUrls(html, skill.id, workspaceQuery));
      }

      // Friendly fallback for skills that aggregate examples in a sibling
      // `examples/` folder (e.g. live-artifact). The parent card would
      // otherwise 404 even though plenty of perfectly valid samples ship
      // alongside SKILL.md; pick the first .html file alphabetically so
      // direct URL access (e.g. deep links) shows something representative.
      // Subfolder layouts are excluded for the same reason as the derived
      // resolver above — their `template.html` still has unresolved
      // `{{data.x}}` placeholders.
      const examplesDir = path.join(skill.dir, 'examples');
      if (fs.existsSync(examplesDir)) {
        let entries: string[] = [];
        try {
          entries = await fs.promises.readdir(examplesDir);
        } catch {
          entries = [];
        }
        entries.sort();
        for (const name of entries) {
          if (name.startsWith('.')) continue;
          if (!name.toLowerCase().endsWith('.html')) continue;
          const direct = path.join(examplesDir, name);
          try {
            const html = await fs.promises.readFile(direct, 'utf8');
            return res
              .type('text/html')
              .send(rewriteSkillAssetUrls(html, skill.id, workspaceQuery));
          } catch {
            continue;
          }
        }
      }

      res
        .status(404)
        .type('text/plain')
        .send(
          'no example.html, assets/template.html, assets/index.html, or examples/*.html for this skill',
        );
    } catch (err: any) {
      res.status(500).type('text/plain').send(String(err));
    }
  });

  // Static assets shipped beside a skill's example/template HTML. Lets the
  // example HTML reference `./assets/foo.png`-style paths that resolve
  // correctly when the response is loaded into a sandboxed `srcdoc` iframe
  // (where relative URLs would otherwise resolve against `about:srcdoc`).
  // The example response above rewrites `./assets/<file>` into a request
  // against this route; we still keep the on-disk paths human-friendly so
  // contributors can preview `example.html` straight from disk.
  app.get('/api/skills/:id/assets/*splat', async (req, res) => {
    try {
      // Same rationale as /example above — assets need to resolve whether
      // the owning skill folder lives under skills/ or design-templates/.
      const authority = await resolveWorkspaceAuthority(req, res, {
        allowNavigationQuery: true,
      });
      if (authority === undefined) return;
      const workspaceId = authority?.workspaceId ?? null;
      const skills = await listAllSkillLikeEntries({ workspaceId });
      const skill = findSkillById(skills, req.params.id);
      if (!skill) {
        return res.status(404).type('text/plain').send('skill not found');
      }
      const splatParam = (req.params as { splat?: string | string[] }).splat;
      const relPath = Array.isArray(splatParam) ? splatParam.join('/') : String(splatParam || '');
      const assetsRoot = path.resolve(skill.dir, 'assets');
      const target = path.resolve(assetsRoot, relPath);
      if (target !== assetsRoot && !target.startsWith(assetsRoot + path.sep)) {
        return res.status(400).type('text/plain').send('invalid asset path');
      }
      if (!fs.existsSync(target)) {
        return res.status(404).type('text/plain').send('asset not found');
      }
      // The example HTML is rendered inside a sandboxed iframe (Origin: null).
      // Mirror the project /raw route's allowance so the iframe can fetch the
      // image bytes; same-origin web callers do not need this header.
      if (req.headers.origin === 'null') {
        res.header('Access-Control-Allow-Origin', '*');
      }
      await res.type(mimeFor(target)).sendFile(target);
    } catch (err: any) {
      res.status(500).type('text/plain').send(String(err));
    }
  });

  app.post('/api/skills/install', async (req, res) => {
    if (!requireLocalOrigin(req, res)) return;
    try {
      const authority = await resolveWorkspaceAuthority(req, res);
      if (authority === undefined) return;
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const isLegacyTarget =
        (body.source === 'github' && typeof body.url === 'string') ||
        (body.source === 'local' && typeof body.path === 'string');
      const result = isLegacyTarget
        ? await installFromTarget(body, USER_SKILLS_DIR, 'skill')
        : await installSkillFromRemoteSource(
            USER_SKILLS_DIR,
            typeof body.source === 'string' ? body.source : '',
          );
      if (!result.ok) {
        const statusByCode: Partial<Record<SkillInstallErrorCode, number>> = {
          BAD_REQUEST: 400,
          FETCH_FAILED: 502,
          INVALID_ARCHIVE: 400,
          INVALID_MANIFEST: 400,
          CONFLICT: 409,
          INTERNAL_ERROR: 500,
        };
        const code = 'code' in result ? result.code : undefined;
        return res
          .status((code && statusByCode[code]) || 400)
          .json({ error: result.error, ...(code ? { code } : {}) });
      }
      if (typeof result.dir !== 'string' || !result.dir) {
        return res.status(500).json({ error: 'skill install did not return an installation directory' });
      }
      const skills = await listAllSkills({ workspaceId: authority?.workspaceId ?? null });
      const installedDir = fs.realpathSync.native(result.dir);
      const skill = skills.find((candidate) => fs.realpathSync.native(candidate.dir) === installedDir);
      if (!skill) {
        return res.status(500).json({ error: `installed skill was not found in catalog: ${result.dir}` });
      }
      bindImportedSkillToWorkspace(authority, skill.id);
      res.json({
        skill: {
          ...skill,
          dir: undefined,
          body: undefined,
          hasBody: typeof skill.body === 'string' && skill.body.length > 0,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: String(err) });
    }
  });

  // This route used to carry NO permission check at all: any caller (any
  // workspace, any role) could delete any skill, including one installed by
  // someone else or pulled in from a team share. Now gated the same way
  // `POST /api/plugins/:id/uninstall` is, via the shared
  // `enforceWorkspaceResourceMutation` — see `enforceSkillWorkspaceMutation`
  // above for the "only when a binding row exists" conditional.
  app.delete('/api/skills/:id', async (req, res) => {
    if (!requireLocalOrigin(req, res)) return;
    try {
      if (!await enforceSkillWorkspaceMutation(req, res, req.params.id, 'delete')) return;
      const result = await uninstallById(req.params.id, USER_SKILLS_DIR, SKILLS_DIR, 'skill');
      if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
      // Clean up the binding row too — `workspace_resources` has no
      // FOREIGN KEY ... ON DELETE CASCADE (see db.ts's doc comment on the
      // table), so skipping this would leave an orphan binding that
      // re-importing the same skill id would find and silently reuse (stale
      // workspace/visibility). A DELETE against a row that never existed is a
      // no-op.
      deleteWorkspaceResourceByResourceId(db, 'skill', req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/design-systems/install', async (req, res) => {
    if (!requireLocalOrigin(req, res)) return;
    try {
      const result = await installFromTarget(req.body, USER_DESIGN_SYSTEMS_DIR, 'design-system');
      if (!result.ok) return res.status(400).json({ error: result.error });
      if (typeof result.dir !== 'string' || !result.dir) {
        return res.status(500).json({ error: 'design system install did not return an installation directory' });
      }
      const systems = await listAllDesignSystems();
      const designSystemId = path.basename(fs.realpathSync.native(result.dir));
      const designSystem = findUserDesignSystemInCatalog(systems, designSystemId);
      if (!designSystem) {
        return res.status(500).json({ error: `installed design system was not found in catalog: ${result.dir}` });
      }
      res.json({ designSystem });
    } catch (err: any) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/design-systems/import/local', async (req, res) => {
    if (!requireLocalOrigin(req, res)) return;
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const inputPath =
        typeof body.baseDir === 'string'
          ? body.baseDir
          : typeof body.path === 'string'
            ? body.path
            : typeof body.localPath === 'string'
              ? body.localPath
              : '';
      if (!path.isAbsolute(inputPath)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'local project path must be absolute');
      }
      let sourceRoot: string;
      let sourceStats: fs.Stats;
      try {
        sourceRoot = fs.realpathSync.native(inputPath);
        sourceStats = fs.statSync(sourceRoot);
      } catch {
        return sendApiError(res, 400, 'BAD_REQUEST', 'local project path was not found');
      }
      if (!sourceStats.isDirectory()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'local project path must be a directory');
      }
      const sourceParent = path.dirname(sourceRoot);
      if (sourceRoot === sourceParent) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'local project path cannot be a filesystem root');
      }
      try {
        const runtimeRoot = fs.realpathSync.native(RUNTIME_DATA_DIR_CANONICAL);
        if (sourceRoot === runtimeRoot || sourceRoot.startsWith(`${runtimeRoot}${path.sep}`)) {
          return sendApiError(res, 400, 'BAD_REQUEST', 'cannot import Open Design runtime data');
        }
      } catch {
        // The runtime data directory may not exist yet in first-run tests.
      }

      const before = await listAllDesignSystems();
      const importMode = normalizeDesignSystemImportMode(body.importMode);
      const craftApplies = normalizeDesignSystemCraftApplies(body.craftApplies);
      const result = await importLocalDesignSystemProject(sourceRoot, USER_DESIGN_SYSTEMS_DIR, {
        ...(typeof body.name === 'string' ? { name: body.name } : {}),
        ...(importMode ? { importMode } : {}),
        ...(craftApplies ? { craftApplies } : {}),
        reservedIds: designSystemDirIdsFromCatalog(before),
      });
      const systems = await listAllDesignSystems();
      const designSystem = findUserDesignSystemInCatalog(systems, result.id);
      if (!designSystem) {
        return sendApiError(
          res,
          500,
          'INTERNAL_ERROR',
          `imported design system was not found in catalog: ${result.dir}`,
        );
      }
      res.status(201).json(await importedDesignSystemResponse(designSystem));
    } catch (err: any) {
      if (err instanceof LocalDesignSystemImportError) {
        return sendApiError(res, err.code === 'BAD_REQUEST' ? 400 : 500, err.code, err.message);
      }
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  app.post('/api/design-systems/import/github', async (req, res) => {
    if (!requireLocalOrigin(req, res)) return;
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const githubUrl =
        typeof body.githubUrl === 'string'
          ? body.githubUrl
          : typeof body.url === 'string'
            ? body.url
            : '';
      const before = await listAllDesignSystems();
      const importMode = normalizeDesignSystemImportMode(body.importMode);
      const craftApplies = normalizeDesignSystemCraftApplies(body.craftApplies);
      const result = await importGitHubDesignSystemProject(
        githubUrl,
        path.join(PROJECT_ROOT, '.tmp'),
        USER_DESIGN_SYSTEMS_DIR,
        {
          ...(typeof body.name === 'string' ? { name: body.name } : {}),
          ...(typeof body.branch === 'string' ? { branch: body.branch } : {}),
          ...(importMode ? { importMode } : {}),
          ...(craftApplies ? { craftApplies } : {}),
          reservedIds: designSystemDirIdsFromCatalog(before),
        },
      );
      const systems = await listAllDesignSystems();
      const designSystem = findUserDesignSystemInCatalog(systems, result.id);
      if (!designSystem) {
        return sendApiError(
          res,
          500,
          'INTERNAL_ERROR',
          `imported GitHub design system was not found in catalog: ${result.dir}`,
        );
      }
      res.status(201).json(await importedDesignSystemResponse(designSystem));
    } catch (err: any) {
      if (err instanceof LocalDesignSystemImportError) {
        return sendApiError(res, err.code === 'BAD_REQUEST' ? 400 : 500, err.code, err.message);
      }
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  app.post('/api/design-systems/import/shadcn', async (req, res) => {
    if (!requireLocalOrigin(req, res)) return;
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const reference =
        typeof body.reference === 'string'
          ? body.reference
          : typeof body.url === 'string'
            ? body.url
            : '';
      if (!reference.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'a shadcn registry reference is required');
      }
      const before = await listAllDesignSystems();
      const importMode = normalizeDesignSystemImportMode(body.importMode);
      const craftApplies = normalizeDesignSystemCraftApplies(body.craftApplies);
      const result = await importShadcnDesignSystemProject(
        reference,
        path.join(PROJECT_ROOT, '.tmp'),
        USER_DESIGN_SYSTEMS_DIR,
        {
          ...(typeof body.name === 'string' ? { name: body.name } : {}),
          ...(importMode ? { importMode } : {}),
          ...(craftApplies ? { craftApplies } : {}),
          reservedIds: designSystemDirIdsFromCatalog(before),
        },
      );
      const systems = await listAllDesignSystems();
      const designSystem = findUserDesignSystemInCatalog(systems, result.id);
      if (!designSystem) {
        return sendApiError(
          res,
          500,
          'INTERNAL_ERROR',
          `imported shadcn design system was not found in catalog: ${result.dir}`,
        );
      }
      res.status(201).json(await importedDesignSystemResponse(designSystem));
    } catch (err: any) {
      if (err instanceof LocalDesignSystemImportError) {
        return sendApiError(res, err.code === 'BAD_REQUEST' ? 400 : 500, err.code, err.message);
      }
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  app.delete('/api/design-systems/:id', async (req, res, next) => {
    if (!requireLocalOrigin(req, res)) return;
    if (req.params.id.startsWith('user:')) {
      return next();
    }
    try {
      const result = await uninstallById(
        req.params.id,
        USER_DESIGN_SYSTEMS_DIR,
        DESIGN_SYSTEMS_DIR,
        'design-system',
      );
      if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: String(err) });
    }
  });

}

function userDesignSystemCatalogId(dirId: string): string {
  return `user:${dirId}`;
}

function findUserDesignSystemInCatalog<T extends { id: string }>(
  systems: T[],
  dirId: string,
): T | undefined {
  const catalogId = userDesignSystemCatalogId(dirId);
  return systems.find((system) => system.id === catalogId || system.id === dirId);
}

function designSystemDirIdsFromCatalog(systems: Array<{ id: string }>): string[] {
  return systems.map((system) =>
    system.id.startsWith('user:') ? system.id.slice('user:'.length) : system.id,
  );
}

function normalizeDesignSystemImportMode(value: unknown): 'normalized' | 'hybrid' | 'verbatim' | undefined {
  return value === 'normalized' || value === 'hybrid' || value === 'verbatim' ? value : undefined;
}

function normalizeDesignSystemCraftApplies(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const slug = entry.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

export function assembleExample(templateHtml: string, slidesHtml: string, title: string) {
  return templateHtml
    .replace('<!-- SLIDES_HERE -->', slidesHtml)
    .replace(/<title>.*?<\/title>/, `<title>${title} | Open Design Example</title>`);
}

export function rewriteSkillAssetUrls(
  html: string,
  skillId: string,
  workspaceQuery = '',
) {
  if (typeof html !== 'string' || html.length === 0) return html;
  return html.replace(
    /(\s(?:src|href)\s*=\s*)(['"])((?:\.\.\/([^/'"#?]+)\/)?(?:\.\/)?assets\/([^'"#?]+))(\2)/gi,
    (_match, attr, openQuote, _fullPath, siblingSkillId, relPath, closeQuote) => {
      const resolvedSkillId = siblingSkillId || skillId;
      const prefix = `/api/skills/${encodeURIComponent(resolvedSkillId)}/assets/`;
      return `${attr}${openQuote}${prefix}${relPath}${workspaceQuery}${closeQuote}`;
    },
  );
}

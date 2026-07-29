import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

type JsonRecord = Record<string, unknown>;
type SkillEntry = { id: string } & JsonRecord;
type DesignSystemSummary = {
  id: string;
  source?: string;
  status?: string;
  title?: string;
  updatedAt?: string;
  projectId?: string;
} & JsonRecord;

type DesignSystemStaticFile = {
  bytes: Buffer;
  contentType: string;
  updatedAt: string;
} & JsonRecord;

type ProjectRecord = {
  id: string;
  name?: string;
  skillId?: string | null;
  designSystemId?: string | null;
  pendingPrompt?: string | null;
  metadata?: JsonRecord;
  createdAt?: number;
  updatedAt?: number;
} & JsonRecord;

type ProjectInsert = {
  id: string;
  name?: string | null;
  skillId?: string | null;
  designSystemId?: string | null;
  pendingPrompt?: string | null;
  metadata?: JsonRecord;
  createdAt: number;
  updatedAt: number;
};

type ProjectPatch = Partial<Omit<ProjectInsert, 'id' | 'createdAt'>> & {
  updatedAt?: number;
};

type DesignSystemListOptions = {
  idPrefix?: string;
  source?: string;
  isEditable?: boolean;
  defaultStatus?: string;
};

export type DesignSystemAssetSyncOutcome =
  | { ok: true; synced: string[] }
  | { ok: false; reason: 'not-found' | 'no-workspace-project' };

export function createDesignSystemServerServices({
  getDb,
  roots,
  paths,
  skills,
  designSystems,
  projects,
  bindProjectToWorkspace,
}: {
  // Only consulted by `listAllSkills` below for its optional workspace scope
  // filter — every other service in this factory stays filesystem-only. A
  // getter (not the db value itself) because this factory runs BEFORE
  // server.ts opens its database connection; the closure defers the read
  // until a request actually needs it, long after `openDatabase()` has run.
  getDb?: () => Database.Database;
  roots: {
    SKILL_ROOTS: string[];
    DESIGN_TEMPLATE_ROOTS: string[];
    ALL_SKILL_LIKE_ROOTS: string[];
  };
  paths: {
    PROJECTS_DIR: string;
    DESIGN_SYSTEMS_DIR: string;
    USER_DESIGN_SYSTEMS_DIR: string;
  };
  skills: {
    listSkills: (
      roots: string[],
      options?: { db?: Database.Database; workspaceId?: string | null },
    ) => Promise<SkillEntry[]>;
    findSkillById: (skills: SkillEntry[], id: string) => SkillEntry | undefined;
  };
  designSystems: {
    listDesignSystems: (root: string, options?: DesignSystemListOptions) => Promise<DesignSystemSummary[]>;
    readDesignSystem: (root: string, id: string, options?: Pick<DesignSystemListOptions, 'idPrefix'>) => Promise<string | null | undefined>;
    readDesignSystemPackageInfo: (root: string, id: string, options?: Pick<DesignSystemListOptions, 'idPrefix'>) => Promise<unknown>;
    readDesignSystemStaticFile: (root: string, id: string, filePath: string, options?: Pick<DesignSystemListOptions, 'idPrefix'>) => Promise<DesignSystemStaticFile | null | undefined>;
    listUserDesignSystemFiles: (root: string, id: string) => Promise<Array<{ kind?: string; path: string }> | null | undefined>;
    readUserDesignSystemFile: (root: string, id: string, filePath: string) => Promise<{ path: string; content: string } | null | undefined>;
    linkUserDesignSystemProject: (root: string, id: string, projectId: string) => Promise<unknown>;
    // Physically copies real asset bytes (sourced from a workspace project's
    // editing mirror) into the canonical assets/ dir and un-fingerprints them
    // so the generator never overwrites them again (spec 04 §9.3).
    syncUserDesignSystemAssetsFromFiles: (
      root: string,
      id: string,
      files: Array<{ path: string; content: Buffer }>,
    ) => Promise<{ synced: string[] }>;
    LEGACY_DESIGN_SYSTEM_ARTIFACTS: Array<{
      replacementPaths: string[];
      legacyPath: string;
      removeDirectory?: boolean;
    }>;
  };
  projects: {
    getProject: (db: Database.Database, id: string) => ProjectRecord | null | undefined;
    insertProject: (db: Database.Database, project: ProjectInsert) => ProjectRecord | null | undefined;
    updateProject: (db: Database.Database, id: string, patch: ProjectPatch) => ProjectRecord | null | undefined;
    readProjectFile: (projectsDir: string, projectId: string, filePath: string, metadata?: JsonRecord) => Promise<{ buffer: Buffer }>;
    writeProjectFile: (projectsDir: string, projectId: string, filePath: string, content: Buffer, options?: JsonRecord, metadata?: JsonRecord) => Promise<unknown>;
    listFiles: (projectsDir: string, projectId: string, options?: { metadata?: JsonRecord }) => Promise<unknown[]>;
    resolveProjectDir: (projectsDir: string, projectId: string, metadata?: JsonRecord) => string;
    isSafeId: (id: string) => boolean;
  };
  /**
   * Give the `ds-*` project that backs a design system's editing workspace a
   * `workspace_projects` home, the same as any other created project.
   *
   * It is a real, run-hosting project — the chat/run prompt-composition path
   * stands it up on demand (`server.ts`) and the system prompt has a dedicated
   * `editingOwnDraftDesignSystem` branch for chatting inside it — so an unbound
   * one is denied its first turn by `enforceWorkspaceResourceMutation` exactly
   * like any other orphan. This factory has no Express request, so the daemon's
   * ambient workspace is the only thing that can answer; the injected closure
   * keeps that resolution in `server.ts` where the provider lives. Absent in
   * tests that do not exercise the seam.
   */
  bindProjectToWorkspace?: (projectId: string, createdAt: number) => void;
}) {
  /**
   * The functional-skills catalog. `workspaceId` narrows it to the
   * user-imported skills that workspace may see (mirrors
   * `listAllDesignSystems` below) — only `GET /api/skills` passes it. Callers
   * that resolve a skill BY ID (system-prompt composition, install/import
   * lookups, `/api/skills/:id/example`) must keep omitting it.
   *
   * Checking `options.workspaceId === undefined` (not just falsy) matters:
   * `GET /api/skills` always passes the key, with `null` whenever the request
   * carries no `x-od-workspace-id` header (headerValue never returns
   * `undefined`) — that request DID ask to be scoped, just with no identity,
   * and must still reach `listSkills`'s workspace filter so a claimed skill is
   * hidden from it (spec 04 §10), not silently fall through to the unscoped
   * branch the way a plain `options.workspaceId ? … : …` truthiness check
   * would.
   */
  async function listAllSkills(options: { workspaceId?: string | null } = {}) {
    const db = getDb?.();
    if (!db || options.workspaceId === undefined) {
      return skills.listSkills(roots.SKILL_ROOTS);
    }
    return skills.listSkills(roots.SKILL_ROOTS, { db, workspaceId: options.workspaceId });
  }

  async function listAllDesignTemplates() {
    return skills.listSkills(roots.DESIGN_TEMPLATE_ROOTS);
  }

  async function listAllSkillLikeEntries() {
    return skills.listSkills(roots.ALL_SKILL_LIKE_ROOTS);
  }

  /**
   * The design-system catalog.
   *
   * `workspaceId` narrows the USER half to the systems that workspace may see
   * (#145); the built-in half is shipped with the app and stays global. Callers
   * that resolve a system BY ID — project validation, install/import lookups —
   * must keep omitting it, or a project would stop finding its own design
   * system whenever the user is working from another workspace.
   *
   * Forwarding the key whenever it is DEFINED (not just truthy) matters:
   * `GET /api/design-systems` always passes `workspaceId`, with `null`
   * whenever there is no verified vela session — that request DID ask to be
   * scoped, just with no identity, and must still reach
   * `designSystemVisibleFromWorkspace`'s filter so a claimed system is hidden
   * from it (spec 04 §10) instead of silently landing in the unscoped branch a
   * plain `options.workspaceId ? … : …` truthiness check would take.
   */
  async function listAllDesignSystems(options: { workspaceId?: string | null } = {}) {
    const builtIn = (await designSystems.listDesignSystems(paths.DESIGN_SYSTEMS_DIR)).map((s) => ({
      ...s,
      source: 'built-in',
      isEditable: false,
      status: 'published',
    }));
    let installed: DesignSystemSummary[] = [];
    try {
      installed = await designSystems.listDesignSystems(paths.USER_DESIGN_SYSTEMS_DIR, {
        idPrefix: 'user:',
        source: 'user',
        isEditable: true,
        defaultStatus: 'draft',
        ...(options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}),
      });
    } catch {
      // User directory may not exist yet or be unreadable.
    }
    const seen = new Set(builtIn.map((s) => s.id));
    return [
      ...installed
        .filter((s) => s.source === 'user')
        .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')),
      ...builtIn,
      ...installed.filter((s) => s.source !== 'user' && !seen.has(s.id)),
    ];
  }

  async function readAvailableDesignSystem(id: string) {
    if (typeof id === 'string' && id.startsWith('user:')) {
      return designSystems.readDesignSystem(paths.USER_DESIGN_SYSTEMS_DIR, id, { idPrefix: 'user:' });
    }
    return (
      (await designSystems.readDesignSystem(paths.DESIGN_SYSTEMS_DIR, id))
      ?? (await designSystems.readDesignSystem(paths.USER_DESIGN_SYSTEMS_DIR, id))
    );
  }

  async function readAvailableDesignSystemPackageInfo(id: string) {
    if (typeof id === 'string' && id.startsWith('user:')) {
      return designSystems.readDesignSystemPackageInfo(paths.USER_DESIGN_SYSTEMS_DIR, id, { idPrefix: 'user:' });
    }
    return (
      (await designSystems.readDesignSystemPackageInfo(paths.DESIGN_SYSTEMS_DIR, id))
      ?? (await designSystems.readDesignSystemPackageInfo(paths.USER_DESIGN_SYSTEMS_DIR, id))
    );
  }

  async function readAvailableDesignSystemStaticFile(id: string, filePath: string) {
    if (typeof id === 'string' && id.startsWith('user:')) {
      return designSystems.readDesignSystemStaticFile(paths.USER_DESIGN_SYSTEMS_DIR, id, filePath, { idPrefix: 'user:' });
    }
    return (
      (await designSystems.readDesignSystemStaticFile(paths.DESIGN_SYSTEMS_DIR, id, filePath))
      ?? (await designSystems.readDesignSystemStaticFile(paths.USER_DESIGN_SYSTEMS_DIR, id, filePath))
    );
  }

  function isProjectUsableDesignSystem(summary: DesignSystemSummary | null | undefined) {
    return summary?.status !== 'draft';
  }

  async function validateProjectDesignSystemId(id: unknown) {
    if (id === undefined || id === null || id === '') return { ok: true, id: null };
    if (typeof id !== 'string') {
      return {
        ok: false,
        code: 'INVALID_DESIGN_SYSTEM',
        message: 'designSystemId must be a string or null',
      };
    }
    const systems = await listAllDesignSystems();
    const summary = systems.find((system) => system.id === id);
    if (!summary) {
      return {
        ok: false,
        code: 'DESIGN_SYSTEM_NOT_FOUND',
        message: 'design system not found',
      };
    }
    if (!isProjectUsableDesignSystem(summary)) {
      return {
        ok: false,
        code: 'DESIGN_SYSTEM_NOT_PUBLISHED',
        message: 'draft design systems cannot be used by projects',
      };
    }
    return { ok: true, id };
  }

  async function validateProjectSkillId(id: unknown) {
    if (id === undefined || id === null || id === '') {
      return { ok: true, id: null };
    }
    if (typeof id !== 'string') {
      return {
        ok: false,
        code: 'INVALID_SKILL_ID',
        message: 'skillId must be a string or null',
      };
    }
    const allSkills = await listAllSkillLikeEntries();
    const resolved = skills.findSkillById(allSkills, id);
    if (!resolved) {
      return {
        ok: false,
        code: 'SKILL_NOT_FOUND',
        message: 'skill not found',
      };
    }
    return { ok: true, id: resolved.id };
  }

  function userDesignSystemDirectoryId(id: string) {
    if (typeof id !== 'string' || !id.startsWith('user:')) return null;
    const dirId = id.slice('user:'.length);
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(dirId)) return null;
    return dirId;
  }

  function userDesignSystemWorkspaceProjectId(id: string) {
    const dirId = userDesignSystemDirectoryId(id);
    if (!dirId) return null;
    return `ds-${dirId}`.slice(0, 128);
  }

  function projectBackedDesignSystemProjectId(id: string, summary: DesignSystemSummary) {
    if (typeof summary?.projectId === 'string' && projects.isSafeId(summary.projectId)) {
      return summary.projectId;
    }
    return userDesignSystemWorkspaceProjectId(id);
  }

  async function ensureUserDesignSystemWorkspaceProject(dbHandle: Database.Database, id: string) {
    const systems = await listAllDesignSystems();
    const summary = systems.find((s) => s.id === id && s.source === 'user');
    if (!summary) return null;
    const projectId = projectBackedDesignSystemProjectId(id, summary);
    if (!projectId) return null;

    const now = Date.now();
    const metadata = {
      kind: 'other',
      importedFrom: 'design-system',
      entryFile: 'DESIGN.md',
      sourceFileName: id,
    };
    const existing = projects.getProject(dbHandle, projectId);
    const projectName = summary.title ?? id;
    const project = existing
      ? projects.updateProject(dbHandle, projectId, {
          name: projectName,
          designSystemId: id,
          metadata: { ...(existing.metadata ?? {}), ...metadata },
          updatedAt: now,
        })
      : projects.insertProject(dbHandle, {
          id: projectId,
          name: projectName,
          skillId: null,
          designSystemId: id,
          pendingPrompt: null,
          metadata,
          createdAt: now,
          updatedAt: now,
        });
    if (!project) return null;
    if (!existing) bindProjectToWorkspace?.(projectId, now);

    const files = await designSystems.listUserDesignSystemFiles(paths.USER_DESIGN_SYSTEMS_DIR, id);
    if (!files) return null;
    for (const file of files) {
      if (file.kind === 'folder') continue;
      const detail = await designSystems.readUserDesignSystemFile(paths.USER_DESIGN_SYSTEMS_DIR, id, file.path);
      if (!detail) continue;
      if (existing) {
        try {
          const existingFile = await projects.readProjectFile(paths.PROJECTS_DIR, projectId, detail.path, project.metadata);
          if (!isReplaceableDesignSystemWorkspaceFile(detail.path, existingFile)) continue;
        } catch (err: unknown) {
          if (!isNodeErrorCode(err, 'ENOENT')) throw err;
        }
      }
      await projects.writeProjectFile(
        paths.PROJECTS_DIR,
        projectId,
        detail.path,
        Buffer.from(detail.content, 'utf8'),
        {},
        project.metadata,
      );
    }
    await removeLegacyDesignSystemWorkspaceArtifacts(project);
    await designSystems.linkUserDesignSystemProject(paths.USER_DESIGN_SYSTEMS_DIR, id, project.id);
    const projectFiles = await projects.listFiles(
      paths.PROJECTS_DIR,
      projectId,
      project.metadata ? { metadata: project.metadata } : {},
    );
    return { project, files: projectFiles };
  }

  function isReplaceableDesignSystemWorkspaceFile(filePath: string, file: { buffer?: Buffer } | null | undefined) {
    const buffer = file?.buffer;
    if (!Buffer.isBuffer(buffer)) return false;
    const text = buffer.toString('utf8');
    if (/^ui_kits\/app\/components\/.+\.(jsx|tsx|js|ts|css|html)$/u.test(filePath)) {
      return buffer.length < 700 && /od-ui-kit-[a-z-]+/u.test(text);
    }
    if (!/^(DESIGN\.md|README\.md|SKILL\.md|ui_kits\/app\/README\.md)$/u.test(filePath)) {
      return false;
    }
    return hasLegacyDesignSystemPackageReferences(text);
  }

  function hasLegacyDesignSystemPackageReferences(text: string) {
    return /preview\/(colors-node-types|colors-ui-palette|typography-scale|spacing-system|logo-variants)\.html|ui_kits\/generated_interface(?:\/index\.html|\/)?/u.test(text);
  }

  async function removeLegacyDesignSystemWorkspaceArtifacts(project: ProjectRecord) {
    if (project?.metadata?.importedFrom !== 'design-system') return;
    const dir = projects.resolveProjectDir(paths.PROJECTS_DIR, project.id, project.metadata);
    for (const artifact of designSystems.LEGACY_DESIGN_SYSTEM_ARTIFACTS) {
      const replacementReady = await Promise.all(
        artifact.replacementPaths.map(async (replacementPath) => {
          try {
            const stats = await fs.promises.stat(path.join(dir, ...replacementPath.split('/')));
            return stats.isFile();
          } catch (err: unknown) {
            if (!isNodeErrorCode(err, 'ENOENT') && !isNodeErrorCode(err, 'ENOTDIR')) throw err;
            return false;
          }
        }),
      );
      if (!replacementReady.every(Boolean)) continue;
      await fs.promises.rm(path.join(dir, ...artifact.legacyPath.split('/')), {
        recursive: artifact.removeDirectory === true,
        force: true,
      });
    }
  }

  async function readDesignSystemWorkspaceTextFile(
    dbHandle: Database.Database,
    summary: DesignSystemSummary | null | undefined,
    filePath: string,
  ) {
    if (!summary?.projectId || !projects.isSafeId(summary.projectId)) return null;
    const project = projects.getProject(dbHandle, summary.projectId);
    if (!project) return null;
    try {
      const file = await projects.readProjectFile(
        paths.PROJECTS_DIR,
        project.id,
        filePath,
        project.metadata,
      );
      const text = file.buffer.toString('utf8');
      if (text.includes('\0')) return null;
      return text;
    } catch {
      return null;
    }
  }

  /**
   * Copies the real `assets/` files out of a user design system's workspace
   * project (the editing-time mirror an agent actually writes to) into the
   * canonical design-system directory, so `team-resource-share`'s zip and
   * `/api/design-systems/:id/archive` stop shipping a stale/placeholder
   * `assets/logo.svg` (spec 04 §9.3, recvqb1t4FrckM). Locates the source
   * project the same way `ensureUserDesignSystemWorkspaceProject` does
   * (`projectBackedDesignSystemProjectId`), just copying in the opposite
   * direction — from the project mirror back to canonical.
   */
  async function syncUserDesignSystemAssetsFromWorkspace(
    dbHandle: Database.Database,
    id: string,
  ): Promise<DesignSystemAssetSyncOutcome> {
    const systems = await listAllDesignSystems();
    const summary = systems.find((s) => s.id === id && s.source === 'user');
    if (!summary) return { ok: false, reason: 'not-found' };
    const projectId = projectBackedDesignSystemProjectId(id, summary);
    if (!projectId) return { ok: false, reason: 'no-workspace-project' };
    const project = projects.getProject(dbHandle, projectId);
    if (!project) return { ok: false, reason: 'no-workspace-project' };

    const projectFiles = await projects.listFiles(
      paths.PROJECTS_DIR,
      project.id,
      project.metadata ? { metadata: project.metadata } : {},
    );
    const assetPaths = projectFiles
      .map((file) => (file && typeof file === 'object' ? (file as { path?: unknown }).path : undefined))
      .filter(
        (candidate): candidate is string =>
          typeof candidate === 'string' && (candidate === 'assets' || candidate.startsWith('assets/')),
      );

    const files: Array<{ path: string; content: Buffer }> = [];
    for (const assetPath of assetPaths) {
      try {
        const detail = await projects.readProjectFile(
          paths.PROJECTS_DIR,
          project.id,
          assetPath,
          project.metadata,
        );
        files.push({ path: assetPath, content: detail.buffer });
      } catch {
        // A file that vanished or was mid-rename during the scan shouldn't
        // fail the whole sync — skip it and continue with the rest.
      }
    }

    const result = await designSystems.syncUserDesignSystemAssetsFromFiles(
      paths.USER_DESIGN_SYSTEMS_DIR,
      id,
      files,
    );
    return { ok: true, synced: result.synced };
  }

  /**
   * Resolves the directory that a team-share publish may archive. Unlike the
   * read-only canonical path resolver, this first snapshots the workspace
   * project's latest assets back into canonical. A missing source fails
   * closed so a repeat "Sync to team" can never publish stale bytes.
   */
  async function resolveUserDesignSystemShareDirectory(
    dbHandle: Database.Database,
    id: string,
  ): Promise<string> {
    const outcome = await syncUserDesignSystemAssetsFromWorkspace(dbHandle, id);
    if (!outcome.ok) {
      throw new Error(`design_system_share_asset_sync_failed:${outcome.reason}`);
    }
    const dirId = userDesignSystemDirectoryId(id);
    if (!dirId) {
      throw new Error('design_system_share_asset_sync_failed:not-found');
    }
    return path.join(paths.USER_DESIGN_SYSTEMS_DIR, dirId);
  }

  return {
    ensureUserDesignSystemWorkspaceProject,
    isProjectUsableDesignSystem,
    listAllDesignSystems,
    listAllDesignTemplates,
    listAllSkillLikeEntries,
    listAllSkills,
    readAvailableDesignSystem,
    readAvailableDesignSystemPackageInfo,
    readAvailableDesignSystemStaticFile,
    readDesignSystemWorkspaceTextFile,
    resolveUserDesignSystemShareDirectory,
    syncUserDesignSystemAssetsFromWorkspace,
    validateProjectDesignSystemId,
    validateProjectSkillId,
  };
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === code
  );
}

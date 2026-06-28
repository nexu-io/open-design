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

export function createDesignSystemServerServices({
  roots,
  paths,
  skills,
  designSystems,
  projects,
}: {
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
    listSkills: (roots: string[]) => Promise<SkillEntry[]>;
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
}) {
  async function listAllSkills() {
    return skills.listSkills(roots.SKILL_ROOTS);
  }

  async function listAllDesignTemplates() {
    return skills.listSkills(roots.DESIGN_TEMPLATE_ROOTS);
  }

  async function listAllSkillLikeEntries() {
    return skills.listSkills(roots.ALL_SKILL_LIKE_ROOTS);
  }

  async function listAllDesignSystems() {
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

  function userDesignSystemWorkspaceProjectId(id: string) {
    if (typeof id !== 'string' || !id.startsWith('user:')) return null;
    const dirId = id.slice('user:'.length);
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(dirId)) return null;
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

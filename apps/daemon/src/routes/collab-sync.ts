import type { Express } from 'express';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectMetadata, ProjectSyncIntentEvent, TeamProject } from '@open-design/contracts';
import { contextToResourceHubPrincipal } from '../collab/resource-hub-publish-adapter.js';
import type { CollabRuntime } from '../collab/runtime.js';
import type { ResourceHubPrincipal } from '../integrations/resource-hub.js';
import { projectResourceIdFor } from '../integrations/vela-team-projects.js';
import { readProjectManifest } from '../project-locations.js';

/** The fields register-on-pull reads out of a pulled project's manifest. */
export interface PulledProjectManifest {
  name?: string;
  skillId?: string | null;
  designSystemId?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface RegisterPulledProjectInput {
  id: string;
  name: string;
  skillId: string | null;
  designSystemId: string | null;
  metadata?: ProjectMetadata;
  createdAt: number;
  updatedAt: number;
}

export interface PulledProjectStore {
  get?: (projectId: string) => { name?: string | null } | null;
  has(projectId: string): boolean;
  register(input: RegisterPulledProjectInput): void;
  update?: (input: RegisterPulledProjectInput) => void;
}

interface TeamProjectCatalogWriter {
  upsert(
    input: {
      projectId: string;
      resourceId?: string;
      displayName?: string | null;
      syncState?: 'pending_upload' | 'syncing' | 'synced' | 'failed';
      lastSyncedVersionId?: string | null;
      metadata?: Record<string, unknown> | null;
    },
    principal?: ResourceHubPrincipal | null,
  ): Promise<unknown>;
  remove(projectId: string, principal?: ResourceHubPrincipal | null): Promise<unknown>;
}

export interface RegisterCollabSyncRoutesDeps {
  collab: Pick<
    CollabRuntime,
    | 'scheduler'
    | 'publishedVersion'
    | 'publishedHead'
    | 'projectSyncState'
    | 'projectOwnerMemberId'
    | 'requestTeamShare'
    | 'requestTeamUnshare'
    | 'pullLatest'
    | 'workspaceContext'
  >;
  resolveSharedProjectOwner?: (projectId: string) => Promise<string | null>;
  resolveSharedProject?: (projectId: string) => Promise<TeamProject | null>;
  resolveOwnerDisplayName?: (
    memberId: string,
  ) => Promise<{ displayName: string; role: 'owner' | 'admin' | 'member' } | null>;
  teamProjectCatalog?: TeamProjectCatalogWriter;
  describeProject?: (projectId: string) => Promise<PulledProjectManifest | null> | PulledProjectManifest | null;
  projectStore?: PulledProjectStore;
  resolvePullDir?: (projectId: string) => string;
  readManifest?: (projectDir: string) => Promise<PulledProjectManifest | null>;
}

const SYNC_INTENT_EVENTS: ReadonlySet<ProjectSyncIntentEvent> = new Set([
  'project_visibility_changed',
  'project_team_share_requested',
  'project_team_unshare_requested',
]);
const PULLED_PROJECT_PLACEHOLDER_NAME = '共享项目';

function cleanPulledProjectName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed || trimmed === 'index.html') return null;
  return trimmed;
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function inferNameFromSkillManifest(projectDir: string): Promise<string | null> {
  const skillsDir = path.join(projectDir, '.od-skills');
  let entries: string[];
  try {
    entries = await readdir(skillsDir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    const manifest = await readJsonObject(path.join(skillsDir, entry, 'open-design.json'));
    const title = cleanPulledProjectName(manifest?.title);
    if (title) return title;
    const name = cleanPulledProjectName(manifest?.name);
    if (name) return name;
  }
  return null;
}

async function inferNameFromHtmlTitle(projectDir: string): Promise<string | null> {
  try {
    const html = await readFile(path.join(projectDir, 'index.html'), 'utf8');
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return cleanPulledProjectName(match?.[1]?.replace(/<[^>]*>/g, ''));
  } catch {
    return null;
  }
}

async function resolvePulledProjectName(
  projectDir: string,
  manifest: PulledProjectManifest | null,
): Promise<string> {
  return cleanPulledProjectName(manifest?.name)
    ?? await inferNameFromSkillManifest(projectDir)
    ?? await inferNameFromHtmlTitle(projectDir)
    ?? PULLED_PROJECT_PLACEHOLDER_NAME;
}

function headerValue(req: { get(name: string): string | undefined }, name: string): string | null {
  const value = req.get(name);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function headerBool(req: { get(name: string): string | undefined }, name: string, fallback: boolean): boolean {
  const value = headerValue(req, name);
  if (value === null) return fallback;
  if (value === 'false') return false;
  if (value === 'true') return true;
  return fallback;
}

function headerPrincipalForRequest(req: { get(name: string): string | undefined }): ResourceHubPrincipal | null {
  const teamId = headerValue(req, 'x-od-workspace-id');
  const memberId = headerValue(req, 'x-od-workspace-member-id');
  if (!teamId || !memberId) return null;
  const role = headerValue(req, 'x-od-workspace-role') ?? 'member';
  const lifecycleState = headerValue(req, 'x-od-workspace-lifecycle-state') ?? 'active';
  return {
    teamId,
    memberId,
    role: role === 'owner' || role === 'admin' ? role : 'member',
    lifecycleState:
      lifecycleState === 'billing_past_due' ||
      lifecycleState === 'locked' ||
      lifecycleState === 'deleting' ||
      lifecycleState === 'deleted'
        ? lifecycleState
        : 'active',
  };
}

export function registerCollabSyncRoutes(app: Express, deps: RegisterCollabSyncRoutesDeps): void {
  const {
    scheduler,
    publishedVersion,
    publishedHead,
    projectSyncState,
    projectOwnerMemberId,
    requestTeamShare,
    requestTeamUnshare,
    pullLatest,
    workspaceContext,
  } = deps.collab;
  const {
    projectStore,
    resolvePullDir,
    resolveSharedProjectOwner,
    resolveSharedProject,
    resolveOwnerDisplayName,
    teamProjectCatalog,
    describeProject,
  } = deps;
  const readManifest = deps.readManifest ?? readProjectManifest;

  async function principalForRequest(req: {
    get(name: string): string | undefined;
    headers: { authorization?: string | string[] | undefined };
  }) {
    const authorization = Array.isArray(req.headers.authorization)
      ? req.headers.authorization[0]
      : req.headers.authorization;
    return headerPrincipalForRequest(req) ?? contextToResourceHubPrincipal(await workspaceContext.current({ authorization }));
  }

  async function resourcePrincipalForSharedProject(
    projectId: string,
    req: {
      get(name: string): string | undefined;
      headers: { authorization?: string | string[] | undefined };
    },
  ): Promise<ResourceHubPrincipal | null> {
    const viewerPrincipal = await principalForRequest(req);
    let sharedProject: TeamProject | null = null;
    try {
      sharedProject = await resolveSharedProject?.(projectId) ?? null;
    } catch {
      sharedProject = null;
    }
    if (!sharedProject?.ownerMemberId || !viewerPrincipal?.teamId) {
      return viewerPrincipal;
    }
    return {
      ...viewerPrincipal,
      memberId: sharedProject.ownerMemberId,
      role: sharedProject.ownerMemberId === viewerPrincipal.memberId ? viewerPrincipal.role : 'member',
    };
  }

  async function canShareProjectsForRequest(req: {
    get(name: string): string | undefined;
    headers: { authorization?: string | string[] | undefined };
  }) {
    const headerPrincipal = headerPrincipalForRequest(req);
    if (headerPrincipal) {
      const legacyWriteEnabled = headerBool(req, 'x-od-workspace-write-enabled', true);
      const canWriteSyncedFiles = headerBool(req, 'x-od-workspace-can-write-synced-files', legacyWriteEnabled);
      return headerBool(req, 'x-od-workspace-can-share-projects', canWriteSyncedFiles);
    }
    const authorization = Array.isArray(req.headers.authorization)
      ? req.headers.authorization[0]
      : req.headers.authorization;
    return (await workspaceContext.current({ authorization }))?.permissions.canShareProjects ?? false;
  }

  async function registerPulledProject(projectId: string): Promise<void> {
    if (!projectStore || !resolvePullDir) return;
    const existing = projectStore.get?.(projectId);
    if (!existing && projectStore.has(projectId)) return;
    if (existing && cleanPulledProjectName(existing.name) !== PULLED_PROJECT_PLACEHOLDER_NAME) return;
    const projectDir = resolvePullDir(projectId);
    let manifest: PulledProjectManifest | null = null;
    try {
      manifest = await readManifest(projectDir);
    } catch {
      manifest = null;
    }
    let teamProject: TeamProject | null = null;
    try {
      teamProject = await resolveSharedProject?.(projectId) ?? null;
    } catch {
      teamProject = null;
    }
    const now = Date.now();
    const input = {
      id: projectId,
      name: cleanPulledProjectName(teamProject?.name) ?? await resolvePulledProjectName(projectDir, manifest),
      skillId: teamProject?.skillId ?? manifest?.skillId ?? null,
      designSystemId: teamProject?.designSystemId ?? manifest?.designSystemId ?? null,
      ...(teamProject?.metadata ? { metadata: teamProject.metadata } : {}),
      createdAt: typeof teamProject?.createdAt === 'number'
        ? teamProject.createdAt
        : typeof manifest?.createdAt === 'number'
          ? manifest.createdAt
          : now,
      updatedAt: typeof teamProject?.updatedAt === 'number'
        ? teamProject.updatedAt
        : typeof manifest?.updatedAt === 'number'
          ? manifest.updatedAt
          : now,
    };
    if (existing) {
      projectStore.update?.(input);
      return;
    }
    projectStore.register(input);
  }

  app.post('/api/projects/:id/collab/changed', (req, res) => {
    scheduler.notifyChanged(req.params.id, 'change');
    res.json({ ok: true });
  });

  app.post('/api/projects/:id/collab/publish', (req, res) => {
    scheduler.notifyChanged(req.params.id, 'run');
    scheduler.runBoundary(req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/projects/:id/collab/sync-intent', async (req, res) => {
    const event = (req.body as { event?: unknown } | undefined)?.event;
    if (typeof event !== 'string' || !SYNC_INTENT_EVENTS.has(event as ProjectSyncIntentEvent)) {
      return res.status(400).json({ error: 'invalid sync intent event' });
    }
    const projectId = req.params.id;
    const principal = await principalForRequest(req);
    const context = await workspaceContext.current({ authorization: req.headers.authorization });

    if (event === 'project_team_share_requested') {
      if (!(await canShareProjectsForRequest(req))) {
        return res.status(403).json({ error: 'WORKSPACE_PROJECT_SHARE_DENIED' });
      }
      const sharerMemberId = principal?.memberId ?? context?.workspaceMemberId;
      const existingSharedProject = await resolveSharedProject?.(projectId) ?? null;
      if (
        existingSharedProject?.ownerMemberId &&
        existingSharedProject.ownerMemberId !== sharerMemberId
      ) {
        return res.json({
          ok: true,
          syncState: 'synced',
          publishedVersion: publishedVersion(projectId, principal),
        });
      }
      let nextPublishedVersion: number | null;
      try {
        ({ version: nextPublishedVersion } = await requestTeamShare(projectId, principal ?? sharerMemberId));
      } catch (error) {
        console.warn('[od] failed to publish team-shared project bytes:', error);
        return res.status(502).json({ error: 'TEAM_PROJECT_PUBLISH_UNAVAILABLE' });
      }
      if (nextPublishedVersion == null) {
        return res.status(502).json({ error: 'TEAM_PROJECT_PUBLISH_UNAVAILABLE' });
      }
      try {
        const project = await describeProject?.(projectId) ?? null;
        await teamProjectCatalog?.upsert(
          {
            projectId,
            ...(principal ? { resourceId: projectResourceIdFor(projectId, principal) } : {}),
            displayName: project?.name ?? null,
            syncState: 'synced',
            ...(project ? { metadata: { ...project } } : {}),
          },
          principal,
        );
      } catch (error) {
        console.warn('[od] failed to write Vela team project catalog:', error);
        await requestTeamUnshare(projectId, principal).catch((unshareError: unknown) => {
          console.warn('[od] failed to roll back team-shared project after catalog failure:', unshareError);
        });
        return res.status(502).json({ error: 'TEAM_PROJECT_CATALOG_UNAVAILABLE' });
      }
      return res.json({
        ok: true,
        syncState: projectSyncState(projectId, principal),
        publishedVersion: nextPublishedVersion,
      });
    }

    if (event === 'project_team_unshare_requested') {
      if (!(await canShareProjectsForRequest(req))) {
        return res.status(403).json({ error: 'WORKSPACE_PROJECT_SHARE_DENIED' });
      }
      const callerMemberId = principal?.memberId ?? context?.workspaceMemberId;
      const sharedProject = await resolveSharedProject?.(projectId) ?? null;
      const ownerMemberId = sharedProject?.ownerMemberId ?? projectOwnerMemberId(projectId, principal);
      if (ownerMemberId && ownerMemberId !== callerMemberId) {
        return res.status(403).json({ error: 'WORKSPACE_PROJECT_UNSHARE_DENIED' });
      }
      try {
        await teamProjectCatalog?.remove(projectId, principal);
      } catch (error) {
        console.warn('[od] failed to remove Vela team project catalog entry:', error);
        return res.status(502).json({ error: 'TEAM_PROJECT_CATALOG_UNAVAILABLE' });
      }
      await requestTeamUnshare(projectId, principal);
    }

    res.json({ ok: true, syncState: projectSyncState(projectId, principal) });
  });

  app.post('/api/projects/:id/collab/pull', async (req, res) => {
    const projectId = req.params.id;
    const principal = await resourcePrincipalForSharedProject(projectId, req);
    const result = await pullLatest(projectId, principal);
    if (result.version !== null) {
      try {
        await registerPulledProject(projectId);
      } catch (error) {
        console.warn('[od] failed to register pulled team project:', error);
        return res.status(502).json({ error: 'TEAM_PROJECT_PULL_REGISTER_UNAVAILABLE' });
      }
    }
    res.json({ ok: true, version: result.version });
  });

  app.get('/api/projects/:id/collab/status', async (req, res) => {
    const projectId = req.params.id;
    const principal = await principalForRequest(req);
    const resourcePrincipal = await resourcePrincipalForSharedProject(projectId, req);
    let syncState = projectSyncState(projectId, principal);
    let ownerMemberId = projectOwnerMemberId(projectId, principal);
    if (ownerMemberId == null && resolveSharedProjectOwner) {
      try {
        const hubOwner = await resolveSharedProjectOwner(projectId);
        if (hubOwner != null) {
          if (syncState === 'local_only') syncState = 'synced';
          ownerMemberId = hubOwner;
        }
      } catch {
        // Hub unavailable: fall back to the local state.
      }
    }
    let ownerDisplayName: string | undefined;
    let ownerRole: 'owner' | 'admin' | 'member' | undefined;
    if (ownerMemberId && resolveOwnerDisplayName) {
      try {
        const entry = await resolveOwnerDisplayName(ownerMemberId);
        if (entry) {
          ownerDisplayName = entry.displayName;
          ownerRole = entry.role;
        }
      } catch {
        /* directory unavailable: omit the name */
      }
    }
    let head: number | null;
    try {
      head = await publishedHead(projectId, resourcePrincipal);
    } catch {
      head = publishedVersion(projectId, principal);
    }
    res.json({
      publishedVersion: head,
      syncState,
      ownerMemberId,
      ...(ownerDisplayName ? { ownerDisplayName } : {}),
      ...(ownerRole ? { ownerRole } : {}),
    });
  });
}

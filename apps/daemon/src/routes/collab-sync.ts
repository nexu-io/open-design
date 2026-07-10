import type { Express } from 'express';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectMetadata, ProjectSyncIntentEvent, TeamProject } from '@open-design/contracts';
import type { CollabRuntime } from '../collab/runtime.js';
import type { VelaTeamProjectCatalog } from '../collab/vela-cli-team-projects.js';
import { readProjectManifest } from '../project-locations.js';

/** The fields register-on-pull reads out of a pulled project's manifest (a
 *  `.open-design/project.json`-type file under the materialized dir). Every field
 *  is optional so a manifest-less pull still registers under a placeholder name. */
export interface PulledProjectManifest {
  name?: string;
  skillId?: string | null;
  designSystemId?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

/** The record register-on-pull inserts so a pulled shared project appears in
 *  `/api/projects` and can be opened. Read-only is NOT a flag here — the member
 *  isn't the owner, so `useProjectCollab` keeps it single-writer read-only. */
export interface RegisterPulledProjectInput {
  id: string;
  name: string;
  skillId: string | null;
  designSystemId: string | null;
  metadata?: ProjectMetadata;
  createdAt: number;
  updatedAt: number;
}

/** Local project-store seam for register-on-pull. Kept behind an interface so the
 *  route stays free of `db`/SQLite while the daemon wires it to the real store. */
export interface PulledProjectStore {
  /** Read an existing local project record, when available. */
  get?: (projectId: string) => { name?: string | null } | null;
  /** Whether a project is already registered locally (idempotency guard). */
  has(projectId: string): boolean;
  /** Register a freshly pulled shared project as a local project record. */
  register(input: RegisterPulledProjectInput): void;
  /** Update a placeholder pulled project once the materialized tree yields a real name. */
  update?: (input: RegisterPulledProjectInput) => void;
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
  /**
   * Resolve the member who shared a project (its single writer), from the team
   * hub — server-authoritative and read at status time, so a member's read-only
   * state derives from the hub rather than a client-supplied id or an in-memory
   * pull record that a daemon restart would lose. Returns null when the project is
   * not team-shared (off-team / hub unconfigured / owned by nobody in the list),
   * in which case the project is a normal editable local project.
   */
  resolveSharedProjectOwner?: (projectId: string) => Promise<string | null>;
  /**
   * Resolve the full team-project discovery record from the hub. Pull
   * registration uses this before manifest/title inference so a member's local
   * project card preserves the real shared project name and metadata without
   * needing a manifest in the pulled tree.
   */
  resolveSharedProject?: (projectId: string) => Promise<TeamProject | null>;
  /**
   * Resolve a member id to their {displayName, role} from the collab-cloud
   * member directory, so `/collab/status` can hand the client the owner's name
   * (for a "这是 麻薯 创建的共享项目" banner) instead of only an opaque id.
   * Returns null when the directory is unconfigured / the member is unknown, in
   * which case the status simply omits the name. STUB source: B's roster is the
   * real name source; the collab-cloud directory stands in until B exposes it.
   */
  resolveOwnerDisplayName?: (
    memberId: string,
  ) => Promise<{ displayName: string; role: 'owner' | 'admin' | 'member' } | null>;
  /**
   * Authoritative team-project directory writer. In Vela mode this shells
   * through the Vela CLI, reusing the CLI session identity rather than letting
   * the daemon talk to the Vela backend directly. If this write fails, sharing
   * fails too: the project must not look "in workspace" locally while teammates
   * cannot discover it from the catalog.
   */
  teamProjectCatalog?: Pick<VelaTeamProjectCatalog, 'upsert' | 'remove'>;
  /** Resolve the local project title/metadata used to populate Vela's catalog. */
  describeProject?: (projectId: string) => Promise<PulledProjectManifest | null> | PulledProjectManifest | null;
  /**
   * Optional project-store seam. When present, `POST /api/projects/:id/collab/pull`
   * registers the pulled shared project locally (idempotently) so a member can
   * open it like any other project. Omitted in unit contexts that only exercise
   * the sync triggers, in which case a pull materializes content but does not
   * register a local record.
   */
  projectStore?: PulledProjectStore;
  /**
   * Resolve the on-disk dir a pull materializes into, so registration can read
   * the shared project's manifest for its real name. Should mirror the pull dir
   * the collab runtime writes to. Required alongside `projectStore`.
   */
  resolvePullDir?: (projectId: string) => string;
  /** Injectable manifest reader; defaults to `.open-design/project.json`. */
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

/**
 * Team collaboration sync trigger, exposed as a client-driven capability . The client is authoritative about whether it is in a shared context, so
 * it drives the trigger — the daemon does not need D's visibility fact to gate
 * this. Publishing content + advancing the published ref is the resource hub; here
 * we only coalesce and flush.
 */
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

  // Register a freshly pulled shared project as a local project record so it
  // appears in `/api/projects` and can be opened. Idempotent (a project the
  // member already has locally is left untouched) and best-effort — the pull
  // response never fails on a registration hiccup. The real name comes from the
  // pulled project's manifest when the materialized tree carries one; otherwise
  // it registers under a placeholder ("共享项目") until a manifest is present.
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

  // An author-side edit landed. The publish is coalesced within the scheduler's
  // window so a burst of edits collapses into one publish.
  app.post('/api/projects/:id/collab/changed', (req, res) => {
    scheduler.notifyChanged(req.params.id, 'change');
    res.json({ ok: true });
  });

  // Run boundary — flush any pending publish immediately (publish the stable
  // end-of-run state rather than waiting out the debounce).
  app.post('/api/projects/:id/collab/publish', (req, res) => {
    scheduler.notifyChanged(req.params.id, 'run');
    scheduler.runBoundary(req.params.id);
    res.json({ ok: true });
  });

  // visibility-to-sync orchestration seam. The visibility surface flips project visibility and emits a
  // ProjectSyncIntent here; the sync trigger owns the reaction. `project_team_share_requested`
  // marks the project pending and flushes a publish (which drives E's resource
  // mechanism behind the scheduler). `project_visibility_changed` is accepted as
  // a no-op signal for now (the share request is the actionable one).
  app.post('/api/projects/:id/collab/sync-intent', async (req, res) => {
    const event = (req.body as { event?: unknown } | undefined)?.event;
    if (typeof event !== 'string' || !SYNC_INTENT_EVENTS.has(event as ProjectSyncIntentEvent)) {
      return res.status(400).json({ error: 'invalid sync intent event' });
    }
    if (event === 'project_team_share_requested') {
      // The caller sharing the project is its single writer; record their id so
      // members can distinguish it from a project of their own.
      const context = await workspaceContext.current({
        authorization: req.headers.authorization,
      });
      // Server-side permission gate, mirroring team resource sharing: a team
      // member without `canShareProjects` is refused — the client hides the
      // affordance, but the daemon must not trust the client to enforce it. No
      // team context stays a silent no-op (the publish adapter no-ops off-team).
      if (context && !context.permissions.canShareProjects) {
        return res.status(403).json({ error: 'WORKSPACE_PROJECT_SHARE_DENIED' });
      }
      let publishedVersion: number | null;
      try {
        ({ version: publishedVersion } = await requestTeamShare(req.params.id, context?.workspaceMemberId));
      } catch (error) {
        console.warn('[od] failed to publish team-shared project bytes:', error);
        return res.status(502).json({ error: 'TEAM_PROJECT_PUBLISH_UNAVAILABLE' });
      }
      if (publishedVersion == null) {
        return res.status(502).json({ error: 'TEAM_PROJECT_PUBLISH_UNAVAILABLE' });
      }
      try {
        const project = await describeProject?.(req.params.id) ?? null;
        await teamProjectCatalog?.upsert({
          projectId: req.params.id,
          displayName: project?.name ?? null,
          syncState: 'synced',
          ...(project ? { metadata: { ...project } } : {}),
        });
      } catch (error) {
        console.warn('[od] failed to write Vela team project catalog:', error);
        await requestTeamUnshare(req.params.id).catch((unshareError: unknown) => {
          console.warn('[od] failed to roll back team-shared project after catalog failure:', unshareError);
        });
        return res.status(502).json({ error: 'TEAM_PROJECT_CATALOG_UNAVAILABLE' });
      }
      return res.json({ ok: true, syncState: projectSyncState(req.params.id), publishedVersion });
    } else if (event === 'project_team_unshare_requested') {
      const context = await workspaceContext.current({
        authorization: req.headers.authorization,
      });
      if (context && !context.permissions.canShareProjects) {
        return res.status(403).json({ error: 'WORKSPACE_PROJECT_SHARE_DENIED' });
      }
      try {
        await teamProjectCatalog?.remove(req.params.id);
      } catch (error) {
        console.warn('[od] failed to remove Vela team project catalog entry:', error);
        return res.status(502).json({ error: 'TEAM_PROJECT_CATALOG_UNAVAILABLE' });
      }
      await requestTeamUnshare(req.params.id);
    }
    res.json({ ok: true, syncState: projectSyncState(req.params.id) });
  });

  // Member pull trigger (the sync trigger owns *when*; the resource hub fetches + extracts the bytes behind the
  // adapter). Returns the head version that was pulled.
  app.post('/api/projects/:id/collab/pull', async (req, res) => {
    const projectId = req.params.id;
    const result = await pullLatest(projectId);
    // Register the pulled project locally so it opens like any other project.
    // Best-effort: a registration failure must not fail the pull itself.
    if (result.version !== null) {
      try {
        await registerPulledProject(projectId);
      } catch {
        /* registration is best-effort; leave the pull result standing */
      }
    }
    res.json({ ok: true, version: result.version });
  });

  // Members poll this to learn the published head version they should pull and
  // the current sync state (local_only / pending_upload / synced / sync_failed).
  app.get('/api/projects/:id/collab/status', async (req, res) => {
    const projectId = req.params.id;
    let syncState = projectSyncState(projectId);
    let ownerMemberId = projectOwnerMemberId(projectId);
    // Read-only is DERIVED from the team hub at read time, not cached from a pull.
    // In-memory state (`syncStates`/`owners`) only tracks THIS daemon's own share
    // lifecycle (an author publishing their project). A project with no local
    // lifecycle (`local_only`) is still read-only for a member if the hub lists it
    // as shared by someone else — so read-only survives a daemon restart (which
    // clears the in-memory maps) and an already-pulled project opened without a
    // re-pull. The owner's own project resolves to their own id here, so their
    // client still computes isOwner=true and keeps editing. When this hub read
    // becomes a slow vela proxy, cache it behind the version probe (see
    // team-projects.ts TODO) rather than hitting it on every status poll.
    // Derive whenever the owner is UNKNOWN (not just on local_only): an author who
    // published (locally or via the file-sync watcher) has syncState='synced' but
    // an empty in-memory owners map after a restart, so gating on local_only left
    // ownerMemberId null → the OWNER's own client failed the isOwner check and went
    // read-only on their own project. Filling the owner from the hub whenever it is
    // null fixes that while keeping a non-owner member read-only.
    if (ownerMemberId == null && resolveSharedProjectOwner) {
      try {
        const hubOwner = await resolveSharedProjectOwner(projectId);
        if (hubOwner != null) {
          if (syncState === 'local_only') syncState = 'synced';
          ownerMemberId = hubOwner;
        }
      } catch {
        // Hub unavailable: fall back to the local (editable) state.
      }
    }
    // Resolve the owner's display name + role from the collab-cloud directory so
    // the client can render a named "shared project" banner. Best-effort — a
    // directory miss/outage just omits the name, keeping the status usable.
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
    // Report the hub's published head (not this daemon's in-memory counter) so a
    // member — who never published — still sees the owner's latest version and
    // knows when to pull. Falls back to the in-memory head on a hub hiccup.
    let head: number | null;
    try {
      head = await publishedHead(projectId);
    } catch {
      head = publishedVersion(projectId);
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

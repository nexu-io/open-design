import type { Express } from 'express';
import type { SkillInfo } from './skills.js';
import type { DesignSystemSummary } from './design-systems/index.js';
import type { RoutineRoutesService } from './routes/routine.js';
import type { OpenDesignPublicMetadataService } from './services/open-design-public-metadata.js';
import type { ResourceHubPrincipal } from './collab/resource-principal.js';
import type {
  AuthorizeProjectRequest,
  AuthorizeProjectToolRequest,
} from './collab/project-request-authority.js';

export interface HttpDeps {
  createSseResponse: (...args: any[]) => any;
  getPublicBaseUrl?: (...args: any[]) => string;
  isLocalSameOrigin: (...args: any[]) => boolean;
  requireLocalDaemonRequest: (...args: any[]) => any;
  resolvedPortRef: { current: number };
  sendApiError: (...args: any[]) => any;
  sendLiveArtifactRouteError: (...args: any[]) => any;
  sendMulterError: (...args: any[]) => any;
}

export interface PathDeps {
  ARTIFACTS_DIR: string;
  BRANDS_DIR: string;
  BUNDLED_PETS_DIR: string;
  CRAFT_DIR: string;
  DESIGN_SYSTEMS_DIR: string;
  // Bundled rendering catalogue (see specs/current/skills-and-design-templates.md).
  // Distinct from SKILLS_DIR so the EntryView Templates surface and the
  // Settings → Skills surface stay decoupled.
  DESIGN_TEMPLATES_DIR: string;
  // Global OD Library data root for owned, content-addressed assets
  // (derived from RUNTIME_DATA_DIR). See apps/daemon/src/library.ts.
  LIBRARY_DIR: string;
  OD_BIN: string;
  PROJECT_ROOT: string;
  PROJECTS_DIR: string;
  PROMPT_TEMPLATES_DIR: string;
  RUNTIME_DATA_DIR: string;
  RUNTIME_DATA_DIR_CANONICAL: string;
  SKILLS_DIR: string;
  USER_DESIGN_SYSTEMS_DIR: string;
  // Mirror of USER_SKILLS_DIR rooted at DESIGN_TEMPLATES_DIR so user
  // imports of templates do not collide with imports of functional skills.
  USER_DESIGN_TEMPLATES_DIR: string;
  USER_SKILLS_DIR: string;
}

export interface ResourceDeps {
  FIRST_PARTY_ATOMS?: Array<any>;
  // `workspaceId` scopes the user half of the catalog to one workspace (#145).
  // Omit it to resolve a design system by id from anywhere.
  listAllDesignSystems: (options?: {
    workspaceId?: string | null;
    workspaceMemberId?: string | null;
  }) => Promise<Array<DesignSystemSummary & { source?: string }>>;
  // The workspace a catalog read should be scoped to (#145). Data-plane reads
  // resolve it from this exact request's explicit Workspace/member identity,
  // never from a daemon-global active/current Workspace.
  resolveWorkspaceScope?: (req: any) => Promise<string | null>;
  // Whether the caller may mutate (edit / publish-toggle / delete) design
  // system `id` — the same verdict the PATCH/DELETE routes enforce (see
  // `registerDesignSystemRoutes`'s identically-named dep). Optional so a
  // caller that never renders a design-system list (e.g. a route-only test
  // fixture) does not have to supply it; the design-system LIST route below
  // treats a missing implementation as "always mutable" (skips decorating
  // `canMutate` rather than defaulting every entry to false).
  canMutateUserDesignSystem?: (root: string, id: string, req: any) => Promise<boolean>;
  // `workspaceId` scopes user-imported skills to one workspace, same
  // one-way "unclaimed visible everywhere, claimed elsewhere hidden" rule
  // as `listAllDesignSystems` above. Omit it to resolve a skill by id (or
  // compose the system prompt) from anywhere.
  listAllSkills: (options?: {
    workspaceId?: string | null;
    workspaceMemberId?: string | null;
  }) => Promise<Array<SkillInfo & { source?: string }>>;
  // Mirrors listAllSkills but scans DESIGN_TEMPLATE_ROOTS so the Templates
  // surface only sees rendering-catalogue entries.
  listAllDesignTemplates: () => Promise<Array<SkillInfo & { source?: string }>>;
  // Spans both functional skills and design templates so cross-surface
  // resolvers (chat run system prompt, orbit template resolver,
  // /api/skills/:id/example, /api/skills/:id/assets/*) keep working when
  // a stored project.skillId points at either root.
  listAllSkillLikeEntries: (options?: {
    workspaceId?: string | null;
    workspaceMemberId?: string | null;
  }) => Promise<Array<SkillInfo & { source?: string }>>;
  mimeFor: (filePath: string) => string;
}

export interface RoutineDeps {
  routineService: RoutineRoutesService;
}

export interface ProjectPreviewScopeDeps {
  mint: (
    projectId: string,
    workspace?: { workspaceId: string; workspaceMemberId: string } | null,
    options?: { readonly ttlMs?: number },
  ) => string;
  revoke: (scope: string) => void;
  expiresAt: (projectId: string, scope: string) => number | undefined;
  renew: (
    projectId: string,
    scope: string,
    options?: { readonly ttlMs?: number },
  ) => number | undefined;
  validate: (projectId: string, scope: string) => boolean;
  resolve: (
    projectId: string,
    scope: string,
  ) => { workspaceId: string; workspaceMemberId: string } | null | undefined;
}

export interface TelemetryDeps {
  reportFinalizedMessage: (
    saved: any,
    body?: any,
    options?: {
      analyticsContext?: any;
      projectId?: string;
      conversationId?: string;
      reportTrigger?: 'final_message' | 'terminal_fallback';
    },
  ) => void;
  /**
   * Best-effort Langfuse score emission for assistant-turn user ratings.
   * Returns the categorical outcome so the API surface in chat-routes can
   * report back to the web client whether the report was accepted or
   * skipped (consent off / no sink). The handler must not await this in
   * the request hot path — fire-and-forget.
   */
  reportFeedback?: (req: {
    runId: string;
    rating: 'positive' | 'negative';
    reasonCodes: string[];
    hasCustomReason: boolean;
    customReason: string;
    scoreMetadata?: Record<string, unknown>;
  }) => Promise<{ status: 'accepted' | 'skipped_consent' | 'skipped_no_sink' }>;
  reportRunCompletionTelemetryFallback: (...args: any[]) => any;
  resolveRunProjectKindForAnalytics: (...args: any[]) => any;
  runArtifactBaselines: any;
  runRetryEventsForAnalytics: (...args: any[]) => any;
  /** Product-result capture for request-scoped, consented analytics. */
  captureProductEvent?: (
    req: any,
    eventName: string,
    properties: Record<string, unknown>,
  ) => Promise<void> | void;
  /** Update one PostHog Workspace group from an authoritative read. */
  identifyWorkspaceGroup?: (
    req: any,
    workspaceId: string,
    properties: Record<string, unknown>,
  ) => Promise<void> | void;
}

export interface ServerContext {
  db: any;
  design: any;
  http: HttpDeps;
  paths: PathDeps;
  ids: any;
  uploads: any;
  node: any;
  projectStore: any;
  authorizeProjectRequest: AuthorizeProjectRequest;
  authorizeProjectToolRequest: AuthorizeProjectToolRequest;
  isApiTokenAuthorization: (authorization: string | undefined) => boolean;
  projectFiles: any;
  conversations: any;
  templates: any;
  status: any;
  events: any;
  imports: any;
  exports: any;
  artifacts: any;
  documents: any;
  auth: any;
  liveArtifacts: any;
  deploy: any;
  media: any;
  appConfig: any;
  orbit: any;
  nativeDialogs: any;
  research: any;
  mcp: any;
  plugins: any;
  resources: ResourceDeps;
  routines: RoutineDeps;
  projectPreviewScopes: ProjectPreviewScopeDeps;
  telemetry: TelemetryDeps;
  validation: any;
  finalize: any;
  handoff: any;
  chat: any;
  messages: any;
  agents: any;
  critique: any;
  openDesignPublicMetadata: OpenDesignPublicMetadataService;
  /**
   * C-lane collaboration seam for D's project-visibility routes. After a
   * successful personal→team move (D's move API), D's handler calls
   * `collabSync.requestTeamShare(projectId, principal)` in-process to trigger
   * the team sync: the project is marked pending and published to the resource
   * hub so every teammate can discover + read it. Idempotent (safe to call again
   * on a re-move). The principal is the same workspace/member that passed D's
   * route-level permission check, so the side effect cannot publish/catalog
   * under a different ambient workspace. D gates the move itself on
   * `canShareProjects`, so this seam does NOT re-check permission. See
   * routes/collab-sync.ts for the equivalent HTTP seam (POST /collab/sync-intent)
   * used by the demo surface.
   */
  collabSync: {
    requestTeamShare(projectId: string, share?: string | ResourceHubPrincipal): Promise<{ version: number | null }>;
    requestTeamUnshare(projectId: string, share?: string | ResourceHubPrincipal): Promise<void>;
    /**
     * Pull and atomically register a catalog-only Team project before an
     * exact-owner mutation needs local state. This preserves a Personal copy
     * before unshare and gives a second-device rename a real row to update.
     */
    materializeTeamProject?(projectId: string, principal: ResourceHubPrincipal): Promise<void>;
    /**
     * Re-upsert the shared project's hub catalog entry after a metadata-only
     * change (rename). Without this a rename with no follow-up content
     * publish never reached teammates. Fire-and-forget; no-op for projects
     * not shared from this daemon.
     */
    refreshTeamProjectMetadata(projectId: string): void;
    /**
     * Drop the cached team-project catalog because this daemon just changed it.
     * The share/unshare response is what makes the client refetch, and without
     * this that refetch is served the pre-change list out of the display cache
     * — so a project the user just shared did not appear in 全部项目 until some
     * later poll (acceptance #53). Fire-and-forget.
     */
    invalidateTeamProjectCatalog?(): void;
  };
  lifecycle: {
    isDaemonShuttingDown: () => boolean;
  };
}

export type RouteDeps<K extends keyof ServerContext> = Pick<ServerContext, K>;

export type RouteRegistrar = (app: Express, ctx: ServerContext) => void;

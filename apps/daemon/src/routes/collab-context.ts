import type { Express } from 'express';
import type {
  CollabCloudMemberDirectoryEntry,
  CollabCloudMembersResponse,
  TeamProject,
  WorkspaceBillingCatalog,
  WorkspaceBillingCatalogResponse,
  WorkspaceBillingCheckoutResponse,
  WorkspaceTeamBillingPlanId,
  WorkspaceBillingResponse,
  WorkspaceBillingSummary,
  WorkspaceContextResponse,
  WorkspaceInviteCreateResponse,
  WorkspaceInviteCreateResult,
  WorkspaceInviteRole,
  WorkspaceTeamProjectsResponse,
} from '@open-design/contracts';
import {
  parseWorkspaceCollabContext,
  type WorkspaceContextProvider,
} from '../collab/workspace-context.js';
import { createTeamProjectsLister } from '../collab/team-projects.js';
import {
  consumeInviteContinuation,
  type InviteContinueOutcome,
} from '../collab/invite-continue.js';
import {
  createWorkspaceInvite,
  type CreateInviteOutcome,
  type CreateWorkspaceInviteInput,
} from '../collab/invite-create.js';
import {
  fetchBillingCheckoutUrl,
  fetchVelaBillingCatalog,
  fetchVelaBillingSummary,
} from '../integrations/vela-billing.js';

export interface RegisterCollabContextRoutesDeps {
  workspaceContext: WorkspaceContextProvider;
  /** Injectable for tests; defaults to consuming against B with the vela session. */
  consumeInvite?: (nonce: string) => Promise<InviteContinueOutcome>;
  /** Injectable for tests; defaults to creating invites on B with the vela session. */
  createInvite?: (input: CreateWorkspaceInviteInput) => Promise<CreateInviteOutcome>;
  /** Injectable for tests; defaults to the vela billing CLI 收口. */
  fetchBilling?: () => Promise<WorkspaceBillingSummary | null>;
  /** Injectable for tests; defaults to the vela billing catalog CLI 收口. */
  fetchBillingCatalog?: (workspaceId: string) => Promise<WorkspaceBillingCatalog | null>;
  /** Injectable for tests; defaults to the vela billing checkout CLI 收口. */
  startCheckout?: (input: {
    workspaceId?: string;
    planId?: WorkspaceTeamBillingPlanId;
    seats?: number;
  }) => Promise<string | null>;
  /** Injectable for tests; defaults to the resource-hub team-project lister
   *  built from the same workspace context + env-configured hub client the share
   *  path uses. */
  listTeamProjects?: () => Promise<TeamProject[]>;
  /**
   * The team's collab-cloud member directory (memberId → {displayName, role}),
   * so the web client can resolve comment authors + the shared-project owner to
   * a name + role. Empty off-team / when the collab cloud is unconfigured. STUB:
   * B's roster is the real source; the collab-cloud directory stands in for it.
   */
  listMembers?: () => Promise<CollabCloudMemberDirectoryEntry[]>;
}

const ASSIGNABLE_ROLES = new Set<WorkspaceInviteRole>(['admin', 'member']);

/**
 * Normalize an invite-create request body into validated { email, role } items.
 * Accepts either the canonical `{ invites: [...] }` batch shape or a single
 * top-level `{ email, role }`. Rows without a non-empty email are dropped; a
 * missing/unknown role defaults to 'member' (never 'owner').
 */
function parseInviteCreateItems(
  body: unknown,
): Array<{ email: string; role: WorkspaceInviteRole }> {
  const raw = body as { invites?: unknown; email?: unknown; role?: unknown } | null;
  const source: unknown[] = Array.isArray(raw?.invites)
    ? raw!.invites
    : raw && typeof raw === 'object' && typeof raw.email === 'string'
      ? [raw]
      : [];
  const items: Array<{ email: string; role: WorkspaceInviteRole }> = [];
  for (const entry of source) {
    if (!entry || typeof entry !== 'object') continue;
    const rec = entry as { email?: unknown; role?: unknown };
    if (typeof rec.email !== 'string') continue;
    const email = rec.email.trim();
    if (!email) continue;
    const role: WorkspaceInviteRole =
      typeof rec.role === 'string' && ASSIGNABLE_ROLES.has(rec.role as WorkspaceInviteRole)
        ? (rec.role as WorkspaceInviteRole)
        : 'member';
    items.push({ email, role });
  }
  return items;
}

/**
 * Workspace-context route : the daemon's single B-integration seam. The
 * web client fetches the current caller's workspace context here to decide
 * whether collab runs and who the present member is (resolveCollabSession). In
 * production the provider proxies B; the dev provider is settable via PUT so a
 * demo/tools-dev run can exercise the full path before B is reachable.
 */
export function registerCollabContextRoutes(app: Express, deps: RegisterCollabContextRoutesDeps): void {
  const { workspaceContext } = deps;
  const consumeInvite = deps.consumeInvite ?? ((nonce: string) => consumeInviteContinuation(nonce));
  const createInvite =
    deps.createInvite ?? ((input: CreateWorkspaceInviteInput) => createWorkspaceInvite(input));
  const fetchBilling = deps.fetchBilling ?? (() => fetchVelaBillingSummary());
  const fetchBillingCatalog =
    deps.fetchBillingCatalog ?? ((workspaceId: string) => fetchVelaBillingCatalog(workspaceId));
  const startCheckout =
    deps.startCheckout ??
    ((input: { workspaceId?: string; planId?: WorkspaceTeamBillingPlanId; seats?: number }) =>
      fetchBillingCheckoutUrl(input));
  const listTeamProjects =
    deps.listTeamProjects ?? createTeamProjectsLister({ workspaceContext });
  const listMembers = deps.listMembers ?? (async () => []);

  // Desktop invite hand-off ("桌面唤起和本地恢复"): the desktop app parses the
  // opendesign:// invite deeplink and POSTs the nonce here. The daemon consumes
  // the one-time continuation on B with the signed-in vela session and returns
  // the resolved workspace context so the client can switch into the team
  // workspace. The nonce is single-use — B enforces subject match + one consume.
  app.post('/api/workspace/invite/continue', async (req, res) => {
    const body = req.body as { nonce?: unknown } | null;
    const nonce = body && typeof body.nonce === 'string' ? body.nonce : '';
    if (!nonce.trim()) return res.status(400).json({ error: 'missing_nonce' });
    const outcome = await consumeInvite(nonce);
    if (!outcome.ok) return res.status(outcome.status).json({ error: outcome.error });
    return res.json({ context: outcome.context, workspaceMemberId: outcome.workspaceMemberId });
  });

  // Invite CREATE (the inviter/host flow): the team switcher's "邀请同事" dialog
  // POSTs one or more { email, role } pairs here. The daemon derives the current
  // workspaceId from the caller's workspace context and creates each invite on B
  // with the signed-in vela session. Every outcome is typed: a missing session
  // 401s, a missing workspace 409s, and B's per-invite failures (including a 404
  // when B's create endpoint is absent locally) come back as `ok: false` results
  // — the endpoint never crashes on the backend being unavailable.
  app.post('/api/workspace/invite', async (req, res) => {
    const items = parseInviteCreateItems(req.body);
    if (items.length === 0) return res.status(400).json({ error: 'missing_invites' });

    const authorization = req.header('authorization') ?? undefined;
    const context = await workspaceContext.current({ authorization });
    const workspaceId = context?.workspaceId?.trim() ?? '';
    if (!workspaceId || context?.workspaceType !== 'team') {
      return res.status(409).json({ error: 'no_workspace' });
    }
    if (!context.permissions.canInviteMembers) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const results: WorkspaceInviteCreateResult[] = [];
    for (const item of items) {
      const outcome = await createInvite({ email: item.email, role: item.role, workspaceId });
      // The vela session is workspace-wide: if it is missing for one invite it is
      // missing for all, so short-circuit to a single 401 instead of N failures.
      if (!outcome.ok && outcome.error === 'no_session') {
        return res.status(401).json({ error: 'no_session' });
      }
      results.push(
        outcome.ok
          ? { email: item.email, ok: true, inviteId: outcome.inviteId }
          : { email: item.email, ok: false, error: outcome.error },
      );
    }
    const body: WorkspaceInviteCreateResponse = { results };
    return res.json(body);
  });

  app.get('/api/workspace/context', async (req, res) => {
    const authorization = req.header('authorization') ?? undefined;
    const context = await workspaceContext.current({ authorization });
    const body: WorkspaceContextResponse = { context };
    res.json(body);
  });

  // Team-wide shared-project discovery: the web "全部项目" view fetches every
  // project any member shared to the team here (read from the resource hub), so a
  // member whose own /api/projects list is empty still sees the owner's shared
  // projects to pull + open. Empty off-team / hub-unconfigured; a transient hub
  // error also degrades to [] so a hub outage never blanks the view with a 500.
  app.get('/api/workspace/projects/team', async (_req, res) => {
    let projects: TeamProject[] = [];
    try {
      projects = await listTeamProjects();
    } catch {
      projects = [];
    }
    const body: WorkspaceTeamProjectsResponse = { projects };
    res.json(body);
  });

  // Member directory: the web client resolves comment authors (authorMemberId →
  // "琼羽 · Owner") and the shared-project owner name from this. Read from the
  // collab-cloud directory; empty off-team / hub-unconfigured, and a directory
  // outage degrades to [] rather than a 500. STUB: stands in for B's roster.
  app.get('/api/workspace/members', async (_req, res) => {
    let members: CollabCloudMemberDirectoryEntry[] = [];
    try {
      members = await listMembers();
    } catch {
      members = [];
    }
    const body: CollabCloudMembersResponse = { members };
    res.json(body);
  });

  // A-lane billing 收口: the client's credits chip fetches the caller's real
  // plan tier + credit balance here. The daemon shells out to `vela billing
  // summary` (same vela session as resources); a null summary means the CLI /
  // session is unavailable and the client keeps its context-derived tier hint.
  // This route is also the sync-back path after a user upgrades in Vela Web.
  app.get('/api/workspace/billing', async (_req, res) => {
    const summary = await fetchBilling();
    const body: WorkspaceBillingResponse = { summary };
    res.json(body);
  });

  app.get('/api/workspace/billing/catalog', async (req, res) => {
    const authorization = req.header('authorization') ?? undefined;
    const context = await workspaceContext.current({ authorization });
    const workspaceId = context?.workspaceId?.trim() ?? '';
    const catalog = workspaceId ? await fetchBillingCatalog(workspaceId) : null;
    const body: WorkspaceBillingCatalogResponse = { catalog };
    res.json(body);
  });

  // Compatibility checkout route. The current product UI opens Vela Web for
  // upgrade/payment, but keeping this endpoint avoids breaking existing tests
  // and lets A's CLI checkout path be exercised directly when needed.
  app.post('/api/workspace/billing/checkout', async (req, res) => {
    const authorization = req.header('authorization') ?? undefined;
    const context = await workspaceContext.current({ authorization });
    const workspaceId = context?.workspaceId?.trim() ?? '';
    const body = (req.body ?? {}) as { planId?: unknown; seats?: unknown };
    const planId = parseTeamBillingPlanId(body.planId);
    const seats = typeof body.seats === 'number' && body.seats > 0 ? Math.floor(body.seats) : undefined;
    const checkoutInput: {
      workspaceId?: string;
      planId?: WorkspaceTeamBillingPlanId;
      seats?: number;
    } = { workspaceId };
    if (planId) checkoutInput.planId = planId;
    if (seats !== undefined) checkoutInput.seats = seats;
    const checkoutUrl = await startCheckout(checkoutInput);
    const response: WorkspaceBillingCheckoutResponse = { checkoutUrl };
    res.json(response);
  });

  // Dev/demo seam: override the in-memory context. A real B-backed provider does
  // not expose `set`, so this 404s in production instead of spoofing identity.
  app.put('/api/workspace/context', (req, res) => {
    if (!workspaceContext.set) {
      return res.status(404).json({ error: 'workspace context is not settable' });
    }
    const body = req.body as unknown;
    // `null` explicitly clears the context (sign-out / leave team).
    if (body === null || (body && typeof body === 'object' && Object.keys(body).length === 0)) {
      workspaceContext.set(null);
      const cleared: WorkspaceContextResponse = { context: null };
      return res.json(cleared);
    }
    const context = parseWorkspaceCollabContext(body);
    if (!context) return res.status(400).json({ error: 'invalid workspace context' });
    workspaceContext.set(context);
    const response: WorkspaceContextResponse = { context };
    res.json(response);
  });
}

function parseTeamBillingPlanId(value: unknown): WorkspaceTeamBillingPlanId | null {
  return value === 'team_plus' || value === 'team_pro' || value === 'team_max' ? value : null;
}

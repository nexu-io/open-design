import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { coalescedGet, evictCoalescedGet } from '../lib/coalesced-get';
import { Button, VisuallyHidden } from '@open-design/components';
import { useAnalytics } from '../analytics/provider';
import {
  trackDesignSystemsTemplateCardClick,
  trackDesignSystemsTopClick,
  trackDesignSystemStatusResult,
  trackDesignSystemEditClick,
  trackPageView,
  trackWorkspaceResourceActionResult,
} from '../analytics/events';
import type { DesignSystemEditClickProps } from '@open-design/contracts/analytics';
import type {
  TrackingDesignSystemStatusAction,
  TrackingDesignSystemStatusValue,
} from '@open-design/contracts/analytics';
import { useI18n } from '../i18n';
import { useWorkspaceContext } from '../collab/useWorkspaceContext';
import {
  beginWorkspaceResourceScopedRead,
  beginWorkspaceScopedRead,
  resolveWorkspaceResourceReadIdentity,
  workspaceIdentityCacheKey,
  workspaceProjectHeaders,
  workspaceResourceReadIdentityKey,
  type WorkspaceResourceReadIdentity,
} from '../collab/workspace-identity';
import {
  useWorkspaceInvalidation,
} from '../collab/workspace-events';
import { useWorkspaceSnapshotActivation } from '../collab/workspace-snapshot-activation';
import {
  workspaceContextHasTeamIdentity,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import type { Locale } from '../i18n/types';
import {
  localizeDesignSystemCategory,
  localizeDesignSystemSummary,
} from '../i18n/content';
import { takeDesignSystemFocus } from '../runtime/brands';
import {
  deleteDesignSystemDraft,
  DesignSystemDeleteError,
  fetchDesignSystem,
  fetchProjectFileText,
  projectRawUrl,
  updateDesignSystemDraft,
} from '../providers/registry';
import { downloadDesignSystemArchive, downloadProjectArchive } from '../runtime/exports';
import { useDesignKit } from '../runtime/design-kit';
import { DesignKitView, HeaderActionsMenu, type DesignKitActionFeedbackTone, type HeaderMenuAction } from './DesignKitView';
import { designSystemLogoHost, isUserSystem } from './design-system-metadata';
import { Icon } from './Icon';
import { Toast } from './Toast';
import type { DesignSystemDetail, DesignSystemSummary, ProjectTemplate, Surface } from '../types';
import styles from './DesignSystemsTab.module.css';
import { workspaceAnalyticsDimensions } from '../analytics/workspace';
import type { TrackingWorkspaceScope } from '@open-design/contracts/analytics';

interface Props {
  /** EntryShell parks this mounted tab while another nav surface is visible. */
  isActive?: boolean;
  systems: DesignSystemSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  onCreate?: () => void;
  onOpenSystem?: (id: string) => void;
  onSystemsRefresh?: (options?: {
    materializedTeamIds?: readonly string[];
  }) => Promise<void> | void;
  templates?: ProjectTemplate[];
}

const CATEGORY_ORDER = [
  'Starter',
  'AI & LLM',
  'Developer Tools',
  'Productivity & SaaS',
  'Backend & Data',
  'Design & Creative',
  'Fintech & Crypto',
  'E-Commerce & Retail',
  'Media & Consumer',
  'Automotive',
];

type SurfaceFilter = 'all' | Surface;
type DesignSystemCollection = 'mine' | 'team' | 'official' | 'enterprise';
const EMPTY_TEAM_SHARED_IDS: ReadonlySet<string> = new Set();
const EMPTY_TEAM_SHARED_META: ReadonlyMap<string, { canUnshare?: boolean }> = new Map();
type DesignSystemActionKind = 'edit' | 'publish' | 'default' | 'delete';

const SURFACE_PILLS: { value: SurfaceFilter; labelKey: 'examples.modeAll' | 'ds.surfaceWeb' | 'ds.surfaceImage' | 'ds.surfaceVideo' | 'ds.surfaceAudio' }[] = [
  { value: 'all', labelKey: 'examples.modeAll' },
  { value: 'web', labelKey: 'ds.surfaceWeb' },
  { value: 'image', labelKey: 'ds.surfaceImage' },
  { value: 'video', labelKey: 'ds.surfaceVideo' },
  { value: 'audio', labelKey: 'ds.surfaceAudio' },
];

function surfaceOf(system: DesignSystemSummary): Surface {
  return system.surface ?? 'web';
}

// `system.status` is the DesignSystemSummary status string from the
// daemon; map it onto the tracking enum used by
// `design_system_status_result.status_before|status_after`. The
// summary type today only carries `'draft' | 'published'`; the wider
// tracking enum keeps room for `ready`/`failed`/`archived` once those
// land server-side. Unknown values collapse to `'unknown'`.
function mapStatusToTracking(
  status: string | null | undefined,
): TrackingDesignSystemStatusValue {
  switch (status) {
    case 'draft':
    case 'published':
      return status;
    default:
      return 'unknown';
  }
}

function systemMatchesQuery(
  locale: Locale,
  system: DesignSystemSummary,
  query: string,
): boolean {
  if (!query) return true;
  const summary = localizeDesignSystemSummary(locale, system).toLowerCase();
  const categoryLabel = localizeDesignSystemCategory(
    locale,
    system.category || 'Uncategorized',
  ).toLowerCase();
  return (
    system.title.toLowerCase().includes(query) ||
    system.summary.toLowerCase().includes(query) ||
    summary.includes(query) ||
    categoryLabel.includes(query)
  );
}

function setsEqual<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

function teamSharedMetaEqual(
  a: ReadonlyMap<string, { canUnshare?: boolean }>,
  b: ReadonlyMap<string, { canUnshare?: boolean }>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (!b.has(key) || b.get(key)?.canUnshare !== value.canUnshare) return false;
  }
  return true;
}

export function DesignSystemsTab({
  isActive = true,
  systems,
  selectedId,
  onSelect,
  loading = false,
  onCreate,
  onOpenSystem,
  onSystemsRefresh,
}: Props) {
  const { locale, t } = useI18n();
  const analytics = useAnalytics();
  const designSystemsPageViewFiredRef = useRef(false);
  useEffect(() => {
    if (!isActive) return;
    if (loading) return;
    if (designSystemsPageViewFiredRef.current) return;
    designSystemsPageViewFiredRef.current = true;
    // v2 doc: the DS list page also carries `area` / `view_type` /
    // `entry_from` so it can stitch the cross-surface DS funnel.
    // `entry_from` is `unknown` here because the tab is reached
    // through the home nav rail; a router-aware entry mapper can
    // refine this later.
    trackPageView(analytics.track, {
      page_name: 'design_systems',
      area: 'design_system_list',
      view_type: 'page',
      entry_from: 'unknown',
      available_design_system_count: systems.length,
    });
  }, [analytics.track, systems.length, isActive, loading]);
  const searchTrackedRef = useRef(false);
  const categoryTrackedRef = useRef(false);
  const [filter, setFilter] = useState('');
  // #5517 header search: collapsed to a round glyph until opened or filled.
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [busyAction, setBusyAction] = useState<{ systemId: string; action: DesignSystemActionKind } | null>(null);
  const busyId = busyAction?.systemId ?? null;
  const [actionToast, setActionToast] = useState<{ message: string; tone: DesignKitActionFeedbackTone } | null>(null);
  const notifyAction = (tone: DesignKitActionFeedbackTone, message: string) => {
    setActionToast({ tone, message });
  };
  const notifyActionLoading = (label?: string) => {
    const message = label
      ? label.endsWith('…') || label.endsWith('...') ? label : `${label}...`
      : t('common.loading');
    notifyAction('loading', message);
  };
  const [designSystemCollection, setDesignSystemCollection] = useState<DesignSystemCollection>('mine');
  // The 团队 collection is a team-workspace surface (B's resource plane is
  // team-only): signed-out / personal-workspace users get no team tab, and a
  // sign-out while on it falls back to 你的体系 (#5517 signed-out form).
  const workspaceState = useWorkspaceContext();
  const { context: workspaceContext } = workspaceState;
  const resourceReadIdentity = resolveWorkspaceResourceReadIdentity(workspaceState);
  const workspaceDimensions = workspaceAnalyticsDimensions(workspaceContext);
  const workspaceContextRef = useRef(workspaceContext);
  workspaceContextRef.current = workspaceContext;
  const systemsRef = useRef(systems);
  systemsRef.current = systems;
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const teamSharedStaleRef = useRef(false);
  const workspaceIdentity = workspaceIdentityCacheKey(workspaceContext);
  // Gate on TEAM IDENTITY — the same predicate the daemon uses to accept a hub
  // share (workspaceContextHasTeamIdentity; see team-resource-share.ts) — NOT on
  // the billing plan. A team on a free/unpaid tier (trial, lapsed, or billing not
  // yet resolved) still has a real team resource plane with shared design
  // systems; gating on the plan hid the collection from those teams even though
  // the daemon serves and shares their resources. Personal / signed-out sessions
  // have no team plane and correctly get no team tab.
  const hasTeamWorkspace = workspaceContextHasTeamIdentity(workspaceContext);
  useEffect(() => {
    if (designSystemCollection === 'team' && !hasTeamWorkspace) setDesignSystemCollection('mine');
  }, [designSystemCollection, hasTeamWorkspace]);
  // Ids of the caller's design systems shared into the team scope. The daemon is
  // the source of truth (it publishes them to the resource hub); we mirror the
  // list here so the "team" collection and the per-system share action stay in
  // sync. Empty (and the share action is a no-op) when there is no team context.
  const [teamSharedState, setTeamSharedState] = useState<{
    workspaceIdentity: string;
    ids: ReadonlySet<string>;
    meta: ReadonlyMap<string, { canUnshare?: boolean }>;
  }>(() => ({
    workspaceIdentity,
    ids: new Set(),
    meta: new Map(),
  }));
  const teamSharedRequestGenerationRef = useRef(0);
  // Never render a previous Workspace's Team index while the next scoped read
  // is still in flight. The cached response is partitioned by Workspace too,
  // but React state survives the context switch itself.
  const teamSharedIds = teamSharedState.workspaceIdentity === workspaceIdentity
    ? teamSharedState.ids
    : EMPTY_TEAM_SHARED_IDS;
  // Per-id share metadata mirrored off the same `/team` read — `canUnshare` is
  // the ownership gate (resource owner, or a workspace owner/admin) computed
  // server-side in `canManageSharedResource`; the unshare button only renders
  // when it is true so a member never sees an action the daemon will 403 on.
  const teamSharedMeta = teamSharedState.workspaceIdentity === workspaceIdentity
    ? teamSharedState.meta
    : EMPTY_TEAM_SHARED_META;
  const resourceScopeForSystem = (system: DesignSystemSummary): TrackingWorkspaceScope =>
    system.teamSynced || teamSharedIds.has(system.id)
      ? 'team'
      : isUserSystem(system)
        ? 'personal'
        : 'official';
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [unsharingId, setUnsharingId] = useState<string | null>(null);
  const [surfaceFilter, setSurfaceFilter] = useState<SurfaceFilter>('all');
  const [category, setCategory] = useState<string>('All');
  // The master-detail selection — which row renders in the right preview pane.
  // Distinct from `selectedId`, which is the global *default* design system.
  const [previewId, setPreviewId] = useState<string | null>(null);
  // A one-shot design-system id another surface asked us to preselect (e.g. the
  // brand-extraction "ready" prompt navigating here). Read+cleared from
  // sessionStorage exactly once; applied by the effect below once the system
  // actually shows up in the loaded list (which may arrive after a refresh).
  const [pendingFocus, setPendingFocus] = useState<string | null>(() => takeDesignSystemFocus());
  const q = filter.trim().toLowerCase();

  const librarySystems = useMemo(
    () => systems.filter((system) => !isUserSystem(system)),
    [systems],
  );

  const userSystems = useMemo(
    () => systems.filter((system) => (
      isUserSystem(system) &&
      !system.teamSynced &&
      !teamSharedIds.has(system.id)
    )),
    [systems, teamSharedIds],
  );

  const userSearched = useMemo(
    () => userSystems.filter((s) => systemMatchesQuery(locale, s, q)),
    [userSystems, locale, q],
  );

  const teamSystems = useMemo(
    () => systems.filter((system) => isUserSystem(system) && teamSharedIds.has(system.id)),
    [systems, teamSharedIds],
  );

  // The "team" collection: team-shared design systems materialized locally.
  // A shared id belongs exclusively to this collection, including the
  // sharer's original local summary before the pulled Team copy is refreshed.
  const teamSearched = useMemo(
    () => teamSystems.filter((s) => systemMatchesQuery(locale, s, q)),
    [teamSystems, locale, q],
  );

  const surfaceScoped = useMemo(
    () => surfaceFilter === 'all'
      ? librarySystems
      : librarySystems.filter((s) => surfaceOf(s) === surfaceFilter),
    [librarySystems, surfaceFilter],
  );

  // Total systems per surface, ignoring every active filter. Drives the
  // "this surface is now empty" fallback below — that guard must react to
  // the catalog itself, not to a transient style/search filter.
  const surfaceTotals = useMemo(() => {
    const counts: Record<SurfaceFilter, number> = { all: librarySystems.length, web: 0, image: 0, video: 0, audio: 0 };
    for (const s of librarySystems) counts[surfaceOf(s)]++;
    return counts;
  }, [librarySystems]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const s of surfaceScoped) cats.add(s.category || 'Uncategorized');
    const ordered: string[] = [];
    for (const c of CATEGORY_ORDER) if (cats.has(c)) ordered.push(c);
    for (const c of [...cats].sort()) if (!ordered.includes(c)) ordered.push(c);
    return ['All', ...ordered];
  }, [surfaceScoped]);

  // Keep surfaceFilter and category in sync when systems changes dynamically.
  // If the currently selected surface has zero items, fall back to 'all'.
  // If the current category is no longer present in the filtered list, fall back to 'All'.
  useEffect(() => {
    if (surfaceFilter !== 'all' && surfaceTotals[surfaceFilter] === 0) {
      setSurfaceFilter('all');
      setCategory('All');
    } else if (category !== 'All' && !categories.includes(category)) {
      setCategory('All');
    }
  }, [systems, surfaceFilter, surfaceTotals, category, categories]);

  // Systems matching the active style category and search text, before the
  // surface filter is applied. Both the surface pill counts and the visible
  // list derive from this so a surface chip always reports its own result
  // set rather than the unfiltered catalog total.
  const queryScoped = useMemo(() => {
    return librarySystems.filter((s) => {
      if (category !== 'All' && (s.category || 'Uncategorized') !== category) return false;
      return systemMatchesQuery(locale, s, q);
    });
  }, [librarySystems, q, category, locale]);

  const surfaceCounts = useMemo(() => {
    const counts: Record<SurfaceFilter, number> = {
      all: queryScoped.length, web: 0, image: 0, video: 0, audio: 0,
    };
    for (const s of queryScoped) counts[surfaceOf(s)]++;
    return counts;
  }, [queryScoped]);

  const filtered = useMemo(
    () => surfaceFilter === 'all'
      ? queryScoped
      : queryScoped.filter((s) => surfaceOf(s) === surfaceFilter),
    [queryScoped, surfaceFilter],
  );

  // The list backing the active scope. Design-system scopes carry summaries;
  const activeSystems = useMemo<DesignSystemSummary[]>(() => {
    if (designSystemCollection === 'mine') return userSearched;
    if (designSystemCollection === 'team') return teamSearched;
    if (designSystemCollection === 'official') return filtered;
    return [];
  }, [designSystemCollection, userSearched, teamSearched, filtered]);

  const activeIds = useMemo(() => {
    return activeSystems.map((s) => s.id);
  }, [activeSystems]);

  // Keep the previewed row valid as scopes / filters change: hold the current
  // pick when it still exists, otherwise fall back to the first row (mirrors
  // the Brand Kit master-detail). Empty scopes clear the selection.
  useEffect(() => {
    if (activeIds.length === 0) {
      setPreviewId(null);
      return;
    }
    setPreviewId((cur) => (cur && activeIds.includes(cur) ? cur : activeIds[0] ?? null));
  }, [activeIds]);

  // Apply a pending focus once the requested system is present in the catalog.
  // Runs again whenever `systems` changes, so a focus that arrived before the
  // freshly-finalized brand design system loaded still lands after the refresh.
  // Brand systems are user systems, so make sure the "mine" scope is active.
  useEffect(() => {
    if (!pendingFocus) return;
    const sys = systems.find((s) => s.id === pendingFocus);
    if (!sys) return; // not in the loaded list yet — wait for the next refresh
    if (isUserSystem(sys)) {
      setDesignSystemCollection(teamSharedIds.has(sys.id) ? 'team' : 'mine');
    }
    setPreviewId(pendingFocus);
    setPendingFocus(null);
  }, [pendingFocus, systems, teamSharedIds]);

  const selectedSystem = useMemo(() => {
    if (!previewId) return null;
    return activeSystems.find((s) => s.id === previewId) ?? null;
  }, [previewId, activeSystems]);

  // Category metadata is authored in English; keep raw values in state for
  // filtering while localizing the visible labels for the current UI locale.
  const renderCategory = (c: string) => {
    if (c === 'All') return t('ds.categoryAll');
    if (c === 'Uncategorized') return t('ds.categoryUncategorized');
    return localizeDesignSystemCategory(locale, c);
  };

  async function refreshSystems() {
    await onSystemsRefresh?.();
  }

  // Load the set of design systems already shared to the team. Off-team (or with
  // the hub unconfigured) this returns an empty list, so the team collection is
  // simply empty and the share action is available but a no-op.
  const refreshTeamShared = useCallback(async (
    options: { refreshSystems?: boolean; invalidate?: boolean; fresh?: boolean } = {},
  ) => {
    const requestGeneration = ++teamSharedRequestGenerationRef.current;
    const read = beginWorkspaceScopedRead(workspaceContextRef.current);
    if (!read.context || !workspaceContextHasTeamIdentity(read.context)) {
      setTeamSharedState({
        workspaceIdentity: workspaceIdentityCacheKey(read.context),
        ids: new Set(),
        meta: new Map(),
      });
      return;
    }
    const context = read.context;
    try {
      // Key the coalescing window by workspace (#145): the response is the
      // ACTIVE workspace's shared set, so a constant key let a switch that
      // landed inside the in-flight/TTL window serve the previous workspace's
      // ids to the new one.
      const scopedWorkspaceIdentity = workspaceIdentityCacheKey(context);
      const cacheKey = `workspace-design-systems-team:${scopedWorkspaceIdentity}`;
      const readTeamIndex = async () => {
        const res = await fetch('/api/workspace/design-systems/team', {
          cache: 'no-store',
          headers: workspaceProjectHeaders(context),
        });
        if (!res.ok) throw new Error(`design-systems-team ${res.status}`);
        return (await res.json()) as { ids?: unknown; resources?: unknown };
      };
      // Lifecycle snapshots and every real mutation must supersede whatever
      // was in flight. Two distinct mutations inside 250ms are not one burst:
      // joining would let A's old body commit under B's request generation.
      if (options.fresh || options.invalidate) evictCoalescedGet(cacheKey);
      const body = await coalescedGet(cacheKey, readTeamIndex);
      if (
        requestGeneration !== teamSharedRequestGenerationRef.current
        || !read.isStillCurrent(workspaceContextRef.current)
      ) return;
      if (Array.isArray(body.ids)) {
        const next = new Set(body.ids.filter((id): id is string => typeof id === 'string'));
        const meta = new Map<string, { canUnshare?: boolean }>();
        if (Array.isArray(body.resources)) {
          for (const resource of body.resources) {
            if (!resource || typeof resource !== 'object') continue;
            const record = resource as Record<string, unknown>;
            if (typeof record.id !== 'string') continue;
            meta.set(record.id, {
              ...(typeof record.canUnshare === 'boolean' ? { canUnshare: record.canUnshare } : {}),
            });
          }
        }
        const catalogIds = new Set(systemsRef.current.map((system) => system.id));
        const catalogMissesTeamEntry = [...next].some((id) => !catalogIds.has(id));
        const catalogKeepsRetiredTeamMirror = systemsRef.current.some((system) => (
          system.teamSynced === true && !next.has(system.id)
        ));
        const shouldRefreshSystems = options.refreshSystems
          || catalogMissesTeamEntry
          || catalogKeepsRetiredTeamMirror;
        setTeamSharedState((prev) => (
          prev.workspaceIdentity === scopedWorkspaceIdentity &&
          setsEqual(prev.ids, next) &&
          teamSharedMetaEqual(prev.meta, meta)
            ? prev
            : { workspaceIdentity: scopedWorkspaceIdentity, ids: next, meta }
        ));
        if (shouldRefreshSystems) {
          // `/team` has already materialized this exact Workspace snapshot.
          // Pass its ids through so the parent catalog refresh does not repeat
          // the same remote/materialization request before GET /design-systems.
          await onSystemsRefresh?.({ materializedTeamIds: [...next] });
        }
      }
    } catch {
      // Non-fatal: leave the team collection empty on a transient failure.
    }
  }, [onSystemsRefresh, workspaceIdentity]);

  useEffect(() => {
    if (!isActive) return;
    // Do not wait for the Workspace SSE stream's activation fallback (or the
    // 10s poll) before reading the Team index. The request is already keyed
    // and authorized by the exact Workspace/member identity, and coalescedGet
    // joins a simultaneous onActive refresh instead of double-fetching.
    void refreshTeamShared();
  }, [isActive, refreshTeamShared]);

  const handleTeamIndexStreamActive = useWorkspaceSnapshotActivation({
    enabled: isActive && hasTeamWorkspace,
    identity: workspaceIdentity,
    // The active-mount read above is the initial exact-scope snapshot. Join it
    // when stream activation lands concurrently; real change events still use
    // `invalidate: true` below and therefore supersede any older snapshot.
    refresh: () => { void refreshTeamShared(); },
  });

  useWorkspaceInvalidation(
    {
      'team-resources-changed': (payload) => {
        if (payload.resourceKind !== 'design_system') return;
        if (!isActiveRef.current) {
          teamSharedStaleRef.current = true;
          return;
        }
        void refreshTeamShared({ invalidate: true });
      },
    },
    {
      workspaceContext: hasTeamWorkspace ? workspaceContext : null,
      enabled: hasTeamWorkspace,
      onActive: () => {
        if (!isActiveRef.current) {
          teamSharedStaleRef.current = true;
          return;
        }
        teamSharedStaleRef.current = false;
        handleTeamIndexStreamActive();
      },
    },
  );

  useEffect(() => {
    if (!isActive) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshTeamShared();
    }, 10_000);
    return () => {
      window.clearInterval(interval);
    };
  }, [isActive, refreshTeamShared]);

  // Promote a personal design system into the team scope, OR — when it is
  // already team-shared — push the current local directory as an update that
  // overwrites the hub's stale version. Same daemon route either way: `share()`
  // (team-resource-share.ts) has no "already shared" guard, so a repeat call
  // is just the latest bytes replacing the previous ones. Only the copy
  // rendering distinguishes the two cases (see the `syncToTeam` label above).
  async function handleShareToTeam(system: DesignSystemSummary) {
    if (sharingId) return;
    const context = workspaceContextRef.current;
    if (!context || !workspaceContextHasTeamIdentity(context)) {
      notifyAction('error', t('dsManager.shareToTeamFailed'));
      return;
    }
    const wasAlreadyShared = teamSharedIds.has(system.id);
    const startedAt = performance.now();
    const loadingLabel = wasAlreadyShared ? t('dsManager.syncToTeam') : t('dsManager.shareToTeam');
    const failedLabel = wasAlreadyShared ? t('dsManager.syncToTeamFailed') : t('dsManager.shareToTeamFailed');
    setSharingId(system.id);
    notifyActionLoading(loadingLabel);
    try {
      const res = await fetch(`/api/workspace/design-systems/${encodeURIComponent(system.id)}/share`, {
        method: 'POST',
        headers: workspaceProjectHeaders(context),
      });
      const body = (await res.json().catch(() => ({}))) as { shared?: boolean };
      if (res.ok && body.shared) {
        await refreshTeamShared({ refreshSystems: true, invalidate: true });
        notifyAction('success', t('ds.actionDone'));
        trackWorkspaceResourceActionResult(analytics.track, {
          page_name: 'design_systems',
          area: 'workspace_resource',
          resource_kind: 'design_system',
          resource_scope: 'personal',
          action: wasAlreadyShared ? 'sync_to_team' : 'share_to_team',
          result: 'success',
          duration_ms: Math.round(performance.now() - startedAt),
          ...workspaceDimensions,
        });
      } else if (res.ok) {
        // Reached the daemon but there is no team identity to share under.
        notifyAction('error', failedLabel);
        trackWorkspaceResourceActionResult(analytics.track, {
          page_name: 'design_systems', area: 'workspace_resource', resource_kind: 'design_system',
          resource_scope: 'personal', action: wasAlreadyShared ? 'sync_to_team' : 'share_to_team',
          result: 'failed', duration_ms: Math.round(performance.now() - startedAt),
          error_code: 'resource_not_shared', ...workspaceDimensions,
        });
      } else {
        notifyAction('error', failedLabel);
        trackWorkspaceResourceActionResult(analytics.track, {
          page_name: 'design_systems', area: 'workspace_resource', resource_kind: 'design_system',
          resource_scope: 'personal', action: wasAlreadyShared ? 'sync_to_team' : 'share_to_team',
          result: 'failed', duration_ms: Math.round(performance.now() - startedAt),
          error_code: `http_${res.status}`, ...workspaceDimensions,
        });
      }
    } catch {
      notifyAction('error', failedLabel);
      trackWorkspaceResourceActionResult(analytics.track, {
        page_name: 'design_systems', area: 'workspace_resource', resource_kind: 'design_system',
        resource_scope: 'personal', action: wasAlreadyShared ? 'sync_to_team' : 'share_to_team',
        result: 'failed', duration_ms: Math.round(performance.now() - startedAt),
        error_code: 'network_error', ...workspaceDimensions,
      });
    } finally {
      setSharingId(null);
    }
  }

  // Remove a design system from the team scope. Mirrors PluginsView's
  // unshareResource: DELETE the same share route, backed by the daemon's
  // resource-owner permission gate (only the sharer, or a workspace
  // owner/admin, may unshare — enforced server-side regardless of what the
  // button shows).
  async function handleUnshareFromTeam(system: DesignSystemSummary) {
    if (unsharingId) return;
    const context = workspaceContextRef.current;
    if (!context || !workspaceContextHasTeamIdentity(context)) {
      notifyAction('error', t('dsManager.unshareFromTeamFailed'));
      return;
    }
    setUnsharingId(system.id);
    const startedAt = performance.now();
    notifyActionLoading(t('dsManager.unshareFromTeam'));
    try {
      const res = await fetch(`/api/workspace/design-systems/${encodeURIComponent(system.id)}/share`, {
        method: 'DELETE',
        headers: workspaceProjectHeaders(context),
      });
      const body = (await res.json().catch(() => ({}))) as { unshared?: boolean };
      if (res.ok && body.unshared) {
        await refreshTeamShared({ refreshSystems: true, invalidate: true });
        notifyAction('success', t('ds.actionDone'));
        trackWorkspaceResourceActionResult(analytics.track, {
          page_name: 'design_systems', area: 'workspace_resource', resource_kind: 'design_system',
          resource_scope: 'team', action: 'remove_from_team', result: 'success',
          duration_ms: Math.round(performance.now() - startedAt), ...workspaceDimensions,
        });
      } else {
        notifyAction('error', t('dsManager.unshareFromTeamFailed'));
        trackWorkspaceResourceActionResult(analytics.track, {
          page_name: 'design_systems', area: 'workspace_resource', resource_kind: 'design_system',
          resource_scope: 'team', action: 'remove_from_team', result: 'failed',
          duration_ms: Math.round(performance.now() - startedAt),
          error_code: res.ok ? 'resource_not_removed' : `http_${res.status}`, ...workspaceDimensions,
        });
      }
    } catch {
      notifyAction('error', t('dsManager.unshareFromTeamFailed'));
      trackWorkspaceResourceActionResult(analytics.track, {
        page_name: 'design_systems', area: 'workspace_resource', resource_kind: 'design_system',
        resource_scope: 'team', action: 'remove_from_team', result: 'failed',
        duration_ms: Math.round(performance.now() - startedAt), error_code: 'network_error',
        ...workspaceDimensions,
      });
    } finally {
      setUnsharingId(null);
    }
  }

  async function togglePublished(system: DesignSystemSummary) {
    if (busyAction) return;
    setBusyAction({ systemId: system.id, action: 'publish' });
    notifyActionLoading();
    const startedAt = performance.now();
    const willPublish = system.status !== 'published';
    const action: TrackingDesignSystemStatusAction = willPublish
      ? 'publish'
      : 'unpublish';
    const statusBefore = mapStatusToTracking(system.status);
    const isDefaultBefore = system.id === selectedId;
    let succeeded = false;
    let errorCode: string | undefined;
    try {
      const updated = await updateDesignSystemDraft(system.id, {
        status: willPublish ? 'published' : 'draft',
      }, workspaceContext);
      succeeded = Boolean(updated);
      if (!succeeded) errorCode = 'DS_STATUS_UPDATE_RETURNED_NULL';
      if (succeeded) {
        await refreshSystems();
        notifyAction('success', t('ds.actionDone'));
      } else {
        notifyAction('error', t('ds.actionFailed'));
      }
    } catch (err) {
      errorCode = err instanceof Error
        ? `DS_STATUS_UPDATE_THREW:${err.message.slice(0, 80)}`
        : 'DS_STATUS_UPDATE_THREW';
      notifyAction('error', t('ds.actionFailed'));
    } finally {
      setBusyAction(null);
      trackDesignSystemStatusResult(analytics.track, {
        page_name: 'design_systems',
        area: 'design_system_status',
        action,
        result: succeeded ? 'success' : 'failed',
        design_system_id: system.id,
        resource_scope: resourceScopeForSystem(system),
        status_before: statusBefore,
        status_after: succeeded
          ? willPublish
            ? 'published'
            : 'draft'
          : statusBefore,
        is_default_before: isDefaultBefore,
        is_default_after: isDefaultBefore,
        error_code: errorCode,
        duration_ms: Math.round(performance.now() - startedAt),
      });
    }
  }

  async function deleteSystem(system: DesignSystemSummary) {
    if (busyAction) return;
    const ok = window.confirm(t('dsManager.deleteConfirm', { title: system.title }));
    if (!ok) {
      trackDesignSystemStatusResult(analytics.track, {
        page_name: 'design_systems',
        area: 'design_system_status',
        action: 'delete',
        result: 'cancelled',
        design_system_id: system.id,
        resource_scope: resourceScopeForSystem(system),
        status_before: mapStatusToTracking(system.status),
        status_after: mapStatusToTracking(system.status),
        is_default_before: system.id === selectedId,
        is_default_after: system.id === selectedId,
        duration_ms: 0,
      });
      return;
    }
    setBusyAction({ systemId: system.id, action: 'delete' });
    notifyActionLoading(t('dsManager.deleteSystemAria', { title: system.title }));
    const startedAt = performance.now();
    const statusBefore = mapStatusToTracking(system.status);
    const wasDefault = system.id === selectedId;
    let succeeded = false;
    let errorCode: string | undefined;
    try {
      const deleted = await deleteDesignSystemDraft(system.id, workspaceContext);
      succeeded = Boolean(deleted);
      if (!succeeded) errorCode = 'DS_DELETE_RETURNED_FALSE';
      if (succeeded && selectedId === system.id) {
        const fallback = systems.find((candidate) =>
          candidate.id !== system.id && isUserSystem(candidate),
        );
        if (fallback) onSelect(fallback.id);
      }
      if (succeeded) {
        await refreshSystems();
        notifyAction('success', t('ds.actionDone'));
      } else {
        notifyAction('error', t('ds.actionFailed'));
      }
    } catch (err) {
      errorCode = err instanceof Error
        ? `DS_DELETE_THREW:${err.message.slice(0, 80)}`
        : 'DS_DELETE_THREW';
      notifyAction(
        'error',
        err instanceof DesignSystemDeleteError
          && err.code === 'WORKSPACE_RESOURCE_MANAGE_DENIED'
          ? t('dsManager.deletePermissionDenied')
          : t('ds.actionFailed'),
      );
    } finally {
      setBusyAction(null);
      trackDesignSystemStatusResult(analytics.track, {
        page_name: 'design_systems',
        area: 'design_system_status',
        action: 'delete',
        result: succeeded ? 'success' : 'failed',
        design_system_id: system.id,
        resource_scope: resourceScopeForSystem(system),
        status_before: statusBefore,
        status_after: succeeded ? 'deleted' : statusBefore,
        is_default_before: wasDefault,
        // After a successful delete the row is gone; if it was the
        // default the consumer remapped to a fallback above, so this
        // DS is no longer the default either way.
        is_default_after: false,
        error_code: errorCode,
        duration_ms: Math.round(performance.now() - startedAt),
      });
    }
  }

  function handleMakeDefaultClick(system: DesignSystemSummary): void {
    if (busyAction) return;
    setBusyAction({ systemId: system.id, action: 'default' });
    notifyActionLoading(t('dsManager.makeDefault'));
    const wasDefault = system.id === selectedId;
    const statusBefore = mapStatusToTracking(system.status);
    try {
      onSelect(system.id);
      notifyAction('success', t('ds.actionDone'));
      trackDesignSystemStatusResult(analytics.track, {
        page_name: 'design_systems',
        area: 'design_system_status',
        action: wasDefault ? 'unset_default' : 'set_default',
        result: 'success',
        design_system_id: system.id,
        resource_scope: resourceScopeForSystem(system),
        status_before: statusBefore,
        status_after: statusBefore,
        is_default_before: wasDefault,
        is_default_after: !wasDefault,
        duration_ms: 0,
      });
    } catch {
      notifyAction('error', t('ds.actionFailed'));
      trackDesignSystemStatusResult(analytics.track, {
        page_name: 'design_systems',
        area: 'design_system_status',
        action: wasDefault ? 'unset_default' : 'set_default',
        result: 'failed',
        design_system_id: system.id,
        resource_scope: resourceScopeForSystem(system),
        status_before: statusBefore,
        status_after: statusBefore,
        is_default_before: wasDefault,
        is_default_after: wasDefault,
        error_code: 'DS_DEFAULT_SELECT_THREW',
        duration_ms: 0,
      });
    } finally {
      setBusyAction(null);
    }
  }

  function handleEditSystem(system: DesignSystemSummary): void {
    if (!onOpenSystem || busyAction) return;
    trackDesignSystemEditClick(analytics.track, {
      page_name: 'design_systems',
      area: 'design_system_edit',
      element: 'edit_with_agent',
      module: 'general',
      edit_surface: 'chat',
      artifact_kind: 'design_system',
      design_system_id: system.id,
      project_id: system.projectId ?? undefined,
      resource_scope: resourceScopeForSystem(system),
    });
    setBusyAction({ systemId: system.id, action: 'edit' });
    notifyActionLoading(t('dsManager.editWithAgent'));
    try {
      onOpenSystem(system.id);
      notifyAction('success', t('ds.actionDone'));
    } catch {
      notifyAction('error', t('ds.actionFailed'));
    } finally {
      setBusyAction(null);
    }
  }

  function trackCardClick(system: DesignSystemSummary): void {
    trackDesignSystemsTemplateCardClick(analytics.track, {
      page_name: 'design_systems',
      area: 'templates_card',
      element: 'templates_card',
      templates_id: system.id,
      templates_type: system.source ?? 'library',
      resource_scope: resourceScopeForSystem(system),
    });
  }

  function handleSelectSystem(system: DesignSystemSummary): void {
    setPreviewId(system.id);
    trackCardClick(system);
  }

  const scopeTabs = [
    { value: 'mine' as const, label: t('dsManager.yourSystems'), count: userSearched.length },
    ...(hasTeamWorkspace
      ? [{ value: 'team' as const, label: t('pluginsView.tab.team'), count: teamSearched.length }]
      : []),
    // #5517 ships three scopes only. The enterprise placeholder tab advertised a
    // surface that does not exist yet, so it leaves the row.
    { value: 'official' as const, label: t('dsManager.officialPresets'), count: queryScoped.length },
  ];

  const showPresetFilters = designSystemCollection === 'official';

  if (loading) {
    return (
      <>
      <header className={styles.pageHeader} data-testid="design-systems-page-header">
        <div className={styles.pageTitleBlock}>
          <h1 className={styles.pageTitle}>{t('entry.navDesignSystems')}</h1>
        </div>
        <div className={styles.headerTools} data-testid="design-systems-header-tools" aria-hidden>
          <div className={`${styles.searchWrap} ${styles.headerSearch}`} data-testid="design-systems-header-search">
            <SearchGlyph className={styles.searchIcon} />
            <SkeletonBlock className={`${styles.search} ${styles.skeletonSearchField}`} />
          </div>
          <SkeletonBlock className={styles.skeletonCreateButton} />
        </div>
      </header>
      <div
        className={styles.root}
        data-testid="design-systems-tab"
        data-loading="true"
        aria-busy="true"
      >
        <VisuallyHidden role="status">{t('designSystemPicker.loading')}</VisuallyHidden>
        <aside className={styles.sidebar} data-testid="design-systems-sidebar-skeleton">
          <div className={styles.scopes} aria-hidden>
            <SkeletonBlock className={`${styles.scopeChip} ${styles.skeletonScopeChipWide}`} />
            <SkeletonBlock className={`${styles.scopeChip} ${styles.skeletonScopeChip}`} />
            <SkeletonBlock className={`${styles.scopeChip} ${styles.skeletonScopeChipWide}`} />
          </div>

          <div className={styles.list} data-testid="design-systems-list" aria-hidden>
            {Array.from({ length: 7 }, (_, index) => (
              <div
                key={index}
                className={`${styles.item} ${index === 0 ? styles.skeletonRowActive : styles.skeletonRow}`}
                data-testid={`design-systems-loading-row-${index}`}
              >
                <span className={styles.itemThumb}>
                  <SkeletonBlock className={styles.skeletonThumb} />
                </span>
                <span className={styles.itemMeta}>
                  <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonLineTitle}`} />
                  <SkeletonBlock className={`${styles.skeletonLine} ${index % 3 === 0 ? styles.skeletonLineShort : styles.skeletonLineMedium}`} />
                </span>
                <SkeletonBlock className={styles.skeletonStatusDot} />
              </div>
            ))}
          </div>
        </aside>

        <section className={styles.preview} data-testid="design-systems-preview">
          <DesignSystemDetailSkeleton
            label={t('designSystemPicker.loadingPreview')}
            dataTestId="design-systems-preview-skeleton"
          />
        </section>
      </div>
      </>
    );
  }

  return (
    <>
      {actionToast ? (
        // Anchored to the entry shell's scroll pane (see
        // .design-systems-toast-anchor in styles/viewer/routines.css) instead
        // of the bare `.od-toast` viewport-fixed centering — otherwise the
        // toast centers on the full 100vw and drifts onto the design-system
        // preview's first card whenever the nav rail's width shifts the
        // content column right (recvqaZAbIdfz1).
        <div className="design-systems-toast-anchor">
          <Toast
            message={actionToast.message}
            tone={actionToast.tone}
            ttlMs={40000}
            role={actionToast.tone === 'error' ? 'alert' : 'status'}
            onDismiss={() => setActionToast(null)}
          />
        </div>
      ) : null}
      {/* #5517 page header: title left, create action right — the create
          button leaves the sidebar so the list column starts at the tabs. */}
      <header className={styles.pageHeader} data-testid="design-systems-page-header">
        <div className={styles.pageTitleBlock}>
          <h1 className={styles.pageTitle}>{t('entry.navDesignSystems')}</h1>
        </div>
        <div className={styles.headerTools} data-testid="design-systems-header-tools">
          {onCreate ? (
            <Button
              variant="primary"
              className={`${styles.newBtn} ${styles.headerCreate}`}
              onClick={() => {
                trackDesignSystemsTopClick(analytics.track, {
                  page_name: 'design_systems',
                  area: 'design_systems',
                  element: 'create',
                  resource_scope: 'personal',
                });
                onCreate();
              }}
              data-testid="design-systems-create"
            >
              <Icon name="plus" />
              {t('dsManager.createAction')}
            </Button>
          ) : null}
        </div>
      </header>
      <div className="ds-top-scopes" role="tablist" aria-label={t('dsManager.sourceAria')}>
        {scopeTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={designSystemCollection === tab.value}
            className={`ds-top-scope-chip${designSystemCollection === tab.value ? ' is-active' : ''}`}
            onClick={() => setDesignSystemCollection(tab.value)}
          >
            <span>{tab.label}</span>
            <span className="ds-top-scope-count" aria-hidden>{tab.count}</span>
          </button>
        ))}
        <div
          className={`${styles.searchWrap} ${styles.headerSearch}${searchExpanded || filter ? ` ${styles.headerSearchOpen}` : ''} ds-top-scopes__search`}
          data-testid="design-systems-header-search"
          onBlur={(event) => {
            if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
            if (!filter) setSearchExpanded(false);
          }}
        >
          <button
            type="button"
            className={styles.searchToggle}
            aria-label={t('ds.searchPlaceholder')}
            onClick={() => {
              setSearchExpanded(true);
              requestAnimationFrame(() => searchInputRef.current?.focus());
            }}
          >
            <SearchGlyph />
          </button>
          <input
            ref={searchInputRef}
            type="search"
            data-testid="design-systems-search"
            className={styles.search}
            tabIndex={searchExpanded || filter ? 0 : -1}
            placeholder={t('ds.searchPlaceholder')}
            value={filter}
            onFocus={() => {
              setSearchExpanded(true);
              if (searchTrackedRef.current) return;
              searchTrackedRef.current = true;
              trackDesignSystemsTopClick(analytics.track, {
                page_name: 'design_systems',
                area: 'design_systems',
                element: 'search_input',
              });
            }}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>
      <div className={styles.root} data-testid="design-systems-tab">
      <aside className={styles.sidebar}>
        {showPresetFilters ? (
          <div className={styles.presetFilters}>
            <div className={styles.surfaceRow} role="tablist" aria-label={t('ds.surfaceLabel')}>
              {/* Hide chips with no items in the active style/search filter, but
                  always keep "all" and the currently selected surface — otherwise a
                  transient search could remove the active chip and leave the list
                  filtered with no chip showing aria-selected. */}
              {SURFACE_PILLS.filter(
                (p) => p.value === surfaceFilter || p.value === 'all' || surfaceCounts[p.value] > 0,
              ).map((p) => (
                <button
                  key={p.value}
                  type="button"
                  role="tab"
                  aria-selected={surfaceFilter === p.value}
                  data-testid={`design-systems-surface-${p.value}`}
                  className={`${styles.surfacePill} ${surfaceFilter === p.value ? styles.surfacePillActive : ''}`}
                  onClick={() => {
                    trackDesignSystemsTopClick(analytics.track, {
                      page_name: 'design_systems',
                      area: 'design_systems',
                      element: 'filter_chip',
                      filter_name: p.value,
                    });
                    setSurfaceFilter(p.value);
                  }}
                >
                  {t(p.labelKey)}
                  <span className={`filter-pill-count ${styles.surfaceCount}`}>{surfaceCounts[p.value]}</span>
                </button>
              ))}
            </div>
            <select
              data-testid="design-systems-category-select"
              className={styles.categorySelect}
              value={category}
              onFocus={() => {
                if (categoryTrackedRef.current) return;
                categoryTrackedRef.current = true;
                trackDesignSystemsTopClick(analytics.track, {
                  page_name: 'design_systems',
                  area: 'design_systems',
                  element: 'search_dropdown',
                });
              }}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {renderCategory(c)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className={styles.list} data-testid="design-systems-list">
          {renderSidebarList()}
        </div>
      </aside>

      <section className={styles.preview} data-testid="design-systems-preview">
        {renderPreview()}
      </section>
      </div>
    </>
  );

  function renderSidebarList() {
    if (designSystemCollection === 'enterprise') {
      return (
        <div className={styles.sidebarEmpty}>
          <p className={styles.sidebarEmptyText}>{t('dsManager.enterpriseDsBody')}</p>
        </div>
      );
    }
    if (activeSystems.length === 0) {
      // `.root`'s grid always reserves a fixed 304px sidebar column (see
      // DesignSystemsTab.module.css) whether or not this list has content. An
      // empty `null` here leaves that column visibly blank, which reads as the
      // detail pane's centered empty-state card sitting off-axis rather than
      // page-centered. A short placeholder message gives the column real
      // content so the two-pane split still looks intentional.
      if (designSystemCollection === 'official') {
        return (
          <div className={styles.sidebarEmpty} data-testid="design-systems-empty">
            <p className={styles.sidebarEmptyText}>{t('ds.emptyNoMatch')}</p>
          </div>
        );
      }
      return (
        <div className={styles.sidebarEmpty}>
          <p className={styles.sidebarEmptyText}>{t('dsManager.emptyMine')}</p>
        </div>
      );
    }
    return activeSystems.map((system) => (
      <SystemRow
        key={system.id}
        system={system}
        resourceReadIdentity={resourceReadIdentity}
        active={system.id === previewId}
        isDefault={system.id === selectedId}
        subtitle={
          // User systems: prefer the scenario (summary), then the source link
          // (host, truncated by CSS), then the generic placeholder. Presets keep
          // their localized category, which already reads as their scenario.
          isUserSystem(system)
            ? (system.summary?.trim()
              || designSystemLogoHost(system)
              || t('brandDetail.designSystem'))
            : localizeDesignSystemCategory(locale, system.category || 'Uncategorized')
        }
        statusLabel={(system.status ?? 'draft') === 'published' ? t('dsManager.statusPublished') : t('dsManager.statusDraft')}
        onSelect={() => handleSelectSystem(system)}
      />
    ));
  }

  function renderPreview() {
    if (designSystemCollection === 'enterprise') {
      return (
        <ComingSoon
          title={t('dsManager.enterpriseDsTitle')}
          body={t('dsManager.enterpriseDsBody')}
          comingSoonLabel={t('dsManager.comingSoonBadge')}
        />
      );
    }

    if (selectedSystem) {
      return (
        <DesignSystemDetail
          key={selectedSystem.id}
          system={selectedSystem}
          workspaceContext={workspaceContext}
          resourceReadIdentity={resourceReadIdentity}
          isDefault={selectedSystem.id === selectedId}
          busy={busyId === selectedSystem.id}
          actionBusy={busyAction?.systemId === selectedSystem.id ? busyAction.action : null}
          t={t}
          onEdit={handleEditSystem}
          onMakeDefault={handleMakeDefaultClick}
          onTogglePublished={togglePublished}
          onDelete={deleteSystem}
          onSystemsRefresh={onSystemsRefresh}
          onActionFeedback={notifyAction}
          onShareToTeam={handleShareToTeam}
          isTeamShared={teamSharedIds.has(selectedSystem.id)}
          sharing={sharingId === selectedSystem.id}
          onUnshareFromTeam={handleUnshareFromTeam}
          canUnshareFromTeam={teamSharedMeta.get(selectedSystem.id)?.canUnshare === true}
          unsharing={unsharingId === selectedSystem.id}
        />
      );
    }

    // Empty scope — invite the relevant next action. The official scope only
    // runs dry behind a search, and the list column already says so, so this
    // pane stays a quiet placeholder instead of echoing that sentence.
    const emptyText = designSystemCollection === 'official' ? null : t('dsManager.emptyMine');
    const emptyTitle = designSystemCollection === 'mine'
      ? t('dsManager.createTitle')
      : null;
    return (
      <div className={styles.previewEmpty}>
        <span className={styles.previewEmptyMark} aria-hidden>
          <SparkGlyph />
        </span>
        {emptyTitle ? <p className={styles.previewEmptyTitle}>{emptyTitle}</p> : null}
        {emptyText ? <p className={styles.previewEmptyText}>{emptyText}</p> : null}
      </div>
    );
  }
}

function SkeletonBlock({
  className,
}: {
  className?: string;
}) {
  return <span className={`${styles.skeletonBlock}${className ? ` ${className}` : ''}`} aria-hidden />;
}

interface SystemRowProps {
  system: DesignSystemSummary;
  resourceReadIdentity: WorkspaceResourceReadIdentity | null;
  active: boolean;
  isDefault: boolean;
  subtitle: string;
  statusLabel: string;
  onSelect: () => void;
}

function fallbackSwatches(seed: string): string[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const base = h % 360;
  return [
    `hsl(${base}, 24%, 94%)`,
    `hsl(${(base + 90) % 360}, 34%, 74%)`,
    `hsl(${(base + 180) % 360}, 42%, 34%)`,
    `hsl(${(base + 28) % 360}, 76%, 54%)`,
  ];
}

function SystemRowPaletteLogo({ system }: { system: DesignSystemSummary }) {
  const swatches = system.swatches && system.swatches.length > 0
    ? system.swatches.slice(0, 4)
    : fallbackSwatches(system.title || system.id);
  return (
    <span className={styles.itemSwatches} aria-hidden>
      {swatches.map((color, index) => (
        <span key={`${color}-${index}`} style={{ background: color }} />
      ))}
    </span>
  );
}

// Resolve a system's own logo from its backing project's brand.json
// (`logo.primary`), exactly mirroring how the detail kit loads it via
// `useDesignKit`. The list row can't use `/api/brands/:id/logo` because the row
// only knows the *design-system* id, which differs from the brand id the brands
// route expects. Returns `undefined` while the fetch is in flight, `null` when
// the project has no logo, or the raw URL string.
function useProjectLogoSrc(
  projectId: string | undefined,
  resourceReadIdentity: WorkspaceResourceReadIdentity | null,
): string | null | undefined {
  const resourceReadIdentityKey = workspaceResourceReadIdentityKey(resourceReadIdentity);
  const resourceReadIdentityRef = useRef(resourceReadIdentity);
  resourceReadIdentityRef.current = resourceReadIdentity;
  const [src, setSrc] = useState<string | null | undefined>(projectId ? undefined : null);
  useEffect(() => {
    if (!projectId) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    const read = beginWorkspaceResourceScopedRead(resourceReadIdentityRef.current);
    setSrc(undefined);
    void fetchProjectFileText(projectId, 'brand.json', {
      cache: 'no-store',
      workspaceContext: read.context,
    }).then((raw) => {
      if (cancelled || !read.isStillCurrent(resourceReadIdentityRef.current)) return;
      let primary: string | null = null;
      if (raw) {
        try {
          const data = JSON.parse(raw) as { logo?: { primary?: unknown } };
          const candidate = data?.logo?.primary;
          if (typeof candidate === 'string' && candidate.trim()) primary = candidate.trim();
        } catch {
          // Not a valid brand.json (e.g. a non-brand "Create"d system) — no logo.
        }
      }
      setSrc(primary ? projectRawUrl(projectId, primary, read.context) : null);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, resourceReadIdentityKey]);
  return src;
}

// Row thumbnail. Prefer the system's real logo (resolved from the backing
// project's brand.json), then a site favicon (captured source URL, reference
// brand, or curated official-preset domain), falling back to the palette stripe
// when neither resolves. The palette also holds the slot while a user system's
// logo is still loading, so the thumbnail never flashes a broken image first.
function SystemRowLogo({
  system,
  resourceReadIdentity,
}: {
  system: DesignSystemSummary;
  resourceReadIdentity: WorkspaceResourceReadIdentity | null;
}) {
  const host = designSystemLogoHost(system);
  const projectLogo = useProjectLogoSrc(
    isUserSystem(system) ? system.projectId : undefined,
    resourceReadIdentity,
  );

  // Candidate srcs in priority order, skipping empties; `onError` advances to
  // the next, and exhausting them collapses to the palette stripe.
  const candidates = useMemo(() => {
    const list: string[] = [];
    if (typeof projectLogo === 'string') list.push(projectLogo);
    if (host) list.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`);
    return list;
  }, [projectLogo, host]);

  const [failedCount, setFailedCount] = useState(0);
  useEffect(() => setFailedCount(0), [candidates]);

  const resolving = projectLogo === undefined;
  const src = !resolving && failedCount < candidates.length ? candidates[failedCount] : null;

  if (!src) return <SystemRowPaletteLogo system={system} />;
  return (
    <img
      className={styles.itemLogo}
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailedCount((n) => n + 1)}
    />
  );
}

function SystemRow({
  system,
  resourceReadIdentity,
  active,
  isDefault,
  subtitle,
  statusLabel,
  onSelect,
}: SystemRowProps) {
  const { t } = useI18n();
  const status = system.status ?? 'draft';
  const isUser = isUserSystem(system);
  return (
    // The row chrome (padding, hover wash, selected outline) lives on
    // .itemRow/.itemRowActive in the shared module CSS — the #5517 reference
    // wraps the button in it, and rendering the bare button leaves every row
    // flat and the selection invisible (acceptance #97).
    <div className={`${styles.itemRow} ${active ? styles.itemRowActive : ''}`}>
    <button
      type="button"
      data-testid={`design-system-card-${system.id}`}
      className={`${styles.item} ${active ? styles.itemActive : ''}`}
      aria-pressed={active}
      onClick={onSelect}
    >
      <span className={styles.itemThumb}>
        <SystemRowLogo system={system} resourceReadIdentity={resourceReadIdentity} />
      </span>
      <span className={styles.itemMeta}>
        <span className={styles.itemNameRow}>
          <span className={styles.itemName}>{system.title}</span>
          {isDefault ? <span className={styles.badgeDefault}>{t('dsManager.badgeDefault')}</span> : null}
        </span>
        <span className={styles.itemSub}>{subtitle}</span>
      </span>
      {isUser ? (
        <span
          className={`${styles.statusDot} ${status === 'published' ? styles.statusDotPublished : styles.statusDotDraft}`}
          title={statusLabel}
          aria-label={statusLabel}
        />
      ) : null}
    </button>
    </div>
  );
}

interface DetailProps {
  system: DesignSystemSummary;
  /** Fully verified authority retained for every mutation in this pane. */
  workspaceContext: WorkspaceCollabContext | null;
  /** May be provisional, and is only used by read-only detail/project loads. */
  resourceReadIdentity: WorkspaceResourceReadIdentity | null;
  isDefault: boolean;
  busy: boolean;
  actionBusy: DesignSystemActionKind | null;
  t: ReturnType<typeof useI18n>['t'];
  onEdit?: (system: DesignSystemSummary) => void;
  onMakeDefault: (system: DesignSystemSummary) => void;
  onTogglePublished: (system: DesignSystemSummary) => void | Promise<void>;
  onDelete: (system: DesignSystemSummary) => void | Promise<void>;
  onSystemsRefresh?: () => Promise<void> | void;
  onActionFeedback: (tone: DesignKitActionFeedbackTone, message: string) => void;
  /** Share this personal design system into the team scope. */
  onShareToTeam?: (system: DesignSystemSummary) => void;
  /** Whether the system is already shared to the team. */
  isTeamShared?: boolean;
  /** Whether a share request for this system is in flight. */
  sharing?: boolean;
  /** Remove this design system from the team scope. */
  onUnshareFromTeam?: (system: DesignSystemSummary) => void;
  /** Whether the daemon reports the caller may unshare this system — only the
   *  original sharer, or a workspace owner/admin (see `canManageSharedResource`
   *  in `team-resource-share.ts`), so a member never sees an action the
   *  daemon would 403 on. */
  canUnshareFromTeam?: boolean;
  /** Whether an unshare request for this system is in flight. */
  unsharing?: boolean;
}

function DesignSystemDetail({
  system,
  workspaceContext,
  resourceReadIdentity,
  isDefault,
  busy,
  actionBusy,
  t,
  onEdit,
  onMakeDefault,
  onTogglePublished,
  onDelete,
  onSystemsRefresh,
  onActionFeedback,
  onShareToTeam,
  isTeamShared,
  sharing,
  onUnshareFromTeam,
  canUnshareFromTeam,
  unsharing,
}: DetailProps) {
  const analytics = useAnalytics();
  const resourceReadIdentityKey = workspaceResourceReadIdentityKey(resourceReadIdentity);
  const resourceReadIdentityRef = useRef(resourceReadIdentity);
  resourceReadIdentityRef.current = resourceReadIdentity;
  const resourceReadContext = resourceReadIdentity?.context ?? null;
  const detailWorkspaceDimensions = workspaceAnalyticsDimensions(workspaceContext);
  const isUser = isUserSystem(system);
  const detailResourceScope: TrackingWorkspaceScope =
    system.teamSynced || isTeamShared ? 'team' : isUser ? 'personal' : 'official';
  const status = system.status ?? 'draft';
  const published = status === 'published';
  // A built-in preset can always be picked as the global default; a user
  // system must be published first (mirrors the old "Make default" gate).
  const canBeDefault = !isUser || published;

  // Whether the caller may edit, publish/unpublish, or delete this design
  // system (recvqb6mfyqXLD: a plain member who merely has a teammate's shared
  // system synced locally saw a fully-live "Edit with agent" button, publish
  // toggle, and delete menu item — none of which the daemon actually meant
  // for them). `system.teamSynced` is set once, synchronously, when the
  // system is materialized from a team share (`markTeamSynced` in
  // server.ts) — false/absent for anything the caller authored, including a
  // system the caller themselves shared to the team. Only a teamSynced
  // system needs the finer-grained check, and it reuses the exact same
  // signal as "who can unshare" (`canUnshareFromTeam`, sourced from
  // `canManageSharedResource` in `team-resource-share.ts`: the original
  // sharer, or a workspace owner/admin). Defaulting to `!teamSynced` (rather
  // than to the async `isTeamShared`/`teamSharedMeta` read) keeps this safe
  // even before that metadata has loaded.
  const canManageTeamSynced = !system.teamSynced || canUnshareFromTeam === true;

  // The summary lacks the DESIGN.md body + packageInfo the kit needs, so fetch
  // the full detail. The kit view derives every module from brand.json (when a
  // backing project carries one) or the parsed DESIGN.md (presets).
  const [detail, setDetail] = useState<DesignSystemDetail | null>(null);
  const [detailResolved, setDetailResolved] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const lastSystemIdRef = useRef<string | null>(null);

  // The design-system project is the single source of truth. Re-read the full
  // detail whenever the selected `system` changes — that covers both a new
  // selection AND the parent refreshing the list after an edit anywhere (e.g.
  // the in-project Design System tab), since `onSystemsRefresh` replaces the
  // summary objects. A same-system refresh updates in place (no loading flash)
  // and bumps `reloadKey` so brand.json-derived modules (logo / images /
  // palette) re-read too.
  useEffect(() => {
    let cancelled = false;
    const read = beginWorkspaceResourceScopedRead(resourceReadIdentityRef.current);
    const isNewSelection = lastSystemIdRef.current !== system.id;
    lastSystemIdRef.current = system.id;
    if (isNewSelection) {
      setDetail(null);
      setDetailResolved(false);
      setDownloadFailed(false);
    } else {
      setReloadKey((k) => k + 1);
    }
    void fetchDesignSystem(system.id, read.context).then((d) => {
      if (cancelled || !read.isStillCurrent(resourceReadIdentityRef.current)) return;
      if (d) setDetail(d);
      setDetailResolved(true);
    }).catch(() => {
      if (!cancelled && read.isStillCurrent(resourceReadIdentityRef.current)) {
        setDetailResolved(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [system, resourceReadIdentityKey]);

  const host = designSystemLogoHost(system) || undefined;
  const projectId = detail?.projectId ?? system.projectId;

  // Direct in-panel DS edits (E3 / §3.6). All carry edit_surface=direct_module
  // + artifact_kind=design_system + the DS id so "edit depth" drills down.
  function emitEditClick(
    element: DesignSystemEditClickProps['element'],
    module: DesignSystemEditClickProps['module'],
  ) {
    trackDesignSystemEditClick(analytics.track, {
      page_name: 'design_systems',
      area: 'design_system_edit',
      element,
      module,
      edit_surface: 'direct_module',
      artifact_kind: 'design_system',
      design_system_id: system.id,
      project_id: projectId ?? undefined,
      resource_scope: detailResourceScope,
    });
  }
  const { kit } = useDesignKit({
    designSystemId: system.id,
    title: system.title,
    projectId,
    body: detail?.body,
    packageInfo: detail?.packageInfo,
    swatches: system.swatches,
    showcaseHtml: null,
    // Read-only is enforced by withholding the edit handlers below — not by
    // this flag. Keep user systems "editable" so their kit renders live from
    // the project (the SSOT / latest) rather than a stale published snapshot.
    editable: isUser,
    host,
    reloadKey,
    workspaceContext: resourceReadContext,
    workspaceReadGeneration: resourceReadIdentityKey,
  });

  async function handleDownload() {
    if (downloading) return;
    emitEditClick('download', 'general');
    setDownloading(true);
    setDownloadFailed(false);
    const startedAt = performance.now();
    onActionFeedback('loading', t('dsManager.downloadTitle'));
    try {
      const ok =
        await downloadDesignSystemArchive({
          designSystemId: system.id,
          fallbackTitle: system.title,
          workspaceContext,
        }) || (projectId
          ? await downloadProjectArchive({
              projectId,
              fallbackTitle: system.title,
              workspaceContext,
            })
          : false);
      setDownloadFailed(!ok);
      onActionFeedback(ok ? 'success' : 'error', ok ? t('ds.actionDone') : t('dsManager.downloadFailed'));
      trackWorkspaceResourceActionResult(analytics.track, {
        page_name: 'design_systems', area: 'workspace_resource', resource_kind: 'design_system',
        resource_scope: detailResourceScope, action: 'download_plugin',
        result: ok ? 'success' : 'failed', duration_ms: Math.round(performance.now() - startedAt),
        ...(!ok ? { error_code: 'download_failed' } : {}), ...detailWorkspaceDimensions,
      });
    } catch {
      setDownloadFailed(true);
      onActionFeedback('error', t('dsManager.downloadFailed'));
      trackWorkspaceResourceActionResult(analytics.track, {
        page_name: 'design_systems', area: 'workspace_resource', resource_kind: 'design_system',
        resource_scope: detailResourceScope, action: 'download_plugin', result: 'failed',
        duration_ms: Math.round(performance.now() - startedAt), error_code: 'download_failed',
        ...detailWorkspaceDimensions,
      });
    } finally {
      setDownloading(false);
    }
  }

  const badgeSlot = isDefault ? (
    <span className={styles.badgeDefault}>{t('dsManager.badgeDefault')}</span>
  ) : null;

  // Keep only the two primary actions on the bar — "Edit with agent" and the
  // publish toggle — and tuck the secondary actions (download / make-default /
  // delete) into a single ⋯ overflow so the toolbar reads clean (issue #5).
  const overflowActions: HeaderMenuAction[] = [
    // A design system that is ALREADY team-shared keeps this action visible
    // (issue: owner edits a logo/name/content and teammates never see the
    // update because the entry point vanished the moment `isTeamShared`
    // flipped true). `share()` itself is a plain "push the latest directory"
    // call — republishing an already-shared resource just overwrites the
    // hub's version with the current local one, so relabeling to "sync" is
    // the only UI change needed. Gated on `canManageTeamSynced` (same signal
    // as unshare/edit/delete below) rather than `isUser` alone: a plain
    // member merely viewing a teammate's pulled copy must not be able to
    // push THEIR local copy over the real owner's shared entry.
    ...(isUser && onShareToTeam && canManageTeamSynced
      ? [{
          id: 'share-to-team',
          label: isTeamShared ? t('dsManager.syncToTeam') : t('dsManager.shareToTeam'),
          icon: 'share' as const,
          onClick: () => onShareToTeam(system),
          disabled: busy || sharing,
          loading: sharing,
        }]
      : []),
    // Only the resource owner (or a workspace owner/admin) can unshare — the
    // daemon enforces this via `canManageSharedResource`; `canUnshareFromTeam`
    // mirrors that so the action never appears for a system a plain member
    // merely sees synced locally.
    ...(isUser && onUnshareFromTeam && isTeamShared && canUnshareFromTeam
      ? [{
          id: 'unshare-from-team',
          label: t('dsManager.unshareFromTeam'),
          icon: 'close' as const,
          onClick: () => onUnshareFromTeam(system),
          disabled: busy || unsharing,
          loading: unsharing,
        }]
      : []),
    ...(isUser
      ? [{
          id: 'download',
          label: t('dsManager.downloadTitle'),
          icon: 'download' as const,
          onClick: () => void handleDownload(),
          disabled: busy || downloading,
          loading: downloading,
        }]
      : []),
    ...(canBeDefault && !isDefault
      ? [{
          id: 'make-default',
          label: t('dsManager.makeDefault'),
          icon: 'star' as const,
          onClick: () => onMakeDefault(system),
          disabled: busy,
          loading: actionBusy === 'default',
        }]
      : []),
    // Delete is a destructive write on the shared resource itself — only the
    // original sharer or a workspace owner/admin gets the menu item at all
    // (see `canManageTeamSynced` above); a plain member with a synced copy
    // never sees it, matching the unshare gate.
    ...(isUser && canManageTeamSynced
      ? [{
          id: 'delete',
          label: t('dsManager.deleteSystemAria', { title: system.title }),
          icon: 'trash' as const,
          onClick: () => void onDelete(system),
          disabled: busy,
          loading: actionBusy === 'delete',
        }]
      : []),
  ];

  const actionsSlot = (
    <>
      {/* "Edit with agent" opens the authoring flow against the system's
          backing project — a real write surface, so it is fully hidden (not
          just disabled) for a teamSynced system the caller may not manage. */}
      {isUser && onEdit && canManageTeamSynced ? (
        <Button
          variant="primary"
          className={styles.actionButton}
          onClick={() => {
            emitEditClick('edit_with_agent', 'general');
            onEdit(system);
          }}
          disabled={busy}
          aria-busy={actionBusy === 'edit' || undefined}
          title={t('dsManager.openSystemAria', { title: system.title })}
        >
          <Icon name={actionBusy === 'edit' ? 'spinner' : 'sparkles'} />
          {t('dsManager.editWithAgent')}
        </Button>
      ) : null}
      {isUser ? (
        <button
          type="button"
          className={`${styles.statusToggle} ${published ? styles.statusToggleOn : ''}`}
          aria-pressed={published}
          aria-busy={actionBusy === 'publish' || undefined}
          onClick={() => void onTogglePublished(system)}
          // Published/draft status stays visible for a teamSynced system the
          // caller cannot manage (parity with how the sidebar status dot
          // reads for everyone) — only the toggle interaction is withheld,
          // per the same `canManageTeamSynced` gate as edit/delete.
          disabled={busy || !canManageTeamSynced}
          title={canManageTeamSynced ? undefined : t('dsManager.teamSyncedReadOnly')}
        >
          {actionBusy === 'publish' ? <Icon name="spinner" size={13} className={styles.statusToggleSpinner} /> : null}
          <span>{published ? t('dsManager.statusPublished') : t('dsManager.statusDraft')}</span>
          <span className={styles.statusToggleTrack} aria-hidden />
        </button>
      ) : null}
      {overflowActions.length > 0 ? (
        <HeaderActionsMenu groups={[overflowActions]} label={t('designs.menuMore')} />
      ) : null}
    </>
  );

  return (
    <div className={styles.detail} data-testid={`design-system-detail-${system.id}`}>
      {kit ? (
        <DesignKitView
          kit={kit}
          workspaceContext={resourceReadContext}
          workspaceReadGeneration={resourceReadIdentityKey}
          badgeSlot={badgeSlot}
          actionsSlot={actionsSlot}
          showCover={false}
          onEditClick={emitEditClick}
          noticeSlot={
            downloadFailed ? (
              <div className={styles.missingProjectNotice}>{t('dsManager.downloadFailed')}</div>
            ) : null
          }
          dataTestId={`design-kit-view-${system.id}`}
        />
      ) : (
        <DesignSystemDetailSkeleton
          label={detailResolved ? t('common.loading') : t('designSystemPicker.loadingPreview')}
          dataTestId={`design-system-detail-loading-${system.id}`}
        />
      )}
    </div>
  );
}

function DesignSystemDetailSkeleton({
  label,
  dataTestId,
}: {
  label: string;
  dataTestId: string;
}) {
  return (
    <div
      className={`${styles.detail} ${styles.detailSkeleton}`}
      role="status"
      aria-label={label}
      aria-busy="true"
      data-testid={dataTestId}
    >
      <header className={styles.skeletonHeader}>
        <div className={styles.skeletonHeaderCopy}>
          <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonHeroTitle}`} />
          <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonHeroSub}`} />
          <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonHeroMeta}`} />
        </div>
        <div className={styles.skeletonActions} aria-hidden>
          <SkeletonBlock className={styles.skeletonActionPrimary} />
          <SkeletonBlock className={styles.skeletonActionToggle} />
          <SkeletonBlock className={styles.skeletonActionIcon} />
        </div>
      </header>

      <section className={styles.skeletonModule}>
        <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonModuleKicker}`} />
        <div className={styles.skeletonParagraph}>
          <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonParagraphLine}`} />
          <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonParagraphLine}`} />
          <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonParagraphLineShort}`} />
          <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonParagraphLine}`} />
        </div>
      </section>

      <section className={styles.skeletonLogoModule}>
        <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonModuleKicker}`} />
        <div className={styles.skeletonLogoStage}>
          <SkeletonBlock className={styles.skeletonLogoMark} />
          <div className={styles.skeletonLogoText}>
            <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonLogoWord}`} />
            <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonLogoCaption}`} />
          </div>
        </div>
        <div className={styles.skeletonThumbRow} aria-hidden>
          {Array.from({ length: 6 }, (_, index) => (
            <SkeletonBlock
              key={index}
              className={`${styles.skeletonLogoThumb} ${index === 0 ? styles.skeletonLogoThumbActive : ''}`}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function ComingSoon({
  title,
  body,
  comingSoonLabel,
}: {
  title: string;
  body: string;
  comingSoonLabel: string;
}) {
  return (
    <div className={styles.previewEmpty}>
      <span className={styles.comingSoonBadge}>{comingSoonLabel}</span>
      <p className={styles.previewEmptyTitle}>{title}</p>
      <p className={styles.previewEmptyText}>{body}</p>
    </div>
  );
}

function SearchGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SparkGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden>
      <path
        d="M12 3l1.8 4.9L18.7 9.7 13.8 11.5 12 16.4 10.2 11.5 5.3 9.7l4.9-1.8z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

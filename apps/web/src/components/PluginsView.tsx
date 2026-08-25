import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from 'react';
import { createPortal } from 'react-dom';
import { Dialog } from '@open-design/components';
import {
  PLUGIN_SHARE_ACTION_PLUGIN_IDS,
  resolveLocalizedText,
  workspaceContextHasTeamIdentity,
  type ApplyResult,
  type InstalledPluginRecord,
  type PluginSourceKind,
  type SkillSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import {
  fetchSkills,
  importSkill,
  installSkill,
  uninstallSkill,
  type SkillImportInput,
  type SkillImportError,
} from '../providers/registry';
import { localizeSkillDescription, localizeSkillName } from '../i18n/content';
import type { Locale } from '../i18n/types';
import { useAnalytics } from '../analytics/provider';
import {
  trackPageView,
  trackPluginImportModalClick,
  trackPluginImportModalSurfaceView,
  trackPluginImportResult,
  trackPluginsAvailableTabClick,
  trackPluginsInstalledTabClick,
  trackPluginsSourcesTabClick,
  trackPluginsTemplatesDropdownClick,
  trackPluginsTopClick,
  trackExtensionMarketplaceClick,
  trackWorkspaceResourceActionResult,
} from '../analytics/events';
import {
  stableAnalyticsRequestErrorCode,
  workspaceAnalyticsDimensions,
} from '../analytics/workspace';
import type { TrackingWorkspaceScope } from '@open-design/contracts/analytics';
import {
  addPluginMarketplace,
  applyPlugin,
  duplicatePluginAsProject,
  installPluginSource,
  listPluginMarketplaces,
  listPlugins,
  refreshPluginMarketplace,
  removePluginMarketplace,
  resolvedWorkspaceContextForWrite,
  setPluginMarketplaceTrust,
  uninstallPlugin,
  workspaceProjectHeaders,
  type PluginInstallOutcome,
  type PluginShareAction,
  type PluginShareProjectOutcome,
  type PluginMarketplaceEntry,
  type PluginMarketplace,
  type PluginMarketplaceMutationOutcome,
  type PluginMarketplaceTrust,
  uploadPluginFolder,
  uploadPluginZip,
} from '../state/projects';
import { Icon } from './Icon';
import { Toast } from './Toast';
import { PluginDetailsModal } from './PluginDetailsModal';
import { SkillDetailView } from './SkillDetailView';
import { PluginsHomeSection } from './PluginsHomeSection';
import { humanizeCategory } from './SkillsSection';
import { buildCategoryCatalog, extractCategories } from './plugins-home/facets';
import { TrustBadge } from './TrustBadge';
import { useI18n } from '../i18n';
import { useDismissOnOutsideInteraction } from '../hooks/useDismissOnOutsideInteraction';
import { localizePluginDescription, localizePluginTitle } from './plugins-home/localization';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import type { PluginUseAction } from './plugins-home/useActions';
import { AnimatePresence } from 'motion/react';
import { navigate } from '../router';
import {
  beginWorkspaceScopedRead,
  currentWorkspaceAccountGeneration,
  useWorkspaceContext,
  workspaceIdentityCacheKey,
} from '../collab/useWorkspaceContext';
import {
  useWorkspaceInvalidation,
} from '../collab/workspace-events';
import { useWorkspaceSnapshotActivation } from '../collab/workspace-snapshot-activation';

type PluginsTab = 'installed' | 'available' | 'sources' | 'team';

type PluginWorkspaceReadMode = 'scoped' | 'headerless' | 'pending' | 'blocked';

const USER_SOURCE_KINDS = new Set<PluginSourceKind>([
  'user',
  'project',
  'marketplace',
  'github',
  'url',
  'local',
]);

function setsEqual<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

function sharedResourceMetaEqual(
  a: ReadonlyMap<string, SharedResourceCardMeta>,
  b: ReadonlyMap<string, SharedResourceCardMeta>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [key, next] of b) {
    const prev = a.get(key);
    if (!prev) return false;
    if (
      prev.title !== next.title ||
      prev.description !== next.description ||
      prev.canUnshare !== next.canUnshare ||
      prev.ownerMemberId !== next.ownerMemberId
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Whether a team-shared resource belongs in MY Personal tab — i.e. I personally
 * own it. Ownership is `ownerMemberId === myMemberId`, NOT `canUnshare`: a
 * workspace owner/admin can unshare anyone's shared resource, and a resource I
 * merely happen to have a local copy of (a shared fixture, a materialized team
 * resource) is not my personal one. Falls back to `canUnshare` only when the
 * owner id is unknown, so behavior degrades to the previous heuristic rather
 * than dropping a resource whose owner the hub did not report.
 */
export function sharedResourceIsMine(
  meta: SharedResourceCardMeta | undefined,
  myMemberId: string | null,
): boolean {
  if (meta?.ownerMemberId) return myMemberId != null && meta.ownerMemberId === myMemberId;
  return meta?.canUnshare === true;
}

function isPersonalPluginRecord(plugin: InstalledPluginRecord): boolean {
  if (!USER_SOURCE_KINDS.has(plugin.sourceKind)) return false;
  return !plugin.source.startsWith('team:plugin:');
}

// Mirrors `isPersonalPluginRecord` for skills: a skill materialized from a
// TEAMMATE's team share carries `teamSynced: true` (the puller-side marker
// `syncSharedTeamSkill`'s `markTeamSynced` stamps into `workspace_resources`,
// surfaced onto `SkillSummary` by `listSkills`'s workspace-scoped pass — never
// set on the sharer's own skill). Without this exclusion, unsharing a skill
// team-side made the puller's now-stale copy silently reappear in "Personal"
// — `source` reads `'user'` either way, so it was indistinguishable from a
// skill the caller authored themselves.
function isPersonalSkillRecord(skill: SkillSummary): boolean {
  return skill.source === 'user' && !skill.teamSynced;
}

const PLUGINS_TABS: ReadonlyArray<{
  id: PluginsTab;
}> = [
  { id: 'installed' },
  { id: 'available' },
  { id: 'sources' },
  { id: 'team' },
];

const PLUGIN_SHARE_DETAILS: Record<PluginShareAction, {
  eyebrow: string;
  fallbackTitle: string;
  fallbackDescription: string;
  confirmLabel: string;
  steps: string[];
}> = {
  'publish-github': {
    eyebrow: 'GitHub repository',
    fallbackTitle: 'Publish Plugin to GitHub',
    fallbackDescription:
      'Creates a public GitHub repository for this local OpenDesign plugin.',
    confirmLabel: 'Start publishing',
    steps: [
      'Create a new OpenDesign project for the publish workflow.',
      'Copy this plugin into that project as isolated source context.',
      'Run the official publish action plugin against the local daemon.',
    ],
  },
  'contribute-open-design': {
    eyebrow: 'OpenDesign pull request',
    fallbackTitle: 'Contribute Plugin to OpenDesign',
    fallbackDescription:
      'Opens a pull request that adds this plugin to the OpenDesign community catalog.',
    confirmLabel: 'Start contribution',
    steps: [
      'Create a new OpenDesign project for the contribution workflow.',
      'Copy this plugin into that project as isolated source context.',
      'Run the official contribution action plugin against the local daemon.',
    ],
  },
};

interface PluginsViewProps {
  onCreatePlugin?: (goal?: string) => void;
  onUsePlugin?: (record: InstalledPluginRecord, action: PluginUseAction) => void;
  onCreatePluginShareProject?: (
    pluginId: string,
    action: PluginShareAction,
    locale?: string,
  ) => Promise<PluginShareProjectOutcome>;
}

function resourceActionAnalyticsErrorCode(
  error: { code?: string; errorCode?: string; status?: number },
  fallback: string,
): string {
  return stableAnalyticsRequestErrorCode({
    code: error.errorCode ?? error.code,
    status: error.status,
  }, fallback);
}

export function PluginsView({
  onCreatePlugin,
  onUsePlugin,
  onCreatePluginShareProject,
}: PluginsViewProps) {
  const { locale, t } = useI18n();
  const analytics = useAnalytics();
  // Attaches the same workspace identity headers project reads already carry
  // (`workspaceProjectHeaders`), so the daemon's `GET /api/plugins` /
  // `POST /api/plugins/install` can apply the workspace-scoped filter and
  // stamp new installs with the acting workspace. `useWorkspaceContext` is a
  // coalesced read shared across the nav shell, so calling it again here does
  // not fan out an extra fetch.
  const pluginsWorkspaceContextState = useWorkspaceContext();
  const {
    context: pluginsWorkspaceContext,
    loading: pluginsWorkspaceContextLoading,
    identityChangePending: pluginsIdentityChangePending,
    failure: pluginsWorkspaceContextFailure,
  } = pluginsWorkspaceContextState;
  const pluginsContextRef = useRef(pluginsWorkspaceContext);
  pluginsContextRef.current = pluginsWorkspaceContext;
  const pluginsAccountGeneration = currentWorkspaceAccountGeneration();
  const pluginsReadMode: PluginWorkspaceReadMode = pluginsIdentityChangePending
    || (!pluginsWorkspaceContext && pluginsWorkspaceContextLoading)
    ? 'pending'
    : pluginsWorkspaceContext
      ? 'scoped'
      : pluginsWorkspaceContextFailure === 'unavailable'
        ? 'blocked'
        : 'headerless';
  const pluginsIdentity = JSON.stringify([
    pluginsAccountGeneration,
    workspaceIdentityCacheKey(pluginsWorkspaceContext),
    pluginsReadMode,
  ]);
  const pluginsIdentityRef = useRef(pluginsIdentity);
  pluginsIdentityRef.current = pluginsIdentity;
  const pluginsReadModeRef = useRef(pluginsReadMode);
  pluginsReadModeRef.current = pluginsReadMode;
  const pluginsPageViewFiredRef = useRef(false);
  useEffect(() => {
    if (pluginsPageViewFiredRef.current) return;
    pluginsPageViewFiredRef.current = true;
    trackPageView(analytics.track, { page_name: 'plugins' });
  }, [analytics.track]);
  const [plugins, setPlugins] = useState<InstalledPluginRecord[]>([]);
  const [allInstalledPlugins, setAllInstalledPlugins] = useState<InstalledPluginRecord[]>([]);
  const [marketplaces, setMarketplaces] = useState<PluginMarketplace[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedIdentity, setLoadedIdentity] = useState<string | null>(null);
  const pluginCatalogRequestGenerationRef = useRef(0);
  const [activeTab, setActiveTab] = useState<PluginsTab>('installed');
  const [importOpen, setImportOpen] = useState(false);
  const [pendingApplyId, setPendingApplyId] = useState<string | null>(null);
  const [pendingDuplicatePluginId, setPendingDuplicatePluginId] = useState<string | null>(null);
  const [pendingInstallEntry, setPendingInstallEntry] = useState<string | null>(null);
  const [pendingSourceAction, setPendingSourceAction] = useState<string | null>(null);
  const [pendingShareAction, setPendingShareAction] = useState<{
    pluginId: string;
    action: PluginShareAction;
  } | null>(null);
  const [activePlugin, setActivePlugin] = useState<{
    record: InstalledPluginRecord;
    result: ApplyResult;
  } | null>(null);
  const [detailsRecord, setDetailsRecord] = useState<InstalledPluginRecord | null>(null);
  const [availableDetails, setAvailableDetails] = useState<AvailableMarketplacePlugin | null>(null);
  const [shareConfirm, setShareConfirm] = useState<{
    sourceRecord: InstalledPluginRecord;
    action: PluginShareAction;
    actionRecord: InstalledPluginRecord | null;
  } | null>(null);
  const [notice, setNotice] = useState<PluginInstallOutcome | { ok: boolean; message: string } | null>(null);

  async function refresh() {
    const requestGeneration = ++pluginCatalogRequestGenerationRef.current;
    const issuedIdentity = pluginsIdentityRef.current;
    const issuedAccountGeneration = currentWorkspaceAccountGeneration();
    const issuedReadMode = pluginsReadModeRef.current;
    const isStillCurrent = () =>
      pluginCatalogRequestGenerationRef.current === requestGeneration
      && currentWorkspaceAccountGeneration() === issuedAccountGeneration
      && pluginsIdentityRef.current === issuedIdentity;
    if (issuedReadMode === 'pending' || issuedReadMode === 'blocked') {
      if (!isStillCurrent()) return;
      setPlugins([]);
      setAllInstalledPlugins([]);
      setMarketplaces([]);
      setLoadedIdentity(issuedIdentity);
      setLoading(issuedReadMode === 'pending');
      return;
    }
    const read = beginWorkspaceScopedRead(pluginsContextRef.current);
    setLoading(true);
    try {
      const [rows, allRows, catalogs] = await Promise.all([
        listPlugins({ workspaceContext: read.context }),
        listPlugins({ includeHidden: true, workspaceContext: read.context }),
        listPluginMarketplaces(),
      ]);
      if (!isStillCurrent() || !read.isStillCurrent(pluginsContextRef.current)) return;
      setPlugins(rows);
      setAllInstalledPlugins(allRows);
      setMarketplaces(catalogs);
      setLoadedIdentity(issuedIdentity);
      setLoading(false);
    } catch {
      if (!isStillCurrent() || !read.isStillCurrent(pluginsContextRef.current)) return;
      // A failed read for a new identity has no authority to keep rendering the
      // previous identity's installed catalog.
      setPlugins([]);
      setAllInstalledPlugins([]);
      setMarketplaces([]);
      setLoadedIdentity(issuedIdentity);
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    window.addEventListener('open-design:plugins-changed', refresh);
    return () => window.removeEventListener('open-design:plugins-changed', refresh);
    // Re-run on workspace switch (not just mount) so "installed" reflects the
    // newly active workspace's binding — see `pluginsWorkspaceContext` above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginsIdentity]);

  const catalogMatchesIdentity = loadedIdentity === pluginsIdentity;
  const visiblePlugins = catalogMatchesIdentity ? plugins : [];
  const visibleInstalledPlugins = catalogMatchesIdentity ? allInstalledPlugins : [];
  const visibleMarketplaces = catalogMatchesIdentity ? marketplaces : [];
  const visibleLoading = loading || !catalogMatchesIdentity;
  const userPlugins = useMemo(
    () => visiblePlugins.filter(isPersonalPluginRecord),
    [visiblePlugins],
  );
  const availablePlugins = useMemo(
    () => buildAvailablePlugins(visibleMarketplaces, visibleInstalledPlugins),
    [visibleMarketplaces, visibleInstalledPlugins],
  );

  async function finishImport(
    work: () => Promise<PluginInstallOutcome>,
    targetTab: PluginsTab = 'installed',
  ) {
    setNotice(null);
    const outcome = await work();
    setNotice(outcome);
    if (outcome.ok) {
      setImportOpen(false);
      await refresh();
      setActiveTab(targetTab);
    }
    return outcome;
  }

  async function handleUsePlugin(
    record: InstalledPluginRecord,
    action: PluginUseAction = 'use',
  ) {
    if (onUsePlugin) {
      setDetailsRecord(null);
      onUsePlugin(record, action);
      return;
    }
    setPendingApplyId(record.id);
    setNotice(null);
    const result = await applyPlugin(record.id, {
      locale,
      workspaceContext: pluginsContextRef.current,
    });
    setPendingApplyId(null);
    if (!result) {
      setNotice({
        ok: false,
        message: `Failed to apply ${record.title}. Make sure the daemon is reachable.`,
      });
      return;
    }
    setActivePlugin({ record, result });
    setDetailsRecord(null);
    setNotice({
      ok: true,
      message: `${record.title} is ready. Use it from Home with @ search or pick it from the gallery.`,
    });
  }

  async function handleDuplicatePlugin(record: InstalledPluginRecord) {
    setPendingDuplicatePluginId(record.id);
    setNotice(null);
    try {
      const result = await duplicatePluginAsProject(record.id, {
        name: localizePluginTitle(locale, record),
      }, resolvedWorkspaceContextForWrite(pluginsWorkspaceContextState));
      setDetailsRecord(null);
      navigate({
        kind: 'project',
        projectId: result.projectId,
        conversationId: result.conversationId,
        fileName: result.relPath,
      });
    } catch {
      setNotice({
        ok: false,
        message: t('pluginCard.duplicateFailed'),
      });
    } finally {
      setPendingDuplicatePluginId(null);
    }
  }

  async function handleCreatePluginShareTask(
    record: InstalledPluginRecord,
    action: PluginShareAction,
  ) {
    if (!onCreatePluginShareProject) {
      setNotice({
        ok: false,
        message: 'Plugin sharing is not available in this shell.',
      });
      setShareConfirm(null);
      return;
    }
    setPendingShareAction({ pluginId: record.id, action });
    setNotice(null);
    const outcome = await onCreatePluginShareProject(record.id, action, locale);
    setPendingShareAction(null);
    setShareConfirm(null);
    if (!outcome.ok) {
      setNotice({
        ok: false,
        message: outcome.message,
      });
    }
  }

  function requestPluginShareTask(
    record: InstalledPluginRecord,
    action: PluginShareAction,
  ) {
    const actionRecord =
      plugins.find((plugin) => plugin.id === PLUGIN_SHARE_ACTION_PLUGIN_IDS[action]) ?? null;
    setShareConfirm({ sourceRecord: record, action, actionRecord });
  }

  async function handleInstallAvailable(plugin: AvailableMarketplacePlugin) {
    setPendingInstallEntry(plugin.key);
    try {
      const outcome = await finishImport(
        () => installPluginSource(plugin.installSource ?? plugin.entry.name, pluginsWorkspaceContext),
        'installed',
      );
      if (outcome.ok) setAvailableDetails(null);
    } finally {
      setPendingInstallEntry(null);
    }
  }

  async function handleMarketplaceMutation(
    actionKey: string,
    work: () => Promise<PluginMarketplaceMutationOutcome>,
  ) {
    setPendingSourceAction(actionKey);
    setNotice(null);
    const outcome = await work();
    setPendingSourceAction(null);
    setNotice(outcome);
    if (outcome.ok) await refresh();
  }

  return (
    <section className="plugins-view" aria-labelledby="plugins-title">
      <header className="plugins-view__hero">
        <div>
          {/* #5517: a bare 扩展 heading — no kicker, no lede paragraph. */}
          <h1 id="plugins-title" className="entry-section__title">
            {t('entry.navPlugins')}
          </h1>
        </div>
        <div className="plugins-view__hero-actions">
          <button
            type="button"
            className="plugins-view__primary"
            onClick={() => {
              trackPluginsTopClick(analytics.track, {
                page_name: 'plugins',
                area: 'plugins',
                element: 'create_plugin',
              });
              onCreatePlugin?.();
            }}
            data-testid="plugins-create-button"
          >
            <Icon name="edit" size={14} />
            <span>{t('homeHero.chip.createPlugin')}</span>
          </button>
          <button
            type="button"
            className="plugins-view__secondary"
            onClick={() => {
              trackPluginsTopClick(analytics.track, {
                page_name: 'plugins',
                area: 'plugins',
                element: 'import_plugin',
              });
              setImportOpen(true);
            }}
            aria-haspopup="dialog"
            data-testid="plugins-import-button"
          >
            <Icon name="plus" size={14} />
            <span>{t('pluginsView.importPlugin')}</span>
          </button>
          <div className="plugins-view__badge" aria-hidden="true">
            <Icon name="grid" size={15} />
            <span>{t('pluginsView.agentContext')}</span>
          </div>
        </div>
      </header>

      <div className="plugins-view__stats" aria-label={t('pluginsView.summaryAria')}>
        <StatCard label={t('pluginsView.tab.installed')} value={userPlugins.length} />
        <StatCard label={t('pluginsView.tab.available')} value={availablePlugins.length} />
        <StatCard label={t('pluginsView.tab.sources')} value={marketplaces.length} />
      </div>

      <nav className="plugins-view__tabs" role="tablist" aria-label={t('pluginsView.areasAria')}>
        {PLUGINS_TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={[
                'plugins-view__tab',
                active ? ' is-active' : '',
              ]
                .filter(Boolean)
                .join('')}
              onClick={() => {
                trackPluginsTopClick(analytics.track, {
                  page_name: 'plugins',
                  area: 'plugins',
                  element: `${tab.id}_tab` as const,
                });
                setActiveTab(tab.id);
              }}
              data-testid={`plugins-tab-${tab.id}`}
            >
              <span className="plugins-view__tab-label">{pluginTabLabel(tab.id, t)}</span>
              <span className="plugins-view__tab-hint">{pluginTabHint(tab.id, t)}</span>
            </button>
          );
        })}
      </nav>

      {notice ? <Notice outcome={notice} /> : null}

      <div className="plugins-view__gallery">
        {visibleLoading ? <div className="plugins-view__empty">{t('pluginsView.loading')}</div> : null}

        {!visibleLoading && activeTab === 'installed' ? (
          <PluginsHomeSection
            plugins={userPlugins}
            workspaceContext={pluginsWorkspaceContext}
            loading={false}
            activePluginId={activePlugin?.record.id ?? null}
            pendingApplyId={pendingApplyId}
            pendingDuplicateId={pendingDuplicatePluginId}
            pendingShareAction={pendingShareAction}
            onUse={(record, action) => {
              trackPluginsInstalledTabClick(analytics.track, {
                page_name: 'plugins',
                area: 'installed_tab',
                element: action === 'use-with-query' ? 'templates_use_dropdown' : 'templates_use',
                template_id: record.id,
                template_type: record.sourceKind,
              });
              if (action === 'use-with-query') {
                trackPluginsTemplatesDropdownClick(analytics.track, {
                  page_name: 'plugins',
                  area: 'templates_dropdown',
                  element: 'use_with_query',
                  template_id: record.id,
                  template_type: record.sourceKind,
                });
              } else {
                trackPluginsTemplatesDropdownClick(analytics.track, {
                  page_name: 'plugins',
                  area: 'templates_dropdown',
                  element: 'use',
                  template_id: record.id,
                  template_type: record.sourceKind,
                });
              }
              void handleUsePlugin(record, action);
            }}
            onDuplicate={(record) => void handleDuplicatePlugin(record)}
            onOpenDetails={(record) => {
              trackPluginsInstalledTabClick(analytics.track, {
                page_name: 'plugins',
                area: 'installed_tab',
                element: 'templates_details',
                template_id: record.id,
                template_type: record.sourceKind,
              });
              setDetailsRecord(record);
            }}
            onPluginShareAction={(record, action) => {
              trackPluginsInstalledTabClick(analytics.track, {
                page_name: 'plugins',
                area: 'installed_tab',
                element: action === 'publish-github' ? 'templates_publish' : 'templates_contribute',
                template_id: record.id,
                template_type: record.sourceKind,
              });
              requestPluginShareTask(record, action);
            }}
            preferDefaultFacet={false}
            title={t('pluginsView.installedTitle')}
            subtitle={t('pluginsView.installedSubtitle')}
            emptyMessage={t('pluginsView.installedEmpty')}
          />
        ) : null}

        {!visibleLoading && activeTab === 'available' ? (
          <AvailablePluginsPanel
            plugins={availablePlugins}
            pendingKey={pendingInstallEntry}
            onOpenDetails={(plugin) => {
              trackPluginsAvailableTabClick(analytics.track, {
                page_name: 'plugins',
                area: 'available_tab',
                element: 'details',
                plugin_id: plugin.entry.name,
                plugin_type: plugin.marketplace.trust,
              });
              setAvailableDetails(plugin);
            }}
            onUseInstalled={(record) => {
              trackPluginsAvailableTabClick(analytics.track, {
                page_name: 'plugins',
                area: 'available_tab',
                element: 'install',
                plugin_id: record.sourceMarketplaceEntryName ?? record.id,
                plugin_type: record.marketplaceTrust ?? 'official',
              });
              void handleUsePlugin(record, 'use');
            }}
            onInstall={(plugin) => {
              trackPluginsAvailableTabClick(analytics.track, {
                page_name: 'plugins',
                area: 'available_tab',
                element: 'install',
                plugin_id: plugin.entry.name,
                plugin_type: plugin.marketplace.trust,
              });
              void handleInstallAvailable(plugin);
            }}
            onSearchInput={() =>
              trackPluginsAvailableTabClick(analytics.track, {
                page_name: 'plugins',
                area: 'available_tab',
                element: 'search_input',
              })
            }
            onSourceDropdown={() =>
              trackPluginsAvailableTabClick(analytics.track, {
                page_name: 'plugins',
                area: 'available_tab',
                element: 'source_dropdown',
              })
            }
            t={t}
          />
        ) : null}

        {!visibleLoading && activeTab === 'sources' ? (
          <SourcesPanel
            marketplaces={visibleMarketplaces}
            pendingAction={pendingSourceAction}
            onAdd={(url, trust) => {
              trackPluginsSourcesTabClick(analytics.track, {
                page_name: 'plugins',
                area: 'sources_tab',
                element: 'add_source',
              });
              void handleMarketplaceMutation('add', () => addPluginMarketplace({ url, trust }));
            }}
            onSourceUrlInput={() =>
              trackPluginsSourcesTabClick(analytics.track, {
                page_name: 'plugins',
                area: 'sources_tab',
                element: 'source_url_input',
              })
            }
            onRefresh={(marketplace) => {
              trackPluginsSourcesTabClick(analytics.track, {
                page_name: 'plugins',
                area: 'sources_tab',
                element: 'refresh',
              });
              void handleMarketplaceMutation(`refresh:${marketplace.id}`, () =>
                refreshPluginMarketplace(marketplace.id),
              );
            }}
            onRemove={(marketplace) => {
              trackPluginsSourcesTabClick(analytics.track, {
                page_name: 'plugins',
                area: 'sources_tab',
                element: 'remove',
              });
              void handleMarketplaceMutation(`remove:${marketplace.id}`, () =>
                removePluginMarketplace(marketplace.id),
              );
            }}
            onTrust={(marketplace, trust) =>
              void handleMarketplaceMutation(`trust:${marketplace.id}:${trust}`, () =>
                setPluginMarketplaceTrust(marketplace.id, trust),
              )
            }
            t={t}
          />
        ) : null}

        {activeTab === 'team' ? (
          <TeamPanel
            t={t}
            plugins={userPlugins}
            workspaceContext={pluginsWorkspaceContext}
            workspaceIdentity={pluginsIdentity}
            workspaceReadMode={pluginsReadMode}
          />
        ) : null}
      </div>

      <AnimatePresence>
        {detailsRecord ? (
        <PluginDetailsModal
          record={detailsRecord}
          workspaceContext={pluginsWorkspaceContext}
            onClose={() => setDetailsRecord(null)}
            onUse={(record, action) => void handleUsePlugin(record, action)}
            onDuplicate={(record) => void handleDuplicatePlugin(record)}
            isApplying={pendingApplyId === detailsRecord.id}
          />
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {availableDetails ? (
          <AvailablePluginDetailsModal
            plugin={availableDetails}
            pending={pendingInstallEntry === availableDetails.key}
            onClose={() => {
              if (pendingInstallEntry !== availableDetails.key) setAvailableDetails(null);
            }}
            onUseInstalled={(record) => void handleUsePlugin(record, 'use')}
            onInstall={(plugin) => void handleInstallAvailable(plugin)}
          />
        ) : null}
      </AnimatePresence>
      {shareConfirm ? (
        <PluginShareConfirmModal
          sourceRecord={shareConfirm.sourceRecord}
          action={shareConfirm.action}
          actionRecord={shareConfirm.actionRecord}
          pending={
            pendingShareAction?.pluginId === shareConfirm.sourceRecord.id &&
            pendingShareAction.action === shareConfirm.action
          }
          onClose={() => {
            if (!pendingShareAction) setShareConfirm(null);
          }}
          onConfirm={() =>
            void handleCreatePluginShareTask(
              shareConfirm.sourceRecord,
              shareConfirm.action,
            )
          }
        />
      ) : null}
      {importOpen ? (
        <PluginImportModal
          onClose={() => setImportOpen(false)}
          onInstallSource={(source) => finishImport(() => installPluginSource(source, pluginsWorkspaceContext))}
          onUploadZip={(file) => finishImport(() => uploadPluginZip(file))}
          onUploadFolder={(files) => finishImport(() => uploadPluginFolder(files))}
        />
      ) : null}
    </section>
  );
}

// ============================================================================
// ExtensionsMarketplace — the "扩展" surface.
//
// Faithfully mirrors the `PluginMarketplaceDemo` UX (专家套件/技能 top tabs, a
// 官方/团队/个人 scope filter, the `plugin-marketplace` card grid, and a
// share-to-team action) but every scope is wired to REAL daemon data instead
// of the demo's hardcoded catalog:
//
//   专家套件 (plugins)      技能 (skills)
//   ─────────────────────  ─────────────────────────────────
//   官方  → marketplace     官方  → fetchSkills() source!=='user'
//           registry list           (built-in skills)
//   团队  → GET /api/workspace/plugins/team   /skills/team  ({ ids })
//   个人  → listPlugins() user kinds   fetchSkills() source==='user'
//
// The share-to-team action uses POST /api/workspace/:kind/:id/share. Removing
// from the team uses DELETE on the same route, backed by Vela's resource owner
// permission gate.
// ============================================================================

type MarketMode = 'plugins' | 'skills';
type MarketScope = 'official' | 'team' | 'personal';

const MARKET_SCOPES: ReadonlyArray<{ id: MarketScope; labelKey: 'pluginsView.scope.official' | 'pluginsView.scope.team' | 'pluginsView.scope.personal' }> = [
  { id: 'official', labelKey: 'pluginsView.scope.official' },
  { id: 'team', labelKey: 'pluginsView.scope.team' },
  { id: 'personal', labelKey: 'pluginsView.scope.personal' },
];

// Stable card accents/initials so real resources (which don't carry a brand
// color) still read as the demo's colorful tile grid.
const MARKET_ACCENTS = [
  '#7c3aed', '#2563eb', '#16a34a', '#ea580c', '#db2777',
  '#0891b2', '#f59e0b', '#0f766e', '#dc2626', '#4f46e5',
];

function marketAccent(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return MARKET_ACCENTS[hash % MARKET_ACCENTS.length] ?? '#7c3aed';
}

function marketInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const first = words[0] ?? '';
  if (!first) return '··';
  const second = words[1];
  if (second) return `${first[0] ?? ''}${second[0] ?? ''}`.toUpperCase();
  return first.slice(0, 2).toUpperCase() || '··';
}

// Slug → display label for the curated plugin artifact taxonomy that the
// Community gallery already filters on (`plugins-home/facets.ts`). Built from
// the empty catalog because we only need the labels; per-scope counts are not
// shown on the extensions row.
const PLUGIN_CATEGORY_LABELS = new Map(
  buildCategoryCatalog([]).map((option) => [option.slug, option.label] as const),
);

/**
 * A suite's real content counts, read straight off its installed manifest:
 * `od.context.skills` is the skill list the suite bundles and
 * `od.connectors.required|optional` are the accounts it links. A catalog entry
 * that is not installed carries no manifest, so it gets no stats line at all —
 * an invented `0 skills · 0 connectors` would read as fact.
 */
function pluginCardStats(record: InstalledPluginRecord): MarketCardStats {
  const od = record.manifest?.od;
  return {
    skills: od?.context?.skills?.length ?? 0,
    connectors:
      (od?.connectors?.required?.length ?? 0) + (od?.connectors?.optional?.length ?? 0),
  };
}

/**
 * The one category a card belongs to, derived from real metadata: a plugin
 * resolves through the shared artifact-kind taxonomy, a skill through its own
 * `od.category` frontmatter slug. Anything we cannot classify stays
 * uncategorised and simply never appears under a category chip.
 */
function pluginCardCategory(record: InstalledPluginRecord): MarketCardCategory | null {
  const slug = extractCategories(record)[0];
  if (!slug) return null;
  return { slug, label: PLUGIN_CATEGORY_LABELS.get(slug) ?? humanizeCategory(slug) };
}

function skillCardCategory(skill: SkillSummary): MarketCardCategory | null {
  const slug = skill.category?.trim();
  if (!slug) return null;
  return { slug, label: humanizeCategory(slug) };
}

/**
 * A card's headline and its summary always resolve through the SAME locale.
 * A skill carries both halves — `displayName` from the `en_name` / `zh_name`
 * frontmatter and `descriptionI18n` from `en_description` / `zh_description`,
 * plus the built-in `skillCopy` translation tables in `i18n/content` — so
 * pairing a localized title with the raw frontmatter `description` is what
 * produced OPEND-2250's Chinese-title / English-summary card. The plugin
 * builder above already holds this invariant through `localizePluginTitle` +
 * `localizePluginDescription`; skills go through here for the same reason.
 */
function localizeSkillCardCopy(
  locale: Locale,
  skill: SkillSummary,
): { title: string; description: string } {
  return {
    title: localizeSkillName(locale, skill),
    description: localizeSkillDescription(locale, skill),
  };
}

type MarketCardAction =
  | { kind: 'try'; record: InstalledPluginRecord }
  | { kind: 'install'; plugin: AvailableMarketplacePlugin }
  // A skill's row action. Skills are not installed — using one hands the
  // composer a preselected skill, the same way the home skill picker does.
  | { kind: 'use-skill'; skill: SkillSummary }
  | { kind: 'none' };

/**
 * What clicking the card body opens. Every card that has a record behind it is
 * inspectable; a team card whose resource is not on this machine has nothing to
 * inspect, so it stays `null` and the row keeps its non-clickable affordance.
 */
type MarketCardDetail =
  | { kind: 'plugin'; record: InstalledPluginRecord }
  | { kind: 'available'; plugin: AvailableMarketplacePlugin }
  | { kind: 'skill'; skill: SkillSummary };

interface MarketCardStats {
  skills: number;
  connectors: number;
}

interface MarketCardCategory {
  slug: string;
  label: string;
}

interface SharedResourceCardMeta {
  id: string;
  title?: string;
  description?: string;
  canUnshare?: boolean;
  /**
   * The member who shared this resource to the team. This is the ownership
   * signal for the Personal tab: a workspace owner/admin can unshare anyone's
   * resource (so `canUnshare` is true for them), but that does not make it their
   * personal resource — only a matching `ownerMemberId` does.
   */
  ownerMemberId?: string;
}

interface MarketCard {
  id: string;
  title: string;
  description: string;
  accent: string;
  action: MarketCardAction;
  // what the card body opens when clicked; null when nothing local backs it
  detail: MarketCardDetail | null;
  // Present for a personal resource that is either not yet shared, or already
  // shared AND managed by the current caller (`canUnshare` true — the
  // original sharer or a workspace owner/admin). The button/menu label
  // switches between "share" and "sync" (see `card.isShared`) but both cases
  // call the same POST .../share route: it has no "already shared" guard, so
  // a repeat call just pushes the current local directory over the hub's
  // stale copy. Absent entirely for a teammate's pulled copy the caller may
  // not manage, so a plain member can never overwrite someone else's share.
  share: { kind: MarketMode; id: string } | null;
  // present for a resource currently in the team index
  unshare: { kind: MarketMode; id: string } | null;
  // present only for a resource the user actually owns on disk — a bundled
  // official plugin and a built-in skill ship with the app and are not the
  // user's to remove.
  uninstall: { kind: MarketMode; id: string } | null;
  // real content counts; null whenever no manifest backs the card
  stats: MarketCardStats | null;
  category: MarketCardCategory | null;
  isShared: boolean;
}

interface ExtensionsMarketplaceProps {
  /** EntryShell keeps this surface mounted while another nav view is visible. */
  isActive?: boolean;
  onCreatePlugin?: (goal?: string) => void;
  onUsePlugin?: (record: InstalledPluginRecord, action: PluginUseAction) => void;
  /**
   * Hands a skill to the home composer as the run's preselected skill — the
   * same destination the home skill picker reaches. Without it a skill card has
   * no way to actually run the skill.
   */
  onUseSkill?: (skill: SkillSummary) => void;
}

export function ExtensionsMarketplace({
  isActive = true,
  onCreatePlugin,
  onUsePlugin,
  onUseSkill,
}: ExtensionsMarketplaceProps) {
  const { locale, t } = useI18n();
  const analytics = useAnalytics();
  // My own member id, to keep the Personal tab to resources I actually own.
  const {
    context: workspaceContext,
    loading: workspaceContextLoading,
    failure: workspaceContextFailure,
  } = useWorkspaceContext();
  const workspaceDimensions = workspaceAnalyticsDimensions(workspaceContext);
  // The LATEST context, for `refresh()`'s commit guard. `refresh` is recreated
  // every render, but the mount effect below captures one closure — so the guard
  // must compare against a ref, not the captured prop, or it compares the
  // identity the read was issued for against itself and never fires.
  const emContextRef = useRef(workspaceContext);
  emContextRef.current = workspaceContext;
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const catalogStaleRef = useRef(false);
  const sharedResourcesStaleRef = useRef(false);
  const myMemberId = workspaceContext?.workspaceMemberId ?? null;
  // The 团队 scope is a team-workspace surface backed by the resource hub: it
  // lists the resources shared into the team and offers a share-to-team action.
  // Gate it on TEAM IDENTITY — the same predicate the daemon uses to accept a
  // hub share (workspaceContextHasTeamIdentity; see team-resource-share.ts) —
  // NOT on the billing plan. A team on a free/unpaid tier (trial, lapsed, or
  // billing not yet resolved) still has a real team resource plane with shared
  // resources; gating on the plan hid the scope from those teams even though the
  // daemon happily serves and shares their resources. Personal / signed-out
  // sessions have no team plane and correctly get no team pill.
  const hasTeamWorkspace = workspaceContextHasTeamIdentity(workspaceContext);
  const pageViewFiredRef = useRef(false);
  useEffect(() => {
    if (!isActive) return;
    if (pageViewFiredRef.current) return;
    pageViewFiredRef.current = true;
    trackPageView(analytics.track, { page_name: 'plugins' });
  }, [analytics.track, isActive]);

  const [mode, setMode] = useState<MarketMode>('plugins');
  // #5517 lands on the official catalog first — a new workspace's personal
  // scope is empty, and the official list is the marketplace's front door.
  const [scope, setScope] = useState<MarketScope>('official');
  function trackExtension(
    element: 'details' | 'use' | 'add' | 'create' | 'filter',
    input: {
      id?: string;
      kind?: 'expert_plugin' | 'skill';
      scope?: TrackingWorkspaceScope;
    } = {},
  ) {
    trackExtensionMarketplaceClick(analytics.track, {
      page_name: 'plugins',
      area: 'extension_marketplace',
      element,
      extension_kind: input.kind ?? (mode === 'plugins' ? 'expert_plugin' : 'skill'),
      resource_scope: input.scope ?? scope,
      ...(input.id ? { extension_key: input.id } : {}),
      ...workspaceDimensions,
    });
  }
  function trackResourceResult(input: {
    kind: 'expert_plugin' | 'skill';
    scope: TrackingWorkspaceScope;
    action: 'share_to_team' | 'sync_to_team' | 'remove_from_team' | 'add';
    result: 'success' | 'failed';
    startedAt: number;
    errorCode?: string;
  }) {
    trackWorkspaceResourceActionResult(analytics.track, {
      page_name: 'plugins',
      area: 'workspace_resource',
      resource_kind: input.kind,
      resource_scope: input.scope,
      action: input.action,
      result: input.result,
      duration_ms: Math.round(performance.now() - input.startedAt),
      ...(input.errorCode ? { error_code: input.errorCode } : {}),
      ...workspaceDimensions,
    });
  }
  useEffect(() => {
    if (scope === 'team' && !hasTeamWorkspace) setScope('official');
  }, [scope, hasTeamWorkspace]);
  const [query, setQuery] = useState('');
  // Selected category chip (`null` = 全部). Slugs come from the cards in scope.
  const [category, setCategory] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  // One ref for the whole list: only the open card renders a menu, so the wrap
  // that claims it is always the one the user could be pressing inside.
  const openMenuRef = useRef<HTMLSpanElement | null>(null);
  useDismissOnOutsideInteraction(menuId !== null, openMenuRef, () => {
    setMenuId(null);
    setConfirmUninstallId(null);
  });
  // Uninstall is destructive, so the menu item arms an inline confirmation
  // first instead of firing on the opening click.
  const [confirmUninstallId, setConfirmUninstallId] = useState<string | null>(null);

  const [plugins, setPlugins] = useState<InstalledPluginRecord[]>([]);
  const [allInstalledPlugins, setAllInstalledPlugins] = useState<InstalledPluginRecord[]>([]);
  const [marketplaces, setMarketplaces] = useState<PluginMarketplace[]>([]);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedMarketplaceIdentity, setLoadedMarketplaceIdentity] = useState<string | null>(null);
  const marketplaceCatalogRequestGenerationRef = useRef(0);
  const sharedResourcesRequestGenerationRef = useRef(0);

  const [sharedPluginIds, setSharedPluginIds] = useState<ReadonlySet<string>>(() => new Set());
  const [sharedSkillIds, setSharedSkillIds] = useState<ReadonlySet<string>>(() => new Set());
  const [sharedPluginMeta, setSharedPluginMeta] = useState<ReadonlyMap<string, SharedResourceCardMeta>>(() => new Map());
  const [sharedSkillMeta, setSharedSkillMeta] = useState<ReadonlyMap<string, SharedResourceCardMeta>>(() => new Map());
  const [loadedSharedIdentity, setLoadedSharedIdentity] = useState<string | null>(null);
  const loadedSharedIdentityRef = useRef(loadedSharedIdentity);
  loadedSharedIdentityRef.current = loadedSharedIdentity;
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [unsharingId, setUnsharingId] = useState<string | null>(null);
  const [uninstallingId, setUninstallingId] = useState<string | null>(null);
  // A Set, not a single key: the daemon-side lockfile write is now
  // serialized per-path (issue #109), so distinct plugins can install at
  // the same time without racing — each card only tracks its OWN pending
  // state and no longer blocks its neighbors.
  const [installingKeys, setInstallingKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  // The card the user drilled into. #5517's rows are click-to-inspect; the port
  // shipped them as inert markup, so no card in 扩展 opened anything (issue #129).
  const [cardDetail, setCardDetail] = useState<MarketCardDetail | null>(null);

  function openCardDetail(detail: MarketCardDetail | null) {
    if (!detail) return;
    trackExtension('details', {
      id:
        detail.kind === 'plugin'
          ? detail.record.id
          : detail.kind === 'skill'
            ? detail.skill.id
            : detail.plugin.key,
      kind: detail.kind === 'skill' ? 'skill' : 'expert_plugin',
    });
    setMenuId(null);
    setConfirmUninstallId(null);
    if (detail.kind === 'plugin') {
      navigate({ kind: 'marketplace-detail', pluginId: detail.record.id });
      return;
    }
    setCardDetail(detail);
  }

  // "新增" import dialog (ported verbatim from the demo's PluginMarketplaceDemo
  // create panel). The demo shipped a pure UI stub; here every action is wired
  // to the real daemon import path where one exists:
  //   Plugin · 从链接导入   → installPluginSource(url)
  //   Plugin · 上传本地文件夹 → uploadPluginFolder(files)
  //   Skill  · 上传本地文件夹 → importSkill(<SKILL.md body>)  (reads the folder)
  //   Skill  · 从链接导入   → installSkill(source)
  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<'plugin' | 'skill'>('plugin');
  const [createUrl, setCreateUrl] = useState('');
  const [createFolderFiles, setCreateFolderFiles] = useState<File[]>([]);
  const [createBusy, setCreateBusy] = useState<'import' | 'upload' | null>(null);
  const createFolderInputRef = useRef<HTMLInputElement>(null);

  function openCreateDialog() {
    trackExtension('add', {
      kind: mode === 'skills' ? 'skill' : 'expert_plugin',
      scope: 'personal',
    });
    setCreateKind(mode === 'skills' ? 'skill' : 'plugin');
    setCreateUrl('');
    setCreateFolderFiles([]);
    setCreateBusy(null);
    setCreateOpen(true);
  }

  function closeCreateDialog() {
    if (createBusy) return;
    setCreateOpen(false);
  }

  /**
   * Everything the import dialog can create lands in the user's own registry,
   * which only the 个人的 scope lists. The dialog can be opened from any
   * mode/scope (and its Plugin/Skill toggle is independent of the current
   * mode), so after a successful import the catalog behind it was routinely
   * showing a list the new resource is not part of — the import read as a
   * no-op (issue #132). Point the catalog at the tab that holds it.
   */
  function revealImported(kind: 'plugin' | 'skill') {
    setMode(kind === 'skill' ? 'skills' : 'plugins');
    setScope('personal');
    setQuery('');
    setCategory(null);
  }

  function switchCreateKind(next: 'plugin' | 'skill') {
    if (createBusy) return;
    setCreateKind(next);
    setCreateUrl('');
    setCreateFolderFiles([]);
  }

  async function handleCreateImportUrl() {
    const url = createUrl.trim();
    if (!url || createBusy || workspaceContextLoading) return;
    const startedAt = performance.now();
    const trackingKind = createKind === 'skill' ? 'skill' : 'expert_plugin';
    trackExtension('add', { kind: trackingKind, scope: 'personal' });
    if (createKind === 'skill') {
      setCreateBusy('import');
      try {
        const result = await installSkill({ source: url }, workspaceContext);
        if ('error' in result) {
          trackResourceResult({
            kind: 'skill', scope: 'personal', action: 'add', result: 'failed',
            startedAt,
            errorCode: resourceActionAnalyticsErrorCode(result.error, 'import_failed'),
          });
          setToast({ message: result.error.message || t('pluginsView.importFailed'), tone: 'error' });
          return;
        }
        await refresh();
        setCreateOpen(false);
        revealImported('skill');
        setToast({
          message: t('pluginsView.importSkillSuccess', {
            name: localizeSkillName(locale, result.skill),
          }),
          tone: 'success',
        });
        trackResourceResult({
          kind: 'skill', scope: 'personal', action: 'add', result: 'success', startedAt,
        });
      } finally {
        setCreateBusy(null);
      }
      return;
    }
    setCreateBusy('import');
    try {
      const outcome = await installPluginSource(url, workspaceContext);
      if (outcome.ok) {
        await refresh();
        setCreateOpen(false);
        revealImported('plugin');
        setToast({ message: t('pluginsView.importPluginSuccess'), tone: 'success' });
        trackResourceResult({
          kind: 'expert_plugin', scope: 'personal', action: 'add', result: 'success', startedAt,
        });
      } else {
        setToast({ message: outcome.message || t('pluginsView.importFailed'), tone: 'error' });
        trackResourceResult({
          kind: 'expert_plugin', scope: 'personal', action: 'add', result: 'failed',
          startedAt,
          errorCode: resourceActionAnalyticsErrorCode(outcome, 'import_failed'),
        });
      }
    } finally {
      setCreateBusy(null);
    }
  }

  async function handleCreateUploadFolder() {
    if (createFolderFiles.length === 0 || createBusy || workspaceContextLoading) return;
    const startedAt = performance.now();
    const trackingKind = createKind === 'skill' ? 'skill' : 'expert_plugin';
    trackExtension('add', { kind: trackingKind, scope: 'personal' });
    setCreateBusy('upload');
    try {
      if (createKind === 'plugin') {
        const outcome = await uploadPluginFolder(createFolderFiles);
        if (outcome.ok) {
          await refresh();
          setCreateOpen(false);
          revealImported('plugin');
          setToast({ message: t('pluginsView.uploadPluginSuccess'), tone: 'success' });
          trackResourceResult({
            kind: 'expert_plugin', scope: 'personal', action: 'add', result: 'success', startedAt,
          });
        } else {
          setToast({ message: outcome.message || t('pluginsView.uploadFailed'), tone: 'error' });
          trackResourceResult({
            kind: 'expert_plugin', scope: 'personal', action: 'add', result: 'failed',
            startedAt,
            errorCode: resourceActionAnalyticsErrorCode(outcome, 'upload_failed'),
          });
        }
        return;
      }
      // Skill: read SKILL.md out of the picked folder and import it through the
      // existing /api/skills/import endpoint (importSkill). Imports to the user
      // (个人的) registry; promoting to the team is the existing 转为团队共享 action.
      const input = await readSkillImportInputFromFolder(createFolderFiles, t);
      if ('error' in input) {
        trackResourceResult({
          kind: 'skill', scope: 'personal', action: 'add', result: 'failed',
          startedAt, errorCode: 'invalid_skill_folder',
        });
        setToast({ message: input.error.message, tone: 'error' });
        return;
      }
      // Stamp the imported skill with the acting workspace, same as the
      // plugin upload path just above — see `fetchSkills(workspaceContext)`
      // in `refresh()` below for the read-side counterpart.
      const result = await importSkill(input, workspaceContext);
      if ('error' in result) {
        trackResourceResult({
          kind: 'skill', scope: 'personal', action: 'add', result: 'failed',
          startedAt,
          errorCode: resourceActionAnalyticsErrorCode(result.error, 'import_failed'),
        });
        setToast({ message: result.error.message, tone: 'error' });
        return;
      }
      await refresh();
      setCreateOpen(false);
      revealImported('skill');
      setToast({
        message: t('pluginsView.importSkillSuccess', { name: localizeSkillName(locale, result.skill) }),
        tone: 'success',
      });
      trackResourceResult({
        kind: 'skill', scope: 'personal', action: 'add', result: 'success', startedAt,
      });
    } finally {
      setCreateBusy(null);
    }
  }

  async function refresh() {
    const requestGeneration = ++marketplaceCatalogRequestGenerationRef.current;
    if (
      marketplaceReadModeRef.current === 'pending'
      || marketplaceReadModeRef.current === 'blocked'
    ) return;
    const read = beginWorkspaceScopedRead(emContextRef.current);
    const accountGeneration = currentWorkspaceAccountGeneration();
    const issuedIdentity = JSON.stringify([
      accountGeneration,
      workspaceIdentityCacheKey(read.context),
      read.context ? 'scoped' : 'headerless',
    ]);
    setLoading(true);
    const [rows, allRows, catalogs, skillRows] = await Promise.all([
      listPlugins({ workspaceContext: read.context }),
      listPlugins({ includeHidden: true, workspaceContext: read.context }),
      listPluginMarketplaces(),
      // Carry the acting workspace so the daemon's `GET /api/skills` applies
      // its workspace-scoped filter — mirrors `listPlugins`'s
      // `workspaceContext` in `PluginsView` above (routes/plugins/index.ts's
      // `GET /api/plugins`).
      fetchSkills(read.context),
    ]);
    // Discard an answer for an identity the user has left. `setLoading(false)` is
    // deliberately skipped too: a stale response is not evidence that the CURRENT
    // identity's catalog has arrived, and the successor read the effect below
    // guarantees for every identity change owns clearing it.
    if (
      marketplaceCatalogRequestGenerationRef.current !== requestGeneration
      || currentWorkspaceAccountGeneration() !== accountGeneration
      || !read.isStillCurrent(emContextRef.current)
    ) return;
    setPlugins(rows);
    setAllInstalledPlugins(allRows);
    setMarketplaces(catalogs);
    setSkills(skillRows);
    setLoadedMarketplaceIdentity(issuedIdentity);
    setLoading(false);
  }

  // `open-design:plugins-changed` re-reads on mutation. Re-registered per
  // identity so the handler always closes over a current `refresh`.
  const marketplaceAccountGeneration = currentWorkspaceAccountGeneration();
  const marketplaceReadMode = workspaceContext
    ? 'scoped'
    : workspaceContextLoading
      ? 'pending'
      : workspaceContextFailure === 'unavailable'
        ? 'blocked'
        : 'headerless';
  const marketplaceIdentity = JSON.stringify([
    marketplaceAccountGeneration,
    workspaceIdentityCacheKey(workspaceContext),
    marketplaceReadMode,
  ]);
  const marketplaceIdentityRef = useRef(marketplaceIdentity);
  marketplaceIdentityRef.current = marketplaceIdentity;
  const marketplaceReadModeRef = useRef(marketplaceReadMode);
  marketplaceReadModeRef.current = marketplaceReadMode;
  useEffect(() => {
    const onPluginsChanged = () => {
      if (isActiveRef.current) void refresh();
      else catalogStaleRef.current = true;
    };
    window.addEventListener('open-design:plugins-changed', onPluginsChanged);
    return () => window.removeEventListener('open-design:plugins-changed', onPluginsChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketplaceIdentity]);

  // The initial read waits for the workspace context to SETTLE. This effect used
  // to have `[]` deps, which meant the mount closure ran with whatever context
  // existed on the first render — `null` on a cold open, since
  // `useWorkspaceContext` seeds from a module cache that a fresh load has not
  // filled yet. So the marketplace asked `GET /api/skills` headerless and the
  // daemon answered fail-closed, hiding every workspace-claimed skill; and
  // because the deps were empty, nothing ever re-read it for the real identity.
  //
  // Keyed on the identity digest and guarded by a ref, so a cold mount spends
  // exactly ONE read (once the context lands) rather than one per render, and a
  // later workspace switch spends exactly one more.
  const refreshedIdentityRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isActive) return;
    if (workspaceContextLoading) return;
    if (hasTeamWorkspace) return;
    if (
      refreshedIdentityRef.current === marketplaceIdentity
      && !catalogStaleRef.current
    ) return;
    catalogStaleRef.current = false;
    refreshedIdentityRef.current = marketplaceIdentity;
    if (marketplaceReadMode === 'blocked') {
      setPlugins([]);
      setAllInstalledPlugins([]);
      setMarketplaces([]);
      setSkills([]);
      setLoadedMarketplaceIdentity(marketplaceIdentity);
      setLoading(false);
      return;
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTeamWorkspace, isActive, workspaceContextLoading, marketplaceIdentity, marketplaceReadMode]);

  const refreshSharedResources = useCallback(async () => {
    const requestGeneration = ++sharedResourcesRequestGenerationRef.current;
    const read = beginWorkspaceScopedRead(emContextRef.current);
    const accountGeneration = currentWorkspaceAccountGeneration();
    const issuedIdentity = marketplaceIdentityRef.current;
    const hadCurrentSharedData = loadedSharedIdentityRef.current === issuedIdentity;
    const readIsStillCurrent = () =>
      sharedResourcesRequestGenerationRef.current === requestGeneration
      && currentWorkspaceAccountGeneration() === accountGeneration
      && marketplaceIdentityRef.current === issuedIdentity
      && read.isStillCurrent(emContextRef.current);
    if (!read.context || !workspaceContextHasTeamIdentity(read.context)) {
      if (!readIsStillCurrent()) return;
      setSharedPluginIds(new Set());
      setSharedSkillIds(new Set());
      setSharedPluginMeta(new Map());
      setSharedSkillMeta(new Map());
      setLoadedSharedIdentity(issuedIdentity);
      return;
    }
    const context = read.context;
    const loadShared = async (
      basePath: string,
      setter: Dispatch<SetStateAction<ReadonlySet<string>>>,
      metaSetter: Dispatch<SetStateAction<ReadonlyMap<string, SharedResourceCardMeta>>>,
    ): Promise<boolean> => {
      try {
        const res = await fetch(`/api/workspace/${basePath}/team`, {
          cache: 'no-store',
          headers: workspaceProjectHeaders(context),
        });
        if (!res.ok) return false;
        const body = (await res.json()) as { ids?: unknown; resources?: unknown };
        if (!readIsStillCurrent()) return false;
        if (Array.isArray(body.ids)) {
          const nextIds = new Set(body.ids.filter((id): id is string => typeof id === 'string'));
          setter((prev) => setsEqual(prev, nextIds) ? prev : nextIds);
        }
        if (Array.isArray(body.resources)) {
          const meta = new Map<string, SharedResourceCardMeta>();
          for (const resource of body.resources) {
            if (!resource || typeof resource !== 'object') continue;
            const record = resource as Record<string, unknown>;
            if (typeof record.id !== 'string') continue;
            meta.set(record.id, {
              id: record.id,
              ...(typeof record.title === 'string' && record.title.trim() ? { title: record.title } : {}),
              ...(typeof record.description === 'string' && record.description.trim()
                ? { description: record.description }
                : {}),
              ...(typeof record.canUnshare === 'boolean' ? { canUnshare: record.canUnshare } : {}),
              ...(typeof record.ownerMemberId === 'string' && record.ownerMemberId.trim()
                ? { ownerMemberId: record.ownerMemberId }
                : {}),
            });
          }
          metaSetter((prev) => sharedResourceMetaEqual(prev, meta) ? prev : meta);
        }
        return true;
      } catch {
        // Off-team / offline → keep the last known collection until the next
        // successful read, avoiding a flicker when the workspace proxy is slow.
        return false;
      }
    };
    const loaded = await Promise.all([
      loadShared('plugins', setSharedPluginIds, setSharedPluginMeta),
      loadShared('skills', setSharedSkillIds, setSharedSkillMeta),
    ]);
    if (!readIsStillCurrent()) return;
    if (!loaded.every(Boolean) && !hadCurrentSharedData) {
      // A last-good snapshot may be retained only for the identity that produced
      // it. A cold/new identity with an unavailable hub gets an empty safe view,
      // never the previous account/workspace's shared-resource membership.
      setSharedPluginIds(new Set());
      setSharedSkillIds(new Set());
      setSharedPluginMeta(new Map());
      setSharedSkillMeta(new Map());
    }
    setLoadedSharedIdentity(issuedIdentity);
  }, []);

  const handleMarketplaceStreamActive = useWorkspaceSnapshotActivation({
    enabled: isActive && hasTeamWorkspace,
    identity: marketplaceIdentity,
    refresh: () => {
      void refresh();
      void refreshSharedResources();
    },
  });

  useWorkspaceInvalidation(
    {
      'team-resources-changed': (payload) => {
        if (!isActiveRef.current) {
          if (payload.resourceKind === 'plugin') sharedResourcesStaleRef.current = true;
          if (payload.resourceKind === 'skill') {
            catalogStaleRef.current = true;
            sharedResourcesStaleRef.current = true;
          }
          return;
        }
        if (payload.resourceKind === 'plugin') {
          void refreshSharedResources();
          return;
        }
        if (payload.resourceKind === 'skill') {
          void Promise.all([refresh(), refreshSharedResources()]);
        }
      },
    },
    {
      workspaceContext: hasTeamWorkspace ? workspaceContext : null,
      enabled: hasTeamWorkspace,
      onActive: () => {
        if (!isActiveRef.current) {
          catalogStaleRef.current = true;
          sharedResourcesStaleRef.current = true;
          return;
        }
        catalogStaleRef.current = false;
        sharedResourcesStaleRef.current = false;
        handleMarketplaceStreamActive();
      },
    },
  );

  // Team-shared ids per kind. Off-team / offline just leaves the set empty so
  // the 团队 scope shows a clean empty state instead of erroring. Re-read while
  // the page is visible so owner/admin unshares in another client converge.
  useEffect(() => {
    if (!isActive) return;
    if (!hasTeamWorkspace) {
      sharedResourcesStaleRef.current = false;
      void refreshSharedResources();
    }
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshSharedResources();
    }, 10_000);
    return () => {
      window.clearInterval(interval);
    };
  }, [hasTeamWorkspace, isActive, refreshSharedResources, marketplaceIdentity]);

  const userPlugins = useMemo(
    () => plugins.filter(isPersonalPluginRecord),
    [plugins],
  );
  const availablePlugins = useMemo(
    () => buildAvailablePlugins(marketplaces, allInstalledPlugins),
    [marketplaces, allInstalledPlugins],
  );
  const userSkills = useMemo(() => skills.filter(isPersonalSkillRecord), [skills]);
  const officialSkills = useMemo(
    () => skills.filter((skill) => skill.source !== 'user'),
    [skills],
  );

  async function shareResource(kind: MarketMode, id: string, title: string) {
    if (sharingId || unsharingId) return;
    const context = emContextRef.current;
    if (!context || !workspaceContextHasTeamIdentity(context)) {
      setToast({ message: t('pluginsView.shareUnavailable', { title }), tone: 'error' });
      return;
    }
    // Same POST route promotes a not-yet-shared resource AND pushes an update
    // for one that is already shared (`share()` has no "already shared"
    // guard — see team-resource-share.ts). Only the toast copy distinguishes
    // the two so an owner who just edited and re-shared sees "synced", not a
    // confusing "shared" repeated on every subsequent push.
    const wasAlreadyShared = (kind === 'plugins' ? sharedPluginIds : sharedSkillIds).has(id);
    const startedAt = performance.now();
    setSharingId(id);
    setMenuId(null);
    const basePath = kind === 'plugins' ? 'plugins' : 'skills';
    try {
      const res = await fetch(`/api/workspace/${basePath}/${encodeURIComponent(id)}/share`, {
        method: 'POST',
        headers: workspaceProjectHeaders(context),
      });
      const body = (await res.json().catch(() => ({}))) as { shared?: boolean };
      if (res.ok && body.shared) {
        await refreshSharedResources();
        setToast({
          message: t(wasAlreadyShared ? 'pluginsView.syncSuccess' : 'pluginsView.shareSuccess', { title }),
          tone: 'success',
        });
        trackResourceResult({
          kind: kind === 'plugins' ? 'expert_plugin' : 'skill',
          scope: 'personal',
          action: wasAlreadyShared ? 'sync_to_team' : 'share_to_team',
          result: 'success',
          startedAt,
        });
      } else {
        setToast({
          message: t(wasAlreadyShared ? 'pluginsView.syncUnavailable' : 'pluginsView.shareUnavailable', { title }),
          tone: 'error',
        });
        trackResourceResult({
          kind: kind === 'plugins' ? 'expert_plugin' : 'skill',
          scope: 'personal',
          action: wasAlreadyShared ? 'sync_to_team' : 'share_to_team',
          result: 'failed',
          startedAt,
          errorCode: res.ok ? 'resource_not_shared' : `http_${res.status}`,
        });
      }
    } catch {
      setToast({
        message: t(wasAlreadyShared ? 'pluginsView.syncFailed' : 'pluginsView.shareFailed', { title }),
        tone: 'error',
      });
      trackResourceResult({
        kind: kind === 'plugins' ? 'expert_plugin' : 'skill',
        scope: 'personal',
        action: wasAlreadyShared ? 'sync_to_team' : 'share_to_team',
        result: 'failed',
        startedAt,
        errorCode: 'network_error',
      });
    } finally {
      setSharingId(null);
    }
  }

  async function unshareResource(kind: MarketMode, id: string, title: string) {
    if (sharingId || unsharingId) return;
    const context = emContextRef.current;
    if (!context || !workspaceContextHasTeamIdentity(context)) {
      setToast({ message: t('pluginsView.unshareUnavailable', { title }), tone: 'error' });
      return;
    }
    setUnsharingId(id);
    const startedAt = performance.now();
    setMenuId(null);
    const basePath = kind === 'plugins' ? 'plugins' : 'skills';
    try {
      const res = await fetch(`/api/workspace/${basePath}/${encodeURIComponent(id)}/share`, {
        method: 'DELETE',
        headers: workspaceProjectHeaders(context),
      });
      const body = (await res.json().catch(() => ({}))) as { unshared?: boolean };
      if (res.ok && body.unshared) {
        await refreshSharedResources();
        setToast({ message: t('pluginsView.unshareSuccess', { title }), tone: 'success' });
        trackResourceResult({
          kind: kind === 'plugins' ? 'expert_plugin' : 'skill',
          scope: 'team',
          action: 'remove_from_team',
          result: 'success',
          startedAt,
        });
      } else {
        setToast({ message: t('pluginsView.unshareUnavailable', { title }), tone: 'error' });
        trackResourceResult({
          kind: kind === 'plugins' ? 'expert_plugin' : 'skill',
          scope: 'team',
          action: 'remove_from_team',
          result: 'failed',
          startedAt,
          errorCode: res.ok ? 'resource_not_removed' : `http_${res.status}`,
        });
      }
    } catch {
      setToast({ message: t('pluginsView.unshareFailed', { title }), tone: 'error' });
      trackResourceResult({
        kind: kind === 'plugins' ? 'expert_plugin' : 'skill',
        scope: 'team',
        action: 'remove_from_team',
        result: 'failed',
        startedAt,
        errorCode: 'network_error',
      });
    } finally {
      setUnsharingId(null);
    }
  }

  // Removes a resource the user owns on disk. Only reachable for records the
  // card builder marked uninstallable (never a bundled plugin or a built-in
  // skill), and only after the inline confirmation has been armed.
  async function uninstallResource(kind: MarketMode, id: string, title: string) {
    if (uninstallingId || workspaceContextLoading) return;
    setUninstallingId(id);
    try {
      const ok =
        kind === 'plugins'
          ? await uninstallPlugin(id, workspaceContext)
          : 'ok' in (await uninstallSkill(id, workspaceContext));
      if (!ok) {
        setToast({ message: t('pluginsView.uninstallFailed', { title }), tone: 'error' });
        return;
      }
      await refresh();
      await refreshSharedResources();
      setMenuId(null);
      setConfirmUninstallId(null);
      setToast({ message: t('pluginsView.uninstallSuccess', { title }), tone: 'success' });
    } catch {
      setToast({ message: t('pluginsView.uninstallFailed', { title }), tone: 'error' });
    } finally {
      setUninstallingId(null);
    }
  }

  async function installAvailable(plugin: AvailableMarketplacePlugin, title: string) {
    if (installingKeys.has(plugin.key) || workspaceContextLoading) return;
    setInstallingKeys((prev) => new Set(prev).add(plugin.key));
    const startedAt = performance.now();
    try {
      const outcome = await installPluginSource(
        plugin.installSource ?? plugin.entry.name,
        workspaceContext,
      );
      if (outcome.ok) {
        await refresh();
        // The open detail modal holds the pre-install catalog entry, so leaving
        // it up would keep offering an Install for something already installed.
        setCardDetail((current) =>
          current?.kind === 'available' && current.plugin.key === plugin.key ? null : current,
        );
        setToast({ message: t('pluginsView.installSuccess', { title }), tone: 'success' });
        trackResourceResult({
          kind: 'expert_plugin',
          scope: 'official',
          action: 'add',
          result: 'success',
          startedAt,
        });
      } else {
        setToast({ message: outcome.message || t('pluginsView.installFailed', { title }), tone: 'error' });
        trackResourceResult({
          kind: 'expert_plugin',
          scope: 'official',
          action: 'add',
          result: 'failed',
          startedAt,
          errorCode: resourceActionAnalyticsErrorCode(outcome, 'install_failed'),
        });
      }
    } catch {
      trackResourceResult({
        kind: 'expert_plugin',
        scope: 'official',
        action: 'add',
        result: 'failed',
        startedAt,
        errorCode: 'network_error',
      });
    } finally {
      setInstallingKeys((prev) => {
        const next = new Set(prev);
        next.delete(plugin.key);
        return next;
      });
    }
  }

  const cards = useMemo<MarketCard[]>(() => {
    // Catalog rows are display data, never an authority witness. Keep the last
    // response in memory for its own identity, but do not render it during an
    // account/workspace transition before the successor read commits.
    if (loadedMarketplaceIdentity !== marketplaceIdentity) return [];
    if (scope !== 'official' && loadedSharedIdentity !== marketplaceIdentity) return [];
    const pluginRecordCard = (record: InstalledPluginRecord, personal: boolean): MarketCard => {
      const title = localizePluginTitle(locale, record);
      const shared = sharedPluginIds.has(record.id);
      const canUnshare = sharedPluginMeta.get(record.id)?.canUnshare === true;
      return {
        id: record.id,
        title,
        description: localizePluginDescription(locale, record) || '',
        accent: marketAccent(record.id),
        action: { kind: 'try', record },
        detail: { kind: 'plugin', record },
        // Keep the share affordance live after the first share (relabeled to
        // "sync" by `card.isShared`) so an owner can push a local edit to the
        // team without unsharing and resharing. Restricted to `canUnshare`
        // once shared — the same "who may manage this" gate `unshare` already
        // uses — so a plain member who merely has the plugin installed can't
        // overwrite the real owner's shared copy.
        share: personal && (!shared || canUnshare) ? { kind: 'plugins', id: record.id } : null,
        unshare: shared && canUnshare ? { kind: 'plugins', id: record.id } : null,
        uninstall:
          record.sourceKind === 'bundled' ? null : { kind: 'plugins', id: record.id },
        stats: pluginCardStats(record),
        category: pluginCardCategory(record),
        isShared: shared,
      };
    };
    const skillCard = (skill: SkillSummary, personal: boolean): MarketCard => {
      const { title, description } = localizeSkillCardCopy(locale, skill);
      const shared = sharedSkillIds.has(skill.id);
      const canUnshare = sharedSkillMeta.get(skill.id)?.canUnshare === true;
      return {
        id: skill.id,
        title,
        description,
        accent: marketAccent(skill.id),
        // #5517's skill row carries a "试一试" action just like a plugin row;
        // the port dropped it, which left every skill card with no way to use
        // the skill at all (issue #131).
        action: { kind: 'use-skill', skill },
        detail: { kind: 'skill', skill },
        // See the plugin card builder above: keep sharing live post-share
        // (relabeled "sync") for whoever may manage it, so a skill owner can
        // push local edits without unshare-then-reshare.
        share: personal && (!shared || canUnshare) ? { kind: 'skills', id: skill.id } : null,
        unshare: shared && canUnshare ? { kind: 'skills', id: skill.id } : null,
        uninstall: skill.source === 'user' ? { kind: 'skills', id: skill.id } : null,
        stats: null,
        category: skillCardCategory(skill),
        isShared: shared,
      };
    };

    if (mode === 'plugins') {
      if (scope === 'personal')
        return userPlugins
          // A locally-present plugin that is team-shared by someone ELSE is not
          // personal — it belongs in the Team tab only. Keep unshared plugins and
          // the ones I own.
          .filter(
            (record) =>
              !sharedPluginIds.has(record.id) ||
              sharedResourceIsMine(sharedPluginMeta.get(record.id), myMemberId),
          )
          .map((record) => pluginRecordCard(record, true));
      if (scope === 'official') {
        return availablePlugins.map((plugin) => {
          const title = availablePluginTitle(plugin.entry, locale);
          const installed = plugin.installedRecord ?? null;
          return {
            id: plugin.key,
            title,
            description: availablePluginDescription(plugin.entry, locale) || '',
            accent: marketAccent(plugin.entry.name),
            action: installed
              ? { kind: 'try', record: installed }
              : { kind: 'install', plugin },
            detail: installed
              ? { kind: 'plugin', record: installed }
              : { kind: 'available', plugin },
            share: null,
            unshare: null,
            // Official entries are bundled with the app — nothing for the user
            // to uninstall from here.
            uninstall: null,
            stats: installed ? pluginCardStats(installed) : null,
            category: installed ? pluginCardCategory(installed) : null,
            isShared: false,
          } satisfies MarketCard;
        });
      }
      // team
      return [...sharedPluginIds].map((id) => {
        const meta = sharedPluginMeta.get(id);
        const canUnshare = meta?.canUnshare === true;
        const record =
          allInstalledPlugins.find((plugin) => plugin.id === id) ??
          userPlugins.find((plugin) => plugin.id === id) ??
          null;
        const title = record ? localizePluginTitle(locale, record) : meta?.title || id;
        return {
          id,
          title,
          description: (record ? localizePluginDescription(locale, record) || '' : '') || meta?.description || '',
          accent: marketAccent(id),
          action: record ? { kind: 'try', record } : { kind: 'none' },
          detail: record ? { kind: 'plugin', record } : null,
          share: null,
          unshare: canUnshare ? { kind: 'plugins', id } : null,
          // Removing a team resource from your own disk is not the team action;
          // the Team tab only offers unshare.
          uninstall: null,
          stats: record ? pluginCardStats(record) : null,
          category: record ? pluginCardCategory(record) : null,
          isShared: true,
        } satisfies MarketCard;
      });
    }

    // skills
    if (scope === 'personal')
      return userSkills
        // A locally-present skill that is team-shared by someone ELSE (e.g. a
        // shared fixture both members have on disk) is not personal — it belongs
        // in the Team tab only. Keep unshared skills and the ones I own.
        .filter(
          (skill) =>
            !sharedSkillIds.has(skill.id) ||
            sharedResourceIsMine(sharedSkillMeta.get(skill.id), myMemberId),
        )
        .map((skill) => skillCard(skill, true));
    if (scope === 'official') return officialSkills.map((skill) => skillCard(skill, false));
    return [...sharedSkillIds].map((id) => {
      const meta = sharedSkillMeta.get(id);
      const canUnshare = meta?.canUnshare === true;
      const skill = skills.find((row) => row.id === id) ?? null;
      // A team-shared skill that is also on this machine resolves through the
      // same locale invariant as a local one; a shared row we have no local
      // copy of falls back to the share record, which carries no translations.
      const localized = skill ? localizeSkillCardCopy(locale, skill) : null;
      const title = localized?.title ?? (meta?.title || id);
      return {
        id,
        title,
        description: localized?.description || meta?.description || '',
        accent: marketAccent(id),
        action: skill ? { kind: 'use-skill', skill } : { kind: 'none' },
        detail: skill ? { kind: 'skill', skill } : null,
        share: null,
        unshare: canUnshare ? { kind: 'skills', id } : null,
        uninstall: null,
        stats: null,
        category: skill ? skillCardCategory(skill) : null,
        isShared: true,
      } satisfies MarketCard;
    });
  }, [
    mode,
    scope,
    locale,
    userPlugins,
    availablePlugins,
    sharedPluginIds,
    sharedPluginMeta,
    allInstalledPlugins,
    userSkills,
    officialSkills,
    sharedSkillIds,
    sharedSkillMeta,
    skills,
    myMemberId,
    loadedMarketplaceIdentity,
    marketplaceIdentity,
    loadedSharedIdentity,
  ]);

  // Category chips are built from the cards actually in this scope, so the row
  // never advertises a filter that would come back empty and never invents a
  // taxonomy the catalog does not carry.
  const categoryOptions = useMemo<MarketCardCategory[]>(() => {
    const seen = new Map<string, string>();
    for (const card of cards) {
      if (!card.category) continue;
      if (!seen.has(card.category.slug)) seen.set(card.category.slug, card.category.label);
    }
    return [...seen].map(([slug, label]) => ({ slug, label }));
  }, [cards]);

  // An armed uninstall confirmation belongs to one open menu; closing that menu
  // — by switching mode/scope or opening another card's — disarms it.
  useEffect(() => {
    if (confirmUninstallId && menuId !== confirmUninstallId) setConfirmUninstallId(null);
  }, [confirmUninstallId, menuId]);

  // Drop a selection the current scope/mode no longer offers.
  useEffect(() => {
    if (!category) return;
    if (categoryOptions.some((option) => option.slug === category)) return;
    setCategory(null);
  }, [category, categoryOptions]);

  const visibleCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((card) => {
      if (category && card.category?.slug !== category) return false;
      if (!q) return true;
      return `${card.title} ${card.description}`.toLowerCase().includes(q);
    });
  }, [cards, category, query]);
  const catalogLoading =
    loading
    || loadedMarketplaceIdentity !== marketplaceIdentity
    || (scope !== 'official' && loadedSharedIdentity !== marketplaceIdentity);

  if (cardDetail?.kind === 'skill') {
    const selectedSkill = cardDetail.skill;
    const closeSkillDetail = () => {
      setCardDetail(null);
      queueMicrotask(() => {
        const trigger = [...document.querySelectorAll<HTMLElement>(
          '.plugin-marketplace__item--skill[data-testid]',
        )].find((card) => card.dataset.testid === `plugins-card-${selectedSkill.id}`);
        trigger?.focus();
      });
    };
    return (
      <SkillDetailView
        skill={selectedSkill}
        author={
          scope === 'official'
            ? 'OpenDesign'
            : scope === 'team'
              ? 'Nexu Team'
              : t('chat.you')
        }
        onBack={closeSkillDetail}
        {...(onUseSkill
          ? {
            onUse: () => {
              trackExtension('use', {
                id: selectedSkill.id,
                kind: 'skill',
              });
              setCardDetail(null);
              onUseSkill(selectedSkill);
            },
          }
          : {})}
      />
    );
  }

  return (
    <section className="plugin-marketplace" aria-labelledby="plugin-marketplace-title">
      <header className="plugin-marketplace__hero">
        <div>
          {/* #5517: a bare 扩展 heading — no lede paragraph. */}
          <h1 id="plugin-marketplace-title" className="entry-section__title">
            {t('entry.navPlugins')}
          </h1>
        </div>
        {onCreatePlugin ? (
          <div className="plugin-marketplace__hero-actions">
            <button
              type="button"
              className="plugin-marketplace__create"
              onClick={openCreateDialog}
            >
              <Icon name="plus" size={15} />
              {t('pluginsView.create')}
            </button>
          </div>
        ) : null}
      </header>

      <div className="plugin-marketplace__toolbar">
        <div className="plugin-marketplace__switch" aria-label={t('pluginsView.marketplaceModeAria')}>
          <button
            type="button"
            className={mode === 'plugins' ? 'is-active' : ''}
            onClick={() => {
              trackExtension('filter', { kind: 'expert_plugin' });
              setMode('plugins');
              setMenuId(null);
              setConfirmUninstallId(null);
            }}
          >
            {t('pluginsView.kind.plugins')}
          </button>
          <button
            type="button"
            className={mode === 'skills' ? 'is-active' : ''}
            onClick={() => {
              trackExtension('filter', { kind: 'skill' });
              setMode('skills');
              setMenuId(null);
            }}
          >
            {t('pluginsView.kind.skills')}
          </button>
        </div>
      </div>

      {/* #5517 drops the mode-note lede line under the tabs. */}

      <div className="plugin-marketplace__filter-block">
        <div className="plugin-marketplace__filters" aria-label={t('pluginsView.marketplaceSourceFiltersAria')}>
          {MARKET_SCOPES.filter((item) => item.id !== 'team' || hasTeamWorkspace).map((item) => (
            <button
              key={item.id}
              type="button"
              className={scope === item.id ? 'is-active' : ''}
              {...(item.id === 'personal' ? { 'data-testid': 'plugins-tab-installed' } : {})}
              onClick={() => {
                trackExtension('filter', { scope: item.id });
                setScope(item.id);
                setMenuId(null);
              }}
            >
              {t(item.labelKey)}
            </button>
          ))}
          <label className="plugin-marketplace__search">
            <Icon name="search" size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={mode === 'plugins' ? t('pluginsView.searchPlugins') : t('pluginsView.searchSkills')}
              aria-label={mode === 'plugins' ? t('pluginsView.searchPlugins') : t('pluginsView.searchSkills')}
            />
          </label>
        </div>
        {categoryOptions.length > 0 ? (
          <div
            className="plugin-marketplace__category-tags"
            aria-label={t('pluginsView.categoriesAria')}
            data-testid="plugins-category-tags"
          >
            <button
              type="button"
              className={category === null ? 'is-active' : ''}
              onClick={() => setCategory(null)}
            >
              {t('common.all')}
            </button>
            {categoryOptions.map((option) => (
              <button
                key={option.slug}
                type="button"
                className={category === option.slug ? 'is-active' : ''}
                onClick={() => setCategory(option.slug)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="plugin-marketplace__catalog">
        {catalogLoading ? (
          <div className="plugin-marketplace__empty">
            <Icon name="spinner" size={18} />
            <strong>{t('pluginsView.loading')}</strong>
          </div>
        ) : visibleCards.length === 0 ? (
          <MarketEmptyState
            mode={mode}
            scope={scope}
            // A category chip narrows the list exactly like the search box, so
            // an empty result behind either one reads as "no match", not as an
            // empty scope.
            filtered={query.trim().length > 0 || category !== null}
            t={t}
          />
        ) : (
          <div className="plugin-marketplace__rows">
            {visibleCards.map((card) => {
              const busy =
                card.action.kind === 'install'
                  ? installingKeys.has(card.action.plugin.key)
                  : sharingId === card.id || unsharingId === card.id;
              const uninstalling = uninstallingId === card.id;
              // The row button carries the first available action; the overflow
              // menu lists only what it did not take. Sharing falls back into
              // the row slot when there is nothing to run or install, and must
              // not then be repeated in the menu.
              const rowHasRunOrInstall =
                (card.action.kind === 'try' && Boolean(onUsePlugin)) ||
                (card.action.kind === 'use-skill' && Boolean(onUseSkill)) ||
                card.action.kind === 'install';
              const menuActions = [
                ...(rowHasRunOrInstall && card.share ? (['share'] as const) : []),
                ...(rowHasRunOrInstall && card.unshare ? (['unshare'] as const) : []),
                ...(card.uninstall ? (['uninstall'] as const) : []),
              ];
              return (
                <article
                  key={card.id}
                  className={`plugin-marketplace__item${mode === 'skills' ? ' plugin-marketplace__item--skill' : ''}${card.detail ? ' is-clickable' : ''}`}
                  {...(card.detail
                    ? {
                      role: 'button',
                      tabIndex: 0,
                      'data-testid': `plugins-card-${card.id}`,
                      onClick: () => openCardDetail(card.detail),
                      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        openCardDetail(card.detail);
                      },
                    }
                    : {})}
                >
                  <div className="plugin-marketplace__row">
                    <span
                      className="plugin-marketplace__icon"
                      style={{ '--plugin-accent': card.accent } as CSSProperties}
                      aria-hidden
                    >
                      {marketInitials(card.title)}
                    </span>
                    <span className="plugin-marketplace__row-main">
                      <span className="plugin-marketplace__name-row">
                        <strong>{card.title}</strong>
                        {scope === 'personal' && card.isShared ? (
                          <span className="plugin-marketplace__team-badge">
                            <Icon name="users" size={11} />
                            {t('pluginsView.teamSharedBadge')}
                          </span>
                        ) : null}
                      </span>
                      {card.description ? <small>{card.description}</small> : null}
                      {card.stats ? (
                        <span className="plugin-marketplace__row-stats">
                          <span>{t('pluginsView.statSkills', { count: card.stats.skills })}</span>
                          <span>{t('pluginsView.statConnectors', { count: card.stats.connectors })}</span>
                        </span>
                      ) : null}
                    </span>

                    {card.action.kind === 'try' && onUsePlugin ? (
                      <button
                        type="button"
                        className="plugin-marketplace__row-action"
                        onClick={(event) => {
                          event.stopPropagation();
                          const action = card.action as { kind: 'try'; record: InstalledPluginRecord };
                          trackExtension('use', {
                            id: action.record.id,
                            kind: 'expert_plugin',
                          });
                          onUsePlugin(action.record, 'use');
                        }}
                      >
                        {t('pluginsView.tryIt')}
                      </button>
                    ) : card.action.kind === 'use-skill' && onUseSkill ? (
                      <button
                        type="button"
                        className="plugin-marketplace__row-action"
                        data-testid={`plugins-card-use-skill-${card.id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          const action = card.action as { kind: 'use-skill'; skill: SkillSummary };
                          trackExtension('use', {
                            id: action.skill.id,
                            kind: 'skill',
                          });
                          onUseSkill(action.skill);
                        }}
                      >
                        {t('pluginsView.tryIt')}
                      </button>
                    ) : card.action.kind === 'install' ? (
                      <button
                        type="button"
                        className="plugin-marketplace__row-action"
                        disabled={busy || workspaceContextLoading}
                        data-testid={`plugins-card-install-${card.id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          const action = card.action as { kind: 'install'; plugin: AvailableMarketplacePlugin };
                          trackExtension('add', {
                            id: action.plugin.key,
                            kind: 'expert_plugin',
                            scope: 'official',
                          });
                          void installAvailable(action.plugin, card.title);
                        }}
                      >
                        {busy
                          ? t('pluginsView.installing')
                          : t('pluginsView.install')}
                      </button>
                    ) : card.share ? (
                      <button
                        type="button"
                        className="plugin-marketplace__row-action"
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation();
                          const share = card.share!;
                          void shareResource(share.kind, share.id, card.title);
                        }}
                      >
                        {busy
                          ? t('pluginsView.sharing')
                          : card.isShared
                            ? t('pluginsView.syncToTeam')
                            : t('pluginsView.shareToTeam')}
                      </button>
                    ) : card.unshare ? (
                      <button
                        type="button"
                        className="plugin-marketplace__row-action"
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation();
                          const unshare = card.unshare!;
                          void unshareResource(unshare.kind, unshare.id, card.title);
                        }}
                      >
                        {busy ? t('pluginsView.unsharing') : t('pluginsView.unshareFromTeam')}
                      </button>
                    ) : null}

                    {menuActions.length > 0 ? (
                      <span
                        className="plugin-marketplace__menu-wrap"
                        ref={menuId === card.id ? openMenuRef : undefined}
                        // One guard for the whole overflow affordance: the more
                        // button and every menu item sit inside a card that is
                        // itself a button, and none of them should also open the
                        // detail modal.
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="plugin-marketplace__more"
                          onClick={() => {
                            setConfirmUninstallId(null);
                            setMenuId(menuId === card.id ? null : card.id);
                          }}
                          aria-expanded={menuId === card.id}
                          aria-label={t('pluginsView.moreActions', { title: card.title })}
                          data-testid={`plugins-card-more-${card.id}`}
                        >
                          <Icon name="more-horizontal" size={16} />
                        </button>
                        {menuId === card.id ? (
                          <span className="plugin-marketplace__menu" role="menu">
                            {menuActions.includes('share') ? (
                              <button
                                type="button"
                                role="menuitem"
                                disabled={busy}
                                onClick={() => {
                                  const share = card.share!;
                                  void shareResource(share.kind, share.id, card.title);
                                }}
                              >
                                <Icon name="users" size={14} />
                                {card.isShared ? t('pluginsView.syncToTeam') : t('pluginsView.shareToTeam')}
                              </button>
                            ) : null}
                            {menuActions.includes('unshare') ? (
                              <button
                                type="button"
                                role="menuitem"
                                disabled={busy}
                                onClick={() => {
                                  const unshare = card.unshare!;
                                  void unshareResource(unshare.kind, unshare.id, card.title);
                                }}
                              >
                                <Icon name="close" size={14} />
                                {t('pluginsView.unshareFromTeam')}
                              </button>
                            ) : null}
                            {menuActions.includes('uninstall') ? (
                              <button
                                type="button"
                                role="menuitem"
                                disabled={uninstalling || workspaceContextLoading}
                                onClick={() => {
                                  if (confirmUninstallId !== card.id) {
                                    setConfirmUninstallId(card.id);
                                    return;
                                  }
                                  const target = card.uninstall!;
                                  void uninstallResource(target.kind, target.id, card.title);
                                }}
                                data-testid={`plugins-card-uninstall-${card.id}`}
                              >
                                <Icon name="trash" size={14} />
                                {uninstalling
                                  ? t('pluginsView.uninstalling')
                                  : confirmUninstallId === card.id
                                    ? t('pluginsView.uninstallConfirm', { title: card.title })
                                    : t('pluginsView.uninstall')}
                              </button>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {cardDetail?.kind === 'plugin' ? (
          <PluginDetailsModal
            record={cardDetail.record}
            workspaceContext={workspaceContext}
            onClose={() => setCardDetail(null)}
            onUse={(record, action) => {
              setCardDetail(null);
              onUsePlugin?.(record, action);
            }}
            // The marketplace has no project to apply into; hide the Use action
            // when the shell did not hand us a handler for it.
            hideUseAction={!onUsePlugin}
          />
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {cardDetail?.kind === 'available' ? (
          <AvailablePluginDetailsModal
            plugin={cardDetail.plugin}
            pending={
              workspaceContextLoading
              || installingKeys.has(cardDetail.plugin.key)
            }
            onClose={() => {
              if (!installingKeys.has(cardDetail.plugin.key)) setCardDetail(null);
            }}
            onUseInstalled={(record) => {
              setCardDetail(null);
              onUsePlugin?.(record, 'use');
            }}
            onInstall={(plugin) => {
              void installAvailable(plugin, availablePluginTitle(plugin.entry, locale));
            }}
          />
        ) : null}
      </AnimatePresence>
      {createOpen ? (
        <div
          className="plugin-marketplace__modal-backdrop"
          role="presentation"
          onClick={closeCreateDialog}
        >
          <section
            className="plugin-marketplace__create-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plugin-create-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="plugin-marketplace__create-head">
              <div>
                <h2 id="plugin-create-title">
                  {t('pluginsView.createTitle', { kind: pluginKindLabel(createKind, t) })}
                </h2>
              </div>
              <button type="button" aria-label={t('pluginsView.createClose')} onClick={closeCreateDialog}>
                <Icon name="close" size={15} />
              </button>
            </header>
            <div className="plugin-marketplace__create-tabs" aria-label={t('pluginsView.createTypeAria')}>
              <button
                type="button"
                className={createKind === 'plugin' ? 'is-active' : ''}
                onClick={() => switchCreateKind('plugin')}
              >
                {t('pluginsView.createKindPlugin')}
              </button>
              <button
                type="button"
                className={createKind === 'skill' ? 'is-active' : ''}
                onClick={() => switchCreateKind('skill')}
              >
                {t('pluginsView.createKindSkill')}
              </button>
            </div>
            <div className="plugin-marketplace__create-options">
              {/* Authoring by describing what you want is the flow the home
                  composer is built around, and it had no reachable entry: the
                  button that called `onCreatePlugin` lives in a component
                  nothing mounts, so this dialog was import/upload only. */}
              {onCreatePlugin && createKind === 'plugin' ? (
                <article>
                  <div>
                    <h3>{t('pluginsView.createWithAgent')}</h3>
                    <p>{t('pluginsView.createWithAgentBody')}</p>
                    <button
                      type="button"
                      className="plugin-marketplace__create-primary"
                      disabled={createBusy !== null}
                      data-testid="plugin-create-with-agent"
                      onClick={() => {
                        trackExtension('create', {
                          kind: 'expert_plugin',
                          scope: 'personal',
                        });
                        closeCreateDialog();
                        onCreatePlugin();
                      }}
                    >
                      {t('pluginsView.createWithAgentAction')}
                    </button>
                  </div>
                </article>
              ) : null}
              <article>
                <div>
                  <h3>{t('pluginsView.importFromUrl')}</h3>
                  <p>{t('pluginsView.importUrlBody', { kind: pluginKindLabel(createKind, t) })}</p>
                  {/* Input and button sit side by side in one row, matching
                      the demo's `url-import-row` shape — not a labelled
                      block with the button stacked below it (issue #110's
                      original placement still applies: this row lives
                      inside the content column, not as a direct <article>
                      child). */}
                  <div className="plugin-marketplace__url-import-row">
                    <input
                      aria-label={t('pluginsView.importUrlLabel')}
                      value={createUrl}
                      onChange={(event) => setCreateUrl(event.target.value)}
                      disabled={createBusy !== null}
                      placeholder={
                        createKind === 'plugin'
                          ? 'https://github.com/owner/plugin-repo'
                          : 'https://github.com/owner/skill-repo'
                      }
                    />
                    <button
                      type="button"
                      data-testid="plugin-create-import-url"
                      disabled={
                        workspaceContextLoading
                        || createBusy !== null
                        || createUrl.trim().length === 0
                      }
                      onClick={() => void handleCreateImportUrl()}
                    >
                      {createBusy === 'import' ? t('pluginsView.importing') : t('pluginsView.importAndUpload')}
                    </button>
                  </div>
                </div>
              </article>
              <article>
                <div>
                  <h3>{t('pluginsView.uploadFolder')}</h3>
                  <p>
                    {t('pluginsView.uploadFolderBody', {
                      kind: pluginKindLabel(createKind, t),
                      manifest: createKind === 'plugin' ? 'open-design.json / SKILL.md' : 'SKILL.md',
                    })}
                  </p>
                  <input
                    ref={createFolderInputRef}
                    type="file"
                    multiple
                    disabled={createBusy !== null}
                    style={{ display: 'none' }}
                    {...{ webkitdirectory: '', directory: '' }}
                    onChange={(event) =>
                      setCreateFolderFiles(Array.from(event.currentTarget.files ?? []))
                    }
                  />
                  {/* Folder picker + upload on one row inside the card, the
                      demo's `folder-action-row` shape. The upload button as a
                      direct <article> child fell into the card grid's second
                      row and rendered dangling outside the card (issue #110). */}
                  <div className="plugin-marketplace__folder-action-row">
                    <button
                      type="button"
                      className="plugin-marketplace__folder-pick"
                      disabled={createBusy !== null}
                      onClick={() => createFolderInputRef.current?.click()}
                    >
                      <Icon name="folder" size={15} />
                      {createFolderFiles.length > 0
                        ? t('pluginsView.filesSelected', { count: createFolderFiles.length })
                        : t('pluginsView.chooseFolder')}
                    </button>
                    <button
                      type="button"
                      data-testid="plugin-create-upload-folder"
                      disabled={
                        workspaceContextLoading
                        || createBusy !== null
                        || createFolderFiles.length === 0
                      }
                      onClick={() => void handleCreateUploadFolder()}
                    >
                      {createBusy === 'upload'
                        ? t('pluginsView.uploading')
                        : t('pluginsView.uploadKind', { kind: pluginKindLabel(createKind, t) })}
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </div>
      ) : null}
      {toast ? (
        <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />
      ) : null}
    </section>
  );
}

// Reads a SKILL.md out of a webkitdirectory folder selection and shapes it into
// the /api/skills/import body. Best-effort YAML-frontmatter parse for name and
// description; the body is everything after the frontmatter block. Returns a
// tagged error (never throws) so the caller can surface a toast.
async function readSkillImportInputFromFolder(
  files: File[],
  t: ReturnType<typeof useI18n>['t'],
): Promise<SkillImportInput | { error: SkillImportError }> {
  const skillFile = files.find((file) =>
    /(^|\/)SKILL\.md$/i.test(file.webkitRelativePath || file.name),
  );
  if (!skillFile) {
    return { error: { message: t('pluginsView.skillMissingFile') } };
  }
  let text: string;
  try {
    text = await skillFile.text();
  } catch {
    return { error: { message: t('pluginsView.skillReadFailed') } };
  }
  const fallbackName = deriveSkillFolderName(skillFile);
  const { name, description, body } = parseSkillMarkdown(text, fallbackName);
  if (!name) {
    return { error: { message: t('pluginsView.skillMissingName') } };
  }
  if (!body.trim()) {
    return { error: { message: t('pluginsView.skillEmptyBody') } };
  }
  return { name, description, body, triggers: [] };
}

function deriveSkillFolderName(file: File): string {
  const rel = file.webkitRelativePath;
  if (rel && rel.includes('/')) return rel.split('/')[0] ?? '';
  return file.name.replace(/\.md$/i, '');
}

function parseSkillMarkdown(
  content: string,
  fallbackName: string,
): { name: string; description: string; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { name: fallbackName, description: '', body: content.trim() };
  }
  const block = match[1] ?? '';
  const body = content.slice(match[0].length).trim();
  const name = readSkillFrontmatterString(block, 'name') || fallbackName;
  const description = readSkillFrontmatterString(block, 'description');
  return { name, description, body };
}

function readSkillFrontmatterString(block: string, key: string): string {
  const lines = block.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const match = line.match(new RegExp(`^${key}:\\s*(.*)$`));
    if (!match) continue;
    const raw = (match[1] ?? '').trim();
    if (raw === '|' || raw === '>') {
      const collected: string[] = [];
      for (let next = index + 1; next < lines.length; next += 1) {
        const child = lines[next] ?? '';
        if (child.trim().length > 0 && !/^\s/.test(child)) break;
        collected.push(child);
      }
      const nonEmpty = collected.filter((child) => child.trim().length > 0);
      const minIndent = nonEmpty.reduce((min, child) => {
        const indent = child.match(/^\s*/)?.[0].length ?? 0;
        return Math.min(min, indent);
      }, Number.POSITIVE_INFINITY);
      const normalized = collected
        .map((child) => child.slice(Number.isFinite(minIndent) ? minIndent : 0))
        .join('\n')
        .trim();
      return raw === '>' ? normalized.replace(/\s*\n\s*/g, ' ').trim() : normalized;
    }
    return raw.replace(/^["']|["']$/g, '').trim();
  }
  return '';
}

function pluginKindLabel(kind: 'plugin' | 'skill', t: ReturnType<typeof useI18n>['t']): string {
  return kind === 'plugin' ? t('pluginsView.kind.plugins') : t('pluginsView.kind.skills');
}

function MarketEmptyState({
  mode,
  scope,
  filtered,
  t,
}: {
  mode: MarketMode;
  scope: MarketScope;
  filtered: boolean;
  t: ReturnType<typeof useI18n>['t'];
}) {
  let title: string;
  let hint: string;
  if (filtered) {
    title = t('pluginsView.emptyNoMatchTitle');
    hint = t('pluginsView.emptyNoMatchHint');
  } else if (scope === 'team') {
    title = t('pluginsView.emptyTeamTitle');
    hint = t('pluginsView.emptyTeamHint');
  } else if (scope === 'personal') {
    title = mode === 'plugins' ? t('pluginsView.emptyPersonalPluginsTitle') : t('pluginsView.emptyPersonalSkillsTitle');
    hint = t('pluginsView.emptyPersonalHint');
  } else {
    title = mode === 'plugins' ? t('pluginsView.emptyOfficialPluginsTitle') : t('pluginsView.emptyOfficialSkillsTitle');
    hint = t('pluginsView.emptyOfficialHint');
  }
  return (
    <div className="plugin-marketplace__empty">
      <Icon name="search" size={18} />
      <strong>{title}</strong>
      <span>{hint}</span>
    </div>
  );
}

function PluginShareConfirmModal({
  sourceRecord,
  action,
  actionRecord,
  pending,
  onClose,
  onConfirm,
}: {
  sourceRecord: InstalledPluginRecord;
  action: PluginShareAction;
  actionRecord: InstalledPluginRecord | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { locale, t } = useI18n();
  const details = PLUGIN_SHARE_DETAILS[action];
  const actionTitle = actionRecord ? localizePluginTitle(locale, actionRecord) : details.fallbackTitle;
  const actionDescription =
    (actionRecord ? localizePluginDescription(locale, actionRecord) : '') || details.fallbackDescription;
  const actionQuery = readLocalizedUseCaseQuery(actionRecord);
  const stagedPath = `plugin-source/${pluginShareSlug(sourceRecord.id)}`;

  return (
    <Dialog
      backdropClassName="plugin-details-modal-backdrop plugin-share-confirm"
      className="plugin-details-modal plugin-share-confirm__panel"
      includeChromeClassName={false}
      ariaLabel={`${actionTitle} for ${sourceRecord.title}`}
      onClose={pending ? undefined : onClose}
      data-testid="plugin-share-confirm-modal"
    >
        <header className="plugin-details-modal__head">
          <div className="plugin-details-modal__head-titles">
            <div className="plugin-details-modal__head-row">
              <h2 className="plugin-details-modal__title">{actionTitle}</h2>
              <TrustBadge trust="official" label={t('pluginsView.shareActionBadge')} />
            </div>
            <div className="plugin-details-modal__meta">
              <span>{details.eyebrow}</span>
              <span>· for {sourceRecord.title}</span>
              {actionRecord ? <span>· v{actionRecord.version}</span> : null}
            </div>
          </div>
          <button
            type="button"
            className="plugin-details-modal__close"
            onClick={onClose}
            disabled={pending}
            aria-label={t('pluginsView.shareCloseAria')}
            title={t('common.close')}
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="plugin-details-modal__body">
          <section className="plugin-details-modal__section">
            <div className="plugin-details-modal__section-head">
              <h3 className="plugin-details-modal__section-title">
                {t('pluginsView.shareWhatStarts')}
              </h3>
            </div>
            <p className="plugin-details-modal__description">
              {actionDescription}
            </p>
            <ol className="plugin-share-confirm__steps">
              {details.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>

          <section className="plugin-details-modal__section">
            <div className="plugin-details-modal__section-head">
              <h3 className="plugin-details-modal__section-title">
                {t('pluginsView.shareSourcePlugin')}
              </h3>
            </div>
            <dl className="plugin-share-confirm__facts">
              <div>
                <dt>{t('pluginsView.shareFactPlugin')}</dt>
                <dd>{sourceRecord.title}</dd>
              </div>
              <div>
                <dt>{t('pluginsView.shareFactId')}</dt>
                <dd>
                  <code>{sourceRecord.id}</code>
                </dd>
              </div>
              <div>
                <dt>{t('pluginsView.shareFactCopiedTo')}</dt>
                <dd>
                  <code>{stagedPath}</code>
                </dd>
              </div>
              <div>
                <dt>{t('pluginsView.shareFactTrust')}</dt>
                <dd>
                  <TrustBadge trust={sourceRecord.trust} />
                </dd>
              </div>
            </dl>
          </section>

          {actionQuery ? (
            <section className="plugin-details-modal__section">
              <div className="plugin-details-modal__section-head">
                <h3 className="plugin-details-modal__section-title">
                  {t('pluginsView.shareActionPrompt')}
                </h3>
              </div>
              <pre className="plugin-details-modal__query">{actionQuery}</pre>
            </section>
          ) : null}
        </div>

        <footer className="plugin-details-modal__foot">
          <button
            type="button"
            className="plugin-details-modal__secondary"
            onClick={onClose}
            disabled={pending}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="plugin-details-modal__primary"
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending ? 'true' : undefined}
            data-testid="plugin-share-confirm-start"
          >
            {pending ? t('pluginsView.shareStarting') : details.confirmLabel}
          </button>
        </footer>
    </Dialog>
  );
}

function readLocalizedUseCaseQuery(record: InstalledPluginRecord | null): string | null {
  const query = record?.manifest?.od?.useCase?.query;
  if (typeof query === 'string' && query.trim()) return query.trim();
  if (!query || typeof query !== 'object') return null;
  const dict = query as Record<string, unknown>;
  const preferred = dict.en ?? Object.values(dict).find((value) => typeof value === 'string');
  return typeof preferred === 'string' && preferred.trim() ? preferred.trim() : null;
}

function pluginShareSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/(^[-._]+|[-._]+$)/g, '') || 'open-design-plugin'
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="plugins-view__stat">
      <span className="plugins-view__stat-value">{value}</span>
      <span className="plugins-view__stat-label">{label}</span>
    </div>
  );
}

function pluginTabLabel(id: PluginsTab, t: ReturnType<typeof useI18n>['t']): string {
  switch (id) {
    case 'installed': return t('pluginsView.tab.installed');
    case 'available': return t('pluginsView.tab.available');
    case 'sources': return t('pluginsView.tab.sources');
    case 'team': return t('pluginsView.tab.team');
  }
}

function pluginTabHint(id: PluginsTab, t: ReturnType<typeof useI18n>['t']): string {
  switch (id) {
    case 'installed': return t('pluginsView.tabHint.installed');
    case 'available': return t('pluginsView.tabHint.available');
    case 'sources': return t('pluginsView.tabHint.sources');
    case 'team': return t('pluginsView.tabHint.team');
  }
}

function Notice({
  outcome,
}: {
  outcome: PluginInstallOutcome | { ok: boolean; message: string };
}) {
  const warnings = 'warnings' in outcome ? outcome.warnings : [];
  const log = 'log' in outcome ? outcome.log : [];
  return (
    <div className={`plugins-view__notice${outcome.ok ? ' is-success' : ' is-error'}`} role="status">
      <div>{outcome.message}</div>
      {warnings.length > 0 ? (
        <div className="plugins-view__notice-sub">
          {warnings.length} warning{warnings.length === 1 ? '' : 's'}
        </div>
      ) : null}
      {log.length > 0 ? (
        <details className="plugins-view__notice-log">
          <summary>Install log</summary>
          <ul>
            {log.map((line, idx) => (
              <li key={`${line}-${idx}`}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

interface AvailableMarketplacePlugin {
  key: string;
  marketplace: PluginMarketplace;
  entry: PluginMarketplaceEntry;
  installedRecord?: InstalledPluginRecord;
  installSource?: string;
}

interface AvailablePluginVersion {
  version: string;
  source?: string;
  ref?: string;
  dist?: {
    type?: string;
    archive?: string;
    integrity?: string;
    manifestDigest?: string;
  };
  integrity?: string;
  manifestDigest?: string;
  deprecated?: boolean | string;
  yanked?: boolean;
  yankedAt?: string;
  yankReason?: string;
}

function AvailablePluginsPanel({
  plugins,
  pendingKey,
  onOpenDetails,
  onUseInstalled,
  onInstall,
  onSearchInput,
  onSourceDropdown,
  t,
}: {
  plugins: AvailableMarketplacePlugin[];
  pendingKey: string | null;
  onOpenDetails: (plugin: AvailableMarketplacePlugin) => void;
  onUseInstalled: (record: InstalledPluginRecord) => void;
  onInstall: (plugin: AvailableMarketplacePlugin) => void;
  onSearchInput?: () => void;
  onSourceDropdown?: () => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const { locale } = useI18n();
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const searchTrackedRef = useRef(false);
  const sourceTrackedRef = useRef(false);
  const sourceOptions = useMemo(() => buildAvailableSourceOptions(plugins), [plugins]);
  const filteredPlugins = useMemo(
    () => filterAvailablePlugins(plugins, { query, sourceFilter }),
    [plugins, query, sourceFilter],
  );
  const filterActive = query.trim().length > 0 || sourceFilter !== 'all';

  return (
    <section className="plugins-view__section" aria-labelledby="plugins-available-title">
      <div className="plugins-view__section-head">
        <div>
          <h2 id="plugins-available-title">{t('pluginsView.availableTitle')}</h2>
          <p>{t('pluginsView.availableSubtitle')}</p>
        </div>
        <span className="plugins-view__section-count">
          {filteredPlugins.length === plugins.length
            ? plugins.length
            : `${filteredPlugins.length} of ${plugins.length}`}
        </span>
      </div>
      {plugins.length > 0 ? (
        <div className="plugins-view__available-controls" aria-label={t('pluginsView.availableFiltersAria')}>
          <div className="plugins-view__search">
            <Icon name="search" size={14} className="plugins-view__search-icon" />
            <input
              id="plugins-available-search"
              type="search"
              aria-label={t('pluginsView.searchAvailableAria')}
              value={query}
              onFocus={() => {
                if (searchTrackedRef.current) return;
                searchTrackedRef.current = true;
                onSearchInput?.();
              }}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('pluginsView.searchAvailablePlaceholder')}
            />
            {query ? (
              <button
                type="button"
                className="plugins-view__search-clear"
                onClick={() => setQuery('')}
                aria-label={t('pluginsView.clearAvailableSearch')}
                title={t('pluginsHome.clearSearch')}
              >
                <Icon name="close" size={14} />
              </button>
            ) : null}
          </div>
          <label className="plugins-view__filter" htmlFor="plugins-available-source">
            <span>{t('pluginsView.source')}</span>
            <select
              id="plugins-available-source"
              value={sourceFilter}
              onFocus={() => {
                if (sourceTrackedRef.current) return;
                sourceTrackedRef.current = true;
                onSourceDropdown?.();
              }}
              onChange={(event) => setSourceFilter(event.target.value)}
            >
              <option value="all">{t('promptTemplates.allSources')}</option>
              {sourceOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {plugins.length === 0 ? (
        <div className="plugins-view__empty">
          {t('pluginsView.availableEmptyInstalled')}
        </div>
      ) : filteredPlugins.length === 0 ? (
        <div className="plugins-view__empty">
          {filterActive
            ? t('pluginsView.availableEmptyFiltered')
            : t('pluginsView.availableEmptyNoSources')}
        </div>
      ) : (
        <div className="plugins-view__available-list">
          {filteredPlugins.map((plugin) => {
            const title = availablePluginTitle(plugin.entry, locale);
            const installedRecord = plugin.installedRecord ?? null;
            const description = availablePluginDescription(plugin.entry, locale);
            return (
              <article key={plugin.key} className="plugins-view__available-card">
                <div className="plugins-view__available-main">
                  <div className="plugins-view__row-title">
                    <span>{title}</span>
                    <TrustBadge trust={plugin.marketplace.trust} />
                  </div>
                  {description ? <p>{description}</p> : null}
                  <div className="plugins-view__meta">
                    <span>{plugin.entry.name}</span>
                    {plugin.entry.version ? <span>v{plugin.entry.version}</span> : null}
                    <span>{plugin.marketplace.manifest.name ?? plugin.marketplace.url}</span>
                    {plugin.entry.tags?.slice(0, 3).map((tag) => (
                      <span key={`${plugin.key}:${tag}`}>{tag}</span>
                    ))}
                  </div>
                </div>
                <div className="plugins-view__row-actions">
                  <button
                    type="button"
                    className="plugins-view__secondary"
                    onClick={() => onOpenDetails(plugin)}
                    data-testid={`plugins-available-details-${plugin.entry.name}`}
                  >
                    {t('homeHero.details')}
                  </button>
                  <button
                    type="button"
                    className="plugins-view__primary"
                    onClick={() =>
                      installedRecord
                        ? onUseInstalled(installedRecord)
                        : onInstall(plugin)
                    }
                    disabled={!installedRecord && pendingKey === plugin.key}
                    data-testid={`plugins-available-install-${plugin.entry.name}`}
                  >
                    {installedRecord
                      ? t('pluginCard.use')
                      : pendingKey === plugin.key
                        ? t('pluginsView.installing')
                        : t('pluginsView.install')}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AvailablePluginDetailsModal({
  plugin,
  pending,
  onClose,
  onUseInstalled,
  onInstall,
}: {
  plugin: AvailableMarketplacePlugin;
  pending: boolean;
  onClose: () => void;
  onUseInstalled: (record: InstalledPluginRecord) => void;
  onInstall: (plugin: AvailableMarketplacePlugin) => void;
}) {
  const { locale, t } = useI18n();
  const versions = useMemo(() => availablePluginVersions(plugin.entry), [plugin.entry]);
  const [selectedVersion, setSelectedVersion] = useState(
    () => versions[0]?.version ?? plugin.entry.version ?? 'latest',
  );
  const [copiedInstall, setCopiedInstall] = useState(false);
  const selectedVersionInfo =
    versions.find((version) => version.version === selectedVersion) ?? versions[0] ?? null;
  const title = availablePluginTitle(plugin.entry, locale);
  const sourceName = plugin.marketplace.manifest.name ?? plugin.marketplace.url;
  const publisher = plugin.entry.publisher;
  const publisherLabel =
    publisher?.id ?? publisher?.github ?? publisher?.url ?? null;
  const tags = plugin.entry.tags ?? [];
  const capabilitySummary = plugin.entry.capabilitiesSummary ?? [];
  const permissions = plugin.entry.permissions ?? [];
  const installCommand = buildAvailableInstallCommand(plugin.entry, selectedVersion);
  const selectedRef = selectedVersionInfo?.ref ?? null;
  const selectedIntegrity =
    selectedVersionInfo?.integrity ?? selectedVersionInfo?.dist?.integrity ?? null;
  const provenance = buildAvailablePluginProvenance({
    plugin,
    sourceName,
    version: selectedVersionInfo,
    t,
  });
  const installedRecord = plugin.installedRecord ?? null;

  async function copyInstallCommand() {
    const ok = await copyToClipboard(installCommand);
    if (!ok) return;
    setCopiedInstall(true);
    window.setTimeout(() => setCopiedInstall(false), 1500);
  }

  function installSelectedVersion() {
    if (installedRecord) {
      onUseInstalled(installedRecord);
      return;
    }
    onInstall({
      ...plugin,
      key: `${plugin.key}:${selectedVersion}`,
      installSource: `${plugin.entry.name}${
        selectedVersion && selectedVersion !== 'latest' ? `@${selectedVersion}` : ''
      }`,
      entry: selectedEntryForVersion(plugin.entry, selectedVersion),
    });
  }

  const modal = (
    <div
      className="plugin-details-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plugins-available-details-title"
      onClick={(event) => {
        if (!pending && event.target === event.currentTarget) onClose();
      }}
      data-testid="plugins-available-details-modal"
    >
      <div className="plugin-details-modal">
        <header className="plugin-details-modal__head">
          <div className="plugin-details-modal__head-titles">
            <div className="plugin-details-modal__head-row">
              <h2
                id="plugins-available-details-title"
                className="plugin-details-modal__title"
              >
                {title}
              </h2>
              <TrustBadge trust={plugin.marketplace.trust} />
            </div>
            <div className="plugin-details-modal__meta">
              <span>{plugin.entry.name}</span>
              {selectedVersion ? <span>· v{selectedVersion}</span> : null}
              <span>· {sourceName}</span>
            </div>
          </div>
          <button
            type="button"
            className="plugin-details-modal__close"
            onClick={onClose}
            disabled={pending}
            aria-label="Close available plugin details"
            title="Close"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="plugin-details-modal__body">
          <section className="plugin-details-modal__section">
            <div className="plugin-details-modal__section-head">
              <h3 className="plugin-details-modal__section-title">
                {t('plugins.availableDetails.provenance')}
              </h3>
            </div>
            <p
              className="plugin-details-modal__provenance-line"
              data-testid="plugins-available-provenance"
            >
              {provenance}
            </p>
          </section>

          <section className="plugin-details-modal__section">
            <div className="plugin-details-modal__section-head">
              <h3 className="plugin-details-modal__section-title">About</h3>
            </div>
            <p className="plugin-details-modal__description">
              {availablePluginDescription(plugin.entry, locale) ?? 'No description provided.'}
            </p>
          </section>

          {installedRecord ? (
            <section className="plugin-details-modal__section">
              <div className="plugin-details-modal__section-head">
                <h3 className="plugin-details-modal__section-title">
                  Installed
                </h3>
              </div>
              <p className="plugin-details-modal__section-hint">
                This official catalog entry is bundled with OpenDesign and is ready to use.
              </p>
            </section>
          ) : (
            <section className="plugin-details-modal__section">
              <div className="plugin-details-modal__section-head">
                <h3 className="plugin-details-modal__section-title">
                  {t('plugins.availableDetails.install')}
                </h3>
              </div>
              <div className="plugins-view__version-install">
                <label className="plugins-view__version-select">
                  <span>{t('plugins.availableDetails.version')}</span>
                  <select
                    aria-label={t('plugins.availableDetails.pluginVersion')}
                    value={selectedVersion}
                    onChange={(event) => {
                      setSelectedVersion(event.target.value);
                      setCopiedInstall(false);
                    }}
                  >
                    {versions.map((version) => (
                      <option
                        key={version.version}
                        value={version.version}
                        disabled={version.yanked}
                      >
                        {version.version}
                        {version.deprecated
                          ? t('plugins.availableDetails.versionDeprecatedSuffix')
                          : ''}
                        {version.yanked
                          ? t('plugins.availableDetails.versionYankedSuffix')
                          : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="plugins-view__install-command">
                  <code data-testid="plugins-available-install-command">
                    {installCommand}
                  </code>
                  <button
                    type="button"
                    className="plugin-details-modal__chip-btn"
                    onClick={() => void copyInstallCommand()}
                  >
                    <Icon name="copy" size={14} />
                    {copiedInstall
                      ? t('plugins.availableDetails.copied')
                      : t('plugins.availableDetails.copyInstallCommand')}
                  </button>
                </div>
              </div>
              {selectedVersionInfo?.deprecated ? (
                <p className="plugin-details-modal__section-hint">
                  {t('plugins.availableDetails.deprecatedPrefix', {
                    message: selectedVersionInfo.deprecated === true
                      ? t('plugins.availableDetails.deprecatedFallback')
                      : selectedVersionInfo.deprecated,
                  })}
                </p>
              ) : null}
              {selectedVersionInfo?.yanked ? (
                <p className="plugin-details-modal__section-hint">
                  {selectedVersionInfo.yankReason
                    ? t('plugins.availableDetails.yankedWithReason', {
                      reason: selectedVersionInfo.yankReason,
                    })
                    : t('plugins.availableDetails.yanked')}
                </p>
              ) : null}
            </section>
          )}

          <section className="plugin-details-modal__section">
            <div className="plugin-details-modal__section-head">
              <h3 className="plugin-details-modal__section-title">Catalog</h3>
            </div>
            <dl className="plugin-details-modal__source">
              <div>
                <dt>Source</dt>
                <dd>
                  <code>{selectedVersionInfo?.source ?? plugin.entry.source}</code>
                </dd>
              </div>
              {selectedRef ? (
                <div>
                  <dt>{t('plugins.availableDetails.ref')}</dt>
                  <dd>
                    <code>{selectedRef}</code>
                  </dd>
                </div>
              ) : null}
              {selectedIntegrity ? (
                <div>
                  <dt>{t('plugins.availableDetails.integrity')}</dt>
                  <dd>
                    <code>{selectedIntegrity}</code>
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Catalog</dt>
                <dd>{sourceName}</dd>
              </div>
              <div>
                <dt>Catalog URL</dt>
                <dd>
                  <a href={plugin.marketplace.url} target="_blank" rel="noreferrer">
                    {plugin.marketplace.url}
                  </a>
                </dd>
              </div>
              {plugin.entry.license ? (
                <div>
                  <dt>License</dt>
                  <dd>{plugin.entry.license}</dd>
                </div>
              ) : null}
              {publisherLabel ? (
                <div>
                  <dt>Publisher</dt>
                  <dd>
                    {publisher?.url ? (
                      <a href={publisher.url} target="_blank" rel="noreferrer">
                        {publisherLabel}
                      </a>
                    ) : (
                      publisherLabel
                    )}
                  </dd>
                </div>
              ) : null}
              {plugin.entry.homepage ? (
                <div>
                  <dt>Homepage</dt>
                  <dd>
                    <a href={plugin.entry.homepage} target="_blank" rel="noreferrer">
                      {plugin.entry.homepage}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          {permissions.length > 0 || tags.length > 0 || capabilitySummary.length > 0 ? (
            <section className="plugin-details-modal__section">
              <div className="plugin-details-modal__section-head">
                <h3 className="plugin-details-modal__section-title">Metadata</h3>
              </div>
              <div className="plugin-details-modal__context">
                {permissions.length > 0 ? (
                  <div className="plugin-details-modal__ctx-group">
                    <div className="plugin-details-modal__ctx-label">
                      {t('plugins.availableDetails.permissions')}
                    </div>
                    <div className="plugin-details-modal__chips">
                      {permissions.map((permission) => (
                        <span
                          key={permission}
                          className="plugin-details-modal__chip plugin-details-modal__chip--mono"
                        >
                          {permission}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {tags.length > 0 ? (
                  <div className="plugin-details-modal__ctx-group">
                    <div className="plugin-details-modal__ctx-label">Tags</div>
                    <div className="plugin-details-modal__chips">
                      {tags.map((tag) => (
                        <span key={tag} className="plugin-details-modal__chip">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {capabilitySummary.length > 0 ? (
                  <div className="plugin-details-modal__ctx-group">
                    <div className="plugin-details-modal__ctx-label">
                      {t('plugins.availableDetails.capabilitySummary')}
                    </div>
                    <div className="plugin-details-modal__chips">
                      {capabilitySummary.map((capability) => (
                        <span
                          key={capability}
                          className="plugin-details-modal__chip plugin-details-modal__chip--mono"
                        >
                          {capability}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>

        <footer className="plugin-details-modal__foot">
          <button
            type="button"
            className="plugin-details-modal__secondary"
            onClick={onClose}
            disabled={pending}
          >
            Close
          </button>
          <button
            type="button"
            className="plugin-details-modal__primary"
            onClick={installSelectedVersion}
            disabled={pending}
            aria-busy={pending ? 'true' : undefined}
            data-testid={`plugins-available-details-install-${plugin.entry.name}`}
          >
            {installedRecord
              ? t('pluginCard.use')
              : pending
                ? t('pluginsView.installing')
                : t('pluginsView.install')}
          </button>
        </footer>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return modal;
  return createPortal(modal, document.body);
}

function SourcesPanel({
  marketplaces,
  pendingAction,
  onAdd,
  onSourceUrlInput,
  onRefresh,
  onRemove,
  onTrust,
  t,
}: {
  marketplaces: PluginMarketplace[];
  pendingAction: string | null;
  onAdd: (url: string, trust: PluginMarketplaceTrust) => void;
  onSourceUrlInput?: () => void;
  onRefresh: (marketplace: PluginMarketplace) => void;
  onRemove: (marketplace: PluginMarketplace) => void;
  onTrust: (marketplace: PluginMarketplace, trust: PluginMarketplaceTrust) => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const [url, setUrl] = useState('');
  const [trust, setTrust] = useState<PluginMarketplaceTrust>('restricted');
  const trimmedUrl = url.trim();
  const sourceUrlTrackedRef = useRef(false);
  return (
    <section className="plugins-view__section" aria-labelledby="plugins-sources-title">
      <div className="plugins-view__section-head">
        <div>
          <h2 id="plugins-sources-title">{t('pluginsView.sourcesTitle')}</h2>
          <p>{t('pluginsView.sourcesSubtitle')}</p>
        </div>
        <span className="plugins-view__section-count">{marketplaces.length}</span>
      </div>

      <form
        className="plugins-view__source-manager"
        onSubmit={(event) => {
          event.preventDefault();
          if (!trimmedUrl) return;
          onAdd(trimmedUrl, trust);
          setUrl('');
        }}
      >
        <label htmlFor="plugin-marketplace-url">{t('pluginsView.sourceUrl')}</label>
        <div className="plugins-view__source-row">
          <input
            id="plugin-marketplace-url"
            value={url}
            onFocus={() => {
              if (sourceUrlTrackedRef.current) return;
              sourceUrlTrackedRef.current = true;
              onSourceUrlInput?.();
            }}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/open-design-marketplace.json"
            disabled={pendingAction === 'add'}
          />
          <select
            value={trust}
            onChange={(event) => setTrust(event.target.value as PluginMarketplaceTrust)}
            disabled={pendingAction === 'add'}
            aria-label={t('pluginsView.defaultTrust')}
          >
            <option value="restricted">{t('pluginsView.trust.restricted')}</option>
            <option value="trusted">{t('pluginsView.trust.trusted')}</option>
            <option value="official">{t('pluginsView.trust.official')}</option>
          </select>
          <button
            type="submit"
            className="plugins-view__primary"
            disabled={!trimmedUrl || pendingAction === 'add'}
          >
            {pendingAction === 'add' ? t('pluginsView.adding') : t('pluginsView.addSource')}
          </button>
        </div>
      </form>

      {marketplaces.length === 0 ? (
        <div className="plugins-view__empty">
          {t('pluginsView.sourcesEmpty')}
        </div>
      ) : (
        <div className="plugins-view__marketplaces">
          {marketplaces.map((marketplace) => (
            <article key={marketplace.id} className="plugins-view__marketplace">
              <div>
                <h3>{marketplace.manifest.name ?? marketplace.url}</h3>
                <a href={marketplace.url} target="_blank" rel="noreferrer">
                  {marketplace.url}
                </a>
                <div className="plugins-view__meta">
                  <TrustBadge trust={marketplace.trust} />
                  <span>{t('pluginsView.pluginsCount', { n: marketplace.manifest.plugins?.length ?? 0 })}</span>
                  {marketplace.version ? <span>{t('pluginsView.catalogVersion', { version: marketplace.version })}</span> : null}
                </div>
              </div>
              <div className="plugins-view__source-actions">
                <select
                  value={marketplace.trust}
                  onChange={(event) =>
                    onTrust(marketplace, event.target.value as PluginMarketplaceTrust)
                  }
                  aria-label={t('pluginsView.trustFor', { name: marketplace.manifest.name ?? marketplace.url })}
                  disabled={pendingAction?.startsWith(`trust:${marketplace.id}:`)}
                >
                  <option value="restricted">{t('pluginsView.trust.restricted')}</option>
                  <option value="trusted">{t('pluginsView.trust.trusted')}</option>
                  <option value="official">{t('pluginsView.trust.official')}</option>
                </select>
                <button
                  type="button"
                  className="plugins-view__secondary"
                  onClick={() => onRefresh(marketplace)}
                  disabled={pendingAction === `refresh:${marketplace.id}`}
                >
                  {pendingAction === `refresh:${marketplace.id}` ? t('pluginsView.refreshing') : t('designFiles.refresh')}
                </button>
                <button
                  type="button"
                  className="plugins-view__danger"
                  onClick={() => onRemove(marketplace)}
                  disabled={pendingAction === `remove:${marketplace.id}`}
                >
                  {pendingAction === `remove:${marketplace.id}` ? t('pluginsView.removing') : t('chat.comments.remove')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

type ImportKind = 'github' | 'zip' | 'folder';

function PluginImportModal({
  onClose,
  onInstallSource,
  onUploadZip,
  onUploadFolder,
}: {
  onClose: () => void;
  onInstallSource: (source: string) => Promise<PluginInstallOutcome>;
  onUploadZip: (file: File) => Promise<PluginInstallOutcome>;
  onUploadFolder: (files: File[]) => Promise<PluginInstallOutcome>;
}) {
  const analytics = useAnalytics();
  const importModalViewFiredRef = useRef(false);
  useEffect(() => {
    if (importModalViewFiredRef.current) return;
    importModalViewFiredRef.current = true;
    trackPluginImportModalSurfaceView(analytics.track, {
      page_name: 'plugins',
      area: 'import_modal',
    });
  }, [analytics.track]);
  const [kind, setKind] = useState<ImportKind>('github');
  const [source, setSource] = useState('');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [folderFiles, setFolderFiles] = useState<File[]>([]);
  const [working, setWorking] = useState(false);

  function selectKind(next: ImportKind) {
    trackPluginImportModalClick(analytics.track, {
      page_name: 'plugins',
      area: 'import_modal',
      element: 'source_tab',
      import_source: next,
    });
    setKind(next);
  }

  async function runImport() {
    trackPluginImportModalClick(analytics.track, {
      page_name: 'plugins',
      area: 'import_modal',
      element: 'import',
      import_source: kind,
    });
    setWorking(true);
    try {
      let outcome: PluginInstallOutcome | null = null;
      if (kind === 'github') {
        const trimmed = source.trim();
        if (trimmed) outcome = await onInstallSource(trimmed);
      } else if (kind === 'zip' && zipFile) {
        outcome = await onUploadZip(zipFile);
      } else if (kind === 'folder' && folderFiles.length > 0) {
        outcome = await onUploadFolder(folderFiles);
      }
      if (outcome) {
        trackPluginImportResult(analytics.track, {
          page_name: 'plugins',
          area: 'import_modal',
          import_source: kind,
          result: outcome.ok ? 'success' : 'failed',
          ...(outcome.ok ? {} : {
            error_code: resourceActionAnalyticsErrorCode(outcome, 'install_failed'),
          }),
        });
      }
    } finally {
      setWorking(false);
    }
  }

  const canSubmit =
    (kind === 'github' && source.trim().length > 0) ||
    (kind === 'zip' && zipFile !== null) ||
    (kind === 'folder' && folderFiles.length > 0);

  return (
    <div className="plugins-import-modal__backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="plugins-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plugins-import-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="plugins-import-modal__head">
          <div>
            <p className="plugins-view__kicker">User plugins</p>
            <h2 id="plugins-import-title">Import a plugin</h2>
          </div>
          <button
            type="button"
            className="plugins-import-modal__close"
            onClick={onClose}
            aria-label="Close import dialog"
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <nav className="plugins-import-modal__tabs" aria-label="Import source">
          <ImportChoice
            active={kind === 'github'}
            icon="github"
            title="From GitHub"
            body="Install github:owner/repo paths."
            onClick={() => selectKind('github')}
          />
          <ImportChoice
            active={kind === 'zip'}
            icon="upload"
            title="Upload zip"
            body="Upload a plugin archive."
            onClick={() => selectKind('zip')}
          />
          <ImportChoice
            active={kind === 'folder'}
            icon="folder"
            title="Upload folder"
            body="Upload a plugin directory."
            onClick={() => selectKind('folder')}
          />
        </nav>

        <div className="plugins-import-modal__body">
          {kind === 'github' ? (
            <div className="plugins-view__install-card">
              <label htmlFor="plugin-source">GitHub, archive, or marketplace source</label>
              <div className="plugins-view__source-row">
                <input
                  id="plugin-source"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder="github:owner/repo@main/plugins/my-plugin"
                  disabled={working}
                />
                <button
                  type="button"
                  className="plugins-view__primary"
                  onClick={runImport}
                  disabled={working || !canSubmit}
                >
                  {working ? 'Importing…' : 'Import'}
                </button>
              </div>
              <div className="plugins-view__source-help">
                Supports <code>github:owner/repo[@ref][/subpath]</code>, HTTPS{' '}
                <code>.tar.gz</code>/<code>.tgz</code> archives, or marketplace plugin names.
              </div>
            </div>
          ) : null}

          {kind === 'zip' ? (
            <FileImportPanel
              title="Upload zip"
              body="Choose a .zip archive containing open-design.json, SKILL.md, or .claude-plugin/plugin.json."
              accept=".zip,application/zip"
              working={working}
              fileLabel={zipFile?.name ?? 'No zip selected'}
              onChange={(files) => setZipFile(files[0] ?? null)}
              onImport={runImport}
              canSubmit={canSubmit}
            />
          ) : null}

          {kind === 'folder' ? (
            <FileImportPanel
              title="Upload folder"
              body="Choose a plugin folder. Relative paths are preserved and installed into your user plugin registry."
              working={working}
              fileLabel={
                folderFiles.length > 0
                  ? `${folderFiles.length} file${folderFiles.length === 1 ? '' : 's'} selected`
                  : 'No folder selected'
              }
              folder
              onChange={setFolderFiles}
              onImport={runImport}
              canSubmit={canSubmit}
            />
          ) : null}

        </div>

        <footer className="plugins-import-modal__foot">
          <p>
            Imported plugins are user plugins and are stored separately from
            bundled official plugins.
          </p>
          <button
            type="button"
            className="plugins-view__secondary"
            onClick={() => {
              trackPluginImportModalClick(analytics.track, {
                page_name: 'plugins',
                area: 'import_modal',
                element: 'cancel',
              });
              onClose();
            }}
          >
            Cancel
          </button>
        </footer>
      </section>
    </div>
  );
}

function ImportChoice({
  active,
  icon,
  title,
  body,
  onClick,
}: {
  active: boolean;
  icon: 'github' | 'upload' | 'folder';
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`plugins-import-modal__choice${active ? ' is-active' : ''}`}
      onClick={onClick}
    >
      <span className="plugins-import-modal__choice-icon" aria-hidden>
        <Icon name={icon} size={16} />
      </span>
      <span className="plugins-import-modal__choice-copy">
        <span>{title}</span>
        <span>{body}</span>
      </span>
    </button>
  );
}

function FileImportPanel({
  title,
  body,
  accept,
  working,
  fileLabel,
  folder,
  canSubmit,
  onChange,
  onImport,
}: {
  title: string;
  body: string;
  accept?: string;
  working: boolean;
  fileLabel: string;
  folder?: boolean;
  canSubmit: boolean;
  onChange: (files: File[]) => void;
  onImport: () => void;
}) {
  return (
    <section className="plugins-view__install-card">
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      <label className="plugins-import-modal__file">
        <input
          type="file"
          data-testid={folder ? 'plugins-folder-input' : 'plugins-zip-input'}
          {...(accept ? { accept } : {})}
          {...(folder ? { webkitdirectory: '', directory: '' } : {})}
          multiple={folder}
          disabled={working}
          onChange={(event) => onChange(Array.from(event.currentTarget.files ?? []))}
        />
        <span>{fileLabel}</span>
      </label>
      <button
        type="button"
        className="plugins-view__primary"
        onClick={onImport}
        disabled={working || !canSubmit}
      >
        {working ? 'Importing…' : 'Import'}
      </button>
    </section>
  );
}

function buildAvailablePlugins(
  marketplaces: PluginMarketplace[],
  installed: InstalledPluginRecord[],
): AvailableMarketplacePlugin[] {
  const installedByName = new Map<string, InstalledPluginRecord>();
  for (const plugin of installed) {
    for (const key of pluginLookupKeys(plugin)) {
      installedByName.set(key, plugin);
    }
  }
  return marketplaces.flatMap((marketplace) => {
    const entries = marketplace.manifest.plugins ?? [];
    return entries.flatMap((entry) => {
      const installedPlugin = installedByName.get(normalizePluginName(entry.name)) ?? null;
      if (installedPlugin && installedPlugin.sourceKind !== 'bundled') return [];
      // The daemon never permits a scoped install to replace a bundled plugin,
      // regardless of which marketplace advertises the colliding entry. Treat
      // the already-bundled record as installed whenever the normal lookup keys
      // match, otherwise the UI offers an Install action that can only download,
      // parse, and finally fail with "Bundled plugin cannot be replaced".
      const installedRecord = installedPlugin?.sourceKind === 'bundled'
        ? installedPlugin
        : null;
      return [{
        key: `${marketplace.id}:${entry.name}:${entry.version ?? ''}`,
        marketplace,
        entry,
        ...(installedRecord ? { installedRecord } : {}),
      }];
    });
  });
}

function availablePluginTitle(entry: PluginMarketplaceEntry, locale?: string): string {
  return (
    resolveLocalizedText(entry.title_i18n, locale) ||
    entry.title ||
    entry.name
  );
}

function availablePluginDescription(entry: PluginMarketplaceEntry, locale?: string): string | null {
  return (
    resolveLocalizedText(entry.description_i18n, locale) ||
    entry.description ||
    null
  );
}

function availablePluginVersions(entry: PluginMarketplaceEntry): AvailablePluginVersion[] {
  const byVersion = new Map<string, AvailablePluginVersion>();
  if (entry.version) {
    byVersion.set(entry.version, {
      version: entry.version,
      source: entry.source,
      ...(entry.ref ? { ref: entry.ref } : {}),
      ...(entry.dist ? { dist: entry.dist } : {}),
      ...(entry.integrity ? { integrity: entry.integrity } : {}),
      ...(entry.manifestDigest ? { manifestDigest: entry.manifestDigest } : {}),
      ...(entry.deprecated !== undefined ? { deprecated: entry.deprecated } : {}),
      ...(entry.yanked !== undefined ? { yanked: entry.yanked } : {}),
      ...(entry.yankedAt ? { yankedAt: entry.yankedAt } : {}),
      ...(entry.yankReason ? { yankReason: entry.yankReason } : {}),
    });
  }
  for (const version of entry.versions ?? []) {
    const isCurrentVersion = version.version === entry.version;
    byVersion.set(version.version, {
      ...version,
      source: version.source ?? entry.source,
      ...(version.ref ?? (isCurrentVersion ? entry.ref : undefined)
        ? { ref: version.ref ?? entry.ref }
        : {}),
      ...(version.dist ?? (isCurrentVersion ? entry.dist : undefined)
        ? { dist: version.dist ?? entry.dist }
        : {}),
      ...(version.integrity ?? (isCurrentVersion ? entry.integrity : undefined)
        ? { integrity: version.integrity ?? entry.integrity }
        : {}),
      ...(version.manifestDigest ?? (isCurrentVersion ? entry.manifestDigest : undefined)
        ? { manifestDigest: version.manifestDigest ?? entry.manifestDigest }
        : {}),
    });
  }
  if (byVersion.size === 0) {
    byVersion.set('latest', {
      version: 'latest',
      source: entry.source,
      ...(entry.ref ? { ref: entry.ref } : {}),
      ...(entry.dist ? { dist: entry.dist } : {}),
      ...(entry.integrity ? { integrity: entry.integrity } : {}),
      ...(entry.manifestDigest ? { manifestDigest: entry.manifestDigest } : {}),
      ...(entry.deprecated !== undefined ? { deprecated: entry.deprecated } : {}),
      ...(entry.yanked !== undefined ? { yanked: entry.yanked } : {}),
      ...(entry.yankedAt ? { yankedAt: entry.yankedAt } : {}),
      ...(entry.yankReason ? { yankReason: entry.yankReason } : {}),
    });
  }
  return Array.from(byVersion.values());
}

function selectedEntryForVersion(
  entry: PluginMarketplaceEntry,
  version: string,
): PluginMarketplaceEntry {
  const selected = availablePluginVersions(entry).find((item) => item.version === version);
  const {
    ref: _ref,
    dist: _dist,
    integrity: _integrity,
    manifestDigest: _manifestDigest,
    deprecated: _deprecated,
    yanked: _yanked,
    yankedAt: _yankedAt,
    yankReason: _yankReason,
    ...entryBase
  } = entry;
  return {
    ...entryBase,
    version,
    source: selected?.source ?? entry.source,
    ...(selected?.ref ? { ref: selected.ref } : {}),
    ...(selected?.dist ? { dist: selected.dist } : {}),
    ...(selected?.integrity ? { integrity: selected.integrity } : {}),
    ...(selected?.manifestDigest ? { manifestDigest: selected.manifestDigest } : {}),
    ...(selected?.deprecated !== undefined ? { deprecated: selected.deprecated } : {}),
    ...(selected?.yanked !== undefined ? { yanked: selected.yanked } : {}),
    ...(selected?.yankedAt ? { yankedAt: selected.yankedAt } : {}),
    ...(selected?.yankReason ? { yankReason: selected.yankReason } : {}),
  };
}

function buildAvailableInstallCommand(
  entry: PluginMarketplaceEntry,
  version: string,
): string {
  const suffix = version && version !== 'latest' ? `@${version}` : '';
  return `od plugin install ${entry.name}${suffix}`;
}

function buildAvailablePluginProvenance({
  plugin,
  sourceName,
  version,
  t,
}: {
  plugin: AvailableMarketplacePlugin;
  sourceName: string;
  version: AvailablePluginVersion | null;
  t: ReturnType<typeof useI18n>['t'];
}): string {
  const source = version?.source ?? plugin.entry.source;
  const ref = version?.ref ?? null;
  const integrity = version?.integrity ?? version?.dist?.integrity ?? null;
  const resolved = ref ? `${source}@${ref}` : source;
  if (integrity) {
    return t('plugins.availableDetails.provenanceLineWithIntegrity', {
      source: sourceName,
      trust: plugin.marketplace.trust,
      resolved,
      integrity,
    });
  }
  return t('plugins.availableDetails.provenanceLine', {
    source: sourceName,
    trust: plugin.marketplace.trust,
    resolved,
  });
}

interface AvailableSourceOption {
  id: string;
  label: string;
}

function buildAvailableSourceOptions(plugins: AvailableMarketplacePlugin[]): AvailableSourceOption[] {
  const byId = new Map<string, AvailableSourceOption>();
  for (const plugin of plugins) {
    if (byId.has(plugin.marketplace.id)) continue;
    byId.set(plugin.marketplace.id, {
      id: plugin.marketplace.id,
      label: plugin.marketplace.manifest.name ?? plugin.marketplace.url,
    });
  }
  return Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function filterAvailablePlugins(
  plugins: AvailableMarketplacePlugin[],
  filters: { query: string; sourceFilter: string },
): AvailableMarketplacePlugin[] {
  const terms = filters.query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return plugins.filter((plugin) => {
    if (filters.sourceFilter !== 'all' && plugin.marketplace.id !== filters.sourceFilter) {
      return false;
    }
    if (terms.length === 0) return true;
    const haystack = availablePluginSearchText(plugin);
    return terms.every((term) => haystack.includes(term));
  });
}

function availablePluginSearchText(plugin: AvailableMarketplacePlugin): string {
  const { entry, marketplace } = plugin;
  const parts = [
    entry.name,
    entry.title,
    ...localizedValues(entry.title_i18n),
    entry.description,
    ...localizedValues(entry.description_i18n),
    entry.source,
    entry.version,
    entry.homepage,
    entry.license,
    entry.publisher?.id,
    entry.publisher?.github,
    entry.publisher?.url,
    marketplace.id,
    marketplace.url,
    marketplace.trust,
    marketplace.manifest.name,
    ...(entry.tags ?? []),
    ...(entry.capabilitiesSummary ?? []),
  ];
  return parts.filter((part): part is string => typeof part === 'string').join(' ').toLowerCase();
}

function localizedValues(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.values(value).filter((part): part is string => typeof part === 'string');
}

function pluginLookupKeys(plugin: InstalledPluginRecord): string[] {
  const keys = new Set<string>();
  keys.add(normalizePluginName(plugin.id));
  if (plugin.manifest?.name) keys.add(normalizePluginName(plugin.manifest.name));
  if (plugin.sourceMarketplaceEntryName) {
    keys.add(normalizePluginName(plugin.sourceMarketplaceEntryName));
  }
  return Array.from(keys);
}

function normalizePluginName(name: string): string {
  return name.trim().toLowerCase();
}

// Team resources: the member's installed plugins and personal skills, each
// shareable to the team so teammates can pull them. Shared resources are pushed
// to the resource hub under their kind (`plugin` / `skill`) — the same
// content-shared source of truth as design systems. Off-team the fetches
// degrade to empty collections.
function TeamPanel({
  t,
  plugins,
  workspaceContext,
  workspaceIdentity,
  workspaceReadMode,
}: {
  t: ReturnType<typeof useI18n>['t'];
  plugins: InstalledPluginRecord[];
  /** The acting workspace, passed down from `PluginsView` (which already holds
   *  it) rather than read again here, so this panel and the plugin list it sits
   *  beside can never disagree about who is asking. */
  workspaceContext: WorkspaceCollabContext | null;
  /** Account generation + complete Workspace identity + settlement mode. */
  workspaceIdentity: string;
  workspaceReadMode: PluginWorkspaceReadMode;
}) {
  const { locale } = useI18n();
  // The LATEST context, for async work to compare against. `refreshTeamPanelShared`
  // is a `useCallback` with `[]` deps — it closes over the FIRST render's props
  // forever, so reading `workspaceContext` directly inside it would pin whatever
  // was there on mount (typically `null`) and a commit guard built on it would
  // compare that stale value against itself and pass unconditionally.
  const contextRef = useRef(workspaceContext);
  contextRef.current = workspaceContext;
  const workspaceIdentityRef = useRef(workspaceIdentity);
  workspaceIdentityRef.current = workspaceIdentity;
  const workspaceReadModeRef = useRef(workspaceReadMode);
  workspaceReadModeRef.current = workspaceReadMode;
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [sharedPluginIds, setSharedPluginIds] = useState<ReadonlySet<string>>(() => new Set());
  const [sharedSkillIds, setSharedSkillIds] = useState<ReadonlySet<string>>(() => new Set());
  const [loadedIdentity, setLoadedIdentity] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const refreshTeamPanelShared = useCallback(async (cancelled: () => boolean = () => false) => {
    const issuedIdentity = workspaceIdentityRef.current;
    const issuedAccountGeneration = currentWorkspaceAccountGeneration();
    const read = beginWorkspaceScopedRead(contextRef.current);
    const readIsStillCurrent = () =>
      !cancelled()
      && currentWorkspaceAccountGeneration() === issuedAccountGeneration
      && workspaceIdentityRef.current === issuedIdentity
      && read.isStillCurrent(contextRef.current);
    if (
      workspaceReadModeRef.current !== 'scoped'
      || !read.context
      || !workspaceContextHasTeamIdentity(read.context)
    ) {
      if (!readIsStillCurrent()) return;
      setSkills([]);
      setSharedPluginIds(new Set());
      setSharedSkillIds(new Set());
      setLoadedIdentity(issuedIdentity);
      return;
    }
    const context = read.context;
    const loadShared = async (basePath: string): Promise<ReadonlySet<string>> => {
      const res = await fetch(`/api/workspace/${basePath}/team`, {
        cache: 'no-store',
        headers: workspaceProjectHeaders(context),
      });
      if (!res.ok) throw new Error(`${basePath} team catalog ${res.status}`);
      const body = (await res.json()) as { ids?: unknown };
      return new Set(
        Array.isArray(body.ids)
          ? body.ids.filter((id): id is string => typeof id === 'string')
          : [],
      );
    };
    try {
      // Commit the three collections atomically. If one successor read fails,
      // none of the previous identity's skill rows or shared badges survive.
      const [userSkills, pluginIds, skillIds] = await Promise.all([
        fetchSkills(read.context).then((rows) => rows.filter((s) => s.source === 'user')),
        loadShared('plugins'),
        loadShared('skills'),
      ]);
      if (!readIsStillCurrent()) return;
      setSkills(userSkills);
      setSharedPluginIds(pluginIds);
      setSharedSkillIds(skillIds);
      setLoadedIdentity(issuedIdentity);
    } catch {
      if (!readIsStillCurrent()) return;
      setSkills([]);
      setSharedPluginIds(new Set());
      setSharedSkillIds(new Set());
      setLoadedIdentity(issuedIdentity);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void refreshTeamPanelShared(() => cancelled);
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void refreshTeamPanelShared(() => cancelled);
    };
    const interval = window.setInterval(refreshVisible, 10_000);
    window.addEventListener('focus', refreshVisible);
    window.addEventListener('pageshow', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshVisible);
      window.removeEventListener('pageshow', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [refreshTeamPanelShared, workspaceIdentity]);

  async function share(
    basePath: string,
    id: string,
  ) {
    if (sharingId) return;
    const context = contextRef.current;
    const issuedIdentity = workspaceIdentityRef.current;
    const issuedAccountGeneration = currentWorkspaceAccountGeneration();
    if (
      workspaceReadModeRef.current !== 'scoped'
      || !context
      || !workspaceContextHasTeamIdentity(context)
    ) {
      setFailed(true);
      return;
    }
    setSharingId(id);
    setFailed(false);
    try {
      const res = await fetch(`/api/workspace/${basePath}/${encodeURIComponent(id)}/share`, {
        method: 'POST',
        headers: workspaceProjectHeaders(context),
      });
      const body = (await res.json().catch(() => ({}))) as { shared?: boolean };
      if (
        res.ok
        && body.shared
        && currentWorkspaceAccountGeneration() === issuedAccountGeneration
        && workspaceIdentityRef.current === issuedIdentity
      ) {
        await refreshTeamPanelShared();
      } else if (
        currentWorkspaceAccountGeneration() === issuedAccountGeneration
        && workspaceIdentityRef.current === issuedIdentity
      ) {
        setFailed(true);
      }
    } catch {
      if (
        currentWorkspaceAccountGeneration() === issuedAccountGeneration
        && workspaceIdentityRef.current === issuedIdentity
      ) setFailed(true);
    } finally {
      setSharingId(null);
    }
  }

  const collectionsMatchIdentity = loadedIdentity === workspaceIdentity;
  const visibleSkills = collectionsMatchIdentity ? skills : [];
  const visibleSharedPluginIds = collectionsMatchIdentity ? sharedPluginIds : new Set<string>();
  const visibleSharedSkillIds = collectionsMatchIdentity ? sharedSkillIds : new Set<string>();

  const renderRow = (id: string, title: string, shared: boolean, onShare: () => void) => (
    <article key={id} className="plugins-view__available-card">
      <div className="plugins-view__available-main">
        <div className="plugins-view__row-title">
          <span>{title}</span>
        </div>
      </div>
      <div className="plugins-view__row-actions">
        {shared ? (
          <span className="plugins-view__shared-badge">
            <Icon name="check" size={13} /> {t('pluginsView.tab.team')}
          </span>
        ) : (
          <button
            type="button"
            className="plugins-view__primary"
            onClick={onShare}
            disabled={sharingId === id}
          >
            {t('dsManager.shareToTeam')}
          </button>
        )}
      </div>
    </article>
  );

  return (
    <section className="plugins-view__team-collection" aria-labelledby="plugins-team-title">
      <header className="plugins-view__team-header">
        <h2 id="plugins-team-title">{t('pluginsView.teamTitle')}</h2>
        <p>{t('pluginsView.teamBody')}</p>
        {failed ? <p role="alert">{t('dsManager.shareToTeamFailed')}</p> : null}
      </header>
      {plugins.length > 0 ? (
        <div>
          <h3 className="plugins-view__team-section-title">{t('entry.navPlugins')}</h3>
          <div className="plugins-view__available-list">
            {plugins.map((record) =>
              renderRow(record.id, record.title, visibleSharedPluginIds.has(record.id), () =>
                void share('plugins', record.id),
              ),
            )}
          </div>
        </div>
      ) : null}
      {visibleSkills.length > 0 ? (
        <div>
          <h3 className="plugins-view__team-section-title">{t('homeHero.skills')}</h3>
          <div className="plugins-view__available-list">
            {visibleSkills.map((skill) =>
              renderRow(skill.id, localizeSkillName(locale, skill), visibleSharedSkillIds.has(skill.id), () =>
                void share('skills', skill.id),
              ),
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

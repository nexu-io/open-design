import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '@open-design/components';
import {
  PLUGIN_SHARE_ACTION_PLUGIN_IDS,
  resolveLocalizedText,
  type ApplyResult,
  type InstalledPluginRecord,
  type PluginSourceKind,
} from '@open-design/contracts';
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
} from '../analytics/events';
import {
  addPluginMarketplace,
  applyPlugin,
  installPluginSource,
  listPluginMarketplaces,
  listPlugins,
  refreshPluginMarketplace,
  removePluginMarketplace,
  setPluginMarketplaceTrust,
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
import { PluginDetailsModal } from './PluginDetailsModal';
import { PluginsHomeSection } from './PluginsHomeSection';
import { TrustBadge } from './TrustBadge';
import { useI18n } from '../i18n';
import { localizePluginDescription, localizePluginTitle } from './plugins-home/localization';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import type { PluginUseAction } from './plugins-home/useActions';
import { AnimatePresence } from 'motion/react';

type PluginsTab = 'installed' | 'available' | 'sources' | 'team';

const USER_SOURCE_KINDS = new Set<PluginSourceKind>([
  'user',
  'project',
  'marketplace',
  'github',
  'url',
  'local',
]);

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
      'Creates a public GitHub repository for this local Open Design plugin.',
    confirmLabel: 'Start publishing',
    steps: [
      'Create a new Open Design project for the publish workflow.',
      'Copy this plugin into that project as isolated source context.',
      'Run the official publish action plugin against the local daemon.',
    ],
  },
  'contribute-open-design': {
    eyebrow: 'Open Design pull request',
    fallbackTitle: 'Contribute Plugin to Open Design',
    fallbackDescription:
      'Opens a pull request that adds this plugin to the Open Design community catalog.',
    confirmLabel: 'Start contribution',
    steps: [
      'Create a new Open Design project for the contribution workflow.',
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

export function PluginsView({
  onCreatePlugin,
  onUsePlugin,
  onCreatePluginShareProject,
}: PluginsViewProps) {
  const { locale, t } = useI18n();
  const analytics = useAnalytics();
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
  const [activeTab, setActiveTab] = useState<PluginsTab>('installed');
  const [importOpen, setImportOpen] = useState(false);
  const [pendingApplyId, setPendingApplyId] = useState<string | null>(null);
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
    setLoading(true);
    const [rows, allRows, catalogs] = await Promise.all([
      listPlugins(),
      listPlugins({ includeHidden: true }),
      listPluginMarketplaces(),
    ]);
    setPlugins(rows);
    setAllInstalledPlugins(allRows);
    setMarketplaces(catalogs);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
    window.addEventListener('open-design:plugins-changed', refresh);
    return () => window.removeEventListener('open-design:plugins-changed', refresh);
  }, []);

  const userPlugins = useMemo(
    () => plugins.filter((plugin) => USER_SOURCE_KINDS.has(plugin.sourceKind)),
    [plugins],
  );
  const availablePlugins = useMemo(
    () => buildAvailablePlugins(marketplaces, allInstalledPlugins),
    [marketplaces, allInstalledPlugins],
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
    const result = await applyPlugin(record.id, { locale });
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
        () => installPluginSource(plugin.installSource ?? plugin.entry.name),
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
          <p className="plugins-view__kicker">{t('entry.navPlugins')}</p>
          <h1 id="plugins-title" className="entry-section__title">
            {t('entry.navPlugins')}
          </h1>
          <p className="plugins-view__lede">
            {t('pluginsView.lede')}
          </p>
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
            <Icon name="edit" size={13} />
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
            <Icon name="plus" size={13} />
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
        {loading ? <div className="plugins-view__empty">{t('pluginsView.loading')}</div> : null}

        {!loading && activeTab === 'installed' ? (
          <PluginsHomeSection
            plugins={userPlugins}
            loading={false}
            activePluginId={activePlugin?.record.id ?? null}
            pendingApplyId={pendingApplyId}
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

        {!loading && activeTab === 'available' ? (
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

        {!loading && activeTab === 'sources' ? (
          <SourcesPanel
            marketplaces={marketplaces}
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

        {activeTab === 'team' ? <TeamPanel t={t} /> : null}
      </div>

      <AnimatePresence>
        {detailsRecord ? (
          <PluginDetailsModal
            record={detailsRecord}
            onClose={() => setDetailsRecord(null)}
            onUse={(record) => void handleUsePlugin(record, 'use')}
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
          onInstallSource={(source) => finishImport(() => installPluginSource(source))}
          onUploadZip={(file) => finishImport(() => uploadPluginZip(file))}
          onUploadFolder={(files) => finishImport(() => uploadPluginFolder(files))}
        />
      ) : null}
    </section>
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
  const { locale } = useI18n();
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
              <TrustBadge trust="official" label="Action plugin" />
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
            aria-label="Close share confirmation"
            title="Close"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="plugin-details-modal__body">
          <section className="plugin-details-modal__section">
            <div className="plugin-details-modal__section-head">
              <h3 className="plugin-details-modal__section-title">
                What this starts
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
                Source plugin
              </h3>
            </div>
            <dl className="plugin-share-confirm__facts">
              <div>
                <dt>Plugin</dt>
                <dd>{sourceRecord.title}</dd>
              </div>
              <div>
                <dt>ID</dt>
                <dd>
                  <code>{sourceRecord.id}</code>
                </dd>
              </div>
              <div>
                <dt>Copied to</dt>
                <dd>
                  <code>{stagedPath}</code>
                </dd>
              </div>
              <div>
                <dt>Trust</dt>
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
                  Action prompt
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
            Cancel
          </button>
          <button
            type="button"
            className="plugin-details-modal__primary"
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending ? 'true' : undefined}
            data-testid="plugin-share-confirm-start"
          >
            {pending ? 'Starting…' : details.confirmLabel}
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
            <Icon name="search" size={13} className="plugins-view__search-icon" />
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
                <Icon name="close" size={11} />
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

  return (
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
                This official catalog entry is bundled with Open Design and is ready to use.
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
                    <Icon name="copy" size={12} />
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
          ...(outcome.ok ? {} : { error_code: outcome.message ?? 'unknown' }),
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
      const installedRecord = installedPlugin && bundledPluginMatchesMarketplaceEntry(
        installedPlugin,
        marketplace,
        entry,
      )
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

function bundledPluginMatchesMarketplaceEntry(
  plugin: InstalledPluginRecord,
  marketplace: PluginMarketplace,
  entry: PluginMarketplaceEntry,
): boolean {
  return plugin.sourceKind === 'bundled'
    && plugin.sourceMarketplaceId === marketplace.id
    && normalizePluginName(plugin.sourceMarketplaceEntryName ?? '') === normalizePluginName(entry.name);
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

function TeamPanel({ t }: { t: ReturnType<typeof useI18n>['t'] }) {
  return (
    <section className="plugins-view__team" aria-labelledby="plugins-team-title">
      <span className="plugins-view__future-icon" aria-hidden>
        <Icon name="sparkles" size={18} />
      </span>
      <div>
        <p className="plugins-view__kicker">{t('tasks.comingSoon')}</p>
        <h2 id="plugins-team-title">{t('pluginsView.teamTitle')}</h2>
        <p>
          {t('pluginsView.teamBody')}
        </p>
      </div>
    </section>
  );
}

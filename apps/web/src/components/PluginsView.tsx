import { useEffect, useMemo, useState } from 'react';
import {
  PLUGIN_SHARE_ACTION_PLUGIN_IDS,
  type ApplyResult,
  type InstalledPluginRecord,
  type PluginSourceKind,
} from '@open-design/contracts';
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
import { useI18n } from '../i18n';
import type { PluginUseAction } from './plugins-home/useActions';

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
  label: string;
  hint: string;
}> = [
  { id: 'installed', label: 'Installed', hint: 'Your plugins' },
  { id: 'available', label: 'Available', hint: 'From sources' },
  { id: 'sources', label: 'Sources', hint: 'Catalogs' },
  { id: 'team', label: 'Team', hint: 'Enterprise' },
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
  const { locale } = useI18n();
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
        () => installPluginSource(plugin.entry.name),
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
          <p className="plugins-view__kicker">Plugins</p>
          <h1 id="plugins-title" className="entry-section__title">
            Plugins
          </h1>
          <p className="plugins-view__lede">
            Browse installed workflows, discover registry entries, manage
            sources, and prepare plugins for team distribution.
          </p>
        </div>
        <div className="plugins-view__hero-actions">
          <button
            type="button"
            className="plugins-view__primary"
            onClick={() => onCreatePlugin?.()}
            data-testid="plugins-create-button"
          >
            <Icon name="edit" size={13} />
            <span>Create plugin</span>
          </button>
          <button
            type="button"
            className="plugins-view__secondary"
            onClick={() => setImportOpen(true)}
            aria-haspopup="dialog"
            data-testid="plugins-import-button"
          >
            <Icon name="plus" size={13} />
            <span>Import plugin</span>
          </button>
          <div className="plugins-view__badge" aria-hidden="true">
            <Icon name="grid" size={15} />
            <span>Agent context</span>
          </div>
        </div>
      </header>

      <div className="plugins-view__stats" aria-label="Plugin summary">
        <StatCard label="Installed" value={userPlugins.length} />
        <StatCard label="Available" value={availablePlugins.length} />
        <StatCard label="Sources" value={marketplaces.length} />
      </div>

      <nav className="plugins-view__tabs" role="tablist" aria-label="Plugin areas">
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
              onClick={() => setActiveTab(tab.id)}
              data-testid={`plugins-tab-${tab.id}`}
            >
              <span className="plugins-view__tab-label">{tab.label}</span>
              <span className="plugins-view__tab-hint">{tab.hint}</span>
            </button>
          );
        })}
      </nav>

      {notice ? <Notice outcome={notice} /> : null}

      <div className="plugins-view__gallery">
        {loading ? <div className="plugins-view__empty">Loading plugins…</div> : null}

        {!loading && activeTab === 'installed' ? (
          <PluginsHomeSection
            plugins={userPlugins}
            loading={false}
            activePluginId={activePlugin?.record.id ?? null}
            pendingApplyId={pendingApplyId}
            pendingShareAction={pendingShareAction}
            onUse={(record, action) => void handleUsePlugin(record, action)}
            onOpenDetails={setDetailsRecord}
            onPluginShareAction={(record, action) =>
              requestPluginShareTask(record, action)
            }
            onCreatePlugin={onCreatePlugin}
            preferDefaultFacet={false}
            title="Installed plugins"
            subtitle="Plugins you imported or installed from marketplace sources."
            emptyMessage="No installed user plugins yet. Use Create / Import or install an Available entry."
          />
        ) : null}

        {!loading && activeTab === 'available' ? (
          <AvailablePluginsPanel
            plugins={availablePlugins}
            pendingKey={pendingInstallEntry}
            onOpenDetails={setAvailableDetails}
            onInstall={(plugin) => void handleInstallAvailable(plugin)}
          />
        ) : null}

        {!loading && activeTab === 'sources' ? (
          <SourcesPanel
            marketplaces={marketplaces}
            pendingAction={pendingSourceAction}
            onAdd={(url, trust) =>
              void handleMarketplaceMutation('add', () => addPluginMarketplace({ url, trust }))
            }
            onRefresh={(marketplace) =>
              void handleMarketplaceMutation(`refresh:${marketplace.id}`, () =>
                refreshPluginMarketplace(marketplace.id),
              )
            }
            onRemove={(marketplace) =>
              void handleMarketplaceMutation(`remove:${marketplace.id}`, () =>
                removePluginMarketplace(marketplace.id),
              )
            }
            onTrust={(marketplace, trust) =>
              void handleMarketplaceMutation(`trust:${marketplace.id}:${trust}`, () =>
                setPluginMarketplaceTrust(marketplace.id, trust),
              )
            }
          />
        ) : null}

        {activeTab === 'team' ? <TeamPanel /> : null}
      </div>

      {detailsRecord ? (
        <PluginDetailsModal
          record={detailsRecord}
          onClose={() => setDetailsRecord(null)}
          onUse={(record) => void handleUsePlugin(record, 'use')}
          isApplying={pendingApplyId === detailsRecord.id}
        />
      ) : null}
      {availableDetails ? (
        <AvailablePluginDetailsModal
          plugin={availableDetails}
          pending={pendingInstallEntry === availableDetails.key}
          onClose={() => {
            if (pendingInstallEntry !== availableDetails.key) setAvailableDetails(null);
          }}
          onInstall={(plugin) => void handleInstallAvailable(plugin)}
        />
      ) : null}
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
  const details = PLUGIN_SHARE_DETAILS[action];
  const actionTitle = actionRecord?.title ?? details.fallbackTitle;
  const actionDescription =
    actionRecord?.manifest?.description ?? details.fallbackDescription;
  const actionQuery = readLocalizedUseCaseQuery(actionRecord);
  const stagedPath = `plugin-source/${pluginShareSlug(sourceRecord.id)}`;

  return (
    <div
      className="plugin-details-modal-backdrop plugin-share-confirm"
      role="dialog"
      aria-modal="true"
      aria-label={`${actionTitle} for ${sourceRecord.title}`}
      onClick={(event) => {
        if (!pending && event.target === event.currentTarget) onClose();
      }}
      data-testid="plugin-share-confirm-modal"
    >
      <div className="plugin-details-modal plugin-share-confirm__panel">
        <header className="plugin-details-modal__head">
          <div className="plugin-details-modal__head-titles">
            <div className="plugin-details-modal__head-row">
              <h2 className="plugin-details-modal__title">{actionTitle}</h2>
              <span className="plugin-details-modal__trust trust-bundled">
                Action plugin
              </span>
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
                <dd>{sourceRecord.trust}</dd>
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
      </div>
    </div>
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
}

function AvailablePluginsPanel({
  plugins,
  pendingKey,
  onOpenDetails,
  onInstall,
}: {
  plugins: AvailableMarketplacePlugin[];
  pendingKey: string | null;
  onOpenDetails: (plugin: AvailableMarketplacePlugin) => void;
  onInstall: (plugin: AvailableMarketplacePlugin) => void;
}) {
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
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
          <h2 id="plugins-available-title">Available from sources</h2>
          <p>Catalog entries discovered from configured marketplaces.</p>
        </div>
        <span className="plugins-view__section-count">
          {filteredPlugins.length === plugins.length
            ? plugins.length
            : `${filteredPlugins.length} of ${plugins.length}`}
        </span>
      </div>
      {plugins.length > 0 ? (
        <div className="plugins-view__available-controls" aria-label="Available plugin filters">
          <div className="plugins-view__search">
            <Icon name="search" size={13} className="plugins-view__search-icon" />
            <input
              id="plugins-available-search"
              type="search"
              aria-label="Search available plugins"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search available plugins"
            />
            {query ? (
              <button
                type="button"
                className="plugins-view__search-clear"
                onClick={() => setQuery('')}
                aria-label="Clear available plugin search"
                title="Clear search"
              >
                <Icon name="close" size={11} />
              </button>
            ) : null}
          </div>
          <label className="plugins-view__filter" htmlFor="plugins-available-source">
            <span>Source</span>
            <select
              id="plugins-available-source"
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
            >
              <option value="all">All sources</option>
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
          No available entries yet. Installed catalog entries are removed from Available;
          uninstall one to make it available again.
        </div>
      ) : filteredPlugins.length === 0 ? (
        <div className="plugins-view__empty">
          {filterActive
            ? 'No available entries match your filters.'
            : 'No available entries yet. Add a source in the Sources tab.'}
        </div>
      ) : (
        <div className="plugins-view__available-list">
          {filteredPlugins.map((plugin) => {
            const title = plugin.entry.title ?? plugin.entry.name;
            return (
              <article key={plugin.key} className="plugins-view__available-card">
                <div className="plugins-view__available-main">
                  <div className="plugins-view__row-title">
                    <span>{title}</span>
                    <span className={`plugins-view__trust trust-${plugin.marketplace.trust}`}>
                      {plugin.marketplace.trust}
                    </span>
                  </div>
                  {plugin.entry.description ? <p>{plugin.entry.description}</p> : null}
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
                    Details
                  </button>
                  <button
                    type="button"
                    className="plugins-view__primary"
                    onClick={() => onInstall(plugin)}
                    disabled={pendingKey === plugin.key}
                    data-testid={`plugins-available-install-${plugin.entry.name}`}
                  >
                    {pendingKey === plugin.key ? 'Installing…' : 'Install'}
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
  onInstall,
}: {
  plugin: AvailableMarketplacePlugin;
  pending: boolean;
  onClose: () => void;
  onInstall: (plugin: AvailableMarketplacePlugin) => void;
}) {
  const title = plugin.entry.title ?? plugin.entry.name;
  const sourceName = plugin.marketplace.manifest.name ?? plugin.marketplace.url;
  const trustClass =
    plugin.marketplace.trust === 'official' ? 'bundled' : plugin.marketplace.trust;
  const publisher = plugin.entry.publisher;
  const publisherLabel =
    publisher?.id ?? publisher?.github ?? publisher?.url ?? null;
  const tags = plugin.entry.tags ?? [];
  const capabilitySummary = plugin.entry.capabilitiesSummary ?? [];

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
              <span className={`plugin-details-modal__trust trust-${trustClass}`}>
                {plugin.marketplace.trust}
              </span>
            </div>
            <div className="plugin-details-modal__meta">
              <span>{plugin.entry.name}</span>
              {plugin.entry.version ? <span>· v{plugin.entry.version}</span> : null}
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
              <h3 className="plugin-details-modal__section-title">About</h3>
            </div>
            <p className="plugin-details-modal__description">
              {plugin.entry.description ?? 'No description provided.'}
            </p>
          </section>

          <section className="plugin-details-modal__section">
            <div className="plugin-details-modal__section-head">
              <h3 className="plugin-details-modal__section-title">Catalog</h3>
            </div>
            <dl className="plugin-details-modal__source">
              <div>
                <dt>Source</dt>
                <dd>
                  <code>{plugin.entry.source}</code>
                </dd>
              </div>
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

          {tags.length > 0 || capabilitySummary.length > 0 ? (
            <section className="plugin-details-modal__section">
              <div className="plugin-details-modal__section-head">
                <h3 className="plugin-details-modal__section-title">Metadata</h3>
              </div>
              <div className="plugin-details-modal__context">
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
                    <div className="plugin-details-modal__ctx-label">Capabilities</div>
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
            onClick={() => onInstall(plugin)}
            disabled={pending}
            aria-busy={pending ? 'true' : undefined}
            data-testid={`plugins-available-details-install-${plugin.entry.name}`}
          >
            {pending ? 'Installing...' : 'Install'}
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
  onRefresh,
  onRemove,
  onTrust,
}: {
  marketplaces: PluginMarketplace[];
  pendingAction: string | null;
  onAdd: (url: string, trust: PluginMarketplaceTrust) => void;
  onRefresh: (marketplace: PluginMarketplace) => void;
  onRemove: (marketplace: PluginMarketplace) => void;
  onTrust: (marketplace: PluginMarketplace, trust: PluginMarketplaceTrust) => void;
}) {
  const [url, setUrl] = useState('');
  const [trust, setTrust] = useState<PluginMarketplaceTrust>('restricted');
  const trimmedUrl = url.trim();
  return (
    <section className="plugins-view__section" aria-labelledby="plugins-sources-title">
      <div className="plugins-view__section-head">
        <div>
          <h2 id="plugins-sources-title">Registry sources</h2>
          <p>Marketplace catalogs that feed Available plugin entries.</p>
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
        <label htmlFor="plugin-marketplace-url">Source URL</label>
        <div className="plugins-view__source-row">
          <input
            id="plugin-marketplace-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/open-design-marketplace.json"
            disabled={pendingAction === 'add'}
          />
          <select
            value={trust}
            onChange={(event) => setTrust(event.target.value as PluginMarketplaceTrust)}
            disabled={pendingAction === 'add'}
            aria-label="Default trust"
          >
            <option value="restricted">Restricted</option>
            <option value="trusted">Trusted</option>
            <option value="official">Official</option>
          </select>
          <button
            type="submit"
            className="plugins-view__primary"
            disabled={!trimmedUrl || pendingAction === 'add'}
          >
            {pendingAction === 'add' ? 'Adding…' : 'Add source'}
          </button>
        </div>
      </form>

      {marketplaces.length === 0 ? (
        <div className="plugins-view__empty">
          No registry sources configured yet.
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
                  <span>{marketplace.trust}</span>
                  <span>{marketplace.manifest.plugins?.length ?? 0} plugins</span>
                  {marketplace.version ? <span>catalog v{marketplace.version}</span> : null}
                </div>
              </div>
              <div className="plugins-view__source-actions">
                <select
                  value={marketplace.trust}
                  onChange={(event) =>
                    onTrust(marketplace, event.target.value as PluginMarketplaceTrust)
                  }
                  aria-label={`Trust for ${marketplace.manifest.name ?? marketplace.url}`}
                  disabled={pendingAction?.startsWith(`trust:${marketplace.id}:`)}
                >
                  <option value="restricted">Restricted</option>
                  <option value="trusted">Trusted</option>
                  <option value="official">Official</option>
                </select>
                <button
                  type="button"
                  className="plugins-view__secondary"
                  onClick={() => onRefresh(marketplace)}
                  disabled={pendingAction === `refresh:${marketplace.id}`}
                >
                  {pendingAction === `refresh:${marketplace.id}` ? 'Refreshing…' : 'Refresh'}
                </button>
                <button
                  type="button"
                  className="plugins-view__danger"
                  onClick={() => onRemove(marketplace)}
                  disabled={pendingAction === `remove:${marketplace.id}`}
                >
                  {pendingAction === `remove:${marketplace.id}` ? 'Removing…' : 'Remove'}
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
  const [kind, setKind] = useState<ImportKind>('github');
  const [source, setSource] = useState('');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [folderFiles, setFolderFiles] = useState<File[]>([]);
  const [working, setWorking] = useState(false);

  async function runImport() {
    setWorking(true);
    try {
      if (kind === 'github') {
        const trimmed = source.trim();
        if (trimmed) await onInstallSource(trimmed);
      } else if (kind === 'zip' && zipFile) {
        await onUploadZip(zipFile);
      } else if (kind === 'folder' && folderFiles.length > 0) {
        await onUploadFolder(folderFiles);
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
            onClick={() => setKind('github')}
          />
          <ImportChoice
            active={kind === 'zip'}
            icon="upload"
            title="Upload zip"
            body="Upload a plugin archive."
            onClick={() => setKind('zip')}
          />
          <ImportChoice
            active={kind === 'folder'}
            icon="folder"
            title="Upload folder"
            body="Upload a plugin directory."
            onClick={() => setKind('folder')}
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
            onClick={onClose}
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
      if (installedPlugin) return [];
      return [{
        key: `${marketplace.id}:${entry.name}:${entry.version ?? ''}`,
        marketplace,
        entry,
      }];
    });
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
    entry.description,
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

function TeamPanel() {
  return (
    <section className="plugins-view__team" aria-labelledby="plugins-team-title">
      <span className="plugins-view__future-icon" aria-hidden>
        <Icon name="sparkles" size={18} />
      </span>
      <div>
        <p className="plugins-view__kicker">Coming soon</p>
        <h2 id="plugins-team-title">Private team marketplaces</h2>
        <p>
          This area is reserved for enterprise and team catalogs, private trust
          policies, and shared plugin lifecycle controls.
        </p>
      </div>
    </section>
  );
}

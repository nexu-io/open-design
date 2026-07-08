import {
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useT } from '../i18n';

import { MemoryProfilePanel } from './MemoryProfilePanel';
// The memory slice's public API is its barrel; the orchestrator reaches slice
// internals only through it (ADR 0002, enforced by check-web-slice-boundaries).
import {
  MemoryHowPanel,
  MemoryAdvancedModal,
  MemoryList,
  MemoryManualEditor,
  MemoryConnectedPanel,
  useWiredMemoryConfig,
  useMemoryFlash,
  useWiredMemoryEntries,
  useWiredMemoryExtractions,
  useWiredMemoryConnectors,
  useMemoryNavigation,
  memorySourceTabs,
  visibleExtractionsFor,
  type MemoryConfigController,
  type MemoryFlashController,
  type MemoryEntriesController,
  type MemoryEntriesCoordination,
  type MemoryExtractionsController,
  type MemoryConnectorsController,
  type MemoryConnectorsCoordination,
  type MemoryNavigationController,
  type MemorySectionProps,
} from '../features/memory';
import {
  subscribeMemoryEvents,
  subscribeConnectorCallback,
  subscribeConnectorStatusPolling,
} from '../providers/memory';

// Injectable hooks for the orchestrator. Each defaults to its wired hook, so
// production callers pass nothing while tests swap a hook for a fake. Per-hook
// injection (not one bag) keeps each seam independently overridable.
interface MemorySectionHooks {
  useConfig?: () => MemoryConfigController;
  useFlash?: () => MemoryFlashController;
  useNavigation?: () => MemoryNavigationController;
  useEntries?: (coord: MemoryEntriesCoordination) => MemoryEntriesController;
  useExtractions?: () => MemoryExtractionsController;
  useConnectors?: (coord: MemoryConnectorsCoordination) => MemoryConnectorsController;
}

export function MemorySection({
  onOpenConnectors,
  chatAgentId = null,
  chatModel = null,
  useConfig = useWiredMemoryConfig,
  useFlash = useMemoryFlash,
  useNavigation = useMemoryNavigation,
  useEntries = useWiredMemoryEntries,
  useExtractions = useWiredMemoryExtractions,
  useConnectors = useWiredMemoryConnectors,
}: MemorySectionProps & MemorySectionHooks = {}) {
  const t = useT();
  const {
    enabled,
    hookFlags,
    onToggleEnabled,
    onToggleHook,
    hydrate: hydrateConfig,
  } = useConfig();
  const { flash, fireFlash } = useFlash();
  // Navigation/layout state (top tab, source sub-tab, modal open flags, the
  // records-section ref). Owned by a pure state hook so the transitions are
  // testable in isolation; the orchestrator re-exposes it and keeps the effects
  // that read it (below) here, per the slice's effect-placement rule.
  const {
    topTab,
    setTopTab,
    activeTab,
    setActiveTab,
    addModalOpen,
    setAddModalOpen,
    advancedModalOpen,
    setAdvancedModalOpen,
    recordsRef,
    openEditor,
    closeEditor,
  } = useNavigation();

  const {
    entries,
    filtered,
    memoryTree,
    treeFolders,
    treeChildren,
    rootDir,
    index,
    indexDraft,
    setIndexDraft,
    previewId,
    previewBody,
    editing,
    setEditing,
    busy,
    filter,
    setFilter,
    editorRef,
    editorNameRef,
    reload,
    onCopyPath,
    openPreview,
    startEdit,
    startNew,
    cancelEdit,
    onSave,
    onDelete,
    onSaveIndex,
  } = useEntries({ fireFlash, hydrateConfig, openEditor, closeEditor });
  // Recent LLM-extraction attempts, newest first. The hook owns the one-shot
  // fetch, the SSE merge (fed by the orchestrator's stream below), the relative-
  // time clock, and delete/clear. The orchestrator keeps only cross-cluster
  // derived values (`visibleExtractions`, `unifiedMemoryCount`) and the clear
  // confirm prompt.
  const {
    extractions,
    isRefreshing,
    nowClock,
    showNoProviderBanner,
    connectorExtractions,
    reloadExtractions,
    applyExtractionEvent,
    onDeleteExtraction,
    clearExtractions,
  } = useExtractions();
  // The connectors cluster (list/status catalogue, OAuth connect flow + its own
  // browser subscriptions, selection, and the scan→suggest→save loop) is fully
  // owned by this hook; the orchestrator only feeds it the entries/extraction
  // reloads and chat context, and triggers its list reload when the Connected
  // tab opens. See the hook header for why it stays one hook and owns its own
  // OAuth effects.
  const {
    connectorStatuses,
    connectorsLoading,
    selectedConnectorIds,
    connectorExtracting,
    connectorSaving,
    connectorSuggestions,
    selectedSuggestionIds,
    connectorAttempts,
    connectorContextBytes,
    connectorStatus,
    connectorError,
    connectingConnectorIds,
    pendingConnectorAuthIds,
    connectorConnectErrors,
    memoryConnectors,
    connectorIdsWithDetails,
    connectedMemoryConnectors,
    selectedConnectedConnectorIds,
    connectedCount,
    connectorScanLabel,
    selectedConnectorSuggestions,
    reloadConnectors,
    refreshConnectorStatuses,
    toggleConnectorSelection,
    onConnectMemoryConnector,
    toggleConnectorSuggestion,
    onSuggestConnectorMemory,
    onDiscardConnectorSuggestions,
    onSaveConnectorSuggestions,
  } = useConnectors({ reload, reloadExtractions, chatAgentId, chatModel });

  useEffect(() => {
    void reload();
    void reloadExtractions();
  }, [reload, reloadExtractions]);

  // Nav-driven: refresh the connector catalogue when the Connected tab opens.
  // `activeTab` is orchestrator-owned navigation, so this trigger stays in the
  // shell; the reload itself lives in the connectors hook.
  useEffect(() => {
    if (activeTab !== 'connected') return;
    void reloadConnectors();
  }, [activeTab, reloadConnectors]);

  // Live updates: the SSE stream (`/api/memory/events`) is owned by the
  // providers/memory bridge; the orchestrator opens it and dispatches each
  // channel to its cluster. `change` frames (chat hook, LLM extractor, a PATCH
  // from another tab, curl…) trigger a list re-fetch so what the user sees stays
  // in sync — the local state already updated optimistically, but a re-fetch
  // keeps mtime / index aligned anyway. `extraction` frames feed the extractions
  // hook's own merge. The bridge's EventSource auto-reconnects on daemon hiccups.
  useEffect(
    () =>
      subscribeMemoryEvents({
        onChange: (ev) => {
          // Don't reload if the event payload is just a connection ping.
          if (!ev || !ev.kind) return;
          void reload();
        },
        onExtraction: applyExtractionEvent,
      }),
    [reload, applyExtractionEvent],
  );

  // OAuth browser subscriptions live in the orchestrator, not the connectors
  // hook: they open accumulating subscriptions (a poll interval + a message
  // listener), and the orchestrator is a guaranteed single instance, so they
  // can't double-fire the way a reused hook's effects could. Both drive the
  // hook's `refreshConnectorStatuses`. The `window` reach is behind the bridges.
  useEffect(() => {
    if (pendingConnectorAuthIds.size === 0) return;
    return subscribeConnectorStatusPolling(() => {
      void refreshConnectorStatuses();
    });
  }, [pendingConnectorAuthIds, refreshConnectorStatuses]);

  useEffect(
    () =>
      subscribeConnectorCallback(() => {
        void refreshConnectorStatuses();
      }),
    [refreshConnectorStatuses],
  );

  const visibleExtractions = useMemo(
    () => visibleExtractionsFor(extractions, filter),
    [extractions, filter],
  );
  const unifiedMemoryCount = filtered.length + visibleExtractions.length;

  // The clear-all confirm prompt is orchestrator-owned navigation (a
  // window.confirm the DOM-free hook must not touch); once confirmed it defers
  // to the hook's clear. Per-row delete is confirm-free, so it's used directly.
  const onClearExtractions = useCallback(async () => {
    if (!window.confirm(t('settings.memoryExtractionsClearConfirm'))) return;
    await clearExtractions();
  }, [clearExtractions, t]);

  const memoryTabs = useMemo(() => memorySourceTabs(t), [t]);

  const modalHost = typeof document === 'undefined' ? null : document.body;

  return (
    <>
      <section
        className={`settings-section settings-section-card memory-create-section${enabled ? '' : ' is-disabled'}`}
      >
      <div className="section-head memory-control-head">
        <div className="memory-control-copy">
          <h3 className="memory-title-row">
            <span>{t('settings.memory')}</span>
            {/*
              Storage path used to render as a permanently-visible
              <code>/Users/.../.od/memory</code> line in the body. Most
              users only need this once (to peek at the markdown files)
              and then never again, so the line was pure noise after the
              first glance. We tucked it behind an info button next to
              the title: native tooltip on hover reveals the full path,
              and a click copies it to clipboard with a "Path copied"
              flash. Inline English for the aria-label; PR-time
              translation sweep can lift it later.
            */}
            {rootDir ? (
              <span className="memory-info-wrap">
                <button
                  type="button"
                  className="memory-info-btn"
                  onClick={() => void onCopyPath()}
                  title={rootDir}
                  aria-label="Memory storage path — click to copy"
                >
                  <Icon name="info" size={13} />
                </button>
                {flash?.kind === 'pathCopied' ? (
                  <span key={flash.key} className="memory-path-copied-badge">
                    {t('settings.memoryFlashPathCopied')}
                  </span>
                ) : null}
              </span>
            ) : null}
          </h3>
          <p className="hint">{t('settings.memoryDescription')}</p>
        </div>
        <div className="memory-header-actions">
          <div
            className="memory-top-tabs"
            role="tablist"
            aria-label={t('settings.memory')}
          >
            <button
              type="button"
              role="tab"
              aria-selected={topTab === 'memories'}
              className={`memory-top-tab${topTab === 'memories' ? ' active' : ''}`}
              onClick={() => setTopTab('memories')}
            >
              {t('settings.memoryTabMemories')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={topTab === 'how'}
              className={`memory-top-tab${topTab === 'how' ? ' active' : ''}`}
              onClick={() => setTopTab('how')}
            >
              {t('settings.memoryTabHow')}
            </button>
          </div>
          <button
            type="button"
            className="memory-icon-action"
            onClick={() => {
              setTopTab('memories');
              setAddModalOpen(true);
            }}
            title={t('settings.memoryAddDisclosure')}
            aria-label={t('settings.memoryAddDisclosure')}
          >
            <Icon name="plus" size={15} />
          </button>
          <button
            type="button"
            className="memory-icon-action"
            onClick={() => {
              setTopTab('memories');
              setAdvancedModalOpen(true);
            }}
            title="Advanced"
            aria-label="Advanced"
          >
            <Icon name="settings" size={15} />
          </button>
          <label
            className="toggle-switch"
            title={t('settings.memoryEnableLabel')}
            aria-label={t('settings.memoryEnableLabel')}
          >
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onToggleEnabled(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      {!enabled ? (
        <div role="status" className="memory-disabled-banner">
          <strong>{t('settings.memoryDisabled')}</strong> —{' '}
          {t('settings.memoryDisabledBanner')}
        </div>
      ) : null}

      {enabled && showNoProviderBanner ? (
        <div role="status" className="memory-noprovider-banner">
          <strong>{t('settings.memoryNoProviderBannerTitle')}</strong> —{' '}
          {t('settings.memoryNoProviderBannerBody')}
        </div>
      ) : null}

      {topTab === 'how' ? (
        <MemoryHowPanel
          enabled={enabled}
          hookFlags={hookFlags}
          onToggleHook={onToggleHook}
        />
      ) : null}

      {modalHost && addModalOpen ? createPortal(
      <div
        className="memory-action-modal-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setAddModalOpen(false);
          }
        }}
      >
        <div
          className="memory-action-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="memory-add-modal-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="memory-action-modal-head">
            <div>
              <h3 id="memory-add-modal-title">
                {t('settings.memoryAddDisclosure')}
              </h3>
              <p>{t('settings.memoryAddDisclosureHint')}</p>
            </div>
            <button
              type="button"
              className="memory-action-modal-close"
              onClick={() => setAddModalOpen(false)}
              aria-label={t('common.close')}
              title={t('common.close')}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="memory-action-modal-body">

      <div
        className="memory-source-tabs"
        role="tablist"
        aria-label="Memory areas"
      >
        {memoryTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-label={tab.label}
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="memory-source-tab-icon">
              <Icon name={tab.icon} size={14} />
            </span>
            <span className="memory-source-tab-copy">
              <span>{tab.label}</span>
              <small aria-hidden="true">{tab.caption}</small>
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'profile' ? (
        <div className="memory-tab-panel memory-profile-tab-panel">
          <MemoryProfilePanel enabled={enabled} />
        </div>
      ) : null}

      {activeTab === 'manual' ? (
        <MemoryManualEditor
          editing={editing}
          onEditingChange={setEditing}
          onStartNew={startNew}
          onCancel={cancelEdit}
          onSave={onSave}
          busy={busy}
          editorRef={editorRef}
          editorNameRef={editorNameRef}
          flash={flash}
        />
      ) : null}

      {activeTab === 'connected' ? (
        <MemoryConnectedPanel
          enabled={enabled}
          onOpenConnectors={onOpenConnectors}
          connectorStatuses={connectorStatuses}
          connectorsLoading={connectorsLoading}
          connectedCount={connectedCount}
          selectedConnectorIds={selectedConnectorIds}
          selectedConnectedConnectorIds={selectedConnectedConnectorIds}
          connectingConnectorIds={connectingConnectorIds}
          pendingConnectorAuthIds={pendingConnectorAuthIds}
          connectorConnectErrors={connectorConnectErrors}
          connectorIdsWithDetails={connectorIdsWithDetails}
          connectorExtracting={connectorExtracting}
          connectorSaving={connectorSaving}
          connectorScanLabel={connectorScanLabel}
          connectorSuggestions={connectorSuggestions}
          selectedSuggestionIds={selectedSuggestionIds}
          selectedConnectorSuggestions={selectedConnectorSuggestions}
          connectorStatus={connectorStatus}
          connectorError={connectorError}
          connectorAttempts={connectorAttempts}
          connectorContextBytes={connectorContextBytes}
          connectorExtractions={connectorExtractions}
          memoryConnectors={memoryConnectors}
          toggleConnectorSelection={toggleConnectorSelection}
          onConnectMemoryConnector={onConnectMemoryConnector}
          toggleConnectorSuggestion={toggleConnectorSuggestion}
          onSuggestConnectorMemory={onSuggestConnectorMemory}
          onSaveConnectorSuggestions={onSaveConnectorSuggestions}
          onDiscardConnectorSuggestions={onDiscardConnectorSuggestions}
          nowClock={nowClock}
          onOpenPreview={openPreview}
          onDeleteExtraction={onDeleteExtraction}
        />
      ) : null}

          </div>
        </div>
      </div>,
      modalHost,
      ) : null}

      </section>

      {topTab === 'memories' ? (
      <>
      <MemoryList
        sectionRef={recordsRef}
        entries={entries}
        filtered={filtered}
        visibleExtractions={visibleExtractions}
        filter={filter}
        onFilterChange={setFilter}
        unifiedMemoryCount={unifiedMemoryCount}
        onClearExtractions={onClearExtractions}
        onRefreshExtractions={reloadExtractions}
        isRefreshing={isRefreshing}
        previewId={previewId}
        previewBody={previewBody}
        nowClock={nowClock}
        onOpenPreview={openPreview}
        onStartEdit={startEdit}
        onDeleteEntry={onDelete}
        onDeleteExtraction={onDeleteExtraction}
      />

      <MemoryAdvancedModal
        open={advancedModalOpen}
        modalHost={modalHost}
        onClose={() => setAdvancedModalOpen(false)}
        index={index}
        indexDraft={indexDraft}
        onIndexDraftChange={setIndexDraft}
        onSaveIndex={onSaveIndex}
        busy={busy}
        memoryTree={memoryTree}
        treeFolders={treeFolders}
        treeChildren={treeChildren}
        onStartEdit={startEdit}
      />
      </>
      ) : null}
    </>
  );
}

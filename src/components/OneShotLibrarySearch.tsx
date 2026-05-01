import type { ChangeEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  buildInspirationPrompt,
  listInspirationBoards,
  listInspirationPins,
} from '../state/inspiration';
import { listSavedBlueprints } from '../state/blueprints';
import type {
  InspirationBoard,
  InspirationPin,
  Project,
  ProjectKind,
  SavedWorkflowBlueprint,
} from '../types';
import { Icon } from './Icon';
import type { CreateInput } from './NewProjectPanel';

interface Props {
  projects: Project[];
  onCreateProject: (input: CreateInput & { pendingPrompt?: string }) => void;
  onOpenProject: (id: string) => void;
}

type LibrarySourceFilter = 'all' | 'Blueprint' | 'Board' | 'Project';
type LibraryOutputFilter = 'all' | 'prototype' | 'deck' | 'template' | 'visual-reference' | 'other';
type LibraryRecencyFilter = 'all' | '7d' | '30d' | '90d';
type LibraryImportConflictMode = 'rename' | 'replace' | 'skip';
type LibraryImportAction = 'create' | 'rename' | 'replace' | 'skip';
type LibraryTransferDirection = 'export' | 'import';

interface LibraryViewFilters {
  query: string;
  sourceFilter: LibrarySourceFilter;
  outputFilter: LibraryOutputFilter;
  recencyFilter: LibraryRecencyFilter;
}

interface SavedLibraryView extends LibraryViewFilters {
  id: string;
  name: string;
  createdAt: number;
  collection?: string;
  owner?: string;
  note?: string;
  pinnedAt?: number;
}

interface LibraryViewImportPlanItem {
  view: SavedLibraryView;
  existingView?: SavedLibraryView;
  action: LibraryImportAction;
  resolvedName: string;
}

const SAVED_VIEWS_KEY = 'oneshot:library-search-views';
const TRANSFER_HISTORY_KEY = 'oneshot:library-search-transfer-history';
const SAVED_VIEWS_SCHEMA = 'oneshot.library-search-views.v1';
const TRANSFER_HISTORY_SCHEMA = 'oneshot.library-search-transfer-history.v1';

interface LibraryViewsExport {
  schema: typeof SAVED_VIEWS_SCHEMA;
  exportedAt: number;
  views: SavedLibraryView[];
}

interface LibraryTransferHistoryExport {
  schema: typeof TRANSFER_HISTORY_SCHEMA;
  exportedAt: number;
  entries: LibraryTransferHistoryEntry[];
}

interface LibraryTransferHistoryEntry {
  id: string;
  direction: LibraryTransferDirection;
  createdAt: number;
  viewCount: number;
  note?: string;
  importedCount?: number;
  conflictCount?: number;
  conflictMode?: LibraryImportConflictMode;
  actions?: Partial<Record<LibraryImportAction, number>>;
  replayViews?: SavedLibraryView[];
}

export function OneShotLibrarySearch({
  projects,
  onCreateProject,
  onOpenProject,
}: Props) {
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<LibrarySourceFilter>('all');
  const [outputFilter, setOutputFilter] = useState<LibraryOutputFilter>('all');
  const [recencyFilter, setRecencyFilter] = useState<LibraryRecencyFilter>('all');
  const [savedViews, setSavedViews] = useState<SavedLibraryView[]>([]);
  const [exportPreviewOpen, setExportPreviewOpen] = useState(false);
  const [pendingImportViews, setPendingImportViews] = useState<SavedLibraryView[] | null>(null);
  const [importConflictMode, setImportConflictMode] = useState<LibraryImportConflictMode>('rename');
  const [viewImportStatus, setViewImportStatus] = useState('');
  const [viewImportError, setViewImportError] = useState('');
  const [transferHistory, setTransferHistory] = useState<LibraryTransferHistoryEntry[]>([]);
  const [savedBlueprints, setSavedBlueprints] = useState<SavedWorkflowBlueprint[]>([]);
  const [inspirationBoards, setInspirationBoards] = useState<InspirationBoard[]>([]);
  const [inspirationPins, setInspirationPins] = useState<InspirationPin[]>([]);

  useEffect(() => {
    function refreshSavedBlueprints() {
      setSavedBlueprints(listSavedBlueprints());
    }
    refreshSavedBlueprints();
    window.addEventListener('oneshot:blueprints-changed', refreshSavedBlueprints);
    window.addEventListener('storage', refreshSavedBlueprints);
    return () => {
      window.removeEventListener('oneshot:blueprints-changed', refreshSavedBlueprints);
      window.removeEventListener('storage', refreshSavedBlueprints);
    };
  }, []);

  useEffect(() => {
    function refreshSavedViews() {
      setSavedViews(listSavedLibraryViews());
    }
    refreshSavedViews();
    window.addEventListener('oneshot:library-views-changed', refreshSavedViews);
    window.addEventListener('storage', refreshSavedViews);
    return () => {
      window.removeEventListener('oneshot:library-views-changed', refreshSavedViews);
      window.removeEventListener('storage', refreshSavedViews);
    };
  }, []);

  useEffect(() => {
    function refreshTransferHistory() {
      setTransferHistory(listLibraryTransferHistory());
    }
    refreshTransferHistory();
    window.addEventListener('oneshot:library-transfer-history-changed', refreshTransferHistory);
    window.addEventListener('storage', refreshTransferHistory);
    return () => {
      window.removeEventListener('oneshot:library-transfer-history-changed', refreshTransferHistory);
      window.removeEventListener('storage', refreshTransferHistory);
    };
  }, []);

  useEffect(() => {
    function refreshInspiration() {
      setInspirationBoards(listInspirationBoards());
      setInspirationPins(listInspirationPins());
    }
    refreshInspiration();
    window.addEventListener('oneshot:inspiration-changed', refreshInspiration);
    window.addEventListener('storage', refreshInspiration);
    return () => {
      window.removeEventListener('oneshot:inspiration-changed', refreshInspiration);
      window.removeEventListener('storage', refreshInspiration);
    };
  }, []);

  const libraryResults = useMemo(
    () => buildLibraryResults({
      query,
      sourceFilter,
      outputFilter,
      recencyFilter,
      savedBlueprints,
      inspirationBoards,
      inspirationPins,
      projects,
    }),
    [
      inspirationBoards,
      inspirationPins,
      outputFilter,
      projects,
      query,
      recencyFilter,
      savedBlueprints,
      sourceFilter,
    ],
  );

  const currentFilters: LibraryViewFilters = {
    query,
    sourceFilter,
    outputFilter,
    recencyFilter,
  };
  const savedViewGroups = useMemo(() => groupSavedLibraryViews(savedViews), [savedViews]);

  function applySavedView(view: SavedLibraryView) {
    setQuery(view.query);
    setSourceFilter(view.sourceFilter);
    setOutputFilter(view.outputFilter);
    setRecencyFilter(view.recencyFilter);
  }

  function saveCurrentView() {
    const fallbackName = buildSavedViewName(currentFilters);
    const name = window.prompt('Name this Library Search view', fallbackName);
    const cleanedName = name?.trim();
    if (!cleanedName) return;
    saveLibraryView({
      ...currentFilters,
      name: cleanedName,
    });
  }

  function editSavedViewContext(view: SavedLibraryView) {
    const collection = window.prompt('Collection, client, or production lane for this Library Search view', view.collection ?? '');
    if (collection === null) return;
    const owner = window.prompt('Owner or studio context for this Library Search view', view.owner ?? '');
    if (owner === null) return;
    const note = window.prompt('When should this Library Search view be used?', view.note ?? '');
    if (note === null) return;
    updateLibraryViewContext(view.id, {
      collection: cleanOptionalText(collection),
      owner: cleanOptionalText(owner),
      note: cleanOptionalText(note),
    });
  }

  function duplicateSavedView(view: SavedLibraryView) {
    const fallbackName = `${view.name} copy`;
    const name = window.prompt('Name this duplicated Library Search view', fallbackName);
    const cleanedName = name?.trim();
    if (!cleanedName) return;
    duplicateLibraryView(view, cleanedName);
  }

  function replayTransferHistory(entry: LibraryTransferHistoryEntry) {
    if (entry.direction !== 'import' || !entry.replayViews?.length) return;
    setExportPreviewOpen(false);
    setPendingImportViews(entry.replayViews);
    setImportConflictMode(entry.conflictMode ?? 'rename');
    setViewImportError('');
    setViewImportStatus(`Replaying ${entry.replayViews.length} Library Search view${entry.replayViews.length === 1 ? '' : 's'} from transfer history.`);
  }

  function editTransferHistoryNote(entry: LibraryTransferHistoryEntry) {
    const note = window.prompt('Client, machine, or production-lane note for this transfer', entry.note ?? '');
    if (note === null) return;
    updateLibraryTransferHistoryNote(entry.id, cleanOptionalText(note));
  }

  function exportTransferHistory() {
    if (transferHistory.length === 0) return;
    const packet: LibraryTransferHistoryExport = {
      schema: TRANSFER_HISTORY_SCHEMA,
      exportedAt: Date.now(),
      entries: transferHistory,
    };
    const blob = new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'oneshot-library-search-transfer-history.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportSavedViews() {
    if (savedViews.length === 0) return;
    const packet: LibraryViewsExport = {
      schema: SAVED_VIEWS_SCHEMA,
      exportedAt: Date.now(),
      views: savedViews,
    };
    const blob = new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'oneshot-library-search-views.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    addLibraryTransferHistory({
      direction: 'export',
      viewCount: savedViews.length,
      conflictCount: 0,
    });
  }

  function confirmViewImport() {
    if (!pendingImportViews) return;
    const importPlan = buildLibraryViewImportPlan(pendingImportViews, savedViews, importConflictMode);
    const imported = importLibraryViews({
      schema: SAVED_VIEWS_SCHEMA,
      exportedAt: Date.now(),
      views: pendingImportViews,
    }, importConflictMode);
    addLibraryTransferHistory({
      direction: 'import',
      viewCount: pendingImportViews.length,
      importedCount: imported.length,
      conflictCount: countLibraryViewImportConflicts(pendingImportViews, savedViews),
      conflictMode: importConflictMode,
      actions: countLibraryImportActions(importPlan),
      replayViews: pendingImportViews,
    });
    setPendingImportViews(null);
    setViewImportError('');
    setViewImportStatus(`Imported ${imported.length} Library Search view${imported.length === 1 ? '' : 's'}.`);
  }

  function handleViewImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setViewImportStatus('');
    setViewImportError('');
    setPendingImportViews(null);
    if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
      setViewImportError('Choose a OneShot Library Search views JSON file.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        const packet = normalizeLibraryViewsExport(JSON.parse(text));
        if (!packet) {
          setViewImportError('This file is not a valid OneShot Library Search views export.');
          return;
        }
        setPendingImportViews(packet.views);
        setViewImportStatus(`Previewing ${packet.views.length} Library Search view${packet.views.length === 1 ? '' : 's'}.`);
      } catch {
        setViewImportError('This Library Search views file could not be imported.');
      } finally {
        event.target.value = '';
      }
    };
    reader.onerror = () => {
      setViewImportError('This Library Search views file could not be imported.');
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  return (
    <section className="oneshot-library-search" aria-label="OneShot library search">
      <div className="oneshot-library-search-head">
        <div>
          <h2>Library search</h2>
          <p>Search saved blueprints, Inspiration boards, and generated project records.</p>
        </div>
        <div className="oneshot-library-search-stats" aria-label="Library search scope">
          <span>{savedBlueprints.length} blueprints</span>
          <span>{inspirationBoards.length} boards</span>
          <span>{projects.length} projects</span>
        </div>
      </div>
      <label className="oneshot-search oneshot-library-search-box">
        <Icon name="search" size={14} />
        <span className="sr-only">Search OneShot library</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search blueprints, boards, and projects"
        />
      </label>
      <div className="oneshot-library-filters" aria-label="Library filters">
        <label>
          <span>Source</span>
          <select
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value as LibrarySourceFilter)}
          >
            <option value="all">All sources</option>
            <option value="Blueprint">Blueprints</option>
            <option value="Board">Inspiration boards</option>
            <option value="Project">Projects</option>
          </select>
        </label>
        <label>
          <span>Output</span>
          <select
            value={outputFilter}
            onChange={(event) => setOutputFilter(event.target.value as LibraryOutputFilter)}
          >
            <option value="all">All output types</option>
            <option value="prototype">Prototype</option>
            <option value="deck">Deck</option>
            <option value="template">Template</option>
            <option value="visual-reference">Visual reference</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          <span>Recent</span>
          <select
            value={recencyFilter}
            onChange={(event) => setRecencyFilter(event.target.value as LibraryRecencyFilter)}
          >
            <option value="all">Any time</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        </label>
        <span className="oneshot-library-filter-count">{libraryResults.length} results</span>
      </div>
      <div className="oneshot-library-views" aria-label="Saved Library Search views">
        <div className="oneshot-library-views-head">
          <span>Saved views</span>
          <div className="oneshot-library-view-actions">
            <button type="button" className="secondary" onClick={saveCurrentView}>
              Save current view
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setExportPreviewOpen(true)}
              disabled={savedViews.length === 0}
            >
              Preview export
            </button>
            <label className="oneshot-library-view-import">
              <span>Import views</span>
              <input type="file" accept="application/json,.json" onChange={handleViewImport} />
            </label>
          </div>
        </div>
        {viewImportStatus ? (
          <small className="oneshot-library-view-status">{viewImportStatus}</small>
        ) : null}
        {viewImportError ? (
          <small className="oneshot-library-view-status error" role="alert">{viewImportError}</small>
        ) : null}
        {exportPreviewOpen ? (
          <LibraryViewTransferPreview
            title="Export preview"
            views={savedViews}
            primaryAction="Download views JSON"
            onPrimaryAction={exportSavedViews}
            secondaryAction="Close preview"
            onSecondaryAction={() => setExportPreviewOpen(false)}
          />
        ) : null}
        {pendingImportViews ? (
          <LibraryViewTransferPreview
            title="Import preview"
            views={pendingImportViews}
            existingViews={savedViews}
            conflictMode={importConflictMode}
            onConflictModeChange={setImportConflictMode}
            primaryAction="Import previewed views"
            onPrimaryAction={confirmViewImport}
            secondaryAction="Cancel import"
            onSecondaryAction={() => {
              setPendingImportViews(null);
              setViewImportStatus('');
            }}
          />
        ) : null}
        {savedViews.length > 0 ? (
          <div className="oneshot-library-view-list">
            {savedViewGroups.map((group) => (
              <div key={group.title ?? 'all-views'} className="oneshot-library-view-group">
                {group.title ? (
                  <span className="oneshot-library-view-group-title">{group.title}</span>
                ) : null}
                <div className="oneshot-library-view-group-items">
                  {group.views.map((view) => (
                    <div key={view.id} className={`oneshot-library-view-pill${view.pinnedAt ? ' pinned' : ''}`}>
                      <button type="button" onClick={() => applySavedView(view)}>
                        <strong>{view.name}</strong>
                        <span>{view.pinnedAt ? `Pinned - ${summarizeSavedView(view)}` : summarizeSavedView(view)}</span>
                        {summarizeSavedViewContext(view) ? (
                          <span className="oneshot-library-view-context">{summarizeSavedViewContext(view)}</span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        className={`oneshot-library-view-pin${view.pinnedAt ? ' active' : ''}`}
                        aria-label={`${view.pinnedAt ? 'Unpin' : 'Pin'} ${view.name} saved Library Search view`}
                        title={`${view.pinnedAt ? 'Unpin' : 'Pin'} ${view.name} saved Library Search view`}
                        onClick={() => toggleLibraryViewPin(view.id)}
                      >
                        <Icon name="pin" size={11} />
                      </button>
                      <button
                        type="button"
                        className="oneshot-library-view-edit"
                        aria-label={`Edit details for ${view.name} saved Library Search view`}
                        title={`Edit details for ${view.name} saved Library Search view`}
                        onClick={() => editSavedViewContext(view)}
                      >
                        <Icon name="edit" size={11} />
                      </button>
                      <button
                        type="button"
                        className="oneshot-library-view-duplicate"
                        aria-label={`Duplicate ${view.name} saved Library Search view`}
                        title={`Duplicate ${view.name} saved Library Search view`}
                        onClick={() => duplicateSavedView(view)}
                      >
                        <Icon name="copy" size={11} />
                      </button>
                      <button
                        type="button"
                        className="oneshot-library-view-delete"
                        aria-label={`Delete ${view.name} saved Library Search view`}
                        title={`Delete ${view.name} saved Library Search view`}
                        onClick={() => deleteLibraryView(view.id)}
                      >
                        <Icon name="close" size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="oneshot-library-view-empty">
            Save a filter set to reuse it later.
          </div>
        )}
        {transferHistory.length > 0 ? (
          <div className="oneshot-library-transfer-history" aria-label="Library Search transfer history">
            <div className="oneshot-library-transfer-history-head">
              <span>Transfer history</span>
              <div className="oneshot-library-transfer-history-head-actions">
                <button type="button" className="secondary" onClick={exportTransferHistory}>
                  Export history
                </button>
                <button type="button" className="secondary" onClick={clearLibraryTransferHistory}>
                  Clear history
                </button>
              </div>
            </div>
            <div className="oneshot-library-transfer-history-list">
              {transferHistory.slice(0, 5).map((entry) => (
                <article key={entry.id}>
                  <div>
                    <strong>{summarizeTransferHistoryTitle(entry)}</strong>
                    <span>{summarizeTransferHistoryDetail(entry)}</span>
                    {entry.note ? (
                      <span className="oneshot-library-transfer-history-note">{entry.note}</span>
                    ) : null}
                    <small>{new Date(entry.createdAt).toLocaleString()}</small>
                  </div>
                  <div className="oneshot-library-transfer-history-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => editTransferHistoryNote(entry)}
                    >
                      {entry.note ? 'Edit note' : 'Add note'}
                    </button>
                    {entry.direction === 'import' && entry.replayViews?.length ? (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => replayTransferHistory(entry)}
                      >
                        Replay import
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {libraryResults.length > 0 ? (
        <div className="oneshot-library-results">
          {libraryResults.map((result) => (
            <article key={`${result.type}-${result.id}`} className="oneshot-library-result">
              <div>
                <span>{result.type}</span>
                <strong>{result.title}</strong>
                <small>{result.detail}</small>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (result.type === 'Blueprint') {
                    const blueprint = savedBlueprints.find((item) => item.id === result.id);
                    if (!blueprint) return;
                    onCreateProject({
                      name: blueprint.name,
                      skillId: blueprint.skillId,
                      designSystemId: blueprint.designSystemId,
                      metadata: blueprint.metadata,
                      pendingPrompt: blueprint.prompt,
                    });
                    return;
                  }
                  if (result.type === 'Board') {
                    const board = inspirationBoards.find((item) => item.id === result.id);
                    if (!board) return;
                    const pins = inspirationPins.filter((pin) => pin.boardId === board.id);
                    onCreateProject({
                      name: `${board.title} reference brief`,
                      skillId: null,
                      designSystemId: null,
                      metadata: {
                        kind: 'other',
                        workflowTitle: 'OneShot Inspiration Brief',
                        workflowCategory: 'Visual reference',
                        workflowOutcome: 'Reference-backed creative direction',
                        workflowReferenceBoardId: board.id,
                        workflowReferenceBoardTitle: board.title,
                        workflowReferencePinCount: pins.length,
                      },
                      pendingPrompt: buildInspirationPrompt(board, pins),
                    });
                    return;
                  }
                  onOpenProject(result.id);
                }}
              >
                {result.action}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="oneshot-library-empty">
          No library records match this search yet.
        </div>
      )}
    </section>
  );
}

function LibraryViewTransferPreview({
  title,
  views,
  existingViews = [],
  conflictMode,
  onConflictModeChange,
  primaryAction,
  onPrimaryAction,
  secondaryAction,
  onSecondaryAction,
}: {
  title: string;
  views: SavedLibraryView[];
  existingViews?: SavedLibraryView[];
  conflictMode?: LibraryImportConflictMode;
  onConflictModeChange?: (mode: LibraryImportConflictMode) => void;
  primaryAction: string;
  onPrimaryAction: () => void;
  secondaryAction: string;
  onSecondaryAction: () => void;
}) {
  const collections = new Set(views.map((view) => view.collection).filter(Boolean));
  const pinnedCount = views.filter((view) => view.pinnedAt).length;
  const conflictCount = countLibraryViewImportConflicts(views, existingViews);
  const importPlan = conflictMode ? buildLibraryViewImportPlan(views, existingViews, conflictMode) : [];
  return (
    <div className="oneshot-library-transfer-preview" aria-label={title}>
      <div className="oneshot-library-transfer-preview-head">
        <div>
          <strong>{title}</strong>
          <span>
            {views.length} views - {collections.size} collections - {pinnedCount} pinned
          </span>
        </div>
        <div>
          <button type="button" className="secondary" onClick={onSecondaryAction}>
            {secondaryAction}
          </button>
          <button type="button" onClick={onPrimaryAction}>
            {primaryAction}
          </button>
        </div>
      </div>
      {onConflictModeChange && conflictMode ? (
        <div className="oneshot-library-transfer-conflicts">
          <div>
            <strong>{conflictCount} name conflict{conflictCount === 1 ? '' : 's'}</strong>
            <span>Choose how imported views should handle saved views with the same name.</span>
          </div>
          <label>
            <span>Import conflicts</span>
            <select
              value={conflictMode}
              onChange={(event) => onConflictModeChange(event.target.value as LibraryImportConflictMode)}
            >
              <option value="rename">Rename incoming views</option>
              <option value="replace">Replace matching views</option>
              <option value="skip">Skip matching views</option>
            </select>
          </label>
        </div>
      ) : null}
      <div className="oneshot-library-transfer-preview-list">
        {views.slice(0, 6).map((view) => (
          <span key={view.id}>
            {view.name}
            {view.collection ? ` - ${view.collection}` : ''}
          </span>
        ))}
        {views.length > 6 ? <span>+{views.length - 6} more views</span> : null}
      </div>
      {importPlan.length > 0 ? (
        <div className="oneshot-library-transfer-audit" aria-label="Import packet audit">
          {importPlan.slice(0, 6).map((item) => (
            <div key={`${item.view.id}-${item.resolvedName}`} className="oneshot-library-transfer-audit-row">
              <div>
                <strong>{formatLibraryImportAction(item.action)}</strong>
                <span>
                  {item.resolvedName}
                  {item.resolvedName !== item.view.name ? ` from ${item.view.name}` : ''}
                </span>
              </div>
              <dl>
                <div>
                  <dt>Before</dt>
                  <dd>{item.existingView ? summarizeSavedView(item.existingView) : 'No saved view'}</dd>
                </div>
                <div>
                  <dt>After</dt>
                  <dd>{item.action === 'skip' ? 'No change' : summarizeSavedView(item.view)}</dd>
                </div>
              </dl>
            </div>
          ))}
          {importPlan.length > 6 ? (
            <span className="oneshot-library-transfer-audit-more">
              +{importPlan.length - 6} more audited views
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function listSavedLibraryViews(): SavedLibraryView[] {
  try {
    const raw = localStorage.getItem(SAVED_VIEWS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedLibraryView[];
    return Array.isArray(parsed)
      ? parsed
          .filter((view) => view && typeof view.id === 'string' && typeof view.name === 'string')
          .sort(sortSavedLibraryViews)
      : [];
  } catch {
    return [];
  }
}

function listLibraryTransferHistory(): LibraryTransferHistoryEntry[] {
  try {
    const raw = localStorage.getItem(TRANSFER_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LibraryTransferHistoryEntry[];
    return Array.isArray(parsed)
      ? parsed
          .map(normalizeLibraryTransferHistoryEntry)
          .filter((entry): entry is LibraryTransferHistoryEntry => Boolean(entry))
          .sort((a, b) => b.createdAt - a.createdAt)
      : [];
  } catch {
    return [];
  }
}

function addLibraryTransferHistory(input: Omit<LibraryTransferHistoryEntry, 'id' | 'createdAt'>) {
  const entry: LibraryTransferHistoryEntry = {
    ...input,
    id: `library-transfer-${Date.now()}-${input.direction}`,
    createdAt: Date.now(),
  };
  const next = [entry, ...listLibraryTransferHistory()].slice(0, 12);
  localStorage.setItem(TRANSFER_HISTORY_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('oneshot:library-transfer-history-changed'));
}

function clearLibraryTransferHistory() {
  localStorage.removeItem(TRANSFER_HISTORY_KEY);
  window.dispatchEvent(new CustomEvent('oneshot:library-transfer-history-changed'));
}

function updateLibraryTransferHistoryNote(id: string, note?: string) {
  const next = listLibraryTransferHistory().map((entry) => (
    entry.id === id ? { ...entry, note } : entry
  ));
  localStorage.setItem(TRANSFER_HISTORY_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('oneshot:library-transfer-history-changed'));
}

function normalizeLibraryTransferHistoryEntry(payload: unknown): LibraryTransferHistoryEntry | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as Partial<LibraryTransferHistoryEntry>;
  if (candidate.direction !== 'export' && candidate.direction !== 'import') return null;
  const viewCount = Number(candidate.viewCount);
  const createdAt = Number(candidate.createdAt);
  if (!Number.isFinite(viewCount) || !Number.isFinite(createdAt)) return null;
  return {
    id: typeof candidate.id === 'string' ? candidate.id : crypto.randomUUID(),
    direction: candidate.direction,
    createdAt,
    viewCount,
    note: cleanOptionalText(candidate.note),
    importedCount: Number.isFinite(candidate.importedCount) ? Number(candidate.importedCount) : undefined,
    conflictCount: Number.isFinite(candidate.conflictCount) ? Number(candidate.conflictCount) : undefined,
    conflictMode: normalizeConflictMode(candidate.conflictMode),
    actions: normalizeImportActionCounts(candidate.actions),
    replayViews: normalizeHistoryReplayViews(candidate.replayViews),
  };
}

function saveLibraryView(input: Omit<SavedLibraryView, 'id' | 'createdAt'>) {
  const existing = listSavedLibraryViews().find((item) => item.name === input.name);
  const view: SavedLibraryView = {
    ...input,
    id: `library-view-${Date.now()}-${slugify(input.name) || crypto.randomUUID()}`,
    createdAt: Date.now(),
    collection: existing?.collection,
    owner: existing?.owner,
    note: existing?.note,
    pinnedAt: existing?.pinnedAt,
  };
  const next = [
    view,
    ...listSavedLibraryViews().filter((item) => item.name !== input.name),
  ].slice(0, 8);
  localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('oneshot:library-views-changed'));
}

function updateLibraryViewContext(
  id: string,
  context: Pick<SavedLibraryView, 'collection' | 'owner' | 'note'>,
) {
  const next = listSavedLibraryViews().map((view) => (
    view.id === id
      ? { ...view, collection: context.collection, owner: context.owner, note: context.note }
      : view
  ));
  localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('oneshot:library-views-changed'));
}

function duplicateLibraryView(view: SavedLibraryView, name: string) {
  const now = Date.now();
  const duplicate: SavedLibraryView = {
    ...view,
    id: `library-view-${now}-${slugify(name) || crypto.randomUUID()}`,
    name,
    createdAt: now,
    pinnedAt: undefined,
  };
  const next = [
    duplicate,
    ...listSavedLibraryViews().filter((item) => item.name !== name),
  ].slice(0, 8);
  localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('oneshot:library-views-changed'));
}

function toggleLibraryViewPin(id: string) {
  const now = Date.now();
  const next = listSavedLibraryViews()
    .map((view) => (
      view.id === id
        ? { ...view, pinnedAt: view.pinnedAt ? undefined : now }
        : view
    ))
    .sort(sortSavedLibraryViews);
  localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('oneshot:library-views-changed'));
}

function importLibraryViews(
  payload: unknown,
  conflictMode: LibraryImportConflictMode = 'rename',
): SavedLibraryView[] {
  const packet = normalizeLibraryViewsExport(payload);
  if (!packet) return [];
  const now = Date.now();
  const existingViews = listSavedLibraryViews();
  const importPlan = buildLibraryViewImportPlan(packet.views, existingViews, conflictMode);
  const imported = importPlan
    .filter((item) => item.action !== 'skip')
    .map((item, index) => ({
      ...item.view,
      id: `library-view-${now}-${index}-${slugify(item.resolvedName) || crypto.randomUUID()}`,
      name: item.resolvedName,
      createdAt: Number.isFinite(item.view.createdAt) ? item.view.createdAt : now + index,
    }));
  const importedNames = new Set(imported.map((view) => libraryViewNameKey(view.name)));
  const next = [
    ...imported,
    ...existingViews.filter((view) => (
      conflictMode === 'replace'
        ? !importedNames.has(libraryViewNameKey(view.name))
        : true
    )),
  ].slice(0, 8);
  localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('oneshot:library-views-changed'));
  return imported;
}

function deleteLibraryView(id: string) {
  const next = listSavedLibraryViews().filter((view) => view.id !== id);
  localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('oneshot:library-views-changed'));
}

function normalizeLibraryViewsExport(payload: unknown): LibraryViewsExport | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as Partial<LibraryViewsExport>;
  if (candidate.schema !== SAVED_VIEWS_SCHEMA || !Array.isArray(candidate.views)) return null;
  const views = candidate.views
    .map(normalizeSavedLibraryView)
    .filter((view): view is SavedLibraryView => Boolean(view));
  if (views.length === 0) return null;
  return {
    schema: SAVED_VIEWS_SCHEMA,
    exportedAt: Number.isFinite(candidate.exportedAt) ? Number(candidate.exportedAt) : Date.now(),
    views,
  };
}

function normalizeSavedLibraryView(payload: unknown): SavedLibraryView | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as Partial<SavedLibraryView>;
  const name = candidate.name?.trim();
  if (!name) return null;
  const sourceFilter = normalizeSourceFilter(candidate.sourceFilter);
  const outputFilter = normalizeViewOutputFilter(candidate.outputFilter);
  const recencyFilter = normalizeRecencyFilter(candidate.recencyFilter);
  return {
    id: typeof candidate.id === 'string' ? candidate.id : crypto.randomUUID(),
    name,
    query: typeof candidate.query === 'string' ? candidate.query : '',
    sourceFilter,
    outputFilter,
    recencyFilter,
    createdAt: Number.isFinite(candidate.createdAt) ? Number(candidate.createdAt) : Date.now(),
    collection: cleanOptionalText(candidate.collection),
    owner: cleanOptionalText(candidate.owner),
    note: cleanOptionalText(candidate.note),
    pinnedAt: Number.isFinite(candidate.pinnedAt) ? Number(candidate.pinnedAt) : undefined,
  };
}

function groupSavedLibraryViews(views: SavedLibraryView[]) {
  const hasCollections = views.some((view) => view.collection);
  if (!hasCollections) return [{ title: null as string | null, views }];
  const groups: Array<{ title: string; views: SavedLibraryView[] }> = [];
  for (const view of views) {
    const title = view.collection ?? 'Ungrouped';
    const existing = groups.find((group) => group.title === title);
    if (existing) {
      existing.views.push(view);
    } else {
      groups.push({ title, views: [view] });
    }
  }
  return groups;
}

function sortSavedLibraryViews(a: SavedLibraryView, b: SavedLibraryView) {
  if (a.pinnedAt && b.pinnedAt) return b.pinnedAt - a.pinnedAt;
  if (a.pinnedAt) return -1;
  if (b.pinnedAt) return 1;
  return b.createdAt - a.createdAt;
}

function countLibraryViewImportConflicts(incomingViews: SavedLibraryView[], existingViews: SavedLibraryView[]) {
  const existingKeys = new Set(existingViews.map((view) => libraryViewNameKey(view.name)));
  return incomingViews.filter((view) => existingKeys.has(libraryViewNameKey(view.name))).length;
}

function countLibraryImportActions(plan: LibraryViewImportPlanItem[]) {
  return plan.reduce<Partial<Record<LibraryImportAction, number>>>((counts, item) => {
    counts[item.action] = (counts[item.action] ?? 0) + 1;
    return counts;
  }, {});
}

function buildLibraryViewImportPlan(
  incomingViews: SavedLibraryView[],
  existingViews: SavedLibraryView[],
  conflictMode: LibraryImportConflictMode,
): LibraryViewImportPlanItem[] {
  const existingByName = new Map(existingViews.map((view) => [libraryViewNameKey(view.name), view]));
  const reservedKeys = new Set(existingViews.map((view) => libraryViewNameKey(view.name)));
  const replacedKeys = new Set<string>();
  return incomingViews.map((view) => {
    const viewNameKey = libraryViewNameKey(view.name);
    const existingView = existingByName.get(viewNameKey);
    const hasReservedName = reservedKeys.has(viewNameKey);
    if (existingView && conflictMode === 'skip') {
      return {
        view,
        existingView,
        action: 'skip',
        resolvedName: view.name,
      };
    }
    if (existingView && conflictMode === 'replace' && !replacedKeys.has(viewNameKey)) {
      replacedKeys.add(viewNameKey);
      reservedKeys.add(viewNameKey);
      return {
        view,
        existingView,
        action: 'replace',
        resolvedName: view.name,
      };
    }
    if (hasReservedName) {
      const resolvedName = buildImportedLibraryViewName(view.name, reservedKeys);
      reservedKeys.add(libraryViewNameKey(resolvedName));
      return {
        view,
        existingView,
        action: 'rename',
        resolvedName,
      };
    }
    reservedKeys.add(libraryViewNameKey(view.name));
    return {
      view,
      action: 'create',
      resolvedName: view.name,
    };
  });
}

function formatLibraryImportAction(action: LibraryImportAction) {
  switch (action) {
    case 'create':
      return 'Create';
    case 'rename':
      return 'Rename';
    case 'replace':
      return 'Replace';
    case 'skip':
      return 'Skip';
    default:
      return 'Create';
  }
}

function summarizeTransferHistoryTitle(entry: LibraryTransferHistoryEntry) {
  if (entry.direction === 'export') {
    return `Exported ${entry.viewCount} Library Search view${entry.viewCount === 1 ? '' : 's'}`;
  }
  const importedCount = entry.importedCount ?? 0;
  return `Imported ${importedCount} of ${entry.viewCount} Library Search view${entry.viewCount === 1 ? '' : 's'}`;
}

function summarizeTransferHistoryDetail(entry: LibraryTransferHistoryEntry) {
  if (entry.direction === 'export') {
    return 'Downloaded portable OneShot JSON packet.';
  }
  const actions = formatImportActionCounts(entry.actions);
  const conflictMode = entry.conflictMode ? `Mode: ${formatConflictMode(entry.conflictMode)}` : '';
  const conflicts = `${entry.conflictCount ?? 0} conflict${entry.conflictCount === 1 ? '' : 's'}`;
  return [conflictMode, conflicts, actions].filter(Boolean).join(' - ');
}

function formatImportActionCounts(actions?: Partial<Record<LibraryImportAction, number>>) {
  if (!actions) return '';
  return (['create', 'rename', 'replace', 'skip'] as LibraryImportAction[])
    .map((action) => actions[action] ? `${actions[action]} ${action}` : '')
    .filter(Boolean)
    .join(', ');
}

function formatConflictMode(mode: LibraryImportConflictMode) {
  switch (mode) {
    case 'rename':
      return 'Rename';
    case 'replace':
      return 'Replace';
    case 'skip':
      return 'Skip';
    default:
      return 'Rename';
  }
}

function normalizeConflictMode(mode: unknown): LibraryImportConflictMode | undefined {
  return mode === 'rename' || mode === 'replace' || mode === 'skip' ? mode : undefined;
}

function normalizeImportActionCounts(actions: unknown) {
  if (!actions || typeof actions !== 'object') return undefined;
  const candidate = actions as Partial<Record<LibraryImportAction, number>>;
  return (['create', 'rename', 'replace', 'skip'] as LibraryImportAction[])
    .reduce<Partial<Record<LibraryImportAction, number>>>((counts, action) => {
      const value = Number(candidate[action]);
      if (Number.isFinite(value) && value > 0) counts[action] = value;
      return counts;
    }, {});
}

function normalizeHistoryReplayViews(views: unknown) {
  if (!Array.isArray(views)) return undefined;
  const normalized = views
    .map(normalizeSavedLibraryView)
    .filter((view): view is SavedLibraryView => Boolean(view))
    .slice(0, 8);
  return normalized.length > 0 ? normalized : undefined;
}

function buildImportedLibraryViewName(name: string, reservedKeys: Set<string>) {
  const baseName = `${name} imported`;
  if (!reservedKeys.has(libraryViewNameKey(baseName))) return baseName;
  let suffix = 2;
  while (reservedKeys.has(libraryViewNameKey(`${baseName} ${suffix}`))) {
    suffix += 1;
  }
  return `${baseName} ${suffix}`;
}

function libraryViewNameKey(name: string) {
  return name.trim().toLowerCase();
}

function buildSavedViewName(filters: LibraryViewFilters) {
  const parts = [
    filters.sourceFilter === 'all' ? '' : filters.sourceFilter,
    filters.outputFilter === 'all' ? '' : formatOutputFilter(filters.outputFilter),
    filters.recencyFilter === 'all' ? '' : formatRecencyFilter(filters.recencyFilter),
    filters.query.trim() || '',
  ].filter(Boolean);
  return parts.length ? parts.join(' / ') : 'Library view';
}

function summarizeSavedView(view: LibraryViewFilters) {
  const parts = [
    view.sourceFilter === 'all' ? 'All sources' : view.sourceFilter,
    view.outputFilter === 'all' ? 'All outputs' : formatOutputFilter(view.outputFilter),
    view.recencyFilter === 'all' ? 'Any time' : formatRecencyFilter(view.recencyFilter),
    view.query.trim() ? `"${view.query.trim()}"` : '',
  ].filter(Boolean);
  return parts.join(' - ');
}

function summarizeSavedViewContext(view: Pick<SavedLibraryView, 'collection' | 'owner' | 'note'>) {
  return [
    view.collection ? `Collection: ${view.collection}` : '',
    view.owner ? `Owner: ${view.owner}` : '',
    view.note ?? '',
  ].filter(Boolean).join(' - ');
}

function cleanOptionalText(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim();
  return cleaned || undefined;
}

function formatOutputFilter(value: LibraryOutputFilter) {
  if (value === 'visual-reference') return 'Visual reference';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatRecencyFilter(value: LibraryRecencyFilter) {
  if (value === '7d') return 'Last 7 days';
  if (value === '30d') return 'Last 30 days';
  if (value === '90d') return 'Last 90 days';
  return 'Any time';
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildLibraryResults({
  query,
  sourceFilter,
  outputFilter,
  recencyFilter,
  savedBlueprints,
  inspirationBoards,
  inspirationPins,
  projects,
}: {
  query: string;
  sourceFilter: LibrarySourceFilter;
  outputFilter: LibraryOutputFilter;
  recencyFilter: LibraryRecencyFilter;
  savedBlueprints: SavedWorkflowBlueprint[];
  inspirationBoards: InspirationBoard[];
  inspirationPins: InspirationPin[];
  projects: Project[];
}) {
  const needle = query.trim().toLowerCase();
  const blueprintResults = savedBlueprints.map((blueprint) => ({
    id: blueprint.id,
    type: 'Blueprint' as const,
    outputType: normalizeProjectOutputType(blueprint.metadata.kind),
    title: blueprint.name,
    detail: [
      blueprint.collection ? `Collection: ${blueprint.collection}` : '',
      blueprint.metadata.workflowCategory,
      blueprint.metadata.workflowOutcome,
    ].filter(Boolean).join(' - ') || 'Reusable workflow prompt',
    action: `Start ${blueprint.name}`,
    timestamp: blueprint.pinnedAt ?? blueprint.createdAt,
    searchText: [
      blueprint.name,
      blueprint.collection,
      blueprint.metadata.workflowCategory,
      blueprint.metadata.workflowOutcome,
      blueprint.metadata.workflowTitle,
      blueprint.prompt,
    ].filter(Boolean).join(' ').toLowerCase(),
  }));
  const boardResults = inspirationBoards.map((board) => {
    const boardPins = inspirationPins.filter((pin) => pin.boardId === board.id);
    return {
      id: board.id,
      type: 'Board' as const,
      outputType: 'visual-reference' as const,
      title: board.title,
      detail: `${boardPins.length} pins${board.tags.length ? ` - ${board.tags.join(', ')}` : ''}`,
      action: `Create brief from ${board.title}`,
      timestamp: board.updatedAt,
      searchText: [
        board.title,
        board.description,
        ...board.tags,
        ...boardPins.flatMap((pin) => [
          pin.title,
          pin.sourceUrl,
          pin.note,
          pin.usageNote,
          ...pin.tags,
        ]),
      ].filter(Boolean).join(' ').toLowerCase(),
    };
  });
  const projectResults = projects.map((project) => ({
    id: project.id,
    type: 'Project' as const,
    outputType: normalizeProjectOutputType(project.metadata?.kind),
    title: project.name,
    detail: [
      project.metadata?.workflowCategory,
      project.metadata?.workflowOutcome,
      project.metadata?.kind,
    ].filter(Boolean).join(' - ') || 'Generated project record',
    action: `Open ${project.name}`,
    timestamp: project.updatedAt,
    searchText: [
      project.name,
      project.metadata?.workflowTitle,
      project.metadata?.workflowCategory,
      project.metadata?.workflowOutcome,
      project.metadata?.kind,
      project.pendingPrompt,
    ].filter(Boolean).join(' ').toLowerCase(),
  }));

  return [...blueprintResults, ...boardResults, ...projectResults]
    .filter((result) => !needle || result.searchText.includes(needle))
    .filter((result) => sourceFilter === 'all' || result.type === sourceFilter)
    .filter((result) => outputFilter === 'all' || result.outputType === outputFilter)
    .filter((result) => matchesRecency(result.timestamp, recencyFilter))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, needle ? 8 : 6);
}

function normalizeSourceFilter(value: unknown): LibrarySourceFilter {
  if (value === 'Blueprint' || value === 'Board' || value === 'Project') return value;
  return 'all';
}

function normalizeViewOutputFilter(value: unknown): LibraryOutputFilter {
  if (
    value === 'prototype' ||
    value === 'deck' ||
    value === 'template' ||
    value === 'visual-reference' ||
    value === 'other'
  ) {
    return value;
  }
  return 'all';
}

function normalizeRecencyFilter(value: unknown): LibraryRecencyFilter {
  if (value === '7d' || value === '30d' || value === '90d') return value;
  return 'all';
}

function normalizeProjectOutputType(kind: ProjectKind | undefined): LibraryOutputFilter {
  if (kind === 'prototype' || kind === 'deck' || kind === 'template' || kind === 'other') {
    return kind;
  }
  return 'other';
}

function matchesRecency(timestamp: number, recency: LibraryRecencyFilter) {
  if (recency === 'all') return true;
  const days = recency === '7d' ? 7 : recency === '30d' ? 30 : 90;
  return timestamp >= Date.now() - days * 24 * 60 * 60 * 1000;
}

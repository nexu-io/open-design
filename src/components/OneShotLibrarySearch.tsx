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
  owner?: string;
  note?: string;
  pinnedAt?: number;
}

const SAVED_VIEWS_KEY = 'oneshot:library-search-views';
const SAVED_VIEWS_SCHEMA = 'oneshot.library-search-views.v1';

interface LibraryViewsExport {
  schema: typeof SAVED_VIEWS_SCHEMA;
  exportedAt: number;
  views: SavedLibraryView[];
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
  const [viewImportStatus, setViewImportStatus] = useState('');
  const [viewImportError, setViewImportError] = useState('');
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
    const owner = window.prompt('Owner or studio context for this Library Search view', view.owner ?? '');
    if (owner === null) return;
    const note = window.prompt('When should this Library Search view be used?', view.note ?? '');
    if (note === null) return;
    updateLibraryViewContext(view.id, {
      owner: cleanOptionalText(owner),
      note: cleanOptionalText(note),
    });
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
  }

  function handleViewImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setViewImportStatus('');
    setViewImportError('');
    if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
      setViewImportError('Choose a OneShot Library Search views JSON file.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        const imported = importLibraryViews(JSON.parse(text));
        if (imported.length === 0) {
          setViewImportError('This file is not a valid OneShot Library Search views export.');
          return;
        }
        setViewImportStatus(`Imported ${imported.length} Library Search view${imported.length === 1 ? '' : 's'}.`);
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
              onClick={exportSavedViews}
              disabled={savedViews.length === 0}
            >
              Export views
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
        {savedViews.length > 0 ? (
          <div className="oneshot-library-view-list">
            {savedViews.map((view) => (
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
        ) : (
          <div className="oneshot-library-view-empty">
            Save a filter set to reuse it later.
          </div>
        )}
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

function saveLibraryView(input: Omit<SavedLibraryView, 'id' | 'createdAt'>) {
  const existing = listSavedLibraryViews().find((item) => item.name === input.name);
  const view: SavedLibraryView = {
    ...input,
    id: `library-view-${Date.now()}-${slugify(input.name) || crypto.randomUUID()}`,
    createdAt: Date.now(),
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
  context: Pick<SavedLibraryView, 'owner' | 'note'>,
) {
  const next = listSavedLibraryViews().map((view) => (
    view.id === id
      ? { ...view, owner: context.owner, note: context.note }
      : view
  ));
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

function importLibraryViews(payload: unknown): SavedLibraryView[] {
  const packet = normalizeLibraryViewsExport(payload);
  if (!packet) return [];
  const now = Date.now();
  const imported = packet.views.map((view, index) => ({
    ...view,
    id: `library-view-${now}-${index}-${slugify(view.name) || crypto.randomUUID()}`,
    createdAt: Number.isFinite(view.createdAt) ? view.createdAt : now + index,
  }));
  const importedNames = new Set(imported.map((view) => view.name));
  const next = [
    ...imported,
    ...listSavedLibraryViews().filter((view) => !importedNames.has(view.name)),
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
    owner: cleanOptionalText(candidate.owner),
    note: cleanOptionalText(candidate.note),
    pinnedAt: Number.isFinite(candidate.pinnedAt) ? Number(candidate.pinnedAt) : undefined,
  };
}

function sortSavedLibraryViews(a: SavedLibraryView, b: SavedLibraryView) {
  if (a.pinnedAt && b.pinnedAt) return b.pinnedAt - a.pinnedAt;
  if (a.pinnedAt) return -1;
  if (b.pinnedAt) return 1;
  return b.createdAt - a.createdAt;
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

function summarizeSavedViewContext(view: Pick<SavedLibraryView, 'owner' | 'note'>) {
  return [
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

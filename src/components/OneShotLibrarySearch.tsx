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

export function OneShotLibrarySearch({
  projects,
  onCreateProject,
  onOpenProject,
}: Props) {
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<LibrarySourceFilter>('all');
  const [outputFilter, setOutputFilter] = useState<LibraryOutputFilter>('all');
  const [recencyFilter, setRecencyFilter] = useState<LibraryRecencyFilter>('all');
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
    outputType: normalizeOutputType(blueprint.metadata.kind),
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
    outputType: normalizeOutputType(project.metadata?.kind),
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

function normalizeOutputType(kind: ProjectKind | undefined): LibraryOutputFilter {
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

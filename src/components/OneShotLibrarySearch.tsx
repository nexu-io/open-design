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
  SavedWorkflowBlueprint,
} from '../types';
import { Icon } from './Icon';
import type { CreateInput } from './NewProjectPanel';

interface Props {
  projects: Project[];
  onCreateProject: (input: CreateInput & { pendingPrompt?: string }) => void;
  onOpenProject: (id: string) => void;
}

export function OneShotLibrarySearch({
  projects,
  onCreateProject,
  onOpenProject,
}: Props) {
  const [query, setQuery] = useState('');
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
      savedBlueprints,
      inspirationBoards,
      inspirationPins,
      projects,
    }),
    [inspirationBoards, inspirationPins, projects, query, savedBlueprints],
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
  savedBlueprints,
  inspirationBoards,
  inspirationPins,
  projects,
}: {
  query: string;
  savedBlueprints: SavedWorkflowBlueprint[];
  inspirationBoards: InspirationBoard[];
  inspirationPins: InspirationPin[];
  projects: Project[];
}) {
  const needle = query.trim().toLowerCase();
  const blueprintResults = savedBlueprints.map((blueprint) => ({
    id: blueprint.id,
    type: 'Blueprint' as const,
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
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, needle ? 8 : 6);
}

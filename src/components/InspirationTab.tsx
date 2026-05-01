import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import type { InspirationBoard, InspirationPin, ProjectKind } from '../types';
import type { CreateInput } from './NewProjectPanel';
import {
  buildInspirationPrompt,
  createInspirationBoard,
  createInspirationPin,
  deleteInspirationBoard,
  deleteInspirationPin,
  exportInspirationBoard,
  importInspirationBoard,
  listInspirationBoards,
  listInspirationPins,
  parseTags,
  updateInspirationBoard,
  updateInspirationPin,
} from '../state/inspiration';
import { Icon } from './Icon';

interface Props {
  onCreateProject: (input: CreateInput & { pendingPrompt?: string }) => void;
}

interface BoardWorkflowRecommendation {
  id: string;
  title: string;
  category: string;
  outcome: string;
  kind: ProjectKind;
  keywords: string[];
  checkpoints: string[];
  prompt: string;
}

const BOARD_WORKFLOW_RECOMMENDATIONS: BoardWorkflowRecommendation[] = [
  {
    id: 'oneshot-cover-run',
    title: 'OneShot Cover Run',
    category: 'Book cover production',
    outcome: 'CoverVisionOS run packet',
    kind: 'template',
    keywords: ['book', 'cover', 'covers', 'publishing', 'genre', 'author', 'kdp', 'spine', 'typography'],
    checkpoints: ['Genre fit', 'Art direction', 'Typography', 'Print specs'],
    prompt: 'Create a professional CoverVisionOS run packet from this board. Extract genre signals, composition directions, type hierarchy, palette, print risks, and a production-ready prompt packet.',
  },
  {
    id: 'ios-26-app-prototype',
    title: 'iOS 26 App Prototype',
    category: 'Mobile app',
    outcome: 'Liquid Glass iPhone concept',
    kind: 'prototype',
    keywords: ['ios', 'iphone', 'mobile', 'app', 'glass', 'liquid', 'widget', 'tab', 'sheet'],
    checkpoints: ['Layer model', 'Glass tiers', 'Safe areas', 'Accessibility'],
    prompt: 'Create a high-fidelity iOS 26 Liquid Glass prototype from this board. Extract glass hierarchy, mobile controls, safe-area behavior, accessibility risks, and screen-level direction.',
  },
  {
    id: 'dashboard-mockup',
    title: 'Dashboard Mockup',
    category: 'Product prototype',
    outcome: 'Operational UI concept',
    kind: 'prototype',
    keywords: ['dashboard', 'saas', 'table', 'operator', 'crm', 'metrics', 'analytics', 'pipeline', 'admin'],
    checkpoints: ['Information density', 'Decision flow', 'Audit trail', 'Responsiveness'],
    prompt: 'Create an operational dashboard mockup from this board. Extract information hierarchy, navigation density, tables, status treatment, trust cues, and responsive behavior.',
  },
  {
    id: 'bsa-proposal-sow',
    title: 'BSA Proposal + SOW',
    category: 'Business artifact',
    outcome: 'Client-ready proposal package',
    kind: 'deck',
    keywords: ['proposal', 'sow', 'client', 'scope', 'pricing', 'service', 'roofing', 'business', 'sales'],
    checkpoints: ['Brief lock', 'Offer fit', 'Scope clarity', 'Follow-up'],
    prompt: 'Create a client-ready proposal and SOW package from this board. Extract offer framing, proof points, scope, timeline, pricing story, and follow-up material.',
  },
  {
    id: 'roofing-pitch-deck',
    title: 'Roofing Pitch Deck',
    category: 'Sales deck',
    outcome: 'Storm-response sales story',
    kind: 'deck',
    keywords: ['roofing', 'storm', 'deck', 'pitch', 'estimate', 'quote', 'contractor', 'lead', 'roi'],
    checkpoints: ['Hook', 'Proof', 'ROI', 'Owner decision'],
    prompt: 'Create a roofing contractor pitch deck from this board. Extract the story arc, sales visuals, proof panels, ROI framing, and owner decision flow.',
  },
  {
    id: 'prd-factory',
    title: 'PRD Factory',
    category: 'Product brief',
    outcome: 'Build-ready spec',
    kind: 'template',
    keywords: ['prd', 'spec', 'requirements', 'product', 'brief', 'flow', 'ux', 'acceptance', 'build'],
    checkpoints: ['Problem', 'Requirements', 'UX flow', 'Acceptance tests'],
    prompt: 'Create a build-ready PRD from this board. Extract user jobs, product requirements, UX flows, acceptance tests, risks, and implementation phases.',
  },
  {
    id: 'motion-explainer',
    title: 'Motion Explainer',
    category: 'Motion asset',
    outcome: 'Shot list + animated HTML brief',
    kind: 'prototype',
    keywords: ['motion', 'video', 'explainer', 'animation', 'storyboard', 'caption', 'scene', 'social', 'launch'],
    checkpoints: ['Narrative', 'Scene rhythm', 'Caption clarity', 'Export plan'],
    prompt: 'Create a motion explainer package from this board. Extract visual rhythm, scene beats, caption tone, narrative structure, and export-ready production notes.',
  },
];

export function InspirationTab({ onCreateProject }: Props) {
  const [boards, setBoards] = useState<InspirationBoard[]>([]);
  const [pins, setPins] = useState<InspirationPin[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [boardTitle, setBoardTitle] = useState('');
  const [boardDescription, setBoardDescription] = useState('');
  const [boardTags, setBoardTags] = useState('');
  const [boardEditTitle, setBoardEditTitle] = useState('');
  const [boardEditDescription, setBoardEditDescription] = useState('');
  const [boardEditTags, setBoardEditTags] = useState('');
  const [pinTitle, setPinTitle] = useState('');
  const [pinImageUrl, setPinImageUrl] = useState('');
  const [pinSourceUrl, setPinSourceUrl] = useState('');
  const [pinNote, setPinNote] = useState('');
  const [pinUsageNote, setPinUsageNote] = useState('');
  const [pinTags, setPinTags] = useState('');
  const [pinImageName, setPinImageName] = useState('');
  const [pinImageError, setPinImageError] = useState('');
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [boardImportStatus, setBoardImportStatus] = useState('');
  const [boardImportError, setBoardImportError] = useState('');

  useEffect(() => {
    function refresh() {
      const nextBoards = listInspirationBoards();
      setBoards(nextBoards);
      setPins(listInspirationPins());
      setActiveBoardId((current) => current ?? nextBoards[0]?.id ?? null);
    }
    refresh();
    window.addEventListener('oneshot:inspiration-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('oneshot:inspiration-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const activeBoard = useMemo(
    () => boards.find((board) => board.id === activeBoardId) ?? boards[0] ?? null,
    [activeBoardId, boards],
  );

  const boardPins = useMemo(() => {
    if (!activeBoard) return [];
    const needle = query.trim().toLowerCase();
    return pins.filter((pin) => {
      if (pin.boardId !== activeBoard.id) return false;
      if (!needle) return true;
      return [
        pin.title,
        pin.note,
        pin.usageNote,
        pin.sourceUrl,
        ...pin.tags,
      ].join(' ').toLowerCase().includes(needle);
    });
  }, [activeBoard, pins, query]);

  const allTags = useMemo(
    () => Array.from(new Set(pins.flatMap((pin) => pin.tags))).slice(0, 10),
    [pins],
  );

  const workflowRecommendations = useMemo(
    () => (activeBoard ? recommendWorkflows(activeBoard, pins.filter((pin) => pin.boardId === activeBoard.id)) : []),
    [activeBoard, pins],
  );

  useEffect(() => {
    setBoardEditTitle(activeBoard?.title ?? '');
    setBoardEditDescription(activeBoard?.description ?? '');
    setBoardEditTags(activeBoard?.tags.join(', ') ?? '');
  }, [activeBoard?.id, activeBoard?.title, activeBoard?.description, activeBoard?.tags]);

  function handleCreateBoard() {
    const title = boardTitle.trim();
    if (!title) return;
    const board = createInspirationBoard({
      title,
      description: boardDescription,
      tags: parseTags(boardTags),
    });
    setBoardTitle('');
    setBoardDescription('');
    setBoardTags('');
    setActiveBoardId(board.id);
  }

  function handleCreatePin() {
    const title = pinTitle.trim();
    if (!title || !activeBoard) return;
    if (editingPinId) {
      updateInspirationPin(editingPinId, {
        title,
        imageUrl: pinImageUrl,
        sourceUrl: pinSourceUrl,
        note: pinNote,
        usageNote: pinUsageNote,
        tags: parseTags(pinTags),
      });
      resetPinForm();
      return;
    }
    createInspirationPin({
      boardId: activeBoard.id,
      title,
      imageUrl: pinImageUrl,
      sourceUrl: pinSourceUrl,
      note: pinNote,
      usageNote: pinUsageNote,
      tags: parseTags(pinTags),
    });
    resetPinForm();
  }

  function resetPinForm() {
    setPinTitle('');
    setPinImageUrl('');
    setPinSourceUrl('');
    setPinNote('');
    setPinUsageNote('');
    setPinTags('');
    setPinImageName('');
    setPinImageError('');
    setEditingPinId(null);
  }

  function startPinEdit(pin: InspirationPin) {
    setEditingPinId(pin.id);
    setPinTitle(pin.title);
    setPinImageUrl(pin.imageUrl);
    setPinSourceUrl(pin.sourceUrl);
    setPinNote(pin.note);
    setPinUsageNote(pin.usageNote);
    setPinTags(pin.tags.join(', '));
    setPinImageName(pin.imageUrl.startsWith('data:image/') ? 'existing imported image' : '');
    setPinImageError('');
  }

  function handleUpdateBoard() {
    if (!activeBoard || !boardEditTitle.trim()) return;
    updateInspirationBoard(activeBoard.id, {
      title: boardEditTitle,
      description: boardEditDescription,
      tags: parseTags(boardEditTags),
    });
  }

  function handleDeleteBoard() {
    if (!activeBoard) return;
    const boardPinCount = pins.filter((pin) => pin.boardId === activeBoard.id).length;
    const message = `Delete the "${activeBoard.title}" inspiration board and ${boardPinCount} pins?`;
    if (!window.confirm(message)) return;
    deleteInspirationBoard(activeBoard.id);
    resetPinForm();
    const nextBoard = listInspirationBoards().find((board) => board.id !== activeBoard.id) ?? null;
    setActiveBoardId(nextBoard?.id ?? null);
  }

  function handleExportBoard() {
    if (!activeBoard) return;
    const packet = exportInspirationBoard(activeBoard.id);
    if (!packet) return;
    const blob = new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slugForDownload(activeBoard.title)}-oneshot-board.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function handleBoardImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBoardImportStatus('');
    setBoardImportError('');
    if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
      setBoardImportError('Choose a OneShot board JSON file.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        const imported = importInspirationBoard(JSON.parse(text));
        if (!imported) {
          setBoardImportError('This file is not a valid OneShot board export.');
          return;
        }
        setActiveBoardId(imported.id);
        setBoardImportStatus(`Imported board: ${imported.title}`);
      } catch {
        setBoardImportError('This board file could not be imported.');
      } finally {
        event.target.value = '';
      }
    };
    reader.onerror = () => {
      setBoardImportError('This board file could not be imported.');
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  function handleImageImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPinImageError('');
    if (!file.type.startsWith('image/')) {
      setPinImageError('Choose an image file.');
      event.target.value = '';
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setPinImageError('Use a smaller reference image under 4 MB.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        setPinImageError('The image could not be imported.');
        return;
      }
      setPinImageUrl(result);
      setPinImageName(file.name);
      setPinTitle((current) => current || file.name.replace(/\.[^.]+$/, ''));
      setPinSourceUrl((current) => current || `Imported image: ${file.name}`);
      setPinUsageNote((current) => current || 'Local reference image. Confirm usage rights before direct reuse.');
    };
    reader.onerror = () => setPinImageError('The image could not be imported.');
    reader.readAsDataURL(file);
  }

  function startReferenceBrief() {
    if (!activeBoard) return;
    onCreateProject({
      name: `${activeBoard.title} reference brief`,
      skillId: null,
      designSystemId: null,
      metadata: {
        kind: 'other',
        workflowTitle: 'OneShot Inspiration Brief',
        workflowCategory: 'Visual reference',
        workflowOutcome: 'Reference-backed creative direction',
      },
      pendingPrompt: buildInspirationPrompt(activeBoard, boardPins),
    });
  }

  function startRecommendedWorkflow(recommendation: BoardWorkflowRecommendation) {
    if (!activeBoard) return;
    onCreateProject({
      name: `${activeBoard.title} - ${recommendation.title}`,
      skillId: null,
      designSystemId: null,
      metadata: {
        kind: recommendation.kind,
        workflowId: recommendation.id,
        workflowTitle: recommendation.title,
        workflowCategory: recommendation.category,
        workflowOutcome: recommendation.outcome,
        workflowCheckpoints: recommendation.checkpoints,
        workflowReferenceBoardId: activeBoard.id,
        workflowReferenceBoardTitle: activeBoard.title,
        workflowReferencePinCount: boardPins.length,
      },
      pendingPrompt: [
        recommendation.prompt,
        '',
        'Reference lock:',
        buildInspirationPrompt(activeBoard, boardPins),
      ].join('\n'),
    });
  }

  return (
    <div className="inspiration-tab">
      <section className="inspiration-hero">
        <div>
          <h1>Inspiration Library</h1>
          <p>
            Save visual references, source notes, usage constraints, and tags,
            then turn a board into a OneShot-ready creative brief.
          </p>
        </div>
        <div className="inspiration-stats" aria-label="Inspiration library stats">
          <span>{boards.length} boards</span>
          <span>{pins.length} pins</span>
          <span>{allTags.length} tag groups</span>
        </div>
      </section>

      <section className="inspiration-shell">
        <aside className="inspiration-sidebar" aria-label="Inspiration boards">
          <div className="inspiration-side-head">
            <span>Boards</span>
            <Icon name="grid" size={13} />
          </div>
          <div className="inspiration-board-list">
            {boards.map((board) => (
              <button
                key={board.id}
                type="button"
                className={board.id === activeBoard?.id ? 'active' : ''}
                onClick={() => setActiveBoardId(board.id)}
              >
                <strong>{board.title}</strong>
                <span>{pins.filter((pin) => pin.boardId === board.id).length} pins</span>
              </button>
            ))}
          </div>

          <div className="inspiration-create-board">
            <label>
              <span>New board</span>
              <input
                value={boardTitle}
                onChange={(event) => setBoardTitle(event.target.value)}
                placeholder="Board name"
              />
            </label>
            <textarea
              value={boardDescription}
              onChange={(event) => setBoardDescription(event.target.value)}
              placeholder="Purpose, audience, or project"
            />
            <input
              value={boardTags}
              onChange={(event) => setBoardTags(event.target.value)}
              placeholder="tags, separated, by commas"
            />
            <button type="button" className="primary" onClick={handleCreateBoard} disabled={!boardTitle.trim()}>
              <Icon name="plus" size={13} />
              Create board
            </button>
            <label className="inspiration-file-picker inspiration-board-import">
              <span>Import board</span>
              <input type="file" accept="application/json,.json" onChange={handleBoardImport} />
            </label>
            {boardImportStatus ? (
              <small className="inspiration-import-status">{boardImportStatus}</small>
            ) : null}
            {boardImportError ? (
              <small className="inspiration-import-status error" role="alert">{boardImportError}</small>
            ) : null}
          </div>
        </aside>

        <div className="inspiration-main">
          {activeBoard ? (
            <>
              <div className="inspiration-board-head">
                <div>
                  <h2>{activeBoard.title}</h2>
                  <p>{activeBoard.description || 'Collect source-backed visual references for this board.'}</p>
                  <div className="inspiration-tags">
                    {activeBoard.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </div>
                <button type="button" className="primary" onClick={startReferenceBrief}>
                  <Icon name="sparkles" size={13} />
                  Use as OneShot reference
                </button>
              </div>

              <div className="inspiration-board-manage" aria-label="Manage inspiration board">
                <input
                  value={boardEditTitle}
                  onChange={(event) => setBoardEditTitle(event.target.value)}
                  placeholder="Board title"
                />
                <input
                  value={boardEditTags}
                  onChange={(event) => setBoardEditTags(event.target.value)}
                  placeholder="Board tags"
                />
                <textarea
                  value={boardEditDescription}
                  onChange={(event) => setBoardEditDescription(event.target.value)}
                  placeholder="Board purpose"
                />
                <div className="inspiration-manage-actions">
                  <button type="button" className="primary" onClick={handleUpdateBoard} disabled={!boardEditTitle.trim()}>
                    <Icon name="edit" size={13} />
                    Save board
                  </button>
                  <button type="button" className="secondary" onClick={handleExportBoard}>
                    <Icon name="download" size={13} />
                    Export board
                  </button>
                  <button type="button" className="secondary danger" onClick={handleDeleteBoard}>
                    <Icon name="close" size={13} />
                    Delete board
                  </button>
                </div>
              </div>

              <div className="inspiration-recommendations" aria-label="Recommended OneShot paths">
                <div className="inspiration-recommendations-head">
                  <div>
                    <strong>Recommended OneShot paths</strong>
                    <span>Best matches from this board's tags, sources, and notes.</span>
                  </div>
                  <Icon name="sparkles" size={14} />
                </div>
                <div className="inspiration-recommendation-list">
                  {workflowRecommendations.map((recommendation) => (
                    <article key={recommendation.id} className="inspiration-recommendation-card">
                      <div>
                        <span>{recommendation.category}</span>
                        <strong>{recommendation.title}</strong>
                        <small>{recommendation.outcome}</small>
                      </div>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => startRecommendedWorkflow(recommendation)}
                      >
                        Start {recommendation.title}
                      </button>
                    </article>
                  ))}
                </div>
              </div>

              <div className="inspiration-toolbar">
                <label className="oneshot-search">
                  <Icon name="search" size={14} />
                  <span className="sr-only">Search inspiration pins</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search pins, tags, sources, or notes"
                  />
                </label>
                <div className="inspiration-tags" aria-label="Available pin tags">
                  {allTags.map((tag) => (
                    <button key={tag} type="button" onClick={() => setQuery(tag)}>
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="inspiration-add-pin" aria-label="Add inspiration pin">
                <input
                  value={pinTitle}
                  onChange={(event) => setPinTitle(event.target.value)}
                  placeholder="Reference title"
                />
                <input
                  value={pinImageUrl}
                  onChange={(event) => setPinImageUrl(event.target.value)}
                  placeholder="Image URL"
                />
                <label className="inspiration-file-picker">
                  <span>Import image</span>
                  <input type="file" accept="image/*" onChange={handleImageImport} />
                </label>
                <input
                  value={pinSourceUrl}
                  onChange={(event) => setPinSourceUrl(event.target.value)}
                  placeholder="Source URL or local reference"
                />
                <input
                  value={pinTags}
                  onChange={(event) => setPinTags(event.target.value)}
                  placeholder="tags, separated, by commas"
                />
                <textarea
                  value={pinNote}
                  onChange={(event) => setPinNote(event.target.value)}
                  placeholder="What should OneShot learn from this?"
                />
                <textarea
                  value={pinUsageNote}
                  onChange={(event) => setPinUsageNote(event.target.value)}
                  placeholder="Usage, license, or attribution note"
                />
                {pinImageName ? (
                  <small className="inspiration-import-status">Imported image: {pinImageName}</small>
                ) : null}
                {pinImageError ? (
                  <small className="inspiration-import-status error" role="alert">{pinImageError}</small>
                ) : null}
                <button type="button" className="primary" onClick={handleCreatePin} disabled={!pinTitle.trim()}>
                  <Icon name="plus" size={13} />
                  {editingPinId ? 'Update pin' : 'Add pin'}
                </button>
                {editingPinId ? (
                  <button type="button" className="secondary" onClick={resetPinForm}>
                    Cancel edit
                  </button>
                ) : null}
              </div>

              {boardPins.length > 0 ? (
                <div className="inspiration-masonry">
                  {boardPins.map((pin) => (
                    <article key={pin.id} className="inspiration-pin">
                      {pin.imageUrl ? (
                        <img src={pin.imageUrl} alt="" loading="lazy" />
                      ) : (
                        <div className="inspiration-pin-placeholder">
                          <Icon name="image" size={18} />
                        </div>
                      )}
                      <div className="inspiration-pin-body">
                        <div className="inspiration-pin-title">
                          <strong>{pin.title}</strong>
                          <div className="inspiration-pin-actions">
                            <button
                              type="button"
                              aria-label={`Edit ${pin.title} pin`}
                              title={`Edit ${pin.title} pin`}
                              onClick={() => startPinEdit(pin)}
                            >
                              <Icon name="edit" size={12} />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${pin.title} pin`}
                              title={`Delete ${pin.title} pin`}
                              onClick={() => {
                                if (!window.confirm(`Delete the "${pin.title}" inspiration pin?`)) return;
                                deleteInspirationPin(pin.id);
                              }}
                            >
                              <Icon name="close" size={12} />
                            </button>
                          </div>
                        </div>
                        {pin.note ? <p>{pin.note}</p> : null}
                        {pin.sourceUrl ? (
                          <a href={pin.sourceUrl} target="_blank" rel="noreferrer">
                            Source
                          </a>
                        ) : null}
                        {pin.usageNote ? <small>{pin.usageNote}</small> : null}
                        <div className="inspiration-tags">
                          {pin.tags.map((tag) => (
                            <span key={tag}>{tag}</span>
                          ))}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="inspiration-empty">
                  No pins match this board and search yet.
                </div>
              )}
            </>
          ) : (
            <div className="inspiration-empty">Create a board to start collecting references.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function recommendWorkflows(board: InspirationBoard, pins: InspirationPin[]) {
  const haystack = [
    board.title,
    board.description,
    ...board.tags,
    ...pins.flatMap((pin) => [
      pin.title,
      pin.sourceUrl,
      pin.note,
      pin.usageNote,
      ...pin.tags,
    ]),
  ].join(' ').toLowerCase();

  return BOARD_WORKFLOW_RECOMMENDATIONS
    .map((recommendation, index) => ({
      recommendation,
      score:
        recommendation.keywords.reduce(
          (total, keyword) => total + (haystack.includes(keyword) ? 1 : 0),
          0,
        ) || (index === 0 ? 0.5 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.recommendation);
}

function slugForDownload(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'inspiration-board';
}

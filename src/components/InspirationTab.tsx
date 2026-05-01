import { useEffect, useMemo, useState } from 'react';
import type { InspirationBoard, InspirationPin } from '../types';
import type { CreateInput } from './NewProjectPanel';
import {
  buildInspirationPrompt,
  createInspirationBoard,
  createInspirationPin,
  deleteInspirationPin,
  listInspirationBoards,
  listInspirationPins,
  parseTags,
} from '../state/inspiration';
import { Icon } from './Icon';

interface Props {
  onCreateProject: (input: CreateInput & { pendingPrompt?: string }) => void;
}

export function InspirationTab({ onCreateProject }: Props) {
  const [boards, setBoards] = useState<InspirationBoard[]>([]);
  const [pins, setPins] = useState<InspirationPin[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [boardTitle, setBoardTitle] = useState('');
  const [boardDescription, setBoardDescription] = useState('');
  const [boardTags, setBoardTags] = useState('');
  const [pinTitle, setPinTitle] = useState('');
  const [pinImageUrl, setPinImageUrl] = useState('');
  const [pinSourceUrl, setPinSourceUrl] = useState('');
  const [pinNote, setPinNote] = useState('');
  const [pinUsageNote, setPinUsageNote] = useState('');
  const [pinTags, setPinTags] = useState('');

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
    createInspirationPin({
      boardId: activeBoard.id,
      title,
      imageUrl: pinImageUrl,
      sourceUrl: pinSourceUrl,
      note: pinNote,
      usageNote: pinUsageNote,
      tags: parseTags(pinTags),
    });
    setPinTitle('');
    setPinImageUrl('');
    setPinSourceUrl('');
    setPinNote('');
    setPinUsageNote('');
    setPinTags('');
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
                <button type="button" className="primary" onClick={handleCreatePin} disabled={!pinTitle.trim()}>
                  <Icon name="plus" size={13} />
                  Add pin
                </button>
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

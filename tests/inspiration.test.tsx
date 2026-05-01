import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InspirationTab } from '../src/components/InspirationTab';
import {
  buildInspirationPrompt,
  createInspirationBoard,
  createInspirationPin,
  exportInspirationBoard,
  importInspirationBoard,
  listInspirationBoards,
  listInspirationPins,
  parseTags,
} from '../src/state/inspiration';

describe('Inspiration Library', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('dedupes comma-separated tags and builds a production brief prompt', () => {
    expect(parseTags('Cover, typography, cover,  mobile  ')).toEqual([
      'cover',
      'typography',
      'mobile',
    ]);

    const board = createInspirationBoard({
      title: 'Launch references',
      description: 'Visual direction for a high-end launch packet.',
      tags: ['launch', 'premium'],
    });
    const pin = createInspirationPin({
      boardId: board.id,
      title: 'Editorial cover system',
      sourceUrl: 'https://example.com/reference',
      note: 'Strong title hierarchy and restrained color.',
      usageNote: 'Reference only. Recreate with original assets.',
      tags: ['cover'],
    });

    const prompt = buildInspirationPrompt(board, [pin]);

    expect(prompt).toContain('Use the OneShot inspiration board: Launch references.');
    expect(prompt).toContain('Board purpose: Visual direction for a high-end launch packet.');
    expect(prompt).toContain('Source: https://example.com/reference');
    expect(prompt).toContain('Usage: Reference only. Recreate with original assets.');
    expect(prompt).toContain('Create a professional design brief from these references.');
  });

  it('creates boards and pins, filters by tag, and starts a OneShot reference brief', async () => {
    const onCreateProject = vi.fn();
    render(<InspirationTab onCreateProject={onCreateProject} />);

    expect(await screen.findByRole('heading', { name: 'Inspiration Library' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CoverVision references/i })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Board name'), {
      target: { value: 'Client launch moodboard' },
    });
    fireEvent.change(screen.getByPlaceholderText('Purpose, audience, or project'), {
      target: { value: 'References for a premium product launch.' },
    });
    fireEvent.change(screen.getAllByPlaceholderText('tags, separated, by commas')[0], {
      target: { value: 'launch, premium' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create board' }));

    expect(await screen.findByRole('heading', { name: 'Client launch moodboard' })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Reference title'), {
      target: { value: 'Glass editorial dashboard' },
    });
    fireEvent.change(screen.getByPlaceholderText('Source URL or local reference'), {
      target: { value: 'local/reference.html' },
    });
    fireEvent.change(screen.getByPlaceholderText('What should OneShot learn from this?'), {
      target: { value: 'Use the layered glass treatment and tight type scale.' },
    });
    fireEvent.change(screen.getByPlaceholderText('Usage, license, or attribution note'), {
      target: { value: 'Internal inspiration only.' },
    });
    fireEvent.change(screen.getAllByPlaceholderText('tags, separated, by commas')[1], {
      target: { value: 'glass, dashboard' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add pin' }));

    expect(await screen.findByText('Glass editorial dashboard')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'glass' }));
    expect(screen.getByText('Glass editorial dashboard')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Use as OneShot reference' }));

    await waitFor(() => expect(onCreateProject).toHaveBeenCalledTimes(1));
    expect(onCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Client launch moodboard reference brief',
        skillId: null,
        designSystemId: null,
        metadata: expect.objectContaining({
          workflowTitle: 'OneShot Inspiration Brief',
          workflowCategory: 'Visual reference',
        }),
        pendingPrompt: expect.stringContaining('Glass editorial dashboard'),
      }),
    );
    expect(onCreateProject.mock.calls[0]?.[0]?.pendingPrompt).toContain('local/reference.html');
    expect(onCreateProject.mock.calls[0]?.[0]?.pendingPrompt).toContain('Internal inspiration only.');
  });

  it('imports a local image into a reference pin', async () => {
    const onCreateProject = vi.fn();
    render(<InspirationTab onCreateProject={onCreateProject} />);

    const file = new File(['mock image'], 'sample-reference.png', { type: 'image/png' });
    fireEvent.change(await screen.findByLabelText('Import image'), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Reference title')).toHaveValue('sample-reference');
    });
    expect(screen.getByPlaceholderText('Source URL or local reference')).toHaveValue(
      'Imported image: sample-reference.png',
    );
    expect(screen.getByText('Imported image: sample-reference.png')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add pin' }));

    expect(await screen.findByText('sample-reference')).toBeInTheDocument();
    expect(localStorage.getItem('oneshot:inspiration-pins')).toContain('data:image/png;base64');
  });

  it('exports and imports a portable board packet', () => {
    const board = createInspirationBoard({
      title: 'Portable board',
      description: 'References that should move between machines.',
      tags: ['portable', 'export'],
    });
    createInspirationPin({
      boardId: board.id,
      title: 'Portable pin',
      sourceUrl: 'local/portable.html',
      note: 'Keep this source with the board.',
      tags: ['source'],
    });

    const packet = exportInspirationBoard(board.id);
    expect(packet).toEqual(
      expect.objectContaining({
        schema: 'oneshot.inspiration-board.v1',
        board: expect.objectContaining({ title: 'Portable board' }),
      }),
    );
    expect(packet?.pins).toHaveLength(1);

    const imported = importInspirationBoard(packet);

    expect(imported).toEqual(expect.objectContaining({ title: 'Portable board' }));
    expect(listInspirationBoards().filter((entry) => entry.title === 'Portable board')).toHaveLength(2);
    expect(listInspirationPins().filter((pin) => pin.title === 'Portable pin')).toHaveLength(2);
    expect(listInspirationPins().find((pin) => pin.boardId === imported?.id)?.sourceUrl).toBe('local/portable.html');
  });

  it('imports a board JSON file from the library sidebar', async () => {
    const onCreateProject = vi.fn();
    render(<InspirationTab onCreateProject={onCreateProject} />);

    const packet = {
      schema: 'oneshot.inspiration-board.v1',
      exportedAt: 1000,
      board: {
        id: 'imported-board',
        title: 'Imported reference board',
        description: 'Imported from a JSON packet.',
        tags: ['imported'],
        createdAt: 1000,
        updatedAt: 1000,
      },
      pins: [
        {
          id: 'imported-pin',
          boardId: 'imported-board',
          title: 'Imported pin',
          imageUrl: '',
          sourceUrl: 'local/imported.html',
          note: 'Imported note.',
          usageNote: 'Imported usage.',
          tags: ['pin'],
          createdAt: 1000,
        },
      ],
    };
    const file = new File([JSON.stringify(packet)], 'board.json', { type: 'application/json' });

    fireEvent.change(await screen.findByLabelText('Import board'), {
      target: { files: [file] },
    });

    expect(await screen.findByRole('heading', { name: 'Imported reference board' })).toBeInTheDocument();
    expect(screen.getByText('Imported board: Imported reference board')).toBeInTheDocument();
    expect(screen.getByText('Imported pin')).toBeInTheDocument();
  });

  it('renames boards, edits pins, and deletes a board with its pins', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onCreateProject = vi.fn();
    render(<InspirationTab onCreateProject={onCreateProject} />);

    fireEvent.change(await screen.findByPlaceholderText('Board name'), {
      target: { value: 'Working moodboard' },
    });
    fireEvent.change(screen.getByPlaceholderText('Purpose, audience, or project'), {
      target: { value: 'Original board purpose.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create board' }));

    expect(await screen.findByRole('heading', { name: 'Working moodboard' })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Reference title'), {
      target: { value: 'Original pin title' },
    });
    fireEvent.change(screen.getByPlaceholderText('What should OneShot learn from this?'), {
      target: { value: 'Original pin note.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add pin' }));
    expect(await screen.findByText('Original pin title')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Board title'), {
      target: { value: 'Renamed moodboard' },
    });
    fireEvent.change(screen.getByPlaceholderText('Board purpose'), {
      target: { value: 'Updated board purpose.' },
    });
    fireEvent.change(screen.getByPlaceholderText('Board tags'), {
      target: { value: 'updated, launch' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save board' }));

    expect(await screen.findByRole('heading', { name: 'Renamed moodboard' })).toBeInTheDocument();
    expect(listInspirationBoards()[0]).toEqual(
      expect.objectContaining({
        title: 'Renamed moodboard',
        description: 'Updated board purpose.',
        tags: ['updated', 'launch'],
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Original pin title pin' }));
    fireEvent.change(screen.getByPlaceholderText('Reference title'), {
      target: { value: 'Updated pin title' },
    });
    fireEvent.change(screen.getByPlaceholderText('What should OneShot learn from this?'), {
      target: { value: 'Updated pin note.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update pin' }));

    expect(await screen.findByText('Updated pin title')).toBeInTheDocument();
    expect(screen.queryByText('Original pin title')).not.toBeInTheDocument();
    expect(listInspirationPins().find((pin) => pin.title === 'Updated pin title')?.note).toBe('Updated pin note.');

    fireEvent.click(screen.getByRole('button', { name: 'Delete board' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Renamed moodboard' })).not.toBeInTheDocument();
    });
    expect(window.confirm).toHaveBeenCalledWith('Delete the "Renamed moodboard" inspiration board and 1 pins?');
    expect(listInspirationBoards().some((board) => board.title === 'Renamed moodboard')).toBe(false);
    expect(listInspirationPins().some((pin) => pin.title === 'Updated pin title')).toBe(false);
  });

  it('recommends and starts a workflow-specific OneShot path from a board', async () => {
    const onCreateProject = vi.fn();
    render(<InspirationTab onCreateProject={onCreateProject} />);

    fireEvent.change(await screen.findByPlaceholderText('Board name'), {
      target: { value: 'Fantasy cover references' },
    });
    fireEvent.change(screen.getByPlaceholderText('Purpose, audience, or project'), {
      target: { value: 'Book cover typography and publishing direction.' },
    });
    fireEvent.change(screen.getAllByPlaceholderText('tags, separated, by commas')[0], {
      target: { value: 'cover, publishing, typography' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create board' }));

    expect(await screen.findByText('Recommended OneShot paths')).toBeInTheDocument();
    expect(screen.getByText('OneShot Cover Run')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Reference title'), {
      target: { value: 'Epic fantasy comp' },
    });
    fireEvent.change(screen.getByPlaceholderText('Source URL or local reference'), {
      target: { value: 'local/fantasy-cover.html' },
    });
    fireEvent.change(screen.getByPlaceholderText('What should OneShot learn from this?'), {
      target: { value: 'Use strong title hierarchy and genre signal.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add pin' }));

    fireEvent.click(screen.getByRole('button', { name: 'Start OneShot Cover Run' }));

    await waitFor(() => expect(onCreateProject).toHaveBeenCalledTimes(1));
    expect(onCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Fantasy cover references - OneShot Cover Run',
        skillId: null,
        designSystemId: null,
        metadata: expect.objectContaining({
          kind: 'template',
          workflowId: 'oneshot-cover-run',
          workflowTitle: 'OneShot Cover Run',
          workflowCategory: 'Book cover production',
          workflowReferenceBoardTitle: 'Fantasy cover references',
          workflowReferencePinCount: 1,
        }),
        pendingPrompt: expect.stringContaining('Reference lock:'),
      }),
    );
    expect(onCreateProject.mock.calls[0]?.[0]?.pendingPrompt).toContain(
      'Create a professional CoverVisionOS run packet from this board.',
    );
    expect(onCreateProject.mock.calls[0]?.[0]?.pendingPrompt).toContain('Source: local/fantasy-cover.html');
  });
});

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InspirationTab } from '../src/components/InspirationTab';
import {
  buildInspirationPrompt,
  createInspirationBoard,
  createInspirationPin,
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
});

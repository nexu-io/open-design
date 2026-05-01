import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OneShotLibrarySearch } from '../src/components/OneShotLibrarySearch';
import { saveWorkflowBlueprint } from '../src/state/blueprints';
import { createInspirationBoard, createInspirationPin } from '../src/state/inspiration';
import type { Project } from '../src/types';

function project(id: string, name: string): Project {
  return {
    id,
    name,
    skillId: null,
    designSystemId: null,
    createdAt: 1000,
    updatedAt: 3000,
    metadata: {
      kind: 'prototype',
      workflowTitle: 'Dashboard Mockup',
      workflowCategory: 'Product prototype',
      workflowOutcome: 'Operational UI concept',
    },
  };
}

describe('OneShotLibrarySearch', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('searches blueprints, boards, and projects from its own tab surface', () => {
    const onCreateProject = vi.fn();
    const onOpenProject = vi.fn();
    saveWorkflowBlueprint({
      metadata: {
        kind: 'template',
        workflowId: 'oneshot-cover-run',
        workflowTitle: 'OneShot Cover Run',
        workflowCategory: 'Book cover production',
      },
      prompt: 'Use the OneShot workflow blueprint: OneShot Cover Run.',
      skillId: 'digital-eguide',
      designSystemId: 'warm-editorial',
    });
    const board = createInspirationBoard({
      title: 'Cover moodboard',
      description: 'Publishing references for a cover.',
      tags: ['cover'],
    });
    createInspirationPin({
      boardId: board.id,
      title: 'Cover source',
      sourceUrl: 'local/cover-source.html',
      note: 'Use the title hierarchy.',
      tags: ['typography'],
    });

    render(
      <OneShotLibrarySearch
        projects={[project('project-1', 'Project archive')]}
        onCreateProject={onCreateProject}
        onOpenProject={onOpenProject}
      />,
    );

    expect(screen.getByLabelText('OneShot library search')).toBeInTheDocument();
    expect(screen.getByText('1 blueprints')).toBeInTheDocument();
    expect(screen.getByText('3 boards')).toBeInTheDocument();
    expect(screen.getByText('1 projects')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search blueprints, boards, and projects'), {
      target: { value: 'archive' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open Project archive' }));
    expect(onOpenProject).toHaveBeenCalledWith('project-1');

    fireEvent.change(screen.getByPlaceholderText('Search blueprints, boards, and projects'), {
      target: { value: 'moodboard' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create brief from Cover moodboard' }));
    expect(onCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Cover moodboard reference brief',
        metadata: expect.objectContaining({
          workflowReferenceBoardId: board.id,
          workflowReferenceBoardTitle: 'Cover moodboard',
          workflowReferencePinCount: 1,
        }),
        pendingPrompt: expect.stringContaining('Source: local/cover-source.html'),
      }),
    );

    onCreateProject.mockClear();
    fireEvent.change(screen.getByPlaceholderText('Search blueprints, boards, and projects'), {
      target: { value: 'blueprint' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start OneShot Cover Run' }));
    expect(onCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'OneShot Cover Run',
        skillId: 'digital-eguide',
        designSystemId: 'warm-editorial',
      }),
    );
  });

  it('filters the library by source, output type, and recent activity', () => {
    saveWorkflowBlueprint({
      metadata: {
        kind: 'template',
        workflowId: 'oneshot-cover-run',
        workflowTitle: 'OneShot Cover Run',
        workflowCategory: 'Book cover production',
      },
      prompt: 'Use the OneShot workflow blueprint: OneShot Cover Run.',
      skillId: 'digital-eguide',
      designSystemId: 'warm-editorial',
    });
    const board = createInspirationBoard({
      title: 'Cover moodboard',
      description: 'Publishing references for a cover.',
      tags: ['cover'],
    });
    createInspirationPin({
      boardId: board.id,
      title: 'Cover source',
      sourceUrl: 'local/cover-source.html',
      note: 'Use the title hierarchy.',
      tags: ['typography'],
    });

    render(
      <OneShotLibrarySearch
        projects={[project('project-1', 'Project archive')]}
        onCreateProject={vi.fn()}
        onOpenProject={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'Project' } });
    expect(screen.getByText('Project archive')).toBeInTheDocument();
    expect(screen.queryByText('OneShot Cover Run')).not.toBeInTheDocument();
    expect(screen.queryByText('Cover moodboard')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Output'), { target: { value: 'visual-reference' } });
    expect(screen.getByText('Cover moodboard')).toBeInTheDocument();
    expect(screen.queryByText('OneShot Cover Run')).not.toBeInTheDocument();
    expect(screen.queryByText('Project archive')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Output'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'Project' } });
    fireEvent.change(screen.getByLabelText('Recent'), { target: { value: '7d' } });
    expect(screen.getByText('No library records match this search yet.')).toBeInTheDocument();
  });

  it('saves, applies, and deletes reusable Library Search views', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Cover board review');
    saveWorkflowBlueprint({
      metadata: {
        kind: 'template',
        workflowId: 'oneshot-cover-run',
        workflowTitle: 'OneShot Cover Run',
        workflowCategory: 'Book cover production',
      },
      prompt: 'Use the OneShot workflow blueprint: OneShot Cover Run.',
      skillId: 'digital-eguide',
      designSystemId: 'warm-editorial',
    });
    const board = createInspirationBoard({
      title: 'Cover moodboard',
      description: 'Publishing references for a cover.',
      tags: ['cover'],
    });
    createInspirationPin({
      boardId: board.id,
      title: 'Cover source',
      sourceUrl: 'local/cover-source.html',
      note: 'Use the title hierarchy.',
      tags: ['typography'],
    });

    render(
      <OneShotLibrarySearch
        projects={[project('project-1', 'Project archive')]}
        onCreateProject={vi.fn()}
        onOpenProject={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Search blueprints, boards, and projects'), {
      target: { value: 'moodboard' },
    });
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'Board' } });
    fireEvent.change(screen.getByLabelText('Recent'), { target: { value: '30d' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save current view' }));

    expect(window.prompt).toHaveBeenCalledWith(
      'Name this Library Search view',
      'Board / Last 30 days / moodboard',
    );
    expect(screen.getByText('Cover board review')).toBeInTheDocument();
    expect(screen.getByText('Board - All outputs - Last 30 days - "moodboard"')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search blueprints, boards, and projects'), {
      target: { value: 'archive' },
    });
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'Project' } });
    fireEvent.change(screen.getByLabelText('Recent'), { target: { value: 'all' } });
    expect(screen.getByText('Project archive')).toBeInTheDocument();
    expect(screen.queryByText('Cover moodboard')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Cover board review/ }));
    expect(screen.getByPlaceholderText('Search blueprints, boards, and projects')).toHaveValue('moodboard');
    expect(screen.getByLabelText('Source')).toHaveValue('Board');
    expect(screen.getByLabelText('Recent')).toHaveValue('30d');
    expect(screen.getByText('Cover moodboard')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete Cover board review saved Library Search view' }),
    );
    expect(screen.queryByText('Cover board review')).not.toBeInTheDocument();
    expect(screen.getByText('Save a filter set to reuse it later.')).toBeInTheDocument();
  });

  it('exports saved Library Search views as a portable JSON packet', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Exported cover boards');
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const createObjectURL = vi.fn(() => 'blob:oneshot-library-views');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });

    render(
      <OneShotLibrarySearch
        projects={[project('project-1', 'Project archive')]}
        onCreateProject={vi.fn()}
        onOpenProject={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Search blueprints, boards, and projects'), {
      target: { value: 'cover' },
    });
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'Board' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save current view' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export views' }));

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchorClick).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:oneshot-library-views');
  });

  it('pins saved Library Search views above recent views', () => {
    vi.spyOn(window, 'prompt')
      .mockReturnValueOnce('Cover boards')
      .mockReturnValueOnce('Project archive view');

    render(
      <OneShotLibrarySearch
        projects={[project('project-1', 'Project archive')]}
        onCreateProject={vi.fn()}
        onOpenProject={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Search blueprints, boards, and projects'), {
      target: { value: 'cover' },
    });
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'Board' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save current view' }));

    fireEvent.change(screen.getByPlaceholderText('Search blueprints, boards, and projects'), {
      target: { value: 'archive' },
    });
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'Project' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save current view' }));

    let savedViewNames = Array.from(document.querySelectorAll('.oneshot-library-view-pill strong'))
      .map((element) => element.textContent);
    expect(savedViewNames).toEqual(['Project archive view', 'Cover boards']);

    fireEvent.click(screen.getByRole('button', { name: 'Pin Cover boards saved Library Search view' }));
    expect(screen.getByText('Pinned - Board - All outputs - Any time - "cover"')).toBeInTheDocument();
    savedViewNames = Array.from(document.querySelectorAll('.oneshot-library-view-pill strong'))
      .map((element) => element.textContent);
    expect(savedViewNames).toEqual(['Cover boards', 'Project archive view']);

    fireEvent.click(screen.getByRole('button', { name: 'Unpin Cover boards saved Library Search view' }));
    expect(screen.queryByText('Pinned - Board - All outputs - Any time - "cover"')).not.toBeInTheDocument();
  });

  it('imports saved Library Search views and restores their filters', async () => {
    const packet = {
      schema: 'oneshot.library-search-views.v1',
      exportedAt: Date.now(),
      views: [
        {
          id: 'old-imported-view',
          name: 'Imported boards',
          query: 'cover',
          sourceFilter: 'Board',
          outputFilter: 'visual-reference',
          recencyFilter: '30d',
          createdAt: 123,
          pinnedAt: 456,
        },
      ],
    };

    render(
      <OneShotLibrarySearch
        projects={[project('project-1', 'Project archive')]}
        onCreateProject={vi.fn()}
        onOpenProject={vi.fn()}
      />,
    );

    const file = new File([JSON.stringify(packet)], 'oneshot-library-search-views.json', {
      type: 'application/json',
    });
    fireEvent.change(screen.getByLabelText('Import views'), {
      target: { files: [file] },
    });

    expect(await screen.findByText('Imported 1 Library Search view.')).toBeInTheDocument();
    expect(screen.getByText('Imported boards')).toBeInTheDocument();
    expect(screen.getByText('Pinned - Board - Visual reference - Last 30 days - "cover"')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Imported boards/ }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search blueprints, boards, and projects')).toHaveValue('cover');
    });
    expect(screen.getByLabelText('Source')).toHaveValue('Board');
    expect(screen.getByLabelText('Output')).toHaveValue('visual-reference');
    expect(screen.getByLabelText('Recent')).toHaveValue('30d');
  });
});

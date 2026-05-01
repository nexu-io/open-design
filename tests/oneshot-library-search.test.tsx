import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
});

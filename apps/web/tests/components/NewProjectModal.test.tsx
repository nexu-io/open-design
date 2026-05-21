// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NewProjectModal } from '../../src/components/NewProjectModal';
import type {
  DesignSystemSummary,
  ProjectTemplate,
  SkillSummary,
} from '../../src/types';

const skills: SkillSummary[] = [
  {
    id: 'prototype-skill',
    name: 'Prototype',
    description: 'Build prototypes',
    mode: 'prototype',
    surface: 'web',
    previewType: 'html',
    designSystemRequired: true,
    defaultFor: ['prototype'],
    triggers: [],
    upstream: null,
    hasBody: true,
    examplePrompt: 'Build a prototype.',
    aggregatesExamples: false,
  },
];

const designSystems: DesignSystemSummary[] = [
  {
    id: 'clay',
    title: 'Clay',
    summary: 'Friendly tactile product UI.',
    category: 'Product',
    swatches: ['#f4efe7', '#25211d'],
  },
];

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalResizeObserver;
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

const originalResizeObserver = globalThis.ResizeObserver;
const originalScrollIntoView = Element.prototype.scrollIntoView;

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  Element.prototype.scrollIntoView = vi.fn();
});

describe('NewProjectModal layout', () => {
  it('keeps the project form inside a scrollable body region', () => {
    const { container } = render(
      <NewProjectModal
        open
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId={null}
        templates={[]}
        promptTemplates={[]}
        onCreate={() => {}}
        onClose={() => {}}
      />,
    );

    const modalBody = container.querySelector('.new-project-modal__body');
    const panelBody = container.querySelector('.new-project-modal__body .newproj-body');
    expect(modalBody).toBeTruthy();
    expect(panelBody).toBeTruthy();
    expect(screen.getByTestId('new-project-panel')).toBeTruthy();
    expect(screen.getByTestId('create-project')).toBeTruthy();
  });

  it('keeps the modal open with a waiting state until project creation finishes', async () => {
    let resolveCreate!: (value: boolean) => void;
    const onCreate = vi.fn(
      () => new Promise<boolean>((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const onClose = vi.fn();

    render(
      <NewProjectModal
        open
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId={null}
        templates={[]}
        promptTemplates={[]}
        onCreate={onCreate}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('Creating project…');
    expect((screen.getByTestId('create-project') as HTMLButtonElement).disabled).toBe(true);

    resolveCreate(true);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});

describe('NewProjectModal template deletion plumbing', () => {
  it('forwards onDeleteTemplate to the inner panel', async () => {
    const templates: ProjectTemplate[] = [
      {
        id: 'tmpl-landing',
        name: 'Landing Page',
        description: 'A saved landing page starter.',
        files: [{ name: 'prototype/App.jsx', content: '' }],
        createdAt: 1714867200000,
      },
    ];
    const onDelete = vi.fn().mockResolvedValue(true);

    render(
      <NewProjectModal
        open
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId="clay"
        templates={templates}
        promptTemplates={[]}
        onDeleteTemplate={onDelete}
        onCreate={() => {}}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'From template' }));
    fireEvent.click(screen.getByLabelText(/delete template/i));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Delete template' }));

    expect(onDelete).toHaveBeenCalledWith('tmpl-landing');
  });
});

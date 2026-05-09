// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildDesignSystemCreateSelection,
  defaultDesignSystemSelection,
  NewProjectPanel,
} from '../../src/components/NewProjectPanel';
import type { DesignSystemSummary, ProjectTemplate, SkillSummary } from '../../src/types';

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
  {
    id: 'noir',
    title: 'Editorial Noir',
    summary: 'High-contrast editorial system.',
    category: 'Editorial',
    swatches: ['#111111', '#f7f0e8'],
  },
];

const templates: ProjectTemplate[] = [
  {
    id: 'tmpl-landing',
    name: 'Landing Page',
    description: 'A saved landing page starter.',
    files: [{ name: 'prototype/App.jsx', path: 'prototype/App.jsx' }],
    createdAt: '2026-05-07T00:00:00.000Z',
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
describe('NewProjectPanel design system defaults', () => {
  it('uses the configured default design system when it exists in the catalog', () => {
    expect(defaultDesignSystemSelection('clay', designSystems)).toEqual(['clay']);
    expect(defaultDesignSystemSelection('missing', designSystems)).toEqual([]);
    expect(defaultDesignSystemSelection(null, designSystems)).toEqual([]);
  });

  it('shows the configured default design system as the active project selection', () => {
    const markup = renderToStaticMarkup(
      <NewProjectPanel
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={vi.fn()}
      />,
    );

    expect(markup).toContain('Clay');
    expect(markup).toContain('Default');
    expect(markup).not.toContain('Freeform');
  });

  it('keeps media project creation from inheriting a hidden design system pick', () => {
    expect(buildDesignSystemCreateSelection(true, ['clay', 'bmw'])).toEqual({
      primary: 'clay',
      inspirations: ['bmw'],
    });
    expect(buildDesignSystemCreateSelection(false, ['clay', 'bmw'])).toEqual({
      primary: null,
      inspirations: [],
    });
  });
  it('preserves prototype fidelity across tab switches and saves it into the create payload', () => {
    const onCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={onCreate}
      />,
    );

    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Wireframe fidelity payload' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Wireframe' }));
    expect(screen.getByRole('button', { name: 'Wireframe' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('tab', { name: 'Slide deck' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Prototype' }));
    expect(screen.getByRole('button', { name: 'Wireframe' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Wireframe fidelity payload',
        designSystemId: 'clay',
        metadata: expect.objectContaining({
          kind: 'prototype',
          fidelity: 'wireframe',
        }),
      }),
    );
  });

  it('clears design system metadata when freeform is selected in multi mode', () => {
    const onCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={onCreate}
      />,
    );

    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Freeform prototype' },
    });
    fireEvent.click(screen.getByTestId('design-system-trigger'));
    fireEvent.click(screen.getByRole('tab', { name: 'Multi' }));
    fireEvent.click(screen.getByRole('option', { name: /Editorial Noir/i }));
    expect(screen.getByTestId('design-system-trigger').textContent).toContain('Clay');
    expect(screen.getByTestId('design-system-trigger').textContent).toContain('+1');

    fireEvent.click(screen.getByRole('option', { name: /None — freeform/i }));
    expect(screen.getByTestId('design-system-trigger').textContent).toContain('None — freeform');
    expect(screen.getByTestId('design-system-trigger').textContent ?? '').not.toContain('+');

    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Freeform prototype',
        designSystemId: null,
        metadata: expect.not.objectContaining({
          inspirationDesignSystemIds: expect.anything(),
        }),
      }),
    );
  });

  it('falls back to the generated default title when the prototype name is blank', () => {
    const onCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId={null}
        templates={[]}
        promptTemplates={[]}
        onCreate={onCreate}
      />,
    );

    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringMatching(/^Prototype\b/),
        metadata: expect.objectContaining({
          kind: 'prototype',
          fidelity: 'high-fidelity',
        }),
      }),
    );
  });

  it('saves live artifact creation with prototype kind, live-artifact intent, and fidelity metadata', () => {
    const onCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={onCreate}
        connectors={[]}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Live artifact' }));
    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Realtime artifact payload' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Wireframe' }));
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Realtime artifact payload',
        metadata: expect.objectContaining({
          kind: 'prototype',
          intent: 'live-artifact',
          fidelity: 'wireframe',
        }),
      }),
    );
  });

  it('saves deck creation with speaker notes metadata when the toggle is enabled', () => {
    const onCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={onCreate}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Slide deck' }));
    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Deck speaker notes payload' },
    });
    fireEvent.click(screen.getByRole('button', { name: /use speaker notes/i }));
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Deck speaker notes payload',
        metadata: expect.objectContaining({
          kind: 'deck',
          speakerNotes: true,
        }),
      }),
    );
  });

  it('prevents template creation when there are no saved templates and enables creation once one exists', () => {
    const emptyOnCreate = vi.fn();
    const first = render(
      <NewProjectPanel
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={emptyOnCreate}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'From template' }));
    const createFromTemplate = screen.getByTestId('create-project') as HTMLButtonElement;
    expect(createFromTemplate.disabled).toBe(true);
    fireEvent.click(createFromTemplate);
    expect(emptyOnCreate).not.toHaveBeenCalled();
    first.unmount();

    const templateOnCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId="clay"
        templates={templates}
        promptTemplates={[]}
        onCreate={templateOnCreate}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'From template' }));
    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Template creation payload' },
    });
    const createReady = screen.getByTestId('create-project') as HTMLButtonElement;
    expect(createReady.disabled).toBe(false);
    fireEvent.click(createReady);

    expect(templateOnCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Template creation payload',
        metadata: expect.objectContaining({
          kind: 'template',
          templateId: 'tmpl-landing',
          templateLabel: 'Landing Page',
        }),
      }),
    );
  });

  it('saves image creation with the selected aspect and trimmed style notes metadata', () => {
    const onCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={onCreate}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Image' }));
    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Image payload metadata' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Tall3:4/i }));
    fireEvent.change(screen.getByPlaceholderText('Editorial photo, soft daylight, muted palette'), {
      target: { value: '  cinematic still life  ' },
    });
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Image payload metadata',
        designSystemId: null,
        metadata: expect.objectContaining({
          kind: 'image',
          imageModel: 'gpt-image-2',
          imageAspect: '3:4',
          imageStyle: 'cinematic still life',
        }),
      }),
    );
  });

  it('saves video creation with the selected aspect and duration metadata', () => {
    const onCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={onCreate}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Video' }));
    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Video payload metadata' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Portrait9:16/i }));
    fireEvent.change(screen.getByLabelText('Length'), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Video payload metadata',
        designSystemId: null,
        metadata: expect.objectContaining({
          kind: 'video',
          videoModel: 'doubao-seedance-2-0-260128',
          videoAspect: '9:16',
          videoLength: 10,
        }),
      }),
    );
  });

  it('saves audio creation with the selected duration and trimmed voice metadata', () => {
    const onCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={onCreate}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Audio' }));
    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Audio payload metadata' },
    });
    fireEvent.change(screen.getByLabelText('Duration'), {
      target: { value: '30' },
    });
    fireEvent.change(screen.getByPlaceholderText('Provider voice id, optional'), {
      target: { value: '  soft contralto guide  ' },
    });
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Audio payload metadata',
        designSystemId: null,
        metadata: expect.objectContaining({
          kind: 'audio',
          audioKind: 'speech',
          audioModel: 'minimax-tts',
          audioDuration: 30,
          voice: 'soft contralto guide',
        }),
      }),
    );
  });
});

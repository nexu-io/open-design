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
        onDeleteTemplate={vi.fn()}
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
        onDeleteTemplate={vi.fn()}
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

  it('does not persist OS widgets metadata for web-only platform targets', () => {
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
      target: { value: 'Responsive web payload' },
    });
    // CompactToggle renders as a `<button aria-pressed>` so screen readers
    // announce it as a toggle button; the role is `button`, not `checkbox`.
    fireEvent.click(screen.getByRole('button', { name: /OS widgets/i }));
    fireEvent.click(screen.getByTestId('create-project'));

    const payload = onCreate.mock.calls[0]?.[0];
    expect(payload.metadata).toEqual(
      expect.objectContaining({
        platform: 'responsive',
        platformTargets: ['responsive'],
      }),
    );
    expect(payload.metadata).not.toHaveProperty('includeOsWidgets');
  });

  it('marks the target platform dropdown as a multi-select listbox', () => {
    render(
      <NewProjectPanel
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Responsive web/i }));

    expect(screen.getByRole('listbox', { name: 'Target platforms' }).getAttribute('aria-multiselectable')).toBe(
      'true',
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
        onDeleteTemplate={vi.fn()}
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
        onDeleteTemplate={vi.fn()}
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

  it('saves live artifact creation with prototype kind, live-artifact intent, and locked high fidelity', () => {
    const onCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId="clay"
        templates={[]}
        onDeleteTemplate={vi.fn()}
        promptTemplates={[]}
        onCreate={onCreate}
        connectors={[]}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Live artifact' }));
    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Realtime artifact payload' },
    });
    // Live artifact hides the fidelity picker — wireframe live artifacts
    // don't make sense, so the surface is locked to high-fidelity.
    expect(screen.queryByRole('button', { name: 'Wireframe' })).toBeNull();
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Realtime artifact payload',
        metadata: expect.objectContaining({
          kind: 'prototype',
          intent: 'live-artifact',
          fidelity: 'high-fidelity',
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
        onDeleteTemplate={vi.fn()}
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
    const payload = onCreate.mock.calls[0]?.[0];
    expect(payload.metadata).not.toHaveProperty('platform');
    expect(payload.metadata).not.toHaveProperty('platformTargets');
  });

  it('prevents template creation when there are no saved templates and enables creation once one exists', () => {
    const emptyOnCreate = vi.fn();
    const first = render(
      <NewProjectPanel
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId="clay"
        templates={[]}
        onDeleteTemplate={vi.fn()}
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
        onDeleteTemplate={vi.fn()}
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
        onDeleteTemplate={vi.fn()}
        promptTemplates={[]}
        onCreate={onCreate}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Media' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Image' }));
    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Image payload metadata' },
    });
    fireEvent.click(screen.getByRole('radio', { name: '3:4' }));
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Image payload metadata',
        designSystemId: null,
        metadata: expect.objectContaining({
          kind: 'image',
          imageModel: 'gpt-image-2',
          imageAspect: '3:4',
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
        onDeleteTemplate={vi.fn()}
        promptTemplates={[]}
        onCreate={onCreate}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Media' }));
    fireEvent.click(screen.getByTestId('new-project-media-surface-video'));
    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Video payload metadata' },
    });
    fireEvent.click(screen.getByRole('radio', { name: '9:16' }));
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
        onDeleteTemplate={vi.fn()}
        promptTemplates={[]}
        onCreate={onCreate}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Media' }));
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

  it('exposes sound effects audio projects and switches to the ElevenLabs SFX model', () => {
    const onCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId="clay"
        templates={[]}
        onDeleteTemplate={vi.fn()}
        promptTemplates={[]}
        onCreate={onCreate}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Media' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Audio' }));
    expect(screen.getByRole('button', { name: 'SFX' })).toBeTruthy();
    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Impact sound payload' },
    });
    fireEvent.change(screen.getByLabelText('Duration'), {
      target: { value: '120' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'SFX' }));
    expect(screen.getByTestId('model-picker-trigger').textContent).toContain('elevenlabs-sfx');
    expect(screen.queryByPlaceholderText('Provider voice id, optional')).toBeNull();
    const durationSelect = screen.getByLabelText('Duration') as HTMLSelectElement;
    expect(Array.from(durationSelect.options).map((option) => option.value)).toEqual(['5', '10', '15', '30']);
    expect(durationSelect.value).toBe('30');

    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Impact sound payload',
        designSystemId: null,
        metadata: expect.objectContaining({
          kind: 'audio',
          audioKind: 'sfx',
          audioModel: 'elevenlabs-sfx',
          audioDuration: 30,
        }),
      }),
    );
    expect(onCreate.mock.calls[0]?.[0].metadata).not.toHaveProperty('voice');
  });

  it('pins skillId to hyperframes when the video model is hyperframes-html, regardless of skill discovery order', () => {
    // Reproduces PR #866 mrcfps's reported regression: when daemon `readdir()`
    // returns video skills in an order that puts `video-shortform` ahead of
    // `hyperframes`, the previous `list[0]?.id` fallback would route the
    // HyperFrames-HTML model through `video-shortform`, dropping the
    // hyperframes SKILL body and the html-in-canvas preflight. The fix forces
    // the create-time skillId to `hyperframes` whenever `hyperframes-html` is
    // the chosen model.
    const onCreate = vi.fn();
    const videoSkills: SkillSummary[] = [
      {
        id: 'video-shortform',
        name: 'Video shortform',
        description: 'Shortform video skill',
        mode: 'video',
        surface: 'video',
        previewType: 'video',
        designSystemRequired: false,
        defaultFor: [],
        triggers: [],
        upstream: null,
        hasBody: true,
        examplePrompt: '',
        aggregatesExamples: false,
      },
      {
        id: 'hyperframes',
        name: 'HyperFrames',
        description: 'HTML-in-canvas video',
        mode: 'video',
        surface: 'video',
        previewType: 'video',
        designSystemRequired: false,
        defaultFor: [],
        triggers: [],
        upstream: null,
        hasBody: true,
        examplePrompt: '',
        aggregatesExamples: false,
      },
    ];

    render(
      <NewProjectPanel
        skills={videoSkills}
        designSystems={designSystems}
        defaultDesignSystemId="clay"
        templates={[]}
        onDeleteTemplate={vi.fn()}
        promptTemplates={[]}
        onCreate={onCreate}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Media' }));
    fireEvent.click(screen.getByTestId('new-project-media-surface-video'));
    fireEvent.click(screen.getByTestId('model-picker-trigger'));
    fireEvent.click(screen.getByTestId('model-picker-option-hyperframes-html'));
    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'HyperFrames routing' },
    });
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'HyperFrames routing',
        skillId: 'hyperframes',
        metadata: expect.objectContaining({
          kind: 'video',
          videoModel: 'hyperframes-html',
        }),
      }),
    );
  });
});

describe('NewProjectPanel template deletion', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
    Element.prototype.scrollIntoView = () => {};
  });

  it('calls onDeleteTemplate when user clicks delete button', async () => {
    const onDelete = vi.fn().mockResolvedValue(true);
    render(
      <NewProjectPanel
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId="clay"
        templates={templates}
        onDeleteTemplate={onDelete}
        promptTemplates={[]}
        onCreate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'From template' }));
    const deleteBtn = screen.getByLabelText(/delete template/i);
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith('tmpl-landing');
  });
});

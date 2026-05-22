// @vitest-environment jsdom



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

const templates: ProjectTemplate[] = [
  {
    id: 'tmpl-landing',
    name: 'Landing Page',
    description: 'A saved landing page starter.',
    files: [{ name: 'prototype/App.jsx', path: 'prototype/App.jsx' }],
    createdAt: '2026-05-07T00:00:00.000Z',
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


    render(
      <NewProjectModal
        open
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId="clay"
        templates={templates}
main
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'From template' }));

  });
});

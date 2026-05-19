// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileWorkspace } from '../../src/components/FileWorkspace';
import type { AgentEvent, DesignSystemSummary, ProjectFile } from '../../src/types';

const registryMocks = vi.hoisted(() => ({
  updateDesignSystemDraft: vi.fn(),
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    updateDesignSystemDraft: registryMocks.updateDesignSystemDraft,
  };
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  host?.remove();
  host = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function workspaceFile(name: string): ProjectFile {
  return {
    name,
    path: name,
    type: 'file',
    size: 100,
    mtime: Date.parse('2026-05-14T00:00:00.000Z'),
    kind: name.endsWith('.html') ? 'html' : name.endsWith('.svg') ? 'image' : 'text',
    mime: name.endsWith('.html') ? 'text/html' : name.endsWith('.svg') ? 'image/svg+xml' : 'text/plain',
  };
}

function designSystem(overrides: Partial<DesignSystemSummary> = {}): DesignSystemSummary {
  return {
    id: 'user:acme',
    title: 'Acme Design System',
    category: 'Custom',
    summary: 'Context project for Acme.',
    swatches: [],
    surface: 'web',
    source: 'user',
    status: 'draft',
    isEditable: true,
    ...overrides,
  };
}

function renderWorkspace(element: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host!);
    root.render(element);
  });
  return host;
}

type ToolUseEvent = Extract<AgentEvent, { kind: 'tool_use' }>;
type ToolResultEvent = Extract<AgentEvent, { kind: 'tool_result' }>;

function toolUse(name: string, input: unknown, id: string): ToolUseEvent {
  return { kind: 'tool_use', id, name, input };
}

function toolOk(id: string): ToolResultEvent {
  return { kind: 'tool_result', toolUseId: id, content: '', isError: false };
}

function todoWrite(
  todos: Array<{ content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm?: string }>,
): ToolUseEvent {
  return toolUse('TodoWrite', { todos }, 'todo-write');
}

describe('FileWorkspace design-system project surface', () => {
  it('keeps project-backed design systems inside the normal workspace tabs with inline preview cards', () => {
    const markup = renderToStaticMarkup(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[
          workspaceFile('DESIGN.md'),
          workspaceFile('colors_and_type.css'),
          workspaceFile('preview/typography-specimens.html'),
          workspaceFile('preview/colors-primary.html'),
          workspaceFile('preview/spacing-tokens.html'),
          workspaceFile('ui_kits/app/index.html'),
          workspaceFile('preview/brand-assets.html'),
        ]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem()}
      />,
    );

    expect(markup).toContain('data-testid="design-system-project-tab"');
    expect(markup).toContain('data-testid="design-files-tab"');
    expect(markup).toContain('Review draft design system');
    expect(markup).not.toContain('<h2>Needs review</h2>');
    expect(markup).toContain('Type');
    expect(markup).toContain('Colors');
    expect(markup).toContain('Spacing');
    expect(markup).toContain('Components');
    expect(markup).toContain('Brand');
    expect(markup).toContain('typography-specimens');
    expect(markup).toContain('colors-primary');
    expect(markup).toContain('spacing-tokens');
    expect(markup).toContain('app');
    expect(markup).toContain('brand-assets');
    expect(markup).toContain('<iframe');
    expect(markup).not.toContain('Preview cards will appear here as the agent creates them.');
  });

  it('shows the creating state while the initial design-system project is still source-only', () => {
    const markup = renderToStaticMarkup(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[workspaceFile('context/source-context.md')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        streaming
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem({ provenance: { companyBlurb: 'Acme analytics workspace' } })}
        designSystemActivityEvents={[
          todoWrite([
            { content: 'Create README.md with high-level company/product understanding', status: 'in_progress' },
            { content: 'Create colors_and_type.css with CSS variables', status: 'pending' },
          ]),
        ]}
      />,
    );

    expect(markup).toContain('Creating your design system...');
    expect(markup).toContain('Keep this tab open. You can come back in a few minutes.');
    expect(markup).toContain('role="progressbar"');
    expect(markup).not.toContain('Review draft design system');
  });

  it('keeps generated preview cards hidden until the initial run finishes', () => {
    const markup = renderToStaticMarkup(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[
          workspaceFile('DESIGN.md'),
          workspaceFile('preview/typography-specimens.html'),
          workspaceFile('preview/colors-primary.html'),
          workspaceFile('ui_kits/app/index.html'),
        ]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        streaming
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem()}
        designSystemActivityEvents={[
          toolUse('Write', { file_path: '/project/preview/typography-specimens.html' }, 'write-preview'),
        ]}
      />,
    );

    expect(markup).toContain('Creating your design system...');
    expect(markup).not.toContain('Review draft design system');
    expect(markup).not.toContain('typography-specimens');
    expect(markup).not.toContain('<iframe');
  });

  it('keeps source evidence files out of the Design System review tab', () => {
    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[
          workspaceFile('DESIGN.md'),
          workspaceFile('context/source-context.md'),
          workspaceFile('context/github/acme-product.md'),
          workspaceFile('context/github/acme-product/files/src/components/Button.tsx'),
          workspaceFile('assets/logo.svg'),
          workspaceFile('preview/brand-assets.html'),
        ]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem({
          provenance: {
            githubUrls: ['https://github.com/acme/product'],
            sourceNotes: 'GitHub metadata: React UI library with token CSS.',
          },
        })}
      />,
    );

    expect(container.textContent).toContain('Brand');
    expect(container.textContent).toContain('brand-assets');
    expect(container.textContent).not.toContain('context/github/acme-product.md');
    expect(container.textContent).not.toContain('GitHub metadata: React UI library with token CSS.');
  });

  it('marks a section for review after the latest agent run edits it', () => {
    const markup = renderToStaticMarkup(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[workspaceFile('DESIGN.md'), workspaceFile('preview/colors.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem()}
        designSystemActivityEvents={[
          toolUse('Write', { file_path: '/project/preview/colors.html' }, 'write-preview'),
          toolOk('write-preview'),
        ]}
      />,
    );

    expect(markup).toContain('This section changed during the latest run. Review it before publishing.');
  });

  it('blocks publishing GitHub-backed design systems until connector evidence snapshots exist', async () => {
    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[
          workspaceFile('DESIGN.md'),
          workspaceFile('context/source-context.md'),
          workspaceFile('preview/colors.html'),
        ]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem({
          provenance: {
            companyBlurb: 'Acme analytics workspace',
            githubUrls: ['https://github.com/acme/product'],
          },
        })}
      />,
    );
    const publishToggle = container.querySelector<HTMLInputElement>(
      '.ds-project-publish-card input[type="checkbox"]',
    );

    expect(container.textContent).toContain('Waiting for GitHub connector evidence');
    expect(publishToggle?.disabled).toBe(true);

    await act(async () => {
      publishToggle?.click();
      await Promise.resolve();
    });

    expect(registryMocks.updateDesignSystemDraft).not.toHaveBeenCalled();
  });
});

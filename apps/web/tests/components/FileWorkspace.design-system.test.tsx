// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileWorkspace } from '../../src/components/FileWorkspace';
import type { AgentEvent, DesignSystemSummary, ProjectFile } from '../../src/types';

const registryMocks = vi.hoisted(() => ({
  fetchProjectFileText: vi.fn(),
  updateDesignSystemDraft: vi.fn(),
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchProjectFileText: registryMocks.fetchProjectFileText,
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
  it('uses design-system card manifest labels and preview density when available', async () => {
    registryMocks.fetchProjectFileText.mockResolvedValue(JSON.stringify({
      cards: [
        {
          path: 'preview/type-display.html',
          group: 'Brand',
          name: 'Display & Headings',
          subtitle: 'Tahoma bold, tight — display 52 to H3 24',
        },
        {
          path: 'ui_kits/website/index.html',
          group: 'UI Kit — Website',
          name: 'Website — Home (UI Kit)',
          subtitle: 'Full passivebook.com home recreation',
        },
      ],
    }));

    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[
          workspaceFile('DESIGN.md'),
          workspaceFile('_ds_manifest.json'),
          workspaceFile('preview/type-display.html'),
          workspaceFile('ui_kits/website/index.html'),
        ]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem()}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const items = Array.from(container.querySelectorAll('.ds-project-review-item'));
    const itemByTitle = (title: string) => items.find((item) =>
      item.querySelector('.ds-project-section-title strong')?.textContent === title,
    );
    const typeCard = itemByTitle('Display & Headings');
    const uiKitCard = itemByTitle('Website — Home (UI Kit)');

    expect(registryMocks.fetchProjectFileText).toHaveBeenCalledWith('ds-acme', '_ds_manifest.json', {
      cache: 'no-store',
      cacheBustKey: Math.round(workspaceFile('_ds_manifest.json').mtime),
    });
    expect(container.textContent).not.toContain('type-display');
    expect(typeCard?.textContent).toContain('Tahoma bold, tight');
    expect(typeCard?.classList.contains('ds-project-review-item--specimen')).toBe(true);
    expect(uiKitCard?.textContent).toContain('Full passivebook.com home recreation');
    expect(uiKitCard?.classList.contains('ds-project-review-item--ui-kit')).toBe(true);
  });

  it('refreshes design-system card manifest labels when the manifest mtime changes', async () => {
    const firstManifest = workspaceFile('_ds_manifest.json');
    const nextManifest = { ...firstManifest, mtime: firstManifest.mtime + 5_000 };
    registryMocks.fetchProjectFileText.mockImplementation((
      _projectId: string,
      _name: string,
      options?: { cacheBustKey?: number },
    ) => {
      if (options?.cacheBustKey === Math.round(nextManifest.mtime)) {
        return Promise.resolve(JSON.stringify({
          cards: [
            {
              path: 'preview/type-display.html',
              group: 'Brand',
              name: 'Fresh Type Label',
              subtitle: 'Fresh subtitle',
            },
          ],
        }));
      }
      return Promise.resolve(JSON.stringify({
        cards: [
          {
            path: 'preview/type-display.html',
            group: 'Brand',
            name: 'Old Type Label',
            subtitle: 'Old subtitle',
          },
        ],
      }));
    });

    const renderDesignSystem = (manifestFile: ProjectFile) => (
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[
          workspaceFile('DESIGN.md'),
          manifestFile,
          workspaceFile('preview/type-display.html'),
        ]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem()}
      />
    );

    const container = renderWorkspace(renderDesignSystem(firstManifest));

    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Old Type Label');

    await act(async () => {
      root?.render(renderDesignSystem(nextManifest));
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Fresh Type Label');
    expect(container.textContent).not.toContain('Old Type Label');
    expect(registryMocks.fetchProjectFileText).toHaveBeenCalledWith('ds-acme', '_ds_manifest.json', {
      cache: 'no-store',
      cacheBustKey: Math.round(firstManifest.mtime),
    });
    expect(registryMocks.fetchProjectFileText).toHaveBeenCalledWith('ds-acme', '_ds_manifest.json', {
      cache: 'no-store',
      cacheBustKey: Math.round(nextManifest.mtime),
    });
  });

  it('reports malformed design-system card manifests instead of silently falling back', async () => {
    registryMocks.fetchProjectFileText.mockResolvedValue('{not json');

    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[
          workspaceFile('DESIGN.md'),
          workspaceFile('_ds_manifest.json'),
          workspaceFile('preview/type-display.html'),
        ]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem()}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const alert = container.querySelector<HTMLElement>('[data-testid="design-system-manifest-error"]');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toContain('Invalid _ds_manifest.json');
  });

  it('reports semantically invalid design-system card entries instead of silently skipping them', async () => {
    registryMocks.fetchProjectFileText.mockResolvedValue(JSON.stringify({
      cards: [
        {
          path: 'preview/type-display.html',
          group: 123,
          name: 'Display & Headings',
        },
      ],
    }));

    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[
          workspaceFile('DESIGN.md'),
          workspaceFile('_ds_manifest.json'),
          workspaceFile('preview/type-display.html'),
        ]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem()}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const alert = container.querySelector<HTMLElement>('[data-testid="design-system-manifest-error"]');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toContain('cards[0].group must be a string');
  });

  it('does not duplicate the first review card above the grouped gallery after generation', async () => {
    registryMocks.fetchProjectFileText.mockResolvedValue(JSON.stringify({
      cards: [
        {
          path: 'preview/text-highlight.html',
          group: 'Brand',
          name: 'Text Highlighting',
          subtitle: 'Knockout box + highlighter marker',
        },
        {
          path: 'preview/type-display.html',
          group: 'Brand',
          name: 'Display & Headings',
          subtitle: 'Tahoma bold, tight',
        },
      ],
    }));

    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[
          workspaceFile('DESIGN.md'),
          workspaceFile('_ds_manifest.json'),
          workspaceFile('preview/text-highlight.html'),
          workspaceFile('preview/type-display.html'),
        ]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem()}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const titles = Array.from(container.querySelectorAll('.ds-project-section-title strong'))
      .map((node) => node.textContent);
    expect(titles.filter((title) => title === 'Text Highlighting')).toHaveLength(1);
  });

  it('inlines local React design-system preview files before sandboxing', async () => {
    registryMocks.fetchProjectFileText.mockImplementation((_projectId: string, name: string) => {
      if (name === '_ds_manifest.json') {
        return Promise.resolve(JSON.stringify({
          cards: [
            {
              path: 'ui_kits/website/index.html',
              group: 'UI Kit — Website',
              name: 'Website — Home (UI Kit)',
              subtitle: 'Full Passive Book page',
            },
          ],
        }));
      }
      if (name === 'ui_kits/website/index.html') {
        return Promise.resolve(`
          <!doctype html>
          <html>
            <head>
              <link rel="stylesheet" href="../../colors_and_type.css">
              <style>.inline-bg { background-image: url("/assets/site/inline-bg.png"); }</style>
            </head>
            <body>
              <div id="root"></div>
              <div class="inline-style" style="background-image:url('/assets/site/inline-card.png')"></div>
              <img
                alt="Hero"
                src="../assets/site/hero.png"
                srcset="../assets/site/hero.png 1x, ../assets/site/hero@2x.png 2x"
              >
              <img
                alt="Root"
                src="/assets/site/root.png"
                srcset="/assets/site/root.png 1x, /assets/site/root@2x.png 2x"
              >
              <img alt="Cache" src="/assets/site/cache.png?v=2">
              <img alt="Runtime artifact" src="/api/live-artifacts/hero.png">
              <svg><use href="../assets/site/icons.svg#logo"></use></svg>
              <script type="text/babel" src="Widget.jsx"></script>
              <script type="text/babel">ReactDOM.createRoot(document.getElementById("root")).render(<Widget />);</script>
            </body>
          </html>
        `);
      }
      if (name === 'ui_kits/website/Widget.jsx') {
        return Promise.resolve('function Widget(){ return <strong>Passive Book loaded</strong>; }');
      }
      if (name === 'colors_and_type.css') {
        return Promise.resolve(`
          @font-face { font-family: Passive; src: url("./fonts/brand.woff2"); }
          .root-asset { background-image: url("/assets/site/root-bg.png"); }
          :root { --pb-green: #00d07e; }
        `);
      }
      return Promise.resolve(null);
    });

    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[
          workspaceFile('DESIGN.md'),
          workspaceFile('_ds_manifest.json'),
          workspaceFile('colors_and_type.css'),
          workspaceFile('ui_kits/website/index.html'),
          workspaceFile('ui_kits/website/Widget.jsx'),
        ]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem()}
      />,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const iframe = container.querySelector<HTMLIFrameElement>('.ds-project-review-item iframe');
    const srcdoc = iframe?.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain('function Widget()');
    expect(srcdoc).toContain('data-od-inline-asset="Widget.jsx"');
    expect(srcdoc).toContain('data-od-inline-asset="../../colors_and_type.css"');
    expect(srcdoc).toContain('url("/api/projects/ds-acme/raw/fonts/brand.woff2")');
    expect(srcdoc).toContain('src="/api/projects/ds-acme/raw/ui_kits/assets/site/hero.png"');
    expect(srcdoc).toContain('url("/api/projects/ds-acme/raw/assets/site/inline-bg.png")');
    expect(srcdoc).toContain('/api/projects/ds-acme/raw/assets/site/inline-card.png');
    expect(srcdoc).toContain(
      'srcset="/api/projects/ds-acme/raw/ui_kits/assets/site/hero.png 1x, /api/projects/ds-acme/raw/ui_kits/assets/site/hero%402x.png 2x"',
    );
    expect(srcdoc).toContain('url("/api/projects/ds-acme/raw/assets/site/root-bg.png")');
    expect(srcdoc).toContain('src="/api/projects/ds-acme/raw/assets/site/root.png"');
    expect(srcdoc).toContain(
      'srcset="/api/projects/ds-acme/raw/assets/site/root.png 1x, /api/projects/ds-acme/raw/assets/site/root%402x.png 2x"',
    );
    expect(srcdoc).toContain('src="/api/projects/ds-acme/raw/assets/site/cache.png?v=2"');
    expect(srcdoc).toContain('src="/api/live-artifacts/hero.png"');
    expect(srcdoc).not.toContain('/api/projects/ds-acme/raw/api/live-artifacts/hero.png');
    expect(srcdoc).toContain('href="/api/projects/ds-acme/raw/ui_kits/assets/site/icons.svg#logo"');
    expect(srcdoc).not.toContain('src="Widget.jsx"');
  });

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
    expect(markup).toContain('Review Acme design system');
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
    expect(markup).not.toContain('Review Acme design system');
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
    expect(markup).not.toContain('Review Acme design system');
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
    const publishButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="design-system-publish"]',
    );

    expect(container.textContent).toContain('Connect your repo to pull aspects of your design system');
    expect(publishButton?.disabled).toBe(true);

    await act(async () => {
      publishButton?.click();
      await Promise.resolve();
    });

    expect(registryMocks.updateDesignSystemDraft).not.toHaveBeenCalled();
  });

  it('keeps the disabled-publish guidance on a non-disabled wrapper so it stays reachable', () => {
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

    const publishButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="design-system-publish"]',
    );
    expect(publishButton?.disabled).toBe(true);

    // A disabled button never fires the hover or focus that surfaces a `title`, so
    // the guidance has to live on a wrapper instead of on the button itself.
    const guidance = 'Finish importing your GitHub repo before you can publish.';
    const carrier = container.querySelector<HTMLElement>(`[title="${guidance}"]`);
    expect(carrier).toBeTruthy();
    expect(carrier?.tagName).not.toBe('BUTTON');
    expect(carrier?.contains(publishButton ?? null)).toBe(true);
  });

  it('publishes project-backed design systems and refreshes the registry state', async () => {
    registryMocks.updateDesignSystemDraft.mockResolvedValue(
      designSystem({ status: 'published' }),
    );
    const onRefresh = vi.fn();
    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[
          workspaceFile('DESIGN.md'),
          workspaceFile('context/source-context.md'),
          workspaceFile('context/github/acme-product.md'),
          workspaceFile('context/github/acme-product/files/src/components/Button.tsx'),
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
        onDesignSystemsRefresh={onRefresh}
      />,
    );
    const publishButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="design-system-publish"]',
    );

    await act(async () => {
      publishButton?.click();
      await Promise.resolve();
    });

    expect(registryMocks.updateDesignSystemDraft).toHaveBeenCalledWith('user:acme', {
      status: 'published',
    });
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Acme design system');
  });

  it('offers a Connect GitHub action that routes to Connectors when repo evidence is missing', async () => {
    const onConnectRepo = vi.fn();
    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[workspaceFile('DESIGN.md'), workspaceFile('preview/colors.html')]}
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
        onConnectRepo={onConnectRepo}
        githubConnected={false}
      />,
    );

    const connectButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Connect GitHub'),
    );
    expect(connectButton).toBeTruthy();

    await act(async () => {
      connectButton?.click();
      await Promise.resolve();
    });

    expect(onConnectRepo).toHaveBeenCalledTimes(1);
  });

  it('keeps the Connect GitHub action when evidence notes exist but file snapshots are still missing', () => {
    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[
          workspaceFile('DESIGN.md'),
          workspaceFile('context/github/acme-product.md'),
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
        onConnectRepo={vi.fn()}
        githubConnected={false}
      />,
    );

    expect(container.textContent).toContain('Connect your repo to pull aspects of your design system');
    const connectButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Connect GitHub'),
    );
    expect(connectButton).toBeTruthy();
  });

  it('shows re-import guidance instead of Connect when GitHub is already connected', () => {
    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[
          workspaceFile('DESIGN.md'),
          workspaceFile('context/github/acme-product.md'),
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
        onConnectRepo={vi.fn()}
        githubConnected
      />,
    );

    expect(container.textContent).toContain('GitHub is connected');
    expect(container.textContent).not.toContain('Connect your repo to pull aspects of your design system');
    const importButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Import repo'),
    );
    expect(importButton).toBeTruthy();
  });

  it('collapses a section once it is marked looks-good', () => {
    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[
          workspaceFile('DESIGN.md'),
          workspaceFile('preview/typography-specimens.html'),
          workspaceFile('preview/colors-primary.html'),
        ]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem()}
        designSystemReview={{
          'typography-specimens': { decision: 'looks-good', updatedAt: '2026-05-14T00:00:00.000Z' },
        }}
      />,
    );

    const items = Array.from(container.querySelectorAll('.ds-project-review-item'));
    const titleOf = (el: Element) =>
      el.querySelector('.ds-project-section-title strong')?.textContent ?? '';
    const reviewed = items.find((el) => titleOf(el) === 'typography-specimens');
    const unreviewed = items.find((el) => titleOf(el) === 'colors-primary');

    // A validated section collapses and reads as "Looks good".
    expect(reviewed?.classList.contains('is-collapsed')).toBe(true);
    expect(reviewed?.querySelector('.ds-project-section-state')?.textContent).toContain('Looks good');
    // An unreviewed section stays expanded for review.
    expect(unreviewed?.classList.contains('is-expanded')).toBe(true);
  });

  it('re-expands a grouped section after Looks good collapses it and Needs work is clicked', async () => {
    registryMocks.fetchProjectFileText.mockResolvedValue(JSON.stringify({
      cards: [
        {
          path: 'preview/colors-primary.html',
          group: 'Colors',
          name: 'Primary Colors',
          subtitle: 'Emerald green + navy ink',
        },
      ],
    }));

    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[
          workspaceFile('DESIGN.md'),
          workspaceFile('_ds_manifest.json'),
          workspaceFile('preview/colors-primary.html'),
        ]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem()}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const section = Array.from(container.querySelectorAll('.ds-project-review-item')).find((item) =>
      item.querySelector('.ds-project-section-title strong')?.textContent === 'Primary Colors',
    );
    expect(section?.classList.contains('is-expanded')).toBe(true);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="design-system-review-good-primary-colors"]')?.click();
      await Promise.resolve();
    });

    expect(section?.classList.contains('is-collapsed')).toBe(true);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="design-system-review-work-primary-colors"]')?.click();
      await Promise.resolve();
    });

    expect(section?.classList.contains('is-expanded')).toBe(true);
    expect(section?.querySelector('.ds-project-feedback-popover')).toBeTruthy();
  });

  it('reopens a looks-good section after it is regenerated so the review-again prompt stays visible', () => {
    const container = renderWorkspace(
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
        designSystemReview={{
          colors: { decision: 'looks-good', updatedAt: '2026-05-14T00:00:00.000Z' },
        }}
        designSystemActivityEvents={[
          toolUse('Write', { file_path: '/project/preview/colors.html' }, 'write-preview'),
          toolOk('write-preview'),
        ]}
      />,
    );

    const items = Array.from(container.querySelectorAll('.ds-project-review-item'));
    const titleOf = (el: Element) =>
      el.querySelector('.ds-project-section-title strong')?.textContent ?? '';
    const colors = items.find((el) => titleOf(el) === 'colors');

    // The stored decision is still "looks-good", but the regenerated files moved
    // the section back to "updated". It has to reopen instead of staying collapsed
    // behind the stale decision, so the review-again notice and the review buttons
    // are visible again.
    expect(colors?.classList.contains('is-expanded')).toBe(true);
    expect(colors?.classList.contains('is-collapsed')).toBe(false);
    expect(colors?.querySelector('.ds-project-review-actions')).toBeTruthy();
    expect(colors?.textContent).toContain('before publishing');
  });

  it('routes the default checkbox to the selected design system id', async () => {
    const onSetDefault = vi.fn();
    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[workspaceFile('DESIGN.md'), workspaceFile('preview/colors.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem({ status: 'published' })}
        defaultDesignSystemId="default"
        onSetDefaultDesignSystem={onSetDefault}
      />,
    );
    const defaultToggle = container.querySelector<HTMLInputElement>(
      '.ds-project-publish-card__toggles input[type="checkbox"]',
    );

    await act(async () => {
      defaultToggle?.click();
      await Promise.resolve();
    });

    expect(onSetDefault).toHaveBeenCalledWith('user:acme');
  });

  it('clears the default design system when the selected default checkbox is unchecked', async () => {
    const onSetDefault = vi.fn();
    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[workspaceFile('DESIGN.md'), workspaceFile('preview/colors.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem({ status: 'published' })}
        defaultDesignSystemId="user:acme"
        onSetDefaultDesignSystem={onSetDefault}
      />,
    );
    const defaultToggle = container.querySelector<HTMLInputElement>(
      '.ds-project-publish-card__toggles input[type="checkbox"]',
    );

    expect(defaultToggle?.checked).toBe(true);

    await act(async () => {
      defaultToggle?.click();
      await Promise.resolve();
    });

    expect(onSetDefault).toHaveBeenCalledWith(null);
  });
});

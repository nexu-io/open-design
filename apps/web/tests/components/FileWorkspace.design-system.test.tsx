// @vitest-environment jsdom

import { act } from 'react';
import { fireEvent, waitFor } from '@testing-library/react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FileWorkspace } from '../../src/components/FileWorkspace';
import type { AgentEvent, DesignSystemSummary, ProjectFile } from '../../src/types';

const registryMocks = vi.hoisted(() => ({
  deleteProjectFile: vi.fn(),
  fetchProjectFileText: vi.fn(),
  fetchProjectFolders: vi.fn(async () => []),
  updateDesignSystemDraft: vi.fn(),
  writeProjectTextFile: vi.fn(),
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    deleteProjectFile: registryMocks.deleteProjectFile,
    fetchProjectFileText: registryMocks.fetchProjectFileText,
    fetchProjectFolders: registryMocks.fetchProjectFolders,
    updateDesignSystemDraft: registryMocks.updateDesignSystemDraft,
    writeProjectTextFile: registryMocks.writeProjectTextFile,
  };
});

vi.mock('../../src/components/DesignBrowserPanel', () => ({
  DesignBrowserPanel: () => <div data-testid="design-browser-panel" />,
  labelFromUrl: (url: string) => url,
}));

vi.mock('../../src/components/workspace/TerminalViewer', () => ({
  TerminalViewer: ({ terminalId }: { terminalId: string }) => (
    <div data-testid="terminal-viewer">{terminalId}</div>
  ),
}));

let root: Root | null = null;
let host: HTMLDivElement | null = null;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});

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

// The in-project Design System tab renders the brand.html-style kit, which loads
// brand.json / DESIGN.md asynchronously before the publish + warning scaffolding
// (and the manifest-error banner) mount. Flush a few microtask turns so the kit
// settles and that scaffolding is present.
async function flushKit(times = 3) {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

type ToolUseEvent = Extract<AgentEvent, { kind: 'tool_use' }>;

function todoWrite(
  todos: Array<{ content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm?: string }>,
): ToolUseEvent {
  return { kind: 'tool_use', id: 'todo-write', name: 'TodoWrite', input: { todos } };
}

describe('FileWorkspace design-system project surface', () => {
  it('renders the brand.html-style kit modules from the project DESIGN.md', async () => {
    registryMocks.fetchProjectFileText.mockImplementation((_projectId: string, name: string) => {
      if (name === 'DESIGN.md') {
        return Promise.resolve(
          [
            '# Acme',
            '',
            '## Color Palette',
            '',
            '| Role | Name | Hex | Usage |',
            '| --- | --- | --- | --- |',
            '| accent | Emerald | `#10B981` | links and CTAs |',
            '| foreground | Ink | `#111827` | body text |',
          ].join('\n'),
        );
      }
      return Promise.resolve(null);
    });

    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[workspaceFile('DESIGN.md')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem()}
      />,
    );

    await flushKit();

    const kit = container.querySelector('[data-testid="design-system-project-kit"]');
    expect(kit).toBeTruthy();
    // The parsed palette renders as swatch chips (hex captions are normalized to
    // lowercase by the parser; CSS upper-cases them only visually).
    expect(container.textContent?.toLowerCase()).toContain('#10b981');
    expect(container.textContent?.toLowerCase()).toContain('#111827');
    // The DESIGN.md edit affordance lives in the sticky header's "More" menu.
    const moreTrigger = container.querySelector<HTMLButtonElement>(
      '[data-testid="design-kit-more-actions"]',
    );
    expect(moreTrigger).toBeTruthy();
    await act(async () => {
      moreTrigger?.click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Edit DESIGN.md');
    expect(container.textContent).toContain('Refresh');
    expect(container.textContent).toContain('Download');
    expect(container.textContent).not.toContain('Reset');
  });

  it('shows the design-system tab while brand extraction is running but keeps kit edits locked', async () => {
    registryMocks.fetchProjectFileText.mockImplementation((_projectId: string, name: string) => {
      if (name === 'DESIGN.md') {
        return Promise.resolve(
          [
            '# Acme',
            '',
            '## Color Palette',
            '',
            '| Role | Name | Hex | Usage |',
            '| --- | --- | --- | --- |',
            '| accent | Emerald | `#10B981` | links and CTAs |',
          ].join('\n'),
        );
      }
      return Promise.resolve(null);
    });

    const container = renderWorkspace(
      <FileWorkspace
        projectId="brand-acme"
        projectKind="prototype"
        files={[workspaceFile('DESIGN.md'), workspaceFile('brand.html')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem()}
        designSystemBrandId="brand-acme"
        designSystemEditable={false}
      />,
    );

    await flushKit();

    expect(container.querySelector('[data-testid="design-system-project-tab"]')).toBeTruthy();
    expect(container.textContent).toContain('Extracting design system');
    expect(container.querySelector<HTMLButtonElement>('[data-testid="design-system-publish"]')?.disabled).toBe(true);
    expect(container.querySelector('button[aria-label="Edit Emerald"]')).toBeNull();

    const moreTrigger = container.querySelector<HTMLButtonElement>(
      '[data-testid="design-kit-more-actions"]',
    );
    expect(moreTrigger).toBeTruthy();
    await act(async () => {
      moreTrigger?.click();
      await Promise.resolve();
    });
    expect(container.textContent).not.toContain('Edit DESIGN.md');
  });

  it('edits and resets palette colors through the color editor dialog', async () => {
    let designMdBody = [
      '# Acme',
      '',
      '## Color Palette',
      '',
      '| Role | Name | Hex | Usage |',
      '| --- | --- | --- | --- |',
      '| accent | Emerald | `#10B981` | links and CTAs |',
      '| foreground | Ink | `#111827` | body text |',
    ].join('\n');
    registryMocks.fetchProjectFileText.mockImplementation((_projectId: string, name: string) => {
      if (name === 'DESIGN.md') return Promise.resolve(designMdBody);
      return Promise.resolve(null);
    });
    registryMocks.writeProjectTextFile.mockImplementation((_projectId: string, name: string, body: string) => {
      if (name === 'DESIGN.md') designMdBody = body;
      return Promise.resolve(workspaceFile(name));
    });
    registryMocks.updateDesignSystemDraft.mockResolvedValue(designSystem());

    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[workspaceFile('DESIGN.md')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem()}
      />,
    );

    await flushKit();

    const editEmerald = container.querySelector<HTMLButtonElement>('button[aria-label="Edit Emerald"]');
    expect(editEmerald).toBeTruthy();
    await act(async () => {
      fireEvent.click(editEmerald!);
    });
    const dialog = document.body.querySelector<HTMLElement>('[data-testid="design-kit-color-editor"]');
    expect(dialog).toBeTruthy();
    const hexInput = dialog!.querySelector<HTMLInputElement>('input[aria-label="Hex value"]');
    expect(hexInput).toBeTruthy();
    await act(async () => {
      fireEvent.change(hexInput!, { target: { value: '#FF6A3D' } });
    });
    const save = Array.from(dialog!.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Save color'));
    expect(save).toBeTruthy();
    await act(async () => {
      fireEvent.click(save!);
      await Promise.resolve();
    });

    await waitFor(() => expect(registryMocks.writeProjectTextFile).toHaveBeenLastCalledWith(
      'ds-acme',
      'DESIGN.md',
      expect.stringContaining('`#FF6A3D`'),
    ));

    await flushKit();
    await waitFor(() => expect(document.body.querySelector('[data-testid="design-kit-color-editor"]')).toBeNull());
    const editAgain = container.querySelector<HTMLButtonElement>('button[aria-label="Edit Emerald"]');
    expect(editAgain).toBeTruthy();
    await act(async () => {
      fireEvent.click(editAgain!);
    });
    const resetDialog = document.body.querySelector<HTMLElement>('[data-testid="design-kit-color-editor"]');
    const reset = Array.from(resetDialog!.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Reset'));
    expect(reset).toBeTruthy();
    await act(async () => {
      fireEvent.click(reset!);
      await Promise.resolve();
    });

    await waitFor(() => expect(registryMocks.writeProjectTextFile).toHaveBeenLastCalledWith(
      'ds-acme',
      'DESIGN.md',
      expect.stringContaining('`#10B981`'),
    ));
  });

  it('finalizes brand-backed palette edits before refreshing project files and design-system lists', async () => {
    let brandJson = JSON.stringify({
      name: 'Acme',
      sourceUrl: 'https://acme.test',
      logo: { primary: null, alternates: [] },
      colors: [{ role: 'accent', name: 'Emerald', hex: '#10B981', usage: 'links and CTAs' }],
      typography: {},
      imagery: { style: '', subjects: [], treatment: '', avoid: [], samples: [] },
      voice: {
        adjectives: [],
        tone: '',
        messagingPillars: [],
        vocabulary: { use: [], avoid: [] },
      },
      layout: { radius: '', borderWeight: '', spacing: '', postureRules: [] },
    });
    registryMocks.fetchProjectFileText.mockImplementation((_projectId: string, name: string) => {
      if (name === 'DESIGN.md') return Promise.resolve('# Acme');
      if (name === 'brand.json') return Promise.resolve(brandJson);
      return Promise.resolve(null);
    });
    registryMocks.writeProjectTextFile.mockImplementation((_projectId: string, name: string, body: string) => {
      if (name === 'brand.json') brandJson = body;
      return Promise.resolve(workspaceFile(name));
    });
    const events: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/plugins') {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/raw/fonts/') || url.includes('/raw/system/tokens.')) {
        return new Response(null, { status: 404 });
      }
      events.push(url);
      return new Response(JSON.stringify({ id: 'brand-acme' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const onRefreshFiles = vi.fn(() => {
      events.push('refresh-files');
    });
    const onDesignSystemsRefresh = vi.fn(() => {
      events.push('refresh-design-systems');
    });

    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[workspaceFile('DESIGN.md'), workspaceFile('brand.json')]}
        liveArtifacts={[]}
        onRefreshFiles={onRefreshFiles}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem()}
        designSystemBrandId="brand-acme"
        onDesignSystemsRefresh={onDesignSystemsRefresh}
      />,
    );

    await flushKit();

    const editEmerald = container.querySelector<HTMLButtonElement>('button[aria-label="Edit Emerald"]');
    expect(editEmerald).toBeTruthy();
    await act(async () => {
      fireEvent.click(editEmerald!);
    });
    const dialog = document.body.querySelector<HTMLElement>('[data-testid="design-kit-color-editor"]');
    const hexInput = dialog?.querySelector<HTMLInputElement>('input[aria-label="Hex value"]');
    expect(hexInput).toBeTruthy();
    await act(async () => {
      fireEvent.change(hexInput!, { target: { value: '#FF6A3D' } });
    });
    const save = Array.from(dialog!.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Save color'));
    expect(save).toBeTruthy();

    await act(async () => {
      fireEvent.click(save!);
      await Promise.resolve();
    });

    await waitFor(() => expect(registryMocks.writeProjectTextFile).toHaveBeenCalledWith(
      'ds-acme',
      'brand.json',
      expect.stringContaining('"hex": "#FF6A3D"'),
    ));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/brands/brand-acme/finalize',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ projectId: 'ds-acme' }),
      }),
    ));
    expect(events).toEqual([
      '/api/brands/brand-acme/finalize',
      'refresh-files',
      'refresh-design-systems',
    ]);
  });

  it('deletes image module assets from the project and refreshes dependents', async () => {
    registryMocks.fetchProjectFileText.mockImplementation((_projectId: string, name: string) => {
      if (name === 'DESIGN.md') return Promise.resolve('# Acme');
      if (name === 'brand.json') {
        return Promise.resolve(JSON.stringify({
          name: 'Acme',
          sourceUrl: 'https://acme.test',
          logo: { primary: null, alternates: [] },
          colors: [],
          typography: {},
          imagery: {
            style: 'Product imagery',
            subjects: [],
            treatment: '',
            avoid: [],
            samples: [{ file: 'imagery/hero.png', caption: 'Hero', kind: 'hero' }],
          },
          voice: {
            adjectives: [],
            tone: '',
            messagingPillars: [],
            vocabulary: { use: [], avoid: [] },
          },
          layout: { radius: '', borderWeight: '', spacing: '', postureRules: [] },
        }));
      }
      return Promise.resolve(null);
    });
    registryMocks.writeProjectTextFile.mockResolvedValue(workspaceFile('brand.json'));
    registryMocks.deleteProjectFile.mockResolvedValue(true);
    const events: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/plugins') {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/raw/fonts/') || url.includes('/raw/system/tokens.')) {
        return new Response(null, { status: 404 });
      }
      events.push(url);
      return new Response(JSON.stringify({ id: 'brand-acme' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const onRefreshFiles = vi.fn(() => {
      events.push('refresh-files');
    });
    const onDesignSystemsRefresh = vi.fn(() => {
      events.push('refresh-design-systems');
    });

    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[workspaceFile('DESIGN.md'), workspaceFile('brand.json'), workspaceFile('imagery/hero.png')]}
        liveArtifacts={[]}
        onRefreshFiles={onRefreshFiles}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem()}
        designSystemBrandId="brand-acme"
        onDesignSystemsRefresh={onDesignSystemsRefresh}
      />,
    );

    await flushKit();

    const deleteImage = container.querySelector<HTMLButtonElement>('button[aria-label="Delete Hero"]');
    expect(deleteImage).toBeTruthy();
    await act(async () => {
      fireEvent.click(deleteImage!);
      await Promise.resolve();
    });

    await waitFor(() => expect(registryMocks.writeProjectTextFile).toHaveBeenCalledWith(
      'ds-acme',
      'brand.json',
      expect.not.stringContaining('imagery/hero.png'),
    ));
    expect(registryMocks.deleteProjectFile).toHaveBeenCalledWith('ds-acme', 'imagery/hero.png');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/brands/brand-acme/finalize',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ projectId: 'ds-acme' }),
      }),
    );
    expect(events).toEqual([
      '/api/brands/brand-acme/finalize',
      'refresh-files',
      'refresh-design-systems',
    ]);
  });

  it('refreshes before downloading the current project archive', async () => {
    registryMocks.fetchProjectFileText.mockImplementation((_projectId: string, name: string) => {
      if (name === 'DESIGN.md') return Promise.resolve('# Acme');
      return Promise.resolve(null);
    });
    const events: string[] = [];
    const onRefreshFiles = vi.fn(async () => {
      events.push('refresh-files');
    });
    const onDesignSystemsRefresh = vi.fn(() => {
      events.push('refresh-design-systems');
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/plugins') {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/raw/fonts/') || url.includes('/raw/system/tokens.')) {
        return new Response(null, { status: 404 });
      }
      events.push(url);
      if (url === '/api/brands/brand-acme/finalize') {
        return new Response(JSON.stringify({ id: 'brand-acme' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(new Blob(['zip']), {
        status: 200,
        headers: { 'Content-Disposition': 'attachment; filename="acme.zip"' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const NativeUrl = URL;
    class MockUrl extends NativeUrl {
      static createObjectURL = vi.fn(() => 'blob:archive');
      static revokeObjectURL = vi.fn();
    }
    vi.stubGlobal('URL', MockUrl);

    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[workspaceFile('DESIGN.md')]}
        liveArtifacts={[]}
        onRefreshFiles={onRefreshFiles}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem()}
        designSystemBrandId="brand-acme"
        onDesignSystemsRefresh={onDesignSystemsRefresh}
      />,
    );

    await flushKit();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="design-kit-more-actions"]')?.click();
      await Promise.resolve();
    });
    const downloadItem = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ).find((button) => button.textContent?.includes('Download'));
    expect(downloadItem).toBeTruthy();

    await act(async () => {
      fireEvent.click(downloadItem!);
      await Promise.resolve();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(events).toEqual([
      '/api/brands/brand-acme/finalize',
      'refresh-files',
      'refresh-design-systems',
      '/api/projects/ds-acme/archive',
    ]);
  });

  it('reports malformed design-system card manifests instead of silently falling back', async () => {
    registryMocks.fetchProjectFileText.mockResolvedValue('{not json');

    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[workspaceFile('DESIGN.md'), workspaceFile('_ds_manifest.json')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem()}
      />,
    );

    await flushKit();

    const alert = container.querySelector<HTMLElement>('[data-testid="design-system-manifest-error"]');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toContain('Invalid _ds_manifest.json');
  });

  it('reports semantically invalid design-system card entries instead of silently skipping them', async () => {
    registryMocks.fetchProjectFileText.mockResolvedValue(
      JSON.stringify({ cards: [{ path: 'preview/type-display.html', group: 123, name: 'Display' }] }),
    );

    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[workspaceFile('DESIGN.md'), workspaceFile('_ds_manifest.json')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem()}
      />,
    );

    await flushKit();

    const alert = container.querySelector<HTMLElement>('[data-testid="design-system-manifest-error"]');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toContain('cards[0].group must be a string');
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
  });

  it('shows the completed extraction state once generation is no longer running', async () => {
    registryMocks.fetchProjectFileText.mockResolvedValue('# Acme\n\n## Voice\nReady.');

    const container = renderWorkspace(
      <FileWorkspace
        projectId="ds-acme"
        projectKind="prototype"
        files={[workspaceFile('DESIGN.md')]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
        designSystemProject={designSystem()}
      />,
    );

    await flushKit();

    expect(container.textContent).toContain('Extraction complete');
    expect(container.textContent).toContain('Your design system is ready');
    expect(container.textContent).not.toContain('Creating your design system...');
    expect(container.textContent).not.toContain('Keep this tab open. You can come back in a few minutes.');
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

    await flushKit();

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

  it('keeps the disabled-publish guidance on a non-disabled wrapper so it stays reachable', async () => {
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

    await flushKit();

    const publishButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="design-system-publish"]',
    );
    expect(publishButton?.disabled).toBe(true);

    // A disabled button never fires hover/focus, so the guidance lives on a
    // non-disabled wrapper that still contains the button.
    const guidance = 'Finish importing your GitHub repo before you can publish.';
    const carrier = container.querySelector<HTMLElement>(`[title="${guidance}"]`);
    expect(carrier).toBeTruthy();
    expect(carrier?.tagName).not.toBe('BUTTON');
    expect(carrier?.contains(publishButton ?? null)).toBe(true);
  });

  it('publishes project-backed design systems and refreshes the registry state', async () => {
    registryMocks.updateDesignSystemDraft.mockResolvedValue(designSystem({ status: 'published' }));
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

    await flushKit();

    const publishButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="design-system-publish"]',
    );
    expect(publishButton?.disabled).toBe(false);

    await act(async () => {
      publishButton?.click();
      await Promise.resolve();
    });

    expect(registryMocks.updateDesignSystemDraft).toHaveBeenCalledWith('user:acme', {
      status: 'published',
    });
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('routes Create new design to the selected design system', async () => {
    const onUseDesignSystem = vi.fn();
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
        onUseDesignSystem={onUseDesignSystem}
      />,
    );

    await flushKit();

    const newDesignButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Create new design'),
    );
    expect(newDesignButton).toBeTruthy();

    await act(async () => {
      newDesignButton?.click();
      await Promise.resolve();
    });

    expect(onUseDesignSystem).toHaveBeenCalledWith('user:acme', 'Acme Design System');
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

    await flushKit();

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

  it('keeps the Connect GitHub action when evidence notes exist but file snapshots are still missing', async () => {
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

    await flushKit();

    expect(container.textContent).toContain('Connect your repo to pull aspects of your design system');
    const connectButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Connect GitHub'),
    );
    expect(connectButton).toBeTruthy();
  });

  it('shows re-import guidance instead of Connect when GitHub is already connected', async () => {
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

    await flushKit();

    expect(container.textContent).toContain('GitHub is connected');
    expect(container.textContent).not.toContain('Connect your repo to pull aspects of your design system');
    const importButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Import repo'),
    );
    expect(importButton).toBeTruthy();
  });

  it('routes the default button to the selected design system id', async () => {
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

    await flushKit();

    const moreTrigger = container.querySelector<HTMLButtonElement>(
      '[data-testid="design-kit-more-actions"]',
    );
    expect(moreTrigger).toBeTruthy();
    await act(async () => {
      moreTrigger?.click();
      await Promise.resolve();
    });

    const defaultItem = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]'),
    ).find((button) => button.textContent?.includes('Default for new chats'));
    expect(defaultItem).toBeTruthy();
    expect(defaultItem?.getAttribute('aria-checked')).toBe('false');

    await act(async () => {
      defaultItem?.click();
      await Promise.resolve();
    });

    expect(onSetDefault).toHaveBeenCalledWith('user:acme');
  });

  it('clears the default design system when the selected default button is pressed', async () => {
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

    await flushKit();

    const moreTrigger = container.querySelector<HTMLButtonElement>(
      '[data-testid="design-kit-more-actions"]',
    );
    await act(async () => {
      moreTrigger?.click();
      await Promise.resolve();
    });

    const defaultItem = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]'),
    ).find((button) => button.textContent?.includes('Chat default'));
    expect(defaultItem?.getAttribute('aria-checked')).toBe('true');

    await act(async () => {
      defaultItem?.click();
      await Promise.resolve();
    });

    expect(onSetDefault).toHaveBeenCalledWith(null);
  });
});

// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { forwardRef, useImperativeHandle, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { Conversation, ProjectFile, ProjectMetadata } from '../../src/types';

const composerMocks = vi.hoisted(() => ({
  focus: vi.fn(),
  restoreDraft: vi.fn(),
  setDraft: vi.fn(),
}));

const translate = (key: string, vars?: Record<string, string | number>) => {
  if (key === 'chat.designArtifactsShowMore') {
    return `Show ${vars?.count ?? ''} more design files`;
  }
  return key;
};

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, ref) => {
    useImperativeHandle(ref, () => ({
      focus: composerMocks.focus,
      restoreDraft: composerMocks.restoreDraft,
      setDraft: composerMocks.setDraft,
    }));
    return <output data-testid="composer" />;
  }),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const conversations: Conversation[] = [
  { id: 'conv-1', projectId: 'project-1', title: 'Conversation 1', createdAt: 1, updatedAt: 1 },
];

function renderPane(extra: Partial<React.ComponentProps<typeof ChatPane>>) {
  return render(
    <ChatPane
      projectKindForTracking="prototype"
      messages={[]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      conversations={conversations}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      projectMetadata={{ kind: 'prototype' }}
      {...extra}
    />,
  );
}

function file(name: string, kind: ProjectFile['kind'], mtime: number): ProjectFile {
  return {
    name,
    size: 128,
    mtime,
    kind,
    mime: kind === 'html' ? 'text/html' : kind === 'image' ? 'image/jpeg' : 'text/plain',
  };
}

describe('ChatPane imported folder surfaces', () => {
  it('does not flash imported asset cards while UI surfaces are loading', async () => {
    const metadata: ProjectMetadata = {
      kind: 'prototype',
      importedFrom: 'folder',
      entryFile: 'site/index.html',
    };
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));

    renderPane({
      projectMetadata: metadata,
      projectFiles: [
        file('site/index.html', 'html', 20),
        file('assets/hero-mockup.jpg', 'image', 10),
      ],
      onRequestOpenFile: vi.fn(),
    });

    const loading = await screen.findByTestId('chat-ui-surfaces-loading');
    expect(within(loading).getByText('Scanning files')).toBeTruthy();
    expect(screen.queryByTestId('chat-design-artifacts')).toBeNull();
    expect(screen.queryByText('assets/hero-mockup.jpg')).toBeNull();
  });

  it('replaces empty starter prompts with discovered UI surfaces', async () => {
    const onRequestOpenFile = vi.fn();
    const onOpenEditableSurface = vi.fn();
    const onInspectSurfaceFiles = vi.fn();
    const metadata: ProjectMetadata = {
      kind: 'prototype',
      importedFrom: 'folder',
      entryFile: 'site/index.html',
    };
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (typeof url === 'string' && url.includes('/ui-surfaces')) {
        return json({
          surfaces: [
            {
              id: 'home',
              label: 'Home screen',
              route: '/',
              kind: 'static-html',
              confidence: 'high',
              framework: null,
              entryFile: 'site/index.html',
              previewFile: 'site/index.html',
              previewRuntimeRoot: null,
              previewPath: '/',
              previewStatus: 'live-preview',
              sourceFiles: ['site/index.html'],
              styleFiles: ['site/styles.css'],
              scriptFiles: ['site/app.js'],
              assetFiles: ['assets/hero-mockup.jpg'],
              fontFiles: ['fonts/Inter.woff2'],
              externalDependencies: [
                { packageName: 'lucide-react', importPath: 'lucide-react', kind: 'icons' },
              ],
              reasons: ['HTML screen file detected'],
              mtime: 20,
            },
          ],
          generatedAt: '2026-06-02T00:00:00.000Z',
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }));

    renderPane({
      projectMetadata: metadata,
      projectFiles: [
        file('README.md', 'text', 30),
        file('site/index.html', 'html', 20),
        file('site/styles.css', 'code', 19),
        file('site/app.js', 'code', 18),
        file('assets/hero-mockup.jpg', 'image', 10),
        file('fonts/Inter.woff2', 'binary', 9),
        file('bundle.js.map', 'code', 40),
      ],
      onRequestOpenFile,
      onOpenEditableSurface,
      onInspectSurfaceFiles,
    });

    expect(screen.queryByText('chat.startTitle')).toBeNull();
    expect(screen.queryByText('chat.example1Title')).toBeNull();

    const surfaces = await screen.findByTestId('chat-ui-surfaces');
    expect(screen.queryByTestId('chat-design-artifacts')).toBeNull();
    expect(within(surfaces).getByText('Home screen')).toBeTruthy();
    expect(within(surfaces).getByText('/')).toBeTruthy();
    const inspectFilesButton = within(surfaces).getByRole('button', {
      name: 'Inspect files for Home screen',
    });
    expect(inspectFilesButton.textContent).toBe('5 frontend files');
    expect(within(surfaces).getByText('1 packages')).toBeTruthy();
    expect(within(surfaces).getByText('lucide-react')).toBeTruthy();
    fireEvent.click(inspectFilesButton);
    expect(onInspectSurfaceFiles).toHaveBeenCalledWith({
      surfaceId: 'home',
      label: 'Home screen',
      fileNames: [
        'site/index.html',
        'site/styles.css',
        'site/app.js',
        'assets/hero-mockup.jpg',
        'fonts/Inter.woff2',
      ],
      preferredFileName: 'site/index.html',
    });

    const firstCard = screen.getByTestId('chat-ui-surface-0');
    expect(firstCard.querySelector('iframe')?.getAttribute('src')).toBe(
      '/api/projects/project-1/raw/site/index.html?v=20',
    );

    expect(within(firstCard).queryByRole('button', { name: 'Open' })).toBeNull();
    fireEvent.click(screen.getByTestId('chat-ui-surface-edit-0'));
    expect(onRequestOpenFile).toHaveBeenCalledTimes(1);
    expect(onRequestOpenFile).toHaveBeenCalledWith('site/index.html');
    expect(onOpenEditableSurface).not.toHaveBeenCalled();
    expect(composerMocks.restoreDraft).not.toHaveBeenCalled();
  });

  it('starts a managed runtime preview for source-mapped screens', async () => {
    const metadata: ProjectMetadata = {
      kind: 'prototype',
      importedFrom: 'folder',
      entryFile: 'app/page.tsx',
    };
    const onOpenEditableSurface = vi.fn();
    const fetchMock = vi.fn(async (url, init) => {
      if (typeof url === 'string' && url.includes('/ui-surfaces')) {
        return json({
          surfaces: [
            {
              id: 'messages',
              label: 'Messages screen',
              route: '/messages/:conversationId',
              kind: 'next-route',
              confidence: 'high',
              framework: 'Next.js',
              entryFile: 'app/messages/[conversationId]/page.tsx',
              previewFile: null,
              previewRuntimeRoot: '',
              previewPath: '/messages/preview',
              previewStatus: 'source-mapped',
              sourceFiles: ['app/messages/[conversationId]/page.tsx', 'app/layout.tsx'],
              styleFiles: ['app/globals.css'],
              scriptFiles: [],
              assetFiles: [],
              fontFiles: [],
              externalDependencies: [
                { packageName: 'next', importPath: 'next', kind: 'runtime' },
              ],
              reasons: ['Next.js route file detected'],
              mtime: 20,
            },
          ],
          generatedAt: '2026-06-02T00:00:00.000Z',
        });
      }
      if (typeof url === 'string' && url.includes('/ui-preview')) {
        expect(init).toEqual(expect.objectContaining({ method: 'POST' }));
        return json({
          status: 'ready',
          runtimeRoot: '',
          baseUrl: '/api/projects/project-1/ui-preview/proxy/proxy-token',
          url: '/api/projects/project-1/ui-preview/proxy/proxy-token/messages/preview',
          upstreamBaseUrl: 'http://127.0.0.1:43210',
          route: '/messages/preview',
        });
      }
      if (typeof url === 'string' && url.includes('/raw/design-snapshots/messages.html')) {
        return html('<!doctype html><html data-od-editable-snapshot="true" style="color: rgb(1, 2, 3);"><body style="font-family: Inter;"><main style="display: grid; color: rgb(1, 2, 3);">Existing edit</main></body></html>');
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPane({
      projectMetadata: metadata,
      projectFiles: [
        file('app/messages/[conversationId]/page.tsx', 'code', 20),
        file('app/layout.tsx', 'code', 19),
        file('app/globals.css', 'code', 18),
        file('design-snapshots/messages.html', 'html', 30),
      ],
      onRequestOpenFile: vi.fn(),
      onOpenEditableSurface,
    });

    const surface = await screen.findByTestId('chat-ui-surface-0');
    await waitFor(() => {
      expect(surface.querySelector('iframe')?.getAttribute('src')).toBe(
        '/api/projects/project-1/ui-preview/proxy/proxy-token/messages/preview',
      );
    });
    expect(within(surface).getByText('Live preview')).toBeTruthy();
    expect(screen.queryByText('No live preview')).toBeNull();

    expect(within(surface).queryByRole('button', { name: 'Open' })).toBeNull();
    fireEvent.click(within(surface).getByRole('button', { name: 'Edit design' }));
    await waitFor(() => {
      expect(onOpenEditableSurface).toHaveBeenCalledWith({
        fileName: 'design-snapshots/messages-2.html',
        html: expect.stringContaining('Existing edit'),
      });
    });
  });

  it('forks an existing editable snapshot while repairing media URLs', async () => {
    const metadata: ProjectMetadata = {
      kind: 'prototype',
      importedFrom: 'folder',
      entryFile: 'app/page.tsx',
    };
    const onOpenEditableSurface = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (typeof url === 'string' && url.includes('/ui-surfaces')) {
        return json({
          surfaces: [
            {
              id: 'messages',
              label: 'Messages screen',
              route: '/messages/:conversationId',
              kind: 'next-route',
              confidence: 'high',
              framework: 'Next.js',
              entryFile: 'app/messages/[conversationId]/page.tsx',
              previewFile: null,
              previewRuntimeRoot: '',
              previewPath: '/messages/preview',
              previewStatus: 'source-mapped',
              sourceFiles: ['app/messages/[conversationId]/page.tsx'],
              styleFiles: ['app/globals.css'],
              scriptFiles: [],
              assetFiles: ['public/assets/logo.png'],
              fontFiles: [],
              externalDependencies: [
                { packageName: 'next', importPath: 'next', kind: 'runtime' },
              ],
              reasons: ['Next.js route file detected'],
              mtime: 20,
            },
          ],
          generatedAt: '2026-06-02T00:00:00.000Z',
        });
      }
      if (typeof url === 'string' && url.includes('/ui-preview')) {
        expect(init).toEqual(expect.objectContaining({ method: 'POST' }));
        return json({
          status: 'ready',
          runtimeRoot: '',
          baseUrl: '/api/projects/project-1/ui-preview/proxy/proxy-token',
          url: '/api/projects/project-1/ui-preview/proxy/proxy-token/messages/preview',
          upstreamBaseUrl: 'http://127.0.0.1:43210',
          route: '/messages/preview',
        });
      }
      if (typeof url === 'string' && url.includes('/raw/design-snapshots/messages.html')) {
        return html(`<!doctype html>
          <html data-od-editable-snapshot="true" style="color: rgb(1, 2, 3);">
            <body style="font-family: Inter;">
              <main style="display: grid; color: rgb(1, 2, 3);">
                <h1 style="display: block;">Existing edited headline</h1>
                <img src="/assets/logo.png" alt="Logo">
              </main>
            </body>
          </html>`);
      }
      throw new Error(`unexpected fetch ${url}`);
    }));

    renderPane({
      projectMetadata: metadata,
      projectFiles: [
        file('app/messages/[conversationId]/page.tsx', 'code', 20),
        file('app/globals.css', 'code', 18),
        file('public/assets/logo.png', 'image', 16),
        file('design-snapshots/messages.html', 'html', 30),
      ],
      onRequestOpenFile: vi.fn(),
      onOpenEditableSurface,
    });

    const surface = await screen.findByTestId('chat-ui-surface-0');
    fireEvent.click(within(surface).getByRole('button', { name: 'Edit design' }));

    await waitFor(() => {
      expect(onOpenEditableSurface).toHaveBeenCalledWith({
        fileName: 'design-snapshots/messages-2.html',
        html: expect.stringContaining('Existing edited headline'),
      });
    });
    expect(onOpenEditableSurface.mock.calls[0]?.[0]?.html ?? '').toContain(
      '/api/projects/project-1/raw/public/assets/logo.png',
    );
  });

  it('forks from the active editable snapshot revision when one is open', async () => {
    const metadata: ProjectMetadata = {
      kind: 'prototype',
      importedFrom: 'folder',
      entryFile: 'app/page.tsx',
    };
    const onOpenEditableSurface = vi.fn();
    const fetchMock = vi.fn(async (url, init) => {
      if (typeof url === 'string' && url.includes('/ui-surfaces')) {
        return json({
          surfaces: [
            {
              id: 'messages',
              label: 'Messages screen',
              route: '/messages/:conversationId',
              kind: 'next-route',
              confidence: 'high',
              framework: 'Next.js',
              entryFile: 'app/messages/[conversationId]/page.tsx',
              previewFile: null,
              previewRuntimeRoot: '',
              previewPath: '/messages/preview',
              previewStatus: 'source-mapped',
              sourceFiles: ['app/messages/[conversationId]/page.tsx'],
              styleFiles: ['app/globals.css'],
              scriptFiles: [],
              assetFiles: [],
              fontFiles: [],
              externalDependencies: [
                { packageName: 'next', importPath: 'next', kind: 'runtime' },
              ],
              reasons: ['Next.js route file detected'],
              mtime: 20,
            },
          ],
          generatedAt: '2026-06-02T00:00:00.000Z',
        });
      }
      if (typeof url === 'string' && url.includes('/ui-preview')) {
        expect(init).toEqual(expect.objectContaining({ method: 'POST' }));
        return json({
          status: 'ready',
          runtimeRoot: '',
          baseUrl: '/api/projects/project-1/ui-preview/proxy/proxy-token',
          url: '/api/projects/project-1/ui-preview/proxy/proxy-token/messages/preview',
          upstreamBaseUrl: 'http://127.0.0.1:43210',
          route: '/messages/preview',
        });
      }
      if (typeof url === 'string' && url.includes('/raw/design-snapshots/messages-2.html')) {
        return html('<!doctype html><html data-od-editable-snapshot="true" style="display: block;"><body style="display: block;"><main style="display: grid;">Second saved edit</main></body></html>');
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPane({
      projectMetadata: metadata,
      projectFiles: [
        file('app/messages/[conversationId]/page.tsx', 'code', 20),
        file('app/globals.css', 'code', 18),
        file('design-snapshots/messages.html', 'html', 30),
        file('design-snapshots/messages-2.html', 'html', 31),
      ],
      activeProjectFileName: 'design-snapshots/messages-2.html',
      onRequestOpenFile: vi.fn(),
      onOpenEditableSurface,
    });

    const surface = await screen.findByTestId('chat-ui-surface-0');
    fireEvent.click(within(surface).getByRole('button', { name: 'Edit design' }));

    await waitFor(() => {
      expect(onOpenEditableSurface).toHaveBeenCalledWith({
        fileName: 'design-snapshots/messages-3.html',
        html: expect.stringContaining('Second saved edit'),
      });
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/raw/design-snapshots/messages-2.html'),
      expect.any(Object),
    );
  });

  it('keeps a runtime preview covered until the iframe finishes loading', async () => {
    const metadata: ProjectMetadata = {
      kind: 'prototype',
      importedFrom: 'folder',
      entryFile: 'app/page.tsx',
    };
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (typeof url === 'string' && url.includes('/ui-surfaces')) {
        return json({
          surfaces: [
            {
              id: 'messages',
              label: 'Messages screen',
              route: '/messages/:conversationId',
              kind: 'next-route',
              confidence: 'high',
              framework: 'Next.js',
              entryFile: 'app/messages/[conversationId]/page.tsx',
              previewFile: null,
              previewRuntimeRoot: '',
              previewPath: '/messages/preview',
              previewStatus: 'source-mapped',
              sourceFiles: ['app/messages/[conversationId]/page.tsx'],
              styleFiles: ['app/globals.css'],
              scriptFiles: [],
              assetFiles: [],
              fontFiles: [],
              externalDependencies: [
                { packageName: 'next', importPath: 'next', kind: 'runtime' },
              ],
              reasons: ['Next.js route file detected'],
              mtime: 20,
            },
          ],
          generatedAt: '2026-06-02T00:00:00.000Z',
        });
      }
      if (typeof url === 'string' && url.includes('/ui-preview')) {
        expect(init).toEqual(expect.objectContaining({ method: 'POST' }));
        return json({
          status: 'ready',
          runtimeRoot: '',
          baseUrl: '/api/projects/project-1/ui-preview/proxy/proxy-token',
          url: '/api/projects/project-1/ui-preview/proxy/proxy-token/messages/preview',
          upstreamBaseUrl: 'http://127.0.0.1:43210',
          route: '/messages/preview',
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }));

    renderPane({
      projectMetadata: metadata,
      projectFiles: [
        file('app/messages/[conversationId]/page.tsx', 'code', 20),
        file('app/globals.css', 'code', 18),
      ],
      onRequestOpenFile: vi.fn(),
      onOpenEditableSurface: vi.fn(),
    });

    const surface = await screen.findByTestId('chat-ui-surface-0');
    const iframe = await waitFor(() => {
      const node = surface.querySelector('iframe');
      expect(node?.getAttribute('src')).toBe(
        '/api/projects/project-1/ui-preview/proxy/proxy-token/messages/preview',
      );
      return node!;
    });
    const liveFrame = surface.querySelector('.chat-ui-surface-live-frame');
    expect(liveFrame?.getAttribute('data-ready')).toBe('false');
    expect(within(surface).getByText('Starting preview')).toBeTruthy();

    fireEvent.load(iframe);

    await waitFor(() => {
      expect(liveFrame?.getAttribute('data-ready')).toBe('true');
    });
  });

  it('forks a fresh editable snapshot when the existing snapshot contains a proxy error', async () => {
    const metadata: ProjectMetadata = {
      kind: 'prototype',
      importedFrom: 'folder',
      entryFile: 'app/page.tsx',
    };
    const onOpenEditableSurface = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (typeof url === 'string' && url.includes('/ui-surfaces')) {
        return json({
          surfaces: [
            {
              id: 'messages',
              label: 'Messages screen',
              route: '/messages/:conversationId',
              kind: 'next-route',
              confidence: 'high',
              framework: 'Next.js',
              entryFile: 'app/messages/[conversationId]/page.tsx',
              previewFile: null,
              previewRuntimeRoot: '',
              previewPath: '/messages/preview',
              previewStatus: 'source-mapped',
              sourceFiles: ['app/messages/[conversationId]/page.tsx'],
              styleFiles: ['app/globals.css'],
              scriptFiles: [],
              assetFiles: [],
              fontFiles: [],
              externalDependencies: [
                { packageName: 'next', importPath: 'next', kind: 'runtime' },
              ],
              reasons: ['Next.js route file detected'],
              mtime: 20,
            },
          ],
          generatedAt: '2026-06-02T00:00:00.000Z',
        });
      }
      if (typeof url === 'string' && url.includes('/ui-preview')) {
        expect(init).toEqual(expect.objectContaining({ method: 'POST' }));
        return json({
          status: 'ready',
          runtimeRoot: '',
          baseUrl: '/api/projects/project-1/ui-preview/proxy/proxy-token',
          url: '/api/projects/project-1/ui-preview/proxy/proxy-token/messages/preview',
          upstreamBaseUrl: 'http://127.0.0.1:43210',
          route: '/messages/preview',
        });
      }
      if (typeof url === 'string' && url.includes('/raw/design-snapshots/messages.html')) {
        return html(`<!doctype html>
          <html data-od-editable-snapshot="true">
            <body><pre>Parse Error: Content-Length can't be present with Transfer-Encoding</pre></body>
          </html>
        `);
      }
      throw new Error(`unexpected fetch ${url}`);
    }));

    renderPane({
      projectMetadata: metadata,
      projectFiles: [
        file('app/messages/[conversationId]/page.tsx', 'code', 20),
        file('app/globals.css', 'code', 18),
        file('design-snapshots/messages.html', 'html', 30),
      ],
      onRequestOpenFile: vi.fn(),
      onOpenEditableSurface,
    });

    const surface = await screen.findByTestId('chat-ui-surface-0');
    const iframe = await waitFor(() => {
      const node = surface.querySelector('iframe');
      expect(node?.getAttribute('src')).toBe(
        '/api/projects/project-1/ui-preview/proxy/proxy-token/messages/preview',
      );
      return node!;
    });
    iframe.contentDocument!.open();
    iframe.contentDocument!.write(`<!doctype html>
      <html>
      <head><title>Runtime app</title></head>
      <body><main><h1>Recovered runtime headline</h1></main></body>
      </html>
    `);
    iframe.contentDocument!.close();

    fireEvent.click(within(surface).getByRole('button', { name: 'Edit design' }));

    await waitFor(() => {
      expect(onOpenEditableSurface).toHaveBeenCalledWith({
        fileName: 'design-snapshots/messages-2.html',
        html: expect.stringContaining('Recovered runtime headline'),
      });
    });
  });

  it('forks a fresh editable snapshot when the existing snapshot style coverage is incomplete', async () => {
    const metadata: ProjectMetadata = {
      kind: 'prototype',
      importedFrom: 'folder',
      entryFile: 'app/page.tsx',
    };
    const onOpenEditableSurface = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (typeof url === 'string' && url.includes('/ui-surfaces')) {
        return json({
          surfaces: [
            {
              id: 'messages',
              label: 'Messages screen',
              route: '/messages/:conversationId',
              kind: 'next-route',
              confidence: 'high',
              framework: 'Next.js',
              entryFile: 'app/messages/[conversationId]/page.tsx',
              previewFile: null,
              previewRuntimeRoot: '',
              previewPath: '/messages/preview',
              previewStatus: 'source-mapped',
              sourceFiles: ['app/messages/[conversationId]/page.tsx'],
              styleFiles: ['app/globals.css'],
              scriptFiles: [],
              assetFiles: [],
              fontFiles: [],
              externalDependencies: [
                { packageName: 'next', importPath: 'next', kind: 'runtime' },
              ],
              reasons: ['Next.js route file detected'],
              mtime: 20,
            },
          ],
          generatedAt: '2026-06-02T00:00:00.000Z',
        });
      }
      if (typeof url === 'string' && url.includes('/ui-preview')) {
        expect(init).toEqual(expect.objectContaining({ method: 'POST' }));
        return json({
          status: 'ready',
          runtimeRoot: '',
          baseUrl: '/api/projects/project-1/ui-preview/proxy/proxy-token',
          url: '/api/projects/project-1/ui-preview/proxy/proxy-token/messages/preview',
          upstreamBaseUrl: 'http://127.0.0.1:43210',
          route: '/messages/preview',
        });
      }
      if (typeof url === 'string' && url.includes('/raw/design-snapshots/messages.html')) {
        return html(`<!doctype html>
          <html data-od-editable-snapshot="true" style="display: block;">
            <body style="margin: 0; background: rgb(20, 10, 8);">
              <header>
                <a href="/">FH</a>
                <a href="/messages">Messages</a>
                <button style="background: rgb(96, 96, 96);">Menu</button>
              </header>
              <main><h1>Raw stale snapshot</h1></main>
            </body>
          </html>
        `);
      }
      throw new Error(`unexpected fetch ${url}`);
    }));

    renderPane({
      projectMetadata: metadata,
      projectFiles: [
        file('app/messages/[conversationId]/page.tsx', 'code', 20),
        file('app/globals.css', 'code', 18),
        file('design-snapshots/messages.html', 'html', 30),
      ],
      onRequestOpenFile: vi.fn(),
      onOpenEditableSurface,
    });

    const surface = await screen.findByTestId('chat-ui-surface-0');
    const iframe = await waitFor(() => {
      const node = surface.querySelector('iframe');
      expect(node?.getAttribute('src')).toBe(
        '/api/projects/project-1/ui-preview/proxy/proxy-token/messages/preview',
      );
      return node!;
    });
    iframe.contentDocument!.open();
    iframe.contentDocument!.write(`<!doctype html>
      <html>
      <head><title>Runtime app</title></head>
      <body><main><h1 style="color: rgb(210, 75, 42);">Styled runtime headline</h1></main></body>
      </html>
    `);
    iframe.contentDocument!.close();

    fireEvent.click(within(surface).getByRole('button', { name: 'Edit design' }));

    await waitFor(() => {
      expect(onOpenEditableSurface).toHaveBeenCalledWith({
        fileName: 'design-snapshots/messages-2.html',
        html: expect.stringContaining('Styled runtime headline'),
      });
    });
    expect(onOpenEditableSurface.mock.calls[0]?.[0]?.html ?? '').not.toContain('Raw stale snapshot');
  });

  it('captures a first editable snapshot from an isolated runtime preview bridge', async () => {
    const metadata: ProjectMetadata = {
      kind: 'prototype',
      importedFrom: 'folder',
      entryFile: 'app/page.tsx',
    };
    const onOpenEditableSurface = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (typeof url === 'string' && url.includes('/ui-surfaces')) {
        return json({
          surfaces: [
            {
              id: 'messages',
              label: 'Messages screen',
              route: '/messages/:conversationId',
              kind: 'next-route',
              confidence: 'high',
              framework: 'Next.js',
              entryFile: 'app/messages/[conversationId]/page.tsx',
              previewFile: null,
              previewRuntimeRoot: '',
              previewPath: '/messages/preview',
              previewStatus: 'source-mapped',
              sourceFiles: ['app/messages/[conversationId]/page.tsx'],
              styleFiles: ['app/globals.css'],
              scriptFiles: [],
              assetFiles: [],
              fontFiles: [],
              externalDependencies: [
                { packageName: 'next', importPath: 'next', kind: 'runtime' },
              ],
              reasons: ['Next.js route file detected'],
              mtime: 20,
            },
          ],
          generatedAt: '2026-06-02T00:00:00.000Z',
        });
      }
      if (typeof url === 'string' && url.includes('/ui-preview')) {
        expect(init).toEqual(expect.objectContaining({ method: 'POST' }));
        return json({
          status: 'ready',
          runtimeRoot: '',
          baseUrl: '/api/projects/project-1/ui-preview/proxy/proxy-token',
          url: '/api/projects/project-1/ui-preview/proxy/proxy-token/messages/preview',
          upstreamBaseUrl: 'http://127.0.0.1:43210',
          route: '/messages/preview',
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }));

    renderPane({
      projectMetadata: metadata,
      projectFiles: [
        file('app/messages/[conversationId]/page.tsx', 'code', 20),
        file('app/globals.css', 'code', 18),
      ],
      onRequestOpenFile: vi.fn(),
      onOpenEditableSurface,
    });

    const surface = await screen.findByTestId('chat-ui-surface-0');
    const iframe = await waitFor(() => {
      const node = surface.querySelector('iframe');
      expect(node?.getAttribute('src')).toBe(
        '/api/projects/project-1/ui-preview/proxy/proxy-token/messages/preview',
      );
      return node!;
    });
    const frameWindow = iframe.contentWindow!;
    const postMessage = vi.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined);
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      get() {
        throw new DOMException('Blocked by sandbox', 'SecurityError');
      },
    });

    fireEvent.click(within(surface).getByRole('button', { name: 'Edit design' }));

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'od:editable-snapshot' }),
        '*',
      );
    });
    const request = postMessage.mock.calls
      .map(([message]) => message)
      .find((message): message is { type: 'od:editable-snapshot'; id: string } =>
        typeof message === 'object' &&
        message !== null &&
        (message as { type?: unknown }).type === 'od:editable-snapshot' &&
        typeof (message as { id?: unknown }).id === 'string',
      );
    expect(request).toBeTruthy();

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: frameWindow,
        data: {
          type: 'od:editable-snapshot:result',
          id: request!.id,
          html: `<!doctype html>
            <html style="display: block; width: 1280px;">
              <head><title>Runtime app</title><script>window.__runtime = true;</script></head>
              <body style="margin: 0; background: rgb(10, 20, 30);">
                <main style="display: grid; color: rgb(210, 75, 42);">
                  <h1 style="font-size: 48px;">Bridge runtime headline</h1>
                </main>
              </body>
            </html>
          `,
        },
      }));
    });

    await waitFor(() => {
      expect(onOpenEditableSurface).toHaveBeenCalledWith({
        fileName: 'design-snapshots/messages.html',
        html: expect.stringContaining('Bridge runtime headline'),
      });
    });
    const snapshotHtml = onOpenEditableSurface.mock.calls[0]?.[0]?.html ?? '';
    expect(snapshotHtml).toContain('data-od-editable-snapshot="true"');
    expect(snapshotHtml).toContain('color: rgb(210, 75, 42)');
    expect(snapshotHtml).not.toContain('<script');
    expect(within(surface).queryByRole('button', { name: 'Preview not ready' })).toBeNull();
  });

  it('captures a loaded runtime preview into an editable design snapshot', async () => {
    const metadata: ProjectMetadata = {
      kind: 'prototype',
      importedFrom: 'folder',
      entryFile: 'app/page.tsx',
    };
    const onOpenEditableSurface = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (typeof url === 'string' && url.includes('/ui-surfaces')) {
        return json({
          surfaces: [
            {
              id: 'messages',
              label: 'Messages screen',
              route: '/messages/:conversationId',
              kind: 'next-route',
              confidence: 'high',
              framework: 'Next.js',
              entryFile: 'app/messages/[conversationId]/page.tsx',
              previewFile: null,
              previewRuntimeRoot: '',
              previewPath: '/messages/preview',
              previewStatus: 'source-mapped',
              sourceFiles: ['app/messages/[conversationId]/page.tsx'],
              styleFiles: ['app/globals.css'],
              scriptFiles: [],
              assetFiles: [],
              fontFiles: [],
              externalDependencies: [
                { packageName: 'next', importPath: 'next', kind: 'runtime' },
              ],
              reasons: ['Next.js route file detected'],
              mtime: 20,
            },
          ],
          generatedAt: '2026-06-02T00:00:00.000Z',
        });
      }
      if (typeof url === 'string' && url.includes('/ui-preview')) {
        expect(init).toEqual(expect.objectContaining({ method: 'POST' }));
        return json({
          status: 'ready',
          runtimeRoot: '',
          baseUrl: '/api/projects/project-1/ui-preview/proxy/proxy-token',
          url: '/api/projects/project-1/ui-preview/proxy/proxy-token/messages/preview',
          upstreamBaseUrl: 'http://127.0.0.1:43210',
          route: '/messages/preview',
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }));

    renderPane({
      projectMetadata: metadata,
      projectFiles: [
        file('app/messages/[conversationId]/page.tsx', 'code', 20),
        file('app/globals.css', 'code', 18),
      ],
      onRequestOpenFile: vi.fn(),
      onOpenEditableSurface,
    });

    const surface = await screen.findByTestId('chat-ui-surface-0');
    const iframe = await waitFor(() => {
      const node = surface.querySelector('iframe');
      expect(node?.getAttribute('src')).toBe(
        '/api/projects/project-1/ui-preview/proxy/proxy-token/messages/preview',
      );
      return node!;
    });
    iframe.contentDocument!.open();
    iframe.contentDocument!.write(`<!doctype html>
      <html>
      <head><title>Runtime app</title><script>window.__runtime = true;</script></head>
      <body><main><h1 style="color: rgb(210, 75, 42);">Runtime headline</h1></main></body>
      </html>
    `);
    iframe.contentDocument!.close();
    fireEvent.load(iframe);

    fireEvent.click(within(surface).getByRole('button', { name: 'Edit design' }));

    await waitFor(() => {
      expect(onOpenEditableSurface).toHaveBeenCalledTimes(1);
    });
    expect(onOpenEditableSurface).toHaveBeenCalledWith({
      fileName: 'design-snapshots/messages.html',
      html: expect.stringContaining('Runtime headline'),
    });
    const snapshotRequest = onOpenEditableSurface.mock.calls[0]?.[0];
    expect(snapshotRequest?.html ?? '').not.toContain('<script');
  });

  it('does not leave a runtime preview stuck when project files refresh mid-start', async () => {
    const metadata: ProjectMetadata = {
      kind: 'prototype',
      importedFrom: 'folder',
      entryFile: 'app/page.tsx',
    };
    let resolvePreview!: (response: Response) => void;
    const previewPromise = new Promise<Response>((resolve) => {
      resolvePreview = resolve;
    });
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (typeof url === 'string' && url.includes('/ui-surfaces')) {
        return json({
          surfaces: [
            {
              id: 'home',
              label: 'Home screen',
              route: '/',
              kind: 'next-route',
              confidence: 'high',
              framework: 'Next.js',
              entryFile: 'app/page.tsx',
              previewFile: null,
              previewRuntimeRoot: '',
              previewPath: '/',
              previewStatus: 'source-mapped',
              sourceFiles: ['app/page.tsx'],
              styleFiles: ['app/globals.css'],
              scriptFiles: [],
              assetFiles: [],
              fontFiles: [],
              externalDependencies: [
                { packageName: 'next', importPath: 'next', kind: 'runtime' },
              ],
              reasons: ['Next.js route file detected'],
              mtime: 20,
            },
          ],
          generatedAt: '2026-06-02T00:00:00.000Z',
        });
      }
      if (typeof url === 'string' && url.includes('/ui-preview')) {
        return await previewPromise;
      }
      throw new Error(`unexpected fetch ${url}`);
    }));

    function Harness() {
      const [files, setFiles] = useState([
        file('app/page.tsx', 'code', 20),
        file('app/globals.css', 'code', 18),
      ]);
      return (
        <>
          <button
            type="button"
            data-testid="refresh-files"
            onClick={() => setFiles((current) => [...current, file('README.md', 'text', 21)])}
          >
            refresh
          </button>
          <ChatPane
            projectKindForTracking="prototype"
            messages={[]}
            streaming={false}
            error={null}
            projectId="project-1"
            projectFiles={files}
            onEnsureProject={async () => 'project-1'}
            onSend={vi.fn()}
            onStop={vi.fn()}
            conversations={conversations}
            activeConversationId="conv-1"
            onSelectConversation={vi.fn()}
            onDeleteConversation={vi.fn()}
            projectMetadata={metadata}
          />
        </>
      );
    }

    render(<Harness />);
    const surface = await screen.findByTestId('chat-ui-surface-0');
    expect(surface.getAttribute('data-preview-status')).toBe('starting');

    fireEvent.click(screen.getByTestId('refresh-files'));
    resolvePreview(json({
      status: 'ready',
      runtimeRoot: '',
      baseUrl: '/api/projects/project-1/ui-preview/proxy/proxy-token',
      url: '/api/projects/project-1/ui-preview/proxy/proxy-token/',
      upstreamBaseUrl: 'http://127.0.0.1:43210',
      route: '/',
    }));

    await waitFor(() => {
      expect(surface.querySelector('iframe')?.getAttribute('src')).toBe('/api/projects/project-1/ui-preview/proxy/proxy-token/');
    });
    expect(within(surface).getByText('Live preview')).toBeTruthy();
  });

  it('keeps the first screen discovery request alive when project files refresh during loading', async () => {
    const metadata: ProjectMetadata = {
      kind: 'prototype',
      importedFrom: 'folder',
      entryFile: 'app/page.tsx',
    };
    let resolveSurfaces!: (response: Response) => void;
    const surfacesPromise = new Promise<Response>((resolve) => {
      resolveSurfaces = resolve;
    });
    const fetchMock = vi.fn(async (url) => {
      if (typeof url === 'string' && url.includes('/ui-surfaces')) {
        return await surfacesPromise;
      }
      if (typeof url === 'string' && url.includes('/ui-preview')) {
        return json({
          status: 'ready',
          runtimeRoot: '',
          baseUrl: '/api/projects/project-1/ui-preview/proxy/proxy-token',
          url: '/api/projects/project-1/ui-preview/proxy/proxy-token/',
          upstreamBaseUrl: 'http://127.0.0.1:43210',
          route: '/',
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    function Harness() {
      const [files, setFiles] = useState([
        file('app/page.tsx', 'code', 20),
        file('app/globals.css', 'code', 18),
      ]);
      return (
        <>
          <button
            type="button"
            data-testid="refresh-files"
            onClick={() => setFiles((current) => [...current, file('README.md', 'text', 21)])}
          >
            refresh
          </button>
          <ChatPane
            projectKindForTracking="prototype"
            messages={[]}
            streaming={false}
            error={null}
            projectId="project-1"
            projectFiles={files}
            onEnsureProject={async () => 'project-1'}
            onSend={vi.fn()}
            onStop={vi.fn()}
            conversations={conversations}
            activeConversationId="conv-1"
            onSelectConversation={vi.fn()}
            onDeleteConversation={vi.fn()}
            projectMetadata={metadata}
          />
        </>
      );
    }

    render(<Harness />);
    expect(await screen.findByTestId('chat-ui-surfaces-loading')).toBeTruthy();
    fireEvent.click(screen.getByTestId('refresh-files'));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveSurfaces(json({
      surfaces: [
        {
          id: 'home',
          label: 'Home screen',
          route: '/',
          kind: 'next-route',
          confidence: 'high',
          framework: 'Next.js',
          entryFile: 'app/page.tsx',
          previewFile: null,
          previewRuntimeRoot: '',
          previewPath: '/',
          previewStatus: 'source-mapped',
          sourceFiles: ['app/page.tsx'],
          styleFiles: ['app/globals.css'],
          scriptFiles: [],
          assetFiles: [],
          fontFiles: [],
          externalDependencies: [
            { packageName: 'next', importPath: 'next', kind: 'runtime' },
          ],
          reasons: ['Next.js route file detected'],
          mtime: 20,
        },
      ],
      generatedAt: '2026-06-02T00:00:00.000Z',
    }));

    const surface = await screen.findByTestId('chat-ui-surface-0');
    expect(within(surface).getByText('Home screen')).toBeTruthy();
  });

  it('clears stale imported surfaces and preview URLs when switching imported folder projects', async () => {
    const metadata: ProjectMetadata = {
      kind: 'prototype',
      importedFrom: 'folder',
      entryFile: 'app/page.tsx',
    };
    let resolveSecondSurfaces!: (response: Response) => void;
    const secondSurfacesPromise = new Promise<Response>((resolve) => {
      resolveSecondSurfaces = resolve;
    });
    const fetchMock = vi.fn(async (url) => {
      if (typeof url !== 'string') throw new Error(`unexpected fetch ${url}`);
      if (url.includes('/api/projects/project-1/ui-surfaces')) {
        return json({
          surfaces: [
            {
              id: 'home',
              label: 'First project home',
              route: '/',
              kind: 'next-route',
              confidence: 'high',
              framework: 'Next.js',
              entryFile: 'app/page.tsx',
              previewFile: null,
              previewRuntimeRoot: '',
              previewPath: '/',
              previewStatus: 'source-mapped',
              sourceFiles: ['app/page.tsx'],
              styleFiles: ['app/globals.css'],
              scriptFiles: [],
              assetFiles: [],
              fontFiles: [],
              externalDependencies: [
                { packageName: 'next', importPath: 'next', kind: 'runtime' },
              ],
              reasons: ['Next.js route file detected'],
              mtime: 20,
            },
          ],
          generatedAt: '2026-06-02T00:00:00.000Z',
        });
      }
      if (url.includes('/api/projects/project-2/ui-surfaces')) {
        return await secondSurfacesPromise;
      }
      if (url.includes('/api/projects/project-1/ui-preview')) {
        return json({
          status: 'ready',
          runtimeRoot: '',
          baseUrl: '/api/projects/project-1/ui-preview/proxy/project-1-token',
          url: '/api/projects/project-1/ui-preview/proxy/project-1-token/',
          upstreamBaseUrl: 'http://127.0.0.1:43210',
          route: '/',
        });
      }
      if (url.includes('/api/projects/project-2/ui-preview')) {
        return json({
          status: 'ready',
          runtimeRoot: '',
          baseUrl: '/api/projects/project-2/ui-preview/proxy/project-2-token',
          url: '/api/projects/project-2/ui-preview/proxy/project-2-token/',
          upstreamBaseUrl: 'http://127.0.0.1:43211',
          route: '/',
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    function Harness() {
      const [projectId, setProjectId] = useState('project-1');
      return (
        <>
          <button
            type="button"
            data-testid="switch-project"
            onClick={() => setProjectId('project-2')}
          >
            switch
          </button>
          <ChatPane
            projectKindForTracking="prototype"
            messages={[]}
            streaming={false}
            error={null}
            projectId={projectId}
            projectFiles={[
              file('app/page.tsx', 'code', 20),
              file('app/globals.css', 'code', 18),
            ]}
            onEnsureProject={async () => projectId}
            onSend={vi.fn()}
            onStop={vi.fn()}
            conversations={[
              { id: 'conv-1', projectId: 'project-1', title: 'Project 1', createdAt: 1, updatedAt: 1 },
              { id: 'conv-2', projectId: 'project-2', title: 'Project 2', createdAt: 1, updatedAt: 1 },
            ]}
            activeConversationId={projectId === 'project-1' ? 'conv-1' : 'conv-2'}
            onSelectConversation={vi.fn()}
            onDeleteConversation={vi.fn()}
            projectMetadata={metadata}
          />
        </>
      );
    }

    render(<Harness />);

    const firstSurface = await screen.findByTestId('chat-ui-surface-0');
    expect(within(firstSurface).getByText('First project home')).toBeTruthy();
    await waitFor(() => {
      expect(document.querySelector('iframe[src*="project-1-token"]')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('switch-project'));

    expect(await screen.findByTestId('chat-ui-surfaces-loading')).toBeTruthy();
    expect(screen.queryByText('First project home')).toBeNull();
    expect(document.querySelector('iframe[src*="project-1-token"]')).toBeNull();

    resolveSecondSurfaces(json({
      surfaces: [
        {
          id: 'home',
          label: 'Second project home',
          route: '/',
          kind: 'next-route',
          confidence: 'high',
          framework: 'Next.js',
          entryFile: 'app/page.tsx',
          previewFile: null,
          previewRuntimeRoot: '',
          previewPath: '/',
          previewStatus: 'source-mapped',
          sourceFiles: ['app/page.tsx'],
          styleFiles: ['app/globals.css'],
          scriptFiles: [],
          assetFiles: [],
          fontFiles: [],
          externalDependencies: [
            { packageName: 'next', importPath: 'next', kind: 'runtime' },
          ],
          reasons: ['Next.js route file detected'],
          mtime: 30,
        },
      ],
      generatedAt: '2026-06-02T00:00:00.000Z',
    }));

    const secondSurface = await screen.findByTestId('chat-ui-surface-0');
    expect(within(secondSurface).getByText('Second project home')).toBeTruthy();
    await waitFor(() => {
      expect(document.querySelector('iframe[src*="project-2-token"]')).toBeTruthy();
    });
  });

  it('shows a retryable error when imported folder surface discovery fails', async () => {
    const metadata: ProjectMetadata = {
      kind: 'prototype',
      importedFrom: 'folder',
      entryFile: 'app/page.tsx',
    };
    const fetchMock = vi.fn(async (url) => {
      if (typeof url !== 'string') throw new Error(`unexpected fetch ${url}`);
      if (!url.includes('/ui-surfaces')) throw new Error(`unexpected fetch ${url}`);
      if (fetchMock.mock.calls.length === 1) {
        return json({ error: { message: 'Surface detector crashed' } }, 500);
      }
      return json({
        surfaces: [
          {
            id: 'home',
            label: 'Recovered home screen',
            route: '/',
            kind: 'static-html',
            confidence: 'high',
            framework: null,
            entryFile: 'site/index.html',
            previewFile: 'site/index.html',
            previewRuntimeRoot: null,
            previewPath: '/',
            previewStatus: 'live-preview',
            sourceFiles: ['site/index.html'],
            styleFiles: [],
            scriptFiles: [],
            assetFiles: [],
            fontFiles: [],
            externalDependencies: [],
            reasons: ['HTML screen file detected'],
            mtime: 20,
          },
        ],
        generatedAt: '2026-06-02T00:00:00.000Z',
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPane({
      projectMetadata: metadata,
      projectFiles: [
        file('site/index.html', 'html', 20),
        file('app/page.tsx', 'code', 18),
      ],
    });

    const error = await screen.findByTestId('chat-ui-surfaces-error');
    expect(within(error).getByText('Could not scan previewable screens')).toBeTruthy();
    expect(within(error).getByText('Surface detector crashed')).toBeTruthy();
    expect(screen.queryByTestId('chat-ui-surfaces-empty')).toBeNull();

    fireEvent.click(within(error).getByRole('button', { name: /Retry/i }));

    expect(await screen.findByTestId('chat-ui-surfaces-loading')).toBeTruthy();
    const surface = await screen.findByTestId('chat-ui-surface-0');
    expect(within(surface).getByText('Recovered home screen')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('marks a runtime preview failed when the preview start request times out', async () => {
    vi.useFakeTimers();
    const metadata: ProjectMetadata = {
      kind: 'prototype',
      importedFrom: 'folder',
      entryFile: 'app/page.tsx',
    };
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (typeof url === 'string' && url.includes('/ui-surfaces')) {
        return json({
          surfaces: [
            {
              id: 'home',
              label: 'Home screen',
              route: '/',
              kind: 'next-route',
              confidence: 'high',
              framework: 'Next.js',
              entryFile: 'app/page.tsx',
              previewFile: null,
              previewRuntimeRoot: '',
              previewPath: '/',
              previewStatus: 'source-mapped',
              sourceFiles: ['app/page.tsx'],
              styleFiles: ['app/globals.css'],
              scriptFiles: [],
              assetFiles: [],
              fontFiles: [],
              externalDependencies: [
                { packageName: 'next', importPath: 'next', kind: 'runtime' },
              ],
              reasons: ['Next.js route file detected'],
              mtime: 20,
            },
          ],
          generatedAt: '2026-06-02T00:00:00.000Z',
        });
      }
      if (typeof url === 'string' && url.includes('/ui-preview')) {
        return await new Promise<Response>((_resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal;
          if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }));

    renderPane({
      projectMetadata: metadata,
      projectFiles: [
        file('app/page.tsx', 'code', 20),
        file('app/globals.css', 'code', 18),
      ],
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const surface = screen.getByTestId('chat-ui-surface-0');
    expect(surface.getAttribute('data-preview-status')).toBe('starting');
    expect(surface.querySelector('.chat-ui-surface-preview-fallback')?.textContent).toContain('Starting preview');
    expect(within(surface).queryByText('Preparing the screen')).toBeNull();
    expect(surface.querySelector('.chat-ui-surface-scan-icon')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });

    expect(surface.getAttribute('data-preview-status')).toBe('failed');
    expect(within(surface).getAllByText('Preview failed').length).toBeGreaterThan(0);
  });

  it('does not fall back to scattered asset cards when no UI surfaces are found', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (typeof url === 'string' && url.includes('/ui-surfaces')) {
        return json({ surfaces: [], generatedAt: '2026-06-02T00:00:00.000Z' });
      }
      throw new Error(`unexpected fetch ${url}`);
    }));
    const metadata: ProjectMetadata = {
      kind: 'prototype',
      importedFrom: 'folder',
      entryFile: 'site/index.html',
    };

    renderPane({
      projectMetadata: metadata,
      projectFiles: [
        file('site/index.html', 'html', 10),
        file('site/about.html', 'html', 80),
        file('assets/latest-screenshot.jpg', 'image', 70),
        file('site/styleguide.html', 'html', 60),
        file('assets/hero-mockup.jpg', 'image', 50),
        file('docs/pitch.pdf', 'pdf', 40),
        file('docs/report.docx', 'document', 30),
        file('README.md', 'text', 90),
        file('bundle.js.map', 'code', 100),
      ],
      onRequestOpenFile: vi.fn(),
    });

    const empty = await screen.findByTestId('chat-ui-surfaces-empty');
    expect(within(empty).getByText('No editable web preview found')).toBeTruthy();
    expect(within(empty).getByText(/no web screen was found to preview/u)).toBeTruthy();
    expect(screen.queryByTestId('chat-design-artifacts')).toBeNull();
    expect(screen.queryByText('assets/latest-screenshot.jpg')).toBeNull();
  });

  it('explains native mobile imports when no browser-renderable surfaces are found', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (typeof url === 'string' && url.includes('/ui-surfaces')) {
        return json({ surfaces: [], generatedAt: '2026-06-02T00:00:00.000Z' });
      }
      throw new Error(`unexpected fetch ${url}`);
    }));
    const metadata: ProjectMetadata = {
      kind: 'prototype',
      importedFrom: 'folder',
    };

    renderPane({
      projectMetadata: metadata,
      projectFiles: [
        file('android/app/build.gradle', 'code', 40),
        file('ios/Podfile', 'text', 30),
        file('ios/Pods/GoogleSignIn/Resources/google.png', 'image', 20),
        file('src/App.tsx', 'code', 10),
      ],
      onRequestOpenFile: vi.fn(),
    });

    const empty = await screen.findByTestId('chat-ui-surfaces-empty');
    expect(within(empty).getByText('No editable web preview found')).toBeTruthy();
    expect(within(empty).getByText(/native\/mobile project/u)).toBeTruthy();
    expect(within(empty).getByText(/full project tree/u)).toBeTruthy();
  });
});

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function html(value: string, status = 200): Response {
  return new Response(value, {
    status,
    headers: { 'content-type': 'text/html' },
  });
}

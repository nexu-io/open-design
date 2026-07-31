// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileViewer } from '../../src/components/FileViewer';
import type { ProjectFile } from '../../src/types';

const { highlightCodeTokensMock } = vi.hoisted(() => ({
  highlightCodeTokensMock: vi.fn(),
}));

vi.mock('../../src/runtime/shiki', () => ({
  highlightCode: vi.fn(async () => ''),
  highlightCodeTokens: highlightCodeTokensMock,
}));

function sourceFile(overrides: Partial<ProjectFile>): ProjectFile {
  return {
    name: 'index.html',
    path: 'index.html',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'html',
    mime: 'text/html',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  highlightCodeTokensMock.mockReset();
  document.documentElement.removeAttribute('data-theme');
});

describe('FileViewer source syntax highlighting', () => {
  it('highlights HTML source and refreshes its colors when the app theme changes', async () => {
    const source = [
      '<!doctype html>',
      '<style>body { color: tomato; }</style>',
      '<script>document.body.dataset.ready = "true";</script>',
    ].join('\n');
    highlightCodeTokensMock.mockImplementation(async (code: string) => [
      [{ content: code, color: '#ff7b72' }],
    ]);

    const { container } = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={sourceFile({
          artifactManifest: {
            version: 1,
            kind: 'html',
            title: 'Page',
            entry: 'index.html',
            renderer: 'html',
            exports: ['html'],
          },
        })}
        liveHtml={source}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^code$/i }));

    await waitFor(() => {
      expect(highlightCodeTokensMock).toHaveBeenCalledWith(source, 'html');
    });
    const sourceView = container.querySelector('.viewer-source');
    expect(sourceView?.textContent).toBe(source);
    expect(sourceView?.querySelector('span[style*="color"]')).not.toBeNull();

    document.documentElement.setAttribute('data-theme', 'dark');
    await waitFor(() => {
      expect(highlightCodeTokensMock).toHaveBeenCalledTimes(2);
    });
  });

  it.each([
    ['styles.css', 'text/css', 'body { color: tomato; }', 'css'],
    ['app.js', 'text/javascript', 'const ready = true;', 'javascript'],
  ])('highlights %s while preserving its text and line gutter', async (name, mime, source, language) => {
    highlightCodeTokensMock.mockImplementation(async (code: string) => [
      [{ content: code, color: '#79c0ff' }],
    ]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(source, { status: 200 })));

    const { container } = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={sourceFile({ name, path: name, mime, kind: 'code' })}
      />,
    );

    await waitFor(() => {
      expect(highlightCodeTokensMock).toHaveBeenCalledWith(source, language);
    });
    expect(container.querySelector('.code-viewer .lines')?.textContent).toBe(source);
    expect(container.querySelector('.code-viewer .gutter')?.textContent).toBe('1');
    expect(container.querySelector('.code-viewer .lines span[style*="color"]')).not.toBeNull();
  });

  it('preserves CRLF line endings while highlighting', async () => {
    const source = 'const first = true;\r\nconst second = true;';
    highlightCodeTokensMock.mockResolvedValue([
      [{ content: 'const first = true;', color: '#79c0ff' }],
      [{ content: 'const second = true;', color: '#79c0ff' }],
    ]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(source, { status: 200 })));

    const { container } = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={sourceFile({
          name: 'windows.js',
          path: 'windows.js',
          mime: 'text/javascript',
          kind: 'code',
        })}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.code-viewer .lines span[style*="color"]')).not.toBeNull();
    });
    expect(container.querySelector('.code-viewer .lines')?.textContent).toBe(source);
    expect(container.querySelector('.code-viewer .gutter')?.textContent).toBe('1\n2');
  });

  it('leaves large source files as plain text', async () => {
    const source = `<main>${'x'.repeat(100_000)}</main>`;
    const { container } = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={sourceFile({
          size: source.length,
          artifactManifest: {
            version: 1,
            kind: 'html',
            title: 'Large page',
            entry: 'index.html',
            renderer: 'html',
            exports: ['html'],
          },
        })}
        liveHtml={source}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^code$/i }));

    await waitFor(() => {
      expect(container.querySelector('.viewer-source')?.textContent).toBe(source);
    });
    expect(highlightCodeTokensMock).not.toHaveBeenCalled();
    expect(container.querySelector('.viewer-source span')).toBeNull();
  });
});

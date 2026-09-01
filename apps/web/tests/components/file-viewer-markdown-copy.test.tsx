// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FileViewer,
  fileViewerSourceAuthorizationScopeKey,
  markdownImageSourceUrl,
} from '../../src/components/FileViewer';
import type { ProjectFile } from '../../src/types';
import { fetchProjectFileText, writeProjectTextFile } from '../../src/providers/registry';
import {
  CollabProvider,
  type CollabContextValue,
} from '../../src/collab/collab-context';
import type { WorkspaceCollabContext } from '@open-design/contracts';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchProjectFileText: vi.fn(),
    writeProjectTextFile: vi.fn(),
  };
});

const mockedFetchProjectFileText = vi.mocked(fetchProjectFileText);
const mockedWriteProjectTextFile = vi.mocked(writeProjectTextFile);
let writeTextMock: ReturnType<typeof vi.fn>;
let originalClipboard: PropertyDescriptor | undefined;
let originalExecCommand: PropertyDescriptor | undefined;

function baseFile(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    name: 'notes.md',
    path: 'notes.md',
    type: 'file',
    size: 256,
    mtime: 1710000000,
    kind: 'text',
    mime: 'text/markdown',
    artifactManifest: {
      version: 1,
      kind: 'markdown-document',
      title: 'Notes',
      entry: 'notes.md',
      renderer: 'markdown',
      exports: ['md'],
    },
    ...overrides,
  };
}

function teamWorkspaceContext(
  overrides: Partial<WorkspaceCollabContext> = {},
): WorkspaceCollabContext {
  return {
    workspaceId: 'workspace-team',
    workspaceType: 'team',
    workspaceMemberId: 'member-1',
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    permissions: {
      canShareProjects: false,
      canWriteSyncedFiles: false,
    },
    ...overrides,
  } as WorkspaceCollabContext;
}

function renderWithWorkspace(ui: React.ReactElement, workspaceContext: WorkspaceCollabContext) {
  const collab: CollabContextValue = {
    workspaceContext,
    workspaceContextLoading: false,
    enabled: true,
    member: null,
    present: [],
    publishedVersion: null,
    syncState: 'synced',
    viewerOnly: false,
    writerAuthority: 'allowed',
    isOwner: true,
    isEffectiveOwner: true,
    isSharedNonOwner: false,
    ownerDisplayName: null,
    ownerRole: 'owner',
    downloadPending: false,
    reportChange: () => {},
    requestPublish: () => {},
    refreshPresence: () => {},
    checkStatusNow: () => {},
  };
  return render(<CollabProvider value={collab}>{ui}</CollabProvider>);
}

describe('FileViewer markdown code block copy', () => {
  beforeEach(() => {
    originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');
    mockedFetchProjectFileText.mockResolvedValue('```ts\nconsole.log("copied")\n```');
    mockedWriteProjectTextFile.mockResolvedValue(baseFile({ size: 12 }));
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: writeTextMock,
      },
    });
  });

  afterEach(() => {
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      delete (navigator as { clipboard?: Clipboard }).clipboard;
    }
    if (originalExecCommand) {
      Object.defineProperty(document, 'execCommand', originalExecCommand);
    } else {
      delete (document as { execCommand?: typeof document.execCommand }).execCommand;
    }
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('copies fenced code blocks from the markdown preview', async () => {
    const { container } = render(<FileViewer projectId="project-1" projectKind="prototype" file={baseFile()} />);

    await waitFor(() => {
      expect(container.querySelector('.markdown-code-copy')).toBeTruthy();
    });
    const copyButton = container.querySelector('.markdown-code-copy') as HTMLButtonElement;
    expect(copyButton.tagName).toBe('BUTTON');

    copyButton.focus();
    expect(copyButton).toBe(document.activeElement);
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('console.log("copied")');
    });
    expect(copyButton).toBe(document.activeElement);
    await waitFor(() => {
      expect(copyButton.getAttribute('aria-label')).toBe('Copied!');
    });
    expect(screen.getByRole('status').textContent).toBe('Copied!');
  });

  it('copies empty fenced code blocks instead of treating the button as broken', async () => {
    mockedFetchProjectFileText.mockResolvedValue('```ts\n```');
    const { container } = render(<FileViewer projectId="project-1" projectKind="prototype" file={baseFile()} />);

    await waitFor(() => {
      expect(container.querySelector('.markdown-code-copy')).toBeTruthy();
    });
    const copyButton = container.querySelector('.markdown-code-copy') as HTMLButtonElement;
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('');
    });
  });

  it('preserves already-absolute markdown image sources and resolves project-relative assets', () => {
    const sources = [
      markdownImageSourceUrl('project-1', 'docs/readme.md', '//cdn.example.com/image.png'),
      markdownImageSourceUrl('project-1', 'docs/readme.md', 'data:image/png;base64,abcd'),
      markdownImageSourceUrl('project-1', 'docs/readme.md', '/project/path.png'),
      markdownImageSourceUrl('project-1', 'docs/readme.md', './relative.png'),
    ];

    expect(sources).toEqual([
      '//cdn.example.com/image.png',
      'data:image/png;base64,abcd',
      '/api/projects/project-1/raw/project/path.png',
      '/api/projects/project-1/raw/docs/relative.png',
    ]);
  });

  it('renders relative markdown images with server-derived project authority', async () => {
    mockedFetchProjectFileText.mockResolvedValue('![Team image](./relative.png)');
    const context = teamWorkspaceContext();

    const { container } = renderWithWorkspace(
      <FileViewer projectId="project-1" projectKind="prototype" file={baseFile()} />,
      context,
    );

    await waitFor(() => {
      expect(container.querySelector('img[alt="Team image"]')?.getAttribute('src')).toBe(
        '/api/projects/project-1/raw/relative.png',
      );
    });
  });

  it('partitions source snapshots by every Workspace authority field', () => {
    const initial = fileViewerSourceAuthorizationScopeKey(false, teamWorkspaceContext());

    expect(fileViewerSourceAuthorizationScopeKey(false, teamWorkspaceContext({
      role: 'admin',
    }))).not.toBe(initial);
    expect(fileViewerSourceAuthorizationScopeKey(false, teamWorkspaceContext({
      memberStatus: 'removed',
    }))).not.toBe(initial);
    expect(fileViewerSourceAuthorizationScopeKey(false, teamWorkspaceContext({
      permissions: {
        ...teamWorkspaceContext().permissions,
        canShareProjects: true,
        canWriteSyncedFiles: false,
      },
    }))).not.toBe(initial);
    expect(fileViewerSourceAuthorizationScopeKey(true, teamWorkspaceContext())).toBeNull();
    expect(fileViewerSourceAuthorizationScopeKey(false, null)).toBe('local');
  });

  it('restores focus when the Clipboard API fails and the execCommand fallback succeeds', async () => {
    writeTextMock.mockRejectedValueOnce(new Error('clipboard unavailable'));
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    });
    const execCommandSpy = vi.mocked(document.execCommand);
    const { container } = render(<FileViewer projectId="project-1" projectKind="prototype" file={baseFile()} />);

    await waitFor(() => {
      expect(container.querySelector('.markdown-code-copy')).toBeTruthy();
    });
    const copyButton = container.querySelector('.markdown-code-copy') as HTMLButtonElement;
    copyButton.focus();
    expect(copyButton).toBe(document.activeElement);

    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(execCommandSpy).toHaveBeenCalledWith('copy');
    });
    expect(copyButton).toBe(document.activeElement);
  });

  it('treats @ as plain markdown editor text instead of opening a file mention picker', async () => {
    mockedFetchProjectFileText.mockResolvedValue('');
    const { container } = render(<FileViewer projectId="project-1" projectKind="prototype" file={baseFile()} />);

    const editor = await screen.findByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: '@landing' } });

    expect(editor.value).toBe('@landing');
    expect(container.querySelector('[data-testid="markdown-file-mention-popover"]')).toBeNull();
    expect(container.querySelector('.mention-popover')).toBeNull();
  });

  it('flushes a pending markdown autosave when the viewer unmounts before debounce', async () => {
    mockedFetchProjectFileText.mockResolvedValue('initial');
    const { unmount } = render(<FileViewer projectId="project-1" projectKind="prototype" file={baseFile()} />);

    const editor = await screen.findByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'changed before close' } });
    unmount();

    await waitFor(() => {
      expect(mockedWriteProjectTextFile).toHaveBeenCalledWith(
        'project-1',
        'notes.md',
        'changed before close',
        undefined,
        null,
      );
    });
  });

  it('keeps dirty markdown text when a file refresh arrives before autosave', async () => {
    mockedFetchProjectFileText
      .mockResolvedValueOnce('initial')
      .mockResolvedValueOnce('stale disk text');
    const { rerender } = render(
      <FileViewer projectId="project-1" projectKind="prototype" file={baseFile({ mtime: 1 })} />,
    );

    const editor = await screen.findByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'dirty draft' } });
    rerender(
      <FileViewer projectId="project-1" projectKind="prototype" file={baseFile({ mtime: 2 })} />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedFetchProjectFileText).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('dirty draft');
  });

  it('keeps autosave quiet and does not refresh the file list while typing', async () => {
    mockedFetchProjectFileText.mockResolvedValue('initial');
    const onFileSaved = vi.fn();
    const { container } = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={baseFile()}
        onFileSaved={onFileSaved}
      />,
    );

    const editor = await screen.findByRole('textbox') as HTMLTextAreaElement;
    vi.useFakeTimers();
    fireEvent.change(editor, { target: { value: 'initial draft' } });
    editor.focus();
    editor.setSelectionRange(7, 7);

    expect(screen.queryByText('Saving...')).toBeNull();
    expect(container.querySelector('.icon-spin')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(700);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedWriteProjectTextFile).toHaveBeenCalledWith(
      'project-1',
      'notes.md',
      'initial draft',
      undefined,
      null,
    );
    expect(onFileSaved).not.toHaveBeenCalled();
    expect(screen.queryByText('Saving...')).toBeNull();
    expect(container.querySelector('.icon-spin')).toBeNull();
    // The manual Save button was replaced by a passive auto-save status; once
    // the debounced write lands it reflects the saved state instead.
    expect(container.querySelector('.markdown-autosave-saved')).toBeTruthy();
    expect(document.activeElement).toBe(editor);
    expect(editor.selectionStart).toBe(7);
    expect(editor.selectionEnd).toBe(7);
  });

  it('keeps focus and selection while autosaving a newly created document', async () => {
    mockedFetchProjectFileText.mockResolvedValue('# Document\n');
    const onFileSaved = vi.fn();
    render(
      <FileViewer
        projectId="project-1"
        projectKind="document"
        file={baseFile({
          name: 'document.md',
          path: 'document.md',
          kind: 'document',
          mime: 'text/markdown',
          artifactManifest: undefined,
        })}
        onFileSaved={onFileSaved}
      />,
    );

    const editor = await screen.findByRole('textbox') as HTMLTextAreaElement;
    vi.useFakeTimers();
    fireEvent.change(editor, { target: { value: '# Document\n\nDraft' } });
    editor.focus();
    editor.setSelectionRange(14, 14);

    await act(async () => {
      vi.advanceTimersByTime(700);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedWriteProjectTextFile).toHaveBeenCalledWith(
      'project-1',
      'document.md',
      '# Document\n\nDraft',
      undefined,
      null,
    );
    expect(onFileSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toBe(editor);
    expect(document.activeElement).toBe(editor);
    expect(editor.selectionStart).toBe(14);
    expect(editor.selectionEnd).toBe(14);
  });

  it('keeps focus and selection when a clean markdown file receives a metadata refresh', async () => {
    mockedFetchProjectFileText
      .mockResolvedValueOnce('initial')
      .mockResolvedValue('initial draft');
    const { rerender } = render(
      <FileViewer projectId="project-1" projectKind="prototype" file={baseFile({ mtime: 1 })} />,
    );

    const editor = await screen.findByRole('textbox') as HTMLTextAreaElement;
    vi.useFakeTimers();
    fireEvent.change(editor, { target: { value: 'initial draft' } });
    editor.focus();
    editor.setSelectionRange(8, 8);
    await act(async () => {
      vi.advanceTimersByTime(700);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockedWriteProjectTextFile).toHaveBeenCalledWith(
      'project-1',
      'notes.md',
      'initial draft',
      undefined,
      null,
    );

    await act(async () => {
      rerender(
        <FileViewer projectId="project-1" projectKind="prototype" file={baseFile({ mtime: 2 })} />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole('textbox')).toBe(editor);
    expect(document.activeElement).toBe(editor);
    expect(editor.value).toBe('initial draft');
    expect(editor.selectionStart).toBe(8);
    expect(editor.selectionEnd).toBe(8);
  });
});

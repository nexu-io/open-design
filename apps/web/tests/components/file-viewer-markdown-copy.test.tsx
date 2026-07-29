// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FileViewer } from '../../src/components/FileViewer';
import type { ProjectFile } from '../../src/types';
import { fetchProjectFileText } from '../../src/providers/registry';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchProjectFileText: vi.fn(),
  };
});

const mockedFetchProjectFileText = vi.mocked(fetchProjectFileText);
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

describe('FileViewer markdown code block copy', () => {
  beforeEach(() => {
    originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');
    mockedFetchProjectFileText.mockResolvedValue('```ts\nconsole.log("copied")\n```');
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
});

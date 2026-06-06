// @vitest-environment jsdom

// Coverage for folder upload (#211): the composer exposes a folder picker
// (`webkitdirectory`) alongside the file picker, and uploading before a
// conversation exists surfaces a hint instead of failing silently.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '../../src/components/ChatComposer';
import { uploadProjectFiles } from '../../src/providers/registry';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    uploadProjectFiles: vi.fn(),
  };
});

const mockedUploadProjectFiles = vi.mocked(uploadProjectFiles);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChatComposer folder upload (#211)', () => {
  it('exposes a folder picker with the webkitdirectory attribute', () => {
    render(
      <ChatComposer
        projectId="project-1"
        projectFiles={[]}
        streaming={false}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const folderInput = screen.getByTestId('chat-folder-input');
    expect(folderInput.hasAttribute('webkitdirectory')).toBe(true);
    // Distinct from the file picker, and still multi-file.
    expect(folderInput).not.toBe(screen.getByTestId('chat-file-input'));
    expect(folderInput.hasAttribute('multiple')).toBe(true);
  });

  it('uploads files selected via the folder picker', async () => {
    mockedUploadProjectFiles.mockResolvedValue({
      uploaded: [{ path: 'src/a.ts', name: 'a.ts', kind: 'file', size: 3 }],
      failed: [],
    });

    render(
      <ChatComposer
        projectId="project-1"
        projectFiles={[]}
        streaming={false}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const file = new File(['abc'], 'a.ts', { type: 'text/plain' });
    fireEvent.change(screen.getByTestId('chat-folder-input'), {
      target: { files: [file] },
    });

    await waitFor(() => expect(mockedUploadProjectFiles).toHaveBeenCalledTimes(1));
    expect(mockedUploadProjectFiles).toHaveBeenCalledWith('project-1', [file]);
  });

  it('shows a hint instead of failing silently when no conversation exists', async () => {
    render(
      <ChatComposer
        projectId={null}
        projectFiles={[]}
        streaming={false}
        onEnsureProject={async () => null}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const file = new File(['abc'], 'a.ts', { type: 'text/plain' });
    fireEvent.change(screen.getByTestId('chat-file-input'), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(screen.getByText('Start a conversation first, then attach files.')).toBeTruthy(),
    );
    expect(mockedUploadProjectFiles).not.toHaveBeenCalled();
  });
});

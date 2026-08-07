// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ServerDirectoryPicker } from '../../src/components/ServerDirectoryPicker';
import {
  createServerDirectory,
  listServerDirectory,
  listServerDirectoryRoots,
} from '../../src/providers/fs-browser';

vi.mock('../../src/providers/fs-browser', () => ({
  createServerDirectory: vi.fn(),
  listServerDirectory: vi.fn(),
  listServerDirectoryRoots: vi.fn(),
}));

const mockCreateDirectory = vi.mocked(createServerDirectory);
const mockListRoots = vi.mocked(listServerDirectoryRoots);
const mockListDirectory = vi.mocked(listServerDirectory);

const roots = {
  roots: [
    { label: 'Authorized home', path: '/home/da', kind: 'configured' as const },
    { label: 'Workspace', path: '/workspace', kind: 'configured' as const },
  ],
};

function directory(
  path: string,
  options: {
    parent?: string | null;
    entries?: Array<{
      name: string;
      path: string;
      type: 'directory';
      hidden?: boolean;
    }>;
    truncated?: boolean;
  } = {},
) {
  return {
    path,
    parent: options.parent ?? null,
    entries: (options.entries ?? []).map((entry) => ({ hidden: false, ...entry })),
    truncated: options.truncated ?? false,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('ServerDirectoryPicker', () => {
  beforeEach(() => {
    mockListRoots.mockReset();
    mockListDirectory.mockReset();
    mockCreateDirectory.mockReset();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <ServerDirectoryPicker open={false} onSelect={vi.fn()} onClose={vi.fn()} />,
    );

    expect(container.innerHTML).toBe('');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mockListRoots).not.toHaveBeenCalled();
  });

  it('loads roots and the initial directory, then selects the current path', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    mockListRoots.mockResolvedValue(roots);
    mockListDirectory.mockResolvedValue(
      directory('/workspace/project', {
        parent: '/workspace',
        entries: [{ name: 'src', path: '/workspace/project/src', type: 'directory' }],
        truncated: true,
      }),
    );

    render(
      <ServerDirectoryPicker
        open
        initialPath="/workspace/project"
        onSelect={onSelect}
        onClose={onClose}
      />,
    );

    expect(await screen.findByText('/workspace/project')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Authorized home' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Workspace' })).toBeTruthy();
    expect(screen.getByText(/first 500/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Select folder' }));

    expect(onSelect).toHaveBeenCalledWith('/workspace/project');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a loading state while the directory request is pending', async () => {
    const pendingDirectory = deferred<ReturnType<typeof directory>>();
    mockListRoots.mockResolvedValue(roots);
    mockListDirectory.mockReturnValue(pendingDirectory.promise);

    render(<ServerDirectoryPicker open onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      expect.stringContaining('Loading'),
    );

    pendingDirectory.resolve(directory('/home/da'));
    expect(await screen.findByText('/home/da')).toBeTruthy();
  });

  it('shows an empty state for a directory without entries', async () => {
    mockListRoots.mockResolvedValue(roots);
    mockListDirectory.mockResolvedValue(directory('/home/da'));

    render(<ServerDirectoryPicker open onSelect={vi.fn()} onClose={vi.fn()} />);

    expect((await screen.findByRole('status')).textContent).toContain(
      'This folder is empty.',
    );
  });

  it('creates a directory, refreshes, and opens the new directory', async () => {
    mockListRoots.mockResolvedValue(roots);
    mockListDirectory
      .mockResolvedValueOnce(directory('/workspace'))
      .mockResolvedValueOnce(directory('/workspace/new-folder'));
    mockCreateDirectory.mockResolvedValue({ path: '/workspace/new-folder' });

    render(
      <ServerDirectoryPicker open initialPath="/workspace" onSelect={vi.fn()} onClose={vi.fn()} />,
    );

    expect(await screen.findByText('/workspace')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }));
    fireEvent.change(screen.getByLabelText('Folder name'), {
      target: { value: 'new-folder' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create folder' }));

    await waitFor(() => {
      expect(mockCreateDirectory).toHaveBeenCalledWith(
        '/workspace',
        'new-folder',
        expect.any(AbortSignal),
      );
    });
    expect(await screen.findByText('/workspace/new-folder')).toBeTruthy();
    expect(mockListDirectory).toHaveBeenLastCalledWith('/workspace/new-folder');
  });

  it('shows directory creation errors without leaving the current directory', async () => {
    mockListRoots.mockResolvedValue(roots);
    mockListDirectory.mockResolvedValue(directory('/workspace'));
    mockCreateDirectory.mockRejectedValue(new Error('directory already exists'));

    render(
      <ServerDirectoryPicker open initialPath="/workspace" onSelect={vi.fn()} onClose={vi.fn()} />,
    );

    expect(await screen.findByText('/workspace')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }));
    fireEvent.change(screen.getByLabelText('Folder name'), {
      target: { value: 'existing' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create folder' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not create folder.',
    );
    expect(screen.getByText('/workspace')).toBeTruthy();
  });

  it('navigates into a child directory and back to its parent', async () => {
    mockListRoots.mockResolvedValue(roots);
    mockListDirectory
      .mockResolvedValueOnce(
        directory('/workspace', {
          parent: '/',
          entries: [{ name: 'project', path: '/workspace/project', type: 'directory' }],
        }),
      )
      .mockResolvedValueOnce(directory('/workspace/project', { parent: '/workspace' }))
      .mockResolvedValueOnce(
        directory('/workspace', {
          parent: '/',
          entries: [{ name: 'project', path: '/workspace/project', type: 'directory' }],
        }),
      );

    render(
      <ServerDirectoryPicker
        open
        initialPath="/workspace"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Open project' }));
    expect(await screen.findByText('/workspace/project')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Go to parent folder' }));
    await waitFor(() => expect(mockListDirectory).toHaveBeenLastCalledWith('/workspace'));
    expect(await screen.findByText('/workspace')).toBeTruthy();
  });

  it('shows an API error and retries the current directory', async () => {
    mockListRoots.mockResolvedValue(roots);
    mockListDirectory
      .mockRejectedValueOnce(new Error('Directory is unavailable'))
      .mockResolvedValueOnce(directory('/workspace'));

    render(
      <ServerDirectoryPicker open initialPath="/workspace" onSelect={vi.fn()} onClose={vi.fn()} />,
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not load this folder.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('/workspace')).toBeTruthy();
    expect(mockListDirectory).toHaveBeenCalledTimes(2);
  });

  it('retries loading roots when initialization fails', async () => {
    mockListRoots
      .mockRejectedValueOnce(new Error('Roots are unavailable'))
      .mockResolvedValueOnce(roots);
    mockListDirectory.mockResolvedValue(directory('/home/da'));

    render(<ServerDirectoryPicker open onSelect={vi.fn()} onClose={vi.fn()} />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not load server folders.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('/home/da')).toBeTruthy();
    expect(mockListRoots).toHaveBeenCalledTimes(2);
  });

  it('closes on Escape and overlay click but not panel click', async () => {
    const onClose = vi.fn();
    mockListRoots.mockResolvedValue(roots);
    mockListDirectory.mockResolvedValue(directory('/home/da'));

    render(<ServerDirectoryPicker open onSelect={vi.fn()} onClose={onClose} />);
    const dialog = await screen.findByRole('dialog', { name: 'Browse server folders' });

    fireEvent.click(screen.getByRole('heading', { name: 'Browse server folders' }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('contains focus within the dialog and restores previous focus when closed', async () => {
    mockListRoots.mockResolvedValue(roots);
    mockListDirectory.mockResolvedValue(directory('/home/da'));
    const trigger = document.createElement('button');
    trigger.textContent = 'Open picker';
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = render(
      <ServerDirectoryPicker open onSelect={vi.fn()} onClose={vi.fn()} />,
    );

    const closeButton = await screen.findByRole('button', { name: 'Close server folder browser' });
    await waitFor(() => expect(document.activeElement).toBe(closeButton));
    const selectButton = await screen.findByRole('button', { name: 'Select folder' });

    selectButton.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);

    closeButton.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(selectButton);

    rerender(<ServerDirectoryPicker open={false} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(document.activeElement).toBe(trigger);
  });

  it('aborts and fences a late mkdir response when the picker closes', async () => {
    const pendingCreate = deferred<{ path: string }>();
    mockListRoots.mockResolvedValue(roots);
    mockListDirectory.mockResolvedValue(directory('/workspace'));
    mockCreateDirectory.mockReturnValue(pendingCreate.promise);

    const props = { initialPath: '/workspace', onSelect: vi.fn(), onClose: vi.fn() };
    const { rerender } = render(<ServerDirectoryPicker open {...props} />);

    expect(await screen.findByText('/workspace')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }));
    fireEvent.change(screen.getByLabelText('Folder name'), {
      target: { value: 'late-folder' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create folder' }));

    await waitFor(() => expect(mockCreateDirectory).toHaveBeenCalledTimes(1));
    const signal = mockCreateDirectory.mock.calls[0]?.[2];
    expect(signal).toBeInstanceOf(AbortSignal);

    rerender(<ServerDirectoryPicker open={false} {...props} />);
    expect(signal?.aborted).toBe(true);
    rerender(<ServerDirectoryPicker open {...props} />);
    pendingCreate.resolve({ path: '/workspace/late-folder' });

    await waitFor(() => {
      expect(mockListDirectory.mock.calls.map(([path]) => path)).not.toContain(
        '/workspace/late-folder',
      );
    });
  });

  it('does not let a stale directory response overwrite newer navigation', async () => {
    const slowHome = deferred<ReturnType<typeof directory>>();
    mockListRoots.mockResolvedValue(roots);
    mockListDirectory.mockImplementation((path) => {
      if (path === '/home/da') return slowHome.promise;
      return Promise.resolve(directory('/workspace'));
    });

    render(<ServerDirectoryPicker open onSelect={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Workspace' }));
    expect(await screen.findByText('/workspace')).toBeTruthy();

    slowHome.resolve(directory('/home/da'));

    await waitFor(() => {
      expect(screen.getByText('/workspace')).toBeTruthy();
      expect(screen.queryByText('/home/da')).toBeNull();
    });
  });
});

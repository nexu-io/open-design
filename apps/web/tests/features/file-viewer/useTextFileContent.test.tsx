// @vitest-environment jsdom
//
// Unit tests for the plain-text viewer hook: the fetch-on-mount lifecycle,
// the disk-reload bump, the JSON pretty-print derivation, and the
// copy-to-clipboard confirmation pill, pinned through fake ports.
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useTextFileContent } from '../../../src/features/file-viewer/hooks/useTextFileContent.hooks';
import type { ClipboardPort, FileTextPort } from '../../../src/features/file-viewer/ports';
import type { ProjectFile } from '../../../src/types';

function file(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    name: 'data.json',
    path: 'data.json',
    type: 'file',
    size: 10,
    mtime: 1710000000,
    kind: 'text',
    mime: 'application/json',
    ...overrides,
  };
}

function makeTextPort(over: Partial<FileTextPort> = {}): FileTextPort {
  return {
    fetchProjectFileText: vi.fn(async () => null as string | null),
    ...over,
  };
}

function makeClipboardPort(over: Partial<ClipboardPort> = {}): ClipboardPort {
  return {
    copyTextToClipboard: vi.fn(async () => {}),
    ...over,
  };
}

describe('useTextFileContent', () => {
  it('starts with text=null and resolves the fetched text', async () => {
    const textPort = makeTextPort({ fetchProjectFileText: vi.fn(async () => 'hello world') });
    const { result } = renderHook(() =>
      useTextFileContent(textPort, makeClipboardPort(), 'proj-1', file({ mime: 'text/plain', name: 'notes.txt' })),
    );

    expect(result.current.text).toBeNull();
    await waitFor(() => expect(result.current.text).toBe('hello world'));
    expect(result.current.displayText).toBe('hello world');
    expect(result.current.lineCount).toBe(1);
  });

  it('falls back to an empty string when the fetch resolves null', async () => {
    const textPort = makeTextPort({ fetchProjectFileText: vi.fn(async () => null) });
    const { result } = renderHook(() =>
      useTextFileContent(textPort, makeClipboardPort(), 'proj-1', file()),
    );

    await waitFor(() => expect(result.current.text).toBe(''));
  });

  it('pretty-prints a losslessly round-trippable JSON file', async () => {
    const textPort = makeTextPort({ fetchProjectFileText: vi.fn(async () => '{"a":1}') });
    const { result } = renderHook(() =>
      useTextFileContent(textPort, makeClipboardPort(), 'proj-1', file()),
    );

    await waitFor(() => expect(result.current.displayText).toBe('{\n  "a": 1\n}'));
  });

  it('reload bumps the key and re-fetches', async () => {
    const fetchProjectFileText = vi.fn(async () => 'v1');
    const textPort = makeTextPort({ fetchProjectFileText });
    const { result } = renderHook(() =>
      useTextFileContent(textPort, makeClipboardPort(), 'proj-1', file({ mime: 'text/plain' })),
    );
    await waitFor(() => expect(result.current.text).toBe('v1'));

    fetchProjectFileText.mockResolvedValueOnce('v2');
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.text).toBe('v2'));
    expect(fetchProjectFileText).toHaveBeenCalledTimes(2);
  });

  it('copy() calls the clipboard port and flips the confirmation pill on/off', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const textPort = makeTextPort({ fetchProjectFileText: vi.fn(async () => 'copy me') });
      const copyTextToClipboard = vi.fn(async () => {});
      const clipboard = makeClipboardPort({ copyTextToClipboard });
      const { result } = renderHook(() =>
        useTextFileContent(textPort, clipboard, 'proj-1', file({ mime: 'text/plain' })),
      );
      await waitFor(() => expect(result.current.text).toBe('copy me'));

      await act(async () => {
        await result.current.copy();
      });
      expect(copyTextToClipboard).toHaveBeenCalledWith('copy me');
      expect(result.current.copied).toBe(true);

      act(() => vi.advanceTimersByTime(1500));
      expect(result.current.copied).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('copy() is a no-op while text has not loaded yet', async () => {
    const textPort = makeTextPort({ fetchProjectFileText: vi.fn(async () => null) });
    const copyTextToClipboard = vi.fn(async () => {});
    const clipboard = makeClipboardPort({ copyTextToClipboard });
    const { result } = renderHook(() =>
      useTextFileContent(textPort, clipboard, 'proj-1', file()),
    );

    await act(async () => {
      await result.current.copy();
    });
    expect(copyTextToClipboard).not.toHaveBeenCalled();
  });
});

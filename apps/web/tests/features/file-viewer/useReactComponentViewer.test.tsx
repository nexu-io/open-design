// @vitest-environment jsdom
//
// Unit tests for the React component viewer hook: the source fetch, the
// sibling-HTML-entry module detection (issue #2744), the srcDoc build, the
// reload bump, and the share-menu outside-dismiss wiring, pinned through
// fake ports.
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useReactComponentViewer } from '../../../src/features/file-viewer/hooks/useReactComponentViewer.hooks';
import type { DismissPort, FileTextPort, ProjectFilesPort } from '../../../src/features/file-viewer/ports';
import type { ProjectFile } from '../../../src/types';

function file(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    name: 'App.tsx',
    path: 'App.tsx',
    type: 'file',
    size: 10,
    mtime: 1710000000,
    kind: 'text',
    mime: 'text/plain',
    ...overrides,
  };
}

function makeFileTextPort(over: Partial<FileTextPort> = {}): FileTextPort {
  return {
    fetchProjectFileText: vi.fn(async () => null as string | null),
    ...over,
  };
}

function makeProjectFilesPort(over: Partial<ProjectFilesPort> = {}): ProjectFilesPort {
  return {
    fetchProjectFiles: vi.fn(async () => []),
    ...over,
  };
}

function makeDismissPort(over: Partial<DismissPort> = {}): DismissPort {
  return {
    subscribeOutsideDismiss: vi.fn(() => () => {}),
    ...over,
  };
}

describe('useReactComponentViewer', () => {
  it('loads the source and builds a srcDoc when it is a standalone artifact', async () => {
    const fetchProjectFileText = vi.fn(async () => 'export default function App() { return null; }');
    const textPort = makeFileTextPort({ fetchProjectFileText });
    const projectFilesPort = makeProjectFilesPort();
    const dismissPort = makeDismissPort();
    const { result } = renderHook(() =>
      useReactComponentViewer(textPort, projectFilesPort, dismissPort, 'proj-1', file()),
    );

    await waitFor(() => expect(result.current.source).not.toBeNull());
    await waitFor(() => expect(result.current.isModule).toBe(false));
    await waitFor(() => expect(result.current.srcDoc).not.toBe(''));
  });

  it('detects a module referenced by a sibling HTML entry and skips the srcDoc build', async () => {
    const fetchProjectFileText = vi.fn(async (_projectId: string, name: string) => {
      if (name === 'App.tsx') return 'export default function App() { return null; }';
      if (name === 'index.html') return '<script type="text/babel" src="./App.tsx"></script>';
      return null;
    });
    const textPort = makeFileTextPort({ fetchProjectFileText });
    const projectFilesPort = makeProjectFilesPort({
      fetchProjectFiles: vi.fn(async () => [{ name: 'index.html' }, { name: 'App.tsx' }]),
    });
    const { result } = renderHook(() =>
      useReactComponentViewer(textPort, projectFilesPort, makeDismissPort(), 'proj-1', file()),
    );

    await waitFor(() => expect(result.current.isModule).toBe(true));
    expect(result.current.moduleEntries).toEqual(['index.html']);
    expect(result.current.srcDoc).toBe('');
  });

  it('reload bumps the fetch count for both source and module-entry scans', async () => {
    const fetchProjectFileText = vi.fn(async () => 'source');
    const textPort = makeFileTextPort({ fetchProjectFileText });
    const projectFilesPort = makeProjectFilesPort();
    const dismissPort = makeDismissPort();
    const { result } = renderHook(() =>
      useReactComponentViewer(textPort, projectFilesPort, dismissPort, 'proj-1', file()),
    );
    await waitFor(() => expect(result.current.source).toBe('source'));
    const callsBeforeReload = fetchProjectFileText.mock.calls.length;

    act(() => result.current.reload());
    await waitFor(() => expect(fetchProjectFileText.mock.calls.length).toBeGreaterThan(callsBeforeReload));
  });

  it('subscribes to outside-dismiss only while the share menu is open', () => {
    const unsubscribe = vi.fn();
    const subscribeOutsideDismiss = vi.fn(() => unsubscribe);
    const dismissPort = makeDismissPort({ subscribeOutsideDismiss });
    const textPort = makeFileTextPort();
    const projectFilesPort = makeProjectFilesPort();
    const { result, rerender } = renderHook(
      () => useReactComponentViewer(textPort, projectFilesPort, dismissPort, 'proj-1', file()),
    );
    expect(subscribeOutsideDismiss).not.toHaveBeenCalled();

    act(() => result.current.setShareMenuOpen(true));
    rerender();
    expect(subscribeOutsideDismiss).toHaveBeenCalledTimes(1);

    act(() => result.current.setShareMenuOpen(false));
    rerender();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

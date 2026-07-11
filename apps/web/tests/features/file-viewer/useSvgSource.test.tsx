// @vitest-environment jsdom
//
// Unit tests for the SVG viewer's preview/source-toggle hook: the lazy
// source fetch (only entering "source" mode triggers it), the disk-reload
// bump, and the initial-source fast path, pinned through a fake port.
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSvgSource } from '../../../src/features/file-viewer/hooks/useSvgSource.hooks';
import type { FileTextPort } from '../../../src/features/file-viewer/ports';

function makePort(over: Partial<FileTextPort> = {}): FileTextPort {
  return {
    fetchProjectFileText: vi.fn(async () => null as string | null),
    ...over,
  };
}

describe('useSvgSource', () => {
  it('does not fetch while in preview mode', () => {
    const fetchProjectFileText = vi.fn(async () => '<svg/>');
    const port = makePort({ fetchProjectFileText });
    renderHook(() => useSvgSource(port, 'proj-1', 'icon.svg', 1000, 'preview', undefined));
    expect(fetchProjectFileText).not.toHaveBeenCalled();
  });

  it('fetches the source lazily once switched to source mode', async () => {
    const fetchProjectFileText = vi.fn(async () => '<svg>hi</svg>');
    const port = makePort({ fetchProjectFileText });
    const { result } = renderHook(() =>
      useSvgSource(port, 'proj-1', 'icon.svg', 1000, 'preview', undefined),
    );

    act(() => result.current.setMode('source'));
    expect(result.current.loadingSource).toBe(true);

    await waitFor(() => expect(result.current.loadingSource).toBe(false));
    expect(result.current.source).toBe('<svg>hi</svg>');
    expect(result.current.sourceError).toBe(false);
    expect(fetchProjectFileText).toHaveBeenCalledWith('proj-1', 'icon.svg', {
      cache: 'no-store',
      cacheBustKey: '1000-0',
    });
  });

  it('surfaces a source error when the fetch resolves null', async () => {
    const port = makePort({ fetchProjectFileText: vi.fn(async () => null) });
    const { result } = renderHook(() =>
      useSvgSource(port, 'proj-1', 'icon.svg', 1000, 'source', undefined),
    );

    await waitFor(() => expect(result.current.loadingSource).toBe(false));
    expect(result.current.sourceError).toBe(true);
    expect(result.current.source).toBe('');
  });

  it('skips the initial fetch when an initialSource is already supplied', () => {
    const fetchProjectFileText = vi.fn(async () => '<svg/>');
    const port = makePort({ fetchProjectFileText });
    const { result } = renderHook(() =>
      useSvgSource(port, 'proj-1', 'icon.svg', 1000, 'source', '<svg>seed</svg>'),
    );

    expect(fetchProjectFileText).not.toHaveBeenCalled();
    expect(result.current.source).toBe('<svg>seed</svg>');
  });

  it('reload bumps the key and re-fetches even with an initialSource seed', async () => {
    const fetchProjectFileText = vi.fn(async () => '<svg>reloaded</svg>');
    const port = makePort({ fetchProjectFileText });
    const { result } = renderHook(() =>
      useSvgSource(port, 'proj-1', 'icon.svg', 1000, 'source', '<svg>seed</svg>'),
    );

    act(() => result.current.reload());
    await waitFor(() => expect(fetchProjectFileText).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.source).toBe('<svg>reloaded</svg>'));
  });
});

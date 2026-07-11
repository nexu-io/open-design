// @vitest-environment jsdom
//
// Unit tests for the copy-share-link feedback hook: the copied/failed pill
// state, its auto-clear timeout, and the empty-url short-circuit.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useShareLinkCopy } from '../../../src/features/file-viewer/hooks/useShareLinkCopy.hooks';
import type { ShareLinkCopyDeps } from '../../../src/features/file-viewer/hooks/useShareLinkCopy.hooks';
import type { ShareLinkClipboardPort } from '../../../src/features/file-viewer/ports';

function makePort(over: Partial<ShareLinkClipboardPort> = {}): ShareLinkClipboardPort {
  return {
    copyToClipboard: vi.fn(async () => true),
    ...over,
  };
}

function makeDeps(over: Partial<ShareLinkCopyDeps> = {}): ShareLinkCopyDeps {
  return {
    t: ((key: string) => key) as ShareLinkCopyDeps['t'],
    onCopyFailed: vi.fn(),
    ...over,
  };
}

describe('useShareLinkCopy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with no feedback and the static copy label', () => {
    const { result } = renderHook(() => useShareLinkCopy(makePort(), makeDeps()));

    expect(result.current.shareLinkFeedback).toBeNull();
    expect(result.current.copyShareLinkLabel).toBe('fileViewer.copyShareLink');
  });

  it('copies successfully, shows the copied label, and clears it after the timeout', async () => {
    const copyToClipboard = vi.fn(async () => true);
    const deps = makeDeps();
    const { result } = renderHook(() => useShareLinkCopy(makePort({ copyToClipboard }), deps));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.copyShareLink('https://example.com/share');
    });

    expect(ok).toBe(true);
    expect(copyToClipboard).toHaveBeenCalledWith('https://example.com/share');
    expect(result.current.shareLinkFeedback).toBe('copied');
    expect(result.current.copyShareLinkLabel).toBe('fileViewer.copied');
    expect(deps.onCopyFailed).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1800);
    });
    expect(result.current.shareLinkFeedback).toBeNull();
  });

  it('reports failure and calls onCopyFailed when the clipboard write fails', async () => {
    const deps = makeDeps();
    const { result } = renderHook(() =>
      useShareLinkCopy(makePort({ copyToClipboard: vi.fn(async () => false) }), deps),
    );

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.copyShareLink('https://example.com/share');
    });

    expect(ok).toBe(false);
    expect(result.current.shareLinkFeedback).toBe('failed');
    expect(result.current.copyShareLinkLabel).toBe('useEverywhere.copyFailed');
    expect(deps.onCopyFailed).toHaveBeenCalledTimes(1);
  });

  it('short-circuits on a blank url without calling the port', async () => {
    const copyToClipboard = vi.fn(async () => true);
    const deps = makeDeps();
    const { result } = renderHook(() => useShareLinkCopy(makePort({ copyToClipboard }), deps));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.copyShareLink('   ');
    });

    expect(ok).toBe(false);
    expect(copyToClipboard).not.toHaveBeenCalled();
    expect(result.current.shareLinkFeedback).toBe('failed');
    expect(deps.onCopyFailed).toHaveBeenCalledTimes(1);
  });

  it('a stale timeout does not clear a newer feedback value', async () => {
    const deps = makeDeps();
    const { result } = renderHook(() =>
      useShareLinkCopy(makePort({ copyToClipboard: vi.fn(async () => true) }), deps),
    );

    await act(async () => {
      await result.current.copyShareLink('https://example.com/a');
    });
    expect(result.current.shareLinkFeedback).toBe('copied');

    // A second, failed copy starts before the first's timeout fires.
    act(() => {
      vi.advanceTimersByTime(900);
    });
    await act(async () => {
      await result.current.copyShareLink('');
    });
    expect(result.current.shareLinkFeedback).toBe('failed');

    // The first copy's timeout fires now; it must not clobber the second's feedback.
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(result.current.shareLinkFeedback).toBe('failed');
  });
});

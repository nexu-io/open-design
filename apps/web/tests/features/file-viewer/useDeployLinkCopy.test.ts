// @vitest-environment jsdom
//
// Unit tests for the deploy modal's per-link copy hook: the copied-link pill
// keyed by url (a modal can show several deploy links at once), its
// auto-clear timeout, and the blank-url no-op.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDeployLinkCopy } from '../../../src/features/file-viewer/hooks/useDeployLinkCopy.hooks';
import type { ClipboardPort } from '../../../src/features/file-viewer/ports';
import type { TranslateFn } from '../../../src/features/file-viewer/types';

const t: TranslateFn = ((key: string) => key) as TranslateFn;

function makePort(over: Partial<ClipboardPort> = {}): ClipboardPort {
  return {
    copyTextToClipboard: vi.fn(async () => undefined),
    ...over,
  };
}

describe('useDeployLinkCopy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with no copied link and the static label for any url', () => {
    const { result } = renderHook(() => useDeployLinkCopy(makePort(), t));

    expect(result.current.copiedDeployLink).toBeNull();
    expect(result.current.copyDeployLabel('https://a.example/deploy')).toBe('fileViewer.copyDeployLink');
  });

  it('copies the link, flips that url\'s label to copied, and clears after the timeout', async () => {
    const copyTextToClipboard = vi.fn(async () => undefined);
    const { result } = renderHook(() => useDeployLinkCopy(makePort({ copyTextToClipboard }), t));

    await act(async () => {
      await result.current.copyDeployLink('https://a.example/deploy');
    });

    expect(copyTextToClipboard).toHaveBeenCalledWith('https://a.example/deploy');
    expect(result.current.copiedDeployLink).toBe('https://a.example/deploy');
    expect(result.current.copyDeployLabel('https://a.example/deploy')).toBe('fileViewer.copied');
    // A different link's button must not read as copied.
    expect(result.current.copyDeployLabel('https://b.example/deploy')).toBe('fileViewer.copyDeployLink');

    act(() => {
      vi.advanceTimersByTime(1800);
    });
    expect(result.current.copiedDeployLink).toBeNull();
  });

  it('does not call the port or set state for a blank url', async () => {
    const copyTextToClipboard = vi.fn(async () => undefined);
    const { result } = renderHook(() => useDeployLinkCopy(makePort({ copyTextToClipboard }), t));

    await act(async () => {
      await result.current.copyDeployLink('   ');
    });

    expect(copyTextToClipboard).not.toHaveBeenCalled();
    expect(result.current.copiedDeployLink).toBeNull();
  });

  it('a stale timeout does not clear a newer copied link', async () => {
    const { result } = renderHook(() => useDeployLinkCopy(makePort(), t));

    await act(async () => {
      await result.current.copyDeployLink('https://a.example/deploy');
    });

    act(() => {
      vi.advanceTimersByTime(900);
    });
    await act(async () => {
      await result.current.copyDeployLink('https://b.example/deploy');
    });
    expect(result.current.copiedDeployLink).toBe('https://b.example/deploy');

    act(() => {
      vi.advanceTimersByTime(900);
    });
    // The first link's timeout fires here; it must not clobber the second's link.
    expect(result.current.copiedDeployLink).toBe('https://b.example/deploy');
  });

  it('resetCopiedDeployLink clears the pill immediately', async () => {
    const { result } = renderHook(() => useDeployLinkCopy(makePort(), t));

    await act(async () => {
      await result.current.copyDeployLink('https://a.example/deploy');
    });
    expect(result.current.copiedDeployLink).toBe('https://a.example/deploy');

    act(() => {
      result.current.resetCopiedDeployLink();
    });

    expect(result.current.copiedDeployLink).toBeNull();
  });
});

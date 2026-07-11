// @vitest-environment jsdom
//
// "Share to Open Design" — kicks off the bundled `od-share-to-community`
// scenario by sending its trigger prompt through the standard chat-send
// path. No transport port of its own — sending defers to a caller-supplied
// `handleSend`.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useShareToOpenDesign } from '../../../src/features/project-view/hooks/useShareToOpenDesign.hooks';
import { SHARE_TO_COMMUNITY_PROMPT } from '../../../src/components/share-to-community/shareToCommunityPrompt';

describe('useShareToOpenDesign', () => {
  it('is a no-op when the current conversation action is disabled', () => {
    const handleSend = vi.fn(async () => true);
    const { result } = renderHook(() => useShareToOpenDesign(true, false, handleSend));
    act(() => result.current.handleShareToOpenDesign('m1'));
    expect(handleSend).not.toHaveBeenCalled();
    expect(result.current.shareToOpenDesignBusyMessageId).toBeNull();
  });

  it('marks the message busy and sends the share prompt', async () => {
    const handleSend = vi.fn(async () => true);
    const { result } = renderHook(() => useShareToOpenDesign(false, false, handleSend));
    act(() => result.current.handleShareToOpenDesign('m1'));
    expect(result.current.shareToOpenDesignBusyMessageId).toBe('m1');
    expect(handleSend).toHaveBeenCalledWith(SHARE_TO_COMMUNITY_PROMPT, [], []);
    await act(async () => {
      await Promise.resolve();
    });
  });

  it('is a no-op re-entry while a share is already busy', () => {
    const handleSend = vi.fn(async () => true);
    const { result } = renderHook(() => useShareToOpenDesign(false, false, handleSend));
    act(() => result.current.handleShareToOpenDesign('m1'));
    act(() => result.current.handleShareToOpenDesign('m2'));
    expect(handleSend).toHaveBeenCalledOnce();
    expect(result.current.shareToOpenDesignBusyMessageId).toBe('m1');
  });

  it('clears busy when the send does not start (handleSend resolves false)', async () => {
    const handleSend = vi.fn(async () => false);
    const { result } = renderHook(() => useShareToOpenDesign(false, false, handleSend));
    await act(async () => {
      result.current.handleShareToOpenDesign('m1');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.shareToOpenDesignBusyMessageId).toBeNull();
  });

  it('clears busy when the send rejects', async () => {
    const handleSend = vi.fn(async () => {
      throw new Error('boom');
    });
    const { result } = renderHook(() => useShareToOpenDesign(false, false, handleSend));
    await act(async () => {
      result.current.handleShareToOpenDesign('m1');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.shareToOpenDesignBusyMessageId).toBeNull();
  });

  it('clears busy once the conversation stops being busy', () => {
    const handleSend = vi.fn(async () => true);
    const { result, rerender } = renderHook(
      ({ busy }) => useShareToOpenDesign(false, busy, handleSend),
      { initialProps: { busy: false } },
    );
    act(() => result.current.handleShareToOpenDesign('m1'));
    expect(result.current.shareToOpenDesignBusyMessageId).toBe('m1');
    rerender({ busy: true });
    expect(result.current.shareToOpenDesignBusyMessageId).toBe('m1');
    rerender({ busy: false });
    expect(result.current.shareToOpenDesignBusyMessageId).toBeNull();
  });
});

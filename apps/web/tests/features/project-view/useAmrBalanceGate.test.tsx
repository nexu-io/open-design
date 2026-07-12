// @vitest-environment jsdom
//
// AMR pre-run balance gate: the two dialog states, the in-flight/paused-queue
// conversation tracking refs, and the "Switch to AMR & retry" flow (mode/agent
// switch + arm a poll-driven auto-retry once AMR is selected AND signed in).
// The gate CHECK itself stays inline in the not-yet-extracted chat-send
// pipeline — this hook only owns the state it reads/writes.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../../src/types';

import { useAmrBalanceGate } from '../../../src/features/project-view/hooks/useAmrBalanceGate.hooks';
import type { ProjectViewTransportPort } from '../../../src/features/project-view/ports';

function makePort(overrides: Partial<ProjectViewTransportPort> = {}): ProjectViewTransportPort {
  return {
    fetchAmrLoginStatus: vi.fn(async () => ({ loggedIn: false })),
    ...overrides,
  } as ProjectViewTransportPort;
}

function makeAssistantMessage(id = 'a1'): ChatMessage {
  return { id, role: 'assistant', content: '' } as unknown as ChatMessage;
}

function renderAmrBalanceGate(
  overrides: {
    port?: ProjectViewTransportPort;
    currentConversationActionDisabled?: boolean;
    onModeChange?: (mode: 'daemon' | 'byok') => void;
    onAgentChange?: (id: string) => void;
    onOpenAmrSettings?: () => void;
    configMode?: 'daemon' | 'byok';
    configAgentId?: string | null;
    handleRetry?: (assistantMessage: ChatMessage) => void;
  } = {},
) {
  const port = overrides.port ?? makePort();
  const onModeChange = overrides.onModeChange ?? vi.fn();
  const onAgentChange = overrides.onAgentChange ?? vi.fn();
  const onOpenAmrSettings = overrides.onOpenAmrSettings ?? vi.fn();
  const handleRetry = overrides.handleRetry ?? vi.fn();
  const rendered = renderHook(
    ({
      currentConversationActionDisabled,
      configMode,
      configAgentId,
    }: {
      currentConversationActionDisabled: boolean;
      configMode: 'daemon' | 'byok';
      configAgentId: string | null;
    }) =>
      useAmrBalanceGate(
        currentConversationActionDisabled,
        onModeChange as never,
        onAgentChange,
        onOpenAmrSettings,
        configMode as never,
        configAgentId,
        handleRetry,
        port,
      ),
    {
      initialProps: {
        currentConversationActionDisabled: overrides.currentConversationActionDisabled ?? false,
        configMode: overrides.configMode ?? 'daemon',
        configAgentId: overrides.configAgentId === undefined ? 'amr' : overrides.configAgentId,
      },
    },
  );
  return { ...rendered, port, onModeChange, onAgentChange, onOpenAmrSettings, handleRetry };
}

describe('useAmrBalanceGate', () => {
  it('starts with no dialog state and empty in-flight/paused tracking sets', () => {
    const { result } = renderAmrBalanceGate();
    expect(result.current.amrBalanceGateBlock).toBeNull();
    expect(result.current.amrLowBalanceWarn).toBeNull();
    expect(result.current.pendingAmrRetry).toBeNull();
    expect(result.current.amrGateInFlightConversationsRef.current.size).toBe(0);
    expect(result.current.amrGatePausedQueueConversationsRef.current.size).toBe(0);
  });

  describe('handleSwitchToAmrAndRetry', () => {
    it('is a no-op when the current conversation action is disabled', () => {
      const { result, onModeChange, onAgentChange, onOpenAmrSettings } = renderAmrBalanceGate({
        currentConversationActionDisabled: true,
      });
      act(() => result.current.handleSwitchToAmrAndRetry(makeAssistantMessage()));
      expect(onModeChange).not.toHaveBeenCalled();
      expect(onAgentChange).not.toHaveBeenCalled();
      expect(onOpenAmrSettings).not.toHaveBeenCalled();
      expect(result.current.pendingAmrRetry).toBeNull();
    });

    it('switches to the daemon AMR agent, opens Settings, and arms a pending retry', () => {
      const { result, onModeChange, onAgentChange, onOpenAmrSettings } = renderAmrBalanceGate();
      const failedAssistant = makeAssistantMessage('a2');
      act(() => result.current.handleSwitchToAmrAndRetry(failedAssistant));
      expect(onModeChange).toHaveBeenCalledWith('daemon');
      expect(onAgentChange).toHaveBeenCalledWith('amr');
      expect(onOpenAmrSettings).toHaveBeenCalledTimes(1);
      expect(result.current.pendingAmrRetry).toEqual(failedAssistant);
    });
  });

  describe('pending-retry login poll', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('does nothing while no retry is armed', async () => {
      const port = makePort();
      renderAmrBalanceGate({ port });
      await act(async () => vi.advanceTimersByTimeAsync(5_000));
      expect(port.fetchAmrLoginStatus).not.toHaveBeenCalled();
    });

    it('polls every 2s while armed and skips retry until AMR is selected and signed in', async () => {
      const port = makePort({ fetchAmrLoginStatus: vi.fn(async () => ({ loggedIn: false })) });
      const handleRetry = vi.fn();
      const { result, rerender } = renderAmrBalanceGate({ port, handleRetry, configAgentId: 'claude' });
      act(() => result.current.handleSwitchToAmrAndRetry(makeAssistantMessage()));

      // Not yet the AMR agent: the tick returns early before ever touching the port.
      await act(async () => vi.advanceTimersByTimeAsync(2_000));
      expect(port.fetchAmrLoginStatus).not.toHaveBeenCalled();

      // Switch the config to daemon/amr (mirrors handleSwitchToAmrAndRetry's own
      // onModeChange/onAgentChange calls landing in the real app's config state).
      rerender({ currentConversationActionDisabled: false, configMode: 'daemon', configAgentId: 'amr' });
      await act(async () => vi.advanceTimersByTimeAsync(2_000));
      expect(port.fetchAmrLoginStatus).toHaveBeenCalled();
      expect(handleRetry).not.toHaveBeenCalled();
      expect(result.current.pendingAmrRetry).not.toBeNull();
    });

    it('fires the retry and clears pendingAmrRetry once AMR reports signed in', async () => {
      const port = makePort({ fetchAmrLoginStatus: vi.fn(async () => ({ loggedIn: true })) });
      const handleRetry = vi.fn();
      const failedAssistant = makeAssistantMessage('a3');
      const { result } = renderAmrBalanceGate({ port, handleRetry, configAgentId: 'amr' });
      act(() => result.current.handleSwitchToAmrAndRetry(failedAssistant));

      // The effect fires an immediate check on arming, before the first interval tick.
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(handleRetry).toHaveBeenCalledWith(failedAssistant);
      expect(result.current.pendingAmrRetry).toBeNull();
    });

    it('gives up and clears pendingAmrRetry after the 5-minute timeout', async () => {
      const port = makePort({ fetchAmrLoginStatus: vi.fn(async () => ({ loggedIn: false })) });
      const { result } = renderAmrBalanceGate({ port, configAgentId: 'amr' });
      act(() => result.current.handleSwitchToAmrAndRetry(makeAssistantMessage()));
      expect(result.current.pendingAmrRetry).not.toBeNull();

      await act(async () => vi.advanceTimersByTimeAsync(5 * 60 * 1000));
      expect(result.current.pendingAmrRetry).toBeNull();
    });

    it('tears down the interval and timeout when the retry is cleared externally', async () => {
      const port = makePort({ fetchAmrLoginStatus: vi.fn(async () => ({ loggedIn: false })) });
      const { result } = renderAmrBalanceGate({ port, configAgentId: 'amr' });
      act(() => result.current.handleSwitchToAmrAndRetry(makeAssistantMessage()));
      const callsAfterArm = () => (port.fetchAmrLoginStatus as ReturnType<typeof vi.fn>).mock.calls.length;
      await act(async () => vi.advanceTimersByTimeAsync(2_000));
      const ticked = callsAfterArm();
      expect(ticked).toBeGreaterThan(0);

      act(() => result.current.setPendingAmrRetry(null));
      await act(async () => vi.advanceTimersByTimeAsync(10_000));
      expect(callsAfterArm()).toBe(ticked);
    });
  });

  describe('dialog state setters and tracking refs', () => {
    it('setAmrBalanceGateBlock / setAmrLowBalanceWarn update the returned state', () => {
      const { result } = renderAmrBalanceGate();
      act(() =>
        result.current.setAmrBalanceGateBlock({
          reason: 'insufficient',
          snapshot: { balanceUsd: '0.00', profile: 'default' } as never,
          conversationId: 'c1',
        }),
      );
      expect(result.current.amrBalanceGateBlock?.conversationId).toBe('c1');

      const resolve = vi.fn();
      act(() =>
        result.current.setAmrLowBalanceWarn({
          snapshot: { balanceUsd: '1.00', profile: 'default' } as never,
          resolve,
        }),
      );
      expect(result.current.amrLowBalanceWarn?.resolve).toBe(resolve);
    });

    it('exposes stable in-flight/paused-queue ref identities across renders', () => {
      const { result, rerender } = renderAmrBalanceGate();
      const inFlightRef = result.current.amrGateInFlightConversationsRef;
      const pausedRef = result.current.amrGatePausedQueueConversationsRef;
      inFlightRef.current.add('c1');
      pausedRef.current.add('c2');
      rerender({ currentConversationActionDisabled: false, configMode: 'daemon', configAgentId: 'amr' });
      expect(result.current.amrGateInFlightConversationsRef).toBe(inFlightRef);
      expect(result.current.amrGatePausedQueueConversationsRef).toBe(pausedRef);
      expect(result.current.amrGateInFlightConversationsRef.current.has('c1')).toBe(true);
      expect(result.current.amrGatePausedQueueConversationsRef.current.has('c2')).toBe(true);
    });
  });
});

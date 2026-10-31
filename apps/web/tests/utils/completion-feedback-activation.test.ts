// @vitest-environment jsdom

import { fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  armCompletionFeedbackOnFirstGesture,
  notifyCompletionFeedbackGesture,
  type CompletionFeedbackActivationResult,
} from '../../src/utils/notifications';

const BASE_CONFIG = {
  soundEnabled: true,
  successSoundId: 'ding',
  failureSoundId: 'buzz',
  desktopEnabled: true,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('armCompletionFeedbackOnFirstGesture', () => {
  it('waits for the first task submission, then primes audio and requests permission once', async () => {
    const resume = vi.fn().mockResolvedValue(undefined);
    class MockAudioContext {
      state: AudioContextState = 'suspended';
      resume = () => {
        this.state = 'running';
        return resume();
      };
    }
    const requestPermission = vi.fn().mockResolvedValue('granted');
    class MockNotification {
      static permission: NotificationPermission = 'default';
      static requestPermission = requestPermission;
    }
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('Notification', MockNotification);
    const onResult = vi.fn<(result: CompletionFeedbackActivationResult) => void>();

    const dispose = armCompletionFeedbackOnFirstGesture(BASE_CONFIG, onResult);
    fireEvent.pointerDown(window);
    expect(resume).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();

    notifyCompletionFeedbackGesture();
    notifyCompletionFeedbackGesture();
    expect(resume).not.toHaveBeenCalled(); // First Send handler does not wait for audio.
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith({ desktopPermission: 'granted' }));
    await vi.waitFor(() => expect(resume).toHaveBeenCalledTimes(1));
    expect(requestPermission).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('reports a denied permission so the caller can turn the persisted switch off', async () => {
    const requestPermission = vi.fn().mockResolvedValue('denied');
    class MockNotification {
      static permission: NotificationPermission = 'default';
      static requestPermission = requestPermission;
    }
    vi.stubGlobal('Notification', MockNotification);
    const onResult = vi.fn<(result: CompletionFeedbackActivationResult) => void>();

    const dispose = armCompletionFeedbackOnFirstGesture(
      { ...BASE_CONFIG, soundEnabled: false },
      onResult,
    );
    notifyCompletionFeedbackGesture();
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith({ desktopPermission: 'denied' }));

    dispose();
  });

  it('retries suspended audio on the next real Send without requesting permission twice', async () => {
    vi.resetModules();
    const { armCompletionFeedbackOnFirstGesture: arm, notifyCompletionFeedbackGesture: sendGesture } =
      await import('../../src/utils/notifications');
    let attempts = 0;
    const construct = vi.fn();
    class MockAudioContext {
      state: AudioContextState = 'suspended';
      constructor() { construct(); }
      resume = vi.fn(async () => {
        attempts++;
        if (attempts === 1) throw new Error('background resume rejected');
        this.state = 'running';
      });
    }
    const requestPermission = vi.fn().mockResolvedValue('granted');
    class MockNotification {
      static permission: NotificationPermission = 'default';
      static requestPermission = requestPermission;
    }
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('Notification', MockNotification);
    const onResult = vi.fn<(result: CompletionFeedbackActivationResult) => void>();
    const dispose = arm(BASE_CONFIG, onResult);
    sendGesture();
    await vi.waitFor(() => expect(attempts).toBe(1));
    sendGesture();
    await vi.waitFor(() => expect(attempts).toBe(2));
    expect(construct).toHaveBeenCalledTimes(1);
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('re-arms a throttled first audio timer from a later Send without synchronous construction', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    try {
      const { armCompletionFeedbackOnFirstGesture: arm, notifyCompletionFeedbackGesture: sendGesture } =
        await import('../../src/utils/notifications');
      const construct = vi.fn();
      class MockAudioContext {
        state: AudioContextState = 'running';
        constructor() { construct(); }
      }
      vi.stubGlobal('AudioContext', MockAudioContext);
      const onResult = vi.fn();
      const dispose = arm({ ...BASE_CONFIG, desktopEnabled: false }, onResult);
      sendGesture();
      expect(construct).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(100);
      sendGesture();
      await vi.advanceTimersByTimeAsync(200);
      expect(construct).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(100);
      expect(construct).toHaveBeenCalledTimes(1);
      expect(onResult).toHaveBeenCalledTimes(1);
      dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

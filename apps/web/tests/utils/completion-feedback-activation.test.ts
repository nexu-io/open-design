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
      resume = resume;
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
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith({ desktopPermission: 'granted' }));

    expect(resume).toHaveBeenCalledTimes(1);
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
});

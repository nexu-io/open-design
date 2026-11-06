// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HOME_CHIP_INTENT_EVENT,
  consumePendingHomeChip,
  hasPendingHomeChip,
  requestHomeChip,
} from '../../src/runtime/home-intent';

afterEach(() => {
  // Drain any pending intent so tests stay independent.
  consumePendingHomeChip();
  vi.restoreAllMocks();
});

describe('home-intent latch', () => {
  it('queues a chip id and consumes it exactly once', () => {
    expect(hasPendingHomeChip()).toBe(false);
    requestHomeChip('prototype');
    expect(hasPendingHomeChip()).toBe(true);
    expect(consumePendingHomeChip()).toBe('prototype');
    // Second consume returns null — a one-shot latch, not a sticky default.
    expect(consumePendingHomeChip()).toBeNull();
    expect(hasPendingHomeChip()).toBe(false);
  });

  it('notifies mounted listeners via the intent event', () => {
    const handler = vi.fn();
    window.addEventListener(HOME_CHIP_INTENT_EVENT, handler);
    try {
      requestHomeChip('prototype');
      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0]![0] as CustomEvent;
      expect(event.detail).toMatchObject({ chipId: 'prototype' });
    } finally {
      window.removeEventListener(HOME_CHIP_INTENT_EVENT, handler);
    }
  });

  it('keeps the latest requested chip when called twice before consume', () => {
    requestHomeChip('prototype');
    requestHomeChip('deck');
    expect(consumePendingHomeChip()).toBe('deck');
  });
});

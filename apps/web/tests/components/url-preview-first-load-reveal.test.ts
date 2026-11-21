import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  URL_PREVIEW_FIRST_LOAD_GRACE_MS,
  createFirstLoadRevealScheduler,
} from '../../src/components/url-preview-first-load-reveal';

afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  vi.useFakeTimers();
  const reveal = vi.fn();
  const scheduler = createFirstLoadRevealScheduler({ reveal });
  return { reveal, scheduler };
}

describe('createFirstLoadRevealScheduler', () => {
  it('reveals one grace period after DOM ready when load never arrives', () => {
    const { reveal, scheduler } = setup();
    scheduler.arm();
    scheduler.domReady();
    vi.advanceTimersByTime(URL_PREVIEW_FIRST_LOAD_GRACE_MS - 1);
    expect(reveal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it('remembers DOM ready that arrives before the cover is armed', () => {
    const { reveal, scheduler } = setup();
    scheduler.domReady();
    vi.advanceTimersByTime(URL_PREVIEW_FIRST_LOAD_GRACE_MS * 2);
    expect(reveal).not.toHaveBeenCalled();

    scheduler.arm();
    vi.advanceTimersByTime(URL_PREVIEW_FIRST_LOAD_GRACE_MS);
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it('reveals at load inside the grace period, once', () => {
    const { reveal, scheduler } = setup();
    scheduler.arm();
    scheduler.domReady();
    vi.advanceTimersByTime(300);
    scheduler.loaded();
    expect(reveal).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(URL_PREVIEW_FIRST_LOAD_GRACE_MS);
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it('does not restart the grace period on repeated signals', () => {
    const { reveal, scheduler } = setup();
    scheduler.arm();
    scheduler.domReady();
    vi.advanceTimersByTime(800);
    scheduler.domReady();
    scheduler.arm();
    vi.advanceTimersByTime(URL_PREVIEW_FIRST_LOAD_GRACE_MS - 800);
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it('forgets the previous document on reset', () => {
    const { reveal, scheduler } = setup();
    scheduler.arm();
    scheduler.domReady();
    scheduler.reset();
    vi.advanceTimersByTime(URL_PREVIEW_FIRST_LOAD_GRACE_MS * 2);
    expect(reveal).not.toHaveBeenCalled();

    // The next document's cover waits for that document's own DOM ready.
    scheduler.arm();
    vi.advanceTimersByTime(URL_PREVIEW_FIRST_LOAD_GRACE_MS * 2);
    expect(reveal).not.toHaveBeenCalled();
    scheduler.domReady();
    vi.advanceTimersByTime(URL_PREVIEW_FIRST_LOAD_GRACE_MS);
    expect(reveal).toHaveBeenCalledTimes(1);
  });
});

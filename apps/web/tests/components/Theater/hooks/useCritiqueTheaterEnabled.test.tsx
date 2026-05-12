// @vitest-environment jsdom

/**
 * Coverage for the M1 Settings-toggle hook (Phase 15.3). The hook
 * reads from the existing `open-design:config` localStorage blob and
 * stays in sync via the platform `storage` event (cross-tab) and a
 * `open-design:critique-theater-toggle` CustomEvent (same-tab).
 */

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  setCritiqueTheaterEnabled,
  useCritiqueTheaterEnabled,
} from '../../../../src/components/Theater/hooks/useCritiqueTheaterEnabled';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

beforeEach(() => {
  window.localStorage.clear();
});

function Probe({ sink }: { sink: { enabled?: boolean } }) {
  sink.enabled = useCritiqueTheaterEnabled();
  return null;
}

describe('useCritiqueTheaterEnabled (Phase 15.3)', () => {
  it('returns false on first read with no stored config', () => {
    const sink: { enabled?: boolean } = {};
    render(<Probe sink={sink} />);
    expect(sink.enabled).toBe(false);
  });

  it('reads the toggle from the existing open-design:config blob', () => {
    window.localStorage.setItem(
      'open-design:config',
      JSON.stringify({
        critiqueTheaterEnabled: true,
        mode: 'daemon',
      }),
    );
    const sink: { enabled?: boolean } = {};
    render(<Probe sink={sink} />);
    expect(sink.enabled).toBe(true);
  });

  it('flips when the same-tab CustomEvent fires (Settings save handshake)', () => {
    const sink: { enabled?: boolean } = {};
    render(<Probe sink={sink} />);
    expect(sink.enabled).toBe(false);
    act(() => {
      setCritiqueTheaterEnabled(true);
    });
    expect(sink.enabled).toBe(true);
    act(() => {
      setCritiqueTheaterEnabled(false);
    });
    expect(sink.enabled).toBe(false);
  });

  it('preserves the rest of the stored config when writing the toggle', () => {
    window.localStorage.setItem(
      'open-design:config',
      JSON.stringify({
        mode: 'daemon',
        apiKey: 'sk-test',
        critiqueTheaterEnabled: false,
      }),
    );
    setCritiqueTheaterEnabled(true);
    const stored = JSON.parse(window.localStorage.getItem('open-design:config') ?? '{}');
    expect(stored.critiqueTheaterEnabled).toBe(true);
    // Other fields stay intact: the toggle handshake does not stomp
    // user config.
    expect(stored.mode).toBe('daemon');
    expect(stored.apiKey).toBe('sk-test');
  });

  it('tolerates corrupted JSON in the stored config (returns false, does not throw)', () => {
    window.localStorage.setItem('open-design:config', 'not json');
    const sink: { enabled?: boolean } = {};
    render(<Probe sink={sink} />);
    expect(sink.enabled).toBe(false);
  });

  it('reacts to cross-tab storage events', () => {
    const sink: { enabled?: boolean } = {};
    render(<Probe sink={sink} />);
    expect(sink.enabled).toBe(false);
    act(() => {
      window.localStorage.setItem(
        'open-design:config',
        JSON.stringify({ critiqueTheaterEnabled: true }),
      );
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'open-design:config',
          newValue: JSON.stringify({ critiqueTheaterEnabled: true }),
        }),
      );
    });
    expect(sink.enabled).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Failure-mode coverage (lefarcen P2 on PR #1320). The hook + setter both
  // intentionally swallow these errors in production so a private-mode browser
  // or a stripped CustomEvent shim does not crash the React tree. The tests
  // below pin that behavior so the swallow is not silently traded for a throw
  // in a future refactor.
  // ---------------------------------------------------------------------------

  it('returns false and does not throw when stored JSON is a non-object value (array)', () => {
    // `JSON.parse('[1,2,3]')` is a valid array, not an object. The hook must
    // not treat that as a config blob; the `critiqueTheaterEnabled` lookup
    // would fall through to `undefined` and the function should return false.
    window.localStorage.setItem('open-design:config', '[1,2,3]');
    const sink: { enabled?: boolean } = {};
    render(<Probe sink={sink} />);
    expect(sink.enabled).toBe(false);
  });

  it('returns false and does not throw when stored JSON parses to null', () => {
    // `null` is JSON-valid and `typeof null === 'object'` in JS, so the
    // guard has to check for null explicitly. If it did not, `null.critique...`
    // would throw on read.
    window.localStorage.setItem('open-design:config', 'null');
    const sink: { enabled?: boolean } = {};
    render(<Probe sink={sink} />);
    expect(sink.enabled).toBe(false);
  });

  it('returns false when localStorage.getItem throws (private mode / disabled storage)', () => {
    const original = window.localStorage.getItem;
    const restore = () => {
      Object.defineProperty(window.localStorage, 'getItem', {
        configurable: true,
        value: original,
      });
    };
    try {
      Object.defineProperty(window.localStorage, 'getItem', {
        configurable: true,
        value: () => {
          throw new DOMException(
            'storage disabled (synthetic)',
            'SecurityError',
          );
        },
      });
      const sink: { enabled?: boolean } = {};
      render(<Probe sink={sink} />);
      // Hook swallows the throw; UI sees `false` and the rest of the app
      // keeps running.
      expect(sink.enabled).toBe(false);
    } finally {
      restore();
    }
  });

  it('falls back to readToggle when the same-tab CustomEvent carries no usable detail', () => {
    // A malformed dispatcher (no detail at all, or detail.enabled not a
    // boolean) must not break the listener. The hook degrades to the
    // localStorage path so cross-tab semantics still work for a stale
    // emitter. Siri-Ray + lefarcen P2 on PR #1320.
    window.localStorage.setItem(
      'open-design:config',
      JSON.stringify({ critiqueTheaterEnabled: true }),
    );
    const sink: { enabled?: boolean } = {};
    render(<Probe sink={sink} />);
    expect(sink.enabled).toBe(true);
    act(() => {
      window.dispatchEvent(
        new CustomEvent('open-design:critique-theater-toggle', {
          // No detail at all.
        }),
      );
    });
    // Storage still says true; listener falls back to readToggle and
    // keeps reporting true.
    expect(sink.enabled).toBe(true);
    act(() => {
      window.localStorage.setItem(
        'open-design:config',
        JSON.stringify({ critiqueTheaterEnabled: false }),
      );
      window.dispatchEvent(
        new CustomEvent('open-design:critique-theater-toggle', {
          // Detail with wrong shape: not a boolean.
          detail: { enabled: 'maybe' },
        }),
      );
    });
    // Same path: malformed detail falls back to readToggle, which
    // now sees the freshly-written `false`.
    expect(sink.enabled).toBe(false);
  });

  it('still emits the same-tab CustomEvent when localStorage.setItem throws (quota / disabled storage)', () => {
    // setCritiqueTheaterEnabled writes localStorage first and then dispatches
    // the same-tab event. If the write throws (quota exceeded, private mode),
    // the production code falls through to the dispatch so every mounted
    // hook in the session still updates even though the value cannot
    // persist across reloads. The listener honors the event's typed
    // detail payload directly (it does NOT read localStorage), so the
    // UI stays consistent even when the write was rejected. Siri-Ray
    // + lefarcen P2 on PR #1320.
    const original = window.localStorage.setItem;
    const restore = () => {
      Object.defineProperty(window.localStorage, 'setItem', {
        configurable: true,
        value: original,
      });
    };
    try {
      Object.defineProperty(window.localStorage, 'setItem', {
        configurable: true,
        value: () => {
          throw new DOMException(
            'quota exceeded (synthetic)',
            'QuotaExceededError',
          );
        },
      });

      const sink: { enabled?: boolean } = {};
      render(<Probe sink={sink} />);
      expect(sink.enabled).toBe(false);
      act(() => {
        setCritiqueTheaterEnabled(true);
      });
      // The dispatch path is exercised even though localStorage rejected
      // the write: every mounted hook updates from the in-session event.
      expect(sink.enabled).toBe(true);
    } finally {
      restore();
    }
  });

  // ---------------------------------------------------------------------------
  // Project-settings round-trip (lefarcen P2 on PR #1338). The setter writes
  // the override to localStorage AND, when a projectId is provided, PATCHes
  // /api/projects/:id with metadata.critiqueTheaterEnabled so the daemon's
  // spawn-time resolver picks up the same value on the next generation.
  // ---------------------------------------------------------------------------

  it('PATCHes the project settings endpoint when a projectId is supplied', async () => {
    const fetchCalls: Array<{ url: string; init: RequestInit }> = [];
    const fetchProjectSettings = (url: string, init: RequestInit) => {
      fetchCalls.push({ url, init });
      return Promise.resolve(new Response(null, { status: 200 }));
    };
    act(() => {
      setCritiqueTheaterEnabled(true, {
        projectId: 'proj-abc',
        fetchProjectSettings,
      });
    });
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toBe('/api/projects/proj-abc');
    expect(fetchCalls[0]!.init.method).toBe('PATCH');
    const body = JSON.parse(String(fetchCalls[0]!.init.body));
    expect(body).toEqual({ metadata: { critiqueTheaterEnabled: true } });
  });

  it('skips the daemon PATCH when no projectId is supplied (bare integrator surface)', () => {
    const fetchProjectSettings = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 200 })),
    );
    act(() => {
      setCritiqueTheaterEnabled(true, { fetchProjectSettings });
    });
    expect(fetchProjectSettings).not.toHaveBeenCalled();
  });

  it('swallows a rejected project-settings PATCH so the in-session UI still flips', () => {
    const fetchProjectSettings = vi.fn(() => Promise.reject(new Error('boom')));
    const sink: { enabled?: boolean } = {};
    render(<Probe sink={sink} />);
    expect(sink.enabled).toBe(false);
    act(() => {
      setCritiqueTheaterEnabled(true, {
        projectId: 'proj-abc',
        fetchProjectSettings,
      });
    });
    // The localStorage write + the CustomEvent dispatch fire before
    // the PATCH, so the in-session UI flips regardless of the network
    // outcome. A transient failure does not unwind the flip; the next
    // save retries.
    expect(sink.enabled).toBe(true);
  });
});

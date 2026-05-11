// @vitest-environment jsdom

/**
 * Coverage for the M1 Settings-toggle hook (Phase 15.3). The hook
 * reads from the existing `open-design:config` localStorage blob and
 * stays in sync via the platform `storage` event (cross-tab) and a
 * `open-design:critique-theater-toggle` CustomEvent (same-tab).
 */

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
});

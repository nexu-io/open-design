// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { PREVIEW_RUNTIME_PROTOCOL_VERSION } from '@open-design/contracts/runtime/preview-runtime';

// Exercise the real reporting path: IframeKeepAliveProvider binds
// useAnalytics().track as the phase sink, so mocking the analytics provider —
// rather than installing a sink directly — is what proves the production
// wiring, including that these events use the consented channel.
const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({
    track: analytics.track,
    setConsent: () => undefined,
    setIdentity: () => undefined,
    setConfigureState: () => undefined,
  }),
}));
const safety = vi.hoisted(() => ({ reportSafetyEvent: vi.fn() }));
vi.mock('../../src/analytics/error-tracking', () => ({
  reportSafetyEvent: safety.reportSafetyEvent,
}));
import {
  IframeKeepAliveProvider,
  useIframeKeepAlivePool,
} from '../../src/components/IframeKeepAlivePool';
import {
  PREVIEW_SESSION_STANDBY_TIMEOUT_MS,
  PreviewSessionFrames,
  type PreviewSessionNavigation,
} from '../../src/components/PreviewSessionFrames';
import {
  beginPreviewAttach,
  previewPhaseDescriptor,
  resetPreviewPhaseTelemetry,
} from '../../src/runtime/preview-phase-reporter';

const sink = analytics.track;

beforeEach(() => {
  resetPreviewPhaseTelemetry();
  sink.mockClear();
  safety.reportSafetyEvent.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetPreviewPhaseTelemetry();
});

function events(): Array<Record<string, unknown>> {
  return sink.mock.calls.map(
    (call) => (call as unknown[])[1] as Record<string, unknown>,
  );
}

function phase(name: string): Array<Record<string, unknown>> {
  return events().filter((payload) => payload.phase === name);
}

function navigation(
  version: string,
  overrides: Partial<PreviewSessionNavigation> = {},
): PreviewSessionNavigation {
  return {
    sessionId: 'scope-0001',
    documentVersion: version,
    url: `http://n-scope-0001.localhost:17456/index.html?v=${version}`,
    runtimeProtocol: 'universal',
    sandboxProfile: 'normal',
    deck: false,
    ...overrides,
  };
}

/**
 * Stand in for the attach owner (FileViewer). Everything this component
 * reports is anchored to this call; without it the module fails closed.
 */
function openAttach(nav: PreviewSessionNavigation, openKind: 'cold' | 'warm' = 'cold'): void {
  act(() => {
    beginPreviewAttach(
      previewPhaseDescriptor(nav, { surface: 'file_viewer', openKind }),
      {
        trigger: openKind === 'cold' ? 'initial_open' : 'file_tab_change',
        did_navigate: openKind === 'cold',
      },
    );
  });
}

function signal(
  frame: HTMLIFrameElement,
  document: PreviewSessionNavigation,
  type:
    | 'od:preview:hello'
    | 'od:preview:capabilities-applied'
    | 'od:preview:navigation-failed'
    | 'od:preview:presentation-state-applied'
    | 'od:preview:ready',
  navigationAttempt = 0,
) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        type,
        protocolVersion: PREVIEW_RUNTIME_PROTOCOL_VERSION,
        sessionId: document.sessionId,
        documentVersion: document.documentVersion,
        ...(type === 'od:preview:hello' ? { availableCapabilities: ['scroll', 'edit'] } : {}),
        ...(type === 'od:preview:capabilities-applied' ? { enabledCapabilities: [] } : {}),
        ...(type === 'od:preview:navigation-failed'
          ? { reason: 'version_changed', navigationAttempt }
          : {}),
        ...(type === 'od:preview:presentation-state-applied' ? { revision: 1 } : {}),
      },
    }));
  });
}

function settle(frame: HTMLIFrameElement, document: PreviewSessionNavigation) {
  signal(frame, document, 'od:preview:hello');
  signal(frame, document, 'od:preview:capabilities-applied');
  signal(frame, document, 'od:preview:ready');
  signal(frame, document, 'od:preview:presentation-state-applied');
}

function Harness({
  navigation: nav,
  navigationRetryToken = 0,
  onPromoted,
}: {
  navigation: PreviewSessionNavigation;
  navigationRetryToken?: number;
  onPromoted?: () => void;
}) {
  return (
    <IframeKeepAliveProvider>
      <PreviewSessionFrames
        projectId="project-1"
        fileName="index.html"
        navigation={nav}
        navigationRetryToken={navigationRetryToken}
        onPromoted={onPromoted}
        active
      />
    </IframeKeepAliveProvider>
  );
}

function standbyFrame(): HTMLIFrameElement {
  return screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
}

describe('PreviewSessionFrames phase telemetry', () => {
  it('records the bootstrap handshake when the runtime says hello', () => {
    const first = navigation('v1');
    openAttach(first);
    render(<Harness navigation={first} />);

    signal(standbyFrame(), first, 'od:preview:hello');

    const handshake = phase('bootstrap_handshake');
    expect(handshake).toHaveLength(1);
    expect(handshake[0]?.outcome).toBe('acknowledged');
    expect(handshake[0]?.protocol_version).toBe(PREVIEW_RUNTIME_PROTOCOL_VERSION);
    expect(handshake[0]?.available_capability_count).toBe(2);
  });

  it('records capabilities applied and a promotion with all four gates met', () => {
    const first = navigation('v1');
    openAttach(first);
    render(<Harness navigation={first} />);
    settle(standbyFrame(), first);

    const applied = phase('capabilities_applied');
    expect(applied).toHaveLength(1);
    expect(applied[0]?.outcome).toBe('applied');

    const promoted = phase('version_promoted');
    expect(promoted).toHaveLength(1);
    expect(promoted[0]?.outcome).toBe('promoted');
    expect(promoted[0]?.gate_runtime_identity).toBe(true);
    expect(promoted[0]?.gate_capabilities).toBe(true);
    expect(promoted[0]?.gate_dom_ready).toBe(true);
    expect(promoted[0]?.gate_presentation_state).toBe(true);
    expect(promoted[0]?.blocked_gate).toBe('none');
  });

  it('records last-good retention as a negative when there was no previous version', () => {
    const first = navigation('v1');
    openAttach(first);
    render(<Harness navigation={first} />);
    settle(standbyFrame(), first);

    const retained = phase('last_good_retained');
    expect(retained).toHaveLength(1);
    expect(retained[0]?.retained).toBe(false);
    // Excluded from the retention ratio on both sides; emitted so volume stays
    // honest rather than silently absent.
    expect(retained[0]?.reason).toBe('no_previous_version');
  });

  it('records last-good retention as a positive across a real version handoff', () => {
    const first = navigation('v1');
    const second = navigation('v2');
    openAttach(first);
    const view = render(<Harness navigation={first} />);
    settle(standbyFrame(), first);

    openAttach(second);
    view.rerender(<Harness navigation={second} />);
    settle(standbyFrame(), second);

    const retained = phase('last_good_retained');
    expect(retained).toHaveLength(2);
    expect(retained[1]?.retained).toBe(true);
    expect(retained[1]?.reason).toBe('released_after_promotion');
    expect(retained[1]?.previous_version_exposed).toBe(true);
  });

  it('reports a promotion that failed because the daemon refused the version', () => {
    const first = navigation('v1');
    openAttach(first);
    render(<Harness navigation={first} />);
    const frame = standbyFrame();
    signal(frame, first, 'od:preview:hello');
    signal(frame, first, 'od:preview:navigation-failed');

    const promoted = phase('version_promoted');
    expect(promoted).toHaveLength(1);
    // Without a non-success row here, promotion success rate is identically 1.
    expect(promoted[0]?.outcome).toBe('failed');
    expect(promoted[0]?.blocked_gate).toBe('runtime_identity');

    const recovery = phase('recovery_attempted');
    expect(recovery).toHaveLength(1);
    expect(recovery[0]?.trigger).toBe('navigation_failed');
    expect(recovery[0]?.attempt).toBe(1);
  });

  it('reports an abandoned promotion and a timed-out handshake when the standby never settles', () => {
    vi.useFakeTimers();
    const first = navigation('v1');
    openAttach(first);
    render(<Harness navigation={first} />);

    act(() => {
      vi.advanceTimersByTime(PREVIEW_SESSION_STANDBY_TIMEOUT_MS + 1);
    });

    const handshake = phase('bootstrap_handshake');
    expect(handshake).toHaveLength(1);
    expect(handshake[0]?.outcome).toBe('timeout');

    const promoted = phase('version_promoted');
    expect(promoted).toHaveLength(1);
    expect(promoted[0]?.outcome).toBe('abandoned');
    expect(promoted[0]?.gate_runtime_identity).toBe(false);
    expect(promoted[0]?.blocked_gate).toBe('runtime_identity');

    const recovery = phase('recovery_attempted');
    expect(recovery).toHaveLength(1);
    expect(recovery[0]?.trigger).toBe('handshake_timeout');
  });

  it('names the gate that actually blocked when the runtime settled only partly', () => {
    vi.useFakeTimers();
    const first = navigation('v1');
    openAttach(first);
    render(<Harness navigation={first} />);
    const frame = standbyFrame();
    signal(frame, first, 'od:preview:hello');
    signal(frame, first, 'od:preview:capabilities-applied');
    signal(frame, first, 'od:preview:ready');
    // presentation-state-applied never arrives.

    act(() => {
      vi.advanceTimersByTime(PREVIEW_SESSION_STANDBY_TIMEOUT_MS + 1);
    });

    const promoted = phase('version_promoted');
    expect(promoted[0]?.outcome).toBe('abandoned');
    expect(promoted[0]?.gate_dom_ready).toBe(true);
    expect(promoted[0]?.gate_capabilities).toBe(true);
    expect(promoted[0]?.blocked_gate).toBe('presentation_state');
  });

  it('marks a recovery exhausted once the attempt budget is spent', () => {
    const first = navigation('v1');
    openAttach(first);
    render(<Harness navigation={first} navigationRetryToken={2} />);
    const frame = standbyFrame();
    signal(frame, first, 'od:preview:hello');
    signal(frame, first, 'od:preview:navigation-failed', 2);

    const recovery = phase('recovery_attempted');
    expect(recovery).toHaveLength(1);
    expect(recovery[0]?.attempt).toBe(3);
    expect(recovery[0]?.outcome).toBe('exhausted');
  });

  it('marks a recovery recovered when a retried attempt promotes', () => {
    const first = navigation('v1');
    openAttach(first);
    render(<Harness navigation={first} navigationRetryToken={1} />);
    settle(standbyFrame(), first);

    const recovery = phase('recovery_attempted');
    expect(recovery).toHaveLength(1);
    expect(recovery[0]?.outcome).toBe('recovered');
    expect(recovery[0]?.attempt).toBe(2);
  });

  it('emits nothing at all when the attach owner never opened the attach', () => {
    const first = navigation('v1');
    render(<Harness navigation={first} />);
    settle(standbyFrame(), first);
    expect(sink).not.toHaveBeenCalled();
  });

  it('emits no gated phases for a legacy-url document that really did promote', () => {
    const legacy = navigation('legacy-v1', {
      runtimeProtocol: 'legacy-url',
      url: 'http://localhost/api/projects/project-1/preview/legacy-scope/index.html',
    });
    const onPromoted = vi.fn();
    openAttach(legacy);
    render(<Harness navigation={legacy} onPromoted={onPromoted} />);
    act(() => {
      standbyFrame().dispatchEvent(new Event('load'));
    });

    // Prove the legacy path actually ran and reached its own terminal state.
    // Without this, "emitted nothing" is satisfied by a harness that drove
    // nothing at all, and the assertions below are vacuous.
    expect(onPromoted).toHaveBeenCalledTimes(1);
    // A legacy document promotes on browser load, which is a weaker gate. Its
    // rows would dilute the promotion-success denominator with a population
    // that was never held to the four-gate contract.
    expect(phase('bootstrap_handshake')).toHaveLength(0);
    expect(phase('capabilities_applied')).toHaveLength(0);
    expect(phase('version_promoted')).toHaveLength(0);
    expect(phase('last_good_retained')).toHaveLength(0);
  });
});

function PoolHarness({
  navigation: nav,
  onPool,
}: {
  navigation: PreviewSessionNavigation;
  onPool: (pool: ReturnType<typeof useIframeKeepAlivePool>) => void;
}) {
  return (
    <IframeKeepAliveProvider maxEntries={1}>
      <PoolProbe onPool={onPool} />
      <PreviewSessionFrames
        projectId="project-1"
        fileName="index.html"
        navigation={nav}
        active
      />
    </IframeKeepAliveProvider>
  );
}

function PoolProbe({
  onPool,
}: {
  onPool: (pool: ReturnType<typeof useIframeKeepAlivePool>) => void;
}) {
  const pool = useIframeKeepAlivePool();
  useEffect(() => {
    onPool(pool);
  }, [onPool, pool]);
  return null;
}

describe('IframeKeepAlivePool cache reclaim telemetry', () => {
  it('reports cache_reclaimed when a retained preview frame is evicted', () => {
    const first = navigation('v1');
    openAttach(first);
    let pool: ReturnType<typeof useIframeKeepAlivePool> | null = null;
    render(<PoolHarness navigation={first} onPool={(next) => { pool = next; }} />);
    settle(standbyFrame(), first);

    const current = screen.getByTestId('preview-runtime-frame-current') as HTMLIFrameElement;
    act(() => {
      pool!.evictFrame(current);
    });

    const reclaimed = phase('cache_reclaimed');
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]?.reason).toBe('version_superseded');
    expect(typeof reclaimed[0]?.retained_ms).toBe('number');
    expect(typeof reclaimed[0]?.reuse_count).toBe('number');
  });

  it('reports cache_reclaimed when the whole pool is torn down', () => {
    const first = navigation('v1');
    openAttach(first);
    const view = render(<PoolHarness navigation={first} onPool={() => undefined} />);
    settle(standbyFrame(), first);
    act(() => {
      view.unmount();
    });

    const reclaimed = phase('cache_reclaimed');
    expect(reclaimed.length).toBeGreaterThanOrEqual(1);
    expect(reclaimed.at(-1)?.reason).toBe('session_closed');
  });
});

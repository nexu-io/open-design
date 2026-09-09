import { describe, expect, it, vi } from 'vitest';
import { PREVIEW_RUNTIME_PROTOCOL_VERSION } from '@open-design/contracts/runtime/preview-runtime';
import { PreviewSession, type PreviewSessionDocument } from '../../src/runtime/preview-session';

function document(version: string): PreviewSessionDocument {
  return {
    sessionId: 'session-1',
    documentVersion: version,
    url: `http://n-session.localhost/index.html?v=${version}`,
    runtimeProtocol: 'universal',
    sandboxProfile: 'normal',
    deck: false,
    target: { postMessage: vi.fn() },
  };
}

function event(
  document: PreviewSessionDocument,
  type: 'od:preview:hello' | 'od:preview:capabilities-applied' | 'od:preview:presentation-state-applied' | 'od:preview:ready',
  overrides: Record<string, unknown> = {},
) {
  return {
    source: document.target,
    data: {
      type,
      protocolVersion: PREVIEW_RUNTIME_PROTOCOL_VERSION,
      sessionId: document.sessionId,
      documentVersion: document.documentVersion,
      ...(type === 'od:preview:hello' ? { availableCapabilities: ['scroll', 'edit'] } : {}),
      ...(type === 'od:preview:capabilities-applied' ? { enabledCapabilities: [] } : {}),
      ...(type === 'od:preview:presentation-state-applied' ? { revision: 1 } : {}),
      ...overrides,
    },
  };
}

function settle(
  session: PreviewSession,
  document: PreviewSessionDocument,
  enabledCapabilities: string[] = [],
) {
  session.handleMessage(event(document, 'od:preview:hello'));
  session.handleMessage(event(document, 'od:preview:capabilities-applied', {
    enabledCapabilities,
  }));
  session.handleMessage(event(document, 'od:preview:ready'));
  session.handleMessage(event(document, 'od:preview:presentation-state-applied'));
}

describe('PreviewSession', () => {
  it('promotes a valid blank document after exact runtime and presentation readiness', () => {
    const promoted = vi.fn();
    const session = new PreviewSession({ callbacks: { onPromoted: promoted } });
    const first = document('v1');

    session.stageDocument(first);
    expect(first.target.postMessage).toHaveBeenCalledWith({
      type: 'od:preview:probe',
      protocolVersion: PREVIEW_RUNTIME_PROTOCOL_VERSION,
      sessionId: 'session-1',
      documentVersion: 'v1',
    }, '*');
    session.handleMessage(event(first, 'od:preview:ready'));
    expect(session.snapshot()).toMatchObject({ current: null, standbyReady: true });

    session.handleMessage(event(first, 'od:preview:hello'));
    expect(session.snapshot()).toMatchObject({
      current: null,
      standbyCapabilitiesApplied: false,
    });
    session.handleMessage(event(first, 'od:preview:capabilities-applied'));
    expect(session.snapshot().current).toBeNull();
    session.handleMessage(event(first, 'od:preview:presentation-state-applied'));
    expect(session.snapshot()).toMatchObject({
      current: { sessionId: 'session-1', documentVersion: 'v1' },
      standby: null,
    });
    expect(promoted).toHaveBeenCalledWith(first, null);
  });

  it('can reprobe retained documents after a host listener attaches late', () => {
    const session = new PreviewSession();
    const first = document('v1');
    session.stageDocument(first);
    vi.mocked(first.target.postMessage).mockClear();

    (session as PreviewSession & { probe: () => void }).probe();

    expect(first.target.postMessage).toHaveBeenCalledWith({
      type: 'od:preview:probe',
      protocolVersion: PREVIEW_RUNTIME_PROTOCOL_VERSION,
      sessionId: 'session-1',
      documentVersion: 'v1',
    }, '*');
  });

  it('retains last-good until a replacement restores its exact presentation state', () => {
    const promoted = vi.fn();
    const session = new PreviewSession({ callbacks: { onPromoted: promoted } });
    const first = document('v1');
    const second = document('v2');

    session.stageDocument(first);
    settle(session, first);
    session.stageDocument(second);
    session.handleMessage(event(second, 'od:preview:ready'));

    expect(session.snapshot()).toMatchObject({
      current: { documentVersion: 'v1' },
      standby: { documentVersion: 'v2' },
      standbyReady: true,
    });

    session.handleMessage(event(second, 'od:preview:hello'));
    session.handleMessage(event(second, 'od:preview:capabilities-applied'));
    session.handleMessage(event(second, 'od:preview:presentation-state-applied'));
    expect(session.snapshot()).toMatchObject({ current: { documentVersion: 'v2' }, standby: null });
    expect(promoted).toHaveBeenLastCalledWith(second, first);
  });

  it('discards a failed standby without disturbing last-good', () => {
    const discarded = vi.fn();
    const session = new PreviewSession({ callbacks: { onStandbyDiscarded: discarded } });
    const first = document('v1');
    const second = document('v2');

    session.stageDocument(first);
    settle(session, first);
    session.stageDocument(second);
    session.discardStandby(second);

    expect(session.snapshot()).toMatchObject({ current: { documentVersion: 'v1' }, standby: null });
    expect(discarded).toHaveBeenCalledWith(second);
  });

  it('rejects stale identities and foreign windows', () => {
    const session = new PreviewSession();
    const first = document('v1');
    session.stageDocument(first);

    session.handleMessage(event(first, 'od:preview:presentation-state-applied', {
      documentVersion: 'stale',
    }));
    session.handleMessage({
      ...event(first, 'od:preview:presentation-state-applied'),
      source: {},
    });

    expect(session.snapshot().current).toBeNull();
    expect(session.snapshot().standby?.documentVersion).toBe('v1');
  });

  it('negotiates desired capabilities for standby and current documents', () => {
    const session = new PreviewSession({ enabledCapabilities: ['edit'] });
    const first = document('v1');
    session.stageDocument(first);
    session.handleMessage(event(first, 'od:preview:hello'));

    expect(first.target.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'od:preview:set-capabilities',
      enabledCapabilities: ['edit'],
    }), '*');

    session.handleMessage(event(first, 'od:preview:capabilities-applied', {
      enabledCapabilities: ['edit'],
    }));
    session.handleMessage(event(first, 'od:preview:ready'));
    session.handleMessage(event(first, 'od:preview:presentation-state-applied'));
    session.setEnabledCapabilities(['scroll']);
    expect(first.target.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      enabledCapabilities: ['scroll'],
    }), '*');
  });

  it('does not promote a standby whose negotiated capabilities became stale', () => {
    const session = new PreviewSession();
    const first = document('v1');
    session.stageDocument(first);
    session.handleMessage(event(first, 'od:preview:hello'));
    session.handleMessage(event(first, 'od:preview:capabilities-applied'));

    session.setEnabledCapabilities(['edit']);
    expect(session.snapshot()).toMatchObject({
      current: null,
      standbyCapabilitiesApplied: false,
      standbyPresentationStateApplied: false,
    });

    session.handleMessage(event(first, 'od:preview:capabilities-applied', {
      enabledCapabilities: ['edit'],
    }));
    session.handleMessage(event(first, 'od:preview:ready'));
    session.handleMessage(event(first, 'od:preview:presentation-state-applied', { revision: 2 }));
    expect(session.snapshot().current?.documentVersion).toBe('v1');
  });

  it('suspends and resumes without messaging or replacing the document', () => {
    const snapshots = vi.fn();
    const session = new PreviewSession({ callbacks: { onSnapshotChanged: snapshots } });
    const first = document('v1');
    session.stageDocument(first);
    settle(session, first);
    const callsBeforeSuspend = vi.mocked(first.target.postMessage).mock.calls.length;

    session.setSuspended(true);
    session.setSuspended(false);

    expect(session.snapshot()).toMatchObject({ current: { documentVersion: 'v1' }, suspended: false });
    expect(first.target.postMessage).toHaveBeenCalledTimes(callsBeforeSuspend);
    expect(snapshots).toHaveBeenCalled();
  });
});

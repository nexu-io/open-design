import { describe, expect, it } from 'vitest';
import {
  appendRefreshEvent,
  describeEventPhase,
  describePersistedStatus,
  describeRefreshStatus,
  liveArtifactMetadataPayload,
  liveArtifactPreviewUrl,
  liveArtifactProvenancePayload,
  liveArtifactRefreshPayload,
  liveArtifactViewerTabs,
  refreshErrorMessage,
} from '../../../src/features/file-viewer/rules';
import { LiveArtifactRefreshFailure } from '../../../src/features/file-viewer/types';
import type { LiveArtifact } from '../../../src/types';
import type { Dict } from '../../../src/i18n/types';

const t = ((key: keyof Dict, vars?: Record<string, string | number>) => {
  if (vars) return `${key}:${JSON.stringify(vars)}`;
  return key;
}) as (key: keyof Dict, vars?: Record<string, string | number>) => string;

function makeLiveArtifact(overrides: Partial<LiveArtifact> = {}): LiveArtifact {
  return {
    id: 'artifact-1',
    projectId: 'project-1',
    title: 'My Artifact',
    slug: 'my-artifact',
    status: 'ready',
    pinned: false,
    preview: 'thumbnail',
    refreshStatus: 'idle',
    hasDocument: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    document: null,
    ...overrides,
  } as LiveArtifact;
}

describe('liveArtifactPreviewUrl', () => {
  it('builds the default rendered-variant preview URL with no variant query', () => {
    expect(liveArtifactPreviewUrl('proj a', 'art b')).toBe(
      '/api/live-artifacts/art%20b/preview?projectId=proj%20a',
    );
  });

  it('appends an explicit variant query for non-rendered variants', () => {
    expect(liveArtifactPreviewUrl('proj', 'art', 'template')).toBe(
      '/api/live-artifacts/art/preview?projectId=proj&variant=template',
    );
    expect(liveArtifactPreviewUrl('proj', 'art', 'rendered-source')).toBe(
      '/api/live-artifacts/art/preview?projectId=proj&variant=rendered-source',
    );
  });
});

describe('liveArtifactViewerTabs', () => {
  it('returns the four fixed tabs in order', () => {
    expect(liveArtifactViewerTabs(t).map((tab) => tab.id)).toEqual([
      'preview',
      'code',
      'data',
      'refresh-history',
    ]);
  });
});

describe('liveArtifactMetadataPayload / liveArtifactProvenancePayload / liveArtifactRefreshPayload', () => {
  it('extracts the metadata debug fields, nulling document when absent', () => {
    const artifact = makeLiveArtifact();
    expect(liveArtifactMetadataPayload(artifact)).toMatchObject({
      artifact: { id: 'artifact-1', title: 'My Artifact', refreshStatus: 'idle' },
      document: null,
    });
  });

  it('extracts the provenance document source, defaulting to null', () => {
    expect(liveArtifactProvenancePayload(makeLiveArtifact())).toEqual({ documentSource: null });
    const withDoc = makeLiveArtifact({
      document: { sourceJson: { type: 'chat' } } as never,
    });
    expect(liveArtifactProvenancePayload(withDoc)).toEqual({ documentSource: { type: 'chat' } });
  });

  it('extracts refresh status + lastRefreshedAt, defaulting lastRefreshedAt to null', () => {
    expect(liveArtifactRefreshPayload(makeLiveArtifact())).toEqual({
      refreshStatus: 'idle',
      lastRefreshedAt: null,
    });
    expect(
      liveArtifactRefreshPayload(makeLiveArtifact({ lastRefreshedAt: '2026-01-03T00:00:00.000Z' })),
    ).toEqual({ refreshStatus: 'idle', lastRefreshedAt: '2026-01-03T00:00:00.000Z' });
  });
});

describe('appendRefreshEvent', () => {
  it('assigns the given id/timestamp and appends to the list', () => {
    const events = appendRefreshEvent([], { phase: 'started' }, 1, 1000);
    expect(events).toEqual([{ phase: 'started', id: 1, at: 1000 }]);
  });

  it('computes durationMs against the most recent started event', () => {
    const started = appendRefreshEvent([], { phase: 'started' }, 1, 1000);
    const finished = appendRefreshEvent(started, { phase: 'succeeded', refreshedSourceCount: 2 }, 2, 1500);
    expect(finished[1]).toMatchObject({ phase: 'succeeded', durationMs: 500 });
  });

  it('caps the list at 25 entries, dropping the oldest', () => {
    let events = appendRefreshEvent([], { phase: 'started' }, 0, 0);
    for (let i = 1; i < 30; i += 1) {
      events = appendRefreshEvent(events, { phase: 'started' }, i, i * 10);
    }
    expect(events.length).toBe(25);
    expect(events[0]?.id).toBe(5);
    expect(events[24]?.id).toBe(29);
  });
});

describe('describeRefreshStatus', () => {
  it('maps every refresh status to a tone', () => {
    expect(describeRefreshStatus('running', t).tone).toBe('running');
    expect(describeRefreshStatus('succeeded', t).tone).toBe('success');
    expect(describeRefreshStatus('failed', t).tone).toBe('error');
    expect(describeRefreshStatus('idle', t).tone).toBe('neutral');
    expect(describeRefreshStatus('never', t).tone).toBe('warning');
  });
});

describe('describeEventPhase', () => {
  it('maps session event phases to label/tone pairs', () => {
    expect(describeEventPhase({ id: 1, phase: 'started', at: 0 }, t).tone).toBe('running');
    expect(describeEventPhase({ id: 1, phase: 'succeeded', at: 0 }, t).tone).toBe('success');
    expect(describeEventPhase({ id: 1, phase: 'failed', at: 0 }, t).tone).toBe('error');
  });
});

describe('describePersistedStatus', () => {
  it('maps every persisted-log status to a translation key', () => {
    expect(describePersistedStatus('succeeded', t)).toBe('liveArtifact.refresh.persistedStatusSucceeded');
    expect(describePersistedStatus('running', t)).toBe('liveArtifact.refresh.persistedStatusRunning');
    expect(describePersistedStatus('failed', t)).toBe('liveArtifact.refresh.persistedStatusFailed');
    expect(describePersistedStatus('cancelled', t)).toBe('liveArtifact.refresh.persistedStatusCancelled');
    expect(describePersistedStatus('skipped', t)).toBe('liveArtifact.refresh.persistedStatusSkipped');
  });
});

describe('refreshErrorMessage', () => {
  it('maps a network failure (status 0) to the network-failure copy', () => {
    const error = new LiveArtifactRefreshFailure('boom', 0);
    expect(refreshErrorMessage(error, t)).toBe('liveArtifact.refresh.networkFailure');
  });

  it('maps LIVE_ARTIFACT_REFRESH_UNAVAILABLE to the no-source copy', () => {
    const error = new LiveArtifactRefreshFailure('boom', 422, 'LIVE_ARTIFACT_REFRESH_UNAVAILABLE');
    expect(refreshErrorMessage(error, t)).toBe('liveArtifact.refresh.noSourceTitle');
  });

  it('falls back to the error message for any other Error', () => {
    expect(refreshErrorMessage(new Error('custom failure'), t)).toBe('custom failure');
  });

  it('falls back to the generic-failure copy for a non-Error throw', () => {
    expect(refreshErrorMessage('nope', t)).toBe('liveArtifact.refresh.genericFailure');
  });
});

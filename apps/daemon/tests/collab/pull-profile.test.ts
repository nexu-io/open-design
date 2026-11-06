import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  emitSharedProjectPullTiming,
  emitVelaResourcePullProfile,
  sharedProjectPullProfileEnabled,
} from '../../src/collab/pull-profile.js';

describe('shared project pull profiling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is strictly opt-in and emits no default log', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    expect(sharedProjectPullProfileEnabled({})).toBe(false);
    emitSharedProjectPullTiming(
      {
        phase: 'event-received',
        projectId: 'project-1',
        version: 3,
        atMs: 100,
      },
      {},
    );

    expect(info).not.toHaveBeenCalled();
  });

  it('logs only the allowlisted Vela profile fields from JSONL stderr', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const stderr = [
      'ordinary vela warning with https://secret.example.test',
      JSON.stringify({
        event: 'resource_pull_profile',
        schemaVersion: 1,
        startedAt: '2026-07-26T00:00:00.000Z',
        finishedAt: '2026-07-26T00:00:02.500Z',
        success: true,
        kind: 'project',
        resourceId: 'project-content-project-1',
        ref: 'published',
        totalMs: 2500,
        phases: [
          {
            name: 'resolve_ref',
            count: 1,
            totalMs: 800,
            maxMs: 800,
            url: 'https://secret.example.test',
          },
          {
            name: 'object_store_download',
            count: 2,
            totalMs: 1200,
            maxMs: 700,
          },
          {
            name: 'resolve_ref',
            count: 99,
            totalMs: 99,
            maxMs: 99,
          },
          {
            name: 'unexpected_future_phase',
            count: 1,
            totalMs: 1,
            maxMs: 1,
          },
        ],
        destination: '/private/member/project-1',
        token: 'secret',
      }),
    ].join('\n');

    emitVelaResourcePullProfile(stderr, {
      OD_COLLAB_PULL_PROFILE: '1',
    });

    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0]?.[0]);
    expect(line).toContain('"phase":"vela-child-done"');
    expect(line).toContain('"name":"resolve_ref"');
    expect(line).toContain('"name":"object_store_download"');
    expect(line.match(/"name":"resolve_ref"/gu)).toHaveLength(1);
    expect(line).not.toContain('unexpected_future_phase');
    expect(line).not.toContain('secret.example.test');
    expect(line).not.toContain('/private/member');
    expect(line).not.toContain('"token"');
  });
});

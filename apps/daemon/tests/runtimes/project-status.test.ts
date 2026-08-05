import { describe, expect, it } from 'vitest';

import {
  composeProjectDisplayStatus,
  normalizeProjectDisplayStatus,
} from '../../src/runtimes/project-status.js';

describe('project status projection', () => {
  it('projects starting and queued statuses as running', () => {
    expect(normalizeProjectDisplayStatus('starting')).toBe('running');
    expect(normalizeProjectDisplayStatus('queued')).toBe('running');
    expect(normalizeProjectDisplayStatus('failed')).toBe('failed');
  });

  it('projects succeeded runs awaiting input as awaiting_input', () => {
    expect(
      composeProjectDisplayStatus(
        { value: 'succeeded', updatedAt: 42, runId: 'run-1' },
        new Set(['project-1']),
        'project-1',
      ),
    ).toEqual({
      value: 'awaiting_input',
      updatedAt: 42,
      runId: 'run-1',
    });
  });

  it('preserves non-awaiting status metadata', () => {
    const status = { value: 'running' as const, updatedAt: 7, runId: 'run-2' };

    expect(composeProjectDisplayStatus(status, new Set(), 'project-2')).toEqual(status);
  });
});

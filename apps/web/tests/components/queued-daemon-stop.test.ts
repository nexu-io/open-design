import { describe, expect, it } from 'vitest';

import { shouldCancelQueuedDaemonRun } from '../../src/components/ProjectView';

describe('queued daemon run cancellation', () => {
  it('returns false when the assistant message was not stopped', () => {
    const canceled = new Set<string>();
    expect(shouldCancelQueuedDaemonRun(canceled, 'assistant_1')).toBe(false);
  });

  it('returns true when Stop was clicked before the queued runId arrived', () => {
    const canceled = new Set<string>(['assistant_1']);
    expect(shouldCancelQueuedDaemonRun(canceled, 'assistant_1')).toBe(true);
  });
});


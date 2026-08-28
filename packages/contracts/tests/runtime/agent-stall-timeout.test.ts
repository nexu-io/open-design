import { describe, expect, it } from 'vitest';

import {
  formatAgentStallTimeoutObservation,
  readAgentStallWaitedMinutes,
} from '../../src/runtime/agent-stall-timeout.js';

describe('agent stall timeout observation', () => {
  it('shares the daemon producer shape with the duration parser', () => {
    const firstOutput = formatAgentStallTimeoutObservation('first_output', 90_000);
    const inactivity = formatAgentStallTimeoutObservation('inactivity', 10 * 60_000);

    expect(firstOutput).toBe(
      'Agent stalled without emitting a first output for 90s.',
    );
    expect(readAgentStallWaitedMinutes(firstOutput)).toBe(1);
    expect(inactivity).toBe(
      'Agent stalled without emitting any new output for 600s.',
    );
    expect(readAgentStallWaitedMinutes(inactivity)).toBe(10);
  });

  it('floors milliseconds and falls back below one whole minute', () => {
    const observation = formatAgentStallTimeoutObservation('first_output', 59_500);

    expect(observation).toBe(
      'Agent stalled without emitting a first output for 59s.',
    );
    expect(readAgentStallWaitedMinutes(observation)).toBeNull();
  });

  it('does not read unrelated diagnostic prose', () => {
    expect(readAgentStallWaitedMinutes('provider request timed out after 90s')).toBeNull();
    expect(readAgentStallWaitedMinutes(null)).toBeNull();
  });
});

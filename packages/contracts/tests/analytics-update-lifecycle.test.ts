import { describe, expect, it } from 'vitest';

import {
  UPDATE_LIFECYCLE_STAGES,
  parseUpdateLifecycleObservation,
} from '../src/analytics/update-lifecycle.js';

describe('update lifecycle analytics contract', () => {
  it('accepts the renderer quiescence boundary as a first-class handoff stage', () => {
    expect(UPDATE_LIFECYCLE_STAGES).toContain('renderer_quiesced');
    expect(parseUpdateLifecycleObservation({
      stage: 'renderer_quiesced',
      outcome: 'completed',
    })).toEqual({
      stage: 'renderer_quiesced',
      outcome: 'completed',
    });
  });
});

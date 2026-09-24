import { describe, expect, it } from 'vitest';

import {
  runIntakePreflight,
} from '../../../src/strategies/od-next/resolver.js';

describe('OD Next host intake preflight', () => {
  it('checks actual input and runtime availability', () => {
    expect(runIntakePreflight({
      inputRefs: [{ id: 'request', accessible: true }, { id: 'brand', accessible: false }],
      selectedAgentAvailable: true,
      nativeContinuation: 'unknown',
      taskProfileAvailable: false,
      dependencies: [{ id: 'font', available: false }],
    })).toEqual({
      status: 'blocked',
      reasonCodes: [
        'od_next_preflight_input_unavailable:brand',
        'od_next_preflight_native_continuation_unverified',
        'od_next_preflight_task_profile_unavailable',
        'od_next_preflight_dependency_unavailable:font',
      ],
    });

  });
});

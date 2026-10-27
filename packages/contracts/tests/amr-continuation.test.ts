import { describe, expect, it } from 'vitest';
import { AMR_CONTINUATION_CAPABILITY, AMR_CONTINUATION_ERROR_CODE, isAmrContinuationIncomplete,
  parseAmrContinuationRecovery, supportsAmrNativeContinuation } from '../src/api/amr-continuation.js';

const data = {
  code: AMR_CONTINUATION_ERROR_CODE, kind: 'opencode_continuation_incomplete', runtime: 'opencode',
  phase: 'post_tool_resume', retryable: false, openCodeSessionId: 'ses-1',
  continuation: { version: 1, userMessageId: 'u-1', assistantMessageId: 'a-1', toolResultsCommitted: true },
};
describe('AMR native continuation contract v1', () => {
  it('requires explicit extension negotiation as well as session/load', () => {
    expect(supportsAmrNativeContinuation({ agentCapabilities: { loadSession: true } })).toBe(false);
    expect(supportsAmrNativeContinuation({ agentCapabilities: { loadSession: true,
      _meta: { [AMR_CONTINUATION_CAPABILITY]: { version: 1 } } } })).toBe(true);
  });
  it('classifies legacy failure wording without granting continuation', () => {
    const message = 'json-rpc id 4: opencode event stream: opencode compaction continuation ended before prompt completion';
    expect(isAmrContinuationIncomplete(message, {})).toBe(true);
    expect(isAmrContinuationIncomplete(`I saw ${message}`, {})).toBe(false);
    expect(parseAmrContinuationRecovery({ message })).toBeNull();
  });
  it('accepts only complete, versioned, exact-session evidence', () => {
    expect(parseAmrContinuationRecovery(data)).toEqual({ sessionId: 'ses-1', cursor: data.continuation });
    for (const patch of [
      { phase: 'tool_outstanding' }, { openCodeSessionId: '' }, { code: 'other' },
      { continuation: { ...data.continuation, version: 2 } },
      { continuation: { ...data.continuation, toolResultsCommitted: false } },
      { continuation: { ...data.continuation, assistantMessageId: '' } },
    ]) expect(parseAmrContinuationRecovery({ ...data, ...patch })).toBeNull();
  });
});

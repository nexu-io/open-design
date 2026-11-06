import { describe, expect, it } from 'vitest';
import { classifyRunFailure, type RunEventForFailureClassification } from '../src/run-failure-classification.js';

// Minimized audit counterexamples: generic model/IDs, no user text or commands.
// These are runtime inputs, not PH records augmented with LF-only errors.
const windowError = '[code=model_limit_exceeded] model usage limit exceeded';
const concurrencyError = '[code=tier_limit_exceeded] membership concurrency limit exceeded';
const routeError = '[code=model_not_found] model "media-example" has no active routes for request kind "chat_completions"';
const start = { event: 'start', data: { agentId: 'amr', model: 'media-example', streamFormat: 'acp-json-rpc' } };
const prompt = { event: 'agent', data: { type: 'status', label: 'waiting_for_first_output' } };
const text = { event: 'agent', data: { type: 'text_delta', delta: 'Example output' } };
const tool = { event: 'agent', data: { type: 'status', label: 'tool_call', detail: 'read' } };
function classify(message: string, events: RunEventForFailureClassification[] = [start, prompt], code = 'AGENT_EXECUTION_FAILED') {
  return classifyRunFailure({
    result: 'failed', agentId: 'amr',
    status: { status: 'failed', errorCode: code, error: message },
    events,
  });
}

describe('admission and attribution v3', () => {
  it('keeps an explicit current-attempt handshake policy refusal before execution', () => {
    expect(classify(`json-rpc id 2: ${concurrencyError}`, [start])).toMatchObject({
      failure_category: 'rate_limit', failure_detail: 'membership_concurrency_limit',
      policy_reason: 'membership_concurrency_limit', admission_phase: 'before_execution',
      admission_status: 'rejected_policy', classifier_version: 'run-failure-v3',
    });
  });
  it('keeps an AMR handshake policy error without an attempt boundary unknown', () => {
    expect(classify(`json-rpc id 2: ${windowError}`, [])).toMatchObject({
      policy_reason: 'model_window_limit', admission_phase: 'unknown',
      admission_status: 'unknown', classifier_version: 'run-failure-v3',
    });
  });
  it.each([text, tool])('keeps limits after real activity admitted', (activity) => {
    expect(classify(windowError, [start, prompt, activity])).toMatchObject({
      failure_category: 'rate_limit', failure_detail: 'model_window_limit',
      failure_mechanism: 'policy_rejection', policy_reason: 'model_window_limit',
      admission_status: 'admitted', admission_phase: 'during_execution',
      retryable: true, user_action: 'retry',
    });
  });
  it('keeps a policy failure after guarded plain stdout admitted', () => {
    expect(classifyRunFailure({
      result: 'failed', agentId: 'deepseek',
      status: { status: 'failed', errorCode: 'AGENT_EXECUTION_FAILED', error: windowError },
      events: [
        { event: 'start', data: { agentId: 'deepseek', streamFormat: 'plain' } },
        { event: 'stdout', data: { chunk: 'Example output' } },
        { event: 'error', data: { message: windowError } },
      ],
    })).toMatchObject({
      policy_reason: 'model_window_limit', admission_phase: 'during_execution',
      admission_status: 'admitted',
    });
  });
  it.each([
    { event: 'agent', data: { type: 'artifact', path: 'example.html' } },
    { event: 'agent', data: { type: 'live_artifact', artifactId: 'artifact-example' } },
    { event: 'live_artifact', data: { artifactId: 'artifact-example' } },
  ])('keeps a policy failure after persisted artifact activity admitted', (activity) => {
    expect(classify(windowError, [start, prompt, activity])).toMatchObject({
      policy_reason: 'model_window_limit', admission_phase: 'during_execution',
      admission_status: 'admitted',
    });
  });
  it('does not infer rejection before execution from missing tokens', () => {
    expect(classify(windowError)).toMatchObject({ admission_status: 'unknown', admission_phase: 'unknown' });
  });
  it('does not infer admission for an unknown technical error', () => {
    expect(classify('agent terminated')).toMatchObject({ admission_status: 'unknown', policy_reason: 'none' });
  });
  it('does not inherit previous attempt activity', () => {
    expect(classify(windowError, [start, prompt, text, tool, start, prompt])).toMatchObject({
      admission_status: 'unknown', admission_phase: 'unknown',
    });
  });
  it.each(['run_retry_attempted', 'run_resume_attempted'])('does not inherit admission or cause when %s preflight fails before a new start', (boundary) => {
    expect(classify('agent terminated', [start, prompt, text,
      { event: 'error', data: { message: windowError } },
      { event: boundary, data: { retry_attempt_index: 1 } },
    ])).toMatchObject({ admission_status: 'unknown', admission_phase: 'unknown',
      policy_reason: 'none', failure_domain: 'cross_boundary' });
  });
  it('does not count replayed session history before the current prompt', () => {
    expect(classify(windowError, [start, text, tool, prompt])).toMatchObject({ admission_status: 'unknown' });
  });
  it('does not count replayed session history for a non-AMR ACP runtime', () => {
    const hermesStart = { event: 'start', data: {
      agentId: 'hermes', model: 'example-model', streamFormat: 'acp-json-rpc',
    } };
    expect(classifyRunFailure({
      result: 'failed', agentId: 'hermes',
      status: { status: 'failed', errorCode: 'AGENT_EXECUTION_FAILED', error: windowError },
      events: [hermesStart, text, tool, prompt],
    })).toMatchObject({ admission_status: 'unknown', admission_phase: 'unknown' });
  });
  it('does not count unproven ACP terminal pairs or host text as execution', () => {
    expect(classify(windowError, [start, prompt,
      { event: 'agent', data: { type: 'tool_use', id: 'opaque-tool', name: 'read' } },
      { event: 'agent', data: { type: 'tool_result', toolUseId: 'opaque-tool', hostSynthesized: true } },
      { event: 'agent', data: { ...text.data, hostSynthesized: true } },
    ])).toMatchObject({ admission_status: 'unknown' });
  });
  it('ignores late activity after the attempt verdict', () => {
    expect(classify(windowError, [start, prompt, { event: 'error', data: { message: windowError } }, text, tool]))
      .toMatchObject({ admission_status: 'unknown' });
  });
  it('does not mistake empty deltas or auxiliary usage for execution', () => {
    expect(classify(windowError, [start, prompt,
      { event: 'agent', data: { type: 'text_delta', delta: '' } },
      { event: 'agent', data: { type: 'usage', outputTokens: 100, requestRole: 'auxiliary' } },
    ])).toMatchObject({ admission_status: 'unknown' });
  });
  it('leaves no-route responsibility unresolved without capability proof', () => {
    expect(classify(routeError, [start, prompt], 'AMR_MODEL_UNAVAILABLE')).toMatchObject({
      failure_category: 'model_unavailable', failure_detail: 'model_not_found',
      failure_mechanism: 'model_route_unavailable', failure_domain: 'cross_boundary',
      repair_owner: 'shared_boundary', admission_status: 'unknown', policy_reason: 'none',
    });
  });
  // Contrast fixture: the audit has no such in-band capability proof. It must
  // stay unresolved above; a runtime supplying explicit evidence can close it.
  const capabilityError = { event: 'error', data: { error: {
    code: 'AMR_MODEL_UNAVAILABLE', message: routeError,
    details: { model: 'media-example', requestKind: 'chat_completions', supportedRequestKinds: ['image_generations', 'image_edits'] },
  } } };
  it('attributes a verified selected-model operation mismatch to the product', () => {
    expect(classify(routeError, [start, prompt, capabilityError], 'AMR_MODEL_UNAVAILABLE')).toMatchObject({
      failure_detail: 'model_not_found', failure_mechanism: 'invalid_model_selection',
      failure_domain: 'client_product', repair_owner: 'open_design', evidence_level: 'structured_error',
    });
  });
  it('uses the confirmed ACP model after the initial session model', () => {
    expect(classify(routeError, [start,
      { event: 'agent', data: { type: 'status', label: 'model', model: 'session-default' } },
      { event: 'agent', data: { type: 'status', label: 'model', model: 'media-example' } },
      prompt, capabilityError,
    ], 'AMR_MODEL_UNAVAILABLE')).toMatchObject({
      failure_mechanism: 'invalid_model_selection', failure_domain: 'client_product',
      repair_owner: 'open_design', evidence_level: 'structured_error',
    });
  });
  it('requires current selection, matching operation and complete capability evidence', () => {
    for (const details of [
      { model: 'other-model', requestKind: 'chat_completions', supportedRequestKinds: ['image_generations'] },
      { model: 'media-example', requestKind: 'image_generations', supportedRequestKinds: ['chat_completions'] },
      { model: 'media-example', requestKind: 'chat_completions', supportedRequestKinds: [] },
      { model: 'media-example', requestKind: 'chat_completions', supportedRequestKinds: ['chat_completions'] },
    ]) {
      expect(classify(routeError, [start, prompt, { event: 'error', data: { error: { ...capabilityError.data.error, details } } }], 'AMR_MODEL_UNAVAILABLE'))
        .toMatchObject({ failure_domain: 'cross_boundary' });
    }
    expect(classify(routeError, [start, prompt, capabilityError, start, prompt], 'AMR_MODEL_UNAVAILABLE'))
      .toMatchObject({ failure_domain: 'cross_boundary' });
  });
  it.each([
    ['RATE_LIMITED', 'HTTP 429: too many requests'],
    ['UPSTREAM_UNAVAILABLE', 'HTTP 524 gateway timeout'],
    ['UPSTREAM_UNAVAILABLE', 'Streaming response failed'],
  ])('retains a real provider error %s as a technical failure', (code, message) => {
    expect(classify(message, [start, prompt], code)).toMatchObject({
      failure_mechanism: 'provider_rejection', failure_domain: 'provider_control_plane',
      repair_owner: 'provider_owner', policy_reason: 'none', admission_status: 'unknown',
    });
  });
  it('does not launder a provider verdict through an earlier transient policy error', () => {
    expect(classify('HTTP 524 gateway timeout', [start, prompt,
      { event: 'agent', data: { type: 'error', message: windowError } },
    ], 'UPSTREAM_UNAVAILABLE')).toMatchObject({
      failure_mechanism: 'provider_rejection', policy_reason: 'none', repair_owner: 'provider_owner',
    });
  });
});

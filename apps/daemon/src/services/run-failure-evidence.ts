import type {
  TrackingRunAdmissionPhase,
  TrackingRunPolicyReason,
} from '@open-design/contracts/analytics';
import type {
  RunEventForFailureClassification,
  RunFailureClassification,
  RunFailureClassificationInput,
} from '../run-failure-classification.js';
import { isAcpHandshakeRpcErrorText } from '../runtimes/acp-handshake-id.js';

const POLICY_REASONS = new Set<TrackingRunPolicyReason>([
  'model_window_limit', 'membership_concurrency_limit', 'hard_quota',
  'workspace_credits_exhausted', 'amr_insufficient_balance',
  'amr_tier_upgrade_required', 'entitlement_required',
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

/** Evidence is terminal-attempt scoped by the caller, never run-level usage. */
function admissionPhase(
  input: RunFailureClassificationInput,
  events: RunEventForFailureClassification[],
): TrackingRunAdmissionPhase {
  if (input.admissionEvidence) {
    if (input.admissionEvidence.executionEvidenceSeen) return 'during_execution';
    if (input.admissionEvidence.attemptStarted
      && input.admissionEvidence.acp
      && !input.admissionEvidence.promptSent
      && isAcpHandshakeRpcErrorText(input.status.error)) {
      return 'before_execution';
    }
    return 'unknown';
  }
  const startEvent = events.find((event) => event.event === 'start');
  if (!startEvent) return 'unknown';
  const start = record(startEvent.data);
  const acp = input.agentId === 'amr' || start.streamFormat === 'acp-json-rpc';
  // ACP session/load can replay old messages before session/prompt. The status
  // is emitted by sendPrompt only after writing this attempt's prompt frame.
  let promptSent = !acp;
  for (const event of events) {
    if (event.event === 'error' || event.event === 'end') break;
    const data = record(event.data);
    if (data.hostSynthesized === true) continue;
    if (event.event === 'stdout') {
      if (promptSent && typeof data.chunk === 'string' && data.chunk.length > 0) {
        return 'during_execution';
      }
      continue;
    }
    if (event.event === 'live_artifact') {
      if (promptSent) return 'during_execution';
      continue;
    }
    if (event.event !== 'agent') continue;
    if (data.type === 'error') break;
    if (data.type === 'status' && data.label === 'waiting_for_first_output') {
      promptSent = true;
      continue;
    }
    if (!promptSent) continue;
    if ((data.type === 'text_delta' || data.type === 'thinking_delta')
      && typeof data.delta === 'string' && data.delta.trim().length > 0) {
      return 'during_execution';
    }
    // ACP status is transcribed from a real tool_call[_update] frame. Its
    // tool_use/result pairs can be host flushes with provenance lost on older
    // producers, so never infer execution from those pairs here.
    if (data.type === 'status' && (data.label === 'tool_call' || data.label === 'tool_call_update')) {
      return 'during_execution';
    }
    if (data.type === 'artifact' || data.type === 'live_artifact') return 'during_execution';
    if (!acp && data.type === 'tool_use') return 'during_execution';
  }
  // Use the terminal error, not an earlier event's error text or the legacy
  // classifier's default session_init stage. A written prompt contradicts a
  // pre-execution reading of a later/stale handshake-shaped message.
  if (acp && !promptSent && isAcpHandshakeRpcErrorText(input.status.error)) {
    return 'before_execution';
  }
  return 'unknown';
}

/**
 * No-route is not a capability declaration. Close client attribution only
 * when a runtime error supplies explicit supported operations for the exact
 * model selected in this attempt. The AMR adapter uses chat_completions.
 * Old catalogs/error envelopes omit these facts and deliberately stay mixed.
 */
function verifiedModelSelectionMismatch(
  input: RunFailureClassificationInput,
  events: RunEventForFailureClassification[],
): boolean {
  if (input.agentId !== 'amr') return false;
  const selectedModel = record(events.find((event) => event.event === 'start')?.data).model;
  if (typeof selectedModel !== 'string' || !selectedModel.trim() || selectedModel === 'default') return false;
  let errorEvent: RunEventForFailureClassification | undefined;
  let errorEventIndex = -1;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.event === 'error') {
      errorEvent = events[index];
      errorEventIndex = index;
      break;
    }
  }
  // session/new reports its current model before ACP applies the requested
  // selection. The last model status before the verdict is the confirmed one.
  for (let index = errorEventIndex - 1; index >= 0; index -= 1) {
    const event = events[index];
    const data = record(event?.data);
    if (event?.event === 'agent' && data.type === 'status' && data.label === 'model') {
      if (data.model !== selectedModel) return false;
      break;
    }
  }
  const error = record(record(errorEvent?.data).error);
  const details = record(error.details);
  const supported = details.supportedRequestKinds;
  return error.message === input.status.error
    && error.code === 'AMR_MODEL_UNAVAILABLE'
    && details.model === selectedModel
    && details.requestKind === 'chat_completions'
    && Array.isArray(supported) && supported.length > 0
    && supported.every((kind) => ['chat_completions', 'responses', 'image_generations',
      'image_edits', 'video_generations', 'audio_generations', 'embeddings'].includes(kind))
    && !supported.includes('chat_completions');
}

/** Add causal fields without changing legacy categories, actions or retries. */
export function runFailureEvidence(
  input: RunFailureClassificationInput,
  failure: RunFailureClassification,
  events: RunEventForFailureClassification[],
): Partial<RunFailureClassification> {
  const code = input.errorCode ?? input.status.errorCode;
  // A structured final provider verdict outranks incidental policy strings
  // from earlier status/errors. Keep legacy classification untouched.
  const providerVerdict = (code === 'UPSTREAM_UNAVAILABLE' || code === 'AGENT_CONNECTION_DROPPED')
    && failure.failure_mechanism === 'policy_rejection';
  const policyReason: TrackingRunPolicyReason = !providerVerdict && POLICY_REASONS.has(failure.failure_detail as TrackingRunPolicyReason)
    ? failure.failure_detail as TrackingRunPolicyReason
    : !providerVerdict && failure.failure_category === 'entitlement_required'
      ? 'entitlement_required' : 'none';
  const phase = admissionPhase(input, events);
  const common: Partial<RunFailureClassification> = {
    classifier_version: 'run-failure-v3',
    policy_reason: policyReason,
    admission_phase: phase,
    admission_status: phase === 'during_execution' ? 'admitted'
      : phase === 'before_execution' && policyReason !== 'none' ? 'rejected_policy' : 'unknown',
  };
  if (providerVerdict) {
    return { ...common, failure_mechanism: 'provider_rejection', failure_domain: 'provider_control_plane',
      repair_owner: 'provider_owner', evidence_level: 'structured_code' };
  }
  if (failure.failure_category === 'model_unavailable'
    && ['model_not_found', 'model_not_supported', 'provider_routing_error'].includes(failure.failure_detail)) {
    const mismatch = verifiedModelSelectionMismatch(input, events);
    return { ...common,
      failure_mechanism: mismatch ? 'invalid_model_selection' : 'model_route_unavailable',
      failure_domain: mismatch ? 'client_product' : 'cross_boundary',
      repair_owner: mismatch ? 'open_design' : 'shared_boundary',
      ...(mismatch ? { evidence_level: 'structured_error' as const } : {}),
    };
  }
  return common;
}

import { randomUUID } from 'node:crypto';
import type { RecentApiFailure } from '../http/api-failure-journal.js';
import type { FaultEvidence } from './automatic-diagnostics.js';

interface Run {
  id: string; agentId?: string; projectId?: string; conversationId?: string;
  retryAttemptCount?: number; manualResumeAttemptCount?: number; errorCode?: string;
  strategyTask?: { outcome?: string };
  createdAt?: number; lastAgentActivityAt?: number; cancelOrigin?: string | null;
  terminalTrigger?: string | null; deliverableValid?: boolean;
  deliverableValidation?: unknown; stdinBackpressure?: boolean;
  analyticsTelemetry?: { firstModelEventAt?: number };
  terminalLifecycle?: { terminalPersistence?: { status: string; errorType?: string | null } };
}
interface Event { id: number; event: string; timestamp: number; data: unknown }
export function createDiagnosticRunObserver(): (run: Run, event: Event) => FaultEvidence | null {
  const errors = new WeakMap<Run, Set<string>>();
  return (run, event) => {
    const fault = diagnosticFaultFromRun(run, event);
    if (!fault) return null;
    const seen = errors.get(run) ?? new Set<string>();
    errors.set(run, seen);
    const key = `${run.manualResumeAttemptCount ?? 0}:${run.retryAttemptCount ?? 0}`;
    if (fault.kind === 'terminal_failure' && seen.has(key)) return null;
    if (fault.kind === 'retry' && seen.has(`${run.manualResumeAttemptCount ?? 0}:${Math.max(0, (run.retryAttemptCount ?? 0) - 1)}`)) return null;
    if (fault.kind === 'run_error') seen.add(key);
    return fault;
  };
}
export function diagnosticFaultFromRun(run: Run, event: Event): FaultEvidence | null {
  const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : {};
  let kind: string;
  if (event.event === 'error') kind = 'run_error';
  else if (event.event === 'run_retry_attempted') kind = 'retry';
  else if (event.event === 'agent' && data.type === 'diagnostic' && data.name === 'model_retry') kind = 'model_retry';
  else if (event.event === 'end' && data.status === 'canceled' && run.cancelOrigin === 'user_stop') kind = 'user_cancel';
  else if (event.event === 'end' && data.status === 'succeeded' && run.deliverableValid === false) kind = 'delivery_validation_failure';
  else if (event.event === 'end' && run.strategyTask?.outcome === 'blocked') kind = 'logical_blocked';
  else if (event.event === 'end' && data.status === 'failed') kind = 'terminal_failure';
  else return null;
  if (kind === 'user_cancel') return diagnosticFaultFromLifecycle(run, kind, event.timestamp);
  return { sourceId: `run:${run.id}:${run.manualResumeAttemptCount ?? 0}:${event.id}`,
    kind, at: event.timestamp, runId: run.id,
    ...(run.agentId ? { agentId: run.agentId } : {}),
    ...(run.projectId ? { projectId: run.projectId } : {}),
    ...(run.conversationId ? { conversationId: run.conversationId } : {}),
    attempt: run.retryAttemptCount ?? 0,
    ...(run.errorCode ? { errorCode: run.errorCode } : {}), detail: { ...data, ...diagnosticRunContext(run, event.timestamp) } };
}

/** Bounded facts only: inactivity is evidence, never a claim that the agent hung. */
function diagnosticRunContext(run: Run, at: number) {
  const age = (value?: number) => typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, at - value) : null;
  return {
    elapsedMs: age(run.createdAt), lastAgentActivityAgeMs: age(run.lastAgentActivityAt),
    firstModelEventObserved: Number.isFinite(run.analyticsTelemetry?.firstModelEventAt),
    cancelOrigin: run.cancelOrigin ?? null, terminalTrigger: run.terminalTrigger ?? null,
    stdinBackpressure: run.stdinBackpressure ?? null,
    manualResumeAttemptCount: run.manualResumeAttemptCount ?? 0,
    retryAttemptCount: run.retryAttemptCount ?? 0,
    deliverableValid: run.deliverableValid ?? null,
    deliverableValidation: run.deliverableValidation ?? null,
    terminalPersistence: run.terminalLifecycle?.terminalPersistence ?? null,
  };
}

/** Internal lifecycle hook: deliberately not a new public SSE event. */
export function diagnosticFaultFromLifecycle(
  run: Run, kind: 'user_cancel' | 'terminal_persistence_failure', at: number, writeErrorType?: string,
): FaultEvidence {
  return {
    sourceId: `lifecycle:${run.id}:${run.manualResumeAttemptCount ?? 0}:${run.retryAttemptCount ?? 0}:${kind}`,
    kind, at, runId: run.id,
    ...(run.agentId ? { agentId: run.agentId } : {}),
    ...(run.projectId ? { projectId: run.projectId } : {}),
    ...(run.conversationId ? { conversationId: run.conversationId } : {}),
    attempt: run.retryAttemptCount ?? 0, detail: { ...diagnosticRunContext(run, at),
      ...(writeErrorType ? { persistenceWriteErrorType: writeErrorType } : {}) },
  };
}

/** Route templates contain no user filenames, query strings or request bodies. */
export function diagnosticFaultFromApi(failure: RecentApiFailure): FaultEvidence | null {
  if (failure.status < 400 || /\/(telemetry|diagnostics|objects|health)(?:\/|$)/.test(failure.path)) return null;
  let kind: string;
  if (/\/chat$|\/runs\/[^/]+\/(resume|retry)$/.test(failure.path)) kind = 'admission_failure';
  else if (/\/runs(?:\/|$)/.test(failure.path)) kind = 'run_api_failure';
  else if (/\/(export|preview|preview-url)(?:\/|$)/.test(failure.path)) kind = 'delivery_api_failure';
  else if (/\/(projects|conversations|files|upload|artifacts|live-artifacts)(?:\/|$)/.test(failure.path)) kind = 'workspace_api_failure';
  else return null;
  return { sourceId: `api:${failure.requestId ?? randomUUID()}:${failure.code}`,
    kind, at: Date.parse(failure.at), errorCode: failure.code, detail: failure };
}

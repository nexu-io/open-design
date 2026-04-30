/**
 * Tenant usage event emitter — Spec 101 FR-011.
 *
 * Emits structured JSON-line events for the four open-design lifecycle
 * checkpoints used for billing, monitoring, and downstream lead routing:
 *
 *   - open_design.generation_started
 *   - open_design.generation_completed
 *   - open_design.deploy_completed
 *   - open_design.lead_handoff_received
 *
 * Every event carries the per-request `tenant_id` and `request_id` from the
 * AsyncLocalStorage-backed RequestTenantContext. Calling an emitter outside a
 * `runWithTenantContext` scope throws — silent default tenants would risk
 * cross-tenant attribution leaks.
 *
 * Output sink:
 *   - Default: one JSON object per line on stdout (greppable for log
 *     pipelines).
 *   - Pluggable via `setUsageSink(fn)` for tests and alternate transports.
 *
 * PII guard:
 *   - Email addresses must be hashed by the caller before emission.
 *   - The emitter rejects any string field containing `@` to fail loudly when
 *     a caller forgets. Pre-hashed values (e.g. `sha256:...`) pass through.
 *
 * NOT wired into runtime code in this task (T027). Wiring into resolver /
 * deploy / lead-handoff happens in T028 (Wave G-2).
 */

import { getTenantContext } from '../auth/tenant-context.js';

export type UsageEventName =
  | 'open_design.generation_started'
  | 'open_design.generation_completed'
  | 'open_design.deploy_completed'
  | 'open_design.lead_handoff_received';

export interface UsageEvent {
  event: UsageEventName;
  tenant_id: string;
  request_id: string;
  timestamp: string;
  [key: string]: unknown;
}

export type UsageSink = (event: UsageEvent) => void;

const defaultSink: UsageSink = (event) => {
  process.stdout.write(JSON.stringify(event) + '\n');
};

let currentSink: UsageSink = defaultSink;

/** Replace the active sink (used by tests and alternate transports). */
export function setUsageSink(sink: UsageSink): void {
  currentSink = sink;
}

/** Restore the stdout JSON-line default sink. */
export function resetUsageSink(): void {
  currentSink = defaultSink;
}

/**
 * Walk every string value in `extra` and reject any containing `@`.
 *
 * Caller is responsible for hashing emails before emission. This guard is a
 * defensive backstop, not a sanitizer — we throw rather than redact so the
 * mistake is visible during dev/CI.
 */
function assertNoPii(extra: Record<string, unknown>): void {
  for (const [, value] of Object.entries(extra)) {
    if (typeof value === 'string' && value.includes('@')) {
      throw new Error('PII detected — hash before emitting');
    }
  }
}

function emit(name: UsageEventName, extra: Record<string, unknown>): void {
  assertNoPii(extra);
  const ctx = getTenantContext();
  const event: UsageEvent = {
    event: name,
    tenant_id: ctx.tenant_id,
    request_id: ctx.request_id,
    timestamp: new Date().toISOString(),
    ...extra,
  };
  currentSink(event);
}

export function emitGenerationStarted(extra: {
  project_id: string;
  prompt_hash: string;
}): void {
  emit('open_design.generation_started', extra);
}

export function emitGenerationCompleted(extra: {
  project_id: string;
  duration_ms: number;
  tokens_used?: number;
  success: boolean;
}): void {
  emit('open_design.generation_completed', extra);
}

export function emitDeployCompleted(extra: {
  project_id: string;
  vercel_deployment_id: string;
  live_url: string;
  status: 'success' | 'failed';
  duration_ms: number;
}): void {
  emit('open_design.deploy_completed', extra);
}

export function emitLeadHandoffReceived(extra: {
  project_id: string;
  lead_email_hash: string;
  conversation_id?: string;
}): void {
  emit('open_design.lead_handoff_received', extra);
}

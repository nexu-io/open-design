import {
  CLIENT_EXPERIENCE_DIAGNOSTIC_EVENT,
  parseClientExperienceDiagnostic,
  type ClientExperienceDiagnostic,
} from '@open-design/contracts/analytics';

// Independent of PostHog initialization and its safety-consent bypass. The local
// daemon is the consent authority. No text, URLs, stacks or content enter this bridge.
const seen = new Map<string, number>();
const pending = new Set<ReturnType<typeof setTimeout>>();
const MAX_ENTRIES = 100;
let inFlight = 0;
const token = (value: unknown): string | undefined => typeof value === 'string'
  && /^[a-zA-Z0-9_.:-]{1,128}$/.test(value) ? value : undefined;

export function reportExperienceFailure(input: Omit<ClientExperienceDiagnostic, 'occurrenceId' | 'observedAt'>, occurrence?: string): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const key = occurrence ?? [input.category, input.runId ?? input.projectId ?? '', input.errorCode, input.surface].join(':');
  const last = seen.get(key);
  if (last !== undefined && (occurrence !== undefined || now - last < 10_000)) return;
  if (pending.size + inFlight >= MAX_ENTRIES) return;
  const occurrenceId = occurrence ?? (globalThis.crypto?.randomUUID?.() ?? `event:${now}:${Math.random().toString(36).slice(2)}`);
  const payload = parseClientExperienceDiagnostic({ ...input, occurrenceId, observedAt: now });
  if (!payload) return;
  seen.set(key, now);
  if (seen.size > MAX_ENTRIES) seen.delete(seen.keys().next().value!);
  void deliver(payload, 0);
}

async function deliver(payload: ClientExperienceDiagnostic, attempt: number): Promise<void> {
  inFlight++;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch('/api/observability/event', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: CLIENT_EXPERIENCE_DIAGNOSTIC_EVENT, properties: payload }),
      signal: controller.signal, keepalive: true,
    });
    if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) return;
  } catch { /* Do not report a failure of diagnostic transport as another incident. */ }
  finally { clearTimeout(timeout); inFlight--; }
  if (attempt >= 2 || pending.size >= MAX_ENTRIES) return;
  const timer = setTimeout(() => { pending.delete(timer); void deliver(payload, attempt + 1); }, 1_000 * 2 ** attempt);
  pending.add(timer);
}

export function reportExperienceEvent(event: string, props: Record<string, unknown>): void {
  const isCard = event === 'surface_view' && ['run_failed_toast', 'run_start_blocked'].includes(String(props.element));
  const isPreview = event === 'surface_view' && props.element === 'run_status_bar' && props.status === 'failed';
  const isResult = event.endsWith('_result') && (props.result === 'failed' || props.result === 'error' || props.status === 'failed');
  const runtime = ['client_white_screen', 'client_preview_white_screen', 'client_preview_resource_error',
    'client_preview_runtime_error', 'client_resource_error', 'client_run_stuck', 'client_exception'].includes(event);
  if (!isCard && !isPreview && !isResult && !runtime) return;
  const runId = token(props.run_id) ?? token(props.origin_run_id);
  const projectId = token(props.project_id);
  const conversationId = token(props.conversation_id);
  const errorCode = token(props.error_code) ?? token(props.block_reason) ?? token(props.delivery_state) ?? event;
  const category = runtime ? 'runtime_failure' : isResult ? 'operation_failure' : 'visible_error';
  const surface = token(props.element) ?? token(props.area) ?? event;
  const occurrence = !isResult && !runtime && runId ? `run:${runId}:${category}:${errorCode}` : undefined;
  reportExperienceFailure({ category, surface, errorCode,
    ...(runId ? { runId } : {}), ...(projectId ? { projectId } : {}),
    ...(conversationId ? { conversationId } : {}),
    ...(token(props.status) ? { status: token(props.status)! } : {}),
  }, occurrence);
}

export function reportProjectFailure(project: { id: string; status?: { value: string; runId?: string; updatedAt?: number } }, surface: string): void {
  const status = project.status;
  if (!status || !['failed', 'incomplete'].includes(status.value)) return;
  const projectId = token(project.id); const runId = token(status.runId);
  if (!projectId) return;
  reportExperienceFailure({ category: 'project_failure', surface, errorCode: status.value,
    projectId, ...(runId ? { runId } : {}), status: status.value },
  `project:${projectId}:${runId ?? status.updatedAt ?? 'unknown'}:${status.value}`);
}

export function resetExperienceDiagnosticsForTests(): void {
  seen.clear(); for (const timer of pending) clearTimeout(timer); pending.clear();
}

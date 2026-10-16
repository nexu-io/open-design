import {
  legacyTouchpointTestBehaviorClick, touchpointTestBehaviorEventSchema, touchpointTestContextIdentitySchema, touchpointTestCtaElement,
  TOUCHPOINT_TEST_BEHAVIOR_BODY_LIMIT, TOUCHPOINT_TEST_BEHAVIOR_CTA_CONTRACT_VERSION,
  type TouchpointTestBehaviorButton, type TouchpointTestBehaviorCtaEvent, type TouchpointTestBehaviorEvent, type TestRuntimeContext,
} from '@open-design/contracts/api/touchpointTestRuntime';
import type { TouchpointLoadAttempt } from './touchpoint-load-observability';

export const TEST_BEHAVIOR_LIMITS = Object.freeze({ pending: 32, concurrency: 2, attempts: 3, timeout: 3_000, deadline: 10_000 });
/**
 * How one receipt delivery ended: accepted (2xx), refused/exhausted
 * (`failed`, with the last HTTP status when one was received; null after a
 * network error or timeout), or abandoned by cancellation before an answer.
 */
export type TestBehaviorDeliveryOutcome = Readonly<{ result: 'success' | 'failed' | 'unknown'; httpStatus: number | null }>;
/** `legacy` is the strict-v1 body a server that rejects the v2 click (HTTP 400) can still store. */
type Delivery = { body: string; legacy?: string; current: () => boolean; controller: AbortController; expires: number; settle?: (outcome: TestBehaviorDeliveryOutcome) => void };

/** Process memory only. Each delivery owns one immutable event UUID and total budget. */
export class TestTouchpointBehaviorQueue {
  private waiting: Delivery[] = [];
  private active = new Set<Delivery>();
  /** `settle` runs exactly once per accepted delivery, after its final attempt. */
  enqueue(event: TouchpointTestBehaviorEvent, current: () => boolean, settle?: (outcome: TestBehaviorDeliveryOutcome) => void): boolean {
    if (!current() || !touchpointTestBehaviorEventSchema.safeParse(event).success || this.waiting.length + this.active.size >= TEST_BEHAVIOR_LIMITS.pending) return false;
    const body = JSON.stringify(event);
    if (new TextEncoder().encode(body).byteLength > TOUCHPOINT_TEST_BEHAVIOR_BODY_LIMIT) return false;
    const legacyEvent = 'button' in event ? legacyTouchpointTestBehaviorClick(event) : null;
    this.waiting.push({ body, ...(legacyEvent ? { legacy: JSON.stringify(legacyEvent) } : {}),
      current, controller: new AbortController(), expires: Date.now() + TEST_BEHAVIOR_LIMITS.deadline, settle });
    this.pump();
    return true;
  }
  clear(): void {
    for (const item of [...this.waiting, ...this.active]) item.controller.abort();
    for (const item of this.waiting) settleOnce(item, { result: 'unknown', httpStatus: null });
    this.waiting = [];
  }
  cancelStale(): void {
    for (const item of [...this.waiting, ...this.active]) if (!item.current()) item.controller.abort();
    for (const item of this.waiting) if (item.controller.signal.aborted) settleOnce(item, { result: 'unknown', httpStatus: null });
    this.waiting = this.waiting.filter(item => !item.controller.signal.aborted);
  }
  get size(): number { return this.waiting.length + this.active.size; }
  private pump(): void {
    while (this.active.size < TEST_BEHAVIOR_LIMITS.concurrency && this.waiting.length) {
      const item = this.waiting.shift()!;
      if (!item.current() || Date.now() >= item.expires) { settleOnce(item, { result: 'unknown', httpStatus: null }); continue; }
      this.active.add(item);
      void this.deliver(item).then(outcome => settleOnce(item, outcome)).finally(() => { this.active.delete(item); this.pump(); });
    }
  }
  private async deliver(item: Delivery): Promise<TestBehaviorDeliveryOutcome> {
    // Retryable answers so far; cancellation before a final answer stays unknown.
    let failedStatus: number | null = null, failed = false;
    const abandoned = (): TestBehaviorDeliveryOutcome => ({ result: 'unknown', httpStatus: failedStatus });
    for (let attempt = 0; attempt < TEST_BEHAVIOR_LIMITS.attempts; attempt++) {
      if (item.controller.signal.aborted || !item.current()) return abandoned();
      if (Date.now() >= item.expires) return failed ? { result: 'failed', httpStatus: failedStatus } : abandoned();
      if (attempt && !await this.pause(item, attempt === 1 ? 200 : 800)) return abandoned();
      if (!item.current()) return abandoned();
      if (Date.now() >= item.expires) return { result: 'failed', httpStatus: failedStatus };
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let abort: () => void = () => undefined;
      try {
        const stopped = new Promise<never>((_, reject) => {
          abort = () => { controller.abort(); reject(new Error('test_behavior_cancelled')); };
          item.controller.signal.addEventListener('abort', abort, { once: true });
          timer = setTimeout(abort, Math.min(TEST_BEHAVIOR_LIMITS.timeout, item.expires - Date.now()));
        });
        const status = await Promise.race([
          Promise.resolve().then(() => {
            if (controller.signal.aborted || !item.current()) throw new Error('test_behavior_cancelled');
            return fetch('/api/touchpoints/test-runtime/events', { method: 'POST', headers: { 'content-type': 'application/json' },
              body: item.body, signal: controller.signal, redirect: 'error' });
          }).then(response => { void response.body?.cancel().catch(() => undefined); return response.status; }), stopped,
        ]);
        // A server still on strict v1 rejects the v2 click; downgrade once, same event ID.
        // Merge glue (OBS-006): the refusal counts as this attempt's failed answer, so if the
        // legacy resend never gets an attempt the single settle reports failed/400, not unknown.
        if (status === 400 && item.legacy) { item.body = item.legacy; item.legacy = undefined; failed = true; failedStatus = status; continue; }
        if (status >= 200 && status < 300) return { result: 'success', httpStatus: null };
        if (status !== 429 && status < 500) return { result: 'failed', httpStatus: status };
        failed = true; failedStatus = status;
      } catch {
        // Transport failure spends this attempt, never visibility/QA authority.
        if (controller.signal.aborted && (item.controller.signal.aborted || !item.current())) return abandoned();
        failed = true; failedStatus = null;
      }
      finally { clearTimeout(timer); item.controller.signal.removeEventListener('abort', abort); }
    }
    return { result: 'failed', httpStatus: failedStatus };
  }
  private pause(item: Delivery, ms: number): Promise<boolean> {
    return new Promise(resolve => {
      const finish = (ready: boolean) => { clearTimeout(timer); item.controller.signal.removeEventListener('abort', abort); resolve(ready); };
      const abort = () => finish(false);
      const timer = setTimeout(() => finish(true), Math.min(ms, Math.max(0, item.expires - Date.now())));
      item.controller.signal.addEventListener('abort', abort, { once: true });
      if (item.controller.signal.aborted) abort();
    });
  }
}

function settleOnce(item: Delivery, outcome: TestBehaviorDeliveryOutcome): void {
  const settle = item.settle;
  item.settle = undefined;
  settle?.(outcome);
}

export const testTouchpointBehaviorQueue = new TestTouchpointBehaviorQueue();

/** Shared identity of every behavior event: real load-owner facts plus the negotiated server identity. */
function behaviorBase(context: TestRuntimeContext, attempt: TouchpointLoadAttempt | undefined, eventId: string | null | undefined) {
  if (!attempt || attempt.mode !== 'test' || !attempt.behaviorEventId || !eventId || context.scenario !== 'realtime') return null;
  const identity = touchpointTestContextIdentitySchema.safeParse({ contextId: context.contextId, generation: context.generation, contextToken: context.contextToken });
  const facts = attempt.analyticsFacts;
  if (!identity.success || facts.deployment_id !== context.deploymentId || facts.decision_outcome !== 'eligible' || facts.decision_id !== null) return null;
  const placementKey = facts.placement_key;
  return { attempt, placementKey, base: { eventId, loadAttemptId: facts.load_attempt_id, deploymentId: facts.deployment_id, placementKey,
    locale: facts.locale, ...identity.data,
    surface: placementKey === 'opend.home.hover-entry' ? 'entry' : placementKey === 'opend.home.hover-layer' ? 'layer' : 'placement' } };
}

/** Maps real load-owner facts and the negotiated server identity, never mints context. */
export function testTouchpointBehaviorEvent(context: TestRuntimeContext, attempt: TouchpointLoadAttempt | undefined, eventId: string | null | undefined,
  kind: 'exposure' | 'click', element?: 'primary_cta' | 'close' | 'secondary_close'): TouchpointTestBehaviorEvent | null {
  const owner = behaviorBase(context, attempt, eventId);
  if (!owner) return null;
  const { placementKey } = owner;
  // Badge/entry have no clicks; the layer owns content buttons and explicit X only.
  if (kind === 'click' && (placementKey === 'opend.home.account-badge' || placementKey === 'opend.home.hover-entry' ||
    (placementKey === 'opend.home.hover-layer' && element !== 'primary_cta' && element !== 'close'))) return null;
  if (kind === 'exposure' && eventId !== owner.attempt.behaviorEventId) return null;
  const parsed = touchpointTestBehaviorEventSchema.safeParse({ contractVersion: 1, ...owner.base,
    kind, ...(kind === 'click' ? { element } : {}) });
  return parsed.success ? Object.freeze(parsed.data) : null;
}

/**
 * A content-button click (contract v2). The element is derived from the
 * verified role only: a secondary button can never be recorded as primary.
 */
export function testTouchpointCtaEvent(context: TestRuntimeContext, attempt: TouchpointLoadAttempt | undefined, eventId: string | null | undefined,
  button: TouchpointTestBehaviorButton | undefined): TouchpointTestBehaviorCtaEvent | null {
  const owner = behaviorBase(context, attempt, eventId);
  if (!owner || !button) return null;
  const parsed = touchpointTestBehaviorEventSchema.safeParse({ ...owner.base, contractVersion: TOUCHPOINT_TEST_BEHAVIOR_CTA_CONTRACT_VERSION,
    kind: 'click', element: touchpointTestCtaElement(button.role), button });
  return parsed.success && 'button' in parsed.data ? Object.freeze(parsed.data) : null;
}

import { useEffect, useMemo, useRef } from "react";
import { useAppVersion } from "../analytics/provider";
import { isResolvedAppVersion } from "../analytics/app-version";
import {
  touchpointLoadRecordSchema, touchpointLoadMetricsSchema, touchpointUtf8Bytes, TOUCHPOINT_LOAD_BODY_BYTES,
  TOUCHPOINT_LOAD_BATCH_LIMIT, type TouchpointLoadRecord, type TouchpointLoadMetrics,
} from "@open-design/contracts/api/touchpointLoadResults";

export type LoadMode = "production" | "test";
export type LoadFields = Partial<TouchpointLoadRecord>;
// A failed/empty poll has no successful response to measure. Keep the held
// display grant separately; it is not this request's bytes or cache source.
function unknownResponseMetrics(): LoadFields {
  const { version: _version, ...metrics } = touchpointLoadMetricsSchema.parse({ version: 1 });
  return { ...metrics, decode_validate_ms: null };
}
const uuid = () => crypto.randomUUID();
const mono = () => performance.now();
const duration = (start: number) => Math.min(86_400_000, Math.max(0, mono() - start));
const bodyOf = (records: readonly TouchpointLoadRecord[]) => JSON.stringify({ contractVersion: 1, records });
const QUEUE_BYTES = 512 * 1024;
const KEEPALIVE_BYTES = 48 * 1024;

/** In-memory, immutable payloads. Transport failure cannot enter the rendering chain. */
export class TouchpointLoadQueue {
  private queue: TouchpointLoadRecord[] = [];
  private bytes = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private inFlight = new Set<string>();
  private disposed = false;
  private controllers = new Set<AbortController>();
  dropped = 0;
  constructor(readonly mode: LoadMode, private readonly transport: typeof fetch = (...args) => fetch(...args)) {}
  get size() { return this.queue.length; }
  get queuedBytes() { return this.bytes; }
  enqueue(record: TouchpointLoadRecord) {
    if (this.disposed) return;
    const size = touchpointUtf8Bytes(JSON.stringify(record));
    if (this.queue.length >= 200 || this.bytes + size > QUEUE_BYTES || size + 40 > TOUCHPOINT_LOAD_BODY_BYTES) {
      this.dropped = Math.min(Number.MAX_SAFE_INTEGER, this.dropped + 1); return;
    }
    this.queue.push(record); this.bytes += size;
    if (!this.timer) this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, 100);
  }
  private remove(records: readonly TouchpointLoadRecord[]) {
    const ids = new Set(records.map(record => record.event_id));
    this.queue = this.queue.filter(record => {
      if (!ids.has(record.event_id)) return true;
      this.bytes -= touchpointUtf8Bytes(JSON.stringify(record)); return false;
    });
  }
  private batch(limit: number, records = this.queue) {
    const selected: TouchpointLoadRecord[] = [];
    for (const record of records) {
      if (selected.length >= TOUCHPOINT_LOAD_BATCH_LIMIT || touchpointUtf8Bytes(bodyOf([...selected, record])) > limit) break;
      selected.push(record);
    }
    return selected;
  }
  async flush(keepalive = false): Promise<void> {
    if (this.disposed || !this.queue.length || (this.running && !keepalive)) return;
    if (keepalive) {
      const pending = this.queue.filter(record => !this.inFlight.has(record.event_id)).sort((a, b) => Number(b.kind === "start" || b.kind === "terminal") - Number(a.kind === "start" || a.kind === "terminal"));
      const batch = this.batch(KEEPALIVE_BYTES, pending);
      for (const record of batch) this.inFlight.add(record.event_id);
      try { await this.send(batch, true); } finally { for (const record of batch) this.inFlight.delete(record.event_id); }
      return;
    }
    this.running = true;
    clearTimeout(this.timer); this.timer = undefined;
    const records = keepalive ? [...this.queue].sort((a, b) => Number(b.kind === "start" || b.kind === "terminal") - Number(a.kind === "start" || a.kind === "terminal")) : this.queue;
    const batch = this.batch(keepalive ? KEEPALIVE_BYTES : TOUCHPOINT_LOAD_BODY_BYTES, records);
    for (const record of batch) this.inFlight.add(record.event_id);
    try { await this.send(batch, keepalive); }
    finally {
      for (const record of batch) this.inFlight.delete(record.event_id);
      this.running = false;
      if (!this.disposed && !keepalive && this.queue.length && !this.timer) this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, 100);
    }
  }
  private async send(records: TouchpointLoadRecord[], keepalive: boolean): Promise<void> {
    if (this.disposed || !records.length) return;
    const body = bodyOf(records); // Exactly the same bytes on every retry.
    for (let retry = 0; retry <= (keepalive ? 0 : 2); retry++) {
      if (this.disposed) return;
      const controller = new AbortController();
      this.controllers.add(controller);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const response = await Promise.race([
          this.transport(`/api/touchpoints/${this.mode}-runtime/load-results`, {
            method: "POST", headers: { "content-type": "application/json" }, body,
            signal: controller.signal, keepalive,
          }),
          new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, keepalive ? 1000 : 3000); }),
        ]);
        if (response.status === 413 && records.length > 1 && !keepalive) {
          clearTimeout(timer);
          const half = Math.ceil(records.length / 2);
          await this.send(records.slice(0, half), false); await this.send(records.slice(half), false); return;
        }
        if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) { this.remove(records); return; }
      } catch { /* Bounded best effort, including timeout and unavailable fetch. */ }
      finally { clearTimeout(timer); this.controllers.delete(controller); }
      if (this.disposed) return;
      if (retry < (keepalive ? 0 : 2)) await new Promise(resolve => setTimeout(resolve, (retry + 1) * 100 + Math.random() * 100));
    }
    this.remove(records); // Exhausted records are discardable, never an infinite retry loop.
    this.dropped = Math.min(Number.MAX_SAFE_INTEGER, this.dropped + records.length);
  }
  dispose() { this.disposed = true; clearTimeout(this.timer); for (const controller of this.controllers) controller.abort(); this.controllers.clear(); this.queue = []; this.bytes = 0; }
}
const queues = new Map<LoadMode, { identity: string | null; initialized: boolean; queue: TouchpointLoadQueue }>();
/** Switch synchronously so old payloads never ride a newly authenticated transport. */
export function touchpointLoadQueue(mode: LoadMode, identity?: string | null) {
  let current = queues.get(mode);
  if (identity !== undefined && current && !current.initialized) { current.identity = identity; current.initialized = true; }
  if (identity !== undefined && current && current.identity !== identity) { current.queue.dispose(); current = undefined; }
  if (!current) { current = { identity: identity ?? null, initialized: identity !== undefined, queue: new TouchpointLoadQueue(mode) }; queues.set(mode, current); }
  return current.queue;
}
export function resetTouchpointLoadObservability() { for (const value of queues.values()) value.queue.dispose(); queues.clear(); }

/** Decode only the controlled error vocabulary; never retain the upstream message. */
export async function touchpointResponseFailure(response: Response): Promise<LoadFields> {
  try {
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const parsed = controlledFailureFields(value);
    return parsed;
  } catch { return {}; }
}
function controlledFailureFields(value: object): LoadFields {
  const fields: LoadFields = {};
  const stage = "failure_stage" in value ? value.failure_stage : null;
  const code = "error_code" in value ? value.error_code : null;
  if (typeof stage === "string" && ["decision", "resource_read", "transfer", "decode_validate", "import", "mount", "visibility"].includes(stage)) fields.failure_stage = stage as TouchpointLoadRecord["failure_stage"];
  if (typeof code === "string" && ["network_error", "http_error", "timeout", "resource_missing", "integrity_error", "decode_error", "import_error", "mount_error", "visibility_error", "unknown"].includes(code)) fields.error_code = code as TouchpointLoadRecord["error_code"];
  return fields;
}
/** Actual renderer payload bytes, including Test's streaming daemon boundary. */
export function touchpointClientResourceSizes(value: unknown): LoadFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const body = value as { content?: { resources?: unknown }; contentOmitted?: boolean };
  if (body.contentOmitted && !body.content?.resources) return { local_base64_bytes: 0, decoded_resource_bytes: null };
  if (!Array.isArray(body.content?.resources)) return {};
  let encoded = 0, decoded = 0;
  for (const resource of body.content.resources) {
    if (!resource || typeof resource.bytes !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(resource.bytes)) return {};
    encoded += touchpointUtf8Bytes(resource.bytes); decoded += atob(resource.bytes).length;
  }
  return { local_base64_bytes: encoded, decoded_resource_bytes: decoded };
}
export function controlledLoadFailure(error: unknown, fallback: TouchpointLoadRecord["failure_stage"] = "decision"): LoadFields {
  const text = error instanceof Error ? error.message + " " + ("detail" in error ? String(error.detail) : "") : "";
  const explicit = error && typeof error === "object" && "status" in error ? error.status : null;
  const status = typeof explicit === "number" && Number.isInteger(explicit) && explicit >= 100 && explicit <= 599 ? explicit : Number(/http[_ ](\d{3})/.exec(text)?.[1]) || null;
  const stage = /import/.test(text) ? "import" : /mount/.test(text) ? "mount" : (error instanceof SyntaxError || /integrity|digest|decode|manifest|mismatch|locale|malformed_json|invalid_dto/.test(text)) ? "decode_validate" : fallback;
  const code = /timeout/.test(text) ? "timeout" : status ? "http_error" : /integrity|digest/.test(text) ? "integrity_error" : stage === "import" ? "import_error" : stage === "mount" ? "mount_error" : stage === "decode_validate" ? "decode_error" : /network|fetch/i.test(text) || error instanceof TypeError ? "network_error" : "unknown";
  return { failure_stage: stage, error_code: code, http_status: status, ...(error && typeof error === "object" ? controlledFailureFields(error) : {}) };
}

/**
 * OBS-008 late-result policy. A "result" here is anything that ends or
 * annotates an attempt after its decision: a terminal (`visible` / `fail` /
 * `cancel`) or a `report` record from an exposure/acceptance/test-events
 * receipt. Receipts are asynchronous, so their outcome can arrive after the
 * attempt that sent them has moved on. The rules below describe what the code
 * does, and are pinned by `tests/components/touchpoint-load-observability.test.ts`
 * ("OBS-008 late results").
 *
 * 1. A result is bound to the attempt that produced it, never to "the current
 *    attempt for this placement". Production's `reportProductionBehavior`
 *    closes over `this`, and Test's receipt `settle` closes over the
 *    `receipt` attempt (TestCampaignModal `reportTestBehavior`). A late
 *    outcome cannot reach a newer attempt, so it never rebinds.
 *
 * 2. One terminal per attempt. `visible` / `fail` / `cancel` do nothing once
 *    `settled`, so a late mount failure, a late visibility, or the
 *    `decision_changed` / `page_left` cancel after a visible terminal adds no
 *    second terminal. `cancel` on a settled attempt still marks it retired.
 *
 * 3. Result after the terminal, attempt still owned: recorded. A `report`
 *    after `visible` is the normal order: the receipt runs after the terminal.
 *    It is emitted with the attempt's own `load_attempt_id`, including after
 *    a same-binding renewal (same activity/deployment/content), which keeps
 *    the same attempt.
 *
 * 4. Result after the attempt is retired: dropped, with no record. Retirement
 *    is `cancel(reason)` with `retire = true`. That covers `page_left`
 *    (pagehide → `owner.cancel`), `identity_changed` / `locale_changed` /
 *    unmount (`owner.dispose`), `revoked` and the `capability_unsupported`
 *    reject. `report` and `renewal` check `!retired`. An owner dispose also
 *    closes the sink (`!this.disposed`), and an identity switch disposes the
 *    old load-results queue (`touchpointLoadQueue`), so nothing late from the
 *    old identity is sent. The receipt request itself is not recalled: a
 *    Production exposure that already left still reaches the events API. Only
 *    its load-observability `report` record is dropped. A Test receipt whose
 *    `current()` turns false is abandoned before its next try and settles as
 *    `unknown`, which is then dropped too.
 *
 * 5. Result after a version switch: the old attempt's result is dropped. A
 *    decision whose binding (activity:deployment:content version) differs from
 *    a bound attempt makes `TouchpointLoadOwner.decision` cancel the old
 *    attempt with `decision_changed` (retire) and start a new attempt, which
 *    has its own `start` and `load_attempt_id`. A late receipt outcome of the
 *    old attempt then falls under rule 4, and the new attempt's stream gets no
 *    report, terminal or renewal from it.
 *
 * Accepted trade-off: under rules 4/5 a receipt that did succeed server-side
 * leaves the old attempt as `visible` with no `report` record. Analysis must
 * read a missing report on a retired attempt as "unknown", not as "failed".
 * Rebinding the outcome to the new attempt or re-opening the retired one
 * would attribute it to the wrong deployment/content version.
 */
export class TouchpointLoadAttempt {
  private fields: TouchpointLoadRecord;
  private settled = false;
  private readyAt: number | null = null;
  private triggeredAt: number | null = null;
  private behavior: string | null = null;
  constructor(readonly mode: LoadMode, readonly started: number, session: string, placement: string, locale: string, private readonly sink: (record: TouchpointLoadRecord) => void, known: LoadFields = {}, occurredAt = new Date().toISOString()) {
    this.fields = touchpointLoadRecordSchema.parse({ ...known, event_id: uuid(), load_attempt_id: uuid(), session_id: session, occurred_at: occurredAt, kind: "start", placement_key: placement, host_product: "opend", host_family: "open-design-desktop", locale, visibility_trigger: placement.endsWith("hover-layer") ? "hover" : "immediate" });
    this.emit("start", { occurred_at: occurredAt });
  }
  get behaviorEventId() { return this.behavior; }
  /** Snapshot of the existing owner, never a second analytics identity. */
  get analyticsFacts() { return Object.freeze({ ...this.fields }); }
  get offline() { return this.fields.cache_source === "offline_fallback"; }
  get terminal() { return this.settled; }
  get sessionId() { return this.fields.session_id; }
  private retired = false;
  get emptyTerminal() { return this.settled && !this.bound && ["no_activity", "capability_unsupported"].includes(this.fields.decision_outcome ?? ""); }
  get renewable() { return !this.retired && (!this.settled || this.behavior !== null || this.emptyTerminal); }
  get binding() { return `${this.fields.activity_id}:${this.fields.deployment_id}:${this.fields.content_version_id}`; }
  get bound() { return this.fields.content_version_id !== null; }
  enrich(fields: LoadFields) {
    // Measurement/binding enrichment affects future events only.
    const { event_id: _event, kind: _kind, result: _result, ...safe } = fields;
    this.fields = { ...this.fields, ...safe };
  }
  private emit(kind: TouchpointLoadRecord["kind"], fields: LoadFields = {}) {
    const parsed = touchpointLoadRecordSchema.safeParse({ ...this.fields, event_id: uuid(), occurred_at: new Date().toISOString(), kind, result: null, ...fields });
    if (parsed.success) this.sink(Object.freeze(parsed.data));
  }
  renewal(fields: LoadFields = {}) { if (!this.retired) this.emit("renewal", fields); }
  ready() { if (this.readyAt === null) this.readyAt = mono(); }
  trigger(trigger: "hover" | "click") { if (this.triggeredAt === null) this.triggeredAt = mono(); this.enrich({ visibility_trigger: trigger }); }
  cancel(reason: NonNullable<TouchpointLoadRecord["cancel_reason"]>, retire = true) {
    this.retired = retire;
    if (this.settled) return;
    this.settled = true;
    this.emit("terminal", { result: "cancelled", cancel_reason: this.fields.visibility_trigger !== "immediate" && this.triggeredAt === null && this.bound && !["no_activity", "capability_unsupported"].includes(reason) ? "not_triggered" : reason, total_duration_ms: duration(this.started) });
  }
  fail(error: unknown, stage: TouchpointLoadRecord["failure_stage"] = "decision") {
    if (this.settled) return;
    this.settled = true; this.emit("terminal", { result: "failed", ...controlledLoadFailure(error, stage), total_duration_ms: duration(this.started) });
  }
  visible(): string | null {
    if (this.settled || this.fields.decision_outcome !== "eligible") return null;
    this.settled = true; this.behavior = uuid();
    const since = this.fields.visibility_trigger === "immediate" ? this.readyAt : this.triggeredAt;
    this.emit("terminal", { result: "visible", event_id: this.behavior, visibility_wait_ms: since === null ? null : duration(since), total_duration_ms: duration(this.started) });
    return this.behavior;
  }
  /** `http_status` is the receipt request's own final status, when one was received. */
  report(result: NonNullable<TouchpointLoadRecord["report_result"]>, receipt: Pick<LoadFields, "http_status"> = {}) { if (!this.retired) this.emit("report", { ...receipt, report_result: result }); }
  exposure(decision: { touchpointDecisionId: string; activityId: string; placementKey: string }, diagnostic?: (detail: string) => void) {
    // Mounted leases intentionally retain their original credential on renewal.
    this.enrich({ decision_id: decision.touchpointDecisionId });
    const eventId = this.visible();
    if (!eventId) return null;
    this.reportProductionBehavior(decision, eventId, "exposure", undefined, () => true, diagnostic);
    return eventId;
  }
  /** Only the already-visible, still-owned hover layer may report an explicit X. */
  close(decision: { touchpointDecisionId: string; activityId: string; placementKey: string }, eventId: string,
    current: () => boolean, diagnostic?: (detail: string) => void): void {
    if (this.mode !== "production" || !this.behaviorEventId || !this.renewable || !current() ||
      decision.placementKey !== "opend.home.hover-layer" || this.fields.placement_key !== decision.placementKey ||
      this.fields.decision_id !== decision.touchpointDecisionId || this.fields.activity_id !== decision.activityId) return;
    this.reportProductionBehavior(decision, eventId, "click", "close", current, diagnostic);
  }
  private reportProductionBehavior(decision: { touchpointDecisionId: string; activityId: string; placementKey: string },
    eventId: string, kind: "exposure" | "click", element: "close" | undefined, current: () => boolean,
    diagnostic?: (detail: string) => void): void {
    // Copy the wire body now: later renewal must not rebind this behavior's C.
    const body = JSON.stringify({ touchpointDecisionId: decision.touchpointDecisionId, activityId: decision.activityId,
      placementKey: decision.placementKey, eventId, kind, ...(element ? { element } : {}) });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    void Promise.race([
      Promise.resolve().then(() => {
        if (!current() || controller.signal.aborted) throw new Error("stale");
        return fetch("/api/touchpoints/production-runtime/events", { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body });
      }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, 3000); }),
    ]).then(response => {
      this.report(response.ok ? "success" : "failed");
      if (!response.ok) diagnostic?.(`http_${response.status}`);
      void response.body?.cancel().catch(() => undefined);
    }, () => { this.report("failed"); diagnostic?.("network"); }).finally(() => clearTimeout(timer));
  }
}

/**
 * `decision_id` names a server-issued runtime decision credential, and only
 * Production issues one (`touchpointDecisionId`). A Test decision is bound by
 * its deployment/test context instead: the Test runtime DTO carries no
 * decision credential and the load ingest rejects a non-null `decision_id` in
 * the Test environment (403 load_decision_identity_unavailable, which would
 * drop the whole batch). An eligible Test record therefore always reports
 * `decision_id: null` with `deployment_id` as its binding.
 */
function loadDecisionCredential(mode: LoadMode, value: { touchpointDecisionId?: string }): string | null {
  return mode === "production" ? value.touchpointDecisionId ?? null : null;
}

export type TouchpointLoadRequest ={ started: number; occurredAt: string; attempt: TouchpointLoadAttempt; renewal: boolean };
export class TouchpointLoadOwner {
  readonly sessionId = uuid();
  private attempts = new Map<string, TouchpointLoadAttempt>();
  private disposed = false;
  private clientVersion: string | null = null;
  constructor(readonly mode: LoadMode, readonly locale: string, private readonly sink = (record: TouchpointLoadRecord) => touchpointLoadQueue(mode).enqueue(record)) {}
  setClientVersion(version: string | null) {
    this.clientVersion = version;
    for (const attempt of this.attempts.values()) attempt.enrich({ client_version: version });
  }
  begin(placement: string, known: LoadFields = {}): TouchpointLoadRequest {
    const started = mono(), occurredAt = new Date().toISOString();
    let attempt = this.attempts.get(placement);
    if (attempt && !attempt.renewable) attempt = undefined;
    const renewal = !!attempt;
    if (!attempt) { attempt = new TouchpointLoadAttempt(this.mode, started, this.sessionId, placement, this.locale, record => { if (!this.disposed) this.sink(record); }, { client_version: this.clientVersion, ...known }, occurredAt); this.attempts.set(placement, attempt); }
    return { started, occurredAt, attempt, renewal };
  }
  decision(placement: string, request: TouchpointLoadRequest, value: { activityId?: string; deploymentId?: string; touchpointDecisionId?: string; content?: { id?: string }; contentOmitted?: boolean }, metrics: TouchpointLoadMetrics | null = null, extra: LoadFields = {}): TouchpointLoadAttempt {
    const binding = `${value.activityId ?? null}:${value.deploymentId ?? null}:${value.content?.id ?? null}`;
    let attempt = request.attempt;
    if (this.disposed) return attempt;
    if (attempt.emptyTerminal || (attempt.bound && attempt.binding !== binding)) {
      attempt.cancel("decision_changed");
      attempt = new TouchpointLoadAttempt(this.mode, request.started, this.sessionId, placement, this.locale, record => { if (!this.disposed) this.sink(record); }, { client_version: this.clientVersion }, request.occurredAt);
      this.attempts.set(placement, attempt); request.attempt = attempt; request.renewal = false;
    }
    const { version: _version, ...measurement } = metrics ?? touchpointLoadMetricsSchema.parse({ version: 1 });
    attempt.enrich({ ...measurement, ...extra, activity_id: value.activityId ?? null, deployment_id: value.deploymentId ?? null, content_version_id: value.content?.id ?? null, decision_id: loadDecisionCredential(this.mode, value), decision_outcome: "eligible", decision_request_ms: duration(request.started) });
    if (request.renewal) attempt.renewal();
    return attempt;
  }
  empty(request: TouchpointLoadRequest, outcome: "no_activity" | "capability_unsupported") {
    if (this.disposed) return;
    if (request.renewal) { request.attempt.renewal({ ...unknownResponseMetrics(), activity_id: null, deployment_id: null, content_version_id: null, decision_id: null, decision_outcome: outcome, reason_code: outcome, decision_request_ms: duration(request.started) }); return; }
    request.attempt.enrich({ decision_outcome: outcome, reason_code: outcome, decision_request_ms: duration(request.started) }); request.attempt.cancel(outcome, false);
  }
  reject(placement: string, outcome: "capability_unsupported") {
    const attempt = this.get(placement);
    if (attempt && !attempt.terminal) attempt.enrich({ decision_outcome: outcome, reason_code: outcome });
    attempt?.cancel(outcome);
  }
  get(placement: string) { return this.attempts.get(placement); }
  forDecision(placement: string, decision: { activityId: string; deploymentId: string; content: { id: string } }) {
    const attempt = this.get(placement);
    return attempt?.binding === `${decision.activityId}:${decision.deploymentId}:${decision.content.id}` ? attempt : undefined;
  }
  cancel(reason: NonNullable<TouchpointLoadRecord["cancel_reason"]>, preserveEmpty = false) { for (const attempt of this.attempts.values()) if (!preserveEmpty || !attempt.emptyTerminal) attempt.cancel(reason); }
  failPending(error: unknown) { for (const attempt of this.attempts.values()) if (!attempt.bound) attempt.fail(error); }
  activate() { this.disposed = false; }
  dispose(reason: NonNullable<TouchpointLoadRecord["cancel_reason"]>) { this.cancel(reason); this.disposed = true; }
  failure(request: TouchpointLoadRequest, error: unknown) {
    if (this.disposed) return;
    if (request.renewal) request.attempt.renewal({ ...unknownResponseMetrics(), decision_outcome: null, reason_code: null, decision_request_ms: duration(request.started), http_status: controlledLoadFailure(error).http_status });
    else { request.attempt.enrich({ decision_request_ms: duration(request.started) }); request.attempt.fail(error); }
  }
}
export function useTouchpointLoadOwner(mode: LoadMode, identity: string | null, locale: string) {
  const appVersion = useAppVersion(identity !== null);
  const current = useRef({ identity, locale }); current.current = { identity, locale };
  const queue = useMemo(() => touchpointLoadQueue(mode, identity), [mode, identity]);
  const owner = useMemo(() => new TouchpointLoadOwner(mode, locale, record => queue.enqueue(record)), [mode, identity, locale, queue]);
  // The existing runtime producer resolves /api/version with release overrides.
  // Unresolved placeholders remain null; enriching never rewrites a queued start.
  owner.setClientVersion(isResolvedAppVersion(appVersion) && /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/.test(appVersion) && appVersion !== "unknown" ? appVersion : null);
  useEffect(() => {
    owner.activate();
    const pagehide = () => { owner.cancel("page_left"); void queue.flush(true); };
    window.addEventListener("pagehide", pagehide);
    return () => { window.removeEventListener("pagehide", pagehide); owner.dispose(current.current.locale !== locale ? "locale_changed" : current.current.identity !== identity ? "identity_changed" : "page_left"); };
  }, [identity, locale, mode, owner, queue]);
  return owner;
}

/**
 * Phase-and-duration telemetry contract for the converged HTML preview runtime.
 *
 * The product commitment is narrow and worth restating, because it is the
 * reason this module looks the way it does:
 *
 *   "Every preview records only phases and durations: navigation start,
 *    bootstrap handshake, capabilities applied, first visible paint, version
 *    promotion, last-good retention, recovery attempts, and cache reclaim.
 *    PostHog collects no HTML, DOM text, screenshots, file paths, resource
 *    URLs, or project titles."
 *
 * That promise cannot survive as prose. Two structural rules enforce it here:
 *
 * 1. **There is no free-text field kind.** Every declared field is a boolean,
 *    a bounded number, a value from a closed enum, or an opaque identity key.
 *    A reviewer can audit the whole surface by reading the spec tables below.
 * 2. **Payloads are built by allowlist, never by copy.** `buildPreviewPhaseEventPayload`
 *    walks the spec for the phase and pulls only declared fields, dropping any
 *    unknown key and any value that fails its declared kind. A call site cannot
 *    widen the wire by passing an extra property.
 *
 * Rule 1 plus rule 2 is what makes the promise testable rather than aspirational.
 * It is not hypothetical: on the rolling-upgrade path the web client mints
 * `documentVersion` as `legacy:<file name>` (apps/web/src/providers/registry.ts),
 * so a payload that copied identity strings verbatim would publish user file
 * paths to analytics on its first day. Identity therefore reaches the wire only
 * through `previewPhaseIdentityKey`.
 *
 * Keep this module browser-API free; it is shared by the web host, the daemon
 * bootstrap, and tests.
 */

import {
  PREVIEW_RUNTIME_CAPABILITIES,
  type PreviewRuntimeCapability,
} from './preview-runtime.js';

/** Single wire event name. The phase discriminant lives in `phase`. */
export const PREVIEW_PHASE_EVENT_NAME = 'client_preview_phase';

export const PREVIEW_PHASE_SCHEMA_VERSION = 1 as const;

/**
 * The eight recorded phases, in the order the product named them. This tuple is
 * the closed set: a ninth phase is a contract change, not a call-site decision.
 */
export const PREVIEW_PHASES = [
  'navigation_start',
  'bootstrap_handshake',
  'capabilities_applied',
  'first_visible_paint',
  'version_promoted',
  'last_good_retained',
  'recovery_attempted',
  'cache_reclaimed',
] as const;

export type PreviewPhase = typeof PREVIEW_PHASES[number];

// ---------------------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------------------

export const PREVIEW_PHASE_SURFACES = [
  'file_viewer',
  'deck_viewer',
  'preview_modal',
  'library_preview',
  'plugin_preview',
  'community_preview',
  'unknown',
] as const;
export type PreviewPhaseSurface = typeof PREVIEW_PHASE_SURFACES[number];

export const PREVIEW_PHASE_RENDER_MODES = ['url_load', 'srcdoc'] as const;
export type PreviewPhaseRenderMode = typeof PREVIEW_PHASE_RENDER_MODES[number];

export const PREVIEW_PHASE_SANDBOX_PROFILES = ['normal', 'powered'] as const;
export type PreviewPhaseSandboxProfile = typeof PREVIEW_PHASE_SANDBOX_PROFILES[number];

export const PREVIEW_PHASE_RUNTIME_PROTOCOLS = ['universal', 'legacy-url'] as const;
export type PreviewPhaseRuntimeProtocol = typeof PREVIEW_PHASE_RUNTIME_PROTOCOLS[number];

/**
 * `cold` is an attach that has to produce a document; `warm` is an attach that
 * reuses a retained one. The two have different acceptance targets (cold
 * time-to-visible versus the 100 ms warm-restore ratio), so they must be
 * separable without joining across events.
 */
export const PREVIEW_PHASE_OPEN_KINDS = ['cold', 'warm'] as const;
export type PreviewPhaseOpenKind = typeof PREVIEW_PHASE_OPEN_KINDS[number];

/**
 * What caused this attach attempt. `navigation_start` fires for warm attaches
 * too — with `did_navigate: false` — because the warm-restore metric needs a
 * start anchor, and because the "non-content-update navigation ratio" needs a
 * denominator that includes the attaches that correctly did *not* navigate.
 */
export const PREVIEW_PHASE_NAVIGATION_TRIGGERS = [
  'initial_open',
  'content_version_change',
  'explicit_reload',
  'eviction_reload',
  'recovery',
  'scope_reminted',
  'view_change',
  'capability_change',
  'file_tab_change',
  'project_switch',
  'host_reparent',
  'unknown',
] as const;
export type PreviewPhaseNavigationTrigger = typeof PREVIEW_PHASE_NAVIGATION_TRIGGERS[number];

/**
 * Triggers that are *allowed* to navigate the preview document, per end-state
 * invariant 3 of `specs/current/html-preview-runtime-convergence.md`: a file
 * version change, an explicit reload, eviction, or terminal recovery — plus the
 * initial open (there is no document yet) and a forced scope re-mint (the
 * scoped preview origin expired and could not be renewed in place).
 *
 * The metric "non-content-update navigation ratio, target 0" is defined against
 * this set, so the definition lives in code and a dashboard cannot drift from
 * it. `scope_reminted` is sanctioned but deliberately gets its own dashboard
 * series: it should be rare, and burying it inside the sanctioned bucket would
 * hide a regression in scope renewal.
 */
export const PREVIEW_PHASE_SANCTIONED_NAVIGATION_TRIGGERS: readonly PreviewPhaseNavigationTrigger[] = [
  'initial_open',
  'content_version_change',
  'explicit_reload',
  'eviction_reload',
  'recovery',
  'scope_reminted',
];

export const PREVIEW_PHASE_HANDSHAKE_OUTCOMES = [
  'acknowledged',
  'timeout',
  'identity_mismatch',
  'protocol_unsupported',
  'abandoned',
] as const;
export type PreviewPhaseHandshakeOutcome = typeof PREVIEW_PHASE_HANDSHAKE_OUTCOMES[number];

export const PREVIEW_PHASE_CAPABILITY_OUTCOMES = [
  'applied',
  'timeout',
  'rejected',
  'superseded',
] as const;
export type PreviewPhaseCapabilityOutcome = typeof PREVIEW_PHASE_CAPABILITY_OUTCOMES[number];

export const PREVIEW_PHASE_CAPABILITY_CHANGE_REASONS = [
  'initial',
  'user_toggle',
  'view_change',
  'document_replace',
  'reconnect',
] as const;
export type PreviewPhaseCapabilityChangeReason = typeof PREVIEW_PHASE_CAPABILITY_CHANGE_REASONS[number];

/**
 * How the host learned a visible paint happened. `timeout` records that the
 * probe gave up — an absent measurement, not a zero one.
 */
export const PREVIEW_PHASE_PAINT_DETECTORS = [
  'host_observer',
  'bridge_report',
  'raf_probe',
  'timeout',
] as const;
export type PreviewPhasePaintDetector = typeof PREVIEW_PHASE_PAINT_DETECTORS[number];

export const PREVIEW_PHASE_PROMOTION_OUTCOMES = ['promoted', 'abandoned', 'failed'] as const;
export type PreviewPhasePromotionOutcome = typeof PREVIEW_PHASE_PROMOTION_OUTCOMES[number];

/**
 * The promotion gate, and only the promotion gate.
 *
 * First visible paint is NOT here, and must never be added. The gate is exact
 * runtime identity + capability acknowledgement + DOM ready + presentation
 * state acknowledgement; visual appearance is observation only, and a valid
 * blank or broken authored page must still become the current file version.
 * Adding a paint gate to this enum would silently redefine the numerator of
 * the promotion-success metric.
 */
export const PREVIEW_PHASE_PROMOTION_GATES = [
  'none',
  'runtime_identity',
  'capabilities',
  'dom_ready',
  'presentation_state',
] as const;
export type PreviewPhasePromotionGate = typeof PREVIEW_PHASE_PROMOTION_GATES[number];

export const PREVIEW_PHASE_RETENTION_REASONS = [
  'handoff_window',
  'replacement_in_flight',
  'recovery_in_flight',
  'released_after_promotion',
  'no_previous_version',
  'previous_evicted',
  'retention_budget',
] as const;
export type PreviewPhaseRetentionReason = typeof PREVIEW_PHASE_RETENTION_REASONS[number];

export const PREVIEW_PHASE_RECOVERY_TRIGGERS = [
  'handshake_timeout',
  'navigation_failed',
  'identity_mismatch',
  'transport_unverified',
  'promotion_timeout',
  'subresource_stall',
] as const;
export type PreviewPhaseRecoveryTrigger = typeof PREVIEW_PHASE_RECOVERY_TRIGGERS[number];

export const PREVIEW_PHASE_RECOVERY_OUTCOMES = [
  'recovered',
  'retrying',
  'exhausted',
  'superseded',
] as const;
export type PreviewPhaseRecoveryOutcome = typeof PREVIEW_PHASE_RECOVERY_OUTCOMES[number];

export const PREVIEW_PHASE_RECLAIM_REASONS = [
  'lru_budget',
  'project_switch',
  'session_closed',
  'version_superseded',
  'memory_pressure',
  'manual',
] as const;
export type PreviewPhaseReclaimReason = typeof PREVIEW_PHASE_RECLAIM_REASONS[number];

// ---------------------------------------------------------------------------
// Field specification
// ---------------------------------------------------------------------------

/**
 * The four admissible shapes of a wire value. There is no `text` kind, and
 * adding one would be the single change that breaks the privacy promise — so
 * the absence is asserted by test, not just by review.
 */
export type PreviewPhaseFieldKind = 'key' | 'boolean' | 'number' | 'enum' | 'enum_list';

export interface PreviewPhaseFieldSpec {
  kind: PreviewPhaseFieldKind;
  /** Closed value set; required for `enum` and `enum_list`. */
  values?: readonly string[];
  /** Inclusive upper bound for `number`; values are clamped, never dropped. */
  max?: number;
  /** Maximum length for `enum_list`. */
  maxItems?: number;
}

const MS = 3_600_000;
const COUNT = 100_000;

/** Absolute ceiling for any numeric field, matching the existing preview bridge. */
export const PREVIEW_PHASE_MAX_NUMBER = 10_000_000;

/** Opaque identity keys look like `h_<8-16 hex>` and nothing else. */
export const PREVIEW_PHASE_IDENTITY_KEY_PATTERN = /^h_[0-9a-f]{8,16}$/;

/**
 * Fields present on every phase record.
 *
 * `attach_index` exists so a funnel can be keyed by
 * `(session_key, document_key, attach_index)`. Without it two attaches of the
 * same document seconds apart are indistinguishable, and the warm-restore
 * ratio quietly mixes their timings.
 */
export const PREVIEW_PHASE_COMMON_FIELDS: Readonly<Record<string, PreviewPhaseFieldSpec>> = {
  phase: { kind: 'enum', values: PREVIEW_PHASES },
  session_key: { kind: 'key' },
  document_key: { kind: 'key' },
  surface: { kind: 'enum', values: PREVIEW_PHASE_SURFACES },
  render_mode: { kind: 'enum', values: PREVIEW_PHASE_RENDER_MODES },
  sandbox_profile: { kind: 'enum', values: PREVIEW_PHASE_SANDBOX_PROFILES },
  runtime_protocol: { kind: 'enum', values: PREVIEW_PHASE_RUNTIME_PROTOCOLS },
  open_kind: { kind: 'enum', values: PREVIEW_PHASE_OPEN_KINDS },
  /**
   * What caused this attach, stamped on every phase of it rather than only on
   * `navigation_start`. Promotion success, last-good retention, and recovery
   * exhaustion all want to be sliced by cause; carrying it here keeps those
   * metrics as single-event aggregations instead of PostHog funnel joins.
   */
  attach_trigger: { kind: 'enum', values: PREVIEW_PHASE_NAVIGATION_TRIGGERS },
  /** False for a warm attach that correctly reused the retained document. */
  did_navigate: { kind: 'boolean' },
  deck: { kind: 'boolean' },
  attach_index: { kind: 'number', max: COUNT },
  sequence: { kind: 'number', max: COUNT },
  /** Since this attach's `navigation_start`. */
  elapsed_ms: { kind: 'number', max: MS },
  /** Since the previous recorded phase of this attach. */
  phase_duration_ms: { kind: 'number', max: MS },
};

/**
 * Per-phase field allowlists. Reading these eight tables is the complete audit
 * of what preview telemetry can ever contain.
 */
export const PREVIEW_PHASE_FIELDS: Readonly<
  Record<PreviewPhase, Readonly<Record<string, PreviewPhaseFieldSpec>>>
> = {
  navigation_start: {
    had_previous_version: { kind: 'boolean' },
    /** Retained preview sessions at the moment of this attach. */
    retained_session_count: { kind: 'number', max: COUNT },
  },
  bootstrap_handshake: {
    outcome: { kind: 'enum', values: PREVIEW_PHASE_HANDSHAKE_OUTCOMES },
    protocol_version: { kind: 'number', max: COUNT },
    available_capability_count: { kind: 'number', max: COUNT },
    probe_count: { kind: 'number', max: COUNT },
  },
  capabilities_applied: {
    outcome: { kind: 'enum', values: PREVIEW_PHASE_CAPABILITY_OUTCOMES },
    // Capability names are a closed protocol enum, so the set itself is safe to
    // carry; it is what separates "deck is slow to arm" from "edit is".
    enabled_capabilities: {
      kind: 'enum_list',
      values: PREVIEW_RUNTIME_CAPABILITIES,
      maxItems: PREVIEW_RUNTIME_CAPABILITIES.length,
    },
    enabled_capability_count: { kind: 'number', max: COUNT },
    change_reason: { kind: 'enum', values: PREVIEW_PHASE_CAPABILITY_CHANGE_REASONS },
  },
  first_visible_paint: {
    detector: { kind: 'enum', values: PREVIEW_PHASE_PAINT_DETECTORS },
    paint_observed: { kind: 'boolean' },
    visible_element_count: { kind: 'number', max: COUNT },
    // Constant `true`, on the wire on purpose: it tells a future dashboard
    // author, inside PostHog where they are actually working, that this phase
    // never gates promotion, retention, discard, or reload.
    observation_only: { kind: 'boolean' },
  },
  version_promoted: {
    outcome: { kind: 'enum', values: PREVIEW_PHASE_PROMOTION_OUTCOMES },
    gate_runtime_identity: { kind: 'boolean' },
    gate_capabilities: { kind: 'boolean' },
    gate_dom_ready: { kind: 'boolean' },
    gate_presentation_state: { kind: 'boolean' },
    blocked_gate: { kind: 'enum', values: PREVIEW_PHASE_PROMOTION_GATES },
    attempt: { kind: 'number', max: COUNT },
    /**
     * Whether a paint had been observed when the promotion decision was taken.
     * Purely a proof obligation: promotions with `false` here demonstrate that
     * paint did not gate the decision.
     */
    paint_observed_at_decision: { kind: 'boolean' },
  },
  last_good_retained: {
    /** False rows are what give the retention rate a denominator. */
    retained: { kind: 'boolean' },
    reason: { kind: 'enum', values: PREVIEW_PHASE_RETENTION_REASONS },
    retained_ms: { kind: 'number', max: MS },
    /** Whether the previous version was actually shown during the window. */
    previous_version_exposed: { kind: 'boolean' },
  },
  recovery_attempted: {
    trigger: { kind: 'enum', values: PREVIEW_PHASE_RECOVERY_TRIGGERS },
    attempt: { kind: 'number', max: COUNT },
    max_attempts: { kind: 'number', max: COUNT },
    outcome: { kind: 'enum', values: PREVIEW_PHASE_RECOVERY_OUTCOMES },
    navigation_token_scoped: { kind: 'boolean' },
  },
  cache_reclaimed: {
    reason: { kind: 'enum', values: PREVIEW_PHASE_RECLAIM_REASONS },
    retained_ms: { kind: 'number', max: MS },
    /** Warm attaches this retained document served before it was reclaimed. */
    reuse_count: { kind: 'number', max: COUNT },
    retained_session_count: { kind: 'number', max: COUNT },
    evicted_session_count: { kind: 'number', max: COUNT },
  },
};

// ---------------------------------------------------------------------------
// Typed per-phase details
// ---------------------------------------------------------------------------

export interface PreviewPhaseNavigationStartDetail {
  had_previous_version?: boolean;
  retained_session_count?: number;
}

/**
 * The framing a caller supplies once when an attach opens. `trigger` and
 * `did_navigate` are lifted onto every phase of the attach.
 */
export interface PreviewPhaseAttachInput extends PreviewPhaseNavigationStartDetail {
  trigger: PreviewPhaseNavigationTrigger;
  did_navigate: boolean;
}

export interface PreviewPhaseBootstrapHandshakeDetail {
  outcome: PreviewPhaseHandshakeOutcome;
  protocol_version?: number;
  available_capability_count?: number;
  probe_count?: number;
}

export interface PreviewPhaseCapabilitiesAppliedDetail {
  outcome: PreviewPhaseCapabilityOutcome;
  enabled_capabilities?: readonly PreviewRuntimeCapability[];
  enabled_capability_count?: number;
  change_reason?: PreviewPhaseCapabilityChangeReason;
}

export interface PreviewPhaseFirstVisiblePaintDetail {
  detector?: PreviewPhasePaintDetector;
  paint_observed: boolean;
  visible_element_count?: number;
}

export interface PreviewPhaseVersionPromotedDetail {
  outcome: PreviewPhasePromotionOutcome;
  gate_runtime_identity: boolean;
  gate_capabilities: boolean;
  gate_dom_ready: boolean;
  gate_presentation_state: boolean;
  blocked_gate?: PreviewPhasePromotionGate;
  attempt?: number;
  paint_observed_at_decision?: boolean;
}

export interface PreviewPhaseLastGoodRetainedDetail {
  retained: boolean;
  reason: PreviewPhaseRetentionReason;
  retained_ms?: number;
  previous_version_exposed?: boolean;
}

export interface PreviewPhaseRecoveryAttemptedDetail {
  trigger: PreviewPhaseRecoveryTrigger;
  attempt: number;
  max_attempts?: number;
  outcome: PreviewPhaseRecoveryOutcome;
  navigation_token_scoped?: boolean;
}

export interface PreviewPhaseCacheReclaimedDetail {
  reason: PreviewPhaseReclaimReason;
  retained_ms?: number;
  reuse_count?: number;
  retained_session_count?: number;
  evicted_session_count?: number;
}

export interface PreviewPhaseDetailByPhase {
  navigation_start: PreviewPhaseNavigationStartDetail;
  bootstrap_handshake: PreviewPhaseBootstrapHandshakeDetail;
  capabilities_applied: PreviewPhaseCapabilitiesAppliedDetail;
  first_visible_paint: PreviewPhaseFirstVisiblePaintDetail;
  version_promoted: PreviewPhaseVersionPromotedDetail;
  last_good_retained: PreviewPhaseLastGoodRetainedDetail;
  recovery_attempted: PreviewPhaseRecoveryAttemptedDetail;
  cache_reclaimed: PreviewPhaseCacheReclaimedDetail;
}

export type PreviewPhaseDetail<P extends PreviewPhase = PreviewPhase> =
  PreviewPhaseDetailByPhase[P];

/** Identity and framing supplied per record; identity is hashed before it ships. */
export interface PreviewPhaseEventInput<P extends PreviewPhase = PreviewPhase> {
  phase: P;
  sessionId: string;
  documentVersion: string;
  surface: PreviewPhaseSurface;
  renderMode: PreviewPhaseRenderMode;
  sandboxProfile: PreviewPhaseSandboxProfile;
  runtimeProtocol: PreviewPhaseRuntimeProtocol;
  openKind: PreviewPhaseOpenKind;
  attachTrigger: PreviewPhaseNavigationTrigger;
  didNavigate: boolean;
  deck: boolean;
  attachIndex: number;
  sequence: number;
  elapsedMs: number;
  phaseDurationMs: number;
  detail?: Readonly<Record<string, unknown>>;
}

export type PreviewPhaseEventPayload = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Identity keying
// ---------------------------------------------------------------------------

/**
 * Turn a raw preview identity into an opaque, stable correlation key.
 *
 * This is not a security hash and does not need to be: it exists so that
 * identity strings — one of which is literally a file path on the legacy
 * path — never reach analytics verbatim, while events from one document still
 * join to each other. Two 32-bit FNV-1a passes over different seeds give a
 * 64-bit key, which is ample for correlating within a client session and far
 * too lossy to invert back into a path.
 */
export function previewPhaseIdentityKey(value: string): string {
  return `h_${fnv1a(value, 0x811c9dc5)}${fnv1a(value, 0x01000193)}`;
}

function fnv1a(value: string, seed: number): string {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// Payload construction
// ---------------------------------------------------------------------------

function isPreviewPhase(value: unknown): value is PreviewPhase {
  return typeof value === 'string' && (PREVIEW_PHASES as readonly string[]).includes(value);
}

function coerceNumber(value: unknown, spec: PreviewPhaseFieldSpec): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const ceiling = Math.min(spec.max ?? PREVIEW_PHASE_MAX_NUMBER, PREVIEW_PHASE_MAX_NUMBER);
  return Math.max(0, Math.min(Math.round(value), ceiling));
}

function coerceEnum(value: unknown, spec: PreviewPhaseFieldSpec): string | undefined {
  if (typeof value !== 'string') return undefined;
  return spec.values?.includes(value) ? value : undefined;
}

function coerceEnumList(value: unknown, spec: PreviewPhaseFieldSpec): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const limit = spec.maxItems ?? spec.values?.length ?? 0;
  const seen = new Set<string>();
  for (const item of value) {
    const accepted = coerceEnum(item, spec);
    if (accepted !== undefined) seen.add(accepted);
    if (seen.size >= limit) break;
  }
  // Preserve the declared order so the same set always serializes identically.
  return (spec.values ?? []).filter((candidate) => seen.has(candidate));
}

function applyField(
  target: PreviewPhaseEventPayload,
  field: string,
  spec: PreviewPhaseFieldSpec,
  value: unknown,
): void {
  if (value === undefined || value === null) return;
  switch (spec.kind) {
    case 'key': {
      if (typeof value !== 'string') return;
      target[field] = value;
      return;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') return;
      target[field] = value;
      return;
    }
    case 'number': {
      const next = coerceNumber(value, spec);
      if (next !== undefined) target[field] = next;
      return;
    }
    case 'enum': {
      const next = coerceEnum(value, spec);
      if (next !== undefined) target[field] = next;
      return;
    }
    case 'enum_list': {
      const next = coerceEnumList(value, spec);
      if (next !== undefined) target[field] = next;
      return;
    }
  }
}

/**
 * Build one phase payload by allowlist.
 *
 * Nothing is copied from the input wholesale. Every emitted field is looked up
 * in a spec table first, so an unknown key cannot ride along and a poisoned
 * value cannot occupy an enum slot. Returns `null` only for an unknown phase.
 */
export function buildPreviewPhaseEventPayload(
  input: PreviewPhaseEventInput,
): PreviewPhaseEventPayload | null {
  if (!isPreviewPhase(input.phase)) return null;

  const framed: Record<string, unknown> = {
    phase: input.phase,
    session_key: previewPhaseIdentityKey(input.sessionId),
    document_key: previewPhaseIdentityKey(input.documentVersion),
    surface: input.surface,
    render_mode: input.renderMode,
    sandbox_profile: input.sandboxProfile,
    runtime_protocol: input.runtimeProtocol,
    open_kind: input.openKind,
    attach_trigger: input.attachTrigger,
    did_navigate: input.didNavigate,
    deck: input.deck,
    attach_index: input.attachIndex,
    sequence: input.sequence,
    elapsed_ms: input.elapsedMs,
    phase_duration_ms: input.phaseDurationMs,
  };

  const payload: PreviewPhaseEventPayload = {
    schema_version: PREVIEW_PHASE_SCHEMA_VERSION,
  };
  for (const [field, spec] of Object.entries(PREVIEW_PHASE_COMMON_FIELDS)) {
    applyField(payload, field, spec, framed[field]);
  }

  const detail = input.detail ?? {};
  for (const [field, spec] of Object.entries(PREVIEW_PHASE_FIELDS[input.phase])) {
    applyField(payload, field, spec, detail[field]);
  }

  // First visible paint is reported, never consulted. Stamp that on the wire so
  // the constraint travels with the data instead of living only in this file.
  if (input.phase === 'first_visible_paint') payload.observation_only = true;

  return payload;
}

import type {
  PreviewPhase,
  PreviewPhaseAttachInput,
  PreviewPhaseDetail,
  PreviewPhaseOpenKind,
  PreviewPhaseReclaimReason,
  PreviewPhaseRenderMode,
  PreviewPhaseSurface,
} from '@open-design/contracts/runtime/preview-phase-events';
import {
  PreviewPhaseTelemetry,
  type PreviewPhaseIdentity,
  type PreviewPhaseSessionDescriptor,
  type PreviewPhaseTelemetryRecord,
} from './preview-phase-telemetry';
import type { PreviewSessionNavigation } from './preview-session-navigation';

/**
 * Reporting sink for preview phase records.
 *
 * ## Which channel these events use, and why
 *
 * They go through the **consent-gated product analytics channel**
 * (`useAnalytics().track`), NOT through `reportSafetyEvent`.
 *
 * The existing preview events — `client_preview_white_screen`,
 * `client_preview_resource_error`, `client_preview_runtime_error`,
 * `client_preview_deck_stage_unscaled` — use `reportSafetyEvent`, which
 * deliberately bypasses the analytics consent gate under the same
 * safety-bypass contract as `$exception`. That bypass is justified for those
 * events: a stability failure has to be visible even from a user who declined
 * product analytics, because we cannot fix a crash we cannot see.
 *
 * Phase durations of a *healthy* preview are a different thing. They are
 * performance and operational data describing a normal session — how long a
 * handshake took, whether a warm switch stayed warm. Sending them under the
 * safety bypass would widen it from "tell us when we broke" to "profile every
 * document this user opened", which weakens the justification for the bypass
 * on the events that genuinely need it. So the bypass keeps exactly its
 * current scope, and phase telemetry lives on the consented channel.
 *
 * Splitting per phase — healthy phases consented, failure phases on the safety
 * channel — looks tempting and is a trap. Every one of the six dashboard
 * metrics is a ratio or a percentile over a population. A numerator drawn from
 * all users and a denominator drawn only from consenting users does not
 * produce a rate; it produces a number that moves when consent rates move. One
 * population, one channel.
 *
 * The cost, stated so the dashboard reader can price it: consent-declined
 * sessions contribute no phase rows, so absolute volume undercounts the fleet.
 * All six metrics are ratios or percentiles and are unaffected by that, on the
 * assumption that consent is not correlated with preview health.
 */
export type PreviewPhaseSink = (
  eventName: string,
  properties: Record<string, unknown>,
) => void;

const telemetry = new PreviewPhaseTelemetry();
const poolKeyDescriptors = new Map<string, PreviewPhaseIdentity>();
const MAX_TRACKED_POOL_KEYS = 64;

let sink: PreviewPhaseSink | null = null;

/**
 * Install the reporting sink. Called once from `IframeKeepAliveProvider`,
 * which sits above every preview surface and inside `AnalyticsProvider`.
 */
export function setPreviewPhaseSink(next: PreviewPhaseSink | null): void {
  sink = next;
}

/**
 * Records produced while no sink is installed are dropped, not buffered.
 *
 * Buffering would mean holding timings captured before the analytics channel
 * existed and flushing them once it does — which is precisely the window in
 * which consent has not yet been resolved. Dropping loses a few rows at boot;
 * buffering would launder them past the gate.
 */
function emit(record: PreviewPhaseTelemetryRecord | null): void {
  if (!record || !sink) return;
  try {
    sink(record.eventName, record.payload);
  } catch {
    // Telemetry must never take a preview down with it.
  }
}

/** Build the fixed framing for one attach from the navigation that produced it. */
export function previewPhaseDescriptor(
  navigation: PreviewSessionNavigation,
  framing: {
    surface: PreviewPhaseSurface;
    openKind: PreviewPhaseOpenKind;
    /** The converged runtime is always a real URL; kept explicit for clarity. */
    renderMode?: PreviewPhaseRenderMode;
  },
): PreviewPhaseSessionDescriptor {
  return {
    sessionId: navigation.sessionId,
    documentVersion: navigation.documentVersion,
    surface: framing.surface,
    renderMode: framing.renderMode ?? 'url_load',
    sandboxProfile: navigation.sandboxProfile,
    runtimeProtocol: navigation.runtimeProtocol,
    openKind: framing.openKind,
    deck: navigation.deck,
  };
}

/**
 * Open an attach window and emit its `navigation_start`.
 *
 * This is the prerequisite for everything else in this module: a phase
 * recorded without an open attach is dropped, because a duration with no
 * anchor is not a measurement. The owner of the preview surface calls this —
 * including for warm re-attaches, which need their own anchor or the
 * warm-restore ratio has nothing to measure against.
 */
export function beginPreviewAttach(
  descriptor: PreviewPhaseSessionDescriptor,
  attach: PreviewPhaseAttachInput,
): void {
  emit(telemetry.beginSession(descriptor, attach));
}

export function recordPreviewPhase<P extends PreviewPhase>(
  identity: PreviewPhaseIdentity,
  phase: P,
  detail: PreviewPhaseDetail<P> | Readonly<Record<string, unknown>>,
): void {
  emit(telemetry.recordPhase(identity, phase, detail));
}

export function endPreviewAttach(identity: PreviewPhaseIdentity): void {
  telemetry.endSession(identity);
}

export function previewAttachIsOpen(identity: PreviewPhaseIdentity): boolean {
  return telemetry.hasSession(identity);
}

/**
 * Whether a visible paint has been recorded for this attach.
 *
 * Read at promotion time so `version_promoted.paint_observed_at_decision`
 * carries a measured value rather than a constant. Promotions with `false`
 * here are the standing evidence that paint does not gate promotion.
 */
export function previewAttachPaintObserved(identity: PreviewPhaseIdentity): boolean {
  return telemetry.paintObserved(identity);
}

/**
 * Associate a keep-alive pool cache key with the preview document it holds.
 *
 * The pool is generic: it evicts entries by key and knows nothing about
 * document versions. This registry is what lets a generic eviction become a
 * `cache_reclaimed` phase for the right document, and lets a non-preview entry
 * pass through without emitting anything.
 */
export function registerPreviewPoolKey(
  cacheKey: string,
  identity: PreviewPhaseIdentity,
): void {
  poolKeyDescriptors.delete(cacheKey);
  poolKeyDescriptors.set(cacheKey, {
    sessionId: identity.sessionId,
    documentVersion: identity.documentVersion,
  });
  while (poolKeyDescriptors.size > MAX_TRACKED_POOL_KEYS) {
    const oldest = poolKeyDescriptors.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    poolKeyDescriptors.delete(oldest);
  }
}

export function unregisterPreviewPoolKey(cacheKey: string): void {
  poolKeyDescriptors.delete(cacheKey);
}

export interface PreviewPoolReclaimInput {
  cacheKey: string;
  reason: PreviewPhaseReclaimReason;
  retainedMs: number;
  reuseCount: number;
  retainedEntryCount: number;
  evictedEntryCount: number;
}

export function reportPreviewPoolReclaim(input: PreviewPoolReclaimInput): void {
  const identity = poolKeyDescriptors.get(input.cacheKey);
  if (!identity) return;
  poolKeyDescriptors.delete(input.cacheKey);
  recordPreviewPhase(identity, 'cache_reclaimed', {
    reason: input.reason,
    retained_ms: input.retainedMs,
    reuse_count: input.reuseCount,
    retained_session_count: input.retainedEntryCount,
    evicted_session_count: input.evictedEntryCount,
  });
}

/** Test seam: drop all attach anchors and pool registrations. */
export function resetPreviewPhaseTelemetry(): void {
  telemetry.reset();
  poolKeyDescriptors.clear();
}

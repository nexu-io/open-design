import {
  PREVIEW_PHASE_EVENT_NAME,
  buildPreviewPhaseEventPayload,
  type PreviewPhase,
  type PreviewPhaseDetail,
  type PreviewPhaseEventPayload,
  type PreviewPhaseAttachInput,
  type PreviewPhaseNavigationTrigger,
  type PreviewPhaseOpenKind,
  type PreviewPhaseRenderMode,
  type PreviewPhaseRuntimeProtocol,
  type PreviewPhaseSandboxProfile,
  type PreviewPhaseSurface,
} from '@open-design/contracts/runtime/preview-phase-events';

/** Which document a phase record belongs to. */
export interface PreviewPhaseIdentity {
  sessionId: string;
  documentVersion: string;
}

/**
 * Identity plus the framing a dashboard needs to split cold from warm and
 * normal from powered without a join.
 *
 * Framing is supplied once, by whoever opens the attach, and is then fixed for
 * its lifetime. Downstream components that observe a phase know the document
 * but have no business deciding which surface it was opened on or whether the
 * open was cold — letting them re-supply it is how two components end up
 * labelling one attach two different ways.
 */
export interface PreviewPhaseSessionDescriptor extends PreviewPhaseIdentity {
  surface: PreviewPhaseSurface;
  renderMode: PreviewPhaseRenderMode;
  sandboxProfile: PreviewPhaseSandboxProfile;
  runtimeProtocol: PreviewPhaseRuntimeProtocol;
  openKind: PreviewPhaseOpenKind;
  deck: boolean;
}

export interface PreviewPhaseTelemetryRecord {
  eventName: typeof PREVIEW_PHASE_EVENT_NAME;
  payload: PreviewPhaseEventPayload;
}

export interface PreviewPhaseTelemetryOptions {
  /** Injectable clock. Defaults to `performance.now()` where available. */
  now?: () => number;
  /** Ceiling on concurrently tracked attaches; oldest is dropped first. */
  maxSessions?: number;
}

interface TrackedAttach {
  descriptor: PreviewPhaseSessionDescriptor;
  trigger: PreviewPhaseNavigationTrigger;
  didNavigate: boolean;
  attachIndex: number;
  anchoredAt: number;
  lastPhaseAt: number;
  sequence: number;
  paintObserved: boolean;
}

const DEFAULT_MAX_SESSIONS = 32;

function defaultNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function sessionKeyOf(descriptor: PreviewPhaseIdentity): string {
  // NUL separator, written as an escape: it cannot occur in either bounded
  // identity, so no pair of identities can collide into one key.
  return `${descriptor.sessionId}\u0000${descriptor.documentVersion}`;
}

/**
 * Accumulate preview phase timestamps and turn each phase advance into one
 * reportable payload.
 *
 * Deliberately free of React and of DOM globals: it holds only numbers, an
 * injectable clock, and the contract's payload builder, so it can be exercised
 * on a virtual clock and reasoned about without a browser. It does not report
 * anything itself — the caller decides whether and where to send the record.
 *
 * Two timing semantics, both anchored per *attach* rather than per document:
 *
 * - `elapsed_ms` runs from this attach's `navigation_start`, which is the cold
 *   time-to-visible measurement and, for a warm attach, the restore latency.
 * - `phase_duration_ms` runs from the previous recorded phase, which is what
 *   localizes a regression to handshake, capability arming, or promotion.
 *
 * A warm re-attach of an already-tracked document restarts the anchor and
 * increments `attach_index`. Carrying the cold anchor forward would make the
 * 100 ms warm-restore ratio unmeasurable, because every warm restore would
 * inherit the cold open's elapsed time.
 */
export class PreviewPhaseTelemetry {
  readonly #now: () => number;
  readonly #maxSessions: number;
  readonly #attaches = new Map<string, TrackedAttach>();
  readonly #attachCounts = new Map<string, number>();

  constructor(options: PreviewPhaseTelemetryOptions = {}) {
    this.#now = options.now ?? defaultNow;
    this.#maxSessions = Math.max(1, Math.floor(options.maxSessions ?? DEFAULT_MAX_SESSIONS));
  }

  /**
   * Open (or re-open) an attach window and emit its `navigation_start`.
   *
   * Fires for warm attaches too, with `did_navigate: false`. That is not
   * bookkeeping noise: the "non-content-update navigation ratio, target 0"
   * metric needs the attaches that correctly did not navigate in its
   * denominator, and the warm-restore metric needs their start anchor.
   */
  beginSession(
    descriptor: PreviewPhaseSessionDescriptor,
    attachInput: PreviewPhaseAttachInput,
  ): PreviewPhaseTelemetryRecord {
    const key = sessionKeyOf(descriptor);
    const at = this.#now();
    const attachIndex = this.#attachCounts.get(key) ?? 0;
    this.#attachCounts.set(key, attachIndex + 1);

    const { trigger, did_navigate: didNavigate, ...detail } = attachInput;
    const attach: TrackedAttach = {
      descriptor,
      trigger,
      didNavigate,
      attachIndex,
      anchoredAt: at,
      lastPhaseAt: at,
      sequence: 0,
      paintObserved: false,
    };
    this.#attaches.delete(key);
    this.#attaches.set(key, attach);
    this.#evictOverflow();

    return this.#build(attach, 'navigation_start', detail, at);
  }

  /**
   * Record one phase advance for an open attach.
   *
   * Returns `null` when no attach is open for this document. Failing closed is
   * intentional: a phase with no anchor has no meaningful elapsed time, and
   * inventing one would put fabricated latencies in the same series as real
   * ones.
   */
  recordPhase<P extends PreviewPhase>(
    identity: PreviewPhaseIdentity,
    phase: P,
    detail: PreviewPhaseDetail<P> | Readonly<Record<string, unknown>>,
  ): PreviewPhaseTelemetryRecord | null {
    const key = sessionKeyOf(identity);
    const attach = this.#attaches.get(key);
    if (!attach) return null;

    const at = this.#now();
    // Remember that a paint happened so a later promotion can report whether
    // one had been seen when it decided. Recording it is the only way the
    // paint-independence audit has real data; without it the audit panel
    // counts every promotion and proves nothing.
    if (phase === 'first_visible_paint') {
      attach.paintObserved ||= (detail as { paint_observed?: unknown }).paint_observed === true;
    }
    const record = this.#build(attach, phase, detail as Readonly<Record<string, unknown>>, at);

    // Reclaim is terminal for the attach: the retained document is gone, so a
    // later phase for it would be measuring a session that no longer exists.
    if (phase === 'cache_reclaimed') this.#attaches.delete(key);
    else this.#attaches.set(key, attach);

    return record;
  }

  /** Forget an attach without emitting anything (host teardown, navigation abort). */
  endSession(identity: PreviewPhaseIdentity): void {
    this.#attaches.delete(sessionKeyOf(identity));
  }

  hasSession(identity: PreviewPhaseIdentity): boolean {
    return this.#attaches.has(sessionKeyOf(identity));
  }

  /** Whether a visible paint has been recorded for this attach so far. */
  paintObserved(identity: PreviewPhaseIdentity): boolean {
    return this.#attaches.get(sessionKeyOf(identity))?.paintObserved ?? false;
  }

  activeSessionCount(): number {
    return this.#attaches.size;
  }

  /** Drop all tracked attaches; attach indices restart. */
  reset(): void {
    this.#attaches.clear();
    this.#attachCounts.clear();
  }

  #build(
    attach: TrackedAttach,
    phase: PreviewPhase,
    detail: Readonly<Record<string, unknown>>,
    at: number,
  ): PreviewPhaseTelemetryRecord {
    // `performance.now()` is monotonic, but an injected or wall clock is not, so
    // these differences can go negative. The floor is not applied twice: the
    // contract's numeric coercion owns it, and a second clamp here would be a
    // copy of an invariant that already has one enforcement point.
    const elapsedMs = at - attach.anchoredAt;
    const phaseDurationMs = at - attach.lastPhaseAt;
    attach.lastPhaseAt = at;
    const sequence = attach.sequence;
    attach.sequence += 1;

    const payload = buildPreviewPhaseEventPayload({
      phase,
      sessionId: attach.descriptor.sessionId,
      documentVersion: attach.descriptor.documentVersion,
      surface: attach.descriptor.surface,
      renderMode: attach.descriptor.renderMode,
      sandboxProfile: attach.descriptor.sandboxProfile,
      runtimeProtocol: attach.descriptor.runtimeProtocol,
      openKind: attach.descriptor.openKind,
      attachTrigger: attach.trigger,
      didNavigate: attach.didNavigate,
      deck: attach.descriptor.deck,
      attachIndex: attach.attachIndex,
      sequence,
      elapsedMs,
      phaseDurationMs,
      detail,
    });

    // `phase` is a compile-time member of the closed union, so the builder only
    // returns null for a value forged at runtime.
    if (!payload) throw new TypeError(`unknown preview phase: ${String(phase)}`);
    return { eventName: PREVIEW_PHASE_EVENT_NAME, payload };
  }

  #evictOverflow(): void {
    while (this.#attaches.size > this.#maxSessions) {
      const oldest = this.#attaches.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#attaches.delete(oldest);
    }
  }
}

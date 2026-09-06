import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from 'react';
import type {
  PreviewRuntimeCapability,
  PreviewRuntimeDocumentIdentity,
} from '@open-design/contracts/runtime/preview-runtime';
import type {
  PreviewPhasePromotionGate,
  PreviewPhasePromotionOutcome,
  PreviewPhaseRecoveryTrigger,
} from '@open-design/contracts/runtime/preview-phase-events';
import {
  previewAttachPaintObserved,
  recordPreviewPhase,
  registerPreviewPoolKey,
} from '../runtime/preview-phase-reporter';
import { OPEN_DESIGN_PREVIEW_NAVIGATION_ATTEMPT_PARAM } from '@open-design/host';
import {
  PreviewSession,
  type PreviewSessionDocument,
} from '../runtime/preview-session';
import {
  previewSessionFramePolicy,
  type PreviewSessionNavigation,
} from '../runtime/preview-session-navigation';
export type { PreviewSessionNavigation } from '../runtime/preview-session-navigation';
import type { PreviewRuntimeMessageTarget } from '../runtime/preview-runtime-controller';
import {
  iframeBrowsingContextWasPreservedOnLastAttach,
  PooledIframe,
  previewIframeKeepAliveKey,
  useIframeKeepAlivePool,
} from './IframeKeepAlivePool';

export interface PreviewSessionFramesProps extends Omit<
  ComponentPropsWithoutRef<'iframe'>,
  'src' | 'srcDoc' | 'onLoad' | 'ref' | 'sandbox' | 'allow'
> {
  projectId: string;
  fileName: string;
  navigation: PreviewSessionNavigation;
  enabledCapabilities?: readonly PreviewRuntimeCapability[];
  /** Receives interaction and host bridge traffic. */
  active: boolean;
  /** Remains painted during a cross-viewer handoff even when inactive. */
  presented?: boolean;
  /** Bump to replace an unpromoted standby browsing context at the same URL. */
  navigationRetryToken?: number;
  onCurrentFrameChange?: (frame: HTMLIFrameElement | null) => void;
  onStandbyFrameChange?: (frame: HTMLIFrameElement | null) => void;
  onStandbyReady?: (frame: HTMLIFrameElement) => void;
  onCapabilitiesApplied?: (
    frame: HTMLIFrameElement,
    capabilities: readonly PreviewRuntimeCapability[],
  ) => void;
  onPromoted?: (
    current: PreviewSessionNavigation,
    previous: PreviewSessionNavigation | null,
  ) => void;
  onStandbyTimedOut?: (
    failed: PreviewSessionNavigation,
    current: PreviewSessionNavigation | null,
  ) => void;
  onStandbyVersionChanged?: (
    failed: PreviewSessionNavigation,
    current: PreviewSessionNavigation | null,
    navigationAttempt: number,
  ) => void;
  standbyTimeoutMs?: number;
  /**
   * The owner's bounded retry budget for one document version. Used only to
   * distinguish a recovery attempt that will be retried from the last one.
   */
  recoveryAttemptBudget?: number;
}

interface RenderedPreviewDocument extends Omit<PreviewSessionNavigation, 'runtimeProtocol'> {
  runtimeProtocol: 'universal';
  frame: HTMLIFrameElement;
  target: PreviewRuntimeMessageTarget;
  navigationAttempt: number;
}

const EMPTY_CAPABILITIES: readonly PreviewRuntimeCapability[] = [];
/**
 * How many navigation attempts the owner of this component is willing to spend
 * on one document version before it stops retrying.
 *
 * This component does not retry — the owner bumps `navigationRetryToken` — so
 * this is a statement about the owner's contract, not this component's
 * behavior. It exists because `recovery_attempted.outcome = 'exhausted'` is
 * the numerator of the recovery-exhaustion metric, and only a known bound can
 * tell a retry that will be followed by another from the last one. An owner
 * with a different bound must pass `recoveryAttemptBudget`.
 */
export const PREVIEW_SESSION_RECOVERY_ATTEMPT_BUDGET = 3;

interface PromotionGateState {
  runtimeIdentity: boolean;
  capabilities: boolean;
  domReady: boolean;
  presentationState: boolean;
}

/**
 * Name the first gate that was not met, in the order the gate is evaluated.
 *
 * The four gates are exact runtime identity, capability acknowledgement, DOM
 * ready, and presentation-state acknowledgement. First visible paint is not
 * among them and must never be added: it is observation, and a valid blank or
 * broken authored page must still be promotable.
 */
function firstBlockedGate(gates: PromotionGateState): PreviewPhasePromotionGate {
  if (!gates.runtimeIdentity) return 'runtime_identity';
  if (!gates.capabilities) return 'capabilities';
  if (!gates.domReady) return 'dom_ready';
  if (!gates.presentationState) return 'presentation_state';
  return 'none';
}

/** Per-attempt telemetry state; one entry per staged standby attempt. */
interface StandbyAttemptTelemetry {
  stagedAt: number;
  helloAt: number | null;
  availableCapabilityCount: number;
  previousFrame: HTMLIFrameElement | null;
  hadPreviousVersion: boolean;
  settled: boolean;
}

/**
 * Report the terminal outcome of one standby attempt.
 *
 * Every path out of a staged standby comes through here — promotion, refusal,
 * and timeout alike. That is deliberate: if only the promotion path reported,
 * the promotion-success metric would have no denominator and would read 100%
 * forever, and the last-good retention rate would have no negative rows.
 *
 * Emits at most one `version_promoted` and one `last_good_retained` per
 * attempt, plus a `recovery_attempted` row when this attempt is part of a
 * bounded retry.
 */
function reportStandbyAttemptSettled(input: {
  identity: PreviewRuntimeDocumentIdentity;
  telemetry: StandbyAttemptTelemetry | undefined;
  outcome: PreviewPhasePromotionOutcome;
  gates: PromotionGateState;
  /** Overrides the derived gate when the failure names one directly. */
  blockedGate?: PreviewPhasePromotionGate;
  attempt: number;
  recoveryBudget: number;
  recoveryTrigger: PreviewPhaseRecoveryTrigger | null;
  presented: boolean;
  now: number;
}): void {
  const { telemetry, identity } = input;
  if (telemetry?.settled) return;
  if (telemetry) telemetry.settled = true;

  recordPreviewPhase(identity, 'version_promoted', {
    outcome: input.outcome,
    gate_runtime_identity: input.gates.runtimeIdentity,
    gate_capabilities: input.gates.capabilities,
    gate_dom_ready: input.gates.domReady,
    gate_presentation_state: input.gates.presentationState,
    blocked_gate: input.blockedGate ?? firstBlockedGate(input.gates),
    attempt: input.attempt,
    paint_observed_at_decision: previewAttachPaintObserved(identity),
  });

  const previousFrame = telemetry?.previousFrame ?? null;
  const retained = previousFrame !== null && previousFrame.isConnected;
  recordPreviewPhase(identity, 'last_good_retained', {
    retained,
    reason: !telemetry?.hadPreviousVersion
      ? 'no_previous_version'
      : retained
        ? (input.outcome === 'promoted' ? 'released_after_promotion' : 'recovery_in_flight')
        : 'previous_evicted',
    retained_ms: telemetry ? Math.max(0, input.now - telemetry.stagedAt) : 0,
    previous_version_exposed: retained && input.presented,
  });

  const isRetry = input.attempt > 1;
  if (input.outcome === 'promoted') {
    // A first attempt that simply worked is not a recovery. Only a promotion
    // that followed at least one failed attempt closes a recovery loop.
    if (!isRetry) return;
    recordPreviewPhase(identity, 'recovery_attempted', {
      ...(input.recoveryTrigger ? { trigger: input.recoveryTrigger } : {}),
      attempt: input.attempt,
      max_attempts: input.recoveryBudget,
      outcome: 'recovered',
      navigation_token_scoped: true,
    });
    return;
  }
  if (!input.recoveryTrigger) return;
  recordPreviewPhase(identity, 'recovery_attempted', {
    trigger: input.recoveryTrigger,
    attempt: input.attempt,
    max_attempts: input.recoveryBudget,
    outcome: input.attempt >= input.recoveryBudget ? 'exhausted' : 'retrying',
    navigation_token_scoped: true,
  });
}
// This bounds a broken Runtime handshake. It is not a visual-content timeout:
// authored blank/error output remains a valid current version once the exact
// Runtime and presentation-state protocol has settled.
export const PREVIEW_SESSION_STANDBY_TIMEOUT_MS = 5_000;

function identityKey(identity: PreviewRuntimeDocumentIdentity): string {
  return `${identity.sessionId}\0${identity.documentVersion}`;
}

function sameIdentity(
  left: PreviewRuntimeDocumentIdentity | null,
  right: PreviewRuntimeDocumentIdentity,
): boolean {
  return left !== null && identityKey(left) === identityKey(right);
}

function documentKeepAliveKey(
  projectId: string,
  fileName: string,
  identity: PreviewRuntimeDocumentIdentity,
  navigationAttempt: number,
): string {
  return `${previewIframeKeepAliveKey(projectId, fileName)}\0${identityKey(identity)}\0attempt:${navigationAttempt}`;
}

export function previewSessionNavigationAttemptUrl(
  navigation: PreviewSessionNavigation,
  navigationAttempt: number,
): string {
  if (navigation.runtimeProtocol !== 'universal') return navigation.url;
  const url = new URL(navigation.url);
  url.searchParams.set(
    OPEN_DESIGN_PREVIEW_NAVIGATION_ATTEMPT_PARAM,
    `${navigation.sessionId}.${navigationAttempt}`,
  );
  return url.href;
}

/**
 * Retain one same-file real-URL iframe while an exact new document version
 * settles in a transparent, inert standby iframe. The component never assigns
 * about:blank and never mutates the URL of an existing browsing context.
 *
 * FileViewer uses this as its only settled-file document transport. Version
 * replacement may briefly stage one transparent candidate beside last-good,
 * but there is never a parallel srcdoc/Blob runtime.
 */
export function PreviewSessionFrames({
  projectId,
  fileName,
  ...props
}: PreviewSessionFramesProps) {
  if (props.navigation.runtimeProtocol === 'legacy-url') {
    return (
      <LegacyPreviewSessionFramesForFile
        key={`${projectId}\0${fileName}`}
        projectId={projectId}
        fileName={fileName}
        {...props}
      />
    );
  }
  return (
    <PreviewSessionFramesForFile
      key={`${projectId}\0${fileName}`}
      projectId={projectId}
      fileName={fileName}
      {...props}
    />
  );
}

interface LegacyRenderedPreviewDocument {
  navigation: PreviewSessionNavigation;
  navigationAttempt: number;
  frame: HTMLIFrameElement;
}

const legacyExpectedSettlement = new WeakMap<HTMLIFrameElement, string>();
const legacySettledFrames = new WeakMap<HTMLIFrameElement, string>();
const legacyObservedFrames = new WeakSet<HTMLIFrameElement>();

function legacySettledMarker(
  cacheKey: string,
  navigation: PreviewSessionNavigation,
): string {
  const policy = previewSessionFramePolicy(navigation.sandboxProfile);
  return JSON.stringify([
    cacheKey,
    navigation.url,
    navigation.runtimeProtocol,
    navigation.sandboxProfile,
    navigation.deck,
    policy.sandbox,
    policy.allow ?? null,
  ]);
}

function observeLegacyFrameLoad(frame: HTMLIFrameElement, marker: string): void {
  legacyExpectedSettlement.set(frame, marker);
  if (legacyObservedFrames.has(frame)) return;
  legacyObservedFrames.add(frame);
  // This listener intentionally outlives the React owner while the pool parks
  // the frame. A real navigation can finish off-screen, and Chromium does not
  // replay `load` when moveBefore() later reattaches that browsing context.
  frame.addEventListener('load', () => {
    const expected = legacyExpectedSettlement.get(frame);
    if (expected) legacySettledFrames.set(frame, expected);
  });
}

/**
 * Rolling-upgrade adapter for daemons that predate the universal Preview
 * Runtime. It still renders exactly one real-URL document transport. Because
 * the old document has no runtime handshake, browser load is the strongest
 * available promotion signal; interactive capabilities remain unavailable
 * instead of falling back to srcdoc/Blob.
 */
function LegacyPreviewSessionFramesForFile({
  projectId,
  fileName,
  navigation,
  enabledCapabilities = EMPTY_CAPABILITIES,
  active,
  presented = active,
  navigationRetryToken = 0,
  onCurrentFrameChange,
  onStandbyFrameChange,
  onPromoted,
  title = fileName,
  ...iframeProps
}: PreviewSessionFramesProps) {
  const pool = useIframeKeepAlivePool();
  const [current, setCurrent] = useState<LegacyRenderedPreviewDocument | null>(null);
  const requestedIsCurrent = current !== null
    && sameIdentity(current.navigation, navigation)
    && current.navigation.url === navigation.url
    && current.navigationAttempt === navigationRetryToken;
  const standby = requestedIsCurrent ? null : navigation;
  const standbyCacheKey = standby
    ? documentKeepAliveKey(projectId, fileName, standby, navigationRetryToken)
    : null;
  const standbySettledMarker = standby && standbyCacheKey
    ? legacySettledMarker(standbyCacheKey, standby)
    : null;

  useEffect(() => {
    onCurrentFrameChange?.(active ? current?.frame ?? null : null);
  }, [active, current, onCurrentFrameChange]);

  useEffect(() => () => {
    onCurrentFrameChange?.(null);
    onStandbyFrameChange?.(null);
  }, [onCurrentFrameChange, onStandbyFrameChange]);

  const promote = useCallback((frame: HTMLIFrameElement) => {
    if (!standby) return;
    if (standbySettledMarker) {
      legacySettledFrames.set(frame, standbySettledMarker);
    }
    const previous = current;
    setCurrent({
      navigation: standby,
      navigationAttempt: navigationRetryToken,
      frame,
    });
    onPromoted?.(standby, previous?.navigation ?? null);
    if (previous) {
      pool.evict(documentKeepAliveKey(
        projectId,
        fileName,
        previous.navigation,
        previous.navigationAttempt,
      ));
    }
  }, [
    current,
    fileName,
    navigationRetryToken,
    onPromoted,
    pool,
    projectId,
    standby,
    standbySettledMarker,
  ]);

  const stageLegacyFrame = useCallback((frame: HTMLIFrameElement | null) => {
    onStandbyFrameChange?.(frame);
    if (!frame || !standbySettledMarker) return;
    observeLegacyFrameLoad(frame, standbySettledMarker);
    if (
      iframeBrowsingContextWasPreservedOnLastAttach(frame)
      && legacySettledFrames.get(frame) === standbySettledMarker
    ) {
      promote(frame);
    }
  }, [onStandbyFrameChange, promote, standbySettledMarker]);

  const commonProps = {
    ...iframeProps,
    title,
    'data-od-render-mode': 'runtime-url',
    'data-od-runtime-protocol': 'legacy-url',
    'data-od-capabilities': enabledCapabilities.length > 0 ? 'unavailable' : 'none-requested',
  };

  return (
    <>
      {current ? (
        <PooledIframe
          key={documentKeepAliveKey(
            projectId,
            fileName,
            current.navigation,
            current.navigationAttempt,
          )}
          {...commonProps}
          cacheKey={documentKeepAliveKey(
            projectId,
            fileName,
            current.navigation,
            current.navigationAttempt,
          )}
          src={current.navigation.url}
          sandbox={previewSessionFramePolicy(current.navigation.sandboxProfile).sandbox}
          allow={previewSessionFramePolicy(current.navigation.sandboxProfile).allow}
          data-testid="preview-runtime-frame-current"
          data-od-active={presented ? 'true' : 'false'}
          aria-hidden={presented ? undefined : 'true'}
          tabIndex={active && presented ? 0 : -1}
        />
      ) : null}
      {standby ? (
        <PooledIframe
          key={standbyCacheKey!}
          {...commonProps}
          ref={stageLegacyFrame}
          cacheKey={standbyCacheKey!}
          src={standby.url}
          sandbox={previewSessionFramePolicy(standby.sandboxProfile).sandbox}
          allow={previewSessionFramePolicy(standby.sandboxProfile).allow}
          data-testid="preview-runtime-frame-standby"
          data-od-active="false"
          data-od-standby="true"
          aria-hidden="true"
          tabIndex={-1}
          onLoad={(event) => promote(event.currentTarget)}
        />
      ) : null}
    </>
  );
}

function PreviewSessionFramesForFile({
  projectId,
  fileName,
  navigation,
  enabledCapabilities = EMPTY_CAPABILITIES,
  active,
  presented = active,
  navigationRetryToken = 0,
  onCurrentFrameChange,
  onStandbyFrameChange,
  onStandbyReady,
  onCapabilitiesApplied,
  onPromoted,
  onStandbyTimedOut,
  onStandbyVersionChanged,
  standbyTimeoutMs = PREVIEW_SESSION_STANDBY_TIMEOUT_MS,
  recoveryAttemptBudget = PREVIEW_SESSION_RECOVERY_ATTEMPT_BUDGET,
  title = fileName,
  ...iframeProps
}: PreviewSessionFramesProps) {
  const pool = useIframeKeepAlivePool();
  const callbacksRef = useRef({
    onCurrentFrameChange,
    onStandbyFrameChange,
    onStandbyReady,
    onCapabilitiesApplied,
    onPromoted,
    onStandbyTimedOut,
    onStandbyVersionChanged,
  });
  const frameByTargetRef = useRef(new Map<PreviewRuntimeMessageTarget, HTMLIFrameElement>());
  const attemptByTargetRef = useRef(new Map<PreviewRuntimeMessageTarget, number>());
  const standbyTargetRef = useRef<PreviewRuntimeMessageTarget | null>(null);
  const attemptTelemetryRef = useRef(new Map<string, StandbyAttemptTelemetry>());
  const lastRecoveryTriggerRef = useRef<PreviewPhaseRecoveryTrigger | null>(null);
  const presentedRef = useRef(presented);
  presentedRef.current = presented;
  const recoveryBudgetRef = useRef(recoveryAttemptBudget);
  recoveryBudgetRef.current = recoveryAttemptBudget;
  callbacksRef.current = {
    onCurrentFrameChange,
    onStandbyFrameChange,
    onStandbyReady,
    onCapabilitiesApplied,
    onPromoted,
    onStandbyTimedOut,
    onStandbyVersionChanged,
  };
  const [current, setCurrent] = useState<RenderedPreviewDocument | null>(null);
  const [standbyFrame, setStandbyFrame] = useState<HTMLIFrameElement | null>(null);
  const [failedAttemptKey, setFailedAttemptKey] = useState<string | null>(null);
  const currentRef = useRef<RenderedPreviewDocument | null>(current);
  const failedAttemptKeyRef = useRef<string | null>(failedAttemptKey);
  currentRef.current = current;
  failedAttemptKeyRef.current = failedAttemptKey;
  const stalePoolKeysRef = useRef<string[]>([]);

  const session = useMemo(() => new PreviewSession({
    callbacks: {
      onStandbyReady(document) {
        const frame = frameByTargetRef.current.get(document.target);
        if (frame) callbacksRef.current.onStandbyReady?.(frame);
      },
      onCapabilitiesApplied(document, capabilities) {
        const frame = frameByTargetRef.current.get(document.target);
        if (frame) callbacksRef.current.onCapabilitiesApplied?.(frame, capabilities);
        recordPreviewPhase(document, 'capabilities_applied', {
          outcome: 'applied',
          enabled_capabilities: capabilities,
          enabled_capability_count: capabilities.length,
          // A set applied to the already-current document is a live toggle; a
          // set applied to a standby is part of bringing a document up, and
          // whether a previous version exists is what separates the two.
          change_reason: currentRef.current?.target === document.target
            ? 'user_toggle'
            : currentRef.current
              ? 'document_replace'
              : 'initial',
        });
      },
      onPromoted(document, previous) {
        const frame = frameByTargetRef.current.get(document.target);
        const navigationAttempt = attemptByTargetRef.current.get(document.target);
        if (!frame || navigationAttempt === undefined) return;
        const next = { ...document, frame, navigationAttempt };
        const attemptKey = `${identityKey(document)}\0retry:${navigationAttempt}`;
        reportStandbyAttemptSettled({
          identity: document,
          telemetry: attemptTelemetryRef.current.get(attemptKey),
          outcome: 'promoted',
          gates: {
            runtimeIdentity: true,
            capabilities: true,
            domReady: true,
            presentationState: true,
          },
          attempt: navigationAttempt + 1,
          recoveryBudget: recoveryBudgetRef.current,
          recoveryTrigger: lastRecoveryTriggerRef.current,
          presented: presentedRef.current,
          now: Date.now(),
        });
        attemptTelemetryRef.current.delete(attemptKey);
        setCurrent(next);
        callbacksRef.current.onPromoted?.(
          navigationOf(document),
          previous ? navigationOf(previous) : null,
        );
        if (previous) {
          const previousAttempt = attemptByTargetRef.current.get(previous.target);
          if (previousAttempt !== undefined) {
            stalePoolKeysRef.current.push(
              documentKeepAliveKey(projectId, fileName, previous, previousAttempt),
            );
          }
        }
      },
      onStandbyNavigationFailed(document, failure) {
        if (failure.reason !== 'version_changed') return;
        const frame = frameByTargetRef.current.get(document.target);
        const expectedAttempt = attemptByTargetRef.current.get(document.target);
        if (!frame || expectedAttempt === undefined) return;
        if (failure.navigationAttempt !== expectedAttempt) return;
        const failureKey = `${identityKey(document)}\0retry:${expectedAttempt}`;
        if (failedAttemptKeyRef.current === failureKey) return;
        failedAttemptKeyRef.current = failureKey;
        reportStandbyAttemptSettled({
          identity: document,
          telemetry: attemptTelemetryRef.current.get(failureKey),
          outcome: 'failed',
          gates: {
            // The daemon refused to serve this exact version, so the identity
            // the host asked for does not exist. A hello from whatever was
            // previously in this browsing context does not make it exist.
            runtimeIdentity: false,
            capabilities: false,
            domReady: false,
            presentationState: false,
          },
          blockedGate: 'runtime_identity',
          attempt: expectedAttempt + 1,
          recoveryBudget: recoveryBudgetRef.current,
          recoveryTrigger: 'navigation_failed',
          presented: presentedRef.current,
          now: Date.now(),
        });
        attemptTelemetryRef.current.delete(failureKey);
        lastRecoveryTriggerRef.current = 'navigation_failed';
        session.discardStandby(document);
        setFailedAttemptKey(failureKey);
        callbacksRef.current.onStandbyVersionChanged?.(
          navigationOf(document),
          currentRef.current ? navigationOf(currentRef.current) : null,
          expectedAttempt,
        );
        pool.evictFrame(frame);
      },
    },
  }), [fileName, pool, projectId]);

  useEffect(() => {
    session.setEnabledCapabilities(enabledCapabilities);
  }, [enabledCapabilities, session]);

  useEffect(() => {
    session.setSuspended(!active);
    callbacksRef.current.onCurrentFrameChange?.(active ? current?.frame ?? null : null);
  }, [active, current, session]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = session.handleMessage(event);
      if (!message || message.type !== 'od:preview:hello') return;
      const attempt = attemptByTargetRef.current.get(
        event.source as PreviewRuntimeMessageTarget,
      );
      if (attempt === undefined) return;
      const entry = attemptTelemetryRef.current.get(
        `${identityKey(message)}\0retry:${attempt}`,
      );
      // Only the first hello of an attempt is the handshake; the bootstrap
      // answers probes idempotently and will say hello again.
      if (!entry || entry.helloAt !== null) return;
      entry.helloAt = Date.now();
      entry.availableCapabilityCount = message.availableCapabilities.length;
      recordPreviewPhase(message, 'bootstrap_handshake', {
        outcome: 'acknowledged',
        protocol_version: message.protocolVersion,
        available_capability_count: message.availableCapabilities.length,
      });
    };
    window.addEventListener('message', handleMessage);
    // A cached scoped URL can execute the bootstrap during the child iframe's
    // layout effects, before this passive host listener exists. The bootstrap
    // answers probes idempotently, so repeat it only after the receive path is
    // live instead of relying on navigation timing.
    session.probe();
    return () => window.removeEventListener('message', handleMessage);
  }, [session]);

  useEffect(() => {
    for (const key of stalePoolKeysRef.current.splice(0)) pool.evict(key);
  });

  useEffect(() => () => {
    callbacksRef.current.onCurrentFrameChange?.(null);
  }, []);

  const requestedIsCurrent =
    sameIdentity(current, navigation)
    && current?.navigationAttempt === navigationRetryToken;
  const requestedStandby = requestedIsCurrent ? null : navigation;
  const standbyAttemptKey = requestedStandby
    ? `${identityKey(requestedStandby)}\0retry:${navigationRetryToken}`
    : null;
  const standby = standbyAttemptKey !== null && failedAttemptKey === standbyAttemptKey
    ? null
    : requestedStandby;
  useEffect(() => {
    if (
      !active
      || !standby
      || !standbyFrame
      || standbyTimeoutMs <= 0
      || standbyAttemptKey === null
    ) return undefined;
    const timeout = window.setTimeout(() => {
      // Snapshot before discardStandby() clears the standby gate state; the
      // whole point of this row is naming which gate was still open.
      const snapshot = session.snapshot();
      const entry = attemptTelemetryRef.current.get(standbyAttemptKey);
      if (entry && entry.helloAt === null) {
        recordPreviewPhase(standby, 'bootstrap_handshake', { outcome: 'timeout' });
      }
      reportStandbyAttemptSettled({
        identity: standby,
        telemetry: entry,
        outcome: 'abandoned',
        gates: {
          runtimeIdentity: entry?.helloAt !== null && entry !== undefined,
          capabilities: snapshot.standbyCapabilitiesApplied,
          domReady: snapshot.standbyReady,
          presentationState: snapshot.standbyPresentationStateApplied,
        },
        attempt: navigationRetryToken + 1,
        recoveryBudget: recoveryBudgetRef.current,
        recoveryTrigger: 'handshake_timeout',
        presented: presentedRef.current,
        now: Date.now(),
      });
      attemptTelemetryRef.current.delete(standbyAttemptKey);
      lastRecoveryTriggerRef.current = 'handshake_timeout';
      session.discardStandby(standby);
      setFailedAttemptKey(standbyAttemptKey);
      callbacksRef.current.onStandbyTimedOut?.(
        standby,
        current ? navigationOf(current) : null,
      );
      pool.evictFrame(standbyFrame);
    }, standbyTimeoutMs);
    return () => window.clearTimeout(timeout);
  }, [
    active,
    current,
    navigationRetryToken,
    pool,
    session,
    standby,
    standbyAttemptKey,
    standbyFrame,
    standbyTimeoutMs,
  ]);

  const stageFrame = useCallback((frame: HTMLIFrameElement | null) => {
    setStandbyFrame(frame);
    if (!frame) {
      const previousTarget = standbyTargetRef.current;
      if (previousTarget) {
        frameByTargetRef.current.delete(previousTarget);
        attemptByTargetRef.current.delete(previousTarget);
      }
      standbyTargetRef.current = null;
      if (standby) session.discardStandby(standby);
      callbacksRef.current.onStandbyFrameChange?.(null);
      return;
    }
    if (!standby) return;
    const target = frame.contentWindow;
    if (!target) return;
    standbyTargetRef.current = target;
    frameByTargetRef.current.set(target, frame);
    attemptByTargetRef.current.set(target, navigationRetryToken);
    const attemptKey = `${identityKey(standby)}\0retry:${navigationRetryToken}`;
    if (!attemptTelemetryRef.current.has(attemptKey)) {
      const previous = currentRef.current;
      attemptTelemetryRef.current.set(attemptKey, {
        stagedAt: Date.now(),
        helloAt: null,
        availableCapabilityCount: 0,
        // Captured now, while the previous version is still the one on screen.
        // Whether that frame is still connected when this attempt settles is
        // exactly what `last_good_retained` reports.
        previousFrame: previous?.frame ?? null,
        hadPreviousVersion: previous !== null,
        settled: false,
      });
    }
    registerPreviewPoolKey(
      documentKeepAliveKey(projectId, fileName, standby, navigationRetryToken),
      standby,
    );
    session.stageDocument({ ...standby, runtimeProtocol: 'universal', target });
    callbacksRef.current.onStandbyFrameChange?.(frame);
  }, [fileName, navigationRetryToken, projectId, session, standby]);

  const retainCurrentFrame = useCallback((frame: HTMLIFrameElement | null) => {
    if (!current) return;
    if (!frame) {
      frameByTargetRef.current.delete(current.target);
      attemptByTargetRef.current.delete(current.target);
      return;
    }
    frameByTargetRef.current.set(current.target, frame);
    registerPreviewPoolKey(
      documentKeepAliveKey(projectId, fileName, current, current.navigationAttempt),
      current,
    );
    // Promotion reuses the same pooled iframe component but swaps its ref
    // from stageFrame to retainCurrentFrame. stageFrame(null) deliberately
    // clears the standby bookkeeping during that handoff, so restore the
    // attempt associated with the now-current message target here.
    attemptByTargetRef.current.set(current.target, current.navigationAttempt);
  }, [current, fileName, projectId]);

  const commonProps = {
    ...iframeProps,
    title,
    'data-od-render-mode': 'runtime-url',
    'data-od-runtime-protocol': 'universal',
    'data-od-session-id': navigation.sessionId,
    'data-od-document-version': navigation.documentVersion,
  };

  return (
    <>
      {current ? (
        <PooledIframe
          key={documentKeepAliveKey(
            projectId,
            fileName,
            current,
            current.navigationAttempt,
          )}
          {...commonProps}
          ref={retainCurrentFrame}
          cacheKey={documentKeepAliveKey(
            projectId,
            fileName,
            current,
            current.navigationAttempt,
          )}
          src={previewSessionNavigationAttemptUrl(current, current.navigationAttempt)}
          sandbox={previewSessionFramePolicy(current.sandboxProfile).sandbox}
          allow={previewSessionFramePolicy(current.sandboxProfile).allow}
          data-od-powered={
            previewSessionFramePolicy(current.sandboxProfile).powered ? 'true' : undefined
          }
          data-testid="preview-runtime-frame-current"
          data-od-active={presented ? 'true' : 'false'}
          aria-hidden={presented ? undefined : 'true'}
          tabIndex={active && presented ? 0 : -1}
        />
      ) : null}
      {standby ? (
        <PooledIframe
          key={documentKeepAliveKey(projectId, fileName, standby, navigationRetryToken)}
          {...commonProps}
          ref={stageFrame}
          cacheKey={documentKeepAliveKey(projectId, fileName, standby, navigationRetryToken)}
          src={previewSessionNavigationAttemptUrl(standby, navigationRetryToken)}
          sandbox={previewSessionFramePolicy(standby.sandboxProfile).sandbox}
          allow={previewSessionFramePolicy(standby.sandboxProfile).allow}
          data-od-powered={
            previewSessionFramePolicy(standby.sandboxProfile).powered ? 'true' : undefined
          }
          data-testid="preview-runtime-frame-standby"
          data-od-active="false"
          data-od-standby="true"
          aria-hidden="true"
          tabIndex={-1}
        />
      ) : null}
    </>
  );
}

function navigationOf(document: PreviewSessionDocument): PreviewSessionNavigation {
  return {
    sessionId: document.sessionId,
    documentVersion: document.documentVersion,
    url: document.url,
    runtimeProtocol: document.runtimeProtocol,
    sandboxProfile: document.sandboxProfile,
    deck: document.deck,
  };
}

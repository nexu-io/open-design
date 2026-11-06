import type { Composition, GsapTweenSpec } from "@hyperframes/sdk";
import type { DomEditSelection } from "../components/editor/domEditing";
import type { PatchOperation } from "./sourcePatcher";
import * as studioAvailability from "../components/editor/manualEditingAvailability";
import { trackStudioEvent } from "./studioTelemetry";
import { patchOpsToSdkEditOps } from "./sdkOpMapping";
import { recordResolverParity, recordAnimationResolverParity } from "./sdkResolverShadow";
import {
  isResolverDisagreement,
  sdkCutoverIneligibleReason,
  shouldDeclineTextCutoverForTarget,
} from "./sdkCutoverEligibility";
import {
  declinedCutover,
  failedCutover,
  persistSdkCandidateMutation,
  type CutoverDeps,
  type CutoverOptions,
  type CutoverResult,
} from "./sdkEditTransaction";
import { isSdkFamilyEnabled, type StudioSdkOperationFamily } from "./sdkCutoverPolicy";

export { shouldUseSdkCutover } from "./sdkCutoverEligibility";
export {
  cutoverCommittedOrThrow,
  persistSdkCandidateMutation,
  persistSdkSerialize,
} from "./sdkEditTransaction";
export type {
  CutoverDeps,
  CutoverOptions,
  CutoverResult,
  PublishSdkSession,
} from "./sdkEditTransaction";
function sdkFamilyEnabled(family: StudioSdkOperationFamily): boolean {
  const configured = Object.prototype.hasOwnProperty.call(
    studioAvailability,
    "STUDIO_SDK_CUTOVER_FAMILIES",
  )
    ? studioAvailability.STUDIO_SDK_CUTOVER_FAMILIES
    : undefined;
  return isSdkFamilyEnabled(studioAvailability.STUDIO_SDK_CUTOVER_ENABLED, configured, family);
}

function trackCutoverResult(
  result: CutoverResult,
  family: StudioSdkOperationFamily,
  context: { hfId?: string | null; opCount: number },
): void {
  if (result.status === "committed") {
    trackStudioEvent("sdk_cutover_success", { ...context, family });
  } else if (result.status === "failed") {
    failedCutover(result.error, family, context);
  }
}
/** True when targetPath isn't the composition the SDK session models. */
function wrongCompositionFile(deps: CutoverDeps, targetPath: string): boolean {
  return deps.compositionPath != null && targetPath !== deps.compositionPath;
}

/**
 * Reader for the animation-resolver tripwire's disk-truth check: on an
 * animationId miss it re-parses the CURRENT file to distinguish a stale
 * session (panel ids re-derive from disk every render; session ids date from
 * the last reload) from a genuine resolver divergence.
 */
function gsapReadSource(
  deps: CutoverDeps,
  targetPath: string,
): (() => Promise<string | undefined>) | undefined {
  const read = deps.readProjectFile;
  return read ? () => read(targetPath) : undefined;
}
export async function sdkCutoverPersist(
  selection: DomEditSelection,
  ops: PatchOperation[],
  originalContent: string,
  targetPath: string,
  sdkSession: Composition | null | undefined,
  deps: CutoverDeps,
  options?: CutoverOptions,
): Promise<CutoverResult> {
  // Name WHICH eligibility check failed: on v0.8.47 this one string covered 26 of
  // 30 dom declines. The two below aren't properties of the batch, so they differ.
  if (!sdkFamilyEnabled("dom")) return declinedCutover("feature_disabled", "dom");
  if (!sdkSession) return declinedCutover("session_unavailable", "dom");
  const hfId = selection.hfId;
  const ineligible = sdkCutoverIneligibleReason(hfId, ops);
  // `!hfId` is already a reason; testing it again narrows the type for the rest.
  if (ineligible || !hfId) return declinedCutover(ineligible ?? "target_unaddressable", "dom");
  const target = sdkSession.getElement(hfId);
  if (!target)
    return declinedCutover("target_not_found", "dom", isResolverDisagreement(sdkSession, hfId));
  if (shouldDeclineTextCutoverForTarget(target, ops))
    return declinedCutover("unsupported_text_target", "dom");
  if (wrongCompositionFile(deps, targetPath))
    return declinedCutover("wrong_composition_file", "dom");
  const result = await persistSdkCandidateMutation(
    sdkSession,
    targetPath,
    originalContent,
    deps,
    (session) => {
      for (const editOp of patchOpsToSdkEditOps(hfId, ops)) session.dispatch(editOp);
    },
    {
      ...options,
      targets: [
        {
          file: targetPath,
          hfId,
          ...(selection.id && { id: selection.id }),
          ...(selection.selector && { selector: selection.selector }),
          ...(selection.selectorIndex !== undefined && { selectorIndex: selection.selectorIndex }),
        },
      ],
    },
  );
  trackCutoverResult(result, "dom", { hfId, opCount: ops.length });
  return result;
}

export async function sdkTimingPersist(
  hfId: string,
  targetPath: string,
  timingUpdate: { start?: number; duration?: number; trackIndex?: number },
  sdkSession: Composition | null | undefined,
  deps: CutoverDeps,
  options?: CutoverOptions,
): Promise<CutoverResult> {
  // Resolver tripwire — runs BEFORE the cutover gate (decoupled): records when
  // the SDK can't resolve a target the server timing path is addressing.
  const timingSrc = deps.readProjectFile;
  void recordResolverParity(
    sdkSession,
    hfId,
    "setTiming",
    timingSrc ? () => timingSrc(targetPath) : undefined,
    { targetPath, compositionPath: deps.compositionPath },
  );
  // Dark-launch gate: without this, timing cutover runs whenever an SDK session
  // exists (it always does, for shadow/selection) — flipping the flag OFF would
  // NOT disable it. Gate here so flag-off routes back to the legacy server path.
  if (!sdkFamilyEnabled("timing")) return declinedCutover("feature_disabled", "timing");
  if (!sdkSession) return declinedCutover("session_unavailable", "timing");
  if (!sdkSession.getElement(hfId))
    return declinedCutover("target_not_found", "timing", isResolverDisagreement(sdkSession, hfId));
  if (wrongCompositionFile(deps, targetPath))
    return declinedCutover("wrong_composition_file", "timing");
  try {
    const serializedBefore = sdkSession.serialize();
    const result = await persistSdkCandidateMutation(
      sdkSession,
      targetPath,
      serializedBefore,
      deps,
      (session) => session.setTiming(hfId, timingUpdate),
      options,
      serializedBefore,
    );
    trackCutoverResult(result, "timing", { hfId, opCount: 1 });
    return result;
  } catch (error) {
    return failedCutover(error, "timing", { hfId, opCount: 1 });
  }
}
export async function sdkTimingBatchPersist(
  changes: Array<{
    hfId: string;
    timingUpdate: { start?: number; duration?: number; trackIndex?: number };
  }>,
  targetPath: string,
  sdkSession: Composition | null | undefined,
  deps: CutoverDeps,
  options?: CutoverOptions,
): Promise<CutoverResult> {
  const timingSrc = deps.readProjectFile;
  for (const change of changes) {
    void recordResolverParity(
      sdkSession,
      change.hfId,
      "setTiming",
      timingSrc ? () => timingSrc(targetPath) : undefined,
      { targetPath, compositionPath: deps.compositionPath },
    );
  }
  if (!sdkFamilyEnabled("timing")) return declinedCutover("feature_disabled", "timing");
  if (!sdkSession) return declinedCutover("session_unavailable", "timing");
  if (wrongCompositionFile(deps, targetPath))
    return declinedCutover("wrong_composition_file", "timing");
  const unresolved = changes.find((change) => !sdkSession.getElement(change.hfId));
  if (unresolved)
    return declinedCutover(
      "target_not_found",
      "timing",
      isResolverDisagreement(sdkSession, unresolved.hfId),
    );
  try {
    const serializedBefore = sdkSession.serialize();
    const result = await persistSdkCandidateMutation(
      sdkSession,
      targetPath,
      serializedBefore,
      deps,
      (session) => {
        for (const change of changes) session.setTiming(change.hfId, change.timingUpdate);
      },
      options,
      serializedBefore,
    );
    if (result.status === "failed") {
      return failedCutover(result.error, "timing", {
        hfId: changes[0]?.hfId ?? null,
        opCount: changes.length,
      });
    }
    trackStudioEvent("sdk_cutover_success", {
      hfId: changes[0]?.hfId ?? null,
      opCount: changes.length,
      family: "timing",
    });
    return result;
  } catch (error) {
    return failedCutover(error, "timing", {
      hfId: changes[0]?.hfId ?? null,
      opCount: changes.length,
    });
  }
}

type SdkGsapTweenOp =
  | { kind: "add"; target: string; spec: GsapTweenSpec }
  | { kind: "set"; animationId: string; properties: Partial<GsapTweenSpec> }
  | { kind: "remove"; animationId: string };
export function sdkGsapTweenPersist(
  targetPath: string,
  op: SdkGsapTweenOp,
  sdkSession: Composition | null | undefined,
  deps: CutoverDeps,
  options?: CutoverOptions,
): Promise<CutoverResult> {
  // Resolver tripwire — runs BEFORE this function's own cutover gate (decoupled).
  // add targets an element (element-resolution parity); set/remove target an
  // animationId (animation-resolution parity). Done here, not via
  // dispatchGsapOpAndPersist's resolverTarget, because the gate below returns
  // before that call when cutover is off.
  if (op.kind === "add") {
    const gsapSrc = deps.readProjectFile;
    void recordResolverParity(
      sdkSession,
      op.target,
      "addGsapTween",
      gsapSrc ? () => gsapSrc(targetPath) : undefined,
      { targetPath, compositionPath: deps.compositionPath },
    );
  } else {
    void recordAnimationResolverParity(
      sdkSession,
      op.animationId,
      op.kind === "set" ? "setGsapTween" : "removeGsapTween",
      gsapReadSource(deps, targetPath),
      { targetPath, compositionPath: deps.compositionPath },
    );
  }
  // Leading dark-launch gate so flag-off does no SDK touch (getElement) at all —
  // matches the other three chokepoints' discipline.
  if (!sdkFamilyEnabled("gsap-animation"))
    return Promise.resolve(declinedCutover("feature_disabled", "gsap-animation"));
  if (op.kind === "add" && sdkSession && !sdkSession.getElement(op.target))
    return Promise.resolve(declinedCutover("target_not_found", "gsap-animation"));
  // dispatchGsapOpAndPersist declines on before===after — that catches stale
  // animationIds and unsupported shapes (e.g. from-prop on a plain tween), falling
  // back to the server path. This subsumes explicit existence guards for set/remove.
  return dispatchGsapOpAndPersist("gsap-animation", targetPath, sdkSession, deps, options, (s) => {
    s.batch(() => {
      if (op.kind === "add") {
        s.addGsapTween(op.target, op.spec);
      } else if (op.kind === "set") {
        s.setGsapTween(op.animationId, op.properties);
      } else {
        s.removeGsapTween(op.animationId);
      }
    });
  });
}
async function dispatchGsapOpAndPersist(
  family: "gsap-animation" | "gsap-keyframe",
  targetPath: string,
  sdkSession: Composition | null | undefined,
  deps: CutoverDeps,
  options: CutoverOptions | undefined,
  dispatch: (s: Composition) => void,
  resolverTarget?: { animationId: string; opLabel: string },
): Promise<CutoverResult> {
  // Resolver tripwire — runs BEFORE the cutover gate (decoupled): records when
  // the SDK can't resolve the animationId the server GSAP path is addressing.
  if (resolverTarget) {
    void recordAnimationResolverParity(
      sdkSession,
      resolverTarget.animationId,
      resolverTarget.opLabel,
      gsapReadSource(deps, targetPath),
      { targetPath, compositionPath: deps.compositionPath },
    );
  }
  // Dark-launch gate (shared chokepoint for every GSAP-op cutover persist):
  // flag OFF → explicit decline → caller falls back to the legacy server path.
  if (!sdkFamilyEnabled(family)) return declinedCutover("feature_disabled", family);
  if (!sdkSession) return declinedCutover("session_unavailable", family);
  if (wrongCompositionFile(deps, targetPath))
    return declinedCutover("wrong_composition_file", family);
  const session = sdkSession;
  // persistSdkCandidateMutation owns the shared per-project/file transaction
  // coordinator used by both SDK and legacy GSAP writes.
  try {
    const serializedBefore = session.serialize();
    const result = await persistSdkCandidateMutation(
      session,
      targetPath,
      serializedBefore,
      deps,
      dispatch,
      options,
      serializedBefore,
    );
    if (result.status === "committed") {
      trackStudioEvent("sdk_cutover_success", { opCount: 1, family });
    } else if (result.status === "failed") {
      return failedCutover(result.error, family, { opCount: 1 });
    }
    return result;
  } catch (error) {
    return failedCutover(error, family, { opCount: 1 });
  }
}
export function sdkGsapKeyframePersist(
  targetPath: string,
  animationId: string,
  position: number,
  value: Record<string, unknown>,
  sdkSession: Composition | null | undefined,
  deps: CutoverDeps,
  options?: CutoverOptions,
): Promise<CutoverResult> {
  return dispatchGsapOpAndPersist(
    "gsap-keyframe",
    targetPath,
    sdkSession,
    deps,
    options,
    (s) => s.batch(() => s.dispatch({ type: "addGsapKeyframe", animationId, position, value })),
    { animationId, opLabel: "addGsapKeyframe" },
  );
}

export function sdkGsapRemoveKeyframePersist(
  targetPath: string,
  animationId: string,
  percentage: number,
  sdkSession: Composition | null | undefined,
  deps: CutoverDeps,
  options?: CutoverOptions,
): Promise<CutoverResult> {
  return dispatchGsapOpAndPersist(
    "gsap-keyframe",
    targetPath,
    sdkSession,
    deps,
    options,
    (s) => s.dispatch({ type: "removeGsapKeyframe", animationId, percentage }),
    { animationId, opLabel: "removeGsapKeyframe" },
  );
}

export function sdkGsapRemovePropertyPersist(
  targetPath: string,
  animationId: string,
  property: string,
  from: boolean,
  sdkSession: Composition | null | undefined,
  deps: CutoverDeps,
  options?: CutoverOptions,
): Promise<CutoverResult> {
  return dispatchGsapOpAndPersist(
    "gsap-animation",
    targetPath,
    sdkSession,
    deps,
    options,
    (s) => s.dispatch({ type: "removeGsapProperty", animationId, property, from }),
    { animationId, opLabel: "removeGsapProperty" },
  );
}

export function sdkGsapDeleteAllForSelectorPersist(
  targetPath: string,
  selector: string,
  sdkSession: Composition | null | undefined,
  deps: CutoverDeps,
  options?: CutoverOptions,
): Promise<CutoverResult> {
  return dispatchGsapOpAndPersist("gsap-animation", targetPath, sdkSession, deps, options, (s) =>
    s.dispatch({ type: "deleteAllForSelector", selector }),
  );
}

export function sdkGsapRemoveAllKeyframesPersist(
  targetPath: string,
  animationId: string,
  sdkSession: Composition | null | undefined,
  deps: CutoverDeps,
  options?: CutoverOptions,
): Promise<CutoverResult> {
  return dispatchGsapOpAndPersist(
    "gsap-keyframe",
    targetPath,
    sdkSession,
    deps,
    options,
    (s) => s.dispatch({ type: "removeAllKeyframes", animationId }),
    { animationId, opLabel: "removeAllKeyframes" },
  );
}

export function sdkGsapConvertToKeyframesPersist(
  targetPath: string,
  animationId: string,
  resolvedFromValues: Record<string, number | string> | undefined,
  sdkSession: Composition | null | undefined,
  deps: CutoverDeps,
  options?: CutoverOptions,
): Promise<CutoverResult> {
  return dispatchGsapOpAndPersist(
    "gsap-keyframe",
    targetPath,
    sdkSession,
    deps,
    options,
    (s) => s.dispatch({ type: "convertToKeyframes", animationId, resolvedFromValues }),
    { animationId, opLabel: "convertToKeyframes" },
  );
}

type KeyframeSpec = {
  percentage: number;
  properties: Record<string, number | string>;
  ease?: string;
  auto?: boolean;
};

type KeyframesPayload = {
  targetSelector: string;
  position: number;
  duration: number;
  keyframes: KeyframeSpec[];
  ease?: string;
};

function keyframesPayload(
  targetSelector: string,
  position: number,
  duration: number,
  keyframes: KeyframeSpec[],
  ease: string | undefined,
): KeyframesPayload {
  return { targetSelector, position, duration, keyframes, ...(ease ? { ease } : {}) };
}

/** Shared inner dispatch for addWithKeyframes / replaceWithKeyframes ops. */
function dispatchWithKeyframes(
  s: Composition,
  payload: KeyframesPayload,
  animationId?: string,
): void {
  if (animationId !== undefined) {
    s.dispatch({ type: "replaceWithKeyframes", animationId, ...payload });
  } else {
    s.dispatch({ type: "addWithKeyframes", ...payload });
  }
}

function persistKeyframesOperation(input: {
  targetPath: string;
  targetSelector: string;
  position: number;
  duration: number;
  keyframes: KeyframeSpec[];
  ease: string | undefined;
  sdkSession: Composition | null | undefined;
  deps: CutoverDeps;
  options?: CutoverOptions;
  animationId?: string;
}): Promise<CutoverResult> {
  const payload = keyframesPayload(
    input.targetSelector,
    input.position,
    input.duration,
    input.keyframes,
    input.ease,
  );
  return dispatchGsapOpAndPersist(
    "gsap-keyframe",
    input.targetPath,
    input.sdkSession,
    input.deps,
    input.options,
    (session) => dispatchWithKeyframes(session, payload, input.animationId),
    input.animationId
      ? { animationId: input.animationId, opLabel: "replaceWithKeyframes" }
      : undefined,
  );
}

export function sdkAddWithKeyframesPersist(
  targetPath: string,
  targetSelector: string,
  position: number,
  duration: number,
  keyframes: KeyframeSpec[],
  ease: string | undefined,
  sdkSession: Composition | null | undefined,
  deps: CutoverDeps,
  options?: CutoverOptions,
): Promise<CutoverResult> {
  return persistKeyframesOperation({
    targetPath,
    targetSelector,
    position,
    duration,
    keyframes,
    ease,
    sdkSession,
    deps,
    options,
  });
}

export function sdkReplaceWithKeyframesPersist(
  targetPath: string,
  animationId: string,
  targetSelector: string,
  position: number,
  duration: number,
  keyframes: KeyframeSpec[],
  ease: string | undefined,
  sdkSession: Composition | null | undefined,
  deps: CutoverDeps,
  options?: CutoverOptions,
): Promise<CutoverResult> {
  return persistKeyframesOperation({
    targetPath,
    animationId,
    targetSelector,
    position,
    duration,
    keyframes,
    ease,
    sdkSession,
    deps,
    options,
  });
}

export async function sdkDeletePersist(
  hfId: string,
  originalContent: string,
  targetPath: string,
  sdkSession: Composition | null | undefined,
  deps: CutoverDeps,
): Promise<CutoverResult> {
  // Resolver tripwire — runs BEFORE the cutover gate (decoupled).
  void recordResolverParity(
    sdkSession,
    hfId,
    "removeElement",
    () => Promise.resolve(originalContent),
    { targetPath, compositionPath: deps.compositionPath },
  );
  // Dark-launch gate: flag OFF → legacy server delete path.
  if (!sdkFamilyEnabled("lifecycle")) return declinedCutover("feature_disabled", "lifecycle");
  if (!sdkSession) return declinedCutover("session_unavailable", "lifecycle");
  if (!sdkSession.getElement(hfId))
    return declinedCutover(
      "target_not_found",
      "lifecycle",
      isResolverDisagreement(sdkSession, hfId),
    );
  if (wrongCompositionFile(deps, targetPath))
    return declinedCutover("wrong_composition_file", "lifecycle");
  const result = await persistSdkCandidateMutation(
    sdkSession,
    targetPath,
    originalContent,
    deps,
    (session) => session.removeElement(hfId),
    { label: "Delete element" },
  );
  trackCutoverResult(result, "lifecycle", { hfId, opCount: 1 });
  return result;
}

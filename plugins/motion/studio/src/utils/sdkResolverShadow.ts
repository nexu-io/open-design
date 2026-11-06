/**
 * SDK resolver-parity tripwire (telemetry-only).
 *
 * Checks whether the SDK session resolves the same element id the server
 * patch path would target, then optionally verifies value parity after an
 * in-memory dispatch. Emits `sdk_resolver_shadow` on any divergence.
 *
 * Headline signal: `element_not_found` — the resolver divergence class that
 * caused the v0.6.110 regression. The writer-parity suite (#1533) cannot see
 * this class; this tripwire exists specifically to catch it.
 *
 * Decoupled from `STUDIO_SDK_CUTOVER_ENABLED`. Gated by its own flag
 * `STUDIO_SDK_RESOLVER_SHADOW_ENABLED` (default ON during the soak — collect
 * wild telemetry; flip off / remove once resolver parity is proven).
 * Telemetry-only — never writes to disk, never affects the user-visible edit.
 */

import { openComposition } from "@hyperframes/sdk";
import type { Composition, JsonPatchOp } from "@hyperframes/sdk";
import type { PatchOperation } from "./sourcePatcher";
import { STUDIO_SDK_RESOLVER_SHADOW_ENABLED } from "../components/editor/manualEditingAvailability";
import { patchOpsToSdkEditOps } from "./sdkOpMapping";
import { trackStudioEvent } from "./studioTelemetry";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SdkResolverMismatch {
  kind:
    | "element_not_found"
    | "value_mismatch"
    | "dispatch_error"
    | "animation_not_found"
    | "session_empty";
  hfId?: string;
  animationId?: string;
  property?: string;
  expected?: string | null;
  actual?: string | null | undefined;
  error?: string;
}

// ─── Op helpers ───────────────────────────────────────────────────────────────

// Drop studio-internal data-hf-* markers the SDK model doesn't represent.
function isShadowableOp(op: PatchOperation): boolean {
  const name =
    op.type === "attribute"
      ? op.property.startsWith("data-")
        ? op.property
        : `data-${op.property}`
      : op.type === "html-attribute"
        ? op.property
        : null;
  return name === null || !name.startsWith("data-hf-");
}

const MAPPED_OP_TYPES = new Set(["inline-style", "text-content", "attribute", "html-attribute"]);

// ─── Read-back helpers ────────────────────────────────────────────────────────

function kebabToCamel(prop: string): string {
  return prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function normalizeText(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

type FlatEl = NonNullable<ReturnType<Composition["getElement"]>>;
type AttrMap = Record<string, string | null>;

/**
 * Resolve an hf-id to its snapshot the SAME way the SDK dispatch path does
 * (engine/model.ts resolveScoped), NOT via Composition.getElement.
 *
 * getElement is canonical-only for a bare id by design — it deliberately will
 * not resolve a bare id to a non-canonical (sub-composition) element, so that
 * removeElement(bareId) and getElement(bareId) agree on the same instance
 * (session.subcomp.test "ambiguous bare id" suite). But the cutover persist
 * path dispatches the studio's bare data-hf-id, and dispatch resolves it via
 * resolveScoped, which locates the leaf anywhere (canonical preferred, else
 * first match). So getElement under-resolves a bare leaf that lives inside an
 * inlined sub-composition (scopedId "host/leaf") — exactly the false
 * `element_not_found` this tripwire was emitting for inlined compositions.
 *
 * Mirror resolveScoped here: exact scoped-path match, then canonical bare
 * match, then first bare match — the resolvability dispatch actually has.
 */
// Count static `data-hf-id="<id>"` occurrences (both quote styles) in source.
// Substring split, not regex — no escaping, and the id never contains a quote.
function countHfIdInSource(source: string, id: string): number {
  return (
    source.split(`data-hf-id="${id}"`).length - 1 + (source.split(`data-hf-id='${id}'`).length - 1)
  );
}

/**
 * Resolvability the SDK DISPATCH path actually has (mirrors `resolveScoped`):
 * exact scoped-path match, then canonical bare match, then first bare match.
 *
 * Exported so the cutover path can distinguish its two `target_not_found` cases:
 * `Composition.getElement` is narrower (canonical-only for a bare id) than what
 * `dispatch` resolves, so an element can be genuinely dispatchable yet still
 * fail `getElement` — a resolver disagreement worth fixing, not a missing node.
 */
export function resolveSnapshot(session: Composition, id: string): FlatEl | null {
  const els = session.getElements();
  const exact = els.find((el) => el.scopedId === id);
  if (exact) return exact;
  const matches = els.filter((el) => el.id === id);
  return matches.find((el) => el.scopedId === el.id) ?? matches[0] ?? null;
}

function checkStyleOp(
  op: PatchOperation,
  el: FlatEl,
): { expected: string | null; actual: string | null } {
  return {
    expected: op.value ?? null,
    actual: el.inlineStyles[kebabToCamel(op.property)] ?? el.inlineStyles[op.property] ?? null,
  };
}

function checkTextOp(
  op: PatchOperation,
  el: FlatEl,
): { expected: string | null; actual: string | null } {
  return { expected: normalizeText(op.value), actual: normalizeText(el.text) };
}

function checkAttrOp(
  op: PatchOperation,
  el: FlatEl,
): { property: string; expected: string | null; actual: string | null } {
  const property =
    op.type === "attribute"
      ? op.property.startsWith("data-")
        ? op.property
        : `data-${op.property}`
      : op.property;
  return {
    property,
    expected: op.value ?? null,
    actual: (el.attributes as AttrMap)[property] ?? null,
  };
}

function checkOpValue(op: PatchOperation, el: FlatEl, hfId: string): SdkResolverMismatch | null {
  let property: string;
  let expected: string | null;
  let actual: string | null;

  if (op.type === "inline-style") {
    property = op.property;
    ({ expected, actual } = checkStyleOp(op, el));
  } else if (op.type === "text-content") {
    property = "text";
    ({ expected, actual } = checkTextOp(op, el));
  } else if (op.type === "attribute" || op.type === "html-attribute") {
    ({ property, expected, actual } = checkAttrOp(op, el));
  } else {
    return null;
  }

  if (actual === expected) return null;
  return { kind: "value_mismatch", hfId, property, expected, actual };
}

// ─── Core check (pure — testable without flag) ────────────────────────────────

/**
 * Run the resolver shadow check against an already-open SDK session.
 *
 * Returns an array of mismatches (empty = parity). The value-parity check
 * dispatches the ops into the session to read the result back, then UNDOES
 * those mutations via the captured inverse patches before returning — the
 * session ends exactly as it started. This is essential: the session is shared
 * with the cutover path, and a residual shadow mutation would make the
 * subsequent sdkCutoverPersist see before === after and silently fall back to
 * the server path. Telemetry-only; the server path stays authoritative on disk.
 *
 * Exported for unit tests; call `runResolverShadow` at call sites.
 */
export function sdkResolverShadowCheck(
  session: Composition,
  hfId: string,
  ops: PatchOperation[],
  sourceContent?: string,
): SdkResolverMismatch[] {
  if (!resolveSnapshot(session, hfId)) {
    // Runtime-node filter: an hf-id absent from the on-disk source the SDK
    // parsed was never in the static DOM — it belongs to an element a
    // composition <script> creates at runtime (e.g. caption word/group spans),
    // which the SDK session cannot model by design. That is NOT a resolver bug,
    // so suppress it. An hf-id PRESENT in source but missing from the session IS
    // a genuine resolver divergence (the v0.6.110 class) — keep emitting that.
    // ponytail: substring match; biases toward keeping signal on a loose hit.
    if (sourceContent !== undefined && !sourceContent.includes(hfId)) return [];
    // Loose match here vs. countHfIdInSource's strict data-hf-id="..." match in the
    // caller (runResolverShadow) means an emitted event can carry sourceHfIdCount: 0 —
    // see the comment on that field in runResolverShadow for what 0 means in that case.
    return [{ kind: "element_not_found", hfId }];
  }

  const shadowable = ops.filter(isShadowableOp);
  if (shadowable.length === 0) return [];

  // Silently skip op batches containing unmapped types — not a resolver bug.
  if (shadowable.some((op) => !MAPPED_OP_TYPES.has(op.type))) return [];

  // Capture the inverse of the shadow dispatch so we can restore the session.
  // `batch` fires a single PatchEvent whose `inversePatches` are already in
  // reverse-apply order (session.ts reverses inside buildPatchEvent), so
  // applyPatches(inverse) undoes the dispatch with no further reordering. If a
  // future SDK refactor ever coalesces batch into a composite with no per-op
  // inverse, this restore breaks — keep batch emitting inverse patches.
  const inverse: JsonPatchOp[] = [];
  const stopCapture = session.on("patch", (e) => inverse.push(...e.inversePatches));
  // restore() runs in `finally` so the patch listener is always removed and the
  // session is always undone — even if checkOpValue throws between dispatch and
  // return. A residual mutation or leaked listener on the shared session is the
  // exact cutover-coupling failure mode this module exists to avoid.
  try {
    try {
      const editOps = patchOpsToSdkEditOps(hfId, shadowable);
      session.batch(() => {
        for (const op of editOps) session.dispatch(op);
      });
    } catch (err) {
      return [{ kind: "dispatch_error", hfId, error: String(err) }];
    }

    const el = resolveSnapshot(session, hfId);
    if (!el) return [{ kind: "element_not_found", hfId }];

    return shadowable
      .map((op) => checkOpValue(op, el, hfId))
      .filter((m): m is SdkResolverMismatch => m !== null);
  } finally {
    stopCapture();
    if (inverse.length > 0) session.applyPatches(inverse);
  }
}

// Attempt counting (the soak-gate denominator) lives in sdkResolverAttempts.ts;
// re-exported here so existing consumers/tests keep one import surface.
export {
  recordAttempt,
  flushAttemptCounts,
  __resetAttemptSchedulingForTests,
} from "./sdkResolverAttempts";
import { recordAttempt } from "./sdkResolverAttempts";

// ─── Telemetry ────────────────────────────────────────────────────────────────

// Redact all user-content values before telemetry: style values and text both
// carry user data. Keep only the length so we can detect truncation without
// leaking the actual bytes.
function redactValue(value: string | null | undefined): string | null | undefined {
  if (value == null) return value;
  return `[redacted len=${value.length}]`;
}

function redactMismatches(mismatches: SdkResolverMismatch[]): SdkResolverMismatch[] {
  return mismatches.map((m) => ({
    ...m,
    expected: redactValue(m.expected),
    actual: redactValue(m.actual),
  }));
}

/**
 * Run the resolver shadow and emit `sdk_resolver_shadow` telemetry.
 * No-op when `STUDIO_SDK_RESOLVER_SHADOW_ENABLED` is false.
 * Never throws — any exception inside the shadow is swallowed.
 *
 * Side-effect-free on the live session: sdkResolverShadowCheck dispatches into
 * the session to read values back, then undoes those mutations before returning
 * (see below). The session is shared with the cutover path, so it MUST end the
 * call exactly as it started.
 */
// Sessions whose empty-session modeling gap has already been reported — one
// event per session instance, not one per edit (the per-edit storm is noise;
// the EXISTENCE of the gap is the signal).
const emptySessionReported = new WeakSet<Composition>();

/**
 * An empty session structurally cannot resolve ANY id — a modeling gap (empty
 * file, comp shape the SDK can't parse into elements), not a resolver
 * divergence, and it can't cut over either, so it stays out of the attempt
 * denominator. But silence would blind the tripwire to exactly the class that
 * exposed the template-comp bug — so emit ONE distinguishable `session_empty`
 * event per session, then skip. Returns true when the caller should skip.
 */
function reportEmptySession(session: Composition, opLabel: string): boolean {
  if (session.getElements().length !== 0) return false;
  if (!emptySessionReported.has(session)) {
    emptySessionReported.add(session);
    trackStudioEvent("sdk_resolver_shadow", {
      opLabel,
      sessionEmpty: true,
      sessionElementCount: 0,
      mismatchCount: 1,
      mismatches: JSON.stringify([{ kind: "session_empty" } satisfies SdkResolverMismatch]),
    });
  }
  return true;
}

/** Shape shared by every resolver-shadow entry point's optional path pair. */
export interface ResolverShadowPaths {
  targetPath?: string;
  compositionPath?: string | null;
}

/**
 * Cross-file edit: the session models ONLY the active composition, so a
 * target living in another file is structurally unresolvable — the cutover
 * gates decline it (wrongCompositionFile) and it can never cut over. Every
 * tripwire entry point skips entirely (no event, no attempt): the op belongs
 * in neither the divergence count nor the attempt denominator of the soak
 * rate. PostHog 0.7.41: one cross-file editing session emitted 479 false
 * element_not_found events before this rule existed. Callers that pass no
 * paths (isolated consumers/tests) run as before.
 */
function isCrossFileEdit(paths?: ResolverShadowPaths): boolean {
  return (
    paths?.targetPath !== undefined &&
    paths.compositionPath != null &&
    paths.targetPath !== paths.compositionPath
  );
}

export function runResolverShadow(
  session: Composition,
  hfId: string | null | undefined,
  ops: PatchOperation[],
  sourceContent?: string,
  paths?: ResolverShadowPaths,
): void {
  if (!STUDIO_SDK_RESOLVER_SHADOW_ENABLED) return;
  if (!hfId) return;
  try {
    if (isCrossFileEdit(paths)) return;
    if (reportEmptySession(session, "dom-edit")) return;
    recordAttempt("dom-edit");
    const mismatches = sdkResolverShadowCheck(session, hfId, ops, sourceContent);
    // Emit only on divergence — parity is silent, matching recordResolverParity
    // and recordAnimationResolverParity. Otherwise this fires a PostHog event on
    // every style/text/attr edit (the editor's chattiest path) at default-ON.
    if (mismatches.length === 0) return;
    const isElementNotFound = mismatches.some((m) => m.kind === "element_not_found");
    const strictCount =
      isElementNotFound && sourceContent !== undefined
        ? countHfIdInSource(sourceContent, hfId)
        : undefined;
    trackStudioEvent("sdk_resolver_shadow", {
      hfId,
      // sessionElementCount > 0 + element_not_found = runtime-only element;
      // sessionElementCount === 0 = session is empty/broken (actionable).
      sessionElementCount: session.getElements().length,
      // Count of data-hf-id="<id>" occurrences in source for an emitted
      // element_not_found. >1 = duplicate ids → resolver picked the wrong
      // instance; =1 = single static node the SDK parse dropped (foreign-content
      // exclusion / sub-comp inlining gap); =0 = the runtime-node filter above
      // uses a loose substring match (biased toward keeping signal) while this
      // count uses a strict attribute match — see sourceLooseMatchOnly below.
      ...(strictCount !== undefined ? { sourceHfIdCount: strictCount } : {}),
      // Loose suppression check matched (kept this event) but the strict
      // attribute count came back 0 — see the sourceHfIdCount comment above.
      ...(strictCount === 0 ? { sourceLooseMatchOnly: true } : {}),
      mismatchCount: mismatches.length,
      mismatches: JSON.stringify(redactMismatches(mismatches)),
    });
  } catch {
    // never propagate from the shadow path
  }
}

/**
 * Record element-resolution parity for an element-targeted op WITHOUT
 * dispatching. Read-only: emits a single `element_not_found` event when the SDK
 * can't resolve a target the server path is addressing. This extends the
 * tripwire beyond the DOM-edit path (runResolverShadow) to the other
 * element-targeted cutover chokepoints — timing, delete, GSAP-tween add — for
 * the headline resolver signal, without the cost/mutation of a value check.
 *
 * No-op when the shadow flag is off; never throws; never mutates the session.
 */
/**
 * Source-truth check for a missed hf-id: read the target file and decide
 * whether the miss is a runtime-generated node (id absent from source —
 * suppress, the SDK cannot model it by design) or a reportable divergence
 * (id present → strict attribute count for the event; read failure → fail
 * open, tagged). Mirrors checkAnimationIdOnDisk's error discipline.
 */
async function checkHfIdInSource(
  hfId: string,
  readSource?: () => Promise<string | undefined>,
): Promise<{ suppress: boolean; strictCount?: number; sourceReadFailed: boolean }> {
  if (!readSource) return { suppress: false, sourceReadFailed: false };
  let source: string | undefined;
  try {
    source = await readSource();
  } catch {
    return { suppress: false, sourceReadFailed: true }; // fail-open
  }
  if (source === undefined) return { suppress: false, sourceReadFailed: false };
  // Loose substring match — biased toward keeping signal (see sourceLooseMatchOnly).
  if (!source.includes(hfId)) return { suppress: true, sourceReadFailed: false };
  return { suppress: false, strictCount: countHfIdInSource(source, hfId), sourceReadFailed: false };
}

export async function recordResolverParity(
  session: Composition | null | undefined,
  hfId: string | null | undefined,
  opLabel: string,
  readSource?: () => Promise<string | undefined>,
  paths?: ResolverShadowPaths,
): Promise<void> {
  if (!STUDIO_SDK_RESOLVER_SHADOW_ENABLED) return;
  if (!session || !hfId) return;
  try {
    if (isCrossFileEdit(paths)) return;
    if (reportEmptySession(session, opLabel)) return;
    recordAttempt(opLabel);
    if (resolveSnapshot(session, hfId)) return; // resolves — parity, nothing to record
    // Capture BEFORE any await: this call is fire-and-forget (`void recordResolverParity(...)`)
    // and the caller runs its own session mutation synchronously right after this call
    // returns. getElements() caches and that cache is invalidated on dispatch, so reading
    // the count after an await would silently reflect POST-edit state, not the pre-edit
    // state this field exists to diagnose.
    const sessionElementCount = session.getElements().length;
    // Cheap check passed above, so the source read only runs on a real divergence.
    // Runtime-generated node the static parse can't model → suppressed inside.
    const verdict = await checkHfIdInSource(hfId, readSource);
    if (verdict.suppress) return;
    const { strictCount, sourceReadFailed } = verdict;
    trackStudioEvent("sdk_resolver_shadow", {
      hfId,
      opLabel,
      sessionElementCount,
      // sourceHfIdCount: strict data-hf-id="..." attribute count. Can be 0 even
      // on an emitted (non-suppressed) event — the suppression check above is a
      // loose substring match (biased toward keeping signal); see the longer
      // comment on this field in runResolverShadow for the full explanation.
      ...(strictCount !== undefined ? { sourceHfIdCount: strictCount } : {}),
      // Loose suppression check matched (kept this event) but the strict
      // attribute count came back 0 — hfId appeared as plain text (class name,
      // comment, script string) but never as a data-hf-id="..." attribute.
      // Lets telemetry consumers filter this cohort without parsing the
      // sourceHfIdCount comment above.
      ...(strictCount === 0 ? { sourceLooseMatchOnly: true } : {}),
      // The reader was wired but threw — distinguishes "read failed, emitted
      // fail-open without the suppression/count checks" from "no reader wired".
      ...(sourceReadFailed ? { sourceReadFailed: true } : {}),
      mismatchCount: 1,
      mismatches: JSON.stringify([
        { kind: "element_not_found", hfId } satisfies SdkResolverMismatch,
      ]),
    });
  } catch {
    // never propagate from the shadow path
  }
}

/**
 * Record animation-resolution parity for an animationId-targeted GSAP op WITHOUT
 * dispatching. Read-only: emits `animation_not_found` when the SDK can't resolve
 * the animationId the server GSAP path is addressing — the GSAP-edit-surface
 * analogue of element_not_found. The SDK's resolvable animation ids are the
 * located ids attached to elements (buildAnimationIdMap) OR any id parsed from
 * the script regardless of DOM match (getAllAnimationIds) — a target absent
 * from both is a resolver divergence.
 *
 * No-op when the shadow flag is off; never throws; never mutates the session.
 */
/**
 * Disk-truth disambiguation for a missed animationId: the GSAP panel computes
 * animationIds from the CURRENT on-disk script (the server read path re-reads
 * per render), while the session's parsed id space reflects the last session
 * reload. An edit that shifts tween positions shifts every
 * `selector-method-position` id, so a panel op landing before the reload
 * targets an id the session has never seen — a sync gap, not a resolver bug
 * (the 0.7.48 keyframe-op class). `staleSession` = a fresh parse of the file
 * resolves the id (suppress); `diskChecked` = the fresh parse ran and ALSO
 * missed (a trustworthy real divergence); read errors fail open.
 */
async function checkAnimationIdOnDisk(
  animationId: string,
  sourcePromise: Promise<string | undefined>,
): Promise<{ staleSession: boolean; diskChecked: boolean; sourceReadFailed: boolean }> {
  let source: string | undefined;
  try {
    source = await sourcePromise;
  } catch {
    return { staleSession: false, diskChecked: false, sourceReadFailed: true };
  }
  if (source === undefined) {
    return { staleSession: false, diskChecked: false, sourceReadFailed: false };
  }
  // A parse failure (malformed script the user just introduced) means the
  // source can't serve as ground truth — treat it exactly like a read failure
  // (fail open, tagged) instead of letting the outer never-propagate catch
  // swallow the whole divergence event.
  let disk: Composition;
  try {
    disk = await openComposition(source, { history: false });
  } catch {
    return { staleSession: false, diskChecked: false, sourceReadFailed: true };
  }
  try {
    return {
      staleSession: disk.getAllAnimationIds().has(animationId),
      diskChecked: true,
      sourceReadFailed: false,
    };
  } finally {
    disk.dispose();
  }
}

export async function recordAnimationResolverParity(
  session: Composition | null | undefined,
  animationId: string,
  opLabel: string,
  readSource?: () => Promise<string | undefined>,
  paths?: ResolverShadowPaths,
): Promise<void> {
  if (!STUDIO_SDK_RESOLVER_SHADOW_ENABLED) return;
  if (!session || !animationId) return;
  try {
    if (isCrossFileEdit(paths)) return;
    recordAttempt(opLabel);
    const elements = session.getElements();
    const resolves =
      elements.some((el) => el.animationIds.includes(animationId)) ||
      session.getAllAnimationIds().has(animationId);
    if (resolves) return; // SDK locates the animation — parity
    // Capture BEFORE any await (fire-and-forget caller mutates right after).
    const sessionElementCount = elements.length;
    let diskChecked = false;
    let sourceReadFailed = false;
    if (readSource) {
      // Start the read SYNCHRONOUSLY, before returning control to the caller:
      // the caller's cutover persist writes the new content to this same file
      // moments later, and a read dispatched after that write would check the
      // POST-edit disk (e.g. a remove op's target legitimately gone → false
      // "genuine divergence"). Dispatching the request here, in the same sync
      // prologue as the miss check, orders it ahead of the caller's write.
      const sourcePromise = (async () => readSource())();
      const verdict = await checkAnimationIdOnDisk(animationId, sourcePromise);
      if (verdict.staleSession) return; // sync gap, not a resolver bug — suppress
      diskChecked = verdict.diskChecked;
      sourceReadFailed = verdict.sourceReadFailed;
    }
    trackStudioEvent("sdk_resolver_shadow", {
      animationId,
      opLabel,
      sessionElementCount,
      // The id missed a fresh parse of the on-disk file too — this is a real
      // resolver divergence, not session staleness. Absent when no reader was
      // wired or the read failed (see sourceReadFailed).
      ...(diskChecked ? { diskChecked: true } : {}),
      ...(sourceReadFailed ? { sourceReadFailed: true } : {}),
      mismatchCount: 1,
      mismatches: JSON.stringify([
        { kind: "animation_not_found", animationId } satisfies SdkResolverMismatch,
      ]),
    });
  } catch {
    // never propagate from the shadow path
  }
}

// ─── Soak gate ────────────────────────────────────────────────────────────────

/**
 * Evaluate the soak-gate exit criterion.
 *
 * A clean soak window has zero `element_not_found` divergences. When that
 * condition holds, resolver parity is proven and the flag can be retired.
 */
export function evaluateSoakGate(divergenceCount: number): "parity-proven" | "divergence-detected" {
  return divergenceCount === 0 ? "parity-proven" : "divergence-detected";
}

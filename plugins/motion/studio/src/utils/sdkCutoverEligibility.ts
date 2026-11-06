/**
 * Cutover eligibility checks: whether a batch of patch ops is safe to route
 * through the SDK cutover path instead of the legacy server path. Split out of
 * sdkCutover.ts (which hit the packages/studio 600-line filesize cap) — this
 * block has no dependency on the persist/dispatch functions there.
 */
import type { Composition } from "@hyperframes/sdk";
import type { PatchOperation } from "./sourcePatcher";
import { isAllowedHtmlAttribute, isSafeAttributeValue } from "./htmlAttrSafety";
import { resolveSnapshot } from "./sdkResolverShadow";

const CUTOVER_OP_TYPES = new Set<PatchOperation["type"]>([
  "inline-style",
  "text-content",
  "attribute",
  "html-attribute",
]);

// Mirrors the SDK's RESERVED_ATTRS (mutate.ts): a bare `attribute` op is
// force-prefixed `data-`, so e.g. property "end" → "data-end", which the SDK
// rejects with a throw. Detect that up front and decline the whole batch so it
// takes the server path cleanly, instead of throwing inside the dispatch and
// silently falling back per op.
// ponytail: small mirror of the SDK set; if the SDK adds a reserved attr, a new
// op for it just reverts to the (working) throw→fallback path until synced.
const RESERVED_CUTOVER_ATTRS = new Set<string>([
  "data-hf-id",
  "data-composition-id",
  "data-width",
  "data-height",
  "data-start",
  "data-end",
  "data-track-index",
  "data-hold-start",
  "data-hold-end",
  "data-hold-fill",
]);

function sdkAttrName(op: PatchOperation): string | null {
  if (op.type === "attribute") {
    return op.property.startsWith("data-") ? op.property : `data-${op.property}`;
  }
  if (op.type === "html-attribute") return op.property;
  return null;
}

function mapsToReservedAttr(op: PatchOperation): boolean {
  const name = sdkAttrName(op);
  // Lowercase to match the SDK's validateSetAttribute (it lowercases before the
  // reserved check), so "DATA-START" is declined up front too; covers both
  // `attribute` (prefixed) and `html-attribute` (raw) ops.
  return name !== null && RESERVED_CUTOVER_ATTRS.has(name.toLowerCase());
}

// ─── html-attribute safety ───────────────────────────────────────────────────

function hasUnsafeHtmlAttributeOp(ops: PatchOperation[]): boolean {
  return ops.some(
    (op) =>
      op.type === "html-attribute" &&
      (!isAllowedHtmlAttribute(op.property) ||
        (op.value !== null && !isSafeAttributeValue(op.property, op.value))),
  );
}

function hasChildScopedOp(ops: PatchOperation[]): boolean {
  return ops.some((op) => op.childSelector !== undefined);
}

function hasTextContentOp(ops: PatchOperation[]): boolean {
  return ops.some((op) => op.type === "text-content");
}

function targetChildren(target: unknown): unknown[] | null {
  if (!target || typeof target !== "object" || !("children" in target)) return null;
  const children = target.children;
  return Array.isArray(children) ? children : null;
}

function elementTag(element: unknown): string | null {
  if (!element || typeof element !== "object" || !("tag" in element)) return null;
  const tag = element.tag;
  return typeof tag === "string" ? tag.toLowerCase() : null;
}

// Tags that are non-HTML namespace elements in a linkedom-parsed HTML body.
// Mirrors the engine's `isHTMLElementTarget` (model.ts) which uses `instanceof
// HTMLElement` — that runtime check catches the same set, but we can't use it
// here because `target` is a plain SDK object, not a DOM Element. If linkedom
// (or a future parser) surfaces additional foreign-content elements as
// non-HTMLElement, add them here.
const NON_HTML_CHILD_TAGS = new Set(["svg", "math"]);

export function shouldDeclineTextCutoverForTarget(target: unknown, ops: PatchOperation[]): boolean {
  if (!hasTextContentOp(ops)) return false;
  const children = targetChildren(target);
  if (!children) return false;
  // Legacy patch-element replaces the whole element for multi-child targets and
  // for single non-HTML children. The SDK text patch stream stores a scalar
  // inverse, so those shapes cannot be made both byte-identical and undo-safe
  // here. Let the server path remain authoritative for them.
  if (children.length > 1) return true;
  const tag = elementTag(children[0]);
  return tag !== null && NON_HTML_CHILD_TAGS.has(tag);
}

/**
 * On a `target_not_found`, decide whether the miss is the known benign class
 * (node genuinely absent from the session — nothing dispatch could have done)
 * or a resolver disagreement: the shadow's broader resolver finds it, so
 * dispatch could have made the edit and `getElement` refused it. The shadow
 * event stays silent in that case, so this flag is the only signal for it.
 *
 * Diagnostic context only — it must never turn a clean decline into a throw, so
 * a session shape without `getElements` reports "no disagreement" and the edit
 * falls back exactly as it otherwise would have.
 */
export function isResolverDisagreement(session: Composition, hfId: string): boolean {
  try {
    return resolveSnapshot(session, hfId) !== null;
  } catch {
    return false;
  }
}

/**
 * Why a batch cannot take the SDK cutover path, or null when it can.
 *
 * `ineligible_operation` used to be a single decline reason covering all of
 * these, which made the post-flip telemetry unactionable — a structural edit the
 * SDK has no vocabulary for (expected and permanent) was indistinguishable from
 * a reserved-attribute decline (narrow, and possibly worth fixing). The order
 * mirrors `shouldUseSdkCutover`'s conjunction, so the first failing check names
 * the reason.
 */
export type SdkCutoverIneligibleReason =
  | "target_unaddressable"
  | "no_ops"
  | "unsupported_op_type"
  | "child_scoped_op"
  | "reserved_attribute"
  | "unsafe_html_attribute";

export function sdkCutoverIneligibleReason(
  hfId: string | null | undefined,
  ops: PatchOperation[],
): SdkCutoverIneligibleReason | null {
  if (!hfId) return "target_unaddressable";
  if (ops.length === 0) return "no_ops";
  if (!ops.every((o) => CUTOVER_OP_TYPES.has(o.type))) return "unsupported_op_type";
  if (hasChildScopedOp(ops)) return "child_scoped_op";
  if (ops.some(mapsToReservedAttr)) return "reserved_attribute";
  if (hasUnsafeHtmlAttributeOp(ops)) return "unsafe_html_attribute";
  return null;
}

export function shouldUseSdkCutover(
  flagEnabled: boolean,
  hasSession: boolean,
  hfId: string | null | undefined,
  ops: PatchOperation[],
): boolean {
  // Derived from the reason function so the two can never disagree about which
  // batches are eligible.
  return flagEnabled && hasSession && sdkCutoverIneligibleReason(hfId, ops) === null;
}

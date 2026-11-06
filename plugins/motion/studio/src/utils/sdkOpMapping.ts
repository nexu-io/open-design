/**
 * Studio PatchOperation[] → SDK EditOp[] mapping.
 *
 * Lives in its own module so both the cutover path (sdkCutover.ts) and the
 * resolver-shadow tripwire (sdkResolverShadow.ts) can use it without a circular
 * import between those two.
 *
 * Multiple inline-style ops are coalesced into a single setStyle (the SDK
 * batches style changes naturally). One SDK op is emitted per non-style op.
 */

import type { EditOp } from "@hyperframes/sdk";
import type { PatchOperation } from "./sourcePatcher";

export function patchOpsToSdkEditOps(hfId: string, ops: PatchOperation[]): EditOp[] {
  const result: EditOp[] = [];
  const styles: Record<string, string | null> = {};
  let hasStyles = false;

  for (const op of ops) {
    if (op.type === "inline-style") {
      styles[op.property] = op.value;
      hasStyles = true;
    } else if (op.type === "text-content") {
      result.push({ type: "setText", target: hfId, value: op.value ?? "" });
    } else if (op.type === "attribute") {
      result.push({
        type: "setAttribute",
        target: hfId,
        name: op.property.startsWith("data-") ? op.property : `data-${op.property}`,
        value: op.value,
      });
    } else if (op.type === "html-attribute") {
      result.push({ type: "setAttribute", target: hfId, name: op.property, value: op.value });
    }
  }

  if (hasStyles) {
    result.unshift({ type: "setStyle", target: hfId, styles });
  }

  return result;
}

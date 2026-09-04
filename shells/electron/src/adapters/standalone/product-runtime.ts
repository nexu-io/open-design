import {
  OPEN_DESIGN_PRODUCT_RUNTIME_COMMAND,
  validateOpenDesignProductRuntimeProjection,
  type OpenDesignProductRuntimeProjection,
} from "@open-design/contracts/runtime/product-runtime";
import type { StandaloneRuntimeHandle } from "@open-design/standalone";

const requestIdPattern = /^[A-Za-z0-9._-]{1,128}$/u;
const attachmentIdPattern = /^[A-Za-z0-9._-]{1,128}$/u;
const bindingDigestPattern = /^[a-f0-9]{64}$/u;

export class ElectronProductRuntimeError extends Error {
  constructor(readonly code: "product-runtime-invalid" | "product-runtime-unavailable") {
    super(code);
    this.name = "ElectronProductRuntimeError";
  }
}

/** Collapse the generic Standalone command carrier into one product-owned read. */
export async function readElectronProductRuntime(input: Readonly<{
  attachmentId: string;
  bindingDigest: string;
  handle: StandaloneRuntimeHandle;
  requestId: string;
}>): Promise<OpenDesignProductRuntimeProjection> {
  if (!requestIdPattern.test(input.requestId)
    || !attachmentIdPattern.test(input.attachmentId)
    || !bindingDigestPattern.test(input.bindingDigest)) {
    throw new ElectronProductRuntimeError("product-runtime-invalid");
  }
  const result = await input.handle.invoke(Object.freeze({
    requestId: input.requestId,
    attachmentId: input.attachmentId,
    bindingDigest: input.bindingDigest,
    command: OPEN_DESIGN_PRODUCT_RUNTIME_COMMAND,
    input: Object.freeze({ schemaVersion: 1 as const, operation: "read" as const }),
  }));
  if (result.requestId !== input.requestId
    || result.attachmentId !== input.attachmentId
    || result.bindingDigest !== input.bindingDigest) {
    throw new ElectronProductRuntimeError("product-runtime-invalid");
  }
  if (result.outcome !== "accepted") {
    throw new ElectronProductRuntimeError("product-runtime-unavailable");
  }
  try {
    return validateOpenDesignProductRuntimeProjection(result.output);
  } catch {
    throw new ElectronProductRuntimeError("product-runtime-invalid");
  }
}

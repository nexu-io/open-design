import type { StandaloneShellCapabilityPort, StandaloneShellCapabilityRequest } from "./bootloader-handoff.js";

/** Route a finite set of Shell capabilities without widening any handler. */
export function createStandaloneShellCapabilityRouter(
  handlers: readonly StandaloneShellCapabilityPort[],
): StandaloneShellCapabilityPort {
  if (handlers.length === 0) throw new Error("Standalone Shell capability router requires at least one handler");
  return Object.freeze({
    async invoke(request: StandaloneShellCapabilityRequest) {
      for (const handler of handlers) {
        const result = await handler.invoke(request);
        if (result.requestId !== request.requestId
          || result.attachmentId !== request.attachmentId
          || result.bindingDigest !== request.bindingDigest) {
          throw new Error("Standalone Shell capability handler escaped its request binding");
        }
        if (result.outcome !== "unsupported") return result;
      }
      return Object.freeze({
        requestId: request.requestId,
        attachmentId: request.attachmentId,
        bindingDigest: request.bindingDigest,
        outcome: "unsupported" as const,
      });
    },
  });
}

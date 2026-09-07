import { invokeSidecar, normalizeSidecarStamp, type SidecarStamp } from "@open-design/sidecar/authority";
import { STANDALONE_HOST_CONTROL_ACTION, standaloneHostControlRequestTimeoutMs, type StandaloneHostControlTransport } from "@open-design/standalone";

export function createStandaloneHostControlTransport(stampInput: SidecarStamp): StandaloneHostControlTransport {
  const stamp = Object.freeze(normalizeSidecarStamp(stampInput));
  return async (request) => await invokeSidecar(stamp, STANDALONE_HOST_CONTROL_ACTION, request, {
    timeoutMs: standaloneHostControlRequestTimeoutMs(request),
  });
}

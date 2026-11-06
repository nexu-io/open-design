import {
  frameDisplayScale,
  inspectRuntimeProtocol,
  runtimeProtocolMetadata,
  type RuntimeProtocolInspection,
} from "@hyperframes/core/runtime/protocol";

export type RuntimeControlMessage = {
  source: "hf-parent";
  type: "control";
  action: string;
} & ReturnType<typeof runtimeProtocolMetadata> &
  Record<string, unknown>;

export function createRuntimeControlMessage(
  action: string,
  payload: Record<string, unknown> = {},
  fps = 30,
): RuntimeControlMessage {
  return {
    ...payload,
    source: "hf-parent",
    type: "control",
    action,
    ...runtimeProtocolMetadata(fps),
  };
}

export function postRuntimeControlMessage(
  target: Pick<Window, "postMessage"> | null | undefined,
  action: string,
  payload: Record<string, unknown> = {},
  fps = 30,
): void {
  target?.postMessage(createRuntimeControlMessage(action, payload, fps), "*");
}

export function postFrameDisplayScale(iframe: HTMLIFrameElement | null | undefined): void {
  const scale = iframe && frameDisplayScale(iframe);
  if (scale) postRuntimeControlMessage(iframe.contentWindow, "set-display-scale", { scale });
}

export function inspectStudioRuntimeMessage(value: unknown): RuntimeProtocolInspection {
  return inspectRuntimeProtocol(value, 30);
}

function dispatchRuntimeProtocolError(inspection: RuntimeProtocolInspection): void {
  if (inspection.status !== "unsupported") return;
  window.dispatchEvent(
    new CustomEvent("runtimeprotocolerror", {
      detail: {
        code: inspection.code,
        receivedVersion: inspection.receivedVersion,
      },
    }),
  );
}

export function acceptStudioRuntimeMessage(
  value: unknown,
): Exclude<RuntimeProtocolInspection, { status: "unsupported" }> | null {
  const inspection = inspectStudioRuntimeMessage(value);
  if (inspection.status !== "unsupported") return inspection;
  dispatchRuntimeProtocolError(inspection);
  return null;
}

export function acceptedRuntimeMessageFps(value: unknown): number {
  const inspection = inspectStudioRuntimeMessage(value);
  return inspection.status === "supported" ? inspection.fps : 30;
}

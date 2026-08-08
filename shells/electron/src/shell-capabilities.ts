import {
  STANDALONE_SHELL_CAPABILITIES,
  type StandaloneProtocolJsonValue,
  type StandaloneShellCapabilityPort,
  type StandaloneShellCapabilityResult,
} from "@open-design/standalone-proto";
import {
  SIDECAR_MESSAGES,
  type DesktopExportArtifactInput,
  type DesktopExportArtifactResult,
  type DesktopExportPdfInput,
  type DesktopExportPdfResult,
  type DesktopRenderSlidesInput,
  type DesktopRenderSlidesResult,
} from "@open-design/sidecar-proto";
import { requestJsonIpc } from "@open-design/sidecar";

type RequestDesktop = (message: unknown) => Promise<unknown>;

export function createElectronShellCapabilityPort(options: {
  desktopIpc: string;
  requestDesktop?: RequestDesktop;
}): StandaloneShellCapabilityPort {
  const requestDesktop = options.requestDesktop ?? (async (message: unknown) =>
    await requestJsonIpc<unknown>(options.desktopIpc, message, { timeoutMs: 600_000 }));

  const port: StandaloneShellCapabilityPort = {
    async invoke(request): Promise<StandaloneShellCapabilityResult> {
      try {
        let output: StandaloneProtocolJsonValue;
        switch (request.capability) {
          case STANDALONE_SHELL_CAPABILITIES.EXPORT_ARTIFACT:
            output = await requestDesktop({
              input: request.input as DesktopExportArtifactInput,
              type: SIDECAR_MESSAGES.EXPORT_ARTIFACT,
            }) as DesktopExportArtifactResult as unknown as StandaloneProtocolJsonValue;
            break;
          case STANDALONE_SHELL_CAPABILITIES.EXPORT_PDF:
            output = await requestDesktop({
              input: request.input as DesktopExportPdfInput,
              type: SIDECAR_MESSAGES.EXPORT_PDF,
            }) as DesktopExportPdfResult as unknown as StandaloneProtocolJsonValue;
            break;
          case STANDALONE_SHELL_CAPABILITIES.RENDER_SLIDES:
            output = await requestDesktop({
              input: request.input as DesktopRenderSlidesInput,
              type: SIDECAR_MESSAGES.RENDER_SLIDES,
            }) as DesktopRenderSlidesResult as unknown as StandaloneProtocolJsonValue;
            break;
          default:
            return {
              handoff: request.handoff,
              outcome: "unsupported",
              requestId: request.requestId,
              schemaVersion: request.schemaVersion,
            };
        }
        return {
          handoff: request.handoff,
          outcome: "completed",
          output,
          requestId: request.requestId,
          schemaVersion: request.schemaVersion,
        };
      } catch {
        return {
          error: { code: "shell-capability-failed" },
          handoff: request.handoff,
          outcome: "failed",
          requestId: request.requestId,
          schemaVersion: request.schemaVersion,
        };
      }
    },
  };
  return Object.freeze(port);
}

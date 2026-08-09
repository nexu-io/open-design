import {
  STANDALONE_SHELL_CAPABILITIES,
  validateStandaloneShellCapabilityInput,
  validateStandaloneShellCapabilityOutput,
  validateStandaloneShellCapabilityRequest,
  validateStandaloneShellCapabilityResult,
  type StandaloneExportArtifactInput,
  type StandaloneExportPdfInput,
  type StandaloneRenderSlidesInput,
  type StandaloneShellCapabilityPort,
  type StandaloneShellCapabilityResult,
} from "@open-design/standalone-proto";

export type ElectronShellCapabilityHandlers = Readonly<{
  exportArtifact(input: StandaloneExportArtifactInput): Promise<unknown>;
  exportPdf(input: StandaloneExportPdfInput): Promise<unknown>;
  renderSlides(input: StandaloneRenderSlidesInput): Promise<unknown>;
}>;

export function createElectronShellCapabilityPort(options: {
  handlers: ElectronShellCapabilityHandlers;
}): StandaloneShellCapabilityPort {
  const port: StandaloneShellCapabilityPort = {
    async invoke(request): Promise<StandaloneShellCapabilityResult> {
      const validatedRequest = validateStandaloneShellCapabilityRequest(request);
      try {
        let output: unknown;
        switch (validatedRequest.capability) {
          case STANDALONE_SHELL_CAPABILITIES.EXPORT_ARTIFACT:
            output = await options.handlers.exportArtifact(
              validateStandaloneShellCapabilityInput(
                STANDALONE_SHELL_CAPABILITIES.EXPORT_ARTIFACT,
                validatedRequest.input,
              ),
            );
            break;
          case STANDALONE_SHELL_CAPABILITIES.EXPORT_PDF:
            output = await options.handlers.exportPdf(
              validateStandaloneShellCapabilityInput(
                STANDALONE_SHELL_CAPABILITIES.EXPORT_PDF,
                validatedRequest.input,
              ),
            );
            break;
          case STANDALONE_SHELL_CAPABILITIES.RENDER_SLIDES:
            output = await options.handlers.renderSlides(
              validateStandaloneShellCapabilityInput(
                STANDALONE_SHELL_CAPABILITIES.RENDER_SLIDES,
                validatedRequest.input,
              ),
            );
            break;
          default:
            return {
              handoff: validatedRequest.handoff,
              outcome: "unsupported",
              requestId: validatedRequest.requestId,
              schemaVersion: validatedRequest.schemaVersion,
            };
        }
        const validatedOutput = validateStandaloneShellCapabilityOutput(
          validatedRequest.capability,
          output,
        );
        return validateStandaloneShellCapabilityResult({
          handoff: validatedRequest.handoff,
          outcome: "completed",
          output: validatedOutput,
          requestId: validatedRequest.requestId,
          schemaVersion: validatedRequest.schemaVersion,
        }, {
          capability: validatedRequest.capability,
          handoff: validatedRequest.handoff,
          requestId: validatedRequest.requestId,
        });
      } catch {
        return {
          error: { code: "shell-capability-failed" },
          handoff: validatedRequest.handoff,
          outcome: "failed",
          requestId: validatedRequest.requestId,
          schemaVersion: validatedRequest.schemaVersion,
        };
      }
    },
  };
  return Object.freeze(port);
}

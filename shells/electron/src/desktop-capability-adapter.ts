import { requestJsonIpc } from "@open-design/sidecar";
import { SIDECAR_MESSAGES } from "@open-design/sidecar-proto";

import type { ElectronShellCapabilityHandlers } from "./shell-capabilities.js";

type RequestDesktop = (message: unknown) => Promise<unknown>;

/**
 * Quarantine the current Electron-main JSON IPC surface behind semantic Shell
 * capability handlers. Standalone and its protocol never observe the socket,
 * message catalog, or transport lifetime.
 */
export function createDesktopCapabilityAdapter(
  desktopIpc: string,
  requestDesktop: RequestDesktop = async (message: unknown) =>
    await requestJsonIpc<unknown>(desktopIpc, message, { timeoutMs: 600_000 }),
): ElectronShellCapabilityHandlers {
  return Object.freeze({
    async exportArtifact(input) {
      return await requestDesktop({ input, type: SIDECAR_MESSAGES.EXPORT_ARTIFACT });
    },
    async exportPdf(input) {
      return await requestDesktop({ input, type: SIDECAR_MESSAGES.EXPORT_PDF });
    },
    async renderSlides(input) {
      return await requestDesktop({ input, type: SIDECAR_MESSAGES.RENDER_SLIDES });
    },
  });
}

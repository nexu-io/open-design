// Type declarations for globals exposed by apps/desktop/src/main/preload.cts
// via Electron contextBridge.
//
// The host bridge (__od__) is the primary surface — consumed via
// getOpenDesignHost() from @open-design/host rather than accessed directly.
// openDesignDesktop carries desktop-only helpers not part of the host protocol.

import type { OPEN_DESIGN_HOST_GLOBAL, OpenDesignHostBridge } from '@open-design/host';

export {};

export type DesktopDiagnosticsExportResult =
  | { ok: true; path: string }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string };

declare global {
  interface Window {
    // Primary host bridge — exposes shell, browser, project, capture,
    // updater, pdf, and pet surfaces. Access via getOpenDesignHost().
    __od__?: OpenDesignHostBridge;

    // Desktop-only helpers outside the host protocol.
    openDesignDesktop?: {
      exportDiagnostics: () => Promise<DesktopDiagnosticsExportResult>;
      isPackaged: boolean;
    };
  }
}

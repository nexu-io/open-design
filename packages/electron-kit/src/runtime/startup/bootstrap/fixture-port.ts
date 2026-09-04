import { createHash } from "node:crypto";
import { resolve } from "node:path";

import {
  ELECTRON_BOOTSTRAP_SCHEMA_VERSION,
  validateElectronBootstrapResult,
  type ElectronBootstrapPort,
  type ElectronBootstrapRequest,
  type ElectronBootstrapResult,
} from "./contracts.js";

export class ElectronFixtureBootstrapPort implements ElectronBootstrapPort {
  constructor(private readonly readinessTimeoutMs = 15_000) {}

  resolve(request: ElectronBootstrapRequest): Promise<ElectronBootstrapResult> {
    const generationId = createHash("sha256")
      .update(`${request.scope.channel}:${request.scope.namespace}:fixture`)
      .digest("hex");
    const launcherPath = resolve(process.cwd(), ".electron-kit-fixture", generationId, "launcher.mjs");
    return Promise.resolve(validateElectronBootstrapResult(request, {
      schemaVersion: ELECTRON_BOOTSTRAP_SCHEMA_VERSION,
      correlationId: request.correlationId,
      readinessTimeoutMs: this.readinessTimeoutMs,
      generation: {
        schemaVersion: 4,
        id: generationId,
        channel: request.scope.channel,
        releaseVersion: request.releaseVersion,
        standaloneVersion: "fixture-v1",
        sourceCommit: "electron-kit-fixture",
        minimumShellVersions: { electron: request.shell.version },
        launcher: {
          protocol: "standalone-launcher-v1",
          resourceId: "standalone-launcher",
          blobSha256: generationId,
          entrypoint: "launcher.mjs",
          path: launcherPath,
        },
        resources: {
          "standalone-launcher": {
            component: "standalone.launcher",
            blobSha256: generationId,
            entrypoint: "launcher.mjs",
            materialization: { type: "file", entrypoint: "launcher.mjs" },
            mediaType: "text/javascript",
            path: launcherPath,
            size: 0,
            sync: true,
          },
        },
      },
    }));
  }
}

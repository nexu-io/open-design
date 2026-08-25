import { createHash } from "node:crypto";

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
    return Promise.resolve(validateElectronBootstrapResult(request, {
      schemaVersion: ELECTRON_BOOTSTRAP_SCHEMA_VERSION,
      correlationId: request.correlationId,
      readinessTimeoutMs: this.readinessTimeoutMs,
      generation: {
        schemaVersion: 3,
        id: generationId,
        channel: request.scope.channel,
        releaseVersion: request.releaseVersion,
        standaloneVersion: "fixture-v1",
        sourceCommit: "electron-kit-fixture",
        minimumShellVersions: { electron: request.shell.version },
        resources: {},
      },
    }));
  }
}

import {
  executeLegacyPayloadDesktopHandoff,
  prepareLegacyPayloadDesktopHandoff,
} from "./payload-desktop-handoff.js";
import {
  bootstrapDaemonSidecarRuntime,
  startAndReportDaemonSidecar,
} from "./runtime.js";

async function main(): Promise<void> {
  const runtime = bootstrapDaemonSidecarRuntime();
  const desktopHandoff = await prepareLegacyPayloadDesktopHandoff({
    namespace: runtime.namespace,
    runtimeRoot: runtime.base,
    source: runtime.source,
  }).catch((error: unknown) => {
    console.warn("[packaged desktop handoff] prepare failed", error);
    return null;
  });
  const server = await startAndReportDaemonSidecar(runtime);
  if (desktopHandoff?.kind === "none") {
    console.info("[packaged desktop handoff] skipped", { reason: desktopHandoff.reason });
  }
  if (desktopHandoff?.kind === "prepared") {
    void executeLegacyPayloadDesktopHandoff(desktopHandoff)
      .then((result) => {
        console.info("[packaged desktop handoff]", result);
      })
      .catch((error: unknown) => {
        console.warn("[packaged desktop handoff] execute failed", error);
      });
  }
  await server.waitUntilStopped();
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

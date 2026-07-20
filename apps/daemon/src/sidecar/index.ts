import { APP_KEYS, OPEN_DESIGN_SIDECAR_CONTRACT } from "@open-design/sidecar-proto";
import { bootstrapSidecarRuntime } from "@open-design/sidecar";
import { readProcessStamp } from "@open-design/platform";

import { startDaemonSidecar } from "./server.js";
import {
  executeLegacyPayloadDesktopHandoff,
  prepareLegacyPayloadDesktopHandoff,
} from "./payload-desktop-handoff.js";

async function main(): Promise<void> {
  const stamp = readProcessStamp(process.argv.slice(2), OPEN_DESIGN_SIDECAR_CONTRACT);
  if (stamp == null) throw new Error("sidecar stamp is required");

  const runtime = bootstrapSidecarRuntime(stamp, process.env, {
    app: APP_KEYS.DAEMON,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
  });
  const desktopHandoff = await prepareLegacyPayloadDesktopHandoff({
    namespace: runtime.namespace,
    runtimeRoot: runtime.base,
    source: runtime.source,
  }).catch((error: unknown) => {
    console.warn("[packaged desktop handoff] prepare failed", error);
    return null;
  });
  const server = await startDaemonSidecar(runtime);

  process.stdout.write(`${JSON.stringify(await server.status(), null, 2)}\n`);
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

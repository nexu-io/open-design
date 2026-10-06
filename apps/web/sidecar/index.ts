import { APP_KEYS } from "@open-design/sidecar-proto";
import { SidecarFactory, type SidecarClient } from "@open-design/sidecar";

import { startWebSidecar, type WebSidecarHandle } from "./server.js";

async function main(): Promise<void> {
  let client!: SidecarClient<WebSidecarHandle>;
  client = SidecarFactory.create<WebSidecarHandle>({
    lifecycle: {
      async start(resources) {
        if (client.stamp.app !== APP_KEYS.WEB) throw new Error(`web sidecar cannot run stamp app ${client.stamp.app}`);
        return await startWebSidecar({ mode: client.stamp.mode }, resources.port);
      },
      async status(runtime) {
        return await runtime.status();
      },
      async stop(runtime) {
        await runtime.stop();
      },
    },
  });
  await client.start();
  await client.waitUntilStopped();
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

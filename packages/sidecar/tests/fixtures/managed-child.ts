import { SidecarFactory } from "../../src/index.js";
import { createServer } from "node:http";

if (process.env.OD_TEST_RENAME_RUNTIME === "1") process.title = "next-server";

type ManagedRuntime = {
  pid: number;
  port: number;
  server: ReturnType<typeof createServer>;
};

const client = SidecarFactory.create<ManagedRuntime>({
  lifecycle: {
    async start(resources): Promise<ManagedRuntime> {
      const server = createServer((_request, response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ pid: resources.pid }));
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(resources.port, "127.0.0.1", resolve);
      });
      const address = server.address();
      if (address == null || typeof address === "string") throw new Error("managed sidecar did not bind TCP");
      return { pid: resources.pid, port: address.port, server };
    },
    status(runtime) {
      return { pid: runtime.pid, port: runtime.port };
    },
    async stop(runtime) {
      await new Promise<void>((resolve, reject) => {
        runtime.server.close((error) => error == null ? resolve() : reject(error));
      });
    },
  },
});

await client.start();
await client.waitUntilStopped();

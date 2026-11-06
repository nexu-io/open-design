import { SidecarFactory } from "../../src/index.js";

const client = SidecarFactory.create<{ generationPid: number }>({
  lifecycle: {
    async start(resources) { return { generationPid: resources.pid }; },
    status(runtime) { return { generationPid: runtime.generationPid, phase: "successor" }; },
    async stop() {},
  },
});

await client.start();
await client.waitUntilStopped();

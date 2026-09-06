import { createServer } from "node:http";

import { describe, expect, it } from "vitest";

import { inspectElectronCdpStatus } from "../scripts/cdp-inspection.ts";

describe("Electron Shell native CDP inspection", () => {
  it("reports a disabled surface without probing the network", async () => {
    await expect(inspectElectronCdpStatus({ state: "ready", cdp: { state: "disabled" } }))
      .resolves.toEqual({ discovery: { state: "disabled" }, targets: [] });
  });

  it("discovers native page targets from a desktop lifecycle snapshot", async () => {
    const server = createServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify([{ id: "page-1", title: "Open Design", type: "page", url: "http://127.0.0.1/app" }]));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (address == null || typeof address === "string") throw new Error("fixture address is unavailable");
      const discoveryUrl = `http://127.0.0.1:${address.port}`;
      await expect(inspectElectronCdpStatus({ cdp: { state: "ready", discoveryUrl } })).resolves.toMatchObject({
        discovery: { state: "ready", discoveryUrl },
        targets: [{ id: "page-1", title: "Open Design", type: "page" }],
      });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error == null ? resolve() : reject(error)));
    }
  });
});

import { createServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { ElectronFixtureShellUpdater } from "@/updater/fixture-provider.js";

const servers: ReturnType<typeof createServer>[] = [];
const shell = { type: "electron", version: "0.1.0", buildHash: "a".repeat(64), digest: "b".repeat(64) };

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("Electron Shell updater provider", () => {
  it("consumes the tools-serve metadata shape and verifies the artifact", async () => {
    const artifact = Buffer.from("electron fixture installer");
    const sha256 = await import("node:crypto").then(({ createHash }) => createHash("sha256").update(artifact).digest("hex"));
    const server = createServer((request, response) => {
      const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      if (request.url === "/beta/latest/metadata.json") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({
          releaseVersion: "0.2.0-beta.1",
          platforms: { mac: { artifacts: { dmg: { url: `${origin}/app.dmg`, sha256Url: `${origin}/app.dmg.sha256`, size: artifact.byteLength, contentType: "application/x-apple-diskimage" } } } },
        }));
      } else if (request.url === "/app.dmg.sha256") response.end(`${sha256}  app.dmg\n`);
      else if (request.url === "/app.dmg") response.end(artifact);
      else { response.statusCode = 404; response.end(); }
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const updater = new ElectronFixtureShellUpdater(`${origin}/beta/latest/metadata.json`, shell);

    expect((await updater.invoke("check")).snapshot.state).toBe("available");
    expect((await updater.invoke("download")).snapshot.state).toBe("ready");
    expect((await updater.invoke("install")).snapshot.state).toBe("handed-off");
    expect((await updater.confirmInstalled(shell)).snapshot.state).toBe("installed");
  });
});

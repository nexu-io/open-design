import { createServer, type Server } from "node:http";
import { once } from "node:events";

import { afterEach, describe, expect, it } from "vitest";

import { createLoopbackGateway, type LoopbackGateway } from "../src/protocol/loopback-gateway.js";

const servers: Server[] = [];
const gateways: LoopbackGateway[] = [];

afterEach(async () => {
  await Promise.all(gateways.splice(0).map(async (gateway) => await gateway.close()));
  await Promise.all(servers.splice(0).map(async (server) => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }));
});

async function listen(server: Server): Promise<string> {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("test server did not bind TCP");
  return `http://127.0.0.1:${address.port}`;
}

function gateway(options: Parameters<typeof createLoopbackGateway>[0] = {}): LoopbackGateway {
  const created = createLoopbackGateway(options);
  gateways.push(created);
  return created;
}

describe("Shell loopback gateway", () => {
  it("uses an explicit bounded connection pool without serializing request bursts", async () => {
    let active = 0;
    let maximumActive = 0;
    const origin = await listen(createServer((_request, response) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      setTimeout(() => {
        active -= 1;
        response.end("ok");
      }, 40);
    }));
    const transport = gateway({ connections: 4 });

    const responses = await Promise.all(Array.from({ length: 8 }, async (_, index) => {
      const response = await transport.fetch(new Request(`${origin}/asset-${index}.svg`));
      return await response.text();
    }));

    expect(responses).toEqual(Array(8).fill("ok"));
    expect(maximumActive).toBe(4);
  });

  it("forwards a non-idempotent request exactly once with its body", async () => {
    let calls = 0;
    let body = "";
    let acceptEncoding = "";
    const origin = await listen(createServer(async (request, response) => {
      calls += 1;
      acceptEncoding = request.headers["accept-encoding"] ?? "";
      for await (const chunk of request) body += chunk.toString();
      response.writeHead(201, { "content-type": "application/json" });
      response.end('{"ok":true}');
    }));
    const transport = gateway();

    const response = await transport.fetch(new Request(`${origin}/api/projects`, {
      body: '{"name":"one"}',
      headers: { "content-type": "application/json" },
      method: "POST",
    }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(calls).toBe(1);
    expect(body).toBe('{"name":"one"}');
    expect(acceptEncoding).toBe("identity");
  });

  it("releases an upstream stream when the protocol consumer cancels", async () => {
    let resolveClosed!: () => void;
    const closed = new Promise<void>((resolve) => { resolveClosed = resolve; });
    const origin = await listen(createServer((request, response) => {
      request.on("close", resolveClosed);
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write("event: ready\ndata: {}\n\n");
    }));
    const transport = gateway({ connections: 1 });

    const response = await transport.fetch(new Request(`${origin}/api/events`));
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    await reader!.read();
    await reader!.cancel();

    await expect(Promise.race([
      closed,
      new Promise((_, reject) => setTimeout(() => reject(new Error("upstream stayed open")), 1_000)),
    ])).resolves.toBeUndefined();
  });

  it("atomically switches pools when the sidecar origin changes", async () => {
    const first = await listen(createServer((_request, response) => response.end("first")));
    const second = await listen(createServer((_request, response) => response.end("second")));
    const transport = gateway();

    expect(await (await transport.fetch(new Request(`${first}/`))).text()).toBe("first");
    expect(await (await transport.fetch(new Request(`${second}/`))).text()).toBe("second");
  });

  it("refuses non-loopback and credential-bearing targets", async () => {
    const transport = gateway();

    await expect(transport.fetch(new Request("https://example.com/"))).rejects.toThrow(/loopback HTTP/u);
    await expect(transport.fetch({
      url: "http://user:pass@127.0.0.1:1234/",
    } as Request)).rejects.toThrow(/credentials/u);
  });

  it("fails closed after shutdown", async () => {
    const transport = gateway();
    await transport.close();

    await expect(transport.fetch(new Request("http://127.0.0.1:1234/"))).rejects.toThrow(/closed/u);
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveDaemonUrl, DEFAULT_DAEMON_URL } from "../src/daemon-url.js";

// Verifies the resolution chain: --daemon-url > OD_DAEMON_URL > sidecar
// IPC status discovery > legacy default. Each layer must short-circuit the next
// so `od` clients follow the live daemon across ephemeral-port restarts.

describe("resolveDaemonUrl", () => {
  let fakeBinDir: string;
  let emptyBinDir: string;

  beforeAll(() => {
    fakeBinDir = fs.mkdtempSync(path.join(os.tmpdir(), "od-tools-dev-resolve-"));
    emptyBinDir = fs.mkdtempSync(path.join(os.tmpdir(), "od-tools-dev-empty-"));
  });

  afterAll(() => {
    fs.rmSync(fakeBinDir, { recursive: true, force: true });
    fs.rmSync(emptyBinDir, { recursive: true, force: true });
  });

  it("prefers the explicit --daemon-url flag", async () => {
    const url = await resolveDaemonUrl({
      flagUrl: "http://flag.example:1111",
      env: {
        OD_DAEMON_URL: "http://env.example:2222",
      },
    });
    expect(url).toBe("http://flag.example:1111");
  });

  it("falls back to OD_DAEMON_URL when no flag given", async () => {
    const url = await resolveDaemonUrl({
      env: {
        OD_DAEMON_URL: "http://env.example:2222",
      },
    });
    expect(url).toBe("http://env.example:2222");
  });

  it("returns the legacy default when no flag/env/socket is available", async () => {
    const url = await resolveDaemonUrl({
      env: {
        PATH: emptyBinDir,
      },
      timeoutMs: 200,
    });
    expect(url).toBe(DEFAULT_DAEMON_URL);
  });

  it("discovers the default tools-dev daemon URL when no sidecar IPC path is available", async () => {
    const pnpmBin = path.join(fakeBinDir, process.platform === "win32" ? "pnpm.cmd" : "pnpm");
    const statusJson = JSON.stringify({
      apps: {
        daemon: {
          url: "http://127.0.0.1:60123",
        },
      },
    });
    if (process.platform === "win32") {
      fs.writeFileSync(pnpmBin, `@echo off\r\necho ${statusJson.replace(/"/g, '\\"')}\r\n`);
    } else {
      fs.writeFileSync(pnpmBin, `#!/bin/sh\nprintf '%s\\n' 'pnpm warning before json'\nprintf '%s\\n' '${statusJson}'\n`);
      fs.chmodSync(pnpmBin, 0o755);
    }

    const url = await resolveDaemonUrl({
      env: {
        PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
      },
      timeoutMs: 1000,
    });
    expect(url).toBe("http://127.0.0.1:60123");
  });

  it("discovers the live daemon URL through an inherited sidecar client", async () => {
    const url = await resolveDaemonUrl({
      connectInherited: (() => ({
        invoke: async () => { throw new Error("unexpected invoke"); },
        status: async () => ({
          pid: 4242,
          state: "running",
          updatedAt: new Date().toISOString(),
          url: "http://127.0.0.1:54321",
        }),
      })) as never,
      env: {},
      timeoutMs: 1000,
    });
    expect(url).toBe("http://127.0.0.1:54321");
  });
});

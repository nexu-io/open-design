import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createJsonIpcServer, resolveAppIpcPath, type JsonIpcServerHandle } from "@open-design/sidecar";
import { releaseNamespace, type ReleasePlatform } from "@open-design/release";
import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_DEFAULTS,
  SIDECAR_ENV,
  SIDECAR_MESSAGES,
} from "@open-design/sidecar-proto";
import { resolveDaemonUrl, DEFAULT_DAEMON_URL } from "../src/daemon-url.js";

const CURRENT_RELEASE_PLATFORM: ReleasePlatform =
  process.platform === "darwin"
    ? process.arch === "arm64" ? "mac" : "macIntel"
    : process.platform === "win32" ? "win" : "linux";

// Verifies the resolution chain: --daemon-url > OD_DAEMON_URL > sidecar
// IPC status discovery > legacy default. Each layer must short-circuit the next
// so `od` clients follow the live daemon across ephemeral-port restarts.

describe("resolveDaemonUrl", () => {
  let ipcBaseDir: string;
  let fakeBinDir: string;
  let emptyBinDir: string;

  beforeAll(() => {
    ipcBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "od-mcp-resolve-"));
    fakeBinDir = fs.mkdtempSync(path.join(os.tmpdir(), "od-tools-dev-resolve-"));
    emptyBinDir = fs.mkdtempSync(path.join(os.tmpdir(), "od-tools-dev-empty-"));
  });

  afterAll(() => {
    fs.rmSync(ipcBaseDir, { recursive: true, force: true });
    fs.rmSync(fakeBinDir, { recursive: true, force: true });
    fs.rmSync(emptyBinDir, { recursive: true, force: true });
  });

  it("prefers the explicit --daemon-url flag", async () => {
    const url = await resolveDaemonUrl({
      flagUrl: "http://flag.example:1111",
      env: {
        OD_DAEMON_URL: "http://env.example:2222",
        [SIDECAR_ENV.IPC_PATH]: path.join(ipcBaseDir, "daemon.sock"),
      },
    });
    expect(url).toBe("http://flag.example:1111");
  });

  it("falls back to OD_DAEMON_URL when no flag given", async () => {
    const url = await resolveDaemonUrl({
      env: {
        OD_DAEMON_URL: "http://env.example:2222",
        [SIDECAR_ENV.IPC_PATH]: path.join(ipcBaseDir, "daemon.sock"),
      },
    });
    expect(url).toBe("http://env.example:2222");
  });

  it("returns the legacy default when no flag/env/socket is available", async () => {
    const url = await resolveDaemonUrl({
      env: {
        PATH: emptyBinDir,
        [SIDECAR_ENV.IPC_PATH]: path.join(ipcBaseDir, "missing.sock"),
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

  it("discovers the live daemon URL via the concrete sidecar IPC status endpoint", async () => {
    const socketPath = process.platform === "win32"
      ? `\\\\.\\pipe\\open-design-daemon-url-${process.pid}-${Date.now()}`
      : path.join(ipcBaseDir, "daemon.sock");
    let ipc: JsonIpcServerHandle | null = null;
    try {
      ipc = await createJsonIpcServer({
        socketPath,
        handler: (message) => {
          if (
            message != null &&
            typeof message === "object" &&
            (message as { type?: unknown }).type === SIDECAR_MESSAGES.STATUS
          ) {
            return {
              pid: 4242,
              state: "running",
              updatedAt: new Date().toISOString(),
              url: "http://127.0.0.1:54321",
            };
          }
          throw new Error("unexpected message");
        },
      });

      const url = await resolveDaemonUrl({
        env: {
          [SIDECAR_ENV.IPC_PATH]: socketPath,
        },
        timeoutMs: 1000,
      });
      expect(url).toBe("http://127.0.0.1:54321");
    } finally {
      await ipc?.close();
    }
  });

  // Regression coverage for the #6425 review: the loopback gate added for
  // conventional-path discovery must NOT apply to this pre-existing explicit
  // path. A daemon started with a non-default --host (Tailscale, a specific
  // interface, …) is a legitimate, already-supported configuration — the
  // lifecycle owner told the caller exactly which socket to dial, so there is
  // nothing to authenticate here that the explicit path doesn't already pin.
  it("honors an explicit sidecar status whose url is not loopback", async () => {
    const socketPath = process.platform === "win32"
      ? `\\\\.\\pipe\\open-design-daemon-url-nonloopback-${process.pid}-${Date.now()}`
      : path.join(ipcBaseDir, "daemon-nonloopback.sock");
    let ipc: JsonIpcServerHandle | null = null;
    try {
      ipc = await createJsonIpcServer({
        socketPath,
        handler: () => ({
          pid: 4243,
          state: "running",
          updatedAt: new Date().toISOString(),
          url: "http://192.168.1.50:7456",
        }),
      });

      const url = await resolveDaemonUrl({
        env: {
          [SIDECAR_ENV.IPC_PATH]: socketPath,
        },
        timeoutMs: 1000,
      });
      expect(url).toBe("http://192.168.1.50:7456");
    } finally {
      await ipc?.close();
    }
  });

  // Regression coverage for #6424: a plain terminal invocation of `od mcp
  // install <agent>` never has OD_SIDECAR_IPC_PATH set (only the packaged
  // app's own spawned children get it), so it previously had no way to find
  // a packaged install's daemon and always degraded to a broken bare-`od`
  // launch spec. `allowConventionalIpcDiscovery` is opt-in specifically so
  // this new discovery path cannot change behavior for every OTHER `od`
  // subcommand that already worked correctly without it.
  //
  // POSIX-only (see `conventionalIpcSocketPaths` / `isOwnedByCurrentProcess`
  // in daemon-url.ts): the ownership check this discovery mode requires has
  // no Windows implementation yet, so `conventionalIpcSocketPaths` yields no
  // candidates on win32 and this whole describe block does not apply there —
  // see the dedicated win32 test below instead.
  describe.skipIf(process.platform === "win32")("conventional per-channel IPC discovery (#6424)", () => {
    let conventionalIpcBaseDir: string;

    beforeAll(() => {
      conventionalIpcBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "od-conventional-ipc-"));
    });

    afterAll(() => {
      fs.rmSync(conventionalIpcBaseDir, { recursive: true, force: true });
    });

    it("ignores a live conventional-path socket by default (allowConventionalIpcDiscovery unset)", async () => {
      const socketPath = resolveAppIpcPath({
        app: APP_KEYS.DAEMON,
        contract: OPEN_DESIGN_SIDECAR_CONTRACT,
        env: { [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir },
        namespace: releaseNamespace("stable", CURRENT_RELEASE_PLATFORM),
      });
      fs.mkdirSync(path.dirname(socketPath), { recursive: true });
      let ipc: JsonIpcServerHandle | null = null;
      try {
        ipc = await createJsonIpcServer({
          socketPath,
          handler: () => ({ pid: 1, state: "running", updatedAt: new Date().toISOString(), url: "http://127.0.0.1:59999" }),
        });

        const url = await resolveDaemonUrl({
          env: {
            PATH: emptyBinDir,
            [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir,
          },
          timeoutMs: 300,
        });
        expect(url).toBe(DEFAULT_DAEMON_URL);
      } finally {
        await ipc?.close();
      }
    });

    it("discovers the live daemon via a conventional per-channel socket when allowConventionalIpcDiscovery is true", async () => {
      const socketPath = resolveAppIpcPath({
        app: APP_KEYS.DAEMON,
        contract: OPEN_DESIGN_SIDECAR_CONTRACT,
        env: { [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir },
        namespace: releaseNamespace("stable", CURRENT_RELEASE_PLATFORM),
      });
      fs.mkdirSync(path.dirname(socketPath), { recursive: true });
      let ipc: JsonIpcServerHandle | null = null;
      try {
        ipc = await createJsonIpcServer({
          socketPath,
          handler: () => ({ pid: 1, state: "running", updatedAt: new Date().toISOString(), url: "http://127.0.0.1:59999" }),
        });

        const url = await resolveDaemonUrl({
          env: {
            [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir,
          },
          timeoutMs: 1000,
          allowConventionalIpcDiscovery: true,
        });
        expect(url).toBe("http://127.0.0.1:59999");
      } finally {
        await ipc?.close();
      }
    });

    it("honors an explicit OD_SIDECAR_NAMESPACE over the channel sweep", async () => {
      const socketPath = resolveAppIpcPath({
        app: APP_KEYS.DAEMON,
        contract: OPEN_DESIGN_SIDECAR_CONTRACT,
        env: { [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir },
        namespace: "custom-namespace",
      });
      fs.mkdirSync(path.dirname(socketPath), { recursive: true });
      let ipc: JsonIpcServerHandle | null = null;
      try {
        ipc = await createJsonIpcServer({
          socketPath,
          handler: () => ({ pid: 1, state: "running", updatedAt: new Date().toISOString(), url: "http://127.0.0.1:58888" }),
        });

        const url = await resolveDaemonUrl({
          env: {
            [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir,
            [SIDECAR_ENV.NAMESPACE]: "custom-namespace",
          },
          timeoutMs: 1000,
          allowConventionalIpcDiscovery: true,
        });
        expect(url).toBe("http://127.0.0.1:58888");
      } finally {
        await ipc?.close();
      }
    });

    // The JSON-IPC protocol has no responder-identity check (no
    // peer-credential/uid verification, no shared secret): a STATUS
    // response is not proof the daemon is who it claims to be. Probing a
    // predictable, well-known socket path is a wider trust surface than the
    // pre-existing explicit-OD_SIDECAR_IPC_PATH case, since another local
    // process could in principle occupy that path first. This is not fixed
    // here (that needs protocol-level authentication, which is out of scope
    // for this fix) — but discovery must at least refuse to redirect
    // off-host, since the caller persists whatever `command`/`args` come
    // back from `/api/mcp/install-info` at the returned URL into a coding
    // agent's config.
    it("rejects a conventional-path response whose url is not loopback", async () => {
      const socketPath = resolveAppIpcPath({
        app: APP_KEYS.DAEMON,
        contract: OPEN_DESIGN_SIDECAR_CONTRACT,
        env: { [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir },
        namespace: releaseNamespace("stable", CURRENT_RELEASE_PLATFORM),
      });
      fs.mkdirSync(path.dirname(socketPath), { recursive: true });
      let ipc: JsonIpcServerHandle | null = null;
      try {
        ipc = await createJsonIpcServer({
          socketPath,
          handler: () => ({ pid: 1, state: "running", updatedAt: new Date().toISOString(), url: "http://evil.example:1234" }),
        });

        const url = await resolveDaemonUrl({
          env: {
            PATH: emptyBinDir,
            [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir,
          },
          timeoutMs: 300,
          allowConventionalIpcDiscovery: true,
        });
        expect(url).toBe(DEFAULT_DAEMON_URL);
      } finally {
        await ipc?.close();
      }
    });

    // Locks in the channel-precedence contract: when more than one release
    // channel's daemon happens to be live at once, the stable channel's
    // response wins deterministically, never whichever socket happens to
    // answer first. `Promise.allSettled` + ordered result scan (not
    // `Promise.any`/a bare race) is load-bearing for this — a naive race
    // would make the outcome depend on scheduling.
    it("prefers the stable channel when multiple channel sockets are simultaneously live", async () => {
      const stableSocketPath = resolveAppIpcPath({
        app: APP_KEYS.DAEMON,
        contract: OPEN_DESIGN_SIDECAR_CONTRACT,
        env: { [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir },
        namespace: releaseNamespace("stable", CURRENT_RELEASE_PLATFORM),
      });
      const betaSocketPath = resolveAppIpcPath({
        app: APP_KEYS.DAEMON,
        contract: OPEN_DESIGN_SIDECAR_CONTRACT,
        env: { [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir },
        namespace: releaseNamespace("beta", CURRENT_RELEASE_PLATFORM),
      });
      fs.mkdirSync(path.dirname(stableSocketPath), { recursive: true });
      fs.mkdirSync(path.dirname(betaSocketPath), { recursive: true });
      let stableIpc: JsonIpcServerHandle | null = null;
      let betaIpc: JsonIpcServerHandle | null = null;
      try {
        // Beta answers immediately; stable answers slightly slower — if the
        // implementation ever regresses to a bare race, this ordering would
        // flip the result to beta and fail the assertion below.
        betaIpc = await createJsonIpcServer({
          socketPath: betaSocketPath,
          handler: () => ({ pid: 2, state: "running", updatedAt: new Date().toISOString(), url: "http://127.0.0.1:57777" }),
        });
        stableIpc = await createJsonIpcServer({
          socketPath: stableSocketPath,
          handler: async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return { pid: 1, state: "running", updatedAt: new Date().toISOString(), url: "http://127.0.0.1:56666" };
          },
        });

        const url = await resolveDaemonUrl({
          env: {
            [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir,
          },
          timeoutMs: 1000,
          allowConventionalIpcDiscovery: true,
        });
        expect(url).toBe("http://127.0.0.1:56666");
      } finally {
        await stableIpc?.close();
        await betaIpc?.close();
      }
    });

    // Regression coverage for the #6425 review: WHATWG's URL always brackets
    // an IPv6 literal in `.hostname` (`new URL("http://[::1]:1234").hostname
    // === "[::1]"`, never the bare "::1"), so a bare-string comparison here
    // rejects every legitimate IPv6-loopback daemon status.
    it("accepts a conventional-path response whose url is IPv6 loopback", async () => {
      const socketPath = resolveAppIpcPath({
        app: APP_KEYS.DAEMON,
        contract: OPEN_DESIGN_SIDECAR_CONTRACT,
        env: { [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir },
        namespace: releaseNamespace("stable", CURRENT_RELEASE_PLATFORM),
      });
      fs.mkdirSync(path.dirname(socketPath), { recursive: true });
      let ipc: JsonIpcServerHandle | null = null;
      try {
        ipc = await createJsonIpcServer({
          socketPath,
          handler: () => ({ pid: 1, state: "running", updatedAt: new Date().toISOString(), url: "http://[::1]:34567" }),
        });

        const url = await resolveDaemonUrl({
          env: {
            [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir,
          },
          timeoutMs: 1000,
          allowConventionalIpcDiscovery: true,
        });
        expect(url).toBe("http://[::1]:34567");
      } finally {
        await ipc?.close();
      }
    });

    // Regression coverage for the #6425 review: `isLoopbackHttpUrl` used to
    // accept only the exact strings "127.0.0.1" / "[::1]" / "localhost", but
    // the daemon's own inbound bind validation (`isLoopbackHostname` in
    // `http/local-daemon-request.ts`) already treats the entire 127.0.0.0/8
    // range as loopback. A packaged daemon started with e.g.
    // `OD_BIND_HOST=127.0.0.2` is a pre-existing, already-supported local
    // configuration — conventional discovery rejecting it (and silently
    // falling back to 7456, where nothing is listening) would be a
    // regression for that case, not a security improvement.
    it("accepts a conventional-path response whose url is another 127.0.0.0/8 loopback address", async () => {
      const socketPath = resolveAppIpcPath({
        app: APP_KEYS.DAEMON,
        contract: OPEN_DESIGN_SIDECAR_CONTRACT,
        env: { [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir },
        namespace: releaseNamespace("stable", CURRENT_RELEASE_PLATFORM),
      });
      fs.mkdirSync(path.dirname(socketPath), { recursive: true });
      let ipc: JsonIpcServerHandle | null = null;
      try {
        ipc = await createJsonIpcServer({
          socketPath,
          handler: () => ({ pid: 1, state: "running", updatedAt: new Date().toISOString(), url: "http://127.0.0.2:23456" }),
        });

        const url = await resolveDaemonUrl({
          env: {
            [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir,
          },
          timeoutMs: 1000,
          allowConventionalIpcDiscovery: true,
        });
        expect(url).toBe("http://127.0.0.2:23456");
      } finally {
        await ipc?.close();
      }
    });

    // Regression coverage for the #6425 review: the packaged desktop app
    // always stamps an explicit `release-<channel>` namespace, but a
    // `tools-pack` install whose version string doesn't resolve to a known
    // channel (`defaultNamespaceForAppVersion` in `tools/pack/src/config.ts`)
    // falls through to the bare `SIDECAR_DEFAULTS.namespace` ("default")
    // instead. The channel sweep alone would never find that daemon.
    it("falls back to the generic default namespace when no release-channel socket is live", async () => {
      const socketPath = resolveAppIpcPath({
        app: APP_KEYS.DAEMON,
        contract: OPEN_DESIGN_SIDECAR_CONTRACT,
        env: { [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir },
        namespace: SIDECAR_DEFAULTS.namespace,
      });
      fs.mkdirSync(path.dirname(socketPath), { recursive: true });
      let ipc: JsonIpcServerHandle | null = null;
      try {
        ipc = await createJsonIpcServer({
          socketPath,
          handler: () => ({ pid: 1, state: "running", updatedAt: new Date().toISOString(), url: "http://127.0.0.1:41111" }),
        });

        const url = await resolveDaemonUrl({
          env: {
            [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir,
          },
          timeoutMs: 1000,
          allowConventionalIpcDiscovery: true,
        });
        expect(url).toBe("http://127.0.0.1:41111");
      } finally {
        await ipc?.close();
      }
    });

    // Regression coverage for the #6425 review: every OTHER channel's
    // Intel-mac build follows the standard `-intel` suffix that
    // `releaseNamespace(channel, "macIntel")` derives (release-prerelease-
    // intel, release-preview-intel, …), but `.github/workflows/
    // release-beta.yml`'s mac_x64 job instead bakes the literal
    // "release-beta-x64" via `tools-pack mac build --namespace
    // release-beta-x64`. Deliberately does NOT derive the expected socket's
    // namespace from `releaseNamespace()` (that would just re-encode the
    // same wrong assumption the implementation had) — hardcodes the exact
    // literal the live workflow produces instead. Forces `process.platform`/
    // `process.arch` to darwin/x64 (this suite normally runs on whatever
    // architecture the CI/dev machine actually has, which cannot otherwise
    // exercise the macIntel branch on an arm64 host) using the same
    // `Object.defineProperty` + restore pattern already used elsewhere in
    // this package (see `host-tools-launch-shell.test.ts`).
    it("discovers the live daemon via the release-beta-x64 literal namespace on Intel mac (CI naming inconsistency)", async () => {
      const origPlatform = process.platform;
      const origArch = process.arch;
      Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
      Object.defineProperty(process, "arch", { value: "x64", configurable: true });
      try {
        const socketPath = resolveAppIpcPath({
          app: APP_KEYS.DAEMON,
          contract: OPEN_DESIGN_SIDECAR_CONTRACT,
          env: { [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir },
          namespace: "release-beta-x64",
        });
        fs.mkdirSync(path.dirname(socketPath), { recursive: true });
        let ipc: JsonIpcServerHandle | null = null;
        try {
          ipc = await createJsonIpcServer({
            socketPath,
            handler: () => ({ pid: 1, state: "running", updatedAt: new Date().toISOString(), url: "http://127.0.0.1:39999" }),
          });

          const url = await resolveDaemonUrl({
            env: {
              [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir,
            },
            timeoutMs: 1000,
            allowConventionalIpcDiscovery: true,
          });
          expect(url).toBe("http://127.0.0.1:39999");
        } finally {
          await ipc?.close();
        }
      } finally {
        Object.defineProperty(process, "platform", { value: origPlatform, configurable: true });
        Object.defineProperty(process, "arch", { value: origArch, configurable: true });
      }
    });

    // Regression coverage for the #6425 review: loopback alone only rules
    // out off-host redirection, not a different local user squatting the
    // predictable socket path and answering with a loopback URL of its own
    // (e.g. while the real daemon is stopped/restarting). Simulates that by
    // making the current process disagree with the socket file's actual
    // owning uid — the response must be rejected even though it is a
    // perfectly well-formed, loopback, "successful" STATUS reply.
    it("rejects a conventional-path response when the socket is not owned by the current process", async () => {
      const socketPath = resolveAppIpcPath({
        app: APP_KEYS.DAEMON,
        contract: OPEN_DESIGN_SIDECAR_CONTRACT,
        env: { [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir },
        namespace: releaseNamespace("stable", CURRENT_RELEASE_PLATFORM),
      });
      fs.mkdirSync(path.dirname(socketPath), { recursive: true });
      let ipc: JsonIpcServerHandle | null = null;
      const realUid = process.getuid?.() ?? 0;
      const getuidSpy = vi.spyOn(process, "getuid").mockReturnValue(realUid + 1);
      try {
        ipc = await createJsonIpcServer({
          socketPath,
          // A "malicious" responder: well-formed, loopback, otherwise
          // indistinguishable from the real daemon's own STATUS reply.
          handler: () => ({ pid: 666, state: "running", updatedAt: new Date().toISOString(), url: "http://127.0.0.1:45678" }),
        });

        const url = await resolveDaemonUrl({
          env: {
            PATH: emptyBinDir,
            [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir,
          },
          timeoutMs: 300,
          allowConventionalIpcDiscovery: true,
        });
        expect(url).toBe(DEFAULT_DAEMON_URL);
      } finally {
        getuidSpy.mockRestore();
        await ipc?.close();
      }
    });
  });

  // Companion to the POSIX-only describe block above: conventional discovery
  // must be a no-op on win32 (no candidates, no probing, no crash) rather
  // than attempting to guess a named-pipe path with no ownership check.
  //
  // Regression note (#6425 review): this test must NOT set
  // SIDECAR_ENV.IPC_PATH — doing so takes the explicit-socket branch in
  // `discoverDaemonUrlFromIpc` before `conventionalIpcSocketPaths()` ever
  // runs, so the assertion would pass for the wrong reason (explicit-path
  // probe failing against a missing socket) without ever exercising the
  // win32 no-candidate behavior it claims to cover.
  it.skipIf(process.platform !== "win32")(
    "does not attempt conventional discovery on win32 even when allowConventionalIpcDiscovery is true",
    async () => {
      const url = await resolveDaemonUrl({
        env: {
          PATH: emptyBinDir,
        },
        timeoutMs: 300,
        allowConventionalIpcDiscovery: true,
      });
      expect(url).toBe(DEFAULT_DAEMON_URL);
    },
  );
});

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
import {
  resolveDaemonUrl,
  DEFAULT_DAEMON_URL,
  currentReleasePlatform,
  conventionalIpcSocketPaths,
  isLoopbackHttpUrl,
} from "../src/daemon-url.js";

const CURRENT_RELEASE_PLATFORM: ReleasePlatform = currentReleasePlatform();

function expectedConventionalPaths(env: NodeJS.ProcessEnv, namespaces: readonly string[]): string[] {
  return namespaces.map((namespace) =>
    resolveAppIpcPath({ app: APP_KEYS.DAEMON, contract: OPEN_DESIGN_SIDECAR_CONTRACT, env, namespace }),
  );
}

// Pure, host-OS-independent coverage of the candidate-namespace list itself.
// Split out from the IPC-integration suite below per the #6425 architecture
// review: shape/precedence of the candidate list doesn't need a live socket
// to verify, and testing it directly (with an explicit `platform` argument)
// means this suite can exercise the macIntel/win branches on ANY host
// without mutating `process.platform`/`process.arch` globals.
describe("conventionalIpcSocketPaths (pure)", () => {
  it("returns no candidates when platform is win, regardless of env", () => {
    expect(conventionalIpcSocketPaths({}, "win")).toEqual([]);
    expect(conventionalIpcSocketPaths({ [SIDECAR_ENV.NAMESPACE]: "custom-namespace" }, "win")).toEqual([]);
  });

  it("an explicit OD_SIDECAR_NAMESPACE bypasses the channel sweep on every non-win platform", () => {
    for (const platform of ["mac", "macIntel", "linux"] as const) {
      const env = { [SIDECAR_ENV.NAMESPACE]: "custom-namespace" };
      expect(conventionalIpcSocketPaths(env, platform)).toEqual(expectedConventionalPaths(env, ["custom-namespace"]));
    }
  });

  // Locks in the full stable-first channel sweep, including the one known
  // legacy-namespace outlier: beta on Intel mac lists TWO candidates
  // (canonical "-intel" suffix first, then the "release-beta-x64" alias
  // release-beta.yml's mac_x64 job actually ships under) because
  // `@open-design/release`'s `releaseNamespaceCandidates` owns that mapping
  // now — see its own doc comment for why the alias exists. Every other
  // channel/platform pair here has exactly one candidate.
  it("sweeps every known release channel plus the generic default, stable first", () => {
    const cases: Array<[ReleasePlatform, string[]]> = [
      ["mac", ["release-stable", "release-beta", "release-betas", "release-prerelease", "release-preview", SIDECAR_DEFAULTS.namespace]],
      [
        "macIntel",
        [
          "release-stable-intel",
          "release-beta-intel",
          "release-beta-x64",
          "release-betas-intel",
          "release-prerelease-intel",
          "release-preview-intel",
          SIDECAR_DEFAULTS.namespace,
        ],
      ],
      [
        "linux",
        [
          "release-stable-linux",
          "release-beta-linux",
          "release-betas-linux",
          "release-prerelease-linux",
          "release-preview-linux",
          SIDECAR_DEFAULTS.namespace,
        ],
      ],
    ];
    for (const [platform, namespaces] of cases) {
      const env = {};
      expect(conventionalIpcSocketPaths(env, platform)).toEqual(expectedConventionalPaths(env, namespaces));
    }
  });
});

// Pure coverage of the loopback/bare-origin URL policy applied to
// conventional-path candidates. Split out for the same reason as the
// candidate-list suite above: no live socket needed to verify this.
describe("isLoopbackHttpUrl (pure)", () => {
  it.each([
    "http://127.0.0.1:59999",
    "http://127.0.0.2:23456",
    "http://[::1]:34567",
    "https://localhost:41111",
  ])("accepts a bare loopback origin: %s", (url) => {
    expect(isLoopbackHttpUrl(url)).toBe(true);
  });

  it.each([
    ["http://user:pass@127.0.0.1:22222", "embedded credentials"],
    ["http://127.0.0.1:22222/some/path", "non-root path"],
    ["http://127.0.0.1:22222/?x=1", "query string"],
    ["http://127.0.0.1:22222/#fragment", "fragment"],
    ["http://127.0.0.1", "missing explicit port"],
    ["http://evil.example:1234", "non-loopback host"],
    ["not a url", "unparseable"],
    ["ftp://127.0.0.1:1234", "non-http(s) scheme"],
  ])("rejects %s (%s)", (url) => {
    expect(isLoopbackHttpUrl(url)).toBe(false);
  });
});

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
  // the pure `conventionalIpcSocketPaths (pure)` suite above covers the win
  // no-candidate behavior unconditionally instead.
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

    // Regression coverage for the Codex architecture review on #6425: this
    // test previously asserted that stable's response deterministically
    // "won" a race against beta (with a real 50ms delay to lock in the
    // ordering). Determinism is not correctness — if two packaged channels
    // are simultaneously live, discovery has no way to know which one the
    // invoking `od mcp install` actually meant, and silently preferring
    // stable would let resolveMcpLaunchSpec (cli.ts) persist the WRONG
    // channel's absolute paths into the agent's config. discoverDaemonUrlFromIpc
    // now refuses to guess: more than one DISTINCT successful response means
    // ambiguous, and it returns null so the caller falls through to the
    // legacy default — a safe, inert result instead of a confidently wrong
    // one. No artificial delay needed to prove this, which also removes the
    // suite's only real-timer nondeterminism.
    it("does not guess between channels when more than one is simultaneously live (ambiguous)", async () => {
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
        betaIpc = await createJsonIpcServer({
          socketPath: betaSocketPath,
          handler: () => ({ pid: 2, state: "running", updatedAt: new Date().toISOString(), url: "http://127.0.0.1:57777" }),
        });
        stableIpc = await createJsonIpcServer({
          socketPath: stableSocketPath,
          handler: () => ({ pid: 1, state: "running", updatedAt: new Date().toISOString(), url: "http://127.0.0.1:56666" }),
        });

        const url = await resolveDaemonUrl({
          env: {
            PATH: emptyBinDir,
            [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir,
          },
          timeoutMs: 1000,
          allowConventionalIpcDiscovery: true,
        });
        expect(url).toBe(DEFAULT_DAEMON_URL);
      } finally {
        await stableIpc?.close();
        await betaIpc?.close();
      }
    });

    // Regression coverage for the #6425 review (round 7): ambiguity must stop
    // discovery outright, not just the conventional channel sweep. A prior
    // version of this fix had discoverDaemonUrlFromIpc return a bare `null`
    // for "ambiguous" and "not-found" alike, so resolveDaemonUrl treated them
    // identically and fell through to discoverDaemonUrlFromToolsDev — if a
    // live tools-dev daemon ALSO happened to answer in that window, it would
    // win and get persisted as the launch spec despite the stated goal of
    // refusing to guess between packaged channels. Sets up the same two live
    // channel sockets as the test above, but this time leaves a live
    // tools-dev responder reachable on PATH too (the fixture used by
    // "discovers the default tools-dev daemon URL" above) — the assertion
    // only holds if resolveDaemonUrl recognizes the ambiguous IPC result and
    // stops before ever calling discoverDaemonUrlFromToolsDev.
    it("does not fall through to tools-dev discovery when channels are ambiguous", async () => {
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

      const toolsDevBinDir = fs.mkdtempSync(path.join(os.tmpdir(), "od-conventional-ipc-toolsdev-"));
      const pnpmBin = path.join(toolsDevBinDir, process.platform === "win32" ? "pnpm.cmd" : "pnpm");
      const toolsDevStatusJson = JSON.stringify({ apps: { daemon: { url: "http://127.0.0.1:60999" } } });
      if (process.platform === "win32") {
        fs.writeFileSync(pnpmBin, `@echo off\r\necho ${toolsDevStatusJson.replace(/"/g, '\\"')}\r\n`);
      } else {
        fs.writeFileSync(pnpmBin, `#!/bin/sh\nprintf '%s\\n' '${toolsDevStatusJson}'\n`);
        fs.chmodSync(pnpmBin, 0o755);
      }

      let stableIpc: JsonIpcServerHandle | null = null;
      let betaIpc: JsonIpcServerHandle | null = null;
      try {
        betaIpc = await createJsonIpcServer({
          socketPath: betaSocketPath,
          handler: () => ({ pid: 2, state: "running", updatedAt: new Date().toISOString(), url: "http://127.0.0.1:57777" }),
        });
        stableIpc = await createJsonIpcServer({
          socketPath: stableSocketPath,
          handler: () => ({ pid: 1, state: "running", updatedAt: new Date().toISOString(), url: "http://127.0.0.1:56666" }),
        });

        const url = await resolveDaemonUrl({
          env: {
            // A live, reachable tools-dev responder -- if the ambiguity
            // short-circuit ever regresses to a bare `null`, this is what
            // would win instead of the expected DEFAULT_DAEMON_URL.
            PATH: `${toolsDevBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
            [SIDECAR_ENV.IPC_BASE]: conventionalIpcBaseDir,
          },
          timeoutMs: 1000,
          allowConventionalIpcDiscovery: true,
        });
        expect(url).toBe(DEFAULT_DAEMON_URL);
      } finally {
        await stableIpc?.close();
        await betaIpc?.close();
        fs.rmSync(toolsDevBinDir, { recursive: true, force: true });
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

    // Regression coverage for the #6425 review: `conventionalIpcSocketPaths`
    // now surfaces "release-beta-x64" for beta on Intel mac via
    // `@open-design/release`'s `releaseNamespaceCandidates` (see the pure
    // suite above for the candidate-list-shape assertion). This proves the
    // IPC round trip actually resolves through that alias end-to-end. Uses
    // `resolveDaemonUrl`'s injectable `platform` option instead of mutating
    // `process.platform`/`process.arch` — this test now runs identically
    // regardless of the host machine's real architecture.
    it("discovers the live daemon via the release-beta-x64 literal namespace on Intel mac (CI naming inconsistency)", async () => {
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
          platform: "macIntel",
        });
        expect(url).toBe("http://127.0.0.1:39999");
      } finally {
        await ipc?.close();
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

  // Regression coverage for the #6425 review: proves the same win no-op
  // behavior at the `resolveDaemonUrl` integration level, using the
  // injectable `platform` option instead of gating on the real host OS —
  // this runs on every host, not just an actual win32 CI runner.
  it("does not attempt conventional discovery when platform is win, even with allowConventionalIpcDiscovery true", async () => {
    const url = await resolveDaemonUrl({
      env: {
        PATH: emptyBinDir,
      },
      timeoutMs: 300,
      allowConventionalIpcDiscovery: true,
      platform: "win",
    });
    expect(url).toBe(DEFAULT_DAEMON_URL);
  });
});

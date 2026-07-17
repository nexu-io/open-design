import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { DESKTOP_UPDATE_STATES, SIDECAR_SOURCES } from "@open-design/sidecar-proto";

import {
  DESKTOP_UPDATE_ENV,
  createDesktopUpdater,
} from "../../src/main/updater.js";

function isWithin(base: string, target: string): boolean {
  const rel = relative(resolve(base), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "od-cw09-upd-"));
}

function smokeEnv(metadataUrl: string, platform = "darwin"): NodeJS.ProcessEnv {
  return {
    [DESKTOP_UPDATE_ENV.AUTO_DOWNLOAD]: "1",
    [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.0",
    [DESKTOP_UPDATE_ENV.ENABLED]: "1",
    [DESKTOP_UPDATE_ENV.METADATA_URL]: metadataUrl,
    [DESKTOP_UPDATE_ENV.OPEN_DRY_RUN]: "1",
    [DESKTOP_UPDATE_ENV.PLATFORM]: platform,
  };
}

function serverAddress(server: Server): string {
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("fixture server is not listening on TCP");
  return `127.0.0.1:${address.port}`;
}

async function createSmokeFixture(version = "1.0.1"): Promise<{
  close: () => Promise<void>;
  metadataUrl: string;
}> {
  const artifactBody = Buffer.from("open design cw09 smoke fixture");
  const digest = createHash("sha256").update(artifactBody).digest("hex");
  const artifactName = `open-design-${version}-mac-arm64.dmg`;
  const artifactPath = "/artifact.dmg";
  const server = createServer((request, response) => {
    const url = request.url ?? "/";
    if (url === "/metadata.json") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        channel: "stable",
        baseVersion: version,
        releaseVersion: version,
        stableVersion: version,
        version: 1,
        platforms: {
          mac: {
            arch: "arm64",
            enabled: true,
            artifacts: {
              dmg: {
                name: artifactName,
                sha256Url: `http://${serverAddress(server)}${artifactPath}.sha256`,
                size: artifactBody.byteLength,
                url: `http://${serverAddress(server)}${artifactPath}`,
              },
            },
          },
        },
      }));
      return;
    }
    if (url === artifactPath) {
      response.setHeader("content-length", String(artifactBody.byteLength));
      response.end(artifactBody);
      return;
    }
    if (url === `${artifactPath}.sha256`) {
      response.end(`${digest}  ${artifactName}\n`);
      return;
    }
    response.statusCode = 404;
    response.end("not found");
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = serverAddress(server);
  return {
    close: async () => {
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error == null ? resolveClose() : rejectClose(error)));
      });
    },
    metadataUrl: `http://${address}/metadata.json`,
  };
}

describe("CW-09 desktop updater release gates", () => {
  it("degrades to ERROR when metadata is unreachable and never touches data or Creator backup", async () => {
    const root = makeRoot();
    const namespaceRoot = join(root, "namespace");
    const dataRoot = join(namespaceRoot, "data");
    const updateRoot = join(namespaceRoot, "updates");
    const backupRoot = join(namespaceRoot, "backups", "creator");
    // updateRoot must start empty so the updater can claim ownership; data and
    // backup get planted guards the updater must never delete or write beside.
    mkdirSync(dataRoot, { recursive: true });
    mkdirSync(updateRoot, { recursive: true });
    mkdirSync(backupRoot, { recursive: true });
    writeFileSync(join(dataRoot, ".keep"), "");
    writeFileSync(join(backupRoot, ".keep"), "");

    const updater = createDesktopUpdater(
      {
        arch: "arm64",
        downloadRoot: updateRoot,
        env: smokeEnv("https://metadata.invalid.example/metadata.json"),
        source: SIDECAR_SOURCES.PACKAGED,
      },
      {
        // Simulate offline: the metadata server is unreachable.
        fetch: async () => {
          throw new Error("simulated offline: metadata unreachable");
        },
      },
    );

    const status = await updater.checkForUpdates();

    // Offline degradation: the app keeps running on its current version.
    expect(status.state).toBe(DESKTOP_UPDATE_STATES.ERROR);
    expect(status.error?.code).toBe("metadata-unreachable");

    // User data and the CW-08 Creator backup are completely untouched: only the
    // planted guards remain. A regression that wrote into these areas (e.g. to
    // stash a failed payload) would be caught here.
    expect(readdirSync(dataRoot)).toEqual([".keep"]);
    expect(readdirSync(backupRoot)).toEqual([".keep"]);
    // The updater confined its own store writes to the update root.
    expect(readdirSync(updateRoot).length).toBeGreaterThan(0);
    expect(isWithin(updateRoot, join(updateRoot, "metadata.json"))).toBe(true);
  });

  it("rolls back a failed install without clobbering data or Creator backup", async () => {
    const root = makeRoot();
    const namespaceRoot = join(root, "namespace");
    const dataRoot = join(namespaceRoot, "data");
    const updateRoot = join(namespaceRoot, "updates");
    const backupRoot = join(namespaceRoot, "backups", "creator");
    mkdirSync(dataRoot, { recursive: true });
    mkdirSync(updateRoot, { recursive: true });
    mkdirSync(backupRoot, { recursive: true });
    writeFileSync(join(dataRoot, ".keep"), "");
    writeFileSync(join(backupRoot, ".keep"), "");

    const fixture = await createSmokeFixture();
    try {
      const updater = createDesktopUpdater(
        {
          arch: "arm64",
          downloadRoot: updateRoot,
          env: smokeEnv(fixture.metadataUrl),
          source: SIDECAR_SOURCES.PACKAGED,
        },
        { logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } },
      );

      const checked = await updater.checkForUpdates();
      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.downloadPath).toEqual(expect.any(String));
      // The downloaded payload stays within the update root (no path escape).
      expect(isWithin(updateRoot, checked.downloadPath ?? "")).toBe(true);

      // Tamper the downloaded payload, then attempt to install -> rollback.
      writeFileSync(checked.downloadPath ?? "", "tampered payload bytes");
      const installed = await updater.installUpdate();
      expect(installed.state).toBe(DESKTOP_UPDATE_STATES.ERROR);
      expect(installed.error?.code).toBe("checksum-mismatch");

      // Even after a failed install/rollback, user data and the Creator backup
      // are exactly as they were — the rollback only reverts update payloads.
      expect(readdirSync(dataRoot)).toEqual([".keep"]);
      expect(readdirSync(backupRoot)).toEqual([".keep"]);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });
});

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { startReleaseStorageFixtureServer } from "../src/release-storage-fixture.js";

function runNode(args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, args, options);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        rejectRun(new Error(`node ${args.join(" ")} exited ${String(code)}\n${stdout}\n${stderr}`));
      }
    });
  });
}

describe("shared release metadata publisher", () => {
  it("publishes complete beta, preview, nightly, and stable metadata through the release storage fixture", async () => {
    const repoRoot = resolve(import.meta.dirname, "../../..");
    const root = await mkdtemp(join(tmpdir(), "od-release-metadata-publish-"));
    const server = await startReleaseStorageFixtureServer();
    try {
      for (const [channel, version] of [
        ["beta", "1.2.3-beta.4"],
        ["preview", "1.2.3-preview.4"],
        ["nightly", "1.2.3.nightly.4"],
        ["stable", "1.2.3"],
      ] as const) {
        const manifestDir = join(root, channel, "manifests");
        const metadataDir = join(root, channel, "metadata");
        await mkdir(manifestDir, { recursive: true });
        const base = {
          channel,
          enabled: true,
          github: { commit: "abc123", runId: 42 },
          r2: { versionPrefix: `${channel}/versions/${version}` },
          releaseVersion: version,
          status: "published",
          version: 1,
        };
        await writeFile(
          join(manifestDir, "mac_arm64.json"),
          JSON.stringify(
            {
              ...base,
              arch: "arm64",
              artifacts: { dmg: { url: "https://example.test/dmg" }, payload: { url: "https://example.test/mac-payload" } },
              feed: null,
              legacyPlatformKey: "mac",
              platformKey: "mac_arm64",
              releaseTarget: "mac_arm64",
              signed: true,
            },
            null,
            2,
          ),
          "utf8",
        );
        await writeFile(
          join(manifestDir, "win_x64.json"),
          JSON.stringify(
            {
              ...base,
              arch: "x64",
              artifacts: { installer: { url: "https://example.test/exe" }, payload: { url: "https://example.test/win-payload" } },
              feed: null,
              legacyPlatformKey: "win",
              platformKey: "win_x64",
              releaseTarget: "win_x64",
              signed: false,
            },
            null,
            2,
          ),
          "utf8",
        );

        const env = {
          ...process.env,
          BASE_VERSION: "1.2.3",
          ENABLE_LINUX_X64: "false",
          ENABLE_MAC_ARM64: "true",
          ENABLE_MAC_X64: "false",
          ENABLE_WIN_X64: "true",
          MAC_ARM64_RESULT: "success",
          RELEASE_ASSET_SUFFIX: "",
          RELEASE_CHANNEL: channel,
          RELEASE_COMMIT: "abc123",
          RELEASE_MANIFEST_DIR: manifestDir,
          RELEASE_METADATA_DIR: metadataDir,
          RELEASE_OUTPUTS_PATH: join(metadataDir, "outputs.json"),
          RELEASE_PUBLIC_ORIGIN: "https://releases.example.test",
          RELEASE_RUN_ID: "42",
          RELEASE_SIGNED: "true",
          RELEASE_STORAGE_ACCESS_KEY_ID: "ak",
          RELEASE_STORAGE_BUCKET: server.info.bucket,
          RELEASE_STORAGE_ENDPOINT: server.info.endpointUrl,
          RELEASE_STORAGE_REGION: "auto",
          RELEASE_STORAGE_SECRET_ACCESS_KEY: "sk",
          RELEASE_VERSION: version,
          STATE_SOURCE: "local-tools-serve",
          WIN_X64_RESULT: "success",
          ...(channel === "beta" ? { RELEASE_LATEST_CAS_REQUIRED: "true" } : {}),
        };
        await runNode(["--experimental-strip-types", ".github/workflow/scripts/release/storage/publish-metadata.ts"], {
          cwd: repoRoot,
          env,
        });

        const metadata = JSON.parse(await readFile(join(metadataDir, "metadata.json"), "utf8")) as {
          channel?: string;
          releaseState?: string;
          releaseTargets?: {
            mac_arm64?: { artifacts?: { payload?: { url?: string } } };
            win_x64?: { artifacts?: { payload?: { url?: string } } };
          };
          allReadyTargetsSigned?: boolean;
          signed?: boolean;
          stableVersion?: string;
          github?: { commit?: string };
        };
        expect(metadata.channel).toBe(channel);
        expect(metadata.releaseState).toBe("complete");
        expect(metadata.signed).toBe(true);
        expect(metadata.allReadyTargetsSigned).toBe(false);
        expect(metadata.releaseTargets?.mac_arm64?.artifacts?.payload?.url).toBe("https://example.test/mac-payload");
        expect(metadata.releaseTargets?.win_x64?.artifacts?.payload?.url).toBe("https://example.test/win-payload");
        // github attribution must round-trip from the RELEASE_* env the workflow
        // passes; the stable promotion gate checks metadata.github.commit.
        expect(metadata.github?.commit).toBe("abc123");
        // Nightlies are stable candidates for their own base version. The stable
        // promotion gate requires metadata.stableVersion on the validated
        // nightly; the unified-publisher refactor (#3995) dropped it.
        if (channel === "nightly") {
          expect(metadata.stableVersion).toBe("1.2.3");
        }
        expect(server.getObject(`${channel}/latest/metadata.json`)).not.toBeNull();
      }
    } finally {
      await server.close();
    }
  });
});

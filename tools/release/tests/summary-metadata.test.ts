import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFileCallback);
const require = createRequire(import.meta.url);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tsxCliPath = require.resolve("tsx/cli");

describe("release metadata summary", () => {
  it("publishes clickable metadata, report, artifact, and checksum URLs", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-release-summary-"));
    const metadataPath = join(root, "metadata.json");
    const summaryPath = join(root, "summary.md");
    try {
      await writeFile(metadataPath, JSON.stringify({
        betaVersion: "0.23.1-beta.3",
        releaseState: "complete",
        readyTargets: ["mac_arm64", "win_x64"],
        r2: {
          versionMetadataUrl: "https://cdn.example/beta/metadata.json",
          reportUrl: "https://cdn.example/beta/report/",
        },
        releaseTargets: {
          mac_arm64: {
            label: "macOS arm64",
            status: "published",
            artifacts: {
              dmg: {
                name: "Open Design.dmg",
                size: 10485760,
                url: "https://cdn.example/beta/Open%20Design.dmg",
                sha256Url: "https://cdn.example/beta/Open%20Design.dmg.sha256",
              },
            },
          },
          win_x64: {
            label: "Windows x64",
            status: "failed",
            artifacts: { installer: { url: "https://cdn.example/stale.exe" } },
          },
        },
      }), "utf8");

      await execFileAsync(process.execPath, [tsxCliPath, "tools/release/src/index.ts", "summary-metadata"], {
        cwd: workspaceRoot,
        env: {
          ...process.env,
          RELEASE_CHANNEL: "beta",
          RELEASE_METADATA_PATH: metadataPath,
          RELEASE_SUMMARY_PATH: summaryPath,
        },
      });

      const summary = await readFile(summaryPath, "utf8");
      expect(summary).toContain("[metadata.json](https://cdn.example/beta/metadata.json)");
      expect(summary).toContain("[report](https://cdn.example/beta/report/)");
      expect(summary).toContain("| macOS arm64 | `Open Design.dmg` | 10.0 MiB | [download](https://cdn.example/beta/Open%20Design.dmg) | [sha256](https://cdn.example/beta/Open%20Design.dmg.sha256) |");
      expect(summary).not.toContain("stale.exe");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }, 60_000);
});

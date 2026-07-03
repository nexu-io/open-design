import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFileCallback);
const require = createRequire(import.meta.url);
const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, "..", "..", "..");
const tsxCliPath = require.resolve("tsx/cli");

async function writeAsset(root: string, group: string, name: string): Promise<void> {
  const dir = join(root, group);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), `${name}\n`, "utf8");
}

describe("stable GitHub Release asset plan", () => {
  it("selects only installers/packages and sha files from the full release bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-tools-release-github-assets-"));
    const source = join(root, "source");
    const output = join(root, "github-assets");
    const outputsPath = join(root, "outputs.json");
    const version = "0.10.2";

    try {
      const allowed = [
        `open-design-${version}-mac-arm64.dmg`,
        `open-design-${version}-mac-arm64.dmg.sha256`,
        `open-design-${version}-mac-x64.dmg`,
        `open-design-${version}-mac-x64.dmg.sha256`,
        `open-design-${version}-win-x64-setup.exe`,
        `open-design-${version}-win-x64-setup.exe.sha256`,
      ];
      for (const name of allowed) {
        await writeAsset(source, name.includes("win") ? "win" : name.includes("x64") ? "mac-intel" : "mac", name);
      }
      for (const name of [
        `open-design-${version}-mac-arm64-payload.zip`,
        `open-design-${version}-mac-x64.zip`,
        `open-design-${version}-win-x64-payload.7z`,
        `open-design-${version}-win-x64-portable.zip`,
        "latest.yml",
        "latest-mac.yml",
      ]) {
        await writeAsset(source, "extra", name);
      }

      await execFileAsync(process.execPath, [tsxCliPath, "tools/release/src/index.ts", "prepare-github-assets"], {
        cwd: workspaceRoot,
        env: {
          ...process.env,
          RELEASE_CHANNEL: "stable",
          RELEASE_GITHUB_ASSETS_DIR: output,
          RELEASE_GITHUB_ASSETS_SOURCE_DIR: source,
          RELEASE_OUTPUTS_PATH: outputsPath,
          RELEASE_VERSION: version,
        },
      });

      const outputs = JSON.parse(await readFile(outputsPath, "utf8")) as { assets: string[] };
      expect(outputs.assets).toEqual(allowed);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

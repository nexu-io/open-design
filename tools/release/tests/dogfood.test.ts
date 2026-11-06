import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  DOGFOOD_ROOT_PREFIX,
  assertDogfoodObjectKey,
  collectDogfoodCandidatePaths,
  dogfoodObjectKey,
  dogfoodPrefix,
  parseDogfoodPathList,
  sanitizeDogfoodSegment,
} from "../src/storage/dogfood.ts";

const execFileAsync = promisify(execFileCallback);
const require = createRequire(import.meta.url);
const testDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(testDir, "..");
const tsxCliPath = require.resolve("tsx/cli");
const commandPath = join(packageRoot, "src", "storage", "publish-dogfood.ts");

describe("dogfood destination guard", () => {
  it("accepts only keys inside the dogfood prefix", () => {
    expect(() => assertDogfoodObjectKey("dogfood/0.15.3-beta.7/1234-1/open-design-setup.exe")).not.toThrow();
  });

  it("refuses every release channel prefix", () => {
    for (const channel of ["beta", "prerelease", "preview", "stable"]) {
      expect(() => assertDogfoodObjectKey(`${channel}/latest/latest-mac.yml`)).toThrow(/refusing to write outside/);
      expect(() => assertDogfoodObjectKey(`${channel}/versions/0.15.3/open-design.dmg`)).toThrow(/refusing to write outside/);
      expect(() => assertDogfoodObjectKey(`${channel}/latest/metadata.json`)).toThrow(/refusing to write outside/);
    }
  });

  it("refuses to traverse out of the dogfood prefix", () => {
    const escapes = [
      "dogfood/../beta/latest/latest.yml",
      "dogfood/0.15.3/../../beta/latest/latest-mac.yml",
      "dogfood/./0.15.3/1/app.dmg",
      "dogfood//1/app.dmg",
      "/dogfood/0.15.3/1/app.dmg",
      "dogfood\\0.15.3\\1\\app.dmg",
      "Dogfood/0.15.3/1/app.dmg",
      "not-dogfood/0.15.3/1/app.dmg",
    ];
    for (const objectKey of escapes) {
      expect(() => assertDogfoodObjectKey(objectKey), objectKey).toThrow(/refusing to write outside/);
    }
  });

  it("refuses updater feed files and latest pointers even inside the dogfood prefix", () => {
    for (const feed of ["latest.yml", "latest-mac.yml", "latest-linux.yml", "latest-linux-arm64.yml", "LATEST.YML"]) {
      expect(() => assertDogfoodObjectKey(`dogfood/0.15.3/1/${feed}`), feed).toThrow(/updater feed file/);
    }
    expect(() => assertDogfoodObjectKey("dogfood/latest/1/app.dmg")).toThrow(/channel pointer name/);
    expect(() => assertDogfoodObjectKey("dogfood/0.15.3/latest/app.dmg")).toThrow(/channel pointer name/);
  });

  it("requires a version and build segment so a bare file can never sit at the root", () => {
    expect(() => assertDogfoodObjectKey("dogfood/app.dmg")).toThrow(/expected dogfood/);
    expect(() => assertDogfoodObjectKey("dogfood/0.15.3/app.dmg")).toThrow(/expected dogfood/);
    expect(() => assertDogfoodObjectKey("dogfood")).toThrow(/expected dogfood/);
  });
});

describe("dogfood key minting", () => {
  it("pins every minted key under the dogfood root", () => {
    const objectKey = dogfoodObjectKey({ buildId: "1234-1", fileName: "Open Design-release-beta-win-setup.exe", version: "0.15.3-beta.7" });
    expect(objectKey).toBe("dogfood/0.15.3-beta.7/1234-1/Open-Design-release-beta-win-setup.exe");
    expect(objectKey.startsWith(`${DOGFOOD_ROOT_PREFIX}/`)).toBe(true);
    expect(dogfoodPrefix({ buildId: "1234-1", version: "0.15.3-beta.7" })).toBe("dogfood/0.15.3-beta.7/1234-1");
  });

  it("cannot be tricked into another prefix through a hostile version, build id, or filename", () => {
    expect(dogfoodObjectKey({ buildId: "../../1", fileName: "a.dmg", version: "0.1.0" })).toBe("dogfood/0.1.0/1/a.dmg");
    expect(dogfoodObjectKey({ buildId: "1", fileName: "../../beta/latest/latest-mac.yml", version: "0.1.0" }))
      .toBe("dogfood/0.1.0/1/beta-latest-latest-mac.yml");
    expect(dogfoodObjectKey({ buildId: "1", fileName: "a.dmg", version: "../beta/latest" })).toBe("dogfood/beta-latest/1/a.dmg");
    expect(() => sanitizeDogfoodSegment("../")).toThrow(/empty after sanitizing/);
  });
});

describe("dogfood candidate selection", () => {
  it("reads real artifact paths out of a tools-pack build json and drops targets that were not built", () => {
    // --to nsis: portableZipPath is null, so only the installer is a candidate.
    expect(collectDogfoodCandidatePaths({
      buildJson: { installerPath: "C:\\out\\setup.exe", payloadPath: "C:\\out\\payload.7z", portableZipPath: null },
      buildJsonKeys: ["installerPath", "portableZipPath"],
    })).toEqual(["C:\\out\\setup.exe"]);

    // --to all: both are present.
    expect(collectDogfoodCandidatePaths({
      buildJson: { installerPath: "C:\\out\\setup.exe", portableZipPath: "C:\\out\\portable.zip" },
      buildJsonKeys: ["installerPath", "portableZipPath"],
    })).toEqual(["C:\\out\\setup.exe", "C:\\out\\portable.zip"]);

    // --to zip: no installer.
    expect(collectDogfoodCandidatePaths({
      buildJson: { installerPath: null, portableZipPath: "C:\\out\\portable.zip" },
      buildJsonKeys: ["installerPath", "portableZipPath"],
    })).toEqual(["C:\\out\\portable.zip"]);
  });

  it("merges explicit paths, de-duplicates, and tolerates a missing build json", () => {
    expect(collectDogfoodCandidatePaths({ buildJson: null, buildJsonKeys: ["dmgPath"], paths: ["/tmp/a.dmg", " ", "/tmp/a.dmg"] }))
      .toEqual(["/tmp/a.dmg"]);
    expect(parseDogfoodPathList("/tmp/a.dmg\n\n /tmp/b.zip \n")).toEqual(["/tmp/a.dmg", "/tmp/b.zip"]);
  });
});

describe("publish-dogfood command", () => {
  async function runCommand(env: Record<string, string>): Promise<{ code: number; stderr: string; stdout: string }> {
    try {
      const result = await execFileAsync(process.execPath, [tsxCliPath, commandPath], {
        cwd: packageRoot,
        env: { ...process.env, ...env },
      });
      return { code: 0, stderr: result.stderr, stdout: result.stdout };
    } catch (error) {
      const failure = error as { code?: number; stderr?: string; stdout?: string };
      return { code: failure.code ?? 1, stderr: failure.stderr ?? "", stdout: failure.stdout ?? "" };
    }
  }

  it("fails without touching storage when the build produced nothing", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-dogfood-empty-"));
    const buildJsonPath = join(root, "build.json");
    await writeFile(buildJsonPath, JSON.stringify({ installerPath: null, portableZipPath: null }), "utf8");

    const result = await runCommand({
      DOGFOOD_BUILD_JSON_KEYS: "installerPath,portableZipPath",
      DOGFOOD_BUILD_JSON_PATH: buildJsonPath,
      DOGFOOD_FILES: "",
      DOGFOOD_VERSION: "0.15.3-beta.7",
      GITHUB_STEP_SUMMARY: "",
      RELEASE_PUBLIC_ORIGIN: "https://releases.example.test",
      RELEASE_STORAGE_ACCESS_KEY_ID: "",
      RELEASE_STORAGE_BUCKET: "",
      RELEASE_STORAGE_ENDPOINT: "",
      RELEASE_STORAGE_REGION: "",
      RELEASE_STORAGE_SECRET_ACCESS_KEY: "",
    });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("no dogfood artifacts found");
  });

  it("reports a dogfood-only summary with no channel or latest path in it", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-dogfood-summary-"));
    const buildJsonPath = join(root, "build.json");
    const summaryPath = join(root, "summary.md");
    await writeFile(buildJsonPath, JSON.stringify({ installerPath: null, portableZipPath: null }), "utf8");
    await writeFile(summaryPath, "", "utf8");

    const result = await runCommand({
      DOGFOOD_ALLOW_EMPTY: "true",
      DOGFOOD_BUILD_ID: "1234-1",
      DOGFOOD_BUILD_JSON_KEYS: "installerPath,portableZipPath",
      DOGFOOD_BUILD_JSON_PATH: buildJsonPath,
      DOGFOOD_LABEL: "Windows x64",
      DOGFOOD_SUMMARY_PATH: summaryPath,
      DOGFOOD_VERSION: "0.15.3-beta.7",
      GITHUB_STEP_SUMMARY: "",
      RELEASE_PUBLIC_ORIGIN: "https://releases.example.test",
    });

    expect(result.code).toBe(0);
    const summary = await readFile(summaryPath, "utf8");
    expect(summary).toContain("dogfood only, not published to any release channel");
    expect(summary).toContain("dogfood/0.15.3-beta.7/1234-1/");
    for (const forbidden of ["beta/latest", "prerelease/latest", "preview/latest", "stable/latest"]) {
      expect(summary, forbidden).not.toContain(forbidden);
    }
  });
});

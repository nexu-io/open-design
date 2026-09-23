import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preparePlatformAssets } from "@/storage/prepare-platform-assets.ts";

describe("prepare platform assets", () => {
  let root: string;
  let assets: string;
  let pack: string;

  function fixture(path: string, value: string): string {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, value);
    return path;
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "release-assets-"));
    assets = join(root, "assets");
    pack = join(root, "pack");
    for (const [name, value] of Object.entries({
      RELEASE_ASSETS_DIR: assets,
      RELEASE_CHANNEL: "beta",
      RELEASE_VERSION: "0.22.3-beta.9",
      RELEASE_PUBLIC_ORIGIN: "https://releases.example.invalid/",
      RELEASE_NAMESPACE: "release-beta",
      TOOLS_PACK_DIR: pack,
      RELEASE_ASSET_SUFFIX: ".signed",
      RELEASE_ARTIFACT_MODE: "dmg-and-payload",
      RELEASE_VERSION_PREFIX: "",
      RELEASE_NOTES: "",
      RELEASE_BUILD_JSON_PATH: "",
      WIN_INCLUDE_ZIP: "",
    })) vi.stubEnv(name, value);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it("stages the signed mac DMG and external payload without an updater zip", async () => {
    vi.stubEnv("RELEASE_TARGET", "mac_arm64");
    fixture(join(pack, "out/mac/namespaces/release-beta/dmg/Open Design-release-beta.dmg"), "dmg");
    fixture(join(pack, "out/mac/namespaces/release-beta/payload/Open Design-release-beta-payload.zip"), "payload");
    await preparePlatformAssets();
    const stem = "open-design-0.22.3-beta.9.signed-mac-arm64";
    expect(readFileSync(join(assets, `${stem}.dmg`), "utf8")).toBe("dmg");
    expect(readFileSync(join(assets, `${stem}-payload.zip`), "utf8")).toBe("payload");
    expect(readFileSync(join(assets, `${stem}.dmg.sha256`), "utf8")).toBe(
      `${createHash("sha256").update("dmg").digest("hex")}  ${stem}.dmg\n`,
    );
    expect(existsSync(join(assets, "latest-mac.yml"))).toBe(false);
  });

  it("writes a mac updater feed only when a zip is staged", async () => {
    vi.stubEnv("RELEASE_TARGET", "mac_x64");
    vi.stubEnv("RELEASE_ARTIFACT_MODE", "dmg-and-zip");
    fixture(join(pack, "out/mac/namespaces/release-beta/dmg/Open Design-release-beta.dmg"), "dmg");
    fixture(join(pack, "out/mac/namespaces/release-beta/zip/Open Design-release-beta.zip"), "zip");
    await preparePlatformAssets();
    const feed = readFileSync(join(assets, "latest-mac.yml"), "utf8");
    expect(feed).toContain("https://releases.example.invalid/beta/versions/0.22.3-beta.9.signed/open-design-0.22.3-beta.9.signed-mac-x64.zip");
    expect(feed).toContain(`sha512: "${createHash("sha512").update("zip").digest("base64")}"`);
    expect(feed).toContain("    size: 3\n");
  });

  it("stages Windows installer and payload, optionally omitting the portable zip", async () => {
    vi.stubEnv("RELEASE_TARGET", "win_x64");
    vi.stubEnv("WIN_INCLUDE_ZIP", "false");
    const record = {
      installerPath: fixture(join(root, "build/setup.exe"), "installer"),
      payloadPath: fixture(join(root, "build/payload.7z"), "payload"),
    };
    const buildJson = fixture(join(root, "build.json"), JSON.stringify(record));
    vi.stubEnv("RELEASE_BUILD_JSON_PATH", buildJson);
    await preparePlatformAssets();
    expect(readFileSync(join(assets, "open-design-0.22.3-beta.9.signed-win-x64-setup.exe"), "utf8")).toBe("installer");
    expect(readFileSync(join(assets, "open-design-0.22.3-beta.9.signed-win-x64-payload.7z"), "utf8")).toBe("payload");
    expect(existsSync(join(assets, "open-design-0.22.3-beta.9.signed-win-x64-portable.zip"))).toBe(false);
    expect(readFileSync(join(assets, "latest.yml"), "utf8")).toContain("open-design-0.22.3-beta.9.signed-win-x64-setup.exe");
  });

  it("fails before writing Windows updater metadata if a required asset is missing", async () => {
    vi.stubEnv("RELEASE_TARGET", "win_x64");
    vi.stubEnv("WIN_INCLUDE_ZIP", "false");
    vi.stubEnv("RELEASE_BUILD_JSON_PATH", fixture(join(root, "build.json"), JSON.stringify({ installerPath: join(root, "missing.exe") })));
    await expect(preparePlatformAssets()).rejects.toThrow();
    expect(existsSync(join(assets, "latest.yml"))).toBe(false);
  });
});

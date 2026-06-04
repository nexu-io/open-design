import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  prebuiltSqliteTarget,
  pruneBuildOnlyNativeModules,
  resolveWebuiPackConfig,
  stageWebuiLauncherResources,
  webuiArchiveName,
  webuiArchiveKind,
} from "../src/webui/build.js";

describe("webuiArchiveName", () => {
  it("names per platform/arch/version", () => {
    expect(webuiArchiveName({ platform: "mac", arch: "arm64", version: "0.8.1" }))
      .toBe("open-design-webui-0.8.1-mac-arm64.zip");
    expect(webuiArchiveName({ platform: "linux", arch: "x64", version: "0.8.1" }))
      .toBe("open-design-webui-0.8.1-linux-x64.tar.gz");
    expect(webuiArchiveName({ platform: "win", arch: "x64", version: "0.8.1" }))
      .toBe("open-design-webui-0.8.1-win-x64.zip");
  });
});

describe("webuiArchiveKind", () => {
  it("linux -> tar.gz, mac/win -> zip", () => {
    expect(webuiArchiveKind("linux")).toBe("tar.gz");
    expect(webuiArchiveKind("mac")).toBe("zip");
    expect(webuiArchiveKind("win")).toBe("zip");
  });
});

describe("resolveWebuiPackConfig", () => {
  it("stays on a build-only server-mode config surface", () => {
    const config = resolveWebuiPackConfig("mac", { namespace: "webui-boundary" });

    expect(config.webOutputMode).toBe("server");
    expect(config.namespace).toBe("webui-boundary");
    expect("electronVersion" in config).toBe(false);
    expect("electronBuilderCliPath" in config).toBe(false);
    expect("signed" in config).toBe(false);
    expect("to" in config).toBe(false);
    expect("appBuilderRoot" in config.roots.output).toBe(false);
  });
});

describe("stageWebuiLauncherResources", () => {
  const mode = (p: string) => (statSync(p).mode & 0o777).toString(8);

  it("makes the Linux double-click .desktop entry executable", async () => {
    const stageRoot = mkdtempSync(join(tmpdir(), "od-webui-stage-linux-"));
    await stageWebuiLauncherResources(stageRoot, "linux");

    // The tracked source is 100644; the staged copy MUST be executable or many
    // Linux file managers refuse to launch it (README's double-click contract).
    expect(mode(join(stageRoot, "open-design-webui.desktop"))).toBe("755");
    expect(mode(join(stageRoot, "open-design.sh"))).toBe("755");

    rmSync(stageRoot, { force: true, recursive: true });
  });

  it("makes the macOS double-click .command entry executable", async () => {
    const stageRoot = mkdtempSync(join(tmpdir(), "od-webui-stage-mac-"));
    await stageWebuiLauncherResources(stageRoot, "mac");

    expect(mode(join(stageRoot, "Open Design WebUI.command"))).toBe("755");
    expect(mode(join(stageRoot, "open-design.sh"))).toBe("755");

    rmSync(stageRoot, { force: true, recursive: true });
  });
});

describe("prebuiltSqliteTarget", () => {
  it("maps tools-pack platform/arch to prebuild-install napi target", () => {
    expect(prebuiltSqliteTarget("mac", "arm64")).toEqual({ platform: "darwin", arch: "arm64" });
    expect(prebuiltSqliteTarget("win", "x64")).toEqual({ platform: "win32", arch: "x64" });
    expect(prebuiltSqliteTarget("linux", "x64")).toEqual({ platform: "linux", arch: "x64" });
  });
});

describe("pruneBuildOnlyNativeModules", () => {
  function makeAppTree(): { dir: string; appRoot: string } {
    const dir = mkdtempSync(join(tmpdir(), "od-prune-swc-"));
    const appRoot = join(dir, "app");
    const nm = join(appRoot, "node_modules");
    // The build-only SWC native binary that must be stripped (flat npm layout).
    mkdirSync(join(nm, "@next", "swc-linux-x64-gnu"), { recursive: true });
    writeFileSync(join(nm, "@next", "swc-linux-x64-gnu", "next-swc.node"), "binary");
    // A nested copy under next/node_modules must also go.
    mkdirSync(join(nm, "next", "node_modules", "@next", "swc-darwin-arm64"), { recursive: true });
    writeFileSync(join(nm, "next", "node_modules", "@next", "swc-darwin-arm64", "next-swc.node"), "binary");
    // Runtime packages that MUST be kept.
    mkdirSync(join(nm, "@next", "env"), { recursive: true });
    writeFileSync(join(nm, "@next", "env", "index.js"), "module.exports = {}");
    mkdirSync(join(nm, "next", "dist"), { recursive: true });
    writeFileSync(join(nm, "next", "dist", "server.js"), "// next runtime");
    return { dir, appRoot };
  }

  it("removes every @next/swc-* native binary, keeping the rest of next", async () => {
    const { dir, appRoot } = makeAppTree();
    const nm = join(appRoot, "node_modules");

    const removed = await pruneBuildOnlyNativeModules(appRoot);

    expect(existsSync(join(nm, "@next", "swc-linux-x64-gnu"))).toBe(false);
    expect(existsSync(join(nm, "next", "node_modules", "@next", "swc-darwin-arm64"))).toBe(false);
    // Runtime packages untouched.
    expect(existsSync(join(nm, "@next", "env"))).toBe(true);
    expect(existsSync(join(nm, "next", "dist", "server.js"))).toBe(true);
    // Returns what it pruned (both swc dirs).
    expect(removed.length).toBe(2);
    expect(removed.every((p) => p.includes("swc-"))).toBe(true);

    rmSync(dir, { force: true, recursive: true });
  });

  it("is a no-op (no throw, empty list) when there is no @next/swc", async () => {
    const dir = mkdtempSync(join(tmpdir(), "od-prune-none-"));
    const appRoot = join(dir, "app");
    mkdirSync(join(appRoot, "node_modules", "next", "dist"), { recursive: true });
    expect(await pruneBuildOnlyNativeModules(appRoot)).toEqual([]);
    rmSync(dir, { force: true, recursive: true });
  });
});

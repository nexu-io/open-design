import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cac } from "cac";
import { describe, expect, it } from "vitest";

import {
  addWebuiBuildOptions,
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

describe("addWebuiBuildOptions (CLI contract)", () => {
  it("registers the build-only flags the lane honors (--app-version, --require-vela-cli)", () => {
    const command = addWebuiBuildOptions(cac("test").command("webui <action>"));
    const names = command.options.map((o) => o.name); // cac camelCases option names
    expect(names).toContain("appVersion");
    expect(names).toContain("requireVelaCli");
    // Build-only boundary: installer/release flags must NOT be registered here.
    expect(names).not.toContain("to");
    expect(names).not.toContain("signed");
    expect(names).not.toContain("portable");
  });

  it("parses `webui build --app-version <ver>` into options.appVersion (no parser regression)", () => {
    const cli = cac("test");
    addWebuiBuildOptions(cli.command("webui <action>"));
    const parsed = cli.parse(["node", "test", "webui", "build", "--app-version", "9.9.9"], { run: false });
    expect(parsed.options.appVersion).toBe("9.9.9");
    expect(resolveWebuiPackConfig("linux", parsed.options).appVersion).toBe("9.9.9");
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

  // Per the Desktop Entry spec, %k is "the location of the desktop file as
  // either a URI ... or a local filename or empty if no location is known".
  // The Linux double-click Exec must therefore normalize %k before `cd`, or a
  // compliant launcher that passes `file:///…/open-design-webui.desktop` (or an
  // empty value) sends the shell to a bogus directory and never reaches
  // `./open-design.sh start`. This pins that the staged Exec launches from the
  // bundle directory for both a plain path and a file:// URI, and refuses to run
  // from the wrong place when %k is empty.
  describe("Linux .desktop Exec normalizes %k before launching", () => {
    // Extracts the `sh -c '<body>'` script from the staged .desktop and runs it
    // with %k replaced by `kValue`. The staged open-design.sh is swapped for a
    // stub that records its working directory into `markerPath`, and SHELL is
    // pointed at `true` so the trailing `exec $SHELL` exits instead of opening an
    // interactive shell. Returns the recorded launch directory, or null if the
    // launcher never reached open-design.sh.
    function runDesktopExec(stageRoot: string, kValue: string): string | null {
      const desktop = readFileSync(join(stageRoot, "open-design-webui.desktop"), "utf8");
      const execLine = desktop.split(/\r?\n/).find((l) => l.startsWith("Exec="));
      if (execLine == null) throw new Error("no Exec= line in .desktop");
      const match = /^Exec=sh -c '(.*)'$/.exec(execLine);
      if (match == null) throw new Error(`unexpected Exec shape: ${execLine}`);
      const script = match[1].split("%k").join(kValue);

      const markerPath = join(stageRoot, "launch-marker");
      writeFileSync(
        join(stageRoot, "open-design.sh"),
        `#!/bin/sh\nprintf '%s' "$(pwd)" > "${markerPath}"\n`,
        "utf8",
      );
      chmodSync(join(stageRoot, "open-design.sh"), 0o755);
      rmSync(markerPath, { force: true });

      // Run from an unrelated cwd so a missing/late `cd` cannot accidentally pass.
      const elsewhere = mkdtempSync(join(tmpdir(), "od-webui-elsewhere-"));
      try {
        execFileSync("sh", ["-c", script], {
          cwd: elsewhere,
          env: { ...process.env, SHELL: "true" },
          stdio: "ignore",
        });
      } catch {
        // The launcher may exit non-zero on the empty/bogus path; the marker file
        // is the source of truth for whether open-design.sh actually ran.
      } finally {
        rmSync(elsewhere, { force: true, recursive: true });
      }
      return existsSync(markerPath) ? readFileSync(markerPath, "utf8") : null;
    }

    it("launches from the bundle dir for a plain path and a file:// URI, and not when %k is empty", async () => {
      const stageRoot = mkdtempSync(join(tmpdir(), "od-webui-desktop-k-"));
      await stageWebuiLauncherResources(stageRoot, "linux");
      const bundleDir = realpathSync(stageRoot);
      const desktopPath = join(bundleDir, "open-design-webui.desktop");

      // Plain local filename (well-behaved launcher).
      expect(runDesktopExec(stageRoot, desktopPath)).toBe(bundleDir);
      // file:// URI form (spec-compliant launcher) — the reproduced failure case.
      expect(runDesktopExec(stageRoot, `file://${desktopPath}`)).toBe(bundleDir);
      // Empty %k: must not silently launch from the wrong directory.
      expect(runDesktopExec(stageRoot, "")).toBeNull();

      rmSync(stageRoot, { force: true, recursive: true });
    });

    it("percent-decodes a file:// URI so bundle dirs with spaces still launch", async () => {
      // A compliant launcher passes %k as a percent-encoded URI, so a bundle in
      // `/…/space bundle/` arrives as `file:///…/space%20bundle/…`. The Exec must
      // URI-decode before `cd`, or the staged double-click launcher fails for any
      // extract path containing spaces or other escaped characters.
      const parent = mkdtempSync(join(tmpdir(), "od-webui-desktop-enc-"));
      const stageRoot = join(parent, "space bundle");
      mkdirSync(stageRoot);
      await stageWebuiLauncherResources(stageRoot, "linux");
      const bundleDir = realpathSync(stageRoot);
      const encodedUri = `file://${join(bundleDir, "open-design-webui.desktop").split(" ").join("%20")}`;

      expect(runDesktopExec(stageRoot, encodedUri)).toBe(bundleDir);

      rmSync(parent, { force: true, recursive: true });
    });
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

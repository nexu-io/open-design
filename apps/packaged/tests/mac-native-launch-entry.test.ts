import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { repairMacDockEntries } from "../src/mac-dock-entry.js";
import { refreshMacApplicationRegistration } from "../src/mac-launch-services.js";
import { cleanupConfirmedMacLaunchEntry, promoteMacLaunchEntry } from "../src/mac-launch-entry.js";

const execNative = promisify(execFile);
const lsregister = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
const nativeDescribe = process.platform === "darwin" && process.env.OD_MAC_NATIVE_ACCEPTANCE === "1"
  ? describe : describe.skip;
const nativeTemporaryRoot = process.env.RUNNER_TEMP ?? tmpdir();
const registrationDumpOptions = { timeout: 30_000, maxBuffer: 128 * 1024 * 1024 };

function registrationExcerpt(dump: string, bundleId: string, appPath: string): string {
  const lines = dump.split("\n");
  const selected = new Set<number>();
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index]?.includes(bundleId) && !lines[index]?.includes(appPath)) continue;
    for (let nearby = Math.max(0, index - 30); nearby <= Math.min(lines.length - 1, index + 30); nearby++) selected.add(nearby);
  }
  return [...selected].sort((a, b) => a - b).map((index) => lines[index]).join("\n");
}

function xml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function saveEvidence(name: string, value: unknown): Promise<void> {
  const evidenceDir = process.env.OD_MAC_NATIVE_EVIDENCE_DIR;
  if (evidenceDir == null) return;
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(join(evidenceDir, `${name}.json`), JSON.stringify(value, null, 2));
}

/** A real ad-hoc-signed Mach-O app records the version and actual launch path. */
async function createNativeBundle(input: {
  appPath: string;
  appName: string;
  version: string;
  bundleId: string;
  markerPath: string;
  config?: Record<string, unknown>;
}): Promise<string> {
  const contents = join(input.appPath, "Contents");
  const executable = join(contents, "MacOS", input.appName);
  await mkdir(join(contents, "MacOS"), { recursive: true });
  if (input.config != null) {
    await mkdir(join(contents, "Resources"), { recursive: true });
    await writeFile(join(contents, "Resources", "open-design-config.json"), JSON.stringify(input.config));
  }
  await writeFile(join(contents, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${xml(input.bundleId)}</string>
<key>CFBundleName</key><string>${xml(input.appName)}</string>
<key>CFBundleExecutable</key><string>${xml(input.appName)}</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>${xml(input.version)}</string>
<key>CFBundleShortVersionString</key><string>${xml(input.version)}</string>
<key>LSUIElement</key><true/>
</dict></plist>`);
  const source = join(contents, "fixture.c");
  await writeFile(source, `#include <mach-o/dyld.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
int main(void) {
  char executable[PATH_MAX], resolved[PATH_MAX];
  uint32_t size = sizeof(executable);
  if (_NSGetExecutablePath(executable, &size) != 0) return 10;
  if (realpath(executable, resolved) == NULL) return 11;
  FILE *output = fopen(${JSON.stringify(input.markerPath)}, "a");
  if (output == NULL) return 12;
  fprintf(output, "%s\\t%s\\n", ${JSON.stringify(input.version)}, resolved);
  fclose(output);
  return 0;
}
`);
  await execNative("/usr/bin/xcrun", ["clang", source, "-o", executable], { timeout: 30_000 });
  await rm(source);
  await execNative("/usr/bin/codesign", ["--force", "--sign", "-", input.appPath], { timeout: 10_000 });
  return executable;
}

async function launchByBundleId(bundleId: string, markerPath: string, appPath: string): Promise<{
  version: string;
  executablePath: string;
}> {
  await writeFile(markerPath, "");
  try {
    const dump = await execNative(lsregister, ["-dump"], registrationDumpOptions);
    expect(dump.stdout).toContain(bundleId);
    expect(dump.stdout).toContain(await realpath(appPath));
    await execNative("/usr/bin/open", ["-W", "-n", "-b", bundleId], { timeout: 15_000 });
  } catch (error) {
    const dump = await execNative(lsregister, ["-dump"], registrationDumpOptions);
    const diagnostics = await Promise.allSettled([
      execNative(lsregister, ["-lint", appPath], { timeout: 15_000 }),
      execNative("/usr/bin/plutil", ["-lint", join(appPath, "Contents", "Info.plist")], { timeout: 15_000 }),
      execNative("/usr/bin/codesign", ["--verify", "--deep", "--strict", appPath], { timeout: 15_000 }),
      execNative("/usr/bin/open", ["-W", "-n", appPath], { timeout: 15_000 }),
    ]);
    await saveEvidence(`registration-failure-${bundleId}`, {
      bundleId, appPath, dump: registrationExcerpt(dump.stdout, bundleId, appPath), diagnostics,
    });
    throw error;
  }
  const marker = (await readFile(markerPath, "utf8")).trim();
  const [version, executablePath] = marker.split("\t");
  if (version == null || executablePath == null) throw new Error(`Missing native launch marker: ${marker}`);
  return { version, executablePath };
}

nativeDescribe("macOS native launch entry acceptance", () => {
  it.skipIf(process.env.CI !== "true")("atomically promotes real installed bundles, reopens by bundle ID and rolls back", async () => {
    const root = await mkdtemp(join(nativeTemporaryRoot, "od-native-promotion-"));
    const runtimeRoot = join(root, "launcher");
    const installedLaunchPath = join(root, "Applications", "Open Design.app");
    const markerPath = join(root, "launch.txt");
    const namespace = `native-acceptance-${randomUUID()}`;
    const bundleId = "io.open-design.desktop";
    const sourceExecutables = new Map<string, string>();
    const registrations: string[] = [installedLaunchPath];
    try {
      await mkdir(join(root, "Applications"), { recursive: true });
      const installedExecutable = await createNativeBundle({
        appPath: installedLaunchPath, appName: "Open Design", version: "0.24.0", bundleId, markerPath,
        config: { appVersion: "0.24.0", namespace },
      });
      expect(await refreshMacApplicationRegistration({ executablePath: installedExecutable })).toMatchObject({ status: "registered" });
      expect((await launchByBundleId(bundleId, markerPath, installedLaunchPath)).version).toBe("0.24.0");
      for (const version of ["0.24.1", "0.24.2"]) {
        const sourceBundle = join(runtimeRoot, "versions", version, "payload", "Open Design.app");
        const executablePath = await createNativeBundle({
          appPath: sourceBundle, appName: "Open Design", version, bundleId, markerPath,
          config: { appVersion: version, namespace },
        });
        await writeFile(join(runtimeRoot, "versions", version, "manifest.json"), JSON.stringify({
          schemaVersion: 1, channel: "stable", namespace, version, platform: "darwin", payloadRoot: "payload",
          entry: { cwd: "payload/Open Design.app", executable: "payload/Open Design.app/Contents/MacOS/Open Design" },
        }));
        sourceExecutables.set(version, executablePath);
        registrations.push(sourceBundle);
        // Exercise competing versioned registrations as reported by #8547.
        expect(await refreshMacApplicationRegistration({ executablePath })).toMatchObject({ status: "registered" });
      }
      const launches: { version: string; executablePath: string }[] = [];
      const promotions: unknown[] = [];
      for (const [index, version] of ["0.24.1", "0.24.2", "0.24.1"].entries()) {
        const sourceExecutablePath = sourceExecutables.get(version)!;
        const promotion = await promoteMacLaunchEntry({
          runtimeRoot, channel: "stable", namespace, version, generation: index + 1,
          sourceExecutablePath, installedLaunchPath,
        });
        expect(promotion).toMatchObject({ status: "promoted", launchPath: await realpath(installedLaunchPath) });
        if (promotion.status !== "promoted") throw new Error(`Native promotion failed: ${JSON.stringify(promotion)}`);
        if (index === 0) {
          expect(JSON.parse(await readFile(join(runtimeRoot, "versions", "0.24.0", "manifest.json"), "utf8")))
            .toMatchObject({ schemaVersion: 1, channel: "stable", namespace, version: "0.24.0" });
          expect(JSON.parse(await readFile(join(runtimeRoot, "versions", "0.24.0", "payload", "Open Design.app", "Contents", "Resources", "open-design-config.json"), "utf8")))
            .toMatchObject({ appVersion: "0.24.0", namespace });
        }
        expect(promotion.backupAppBundlePath).toEqual(expect.any(String));
        const previousVersion = index === 0 ? "0.24.0" : index === 1 ? "0.24.1" : "0.24.2";
        expect(JSON.parse(await readFile(join(promotion.backupAppBundlePath!, "Contents", "Resources", "open-design-config.json"), "utf8")))
          .toMatchObject({ appVersion: previousVersion, namespace });
        expect(JSON.parse(await readFile(join(runtimeRoot, "launch-entry.json"), "utf8"))).toMatchObject({
          schemaVersion: 1, channel: "stable", namespace, version, generation: index + 1,
          launchPath: await realpath(installedLaunchPath), executablePath: await realpath(installedExecutable),
          payloadExecutablePath: sourceExecutablePath,
        });
        expect(await refreshMacApplicationRegistration({ executablePath: promotion.executablePath, versionsRoot: join(runtimeRoot, "versions") }))
          .toMatchObject({ status: "registered" });
        expect(await cleanupConfirmedMacLaunchEntry({
          runtimeRoot, launchPath: promotion.launchPath, version, generation: index + 1,
        })).toEqual({ status: "cleaned" });
        await expect(readFile(join(promotion.backupAppBundlePath!, "Contents", "Info.plist"), "utf8"))
          .rejects.toMatchObject({ code: "ENOENT" });
        const launch = await launchByBundleId(bundleId, markerPath, installedLaunchPath);
        expect(launch).toEqual({ version, executablePath: await realpath(installedExecutable) });
        launches.push(launch);
        promotions.push(promotion);
      }
      // Failure after the native exchange must restore the previous bundle.
      await rm(join(runtimeRoot, "launch-entry.json"));
      await mkdir(join(runtimeRoot, "launch-entry.json"));
      const failed = await promoteMacLaunchEntry({
        runtimeRoot, channel: "stable", namespace, version: "0.24.2", generation: 4,
        sourceExecutablePath: sourceExecutables.get("0.24.2")!, installedLaunchPath,
      });
      expect(failed).toMatchObject({ status: "failed" });
      expect(JSON.parse(await readFile(join(installedLaunchPath, "Contents", "Resources", "open-design-config.json"), "utf8")))
        .toMatchObject({ appVersion: "0.24.1", namespace });
      await saveEvidence("bundle-promotion", { installedLaunchPath, promotions, launches, publicationFailureRestoredVersion: "0.24.1" });
    } finally {
      for (const appPath of registrations) await execNative(lsregister, ["-u", appPath], { timeout: 5_000 }).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  }, 120_000);

  it("registers a real application and launches the registered version by bundle ID", async () => {
    const root = await mkdtemp(join(nativeTemporaryRoot, "od-native-registration-"));
    const appPath = join(root, "Open Design Native Test.app");
    const markerPath = join(root, "launch.txt");
    const bundleId = `io.open-design.native-acceptance.${randomUUID()}`;
    try {
      const executablePath = await createNativeBundle({
        appPath, appName: "Open Design Native Test", version: "0.24.1", bundleId, markerPath,
      });
      expect(await refreshMacApplicationRegistration({ executablePath })).toEqual({
        status: "registered", appBundlePath: await realpath(appPath),
      });
      const launch = await launchByBundleId(bundleId, markerPath, appPath);
      expect(launch).toEqual({ version: "0.24.1", executablePath: await realpath(executablePath) });
      const registration = await execNative(lsregister, ["-dump"], registrationDumpOptions);
      expect(registration.stdout).toContain(bundleId);
      expect(registration.stdout).toContain(await realpath(appPath));
      await saveEvidence("launch-services", { bundleId, appPath, launch });
    } finally {
      await execNative(lsregister, ["-u", appPath], { timeout: 5_000 }).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("repairs native Dock preferences while preserving unrelated tiles and binary bookmarks", async () => {
    const root = await mkdtemp(join(nativeTemporaryRoot, "od-native-dock-"));
    const domain = `io.open-design.native-dock.${randomUUID()}`;
    const canonicalAppBundlePath = join(root, "Applications", "Open Design.app");
    const versionsRoot = join(root, "launcher", "versions");
    const oldPayload = join(versionsRoot, "0.24.0", "payload", "Open Design.app");
    const newPayload = join(versionsRoot, "0.24.1", "payload", "Open Design.app");
    const custom = join(root, "Custom", "Open Design.app");
    const finder = "/System/Library/CoreServices/Finder.app";
    const bookmark = Buffer.from("opaque native bookmark\u0000\u0001\u00ff", "utf8").toString("base64");
    function tile(path: string, guid: number): string {
      return `<dict><key>GUID</key><integer>${guid}</integer><key>tile-type</key><string>file-tile</string>
<key>tile-data</key><dict><key>bundle-identifier</key><string>io.open-design.desktop</string>
<key>file-label</key><string>Original label ${guid}</string><key>book</key><data>${bookmark}</data>
<key>custom-opaque</key><data>${bookmark}</data><key>file-data</key><dict>
<key>_CFURLString</key><string>${xml(pathToFileURL(path).href)}</string><key>_CFURLStringType</key><integer>15</integer>
</dict></dict></dict>`;
    }
    const fixturePath = join(root, "dock.plist");
    await writeFile(fixturePath, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>autohide</key><true/>
<key>persistent-others</key><array><dict><key>file-label</key><string>Downloads preserved</string></dict></array>
<key>persistent-apps</key><array>${[tile(oldPayload, 101), tile(finder, 202), tile(newPayload, 303), tile(canonicalAppBundlePath, 404), tile(custom, 505)].join("")}
<dict><key>GUID</key><integer>606</integer><key>tile-type</key><string>spacer-tile</string><key>spacer-owned</key><string>unchanged</string></dict>
<dict><key>GUID</key><integer>707</integer><key>tile-type</key><string>file-tile</string><key>tile-data</key><dict><key>file-label</key><string>Partial tile preserved</string><key>unknown-note</key><string>unchanged</string></dict></dict>
</array>
</dict></plist>`);
    const options = { canonicalAppBundlePath, versionsRoot, appBundleName: "Open Design.app", preferencesDomain: domain, restartDock: false };
    try {
      await execNative("/usr/bin/defaults", ["import", domain, fixturePath]);
      const repaired = await repairMacDockEntries(options);
      expect(repaired).toEqual({ status: "repaired", removedEntries: 2 });
      const inspected = await execNative("/usr/bin/osascript", ["-l", "JavaScript", "-e", `ObjC.import("Foundation");
const defaults = $.NSUserDefaults.alloc.initWithSuiteName(${JSON.stringify(domain)});
const apps = defaults.objectForKey("persistent-apps");
const tiles = [];
function binary(value) { return value && typeof value.isKindOfClass === "function" && value.isKindOfClass($.NSData) ? ObjC.unwrap(value.base64EncodedStringWithOptions(0)) : null; }
function dictionary(value) { return value && typeof value.isKindOfClass === "function" && value.isKindOfClass($.NSDictionary); }
for (let i = 0; i < apps.count; i++) {
  const tile = apps.objectAtIndex(i), data = tile.objectForKey("tile-data");
  if (!dictionary(data) || !dictionary(data.objectForKey("file-data"))) {
    tiles.push(ObjC.deepUnwrap(tile));
    continue;
  }
  tiles.push({guid: ObjC.unwrap(tile.objectForKey("GUID")),
    url: ObjC.unwrap(data.objectForKey("file-data").objectForKey("_CFURLString")),
    label: ObjC.unwrap(data.objectForKey("file-label")),
    bookmark: binary(data.objectForKey("book")), opaque: binary(data.objectForKey("custom-opaque"))});
}
JSON.stringify({tiles, autohide: ObjC.unwrap(defaults.objectForKey("autohide")),
  others: ObjC.deepUnwrap(defaults.objectForKey("persistent-others"))});`], { timeout: 10_000 });
      const result = JSON.parse(inspected.stdout) as {
        tiles: unknown[];
        autohide: boolean;
        others: { "file-label": string }[];
      };
      expect(result).toEqual({
        tiles: [
          { guid: 101, url: pathToFileURL(canonicalAppBundlePath).href, label: "Open Design", bookmark: null, opaque: bookmark },
          { guid: 202, url: pathToFileURL(finder).href, label: "Original label 202", bookmark, opaque: bookmark },
          { guid: 505, url: pathToFileURL(custom).href, label: "Original label 505", bookmark, opaque: bookmark },
          { GUID: 606, "tile-type": "spacer-tile", "spacer-owned": "unchanged" },
          { GUID: 707, "tile-type": "file-tile", "tile-data": { "file-label": "Partial tile preserved", "unknown-note": "unchanged" } },
        ],
        autohide: true,
        others: [{ "file-label": "Downloads preserved" }],
      });
      expect(await repairMacDockEntries(options)).toEqual({ status: "unchanged" });
      await saveEvidence("dock-repair", { domain, repaired, result });
    } finally {
      await execNative("/usr/bin/defaults", ["delete", domain]).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});

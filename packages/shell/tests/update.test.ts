import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  LAUNCHER_SCHEMA_VERSION,
  LauncherProtocolError,
  normalizeLauncherGeneration,
  normalizeLauncherHandoffId,
  resolveLauncherPaths,
  resolveLauncherVersionPaths,
  validateLauncherCleanupDescriptor,
  validateLauncherDesktopHandoffDescriptor,
  validateLauncherRuntimeDescriptor,
  type LauncherCleanupDescriptor,
  type LauncherDesktopHandoffDescriptor,
  type LauncherRuntimeDescriptor,
} from "../src/update/index.js";

const root = process.platform === "win32" ? "C:\\od-data" : "/tmp/od-data";
const shellRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return sourceFilesUnder(path);
    return /\.(?:cts|mts|ts|tsx)$/u.test(path) ? [path] : [];
  });
}

describe("Shell update persistence contract", () => {
  it("stays independent from renderer host and product-owned implementations", () => {
    const pkg = JSON.parse(readFileSync(join(shellRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies).not.toHaveProperty("@open-design/host");
    expect(pkg.dependencies).not.toHaveProperty("@open-design/shell-electron");
    expect(pkg.dependencies).not.toHaveProperty("@open-design/standalone");
    expect(pkg.dependencies).not.toHaveProperty("@open-design/closure");

    const offenders = sourceFilesUnder(join(shellRoot, "src")).filter((path) =>
      /@open-design\/(?:closure|host|shell-electron|standalone)(?:\/|["'])/u.test(
        readFileSync(path, "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("resolves channel, namespace, and version paths below the explicit root", () => {
    const paths = resolveLauncherVersionPaths({
      channel: "beta",
      namespace: "release-beta",
      root,
      version: "0.19.1-beta.2",
    });

    expect(paths.namespaceRoot).toBe(join(root, "launcher", "channels", "beta", "namespaces", "release-beta"));
    expect(paths.runtimePath).toBe(join(paths.namespaceRoot, "runtime.json"));
    expect(paths.handoffPath).toBe(join(paths.namespaceRoot, "state", "desktop-handoff.json"));
    expect(paths.versionRoot).toBe(join(paths.namespaceRoot, "versions", "0.19.1-beta.2"));
    expect(paths.payloadRoot).toBe(join(paths.versionRoot, "payload"));
  });

  it("rejects unsafe roots, namespaces, versions, generations, and handoff ids", () => {
    expect(() => resolveLauncherPaths({ channel: "beta", namespace: "../escape", root })).toThrow(LauncherProtocolError);
    expect(() => resolveLauncherPaths({ channel: "Canary", namespace: "release-beta", root })).toThrow(LauncherProtocolError);
    expect(() => resolveLauncherPaths({ channel: "beta", namespace: "release-beta", root: "relative" })).toThrow(LauncherProtocolError);
    expect(() => resolveLauncherVersionPaths({ channel: "beta", namespace: "release-beta", root, version: "../0.19.1" })).toThrow(LauncherProtocolError);
    expect(() => normalizeLauncherGeneration(-1)).toThrow(LauncherProtocolError);
    expect(() => normalizeLauncherHandoffId("../handoff")).toThrow(LauncherProtocolError);
  });

  it("validates runtime identity without changing the serialized schema", () => {
    const runtime: LauncherRuntimeDescriptor = {
      active: { generation: 3, version: "0.19.1-beta.3" },
      channel: "beta",
      lastSuccessful: { generation: 2, version: "0.19.1-beta.2" },
      namespace: "release-beta",
      schemaVersion: LAUNCHER_SCHEMA_VERSION,
    };

    expect(validateLauncherRuntimeDescriptor(runtime, {
      channel: "beta",
      namespace: "release-beta",
    })).toEqual(runtime);
  });

  it("validates desktop handoff and cleanup records", () => {
    const handoff: LauncherDesktopHandoffDescriptor = {
      channel: "beta",
      createdAt: "2026-08-13T00:00:00.000Z",
      handoffId: "f5d4a712-8ba9-4c28-bcad-6dbed5db2d7c",
      namespace: "release-beta",
      outer: { executablePath: join(root, "Open Design.exe"), pid: 1234 },
      payloadExecutablePath: join(root, "payload", "Open Design.exe"),
      previous: { generation: 1, version: "0.19.1-beta.1" },
      schemaVersion: LAUNCHER_SCHEMA_VERSION,
      source: { generation: 2, version: "0.19.1-beta.2" },
      state: "confirmed",
      target: { generation: 2, version: "0.19.1-beta.2" },
      updatedAt: "2026-08-13T00:00:01.000Z",
    };
    expect(validateLauncherDesktopHandoffDescriptor(handoff, {
      channel: "beta",
      namespace: "release-beta",
    })).toEqual(handoff);

    const cleanup: LauncherCleanupDescriptor = {
      channel: "beta",
      namespace: "release-beta",
      updatedAt: "2026-08-13T00:00:02.000Z",
      version: LAUNCHER_SCHEMA_VERSION,
      versions: [{
        generation: 1,
        reason: "older-than-bound-package",
        state: "deprecated",
        updatedAt: "2026-08-13T00:00:02.000Z",
        version: "0.19.1-beta.1",
      }],
    };
    expect(validateLauncherCleanupDescriptor(cleanup, {
      channel: "beta",
      namespace: "release-beta",
    })).toEqual(cleanup);
  });
});

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { stagePublishedArtifact } from "@/artifacts/stage.js";
import { resolveToolPackConfig } from "@/config/index.js";
import { resolveMacPaths } from "@/mac/paths.js";
import { resolveWinPaths } from "@/win/paths.js";

const roots: string[] = [];
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it.each(["mac_arm64", "mac_x64", "win_x64"] as const)("stages %s using the installation path's single source of truth", async (target) => {
  const root = mkdtempSync(join(tmpdir(), "stage-installer-")); roots.push(root);
  vi.stubEnv("GITHUB_OUTPUT", "");
  const bytes = Buffer.from("installer fixture"), sha256 = createHash("sha256").update(bytes).digest("hex");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes)));
  const reference = join(root, "reference.json"), buildJson = join(root, "build.json");
  const descriptor = { schemaVersion: 1, target, releaseVersion: "0.22.3-beta.1", channel: "beta", name: "installer", url: "https://cdn.example/installer", sha256 };
  writeFileSync(reference, JSON.stringify(descriptor));
  await stagePublishedArtifact(reference, { dir: root, namespace: "smoke", buildJson });
  const config = resolveToolPackConfig(target === "win_x64" ? "win" : "mac", { dir: root, namespace: "smoke", appVersion: descriptor.releaseVersion });
  const destination = target === "win_x64" ? resolveWinPaths(config).setupPath : resolveMacPaths(config).dmgPath;
  expect(readFileSync(destination)).toEqual(bytes);
  const report = JSON.parse(readFileSync(buildJson, "utf8"));
  expect(report.publishedArtifact).toEqual({ bytes: bytes.length, name: "installer", sha256, url: descriptor.url });
  expect(report[target === "win_x64" ? "installerPath" : "dmgPath"]).toBe(destination);
});

it("never replaces an existing installer or emits a successful build record after checksum failure", async () => {
  const root = mkdtempSync(join(tmpdir(), "stage-installer-")); roots.push(root);
  const reference = join(root, "reference.json"), buildJson = join(root, "build.json");
  writeFileSync(reference, JSON.stringify({ schemaVersion: 1, target: "win_x64", releaseVersion: "0.22.3-beta.1", channel: "beta", name: "installer", url: "https://cdn.example/installer", sha256: "a".repeat(64) }));
  const destination = resolveWinPaths(resolveToolPackConfig("win", { dir: root, namespace: "smoke" })).setupPath;
  mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, "previous");
  vi.stubGlobal("fetch", vi.fn(async () => new Response("corrupt")));
  await expect(stagePublishedArtifact(reference, { dir: root, namespace: "smoke", buildJson })).rejects.toThrow();
  expect(readFileSync(destination, "utf8")).toBe("previous");
  expect(existsSync(buildJson)).toBe(false);
});

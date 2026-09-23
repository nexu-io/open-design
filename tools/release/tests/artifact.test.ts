import { afterEach, expect, it, vi } from "vitest";
import { readPublishedMetadata, resolvePublishedInstaller } from "@/metadata/artifact.ts";

afterEach(() => vi.unstubAllGlobals());

it("rejects mismatched dispatched metadata before resolving an installer", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ releaseVersion: "0.22.3-beta.1", channel: "beta", github: { commit: "one" } })));
  for (const expected of [{ version: "other" }, { channel: "stable" }, { commit: "two" }]) {
    await expect(readPublishedMetadata("https://cdn.example/metadata.json", expected)).rejects.toThrow("does not match");
  }
});

it("resolves the published primary installer and checksum without installation paths", async () => {
  const sha256 = "a".repeat(64);
  const fetcher = vi.fn(async () => new Response(`${sha256}  setup.exe\n`));
  vi.stubGlobal("fetch", fetcher);
  const result = await resolvePublishedInstaller({ releaseVersion: "0.22.3-beta.1", channel: "beta", releaseTargets: {
    win_x64: { status: "published", artifacts: { installer: { name: "setup.exe", url: "https://cdn.example/setup.exe", sha256Url: "https://cdn.example/setup.exe.sha256" } } },
  } }, "win_x64");
  expect(result).toEqual({ schemaVersion: 1, target: "win_x64", releaseVersion: "0.22.3-beta.1", channel: "beta", name: "setup.exe", url: "https://cdn.example/setup.exe", sha256 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("refuses unpublished targets and absent or malformed checksum sidecars", async () => {
  await expect(resolvePublishedInstaller({ releaseTargets: { mac_arm64: { status: "missing" } } }, "mac_arm64")).rejects.toThrow("lacks");
  const metadata = { releaseVersion: "0.22.3-beta.1", channel: "beta", releaseTargets: {
    mac_arm64: { status: "published", artifacts: { dmg: { url: "https://cdn.example/a.dmg", sha256Url: "" } } },
  } };
  await expect(resolvePublishedInstaller(metadata, "mac_arm64")).rejects.toThrow("sha256");
  metadata.releaseTargets.mac_arm64.artifacts.dmg.sha256Url = "https://cdn.example/a.sha256";
  vi.stubGlobal("fetch", vi.fn(async () => new Response("not-a-checksum")));
  await expect(resolvePublishedInstaller(metadata, "mac_arm64")).rejects.toThrow("invalid published installer");
});

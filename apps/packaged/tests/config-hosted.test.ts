import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import type { LauncherHost } from "@open-design/launcher-proto";
const mock = vi.hoisted(() => ({ host: null as LauncherHost | null }));
vi.mock("@open-design/launcher-proto", async original => ({ ...await original<object>(), readLauncherHost: () => mock.host }));
vi.mock("electron", () => ({ app: { getPath: () => "/unused", getAppPath: () => "/unused" } }));
import { readPackagedConfig } from "../src/config.js";
afterEach(() => { mock.host = null; vi.unstubAllEnvs(); });
it("reads the selected payload config on cold start even when tools-pack names an older outer config", async () => {
  const root = await mkdtemp(join(tmpdir(), "hosted-config-"));
  try {
    const resources = join(root, "payload", "Contents", "Resources");
    await mkdir(resources, { recursive: true });
    await writeFile(join(resources, "open-design-config.json"), JSON.stringify({ appVersion: "1.1.0", namespace: "test", namespaceBaseRoot: "/baked/other/namespaces" }));
    const outer = join(root, "outer.json");
    await writeFile(outer, JSON.stringify({ appVersion: "1.0.0", namespace: "test" }));
    vi.stubEnv("OD_PACKAGED_CONFIG_PATH", outer);
    mock.host = { namespaceBaseRoot: join(root, "stable", "namespaces"), running: { source: "payload", resourcesPath: resources } } as LauncherHost;
    const config = await readPackagedConfig();
    expect(config.appVersion).toBe("1.1.0");
    expect(config.resourceRoot).toBe(join(resources, "open-design"));
    expect(config.namespaceBaseRoot).toBe(mock.host.namespaceBaseRoot);
    mock.host = { ...mock.host, running: { ...mock.host.running, source: "bundled" } };
    expect((await readPackagedConfig()).appVersion).toBe("1.0.0");
  } finally { await rm(root, { recursive: true, force: true }); }
});

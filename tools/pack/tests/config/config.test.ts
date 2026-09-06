import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveToolPackConfig, WORKSPACE_ROOT } from "@/config/index.js";

describe("tools-pack Shell adapter configuration", () => {
  it("derives the namespace from the channel release version", () => {
    const config = resolveToolPackConfig("mac", { appVersion: "0.1.0-betahyx.3" });
    expect(config.namespace).toBe("release-betahyx");
    expect(config.appVersion).toBe("0.1.0-betahyx.3");
  });

  it("keeps explicit cache and runtime roots local to tools-pack", () => {
    const config = resolveToolPackConfig("mac", { cacheDir: ".tmp/cache", dir: ".tmp/output", namespace: "local-e2e" });
    expect(config.roots.cacheRoot).toBe(resolve(".tmp/cache"));
    expect(config.roots.output.namespaceRoot).toBe(resolve(".tmp/output/out/mac/namespaces/local-e2e"));
    expect(config.roots.runtime.namespaceRoot).toBe(resolve(".tmp/output/runtime/mac/namespaces/local-e2e"));
    expect(config.workspaceRoot).toBe(WORKSPACE_ROOT);
  });

  it("accepts only HTTP(S) authority bootstrap URLs", () => {
    expect(resolveToolPackConfig("mac", { standaloneBootstrapUrl: "http://127.0.0.1:43123/bootstrap.json" }).standaloneBootstrapUrl)
      .toBe("http://127.0.0.1:43123/bootstrap.json");
    expect(() => resolveToolPackConfig("mac", { standaloneBootstrapUrl: "file:///tmp/bootstrap.json" })).toThrow("http(s)");
  });
});

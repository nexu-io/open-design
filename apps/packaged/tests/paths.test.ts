import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolvePackagedNamespacePaths } from "../src/paths.js";
import type { PackagedConfig } from "../src/config.js";

describe("resolvePackagedNamespacePaths", () => {
  it("models update downloads as a namespace-scoped root beside data", () => {
    const config: PackagedConfig = {
      appVersion: "1.2.3",
      daemonCliEntry: null,
      daemonSidecarEntry: null,
      namespace: "release",
      namespaceBaseRoot: "/tmp/open-design-packaged/namespaces",
      nodeCommand: null,
      resourceRoot: "/tmp/open-design-packaged/resources",
      telemetryRelayUrl: null,
      posthogKey: null,
      posthogHost: null,
      webSidecarEntry: null,
      webStandaloneRoot: null,
      webOutputMode: "server",
    };

    const paths = resolvePackagedNamespacePaths(config);
    expect(paths.namespaceRoot).toBe(join(config.namespaceBaseRoot, "release"));
    expect(paths.dataRoot).toBe(join(paths.namespaceRoot, "data"));
    expect(paths.updateRoot).toBe(join(paths.namespaceRoot, "updates"));
  });
});

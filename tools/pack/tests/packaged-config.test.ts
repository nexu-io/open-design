import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ToolPackConfig } from "../src/config.js";
import { createPackagedRuntimeConfig } from "../src/packaged-config.js";

function createConfig(root: string): ToolPackConfig {
  return {
    containerized: false,
    electronBuilderCliPath: "/x/electron-builder/cli.js",
    electronDistPath: "/x/electron/dist",
    electronVersion: "41.3.0",
    macCompression: "normal",
    namespace: "release-beta",
    platform: "mac",
    portable: false,
    removeData: false,
    removeLogs: false,
    removeProductUserData: false,
    removeSidecars: false,
    roots: {
      output: {
        appBuilderRoot: join(root, "out", "mac", "namespaces", "release-beta", "builder"),
        namespaceRoot: join(root, "out", "mac", "namespaces", "release-beta"),
        platformRoot: join(root, "out", "mac"),
        root: join(root, "out"),
      },
      runtime: {
        namespaceBaseRoot: join(root, "runtime", "mac", "namespaces"),
        namespaceRoot: join(root, "runtime", "mac", "namespaces", "release-beta"),
      },
      cacheRoot: join(root, "cache"),
      toolPackRoot: root,
    },
    sentryAuthToken: "upload-token",
    sentryDsn: "https://public@example.ingest.sentry.io/daemon",
    sentryEnvironment: "production",
    sentryTracesSampleRate: "0.1",
    signed: false,
    silent: true,
    to: "app",
    webOutputMode: "standalone",
    webSentryDsn: "https://public@example.ingest.sentry.io/web",
    workspaceRoot: root,
  };
}

describe("createPackagedRuntimeConfig", () => {
  it("bakes public Sentry DSNs into packaged runtime config without storing upload tokens", () => {
    const config = createPackagedRuntimeConfig(createConfig("/work"), "1.2.3", {
      nodeCommandRelative: "open-design/bin/node",
    });

    expect(config).toMatchObject({
      appVersion: "1.2.3",
      namespace: "release-beta",
      namespaceBaseRoot: join("/work", "runtime", "mac", "namespaces"),
      nodeCommandRelative: "open-design/bin/node",
      sentryDsn: "https://public@example.ingest.sentry.io/daemon",
      sentryEnvironment: "production",
      sentryTracesSampleRate: "0.1",
      webOutputMode: "standalone",
      webSentryDsn: "https://public@example.ingest.sentry.io/web",
    });
    expect(config).not.toHaveProperty("sentryAuthToken");
    expect(config).not.toHaveProperty("SENTRY_AUTH_TOKEN");
  });
});

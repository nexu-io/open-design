import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PackagedConfig } from "../src/config.js";
import { PackagedPathAccessError } from "../src/errors.js";
import { resolvePackagedNamespacePaths } from "../src/paths.js";

function stubPlatform(value: NodeJS.Platform): () => void {
  const original = process.platform;
  Object.defineProperty(process, "platform", { value, configurable: true });
  return () => {
    Object.defineProperty(process, "platform", { value: original, configurable: true });
  };
}

function fakeConfig(): PackagedConfig {
  return {
    appVersion: null,
    daemonCliEntry: null,
    daemonSidecarEntry: null,
    namespace: "release-stable-win",
    namespaceBaseRoot: join("C:", "Users", "Fred", "AppData", "Roaming", "Open Design", "namespaces"),
    nodeCommand: null,
    posthogHost: null,
    posthogKey: null,
    resourceRoot: join("C:", "Program Files", "Open Design", "resources", "open-design"),
    telemetryRelayUrl: null,
    webOutputMode: "server",
    webSidecarEntry: null,
    webStandaloneRoot: null,
  };
}

describe("resolvePackagedNamespacePaths", () => {
  let restorePlatform: () => void = () => {};

  beforeEach(() => {
    restorePlatform = stubPlatform("win32");
  });

  afterEach(() => {
    restorePlatform();
  });

  it("models update downloads as a namespace-scoped root beside data", () => {
    const config = fakeConfig();
    const paths = resolvePackagedNamespacePaths(config, config.namespace);

    expect(paths.namespaceRoot).toBe(join(config.namespaceBaseRoot, config.namespace));
    expect(paths.dataRoot).toBe(join(paths.namespaceRoot, "data"));
    expect(paths.updateRoot).toBe(join(paths.namespaceRoot, "updates"));
    expect(paths.installerObservationRoot).toBe(join(paths.dataRoot, "observations", "installer"));
  });

  it("rejects namespace overrides that would escape the namespace base root", () => {
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

    expect(() => resolvePackagedNamespacePaths(config, "../release")).toThrow(/namespace/);
  });

  it("defaults daemon dataRoot to the namespace-scoped packaged data directory", () => {
    const config = fakeConfig();

    expect(resolvePackagedNamespacePaths(config, config.namespace).dataRoot).toBe(
      join(config.namespaceBaseRoot, config.namespace, "data"),
    );
  });

  it("uses OD_DATA_DIR as a base for the namespace-scoped packaged daemon dataRoot", () => {
    const config = fakeConfig();
    const override = join("C:", "Users", "Fred", "MyProject", "design", ".od");

    expect(
      resolvePackagedNamespacePaths(config, config.namespace, { OD_DATA_DIR: override }).dataRoot,
    ).toBe(join(override, "namespaces", config.namespace, "data"));
  });

  it("keeps shared OD_DATA_DIR overrides isolated across packaged namespaces", () => {
    const config = fakeConfig();
    const override = join("C:", "Users", "Fred", "MyProject", "design", ".od");
    const stable = resolvePackagedNamespacePaths(config, "release-stable-win", {
      OD_DATA_DIR: override,
    });
    const beta = resolvePackagedNamespacePaths(config, "release-beta-win", {
      OD_DATA_DIR: override,
    });

    expect(stable.dataRoot).toBe(join(override, "namespaces", "release-stable-win", "data"));
    expect(beta.dataRoot).toBe(join(override, "namespaces", "release-beta-win", "data"));
    expect(stable.dataRoot).not.toBe(beta.dataRoot);
  });

  it("preserves already-scoped packaged OD_DATA_DIR values as the final daemon dataRoot", () => {
    const config = fakeConfig();
    const override = join(
      "C:",
      "Users",
      "Fred",
      "AppData",
      "Roaming",
      "Open Design",
      "namespaces",
      config.namespace,
      "data",
    );

    expect(
      resolvePackagedNamespacePaths(config, config.namespace, { OD_DATA_DIR: override }).dataRoot,
    ).toBe(override);
  });

  it("rejects already-scoped OD_DATA_DIR values that point at a different packaged namespace", () => {
    const config = fakeConfig();
    const override = join(
      "C:",
      "Users",
      "Fred",
      "AppData",
      "Roaming",
      "Open Design",
      "namespaces",
      "release-beta-win",
      "data",
    );

    expect(
      () =>
        resolvePackagedNamespacePaths(config, config.namespace, {
          OD_DATA_DIR: override,
        }),
    ).toThrow(PackagedPathAccessError);
  });

  it("forwards the OD_DATA_DIR-resolved dataRoot into sidecar launch paths", () => {
    const config = fakeConfig();
    const override = join("C:", "Users", "Fred", "MyProject", "design", ".od");
    const paths = resolvePackagedNamespacePaths(config, config.namespace, {
      OD_DATA_DIR: override,
    });

    expect(paths.dataRoot).toBe(join(override, "namespaces", config.namespace, "data"));
    expect(paths.namespaceRoot).toBe(join(config.namespaceBaseRoot, config.namespace));
    expect(paths.runtimeRoot).toBe(join(config.namespaceBaseRoot, config.namespace, "runtime"));
  });

  it("does not read process.env implicitly so headless can keep namespace-root OD_DATA_DIR semantics", () => {
    const config = fakeConfig();
    const original = process.env.OD_DATA_DIR;
    try {
      process.env.OD_DATA_DIR = join("C:", "Users", "Fred", "MyProject", "design", ".od");
      expect(resolvePackagedNamespacePaths(config).dataRoot).toBe(
        join(config.namespaceBaseRoot, config.namespace, "data"),
      );
    } finally {
      if (original == null) delete process.env.OD_DATA_DIR;
      else process.env.OD_DATA_DIR = original;
    }
  });

  it("rejects relative OD_DATA_DIR values instead of resolving them against cwd", () => {
    const config = fakeConfig();

    expect(
      () => resolvePackagedNamespacePaths(config, config.namespace, { OD_DATA_DIR: "project/.od" }),
    ).toThrow(/OD_DATA_DIR.*absolute path/);
  });

  it("surfaces the relative-OD_DATA_DIR rejection as PackagedPathAccessError so packaged main() can show a dialog", () => {
    const config = fakeConfig();

    let captured: unknown;
    try {
      resolvePackagedNamespacePaths(config, config.namespace, { OD_DATA_DIR: "project/.od" });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(PackagedPathAccessError);
    const err = captured as PackagedPathAccessError;
    expect(err.title).toMatch(/OD_DATA_DIR/);
    expect(err.message).toContain("project/.od");
    expect(err.message).toMatch(/absolute path/);
  });

  it("rejects Windows-style OD_DATA_DIR values on non-Windows hosts so the absolute-path guard is platform-correct", () => {
    const config = fakeConfig();
    const restore = stubPlatform("linux");
    try {
      expect(
        () =>
          resolvePackagedNamespacePaths(config, config.namespace, {
            OD_DATA_DIR: "C:\\Users\\Fred\\OD",
          }),
      ).toThrow(PackagedPathAccessError);
      expect(
        () =>
          resolvePackagedNamespacePaths(config, config.namespace, {
            OD_DATA_DIR: "\\\\server\\share",
          }),
      ).toThrow(PackagedPathAccessError);
    } finally {
      restore();
    }
  });
});

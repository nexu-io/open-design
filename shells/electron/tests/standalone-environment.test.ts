import { describe, expect, it } from "vitest";

import {
  createStandaloneBootstrapEnvironment,
  resolveShellNodeCommand,
  withStandaloneBootstrapEnvironment,
} from "../src/standalone-environment.js";

describe("Electron Standalone environment projection", () => {
  it("accepts a Shell-owned Node and rejects an Electron fallback", () => {
    expect(resolveShellNodeCommand("/shell/node")).toBe("/shell/node");
    if (process.versions.electron == null) expect(resolveShellNodeCommand(null)).toBe(process.execPath);
  });
  it("projects product config without exposing body layout to the shell", () => {
    expect(createStandaloneBootstrapEnvironment({
      appVersion: "0.18.0-beta.4",
      config: {
        amrProfile: "feature-test",
        posthogHost: "https://analytics.example.test",
        posthogKey: "phc_test",
        telemetryRelayUrl: "https://telemetry.example.test",
        velaWebUrl: "https://vela.example.test",
      },
      mcpBootstrap: {
        args: ["mcp", "serve"],
        command: "/Applications/Open Design.app/Contents/MacOS/Open Design",
      },
      nodeCommand: "/Applications/Open Design.app/Contents/Resources/open-design/bin/node",
    }, { HOME: "/Users/test" })).toEqual({
      HOME: "/Users/test",
      OD_APP_VERSION: "0.18.0-beta.4",
      OD_MCP_BOOTSTRAP_ARGS: "[\"mcp\",\"serve\"]",
      OD_MCP_BOOTSTRAP_COMMAND: "/Applications/Open Design.app/Contents/MacOS/Open Design",
      OD_NODE_BIN: "/Applications/Open Design.app/Contents/Resources/open-design/bin/node",
      OD_REQUIRE_DESKTOP_AUTH: "1",
      OD_VELA_WEB_URL: "https://vela.example.test",
      OPEN_DESIGN_AMR_PROFILE: "feature-test",
      OPEN_DESIGN_TELEMETRY_RELAY_URL: "https://telemetry.example.test",
      POSTHOG_HOST: "https://analytics.example.test",
      POSTHOG_KEY: "phc_test",
    });
  });

  it("lets a windowless shell disable the Desktop auth gate", () => {
    expect(createStandaloneBootstrapEnvironment({
      appVersion: "0.18.0-beta.4",
      config: {
        amrProfile: null,
        posthogHost: null,
        posthogKey: null,
        telemetryRelayUrl: null,
        velaWebUrl: null,
      },
      mcpBootstrap: { args: [], command: null },
      nodeCommand: "/shell/node",
      requireDesktopAuth: false,
    }, {})).toMatchObject({
      OD_NODE_BIN: "/shell/node",
      OD_REQUIRE_DESKTOP_AUTH: "0",
    });
  });

  it("restores Electron-sensitive environment after the handoff resolves", async () => {
    const previousNodeBin = process.env.OD_NODE_BIN;
    const previousAppVersion = process.env.OD_APP_VERSION;
    delete process.env.OD_NODE_BIN;
    process.env.OD_APP_VERSION = "outer-version";
    try {
      await withStandaloneBootstrapEnvironment({
        appVersion: "0.18.0-beta.4",
        config: {
          amrProfile: null,
          posthogHost: null,
          posthogKey: null,
          telemetryRelayUrl: null,
          velaWebUrl: null,
        },
        mcpBootstrap: { args: [], command: null },
        nodeCommand: "/shell/node",
      }, async () => {
        expect(process.env.OD_NODE_BIN).toBe("/shell/node");
        expect(process.env.OD_APP_VERSION).toBe("0.18.0-beta.4");
      });
      expect(process.env.OD_NODE_BIN).toBeUndefined();
      expect(process.env.OD_APP_VERSION).toBe("outer-version");
    } finally {
      if (previousNodeBin == null) delete process.env.OD_NODE_BIN;
      else process.env.OD_NODE_BIN = previousNodeBin;
      if (previousAppVersion == null) delete process.env.OD_APP_VERSION;
      else process.env.OD_APP_VERSION = previousAppVersion;
    }
  });
});

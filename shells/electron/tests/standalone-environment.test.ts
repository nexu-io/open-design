import { describe, expect, it } from "vitest";

import { createStandaloneBootstrapEnvironment } from "../src/standalone-environment.js";

describe("Electron Standalone environment projection", () => {
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
    }, { HOME: "/Users/test" })).toEqual({
      HOME: "/Users/test",
      ELECTRON_RUN_AS_NODE: "1",
      OD_APP_VERSION: "0.18.0-beta.4",
      OD_MCP_BOOTSTRAP_ARGS: "[\"mcp\",\"serve\"]",
      OD_MCP_BOOTSTRAP_COMMAND: "/Applications/Open Design.app/Contents/MacOS/Open Design",
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
      requireDesktopAuth: false,
    }, {})).toMatchObject({
      ELECTRON_RUN_AS_NODE: "1",
      OD_REQUIRE_DESKTOP_AUTH: "0",
    });
  });
});

import { describe, expect, it } from "vitest";

import { inspectElectronCdp, parseElectronCdpActivePort } from "@/runtime/session/cdp.js";

describe("Electron native CDP discovery", () => {
  it("parses Chromium's ephemeral DevToolsActivePort receipt", () => {
    expect(parseElectronCdpActivePort("43123\n/devtools/browser/abc\n")).toEqual({
      state: "ready",
      transport: "tcp",
      address: "127.0.0.1",
      port: 43123,
      discoveryUrl: "http://127.0.0.1:43123",
      browserWebSocketUrl: "ws://127.0.0.1:43123/devtools/browser/abc",
    });
  });

  it("projects disabled and explicit fixed-port launches", () => {
    const disabled = {
      commandLine: { hasSwitch: () => false, getSwitchValue: () => "" },
      getPath: () => "/unused",
    };
    expect(inspectElectronCdp(disabled)).toEqual({ state: "disabled" });

    const fixed = {
      commandLine: {
        hasSwitch: (name: string) => name === "remote-debugging-port",
        getSwitchValue: (name: string) => name === "remote-debugging-port" ? "9222" : "",
      },
      getPath: () => "/unused",
    };
    expect(inspectElectronCdp(fixed)).toMatchObject({ state: "ready", port: 9222 });
  });
});

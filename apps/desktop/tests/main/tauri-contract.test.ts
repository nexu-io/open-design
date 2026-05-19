import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  APP_KEYS,
  SIDECAR_MESSAGES,
  SIDECAR_STAMP_FIELDS,
  SIDECAR_STAMP_FLAGS,
} from "@open-design/sidecar-proto";

const rustSource = readFileSync(new URL("../../src-tauri/src/main.rs", import.meta.url), "utf8");
const defaultCapability = JSON.parse(
  readFileSync(new URL("../../src-tauri/capabilities/default.json", import.meta.url), "utf8"),
) as {
  permissions?: string[];
  remote?: {
    urls?: string[];
  };
};
const tauriConfig = JSON.parse(readFileSync(new URL("../../src-tauri/tauri.conf.json", import.meta.url), "utf8")) as {
  app?: {
    withGlobalTauri?: boolean;
  };
};

describe("Tauri sidecar contract constants", () => {
  it("keeps app keys and message names aligned with sidecar-proto", () => {
    for (const value of Object.values(APP_KEYS)) {
      expect(rustSource).toContain(`"${value}"`);
    }
    for (const value of Object.values(SIDECAR_MESSAGES)) {
      expect(rustSource).toContain(`"${value}"`);
    }
  });

  it("keeps stamp fields and flags aligned with sidecar-proto", () => {
    for (const field of SIDECAR_STAMP_FIELDS) {
      expect(rustSource).toContain(`"${field}"`);
    }
    for (const flag of Object.values(SIDECAR_STAMP_FLAGS)) {
      expect(rustSource).toContain(`"${flag}"`);
    }
  });

  it("keeps JSON IPC response envelopes aligned with sidecar runtime framing", () => {
    expect(rustSource).toContain('json!({ "ok": true, "result": result })');
    expect(rustSource).toContain('json!({ "ok": false, "error": { "message": message.into() } })');
  });

  it("allows Tauri command IPC from the local web sidecar URL", () => {
    expect(defaultCapability.remote?.urls).toEqual(
      expect.arrayContaining(["http://127.0.0.1:*/**", "http://localhost:*/**"]),
    );
    expect(defaultCapability.permissions).toEqual(
      expect.arrayContaining([
        "allow-desktop-inspect-eval-result",
        "allow-desktop-open-external",
        "allow-desktop-open-project-path",
        "allow-desktop-pick-and-import",
      ]),
    );
    expect(tauriConfig.app?.withGlobalTauri).toBe(true);
  });
});

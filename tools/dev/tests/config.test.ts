import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveDesktopRuntimeKind,
  resolveToolDevConfig,
} from "../src/config.js";

test("resolveDesktopRuntimeKind defaults to Electron during parallel migration", () => {
  assert.equal(resolveDesktopRuntimeKind(undefined), "electron");
  assert.equal(resolveDesktopRuntimeKind(""), "electron");
});

test("resolveDesktopRuntimeKind accepts the opt-in Tauri runtime", () => {
  assert.equal(resolveDesktopRuntimeKind("electron"), "electron");
  assert.equal(resolveDesktopRuntimeKind("tauri"), "tauri");
});

test("resolveDesktopRuntimeKind rejects unsupported runtimes", () => {
  assert.throws(() => resolveDesktopRuntimeKind("neutralino"), /--desktop-runtime must be one of/);
});

test("resolveToolDevConfig exposes the Tauri manifest path for tools-dev desktop spawn", () => {
  const config = resolveToolDevConfig({ namespace: "tauri-config-test" });

  assert.match(config.apps.desktop.tauriManifestPath, /apps\/desktop\/src-tauri\/Cargo\.toml$/);
  assert.match(config.apps.desktop.tauriDebugBinaryPath, /apps\/desktop\/src-tauri\/target\/debug\/open-design-desktop-tauri(\.exe)?$/);
});

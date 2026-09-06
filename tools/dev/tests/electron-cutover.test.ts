import assert from "node:assert/strict";
import { test } from "node:test";

import { APP_KEYS } from "@open-design/sidecar-proto";

import {
  DEFAULT_START_APPS,
  DEFAULT_OBSERVE_APPS,
  DEFAULT_STOP_APPS,
  resolveStartApps,
  resolveToolDevConfig,
} from "../src/config.js";

test("desktop remains the public selector while owning the integrated Electron stack", () => {
  assert.deepEqual(DEFAULT_START_APPS, [APP_KEYS.DESKTOP]);
  assert.deepEqual(DEFAULT_STOP_APPS, [APP_KEYS.DESKTOP]);
  assert.deepEqual(DEFAULT_OBSERVE_APPS, [APP_KEYS.DAEMON, APP_KEYS.WEB, APP_KEYS.DESKTOP]);
  assert.deepEqual(resolveStartApps(APP_KEYS.DESKTOP), [APP_KEYS.DESKTOP]);
  const config = resolveToolDevConfig({ namespace: "electron-cutover" });
  assert.match(config.apps.desktop.lifecycleScriptPath, /shells\/electron\/scripts\/dev-lifecycle\.ts$/u);
  assert.doesNotMatch(JSON.stringify(config.apps.desktop), /apps\/desktop|@open-design\/desktop/u);
});

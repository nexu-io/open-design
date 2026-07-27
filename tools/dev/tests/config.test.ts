import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { APP_KEYS } from "@open-design/sidecar-proto";

import {
  parsePortOption,
  resolveRunApps,
  resolveStartApps,
  resolveStopApps,
  resolveTargetApps,
} from "../src/config.js";

describe("parsePortOption", () => {
  it("returns null when the value is null", () => {
    assert.equal(parsePortOption(null, "--daemon-port"), null);
  });

  it("returns null when the value is undefined", () => {
    assert.equal(parsePortOption(undefined, "--daemon-port"), null);
  });

  it("returns null when the value is the empty string", () => {
    assert.equal(parsePortOption("", "--daemon-port"), null);
  });

  it("accepts a numeric string at the lower edge of the valid range", () => {
    assert.equal(parsePortOption("1", "--daemon-port"), 1);
  });

  it("accepts a numeric string at the upper edge of the valid range", () => {
    assert.equal(parsePortOption("65535", "--daemon-port"), 65535);
  });

  it("accepts a raw integer", () => {
    assert.equal(parsePortOption(17456, "--daemon-port"), 17456);
  });

  it("throws when the value is one above the upper edge", () => {
    assert.throws(() => parsePortOption("65536", "--daemon-port"), /--daemon-port must be an integer between 1 and 65535/);
  });

  it("throws when the value is zero", () => {
    assert.throws(() => parsePortOption("0", "--daemon-port"), /--daemon-port must be an integer between 1 and 65535/);
  });

  it("throws when the value is non-numeric", () => {
    assert.throws(() => parsePortOption("abc", "--web-port"), /--web-port must be an integer between 1 and 65535/);
  });

  it("throws when the value is a non-integer number", () => {
    assert.throws(() => parsePortOption("3.14", "--daemon-port"), /--daemon-port must be an integer between 1 and 65535/);
  });
});

describe("resolveStartApps", () => {
  it("defaults to all three apps when no app name is given", () => {
    assert.deepEqual(resolveStartApps(undefined), [APP_KEYS.DAEMON, APP_KEYS.WEB, APP_KEYS.DESKTOP]);
  });

  it("returns daemon+web when starting web", () => {
    assert.deepEqual(resolveStartApps(APP_KEYS.WEB), [APP_KEYS.DAEMON, APP_KEYS.WEB]);
  });

  it("returns all three when starting desktop", () => {
    assert.deepEqual(resolveStartApps(APP_KEYS.DESKTOP), [APP_KEYS.DAEMON, APP_KEYS.WEB, APP_KEYS.DESKTOP]);
  });

  it("returns daemon-only when starting daemon", () => {
    assert.deepEqual(resolveStartApps(APP_KEYS.DAEMON), [APP_KEYS.DAEMON]);
  });

  it("throws on an unknown app name", () => {
    assert.throws(() => resolveStartApps("api"), /unsupported tools-dev app: api/);
  });
});

describe("resolveStopApps", () => {
  it("defaults to desktop+web+daemon in shutdown order", () => {
    assert.deepEqual(resolveStopApps(undefined), [APP_KEYS.DESKTOP, APP_KEYS.WEB, APP_KEYS.DAEMON]);
  });

  it("stops web+daemon (in that order) when stopping web", () => {
    assert.deepEqual(resolveStopApps(APP_KEYS.WEB), [APP_KEYS.WEB, APP_KEYS.DAEMON]);
  });

  it("stops desktop only when stopping desktop (does NOT cascade to daemon)", () => {
    assert.deepEqual(resolveStopApps(APP_KEYS.DESKTOP), [APP_KEYS.DESKTOP]);
  });

  it("stops daemon only when stopping daemon", () => {
    assert.deepEqual(resolveStopApps(APP_KEYS.DAEMON), [APP_KEYS.DAEMON]);
  });

  it("throws on an unknown app name", () => {
    assert.throws(() => resolveStopApps("api"), /unsupported tools-dev app: api/);
  });
});

describe("resolveRunApps", () => {
  it("defaults to daemon+web (does NOT include desktop)", () => {
    assert.deepEqual(resolveRunApps(undefined), [APP_KEYS.DAEMON, APP_KEYS.WEB]);
  });

  it("delegates to resolveStartApps when an app name is given", () => {
    assert.deepEqual(resolveRunApps(APP_KEYS.WEB), [APP_KEYS.DAEMON, APP_KEYS.WEB]);
    assert.deepEqual(resolveRunApps(APP_KEYS.DESKTOP), [APP_KEYS.DAEMON, APP_KEYS.WEB, APP_KEYS.DESKTOP]);
    assert.deepEqual(resolveRunApps(APP_KEYS.DAEMON), [APP_KEYS.DAEMON]);
  });

  it("throws on an unknown app name", () => {
    assert.throws(() => resolveRunApps("api"), /unsupported tools-dev app: api/);
  });
});

describe("resolveTargetApps", () => {
  it("returns the defaults when no app name is given", () => {
    const defaults = [APP_KEYS.DAEMON, APP_KEYS.WEB] as const;
    assert.deepEqual(resolveTargetApps(undefined, defaults), [APP_KEYS.DAEMON, APP_KEYS.WEB]);
  });

  it("returns a single-element list when a known app name is given", () => {
    assert.deepEqual(resolveTargetApps(APP_KEYS.WEB, [APP_KEYS.DAEMON]), [APP_KEYS.WEB]);
  });

  it("throws on an unknown app name", () => {
    assert.throws(() => resolveTargetApps("api", [APP_KEYS.DAEMON]), /unsupported tools-dev app: api/);
  });
});

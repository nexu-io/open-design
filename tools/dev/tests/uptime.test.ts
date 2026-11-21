import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatUptime } from "../src/uptime.js";

const START = "2026-10-29T06:17:47.000Z";
const START_MS = Date.parse(START);

describe("tools-dev sidecar uptime", () => {
  it("renders sub-minute, minute, hour and day scales", () => {
    assert.equal(formatUptime(START, START_MS + 59_000), "<1m");
    assert.equal(formatUptime(START, START_MS + 12 * 60_000), "12m");
    assert.equal(formatUptime(START, START_MS + 5 * 3_600_000), "5h");
    assert.equal(formatUptime(START, START_MS + 3 * 86_400_000), "3d");
    assert.equal(formatUptime(START, START_MS + 4 * 86_400_000 + 19 * 3_600_000), "4d 19h");
  });

  it("drops the hour component when it is zero", () => {
    assert.equal(formatUptime(START, START_MS + 86_400_000), "1d");
  });

  it("returns null rather than a guess when the start time is unusable", () => {
    assert.equal(formatUptime(undefined, START_MS), null);
    assert.equal(formatUptime(null, START_MS), null);
    assert.equal(formatUptime("", START_MS), null);
    assert.equal(formatUptime("not-a-timestamp", START_MS), null);
    assert.equal(formatUptime(START, START_MS - 60_000), null);
  });
});

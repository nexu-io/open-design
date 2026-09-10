import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectElectronNative, summarizeInspection } from "../src/electron-inspect.js";

test("summarizes embedded media while preserving useful nested debug structure", () => {
  const value = { targets: [{ id: "first", url: "data:" + "a".repeat(3000) }] };
  const summary = summarizeInspection(value) as typeof value;
  assert.equal(summary.targets[0]!.id, "first");
  assert.ok(summary.targets[0]!.url.length < 220);
  assert.match(summary.targets[0]!.url, /3005 characters/);
  assert.equal(value.targets[0]!.url.length, 3005);
});

test("invalid debug commands fail before connecting", async () => {
  const url = "http://127.0.0.1:1";
  await assert.rejects(inspectElectronNative("cdp", url, {}), /requires --method/);
  await assert.rejects(inspectElectronNative("eval", url, {}), /requires --expression/);
  await assert.rejects(inspectElectronNative("screenshot", url, {}), /requires --path/);
  await assert.rejects(inspectElectronNative("cdp", url, { params: "[]" }), /JSON object/);
  await assert.rejects(inspectElectronNative("status", "http://example.com", {}), /loopback/);
});

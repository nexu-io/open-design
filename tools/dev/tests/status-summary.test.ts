import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatStatusSummary } from "../src/status-summary.js";

describe("tools-dev status summary", () => {
  it("renders the bundler a running web sidecar resolved", () => {
    assert.equal(
      formatStatusSummary({
        bundler: "turbopack",
        pid: 46748,
        state: "running",
        url: "http://127.0.0.1:52250",
      }),
      "running · http://127.0.0.1:52250 · pid 46748 · turbopack",
    );
  });

  it("omits the bundler when the snapshot carries none", () => {
    assert.equal(
      formatStatusSummary({ pid: 1741, state: "running", url: "http://127.0.0.1:7501" }),
      "running · http://127.0.0.1:7501 · pid 1741",
    );
  });

  it("keeps desktop fields in their existing order", () => {
    assert.equal(
      formatStatusSummary({ pid: 900, state: "running", title: "OD", windowVisible: false }),
      'running · pid 900 · title "OD" · window hidden',
    );
  });

  it("reports an unavailable status instead of throwing", () => {
    assert.equal(formatStatusSummary(null), "status unavailable");
    assert.equal(formatStatusSummary("not-an-object"), "status unavailable");
  });
});

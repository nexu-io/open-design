import { describe, expect, it } from "vitest";

import { isMcpUserQuitRecordActive } from "../src/index.js";

describe("boot-scoped MCP quit intent", () => {
  it("honors an explicit quit in this OS boot", () => {
    expect(isMcpUserQuitRecordActive({ schemaVersion: 1, quitAtMs: 100_000 }, 110_000, 50)).toBe(true);
  });
  it("expires the previous boot's intent", () => {
    expect(isMcpUserQuitRecordActive({ schemaVersion: 1, quitAtMs: 100_000 }, 200_000, 20)).toBe(false);
  });
  it.each([null, {}, [], { schemaVersion: 2, quitAtMs: 100_000 }, { schemaVersion: 1, quitAtMs: "100000" },
    { schemaVersion: 1, quitAtMs: Infinity }, { schemaVersion: 1, quitAtMs: 200_000 }])("rejects invalid or future intent %j", (record) => {
    expect(isMcpUserQuitRecordActive(record, 110_000, 50)).toBe(false);
  });
});

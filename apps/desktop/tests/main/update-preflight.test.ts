import { describe, expect, it } from "vitest";

import {
  checkUpdateRestartSafety,
  parseUpdateActionRequest,
} from "../../src/main/update-preflight.js";

describe("desktop update restart preflight", () => {
  it("blocks an update when the daemon reports active runs", async () => {
    const result = await checkUpdateRestartSafety({
      discoverDaemonBaseUrl: async () => "http://127.0.0.1:3000",
      fetchImpl: async (input, init) => {
        expect(String(input)).toBe("http://127.0.0.1:3000/api/runs?status=active");
        expect(init?.cache).toBe("no-store");
        return new Response(JSON.stringify({ runs: [{ id: "run-1" }, { id: "run-2" }] }), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      },
    });
    expect(result).toEqual({ activeRunCount: 2, state: "blocked" });
  });

  it("returns clear only for a valid empty runs response", async () => {
    const result = await checkUpdateRestartSafety({
      discoverDaemonBaseUrl: async () => "http://127.0.0.1:3000/",
      fetchImpl: async () => new Response(JSON.stringify({ runs: [] }), { status: 200 }),
    });
    expect(result).toEqual({ activeRunCount: 0, state: "clear" });
  });

  it("treats unreachable or malformed daemon responses as unknown risk", async () => {
    const unreachable = await checkUpdateRestartSafety({
      discoverDaemonBaseUrl: async () => {
        throw new Error("daemon unavailable");
      },
      fetchImpl: fetch,
    });
    expect(unreachable).toMatchObject({ activeRunCount: null, state: "unknown" });

    const malformed = await checkUpdateRestartSafety({
      discoverDaemonBaseUrl: async () => "http://127.0.0.1:3000",
      fetchImpl: async () => new Response(JSON.stringify({ runs: "not-an-array" }), { status: 200 }),
    });
    expect(malformed).toMatchObject({ activeRunCount: null, state: "unknown" });
  });

  it("accepts only the force and source fields used by updater UI actions", () => {
    expect(parseUpdateActionRequest({ payload: { force: true, source: "mac-app-menu" } })).toEqual({
      force: true,
      source: "mac-app-menu",
    });
    expect(parseUpdateActionRequest({ payload: { force: "yes", source: 42 } })).toEqual({
      force: false,
      source: null,
    });
    expect(parseUpdateActionRequest(null)).toEqual({ force: false, source: null });
  });
});

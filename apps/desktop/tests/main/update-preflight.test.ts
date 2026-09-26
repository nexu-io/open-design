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
        expect(String(input)).toBe("http://127.0.0.1:3000/api/runs/active-count");
        expect(init?.cache).toBe("no-store");
        return new Response(JSON.stringify({ activeRunCount: 2 }), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      },
    });
    expect(result).toEqual({ activeRunCount: 2, state: "blocked" });
  });

  it("returns clear only for a valid zero count", async () => {
    const result = await checkUpdateRestartSafety({
      discoverDaemonBaseUrl: async () => "http://127.0.0.1:3000/",
      fetchImpl: async () => new Response(JSON.stringify({ activeRunCount: 0 }), { status: 200 }),
    });
    expect(result).toEqual({ activeRunCount: 0, state: "clear" });
  });

  it("does not use the unscoped run listing that Workspace-bound runs refuse", async () => {
    // Regression: `GET /api/runs?status=active` answers 400
    // PROJECT_SCOPE_REQUIRED once any run belongs to a Workspace-bound
    // project, which left every Workspace user's update blocked as unknown.
    const requested: string[] = [];
    const result = await checkUpdateRestartSafety({
      discoverDaemonBaseUrl: async () => "http://127.0.0.1:3000",
      fetchImpl: async (input) => {
        const url = String(input);
        requested.push(url);
        if (url.includes("/api/runs?")) {
          return new Response(JSON.stringify({ error: { code: "PROJECT_SCOPE_REQUIRED" } }), { status: 400 });
        }
        return new Response(JSON.stringify({ activeRunCount: 0 }), { status: 200 });
      },
    });
    expect(requested).toEqual(["http://127.0.0.1:3000/api/runs/active-count"]);
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
      fetchImpl: async () => new Response(JSON.stringify({ runs: [] }), { status: 200 }),
    });
    expect(malformed).toMatchObject({ activeRunCount: null, state: "unknown" });

    for (const activeRunCount of [-1, 1.5, "2", null]) {
      const invalid = await checkUpdateRestartSafety({
        discoverDaemonBaseUrl: async () => "http://127.0.0.1:3000",
        fetchImpl: async () => new Response(JSON.stringify({ activeRunCount }), { status: 200 }),
      });
      expect(invalid).toMatchObject({ activeRunCount: null, state: "unknown" });
    }

    const refused = await checkUpdateRestartSafety({
      discoverDaemonBaseUrl: async () => "http://127.0.0.1:3000",
      fetchImpl: async () => new Response("{}", { status: 403 }),
    });
    expect(refused).toMatchObject({ activeRunCount: null, state: "unknown" });
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

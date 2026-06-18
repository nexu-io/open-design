// Tests for the exported readUpdateInstallMode helper in apps/desktop/src/main/index.ts — #4467 (PR2).
//
// Spec:
//   readUpdateInstallMode(baseUrl, fetchImpl?) fetches GET /api/app-config from the daemon
//   and returns the updateInstallMode pref, or undefined on any failure.
//
//   Signature: (baseUrl: string, fetchImpl?: typeof globalThis.fetch) => Promise<'automatic' | 'manual' | undefined>
//
// These tests are RED until the implementation lands.

import { describe, expect, it } from "vitest";

import { readUpdateInstallMode } from "../../src/main/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FetchImpl = typeof globalThis.fetch;

/** Builds a fetch stub that resolves to a JSON response body. */
function fakeFetchOk(body: unknown): FetchImpl {
  return async (_input: RequestInfo | URL, _init?: RequestInit) => {
    const text = JSON.stringify(body);
    return new Response(text, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

/** Builds a fetch stub that resolves to a non-OK HTTP status. */
function fakeFetchStatus(status: number): FetchImpl {
  return async () =>
    new Response("error", { status });
}

/** Builds a fetch stub that rejects with an error. */
function fakeFetchReject(message: string): FetchImpl {
  return async () => {
    throw new Error(message);
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("readUpdateInstallMode", () => {
  it("returns 'manual' when the daemon config contains updateInstallMode='manual'", async () => {
    const fetch = fakeFetchOk({ config: { updateInstallMode: "manual" } });
    const result = await readUpdateInstallMode("http://127.0.0.1:9999", fetch);
    expect(result).toBe("manual");
  });

  it("returns 'automatic' when the daemon config contains updateInstallMode='automatic'", async () => {
    const fetch = fakeFetchOk({ config: { updateInstallMode: "automatic" } });
    const result = await readUpdateInstallMode("http://127.0.0.1:9999", fetch);
    expect(result).toBe("automatic");
  });

  it("returns undefined when fetch throws (network error / daemon unreachable)", async () => {
    const fetch = fakeFetchReject("ECONNREFUSED");
    const result = await readUpdateInstallMode("http://127.0.0.1:9999", fetch);
    expect(result).toBeUndefined();
  });

  it("returns undefined when the daemon config does not contain the field", async () => {
    const fetch = fakeFetchOk({ config: { agentId: "claude" } });
    const result = await readUpdateInstallMode("http://127.0.0.1:9999", fetch);
    expect(result).toBeUndefined();
  });

  it("returns undefined when the daemon returns a non-OK HTTP status", async () => {
    const fetch = fakeFetchStatus(503);
    const result = await readUpdateInstallMode("http://127.0.0.1:9999", fetch);
    expect(result).toBeUndefined();
  });

  it("calls GET /api/app-config relative to the given baseUrl", async () => {
    const calls: string[] = [];
    const fetch: FetchImpl = async (input) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ config: { updateInstallMode: "manual" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    await readUpdateInstallMode("http://127.0.0.1:8080", fetch);
    expect(calls).toEqual(["http://127.0.0.1:8080/api/app-config"]);
  });
});

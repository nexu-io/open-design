import { describe, expect, it, vi } from "vitest";

import { fetchDiagnosticsBundle } from "../../src/main/diagnostics-fetch.js";

describe("fetchDiagnosticsBundle", () => {
  it("GETs the daemon's own diagnostics export endpoint and returns its bytes", async () => {
    // Regression for the desktop-ipc export that rebuilt the bundle with a
    // GUESSED data dir (`<namespaceRoot>/data`) and so missed the daemon's real
    // `runs/<id>/events.jsonl` + AMR logs in dev / OD_DATA_DIR-override setups.
    // The fix delegates to the daemon, which knows its real RUNTIME_DATA_DIR.
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04" (zip magic)
    const fetchImpl = vi.fn(async () => new Response(bytes, { status: 200 }));

    const buffer = await fetchDiagnosticsBundle("http://127.0.0.1:50022", { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:50022/api/diagnostics/export");
    expect(Buffer.from(buffer)).toEqual(Buffer.from(bytes));
  });

  it("throws on a non-200 response so the user sees a real error, not a truncated zip", async () => {
    const fetchImpl = vi.fn(async () => new Response("unavailable", { status: 503 }));

    await expect(
      fetchDiagnosticsBundle("http://127.0.0.1:50022", { fetchImpl }),
    ).rejects.toThrow(/503/);
  });
});

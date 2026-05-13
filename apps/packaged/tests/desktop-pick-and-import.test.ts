/**
 * PR #974 round-5 (lefarcen P1, mrcfps): the desktop runtime must
 * recover from a daemon-restart-mid-session by lazily re-handshaking
 * with the daemon when `POST /api/import/folder` answers
 * `503 DESKTOP_AUTH_PENDING`. Before round-5 the runtime ran
 * `registerDesktopAuthWithDaemon` exactly once at startup and stored
 * `desktopAuthSecret: null` if the handshake missed its window —
 * folder import was then permanently broken until desktop restart.
 *
 * Round-5 contract (pinned by these three tests):
 *   1. Lazy-retry happy path. First POST returns 503 DESKTOP_AUTH_PENDING,
 *      runtime calls `registerDesktopAuth()`, mints a FRESH token, POSTs
 *      again, second POST returns 200. Renderer sees ok:true.
 *   2. Lazy-retry exhausted. Both POSTs return 503. Runtime returned
 *      a structured failure (NOT a silent ok), and `registerDesktopAuth`
 *      WAS called between attempts.
 *   3. Single-attempt happy path. First POST returns 200. Runtime did
 *      NOT invoke `registerDesktopAuth` (no unnecessary IPC). Renderer
 *      sees ok:true.
 *
 * The packaged workspace hosts these because `apps/desktop` itself has
 * no vitest setup yet — same reasoning as the existing
 * `desktop-project-root-gate.test.ts` next to this file.
 *
 * @see https://github.com/nexu-io/open-design/pull/974
 */
import { describe, expect, it, vi } from "vitest";

import { pickAndImportFolder } from "@open-design/desktop/main";

// Test secret bytes — the helper's mint is injected, so the secret
// value is symbolic; we only assert call-shape and the secret reaching
// the mint. Round-5 (lefarcen P1) is about call-flow, not crypto.
const TEST_SECRET = Buffer.from(
  "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJyg=",
  "base64",
);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function pendingResponse(): Response {
  // Daemon-side wire shape from `apps/daemon/src/server.ts` sendApiError:
  // `{ error: { code, message, details, retryable } }`. Pinned by the
  // existing `desktop-import-token-gate.test.ts` line 215-216 so the
  // desktop side reads the same path.
  return jsonResponse(
    {
      error: {
        code: "DESKTOP_AUTH_PENDING",
        message: "desktop auth required but secret not yet registered",
        retryable: true,
      },
    },
    503,
  );
}

describe("pickAndImportFolder lazy retry on DESKTOP_AUTH_PENDING", () => {
  it("retries once on 503 DESKTOP_AUTH_PENDING after re-registering, returns ok on the second 200", async () => {
    const fetchImpl = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(pendingResponse())
      .mockResolvedValueOnce(jsonResponse({ project: { id: "p1" }, conversationId: "c1" }, 200));
    const registerDesktopAuth = vi.fn(async () => true);
    const mintToken = vi
      .fn<(secret: Buffer, baseDir: string) => string>()
      .mockReturnValueOnce("first-token")
      .mockReturnValueOnce("second-token");

    const result = await pickAndImportFolder({
      baseDir: "/Users/u/proj",
      desktopAuthSecret: TEST_SECRET,
      fetchImpl,
      mintToken,
      registerDesktopAuth,
      apiBaseUrl: "http://127.0.0.1:1234",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response).toEqual({ project: { id: "p1" }, conversationId: "c1" });
    }
    // Re-registration was triggered between the two POSTs.
    expect(registerDesktopAuth).toHaveBeenCalledTimes(1);
    // Two fetches: first 503, second 200.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    // The second mint produced a FRESH token — same baseDir + same
    // secret, but the runtime called mintToken twice so nonce + exp
    // are regenerated (replay protection still works on the daemon).
    expect(mintToken).toHaveBeenCalledTimes(2);
    expect(mintToken).toHaveBeenNthCalledWith(1, TEST_SECRET, "/Users/u/proj");
    expect(mintToken).toHaveBeenNthCalledWith(2, TEST_SECRET, "/Users/u/proj");
  });

  it("returns a structured failure (not a silent ok) when re-registration succeeds but the second POST is still 503", async () => {
    // Failure mode: the daemon stays in DESKTOP_AUTH_PENDING even after
    // a successful re-handshake (e.g. another restart between attempts,
    // or the daemon's gate is permanently broken). The renderer must see
    // an explicit failure, NOT an ok:true with empty response.
    const fetchImpl = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(pendingResponse())
      .mockResolvedValueOnce(pendingResponse());
    const registerDesktopAuth = vi.fn(async () => true);

    const result = await pickAndImportFolder({
      baseDir: "/Users/u/proj",
      desktopAuthSecret: TEST_SECRET,
      fetchImpl,
      registerDesktopAuth,
      apiBaseUrl: "http://127.0.0.1:1234",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/HTTP 503/);
    }
    // Re-registration WAS attempted — the runtime didn't silently give up.
    expect(registerDesktopAuth).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does NOT invoke registerDesktopAuth when the first POST returns 200 (no unnecessary IPC)", async () => {
    // The cheap-happy-path: registration succeeded at startup, daemon
    // already knows the secret, the very first POST under the trusted
    // picker flow returns 200. We must not double-register the secret
    // on every import — that would burn a sidecar IPC roundtrip per
    // click for no benefit.
    const fetchImpl = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse({ project: { id: "p2" }, conversationId: "c2" }, 200));
    const registerDesktopAuth = vi.fn(async () => true);

    const result = await pickAndImportFolder({
      baseDir: "/Users/u/proj",
      desktopAuthSecret: TEST_SECRET,
      fetchImpl,
      registerDesktopAuth,
      apiBaseUrl: "http://127.0.0.1:1234",
    });

    expect(result.ok).toBe(true);
    expect(registerDesktopAuth).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("collapses to a single attempt when registerDesktopAuth is not provided and 503 is returned", async () => {
    // Optional dep: if the runtime is constructed without a registration
    // callback (test runtimes, web-only deployments), the lazy retry
    // path stays a no-op and the renderer sees the original 503 reason.
    // Importantly we do NOT throw — the helper degrades gracefully.
    const fetchImpl = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(pendingResponse());

    const result = await pickAndImportFolder({
      baseDir: "/Users/u/proj",
      desktopAuthSecret: TEST_SECRET,
      fetchImpl,
      apiBaseUrl: "http://127.0.0.1:1234",
    });

    expect(result.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on a non-503 failure (4xx, 5xx other than 503 PENDING)", async () => {
    // The retry trigger is specifically `503 DESKTOP_AUTH_PENDING` —
    // a 403 (token mismatch), 400 (folder not found), or 500 (daemon
    // crash) all return immediately to the renderer with the daemon's
    // structured error envelope. We must NOT re-register on every
    // unrelated failure — that would mask real bugs and waste IPC.
    const fetchImpl = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: { code: "FORBIDDEN" } }, 403));
    const registerDesktopAuth = vi.fn(async () => true);

    const result = await pickAndImportFolder({
      baseDir: "/Users/u/proj",
      desktopAuthSecret: TEST_SECRET,
      fetchImpl,
      registerDesktopAuth,
      apiBaseUrl: "http://127.0.0.1:1234",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/HTTP 403/);
      expect(result.details).toMatchObject({ error: { code: "FORBIDDEN" } });
    }
    expect(registerDesktopAuth).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns a structured failure when fetch itself throws (network error)", async () => {
    const fetchImpl = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new TypeError("ECONNREFUSED"));

    const result = await pickAndImportFolder({
      baseDir: "/Users/u/proj",
      desktopAuthSecret: TEST_SECRET,
      fetchImpl,
      apiBaseUrl: "http://127.0.0.1:1234",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/daemon fetch failed.*ECONNREFUSED/);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  // Round-7 (lefarcen P2 @ runtime.ts:336): packaged builds load the
  // renderer from `od://app/`, which the main-process Node fetch cannot
  // resolve. The helper now POSTs to the daemon sidecar's real http URL
  // — the deps shape was renamed `webUrl` → `apiBaseUrl` to make the
  // boundary explicit. This test pins the URL composition so a
  // regression that re-introduces the protocol-handler hop fails fast.
  it("composes the import URL from apiBaseUrl, not from a renderer protocol scheme", async () => {
    const fetchImpl = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse({ project: { id: "p3" }, conversationId: "c3" }, 200));

    await pickAndImportFolder({
      apiBaseUrl: "http://127.0.0.1:17456",
      baseDir: "/Users/u/proj",
      desktopAuthSecret: TEST_SECRET,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = fetchImpl.mock.calls[0];
    expect(typeof url).toBe("string");
    expect(url as string).toBe("http://127.0.0.1:17456/api/import/folder");
    // Defensive: never hand main-process fetch a custom protocol URL.
    expect(url as string).not.toMatch(/^od:\/\//);
  });

  it("does NOT retry when the daemon answers 503 with a non-DESKTOP_AUTH_PENDING code", async () => {
    // Pin: 503 + a different error code (e.g. some future "daemon
    // overloaded" status) must NOT trigger re-registration — only the
    // specific DESKTOP_AUTH_PENDING wire shape recovers via re-handshake.
    const fetchImpl = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: { code: "SERVICE_UNAVAILABLE" } }, 503));
    const registerDesktopAuth = vi.fn(async () => true);

    const result = await pickAndImportFolder({
      baseDir: "/Users/u/proj",
      desktopAuthSecret: TEST_SECRET,
      fetchImpl,
      registerDesktopAuth,
      apiBaseUrl: "http://127.0.0.1:1234",
    });

    expect(result.ok).toBe(false);
    expect(registerDesktopAuth).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

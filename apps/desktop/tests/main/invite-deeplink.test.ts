import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import {
  continueInviteFromUrl,
  createInviteDeeplinkDispatcher,
  findDeeplinkArg,
  WORKSPACE_OPEN_FOCUS_REASON,
} from "../../src/main/invite-deeplink-core.js";

const VALID =
  "opendesign://workspace/invite/continue?workspace_id=ws-1&member_id=wm-1&invite_id=inv-1&nonce=n-1";

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

describe("findDeeplinkArg", () => {
  it("finds the opendesign url in an argv list", () => {
    expect(findDeeplinkArg(["/path/to/app", VALID])).toBe(VALID);
    expect(findDeeplinkArg(["/path/to/app", "--some-flag"])).toBeNull();
  });
});

describe("continueInviteFromUrl", () => {
  it("POSTs the nonce to the daemon and focuses on success", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { context: { workspaceMemberId: "wm-1" } }),
    ) as unknown as typeof fetch;
    const focus = vi.fn();
    const onActivated = vi.fn();
    const onCompleted = vi.fn();
    const out = await continueInviteFromUrl(VALID, {
      resolveDaemonBaseUrl: async () => "http://127.0.0.1:17456",
      fetch: fetchImpl,
      focus,
      onActivated,
      onCompleted,
    });
    expect(out).toEqual({ ok: true });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(url)).toBe("http://127.0.0.1:17456/api/workspace/invite/continue");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ nonce: "n-1" });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(onActivated).toHaveBeenCalledWith({ workspaceMemberId: "wm-1" });
    expect(onCompleted).toHaveBeenCalledWith({ ok: true });
  });

  it("focuses without any daemon call for the workspace/open hand-off deeplink", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const focus = vi.fn();
    const onCompleted = vi.fn();
    const out = await continueInviteFromUrl("opendesign://workspace/open", {
      resolveDaemonBaseUrl: async () => "http://x",
      fetch: fetchImpl,
      focus,
      onCompleted,
    });
    expect(out).toEqual({ ok: true, reason: WORKSPACE_OPEN_FOCUS_REASON });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(onCompleted).toHaveBeenCalledWith({ ok: true, reason: WORKSPACE_OPEN_FOCUS_REASON });
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("settles with a structured failure when the focus dep throws (no-throw contract)", async () => {
    const onCompleted = vi.fn();
    const out = await continueInviteFromUrl("opendesign://workspace/open", {
      resolveDaemonBaseUrl: async () => "http://x",
      focus: () => {
        throw new Error("window torn down");
      },
      onCompleted,
    });
    expect(out).toEqual({ ok: false, reason: "focus_failed" });
    expect(onCompleted).toHaveBeenCalledWith({ ok: false, reason: "focus_failed" });
  });

  it("accepts workspace/open with query params and trailing slash", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const focus = vi.fn();
    const out = await continueInviteFromUrl(
      "opendesign://workspace/open/?source=cli_activate",
      { resolveDaemonBaseUrl: async () => "http://x", fetch: fetchImpl, focus },
    );
    expect(out).toEqual({ ok: true, reason: WORKSPACE_OPEN_FOCUS_REASON });
    expect(focus).toHaveBeenCalledTimes(1);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  // Any web page can fire the `opendesign://` scheme, so pin where the focus
  // match stops: a loosened matcher (e.g. `pathname.startsWith("/open")`) must
  // not silently turn neighbouring urls into a foreground grab.
  it.each([
    "opendesign://workspace/openx",
    "opendesign://workspace/open/extra",
    "opendesign://other/open",
    "opendesign://workspace/OPEN",
    "opendesign://Workspace/open",
  ])("does not focus for %s", async (url) => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const focus = vi.fn();
    const out = await continueInviteFromUrl(url, {
      resolveDaemonBaseUrl: async () => "http://x",
      fetch: fetchImpl,
      focus,
    });
    expect(out).toEqual({ ok: false, reason: "not_an_invite_deeplink" });
    expect(focus).not.toHaveBeenCalled();
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("ignores a url that is not an invite deeplink (no daemon call)", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const out = await continueInviteFromUrl("opendesign://something/else", {
      resolveDaemonBaseUrl: async () => "http://x",
      fetch: fetchImpl,
    });
    expect(out).toEqual({ ok: false, reason: "not_an_invite_deeplink" });
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("reports daemon_unavailable when the base url rejects", async () => {
    const out = await continueInviteFromUrl(VALID, {
      resolveDaemonBaseUrl: async () => {
        throw new Error("daemon URL is unavailable");
      },
    });
    expect(out).toEqual({ ok: false, reason: "daemon_unavailable" });
  });

  it("reports consume_failed on a non-ok daemon response and unreachable on a throw", async () => {
    const failed = await continueInviteFromUrl(VALID, {
      resolveDaemonBaseUrl: async () => "http://x",
      fetch: (async () => jsonResponse(409, { error: "continuation_409" })) as unknown as typeof fetch,
    });
    expect(failed).toEqual({ ok: false, reason: "consume_failed", status: 409 });

    const broken = await continueInviteFromUrl(VALID, {
      resolveDaemonBaseUrl: async () => "http://x",
      fetch: (async () => {
        throw new Error("down");
      }) as unknown as typeof fetch,
    });
    expect(broken).toEqual({ ok: false, reason: "unreachable" });
  });
});

describe("createInviteDeeplinkDispatcher", () => {
  it("queues cold-start deeplinks until daemon deps are registered", () => {
    const continueInvite = vi.fn(async () => ({ ok: true }));
    const dispatcher = createInviteDeeplinkDispatcher(continueInvite);
    const deps = {
      resolveDaemonBaseUrl: async () => "http://127.0.0.1:17456",
    };

    dispatcher.dispatch(VALID);

    expect(dispatcher.pendingCount()).toBe(1);
    expect(continueInvite).not.toHaveBeenCalled();

    dispatcher.setDeps(deps);

    expect(dispatcher.pendingCount()).toBe(0);
    expect(continueInvite).toHaveBeenCalledWith(VALID, deps);
  });

  it("drains a cold-start deeplink through the real daemon HTTP boundary and activates its membership", async () => {
    let receivedNonce: string | null = null;
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { nonce?: string };
        receivedNonce = body.nonce ?? null;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ context: { workspaceMemberId: "wm-1" } }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("invite continuation server did not expose a TCP port");
    }

    try {
      const focus = vi.fn();
      let resolveActivated!: (value: { workspaceMemberId: string }) => void;
      const activated = new Promise<{ workspaceMemberId: string }>((resolve) => {
        resolveActivated = resolve;
      });
      const dispatcher = createInviteDeeplinkDispatcher(continueInviteFromUrl);

      dispatcher.dispatch(VALID);
      expect(dispatcher.pendingCount()).toBe(1);
      dispatcher.setDeps({
        resolveDaemonBaseUrl: async () => `http://127.0.0.1:${address.port}`,
        focus,
        onActivated: (context) => {
          resolveActivated(context as { workspaceMemberId: string });
        },
      });

      await expect(activated).resolves.toEqual({ workspaceMemberId: "wm-1" });
      expect(receivedNonce).toBe("n-1");
      expect(focus).toHaveBeenCalledTimes(1);
      expect(dispatcher.pendingCount()).toBe(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

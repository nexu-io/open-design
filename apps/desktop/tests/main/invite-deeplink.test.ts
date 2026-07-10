import { describe, expect, it, vi } from "vitest";
import {
  continueInviteFromUrl,
  createInviteDeeplinkDispatcher,
  findDeeplinkArg,
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
    const out = await continueInviteFromUrl(VALID, {
      resolveDaemonBaseUrl: async () => "http://127.0.0.1:17456",
      fetch: fetchImpl,
      focus,
      onActivated,
    });
    expect(out).toEqual({ ok: true });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(url)).toBe("http://127.0.0.1:17456/api/workspace/invite/continue");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ nonce: "n-1" });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(onActivated).toHaveBeenCalledWith({ workspaceMemberId: "wm-1" });
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
});

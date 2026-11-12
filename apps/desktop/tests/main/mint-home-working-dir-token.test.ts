import { afterEach, describe, expect, it, vi } from "vitest";

import { mintHomeWorkingDirToken } from "../../src/main/runtime.js";

const SECRET = Buffer.from("test-desktop-auth-secret");

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("mintHomeWorkingDirToken", () => {
  it("waits for a slow daemon acknowledgement before minting the picked-directory token", async () => {
    vi.useFakeTimers();
    // Model the sidecar's deadline: absent an override, registration uses the
    // 800 ms startup budget. A busy daemon can acknowledge several seconds later.
    const registerDesktopAuth = vi.fn((timeoutMs = 800) => new Promise<boolean>((resolve) => {
      const deadline = setTimeout(() => resolve(false), timeoutMs);
      setTimeout(() => {
        clearTimeout(deadline);
        resolve(true);
      }, 6_000);
    }));
    const mintToken = vi.fn(() => "selected-directory-token");
    const settled = vi.fn();
    const pending = mintHomeWorkingDirToken({
      baseDir: "/Users/me/external",
      desktopAuthSecret: SECRET,
      registerDesktopAuth,
      mintToken,
    }).then((result) => { settled(result); return result; });

    await vi.advanceTimersByTimeAsync(5_999);
    expect(settled).not.toHaveBeenCalled();
    expect(mintToken).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({
      baseDir: "/Users/me/external", ok: true, token: "selected-directory-token",
    });
    expect(registerDesktopAuth).toHaveBeenCalledOnce();
    expect(mintToken).toHaveBeenCalledOnce();
  });

  it("still rejects an unresponsive daemon within a bounded wait without minting or retrying", async () => {
    vi.useFakeTimers();
    const registerDesktopAuth = vi.fn((timeoutMs = 800) => new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), timeoutMs);
    }));
    const mintToken = vi.fn(() => "must-not-be-minted");
    const settled = vi.fn();
    const pending = mintHomeWorkingDirToken({
      baseDir: "/Users/me/external",
      desktopAuthSecret: SECRET,
      registerDesktopAuth,
      mintToken,
    }).then((result) => { settled(result); return result; });

    await vi.advanceTimersByTimeAsync(14_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ ok: false, reason: expect.stringMatching(/desktop auth handshake/i) });
    expect(registerDesktopAuth).toHaveBeenCalledOnce();
    expect(mintToken).not.toHaveBeenCalled();
  });

  it("runs the desktop-auth handshake before minting the token", async () => {
    const calls: string[] = [];
    const registerDesktopAuth = vi.fn(async () => {
      calls.push("register");
      return true;
    });
    const mintToken = vi.fn((_secret: Buffer, baseDir: string) => {
      calls.push("mint");
      return `token:${baseDir}`;
    });

    const result = await mintHomeWorkingDirToken({
      baseDir: "/Users/me/external",
      desktopAuthSecret: SECRET,
      registerDesktopAuth,
      mintToken,
    });

    expect(result).toEqual({ baseDir: "/Users/me/external", ok: true, token: "token:/Users/me/external" });
    // Handshake must complete before the token is minted, otherwise the token
    // is bound to a secret the daemon may not yet know (DESKTOP_AUTH_PENDING).
    expect(calls).toEqual(["register", "mint"]);
  });

  it("fails without minting when the desktop-auth handshake fails", async () => {
    const registerDesktopAuth = vi.fn(async () => false);
    const mintToken = vi.fn(() => "should-not-be-minted");

    const result = await mintHomeWorkingDirToken({
      baseDir: "/Users/me/external",
      desktopAuthSecret: SECRET,
      registerDesktopAuth,
      mintToken,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/desktop auth handshake/i);
    }
    // A guaranteed-unknown token is worse than a clear up-front failure, so we
    // must not mint when the handshake did not succeed.
    expect(mintToken).not.toHaveBeenCalled();
  });

  it("rejects an empty picked path", async () => {
    const mintToken = vi.fn(() => "x");
    const result = await mintHomeWorkingDirToken({
      baseDir: "   ",
      desktopAuthSecret: SECRET,
      registerDesktopAuth: vi.fn(async () => true),
      mintToken,
    });

    expect(result.ok).toBe(false);
    expect(mintToken).not.toHaveBeenCalled();
  });

  it("trims the picked path before binding the token to it", async () => {
    const mintToken = vi.fn((_secret: Buffer, baseDir: string) => `token:${baseDir}`);
    const result = await mintHomeWorkingDirToken({
      baseDir: "  /Users/me/external  ",
      desktopAuthSecret: SECRET,
      registerDesktopAuth: vi.fn(async () => true),
      mintToken,
    });

    expect(result).toEqual({ baseDir: "/Users/me/external", ok: true, token: "token:/Users/me/external" });
    expect(mintToken).toHaveBeenCalledWith(SECRET, "/Users/me/external");
  });
});

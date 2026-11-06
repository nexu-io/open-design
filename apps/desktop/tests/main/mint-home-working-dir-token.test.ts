import { describe, expect, it, vi } from "vitest";

import { mintHomeWorkingDirToken } from "../../src/main/runtime.js";

const SECRET = Buffer.from("test-desktop-auth-secret");

describe("mintHomeWorkingDirToken", () => {
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

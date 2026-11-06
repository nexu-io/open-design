import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consumeStudioWriteToken,
  createStudioWriteToken,
  markStudioWriteToken,
  resetStudioWriteTokens,
  studioExpectedFileVersion,
  studioFileContentVersion,
  studioFileRevision,
  studioWriteHeaders,
} from "./studioFileVersion";

afterEach(() => vi.unstubAllGlobals());

describe("studioFileContentVersion", () => {
  it("matches the strong SHA-256 ETag format used by studio-server", async () => {
    await expect(studioFileContentVersion("abc")).resolves.toBe(
      '"sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"',
    );
  });

  it("keeps an explicit content precondition authoritative over cached state", async () => {
    const versions = new Map<string, string | null>([
      ["stale.html", await studioFileContentVersion("stale")],
      ["newer.html", await studioFileContentVersion("newer")],
      ["missing.html", null],
    ]);
    const expectedVersion = await studioFileContentVersion("expected");

    expect(await studioExpectedFileVersion(versions, "stale.html", "expected")).toBe(
      expectedVersion,
    );
    expect(await studioExpectedFileVersion(versions, "newer.html", "expected")).toBe(
      expectedVersion,
    );
    expect(await studioExpectedFileVersion(versions, "missing.html", "expected")).toBe(
      expectedVersion,
    );
  });

  it("keeps known-missing and untracked files distinct without explicit content", async () => {
    const versions = new Map<string, string | null>([["missing.html", null]]);

    expect(await studioExpectedFileVersion(versions, "missing.html")).toBeNull();
    expect(await studioExpectedFileVersion(versions, "untracked.html")).toBeUndefined();
  });
});

describe("studio write-token echo identity", () => {
  it("prefers the platform randomUUID implementation", () => {
    const randomUUID = vi.fn(() => "11111111-2222-4333-8444-555555555555");
    vi.stubGlobal("crypto", { randomUUID });
    resetStudioWriteTokens();

    expect(studioWriteHeaders()).toEqual({
      "X-Hyperframes-Write-Token": "11111111-2222-4333-8444-555555555555",
    });
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(consumeStudioWriteToken("11111111-2222-4333-8444-555555555555")).toBe(true);
  });

  it("creates an RFC 4122 UUID-v4 token from getRandomValues when randomUUID is unavailable", () => {
    const source = Uint8Array.from({ length: 16 }, (_, index) => index);
    vi.stubGlobal("crypto", {
      getRandomValues: vi.fn((target: Uint8Array) => {
        target.set(source);
        return target;
      }),
    });

    expect(createStudioWriteToken()).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });

  it("fails explicitly when Web Crypto cannot provide secure random bytes", () => {
    vi.stubGlobal("crypto", {});

    expect(() => createStudioWriteToken()).toThrow(
      "Web Crypto getRandomValues is required for Studio write identity",
    );
  });

  it("suppresses exactly one matching API write receipt without hiding path-only external writes", () => {
    resetStudioWriteTokens();
    markStudioWriteToken("studio-write-1");

    expect(consumeStudioWriteToken("studio-write-1")).toBe(true);
    expect(consumeStudioWriteToken("studio-write-1")).toBe(false);
    expect(consumeStudioWriteToken(null)).toBe(false);
  });

  it("keeps a token through a slow write and expires abandoned identity state", () => {
    resetStudioWriteTokens();
    markStudioWriteToken("slow-studio-write", 1_000);

    expect(consumeStudioWriteToken("slow-studio-write", 61_000)).toBe(true);

    markStudioWriteToken("abandoned-studio-write", 1_000);
    expect(consumeStudioWriteToken("abandoned-studio-write", 301_000)).toBe(false);
  });

  it("moves the file revision once per write claimed, and not for its echo", () => {
    resetStudioWriteTokens();
    const start = studioFileRevision();
    markStudioWriteToken("revision-write");

    expect(studioFileRevision()).toBe(start + 1);
    // The echo of a write already counted must not move it again: a reader asked for after the
    // write was claimed would read as stale on its own echo and fetch a second time for nothing.
    expect(consumeStudioWriteToken("revision-write")).toBe(true);
    expect(studioFileRevision()).toBe(start + 1);
    markStudioWriteToken("second-write");
    expect(studioFileRevision()).toBe(start + 2);
  });
});

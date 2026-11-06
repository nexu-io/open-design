import { describe, expect, it, beforeEach } from "vitest";
import {
  hashContent,
  markSelfWrite,
  isSelfWriteEcho,
  resetSelfWriteRegistry,
} from "./sdkSelfWriteRegistry";
import { shouldReloadOnFileChange } from "./useSdkSession";

describe("sdkSelfWriteRegistry (finding #14)", () => {
  beforeEach(() => resetSelfWriteRegistry());

  it("recognizes the echo of bytes we just wrote", () => {
    markSelfWrite("/comp.html", "<html>A</html>");
    expect(isSelfWriteEcho("/comp.html", "<html>A</html>")).toBe(true);
  });

  it("does NOT match different content on the same path (an undo's reverted bytes)", () => {
    markSelfWrite("/comp.html", "<html>A</html>");
    expect(isSelfWriteEcho("/comp.html", "<html>REVERTED</html>")).toBe(false);
  });

  it("is keyed per file — a self-write to one file can't mask a change to another", () => {
    markSelfWrite("/a.html", "<html>A</html>");
    expect(isSelfWriteEcho("/b.html", "<html>A</html>")).toBe(false);
  });

  it("consumes a matched entry so a later genuine external write isn't suppressed", () => {
    markSelfWrite("/comp.html", "<html>A</html>");
    expect(isSelfWriteEcho("/comp.html", "<html>A</html>")).toBe(true);
    // A second arrival of identical bytes is NOT our echo — must reload.
    expect(isSelfWriteEcho("/comp.html", "<html>A</html>")).toBe(false);
  });

  it("expires entries past the TTL so a stale self-write can't suppress forever", () => {
    const t0 = 1_000_000;
    markSelfWrite("/comp.html", "<html>A</html>", t0);
    // 3 s later (> 2 s TTL) the entry is gone.
    expect(isSelfWriteEcho("/comp.html", "<html>A</html>", t0 + 3000)).toBe(false);
  });

  it("hashes are stable and distinguish different content", () => {
    expect(hashContent("x")).toBe(hashContent("x"));
    expect(hashContent("x")).not.toBe(hashContent("y"));
  });
});

describe("shouldReloadOnFileChange (finding #14)", () => {
  beforeEach(() => resetSelfWriteRegistry());

  it("suppresses the reload when content matches a registered self-write (cutover echo)", () => {
    markSelfWrite("/comp.html", "<html>SELF</html>");
    expect(shouldReloadOnFileChange("/comp.html", "<html>SELF</html>", true)).toBe(false);
  });

  it("reloads on an undo write even inside the suppress window (content differs)", () => {
    // The cutover registered SELF; the undo writes REVERTED bytes within the
    // same 2 s window. Time-only suppression dropped this; identity reloads it.
    markSelfWrite("/comp.html", "<html>SELF</html>");
    expect(shouldReloadOnFileChange("/comp.html", "<html>REVERTED</html>", true)).toBe(true);
  });

  it("falls back to the time window only when content is unavailable", () => {
    expect(shouldReloadOnFileChange("/comp.html", null, true)).toBe(false);
    expect(shouldReloadOnFileChange("/comp.html", null, false)).toBe(true);
  });
});

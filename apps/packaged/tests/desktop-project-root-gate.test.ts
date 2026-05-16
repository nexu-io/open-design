/**
 * Coverage for the path-validation primitives that the new
 * shell.openPath IPC handler in `apps/desktop/src/main/runtime.ts`
 * relies on, and for the HMAC token mint helper introduced in PR #974
 * to bind `POST /api/import/folder` to the desktop main process. The
 * packaged workspace hosts the test because `apps/desktop` itself has
 * no vitest setup yet — same reasoning as the existing
 * `desktop-url-allowlist.test.ts` next to this file.
 *
 * @see https://github.com/nexu-io/open-design/pull/974
 *      lefarcen + mrcfps round-3 reviews on runtime.ts: path-allowlist
 *      gate must be daemon-controlled, `.app` bundles must be rejected,
 *      and `openPath(projectId)` must only forward projects whose
 *      resolvedDir came from the trusted-picker flow.
 */
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  validateExistingDirectory,
  fetchResolvedProjectDir,
  isOpenPathAllowedForProject,
  signDesktopImportToken,
} from "@open-design/desktop/main";

let tempRoot = "";

beforeEach(() => {
  tempRoot = mkdtempSync(path.join(tmpdir(), "od-desktop-validate-"));
});

afterEach(() => {
  if (tempRoot) {
    rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = "";
  }
});

describe("validateExistingDirectory", () => {
  it("rejects empty / non-string input", async () => {
    const empty = await validateExistingDirectory("");
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toMatch(/non-empty string/i);
  });

  it("rejects relative paths", async () => {
    const relative = await validateExistingDirectory("relative/site");
    expect(relative.ok).toBe(false);
    if (!relative.ok) expect(relative.reason).toMatch(/absolute/i);
  });

  it("rejects non-existent absolute paths", async () => {
    const ghost = path.join(tempRoot, "does-not-exist");
    const result = await validateExistingDirectory(ghost);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/exist/i);
  });

  it("rejects absolute paths that point at files rather than directories", async () => {
    const file = path.join(tempRoot, "file.txt");
    writeFileSync(file, "not a directory");
    const result = await validateExistingDirectory(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/directory/i);
  });

  it("accepts an existing absolute directory and returns the realpath", async () => {
    const result = await validateExistingDirectory(tempRoot);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.resolved).toBe(tempRoot);
  });

  it("realpath-resolves symlinks so attackers cannot register one path and reach another", async () => {
    const realDir = path.join(tempRoot, "real");
    await mkdir(realDir);
    const linkDir = path.join(tempRoot, "link");
    symlinkSync(realDir, linkDir, "dir");
    const result = await validateExistingDirectory(linkDir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.resolved).toBe(realDir);
  });

  it("rejects macOS .app bundles even though they are technically directories", async () => {
    // Construct a fake .app bundle on disk; it's just a directory
    // whose name ends in `.app`. shell.openPath would *launch* this
    // as an application, so the path gate must short-circuit here
    // regardless of platform (the suffix-based check is portable).
    const bundle = path.join(tempRoot, "Foo.app");
    await mkdir(bundle);
    const result = await validateExistingDirectory(bundle);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/application bundles/i);
  });

  it("rejects symlinks whose realpath resolves to a .app bundle", async () => {
    // Defense in depth: a renderer or malicious project metadata
    // could try to launder a `.app` bundle via a symlink whose name
    // doesn't end in `.app`. The realpath check before the suffix
    // test catches that.
    const realApp = path.join(tempRoot, "Real.app");
    await mkdir(realApp);
    const linkDir = path.join(tempRoot, "innocent-name");
    symlinkSync(realApp, linkDir, "dir");
    const result = await validateExistingDirectory(linkDir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/application bundles/i);
  });
});

describe("fetchResolvedProjectDir", () => {
  it("rejects empty project ids without sending a request", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchResolvedProjectDir("http://localhost:1234", "", fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/non-empty/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects project ids containing disallowed characters (path traversal guard)", async () => {
    const fetchImpl = vi.fn();
    // `/` is not in the daemon's `isSafeId` regex `[A-Za-z0-9._-]{1,128}`,
    // so a path-traversal attempt is rejected before the request is
    // built (no leakage to the daemon, no fetch attempted).
    const result = await fetchResolvedProjectDir("http://localhost:1234", "../escape", fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/disallowed characters/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepts dotted project ids that the daemon also accepts", async () => {
    // PR #974 round-4 mrcfps: the prior regex was stricter than
    // `apps/daemon/src/projects.ts#isSafeId` (which allows `.`), so
    // legitimate ids like `my-project.v2` regressed Continue in CLI /
    // Finalize even though the backend created them happily.
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ project: { id: "my-project.v2" }, resolvedDir: "/p" }),
        { status: 200 },
      ),
    );
    const result = await fetchResolvedProjectDir("http://localhost:1234", "my-project.v2", fetchImpl);
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith("http://localhost:1234/api/projects/my-project.v2");
  });

  it("rejects project ids longer than the daemon's 128-char cap", async () => {
    const fetchImpl = vi.fn();
    const tooLong = "a".repeat(129);
    const result = await fetchResolvedProjectDir("http://localhost:1234", tooLong, fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/disallowed characters/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns the daemon's resolvedDir when the project-detail endpoint succeeds", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          project: { id: "p1", name: "fixture" },
          resolvedDir: "/tmp/projects/p1",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await fetchResolvedProjectDir("http://localhost:1234", "p1", fetchImpl);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.resolvedDir).toBe("/tmp/projects/p1");
      // Native project (no metadata.baseDir) — always safe to forward to
      // shell.openPath because the resolvedDir lives under the daemon's
      // own projects root, not a user-controlled location.
      expect(result.context.hasBaseDir).toBe(false);
      expect(result.context.fromTrustedPicker).toBe(false);
    }
    expect(fetchImpl).toHaveBeenCalledWith("http://localhost:1234/api/projects/p1");
  });

  it("flags folder-imported projects without the trusted-picker marker", async () => {
    // PR #974 mrcfps follow-up: the desktop main process refuses to
    // forward `shell.openPath` for folder-imported projects whose
    // metadata lacks `fromTrustedPicker: true`, even though the
    // resolvedDir is technically valid.
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          project: {
            id: "legacy",
            name: "legacy folder import",
            metadata: { kind: "prototype", baseDir: "/Users/u/legacy" },
          },
          resolvedDir: "/Users/u/legacy",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await fetchResolvedProjectDir("http://localhost:1234", "legacy", fetchImpl);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.hasBaseDir).toBe(true);
      expect(result.context.fromTrustedPicker).toBe(false);
    }
  });

  it("trusts folder-imported projects whose metadata has fromTrustedPicker", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          project: {
            id: "trusted",
            name: "trusted import",
            metadata: {
              kind: "prototype",
              baseDir: "/Users/u/trusted",
              fromTrustedPicker: true,
            },
          },
          resolvedDir: "/Users/u/trusted",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await fetchResolvedProjectDir("http://localhost:1234", "trusted", fetchImpl);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.hasBaseDir).toBe(true);
      expect(result.context.fromTrustedPicker).toBe(true);
    }
  });

  it("strips trailing slashes from the web URL when constructing the request", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ project: {}, resolvedDir: "/x" }), { status: 200 }),
    );
    await fetchResolvedProjectDir("http://localhost:1234/", "p1", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("http://localhost:1234/api/projects/p1");
  });

  it("returns an error when the daemon responds non-2xx", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("nope", { status: 404 }),
    );
    const result = await fetchResolvedProjectDir("http://localhost:1234", "missing", fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/HTTP 404/);
  });

  it("returns an error when the daemon response is missing resolvedDir", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ project: { id: "p1" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const result = await fetchResolvedProjectDir("http://localhost:1234", "p1", fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/resolvedDir/);
  });

  it("returns an error when fetch itself rejects (network error)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("ECONNREFUSED");
    });
    const result = await fetchResolvedProjectDir("http://localhost:1234", "p1", fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/daemon fetch failed/i);
  });

  it("encodes the project id in the URL so reserved characters round-trip safely", async () => {
    // Project ids that pass the regex include alphanumerics, `_`, and
    // `-`; encodeURIComponent is a no-op for those, but pin the
    // contract anyway.
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ project: {}, resolvedDir: "/x" }), { status: 200 }),
    );
    await fetchResolvedProjectDir("http://localhost:1234", "abc-123_xyz", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("http://localhost:1234/api/projects/abc-123_xyz");
  });
});

describe("isOpenPathAllowedForProject", () => {
  // PR #974 mrcfps follow-up: the desktop main process refuses to
  // forward `shell.openPath` for folder-imported projects whose
  // metadata lacks the trusted-picker marker. These three cases pin
  // the literal interpretation of his round-3 ask.
  it("allows native projects (no baseDir → daemon-owned resolvedDir)", () => {
    const result = isOpenPathAllowedForProject({
      fromTrustedPicker: false,
      hasBaseDir: false,
      resolvedDir: "/tmp/od-projects/abc123",
    });
    expect(result.ok).toBe(true);
  });

  it("allows folder-imported projects whose metadata is fromTrustedPicker", () => {
    const result = isOpenPathAllowedForProject({
      fromTrustedPicker: true,
      hasBaseDir: true,
      resolvedDir: "/Users/u/trusted-import",
    });
    expect(result.ok).toBe(true);
  });

  it("refuses folder-imported projects without the trusted-picker marker", () => {
    const result = isOpenPathAllowedForProject({
      fromTrustedPicker: false,
      hasBaseDir: true,
      resolvedDir: "/Users/u/legacy-import",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/trusted picker/i);
  });
});

describe("signDesktopImportToken", () => {
  // The desktop main process mints these tokens for `POST
  // /api/import/folder`. The daemon recomputes the same HMAC and
  // accepts only matching signatures, so token shape is part of the
  // wire contract between desktop and daemon (PR #974). Field
  // separator is `~` (not `.`) because ISO 8601 expiry strings embed
  // dots — drift between the two sides would silently reject every
  // real token.
  const SECRET_A = Buffer.from("AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJyg=", "base64");
  const SECRET_B = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/4QAYRXhpZgAATU0AKgAAAAgAAQAAA==", "base64");

  it("produces a token shaped `${nonce}~${exp}~${signature}` with three non-empty parts", () => {
    const token = signDesktopImportToken(SECRET_A, "/Users/u/proj", {
      nonce: "n1",
      exp: "2026-05-08T20:00:00.000Z",
    });
    const parts = token.split("~");
    expect(parts).toHaveLength(3);
    for (const part of parts) expect(part.length).toBeGreaterThan(0);
    expect(parts[0]).toBe("n1");
    expect(parts[1]).toBe("2026-05-08T20:00:00.000Z");
  });

  it("is deterministic for identical (secret, baseDir, nonce, exp) tuples", () => {
    const args = { nonce: "n2", exp: "2026-05-08T20:01:00.000Z" } as const;
    expect(signDesktopImportToken(SECRET_A, "/Users/u/proj", args)).toEqual(
      signDesktopImportToken(SECRET_A, "/Users/u/proj", args),
    );
  });

  it("changes the signature when the baseDir changes", () => {
    const args = { nonce: "n3", exp: "2026-05-08T20:02:00.000Z" } as const;
    const a = signDesktopImportToken(SECRET_A, "/Users/u/proj-a", args).split("~")[2];
    const b = signDesktopImportToken(SECRET_A, "/Users/u/proj-b", args).split("~")[2];
    expect(a).not.toEqual(b);
  });

  it("changes the signature when the nonce changes", () => {
    const a = signDesktopImportToken(SECRET_A, "/p", { nonce: "n4", exp: "2026-05-08T20:03:00.000Z" });
    const b = signDesktopImportToken(SECRET_A, "/p", { nonce: "n5", exp: "2026-05-08T20:03:00.000Z" });
    expect(a.split("~")[2]).not.toEqual(b.split("~")[2]);
  });

  it("changes the signature when the expiry changes", () => {
    const a = signDesktopImportToken(SECRET_A, "/p", { nonce: "n6", exp: "2026-05-08T20:04:00.000Z" });
    const b = signDesktopImportToken(SECRET_A, "/p", { nonce: "n6", exp: "2026-05-08T20:05:00.000Z" });
    expect(a.split("~")[2]).not.toEqual(b.split("~")[2]);
  });

  it("changes the signature when the secret changes", () => {
    const args = { nonce: "n7", exp: "2026-05-08T20:06:00.000Z" } as const;
    const a = signDesktopImportToken(SECRET_A, "/p", args).split("~")[2];
    const b = signDesktopImportToken(SECRET_B, "/p", args).split("~")[2];
    expect(a).not.toEqual(b);
  });
});

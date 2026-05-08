/**
 * Coverage for the path-validation primitives that the new
 * shell.openPath IPC handler in `apps/desktop/src/main/runtime.ts`
 * relies on. The packaged workspace hosts the test because
 * `apps/desktop` itself has no vitest setup yet — same reasoning as
 * the existing `desktop-url-allowlist.test.ts` next to this file.
 *
 * @see https://github.com/nexu-io/open-design/pull/974 (mrcfps + lefarcen P1
 * reviews on runtime.ts: the path-allowlist gate must be
 * daemon-controlled and `.app` bundles must be rejected).
 */
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  validateExistingDirectory,
  fetchResolvedProjectDir,
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
    const result = await fetchResolvedProjectDir("http://localhost:1234", "../escape", fetchImpl);
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
    if (result.ok) expect(result.resolvedDir).toBe("/tmp/projects/p1");
    expect(fetchImpl).toHaveBeenCalledWith("http://localhost:1234/api/projects/p1");
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

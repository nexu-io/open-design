import { describe, expect, it } from "vitest";

import { isWindowsNamedPipePath, normalizeIpcPath } from "../src/index.js";

describe("normalizeIpcPath", () => {
  it("returns absolute POSIX paths unchanged", () => {
    expect(normalizeIpcPath("/tmp/open-design/ipc/ns/web.sock")).toBe("/tmp/open-design/ipc/ns/web.sock");
  });

  it("returns Windows named-pipe paths unchanged without absolute-path checking", () => {
    expect(normalizeIpcPath("\\\\.\\pipe\\open-design-ns-web")).toBe("\\\\.\\pipe\\open-design-ns-web");
  });

  it("returns drive-letter absolute Windows paths unchanged", () => {
    expect(normalizeIpcPath("C:\\Users\\ipc\\web.sock")).toBe("C:\\Users\\ipc\\web.sock");
  });

  it("throws when the ipc path is not a string", () => {
    expect(() => normalizeIpcPath(42)).toThrow(/must be a string/);
    expect(() => normalizeIpcPath(null)).toThrow(/must be a string/);
    expect(() => normalizeIpcPath(undefined)).toThrow(/must be a string/);
  });

  it("throws on the empty string", () => {
    expect(() => normalizeIpcPath("")).toThrow(/must not be empty/);
  });

  it("throws when the path has leading or trailing whitespace", () => {
    expect(() => normalizeIpcPath(" /tmp/open-design/ipc/ns/web.sock")).toThrow(/whitespace/);
    expect(() => normalizeIpcPath("/tmp/open-design/ipc/ns/web.sock\n")).toThrow(/whitespace/);
  });

  it("throws when the path contains a null byte", () => {
    expect(() => normalizeIpcPath("/tmp/open-design/ipc/ns/web.sock\0extra")).toThrow(/null bytes/);
  });

  it("throws when a POSIX path is not absolute", () => {
    expect(() => normalizeIpcPath("relative/path.sock")).toThrow(/must be absolute/);
    expect(() => normalizeIpcPath("./web.sock")).toThrow(/must be absolute/);
  });
});

describe("isWindowsNamedPipePath", () => {
  it("returns true for paths starting with \\\\.\\pipe\\", () => {
    expect(isWindowsNamedPipePath("\\\\.\\pipe\\open-design-ns-web")).toBe(true);
    expect(isWindowsNamedPipePath("\\\\.\\pipe\\")).toBe(true);
  });

  it("returns false for POSIX, drive-letter, or non-string inputs", () => {
    expect(isWindowsNamedPipePath("/tmp/open-design/ipc/ns/web.sock")).toBe(false);
    expect(isWindowsNamedPipePath("C:\\Users\\ipc\\web.sock")).toBe(false);
    expect(isWindowsNamedPipePath("\\\\.\\Pipe\\open-design")).toBe(false);
    expect(isWindowsNamedPipePath(null)).toBe(false);
    expect(isWindowsNamedPipePath(undefined)).toBe(false);
    expect(isWindowsNamedPipePath(123)).toBe(false);
  });
});

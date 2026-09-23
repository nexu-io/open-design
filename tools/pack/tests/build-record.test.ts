import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { emitBuildRecord } from "@/build-record.js";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("writes the same successful build record to stdout and an optional file", () => {
  const root = mkdtempSync(join(tmpdir(), "pack-build-record-"));
  roots.push(root);
  const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const path = join(root, "nested", "build.json");
  const record = { installerPath: "/tmp/setup.exe", payloadPath: "/tmp/payload.7z" };
  emitBuildRecord(record, path);
  expect(readFileSync(path, "utf8")).toBe(`${JSON.stringify(record, null, 2)}\n`);
  expect(output).toHaveBeenCalledWith(`${JSON.stringify(record, null, 2)}\n`);
});

it("does not create a build record for an invalid path", () => {
  const root = mkdtempSync(join(tmpdir(), "pack-build-record-"));
  roots.push(root);
  const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  expect(() => emitBuildRecord({ ok: true }, "")).toThrow("nonempty path");
  expect(existsSync(join(root, "build.json"))).toBe(false);
  expect(output).not.toHaveBeenCalled();
});

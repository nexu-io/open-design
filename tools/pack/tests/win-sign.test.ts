import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveSigntoolPath } from "../src/win/sign.js";

describe("resolveSigntoolPath", () => {
  it("probes filesystem candidates before falling back to bare signtool", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-sign-"));
    const kitSigntool = join(root, "Windows Kits", "signtool.exe");

    try {
      await mkdir(join(root, "Windows Kits"), { recursive: true });
      await writeFile(kitSigntool, "");

      await expect(resolveSigntoolPath("signtool.exe", ["signtool.exe", kitSigntool])).resolves.toBe(kitSigntool);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("falls back to bare signtool only after filesystem candidates are exhausted", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-sign-"));

    try {
      await expect(resolveSigntoolPath("signtool.exe", ["signtool.exe", join(root, "missing.exe")])).resolves.toBe(
        "signtool.exe",
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("keeps an explicit configured signtool path preferred", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-sign-"));
    const configuredSigntool = join(root, "configured.exe");
    const kitSigntool = join(root, "kit.exe");

    try {
      await writeFile(configuredSigntool, "");
      await writeFile(kitSigntool, "");

      await expect(resolveSigntoolPath(configuredSigntool, ["signtool.exe", kitSigntool])).resolves.toBe(
        configuredSigntool,
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("uses a filesystem fallback when an explicit configured signtool path is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-sign-"));
    const kitSigntool = join(root, "kit.exe");

    try {
      await writeFile(kitSigntool, "");

      await expect(resolveSigntoolPath(join(root, "missing.exe"), ["signtool.exe", kitSigntool])).resolves.toBe(
        kitSigntool,
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

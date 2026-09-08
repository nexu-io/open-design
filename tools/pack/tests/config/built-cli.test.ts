import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const toolPackRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("built tools-pack CLI", () => {
  it("resolves workspace configuration from the bundled entry", async () => {
    await execFileAsync("pnpm", ["build"], { cwd: toolPackRoot });

    const help = await execFileAsync(process.execPath, ["dist/index.mjs", "--help"], { cwd: toolPackRoot });
    expect(help.stdout).not.toContain("exact-control");
    expect(help.stdout).toContain("recover");
    const products = await readdir(resolve(toolPackRoot, "dist"));
    expect(products).not.toContain("exact-control.mjs");
    expect(products).not.toContain("exact-api.mjs");
    expect(products).not.toContain("exact-api.d.ts");
    expect(products).toContain("build-api.d.ts");

    await expect(execFileAsync(process.execPath, ["dist/index.mjs", "exact-control", "--request", "/removed-request.json"], { cwd: toolPackRoot }))
      .rejects.toMatchObject({ stderr: expect.stringContaining("Unknown command: exact-control") });

    const invocation = execFileAsync(
      process.execPath,
      ["dist/index.mjs", "mac", "unsupported-built-smoke"],
      { cwd: toolPackRoot },
    );

    await expect(invocation).rejects.toMatchObject({
      stderr: expect.stringContaining("unsupported mac action: unsupported-built-smoke"),
    });
    await expect(execFileAsync(process.execPath, ["dist/index.mjs", "mac", "recover"], { cwd: toolPackRoot }))
      .rejects.toMatchObject({ stderr: expect.stringContaining("recovery requires --user-data-root") });
  });
});

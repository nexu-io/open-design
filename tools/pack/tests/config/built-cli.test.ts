import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const toolPackRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("built tools-pack CLI", () => {
  it("resolves workspace configuration from the bundled entry", async () => {
    await execFileAsync(process.execPath, ["esbuild.config.mjs"], { cwd: toolPackRoot });

    const invocation = execFileAsync(
      process.execPath,
      ["dist/index.mjs", "linux", "unsupported-built-smoke"],
      { cwd: toolPackRoot },
    );

    await expect(invocation).rejects.toMatchObject({
      stderr: expect.stringContaining("unsupported linux action: unsupported-built-smoke"),
    });
  });
});

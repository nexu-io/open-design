import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

const source = await readFile(new URL("../resources/mac/notarize.cjs", import.meta.url), "utf8");

function fixture(status = "Accepted", firstNotaryOutput?: string) {
  const calls: string[][] = [];
  const log = vi.fn();
  const remove = vi.fn(async () => {});
  let submissions = 0;
  const spawn = (command: string, args: string[]) => {
    calls.push([command, ...args]);
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(), stderr: new EventEmitter(),
    });
    queueMicrotask(() => {
      if (args[0] === "notarytool") {
        submissions += 1;
        child.stdout.emit("data", Buffer.from(submissions === 1 && firstNotaryOutput
          ? firstNotaryOutput : JSON.stringify({ status })));
      }
      child.emit("close", 0);
    });
    return child;
  };
  const modules: Record<string, unknown> = {
    "node:path": path,
    "node:fs/promises": { mkdtemp: async () => "/temporary/notarize", rm: remove },
    "node:os": { tmpdir: () => "/temporary" },
    "node:child_process": { spawn },
  };
  const module = { exports: undefined as unknown };
  runInNewContext(source, {
    module, require: (name: string) => {
      if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
      return modules[name];
    },
    process: { env: { APPLE_ID: "test", APPLE_APP_SPECIFIC_PASSWORD: "secret-sentinel", APPLE_TEAM_ID: "team", OPEN_DESIGN_NOTARIZE_RETRY_DELAY_MS: "1" } },
    console: { error: log, warn: log }, Buffer, performance,
    setTimeout: (callback: () => void) => queueMicrotask(callback),
  });
  const run = module.exports as (context: unknown) => Promise<void>;
  return { calls, log, remove, run: () => run({
    electronPlatformName: "darwin", appOutDir: "/output",
    packager: { appInfo: { productFilename: "Open Design Beta" } },
  }) };
}

describe("mac notarization hook", () => {
  it("submits once, staples, and reports stages without credentials", async () => {
    const f = fixture();
    await f.run();
    expect(f.calls.map(([command, action]) => [command, action])).toEqual([
      ["ditto", "-c"], ["xcrun", "notarytool"], ["xcrun", "stapler"],
    ]);
    const logs = f.log.mock.calls.flat().join("\n");
    for (const phase of ["archive", "submit-and-wait", "staple", "cleanup"]) {
      expect(logs).toContain(`phase:done phase=${phase} durationMs=`);
    }
    expect(logs).not.toContain("secret-sentinel");
    expect(f.remove).toHaveBeenCalledOnce();
  });

  it("fails closed on rejection, skips stapling, and still cleans up", async () => {
    const f = fixture("Invalid");
    await expect(f.run()).rejects.toThrow("Failed to notarize via notarytool");
    expect(f.calls).toHaveLength(2);
    expect(f.remove).toHaveBeenCalledOnce();
    expect(f.log.mock.calls.flat().join("\n")).toContain("phase:failed phase=submit-and-wait");
  });

  it("retries an Apple notary request timeout and staples after acceptance", async () => {
    const f = fixture("Accepted", 'Error: HTTPError(statusCode: nil, error: Error Domain=NSURLErrorDomain Code=-1001 "The request timed out.")');
    await f.run();
    expect(f.calls.filter(([, action]) => action === "notarytool")).toHaveLength(2);
    expect(f.calls.filter(([, action]) => action === "stapler")).toHaveLength(1);
    expect(f.log.mock.calls.flat().join("\n")).toContain("transient notarytool failure on attempt 1/3");
  });
});

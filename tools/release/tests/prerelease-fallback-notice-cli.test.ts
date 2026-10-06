import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

// The composer hands its verdict to the workflow through $GITHUB_OUTPUT, and
// the workflow branches on one key. Both properties below are about that file,
// so they are exercised through the real script rather than the pure module.
const releaseRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const composerScript = join(releaseRoot, "src", "notifications", "prerelease-fallback-notice.ts");

async function compose(outputFile: string, env: Record<string, string>): Promise<number> {
  await writeFile(outputFile, "");
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", composerScript], {
      env: {
        ...process.env,
        CHANNEL_LABEL: "Prerelease",
        GITHUB_OUTPUT: outputFile,
        ORIGIN_RUN_URL: "https://github.com/nexu-io/open-design/actions/runs/111",
        // No public origin and a declared pipeline state: the composer then
        // needs no network at all, so this test cannot reach out.
        PIPELINE_PROGRESS: "finished",
        VERSION: "0.21.1-prerelease.3",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.resume();
    child.stderr.resume();
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? -1));
  });
}

/** Keys in the order the script appended them, ignoring heredoc bodies. */
function keyOrder(raw: string): string[] {
  const keys: string[] = [];
  const lines = raw.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([a-z_]+)<<(od-fallback-[0-9a-f-]+)$/.exec(lines[index] ?? "");
    if (match?.[1] == null || match[2] == null) continue;
    keys.push(match[1]);
    while (index < lines.length && lines[index + 1] !== match[2]) index += 1;
  }
  return keys;
}

describe("prerelease fallback composer CLI", () => {
  let workdir = "";

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), "od-fallback-cli-"));
  });

  afterEach(async () => {
    await rm(workdir, { force: true, recursive: true });
  });

  it("emits no notice payload at all on a healthy release", async () => {
    const outputFile = join(workdir, "healthy.txt");
    expect(await compose(outputFile, { STAGE: "watch", CARD_JOB_RESULT: "success", CARD_DELIVERED: "true" })).toBe(0);
    const raw = await readFile(outputFile, "utf8");
    expect(keyOrder(raw)).toEqual(["reason", "alert"]);
    expect(raw).toContain("false");
    expect(raw).not.toContain("进度卡片失联");
  });

  it("writes `alert` only after every field a poster reads", async () => {
    // The workflow branches on `alert`, and $GITHUB_OUTPUT is append-only. If
    // `alert` went first, a crash between two appends would leave `alert=true`
    // beside an empty body and feishu-notice.ts would die on a required env
    // instead of delivering. Written last, `alert=true` means the whole notice
    // is on disk — which is what makes the workflow's gate safe.
    const outputFile = join(workdir, "silent.txt");
    expect(await compose(outputFile, { STAGE: "watch", CARD_JOB_RESULT: "success", CARD_DELIVERED: "" })).toBe(0);
    const order = keyOrder(await readFile(outputFile, "utf8"));
    expect(order).toContain("alert");
    expect(order).toContain("body");
    expect(order.indexOf("alert")).toBe(order.length - 1);
    for (const key of ["reason", "title", "template", "body", "run_url"]) {
      expect(order.indexOf(key), `${key} must be written before alert`).toBeLessThan(order.indexOf("alert"));
    }
  });
});

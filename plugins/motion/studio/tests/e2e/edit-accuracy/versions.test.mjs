import { mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { watchVersions } from "./sequences.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("watchVersions", () => {
  it("records two saves that land 10 ms apart, each as its own version", async () => {
    const dir = mkdtempSync(join(tmpdir(), "edit-bench-versions-"));
    const file = join(dir, "index.html");
    // Studio's own write: a whole file renamed into place.
    const save = (text) => {
      writeFileSync(`${file}.tmp`, text);
      renameSync(`${file}.tmp`, file);
    };
    save("start");
    const watcher = watchVersions(dir, ["index.html"]);
    save("nudged");
    await sleep(10);
    save("dragged");
    await sleep(100);
    watcher.stop();
    expect(watcher.versions.map((v) => v["index.html"])).toEqual(["start", "nudged", "dragged"]);
  });
});

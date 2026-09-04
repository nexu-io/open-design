import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SRC_ROOT = join(__dirname, "..", "src");
const PUBLISHABLE_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "github.com",
  "open-design.ai",
  "us.i.posthog.com",
]);
const URL_LITERAL_PATTERN = /https?:\/\/([A-Za-z0-9._-]+)/gu;

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (entry.name.endsWith(".ts")) files.push(path);
  }
  return files;
}

describe("Electron Shell source origins", () => {
  it("contains no private backend origin literal", async () => {
    const offenders: string[] = [];
    for (const path of await sourceFiles(SRC_ROOT)) {
      const source = await readFile(path, "utf8");
      for (const match of source.matchAll(URL_LITERAL_PATTERN)) {
        const host = match[1];
        if (host != null && !PUBLISHABLE_HOSTS.has(host)) {
          offenders.push(`${path.slice(SRC_ROOT.length + 1)} -> ${match[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

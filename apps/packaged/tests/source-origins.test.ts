/**
 * Standing guard: the packaged runtime must not hardcode a backend origin.
 *
 * `apps/packaged` ships inside a public repository, so any origin literal in
 * its source is published. Backend environments that are not themselves public
 * (an internal vela deployment, a staging gateway) therefore have to be
 * injected at packaging time — `tools/pack` reads them from CI secrets, bakes
 * them into `open-design-config.json`, and `sidecars.ts` forwards them into the
 * daemon spawn env, exactly as it already does for `POSTHOG_KEY`.
 *
 * This test fails when a new absolute URL literal appears whose host is not one
 * of the small set of genuinely public / loopback hosts below. If a change
 * needs a new backend origin, plumb it through the build-time injection chain
 * instead of adding it here.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SRC_ROOT = join(__dirname, "..", "src");

/**
 * Hosts that are safe to publish: loopback, the project's own public sites, and
 * third-party SaaS ingest endpoints that are public by design.
 */
const PUBLISHABLE_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "github.com",
  "open-design.ai",
  "us.i.posthog.com",
]);

const URL_LITERAL_PATTERN = /https?:\/\/([A-Za-z0-9._-]+)/g;

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryPath)));
    } else if (entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }
  return files;
}

describe("packaged source origin literals", () => {
  it("hardcodes no non-public backend origin", async () => {
    const offenders: string[] = [];
    for (const filePath of await collectSourceFiles(SRC_ROOT)) {
      const source = await readFile(filePath, "utf8");
      for (const match of source.matchAll(URL_LITERAL_PATTERN)) {
        const host = match[1];
        if (host == null || PUBLISHABLE_HOSTS.has(host)) continue;
        offenders.push(`${filePath.slice(SRC_ROOT.length + 1)} -> ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

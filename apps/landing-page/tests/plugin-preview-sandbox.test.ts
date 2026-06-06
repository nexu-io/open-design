import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

const testDir = dirname(fileURLToPath(import.meta.url));
const pluginDetailRoute = join(testDir, "../app/pages/plugins/[slug]/index.astro");

describe("plugin detail live preview sandbox", () => {
  it("does not grant same-origin access to scripted preview iframes", async () => {
    const source = await readFile(pluginDetailRoute, "utf8");

    assert.match(source, /sandbox="allow-scripts"/);
    assert.doesNotMatch(source, /sandbox="allow-scripts allow-same-origin"/);
  });
});

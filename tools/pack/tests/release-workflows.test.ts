import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

function sectionBetween(content: string, start: string, end: string): string {
  const startIndex = content.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = content.indexOf(end, startIndex + start.length);
  expect(endIndex).toBeGreaterThan(startIndex);
  return content.slice(startIndex, endIndex);
}

describe("release workflows", () => {
  it("requires Vela CLI only for beta mac arm64 packaging", async () => {
    const beta = await readFile(new URL("../../../.github/workflows/release-beta.yml", import.meta.url), "utf8");
    const mac = sectionBetween(beta, "  build_mac:", "  build_mac_intel:");
    const macIntel = sectionBetween(beta, "  build_mac_intel:", "  build_win:");
    const win = sectionBetween(beta, "  build_win:", "  build_linux:");
    const linux = sectionBetween(beta, "  build_linux:", "  publish:");

    expect(mac).toContain("--require-vela-cli");
    expect(macIntel).not.toContain("--require-vela-cli");
    expect(win).not.toContain("--require-vela-cli");
    expect(linux).not.toContain("--require-vela-cli");
    expect(beta.match(/--require-vela-cli/g)?.length).toBe(1);
  });
});

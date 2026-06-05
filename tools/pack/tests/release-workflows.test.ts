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
    const [beta, betaSelfHosted, buildMac] = await Promise.all([
      readFile(new URL("../../../.github/workflows/release-beta.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-beta-s.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/scripts/release/build-mac.sh", import.meta.url), "utf8"),
    ]);
    const mac = sectionBetween(beta, "  build_mac:", "  build_mac_intel:");
    const macIntel = sectionBetween(beta, "  build_mac_intel:", "  build_win:");
    const win = sectionBetween(beta, "  build_win:", "  build_linux:");
    const linux = sectionBetween(beta, "  build_linux:", "  publish:");
    const selfHostedMac = sectionBetween(betaSelfHosted, "  build_mac:", "  publish:");

    expect(mac).toContain("bash .github/scripts/release/build-mac.sh");
    expect(selfHostedMac).toContain("bash .github/scripts/release/build-mac.sh");
    expect(buildMac).toContain("build_args+=(--require-vela-cli)");
    expect(buildMac).toContain('--cache-dir "$cache_dir"');
    expect(buildMac).not.toContain("::warning::Expected Electron framework symlink");
    expect(macIntel).not.toContain("--require-vela-cli");
    expect(win).not.toContain("--require-vela-cli");
    expect(linux).not.toContain("--require-vela-cli");
    expect(beta.match(/--require-vela-cli/g)?.length ?? 0).toBe(0);
  });
});

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
      readFile(new URL("../../../.github/workflow/scripts/release/build-platform.sh", import.meta.url), "utf8"),
    ]);
    const mac = sectionBetween(beta, "  build_mac_arm64:", "  build_mac_x64:");
    const macX64 = sectionBetween(beta, "  build_mac_x64:", "  build_win_x64:");
    const win = sectionBetween(beta, "  build_win_x64:", "  build_linux_x64:");
    const linux = sectionBetween(beta, "  build_linux_x64:", "  publish:");
    const selfHostedMac = sectionBetween(betaSelfHosted, "  build_mac_arm64:", "  build_win_x64:");
    const selfHostedWin = sectionBetween(betaSelfHosted, "  build_win_x64:", "  publish:");

    expect(mac).toContain("bash .github/workflow/scripts/release/build-platform.sh");
    expect(selfHostedMac).toContain("fnm exec --using=24 -- bash .github/workflow/scripts/release/build-platform.sh");
    expect(mac).toContain("REQUIRE_VELA_CLI: \"true\"");
    expect(selfHostedMac).toContain("REQUIRE_VELA_CLI: \"true\"");
    expect(buildMac).toContain("build_args+=(--require-vela-cli)");
    expect(buildMac).toContain('--cache-dir "$TOOLS_PACK_CACHE_DIR"');
    expect(buildMac).not.toContain("::warning::Expected Electron framework symlink");
    expect(macX64).not.toContain("REQUIRE_VELA_CLI: \"true\"");
    expect(win).not.toContain("--require-vela-cli");
    expect(linux).not.toContain("--require-vela-cli");
    expect(beta.match(/REQUIRE_VELA_CLI: "true"/g)?.length ?? 0).toBe(1);
    expect(beta).toContain("release-beta publish requires win_x64_target=nsis or all");
    expect(betaSelfHosted).toContain("release-beta-s publish requires win_x64_target=nsis or all");
    expect(win).toContain("-IncludeZip $${{ inputs.win_x64_target == 'all' || inputs.win_x64_target == 'zip' }}");
    expect(selfHostedWin).toContain("-IncludeZip $${{ inputs.win_x64_target == 'all' || inputs.win_x64_target == 'zip' }}");
  });
});

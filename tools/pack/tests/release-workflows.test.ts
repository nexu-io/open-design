import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url);

async function read(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(new URL(path, root));
    return true;
  } catch {
    return false;
  }
}

function count(content: string, needle: string): number {
  return content.split(needle).length - 1;
}

describe("release workflow topology", () => {
  it("exposes only stable, prerelease, and exact release rituals", async () => {
    const entries = await Promise.all([
      read(".github/workflows/release-stable.yml"),
      read(".github/workflows/release-prerelease.yml"),
      read(".github/workflows/release-exact.yml"),
    ]);

    for (const entry of entries) {
      expect(entry).toContain("workflow_dispatch:");
      expect(entry).toContain("workflow_call:");
      expect(entry).toContain("secrets: inherit");
      expect(entry).not.toContain("runs-on:");
      expect(entry).not.toMatch(/^\s+run:/mu);
    }
    expect(await exists(".github/workflows/release-preview.yml")).toBe(false);
    expect(await exists(".github/workflows/release-beta.yml")).toBe(false);
    expect(await exists(".github/workflows/distribution.yml")).toBe(false);
    expect(await exists(".github/workflows/distribution-beta.yml")).toBe(false);
  });

  it("routes each ritual directly to one public distribution template", async () => {
    const [stable, prerelease, exact] = await Promise.all([
      read(".github/workflows/release-stable.yml"),
      read(".github/workflows/release-prerelease.yml"),
      read(".github/workflows/release-exact.yml"),
    ]);

    expect(stable).toContain("uses: ./.github/workflows/distribution-stable.yml");
    expect(prerelease).toContain("uses: ./.github/workflows/distribution-counted.yml");
    expect(exact).toContain("uses: ./.github/workflows/distribution-exact.yml");
    for (const entry of [stable, prerelease, exact]) {
      expect(count(entry, "\n  distribute:\n")).toBe(1);
    }
  });

  it("treats beta as the default exact name instead of a dedicated lane", async () => {
    const [entry, distribution, prepare] = await Promise.all([
      read(".github/workflows/release-exact.yml"),
      read(".github/workflows/distribution-exact.yml"),
      read("tools/release/src/metadata/prepare-exact.ts"),
    ]);

    expect(entry).toContain("exact_name:");
    expect(entry).toContain("default: beta");
    const declaredInputs = entry.slice(0, entry.indexOf("    outputs:"));
    expect(declaredInputs).not.toMatch(/^\s{6}(force|release_version|shell_version|closure_version):/mu);
    expect(distribution).toContain('[[ ! "$EXACT_NAME" =~ ^[a-z0-9]{1,12}$ ]]');
    expect(distribution).toContain('[ "$EXACT_NAME" = "stable" ] || [ "$EXACT_NAME" = "prerelease" ]');
    expect(distribution).toContain('pnpm exec tools-release prepare "${{ inputs.exact_name }}"');
    expect(distribution).toContain('pnpm exec tools-release reserve-version "${{ inputs.exact_name }}"');
    expect(prepare).toContain("OPEN_DESIGN_EXACT_METADATA_URL");
    expect(prepare).not.toContain("OPEN_DESIGN_PREVIEW_METADATA_URL");
  });

  it("builds all exact platforms by default and activates only after public acceptance", async () => {
    const [entry, distribution, acceptance] = await Promise.all([
      read(".github/workflows/release-exact.yml"),
      read(".github/workflows/distribution-exact.yml"),
      read(".github/workflows/distribution-exact-accept.yml"),
    ]);

    const declaredInputs = entry.slice(0, entry.indexOf("    outputs:"));
    for (const name of ["enable_mac_arm64", "enable_mac_x64", "enable_win_x64"]) {
      const sections = declaredInputs.split(`      ${name}:`).slice(1);
      expect(sections).toHaveLength(2);
      for (const section of sections) expect(section.split("\n", 6).join("\n")).toContain("default: true");
    }
    for (const target of ["mac_arm64", "mac_x64", "win_x64"]) {
      expect(acceptance).toContain(`target: ${target}`);
    }
    expect(distribution).toContain("uses: ./.github/workflows/distribution-exact-accept.yml");
    expect(acceptance).toContain("tools-release prepare-public-acceptance");
    expect(acceptance).toContain("tools-release issue-public-acceptance");
    expect(acceptance).toContain("tools-release activate-public-release");
    expect(acceptance).toContain("tools-release observe-public-feed");
  });

  it("uses exact platform composites and dynamic release identity", async () => {
    const [distribution, mac, win] = await Promise.all([
      read(".github/workflows/distribution-exact.yml"),
      read(".github/actions/release/platform/mac/exact/action.yml"),
      read(".github/actions/release/platform/win/exact/action.yml"),
    ]);

    expect(distribution).toContain("uses: ./.github/actions/release/platform/mac/exact");
    expect(distribution).toContain("uses: ./.github/actions/release/platform/win/exact");
    expect(distribution).toContain("channel: ${{ inputs.exact_name }}");
    expect(mac).toContain('prefix: tools-pack-mac-v1-${{ inputs.channel }}-');
    expect(mac).toContain('--channel "${{ inputs.channel }}"');
    expect(win).toContain('prefix: tools-pack-win-v1-${{ inputs.channel }}-');
    expect(win).toContain('"release-${{ inputs.channel }}-win"');
    expect(mac).toContain("uses: ./.github/actions/release/platform/cache/save");
    expect(win).toContain("uses: ./.github/actions/release/platform/cache/save");
  });

  it("validates a real installation with embedded config and the staged immutable Closure binding", async () => {
    const [acceptance, lifecycle, packagedConfig] = await Promise.all([
      read(".github/workflows/distribution-exact-accept.yml"),
      read("tools/pack/src/mac/lifecycle.ts"),
      read("tools/pack/src/mac/app.ts"),
    ]);

    expect(acceptance).toContain('OD_TOOLS_PACK_EMBEDDED_CONFIG_ONLY: "1"');
    expect(acceptance).toContain("OD_STANDALONE_METADATA_URL: ${{ inputs.metadata_url }}");
    expect(acceptance).not.toContain("OD_PACKAGED_CONFIG_PATH:");
    expect(lifecycle).toContain('process.env.OD_TOOLS_PACK_EMBEDDED_CONFIG_ONLY === "1"');
    expect(packagedConfig).toContain("!options.config.portable");
    expect(packagedConfig).toContain("launcherVersion: options.shellVersion");
  });

  it("keeps release-wide product gates and legacy beta migration explicit", async () => {
    const [stable, prerelease, exact] = await Promise.all([
      read(".github/workflows/distribution-stable.yml"),
      read(".github/workflows/distribution-counted.yml"),
      read(".github/workflows/distribution-exact.yml"),
    ]);

    for (const distribution of [stable, prerelease, exact]) {
      expect(distribution).toContain("OPEN_DESIGN_AMR_PROFILE:");
      expect(distribution).toContain("OD_VELA_WEB_URL:");
      expect(distribution).toContain("tools-release check-storage");
      expect(distribution).not.toContain(".github/scripts/release/r2/");
    }
    expect(exact).toContain("inputs.exact_name == 'beta'");
    expect(exact).toContain("RELEASE_INSTALLATION_VERSION_MIN_BETA:");
    expect(prerelease).toContain("RELEASE_INSTALLATION_VERSION_MIN_PRERELEASE:");
    expect(stable).toContain("RELEASE_INSTALLATION_VERSION_MIN_STABLE:");
  });

  it("retains only the newest outer tools-pack cache", async () => {
    const cache = await read(".github/actions/release/platform/cache/save/action.yml");
    expect(cache).toContain(".[1:] | .[].id");
    expect(cache).toContain("Select-Object -Skip 1");
    expect(cache).not.toContain("keep=3");
    expect(cache).not.toContain("$keep = 3");
  });

  it("never forwards an empty Windows smoke mode", async () => {
    const notify = await read(".github/workflows/notify-release-feishu.yml");
    const modeLine = notify
      .split("\n")
      .find((line) => line.includes("win_x64_smoke_mode:") && line.includes("inputs.win_x64_smoke_mode"));
    expect(modeLine).toBeDefined();
    expect(modeLine).toMatch(/\|\|\s*'core'\s*\}\}/);
  });
});

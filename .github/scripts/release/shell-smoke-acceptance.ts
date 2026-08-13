import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ShellSmokeAcceptancePlatform = "mac_arm64" | "mac_x64" | "win_x64";

const SHARED_ACCEPTANCE_SOURCES = [
  ".github/scripts/release/shell-smoke-acceptance.ts",
  "e2e/lib/vitest/packaged-closure-fixture.ts",
  "e2e/lib/vitest/packaged-pty-smoke.ts",
  "e2e/lib/vitest/packaged-release-version.ts",
  "e2e/lib/vitest/packaged-report.ts",
  "e2e/lib/vitest/packaged-smoke-contract.ts",
  "e2e/lib/vitest/packaged-smoke-profile.ts",
  "e2e/lib/vitest/packaged-update-scenario.ts",
  "e2e/lib/vitest/report.ts",
  "e2e/lib/vitest/standalone-distribution-fixture.ts",
  "e2e/lib/vitest/suite.ts",
  "e2e/lib/vitest/tools-serve-updater-fixture.ts",
  "e2e/scripts/release-smoke.ts",
  "tools/release/src/storage/shell-build.ts",
  "tools/serve/src/index.ts",
  "tools/serve/src/updater-fixture.ts",
] as const;

const MAC_ACCEPTANCE_SOURCES = [
  ".github/actions/release/platform/mac/exact/action.yml",
  "e2e/lib/desktop/desktop-test-helpers.ts",
  "e2e/lib/vitest/packaged-smoke-plan-mac.ts",
  "e2e/specs/mac.spec.ts",
] as const;

const PLATFORM_ACCEPTANCE_SOURCES = {
  mac_arm64: MAC_ACCEPTANCE_SOURCES,
  mac_x64: MAC_ACCEPTANCE_SOURCES,
  win_x64: [
    ".github/actions/release/platform/win/exact/action.yml",
    "e2e/lib/vitest/packaged-app-shell.ts",
    "e2e/lib/vitest/packaged-smoke-plan-win.ts",
    "e2e/lib/vitest/packaged-win-identity.ts",
    "e2e/lib/vitest/win-installer-log.ts",
    "e2e/specs/win.spec.ts",
    "tools/pack/resources/win/nsis/installer-hooks.nsh",
    "tools/pack/resources/win/nsis/installer.nsi.tmpl",
    "tools/pack/src/win/custom-installer.ts",
    "tools/pack/tests/fixtures/win/nsis/installer-faults.nsh",
  ],
} as const satisfies Record<ShellSmokeAcceptancePlatform, readonly string[]>;

export function shellSmokeAcceptanceSourcePaths(platform: ShellSmokeAcceptancePlatform): string[] {
  return [...SHARED_ACCEPTANCE_SOURCES, ...PLATFORM_ACCEPTANCE_SOURCES[platform]].sort();
}

export function createShellSmokeAcceptanceDigest(parts: readonly Readonly<{ body: Uint8Array | string; label: string }>[]): `sha256:${string}` {
  const hash = createHash("sha256");
  for (const { body, label } of [...parts].sort((left, right) => left.label.localeCompare(right.label))) {
    const bytes = typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body);
    hash.update(`${label.length}:${label}:${bytes.byteLength}:`, "utf8");
    hash.update(bytes);
  }
  return `sha256:${hash.digest("hex")}`;
}

export async function resolveShellSmokeAcceptanceDigest(
  platform: ShellSmokeAcceptancePlatform,
  workspaceRoot: string,
): Promise<`sha256:${string}`> {
  const parts: Array<{ body: Uint8Array | string; label: string }> = [];
  for (const path of shellSmokeAcceptanceSourcePaths(platform)) {
    parts.push({ body: await readFile(resolve(workspaceRoot, path)), label: path });
  }
  return createShellSmokeAcceptanceDigest(parts);
}

function parsePlatform(value: string | undefined): ShellSmokeAcceptancePlatform {
  if (value === "mac_arm64" || value === "mac_x64" || value === "win_x64") return value;
  throw new Error("usage: tsx .github/scripts/release/shell-smoke-acceptance.ts <mac_arm64|mac_x64|win_x64>");
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] != null && resolve(process.argv[1]) === resolve(scriptPath)) {
  const workspaceRoot = resolve(dirname(scriptPath), "../../..");
  process.stdout.write(`${await resolveShellSmokeAcceptanceDigest(parsePlatform(process.argv[2]), workspaceRoot)}\n`);
}

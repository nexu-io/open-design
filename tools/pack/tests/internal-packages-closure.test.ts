import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { INTERNAL_PACKAGES as LINUX_INTERNAL_PACKAGES } from "../src/linux.js";
import { INTERNAL_PACKAGES as MAC_INTERNAL_PACKAGES } from "../src/mac/constants.js";
import { shouldInstallInternalPackageForMacPrebundle } from "../src/mac-prebundle.js";
import { INTERNAL_PACKAGES as WIN_INTERNAL_PACKAGES } from "../src/win/constants.js";
import { shouldInstallInternalPackageForWinPrebundle } from "../src/win-prebundle.js";

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

type PackageEntry = { readonly directory: string; readonly name: string };

function runtimeWorkspaceDeps(directory: string): string[] {
  const manifest = JSON.parse(
    readFileSync(join(workspaceRoot, directory, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  return Object.keys(manifest.dependencies ?? {}).filter((dep) => dep.startsWith("@open-design/"));
}

// Each pack lane assembles its packaged app by `pnpm pack`-ing a subset of
// INTERNAL_PACKAGES into tarballs, wiring them as `file:` dependencies, and
// running an npm/pnpm install in the isolated app directory. `pnpm pack`
// rewrites every `workspace:*` ref to a concrete version, so the install
// resolves each tarball's runtime `@open-design/*` dependencies. Any such
// dependency that is NOT also installed as a local tarball is fetched from the
// public npm registry and 404s — these packages are workspace-only and never
// published.
//
// The invariant: the set a lane actually installs must be closed under its
// runtime `@open-design/*` dependencies.
//
// The lanes diverge by web output mode:
//   - linux ships "server" mode and tarball-installs every INTERNAL_PACKAGES
//     entry, including @open-design/desktop and @open-design/web — so it must
//     also install their runtime deps (@open-design/download, @open-design/host).
//   - mac/win default to "standalone", where desktop/web/packaged/daemon are
//     prebundled with esbuild and excluded from the tarball install. The
//     packages they do install have no download/host dependency, so those
//     lanes correctly omit them. Adding download/host there would be dead
//     weight and would drag in the shared workspace-build cache.
const LANES: { name: string; packages: readonly PackageEntry[]; isInstalled: (pkg: PackageEntry) => boolean }[] = [
  {
    name: "linux",
    packages: LINUX_INTERNAL_PACKAGES,
    isInstalled: () => true,
  },
  {
    name: "mac",
    packages: MAC_INTERNAL_PACKAGES,
    isInstalled: (pkg) =>
      shouldInstallInternalPackageForMacPrebundle({ packageName: pkg.name, webOutputMode: "standalone" }),
  },
  {
    name: "win",
    packages: WIN_INTERNAL_PACKAGES,
    isInstalled: (pkg) =>
      shouldInstallInternalPackageForWinPrebundle({ packageName: pkg.name, webOutputMode: "standalone" }),
  },
];

describe("pack lane INTERNAL_PACKAGES dependency closure", () => {
  for (const lane of LANES) {
    it(`${lane.name}: every installed package's runtime @open-design deps are installed`, () => {
      const installed = lane.packages.filter((pkg) => lane.isInstalled(pkg));
      const installedNames = new Set(installed.map((pkg) => pkg.name));
      const missing: { dependency: string; dependent: string }[] = [];

      for (const pkg of installed) {
        for (const dependency of runtimeWorkspaceDeps(pkg.directory)) {
          if (!installedNames.has(dependency)) {
            missing.push({ dependency, dependent: pkg.name });
          }
        }
      }

      expect(missing).toEqual([]);
    });
  }
});

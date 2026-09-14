import { readFile } from "node:fs/promises";

import type { ToolPackConfig } from "../config/index.js";

export const WIN_PREBUNDLED_APP_DIR_NAME = "prebundled";
export const WIN_PREBUNDLE_META_DIR_NAME = "prebundle-meta";
export const WIN_PREBUNDLED_PACKAGED_MAIN_RELATIVE_PATH = "app/prebundled/packaged-main.mjs";
export const WIN_PREBUNDLED_WEB_SIDECAR_RELATIVE_PATH = "app/prebundled/web-sidecar.mjs";
export const WIN_PREBUNDLED_DAEMON_CLI_RELATIVE_PATH = "app/prebundled/daemon/daemon-cli.mjs";
export const WIN_PREBUNDLED_DAEMON_SIDECAR_RELATIVE_PATH = "app/prebundled/daemon/daemon-sidecar.mjs";
export const WIN_PREBUNDLE_ESBUILD_TARGET = "node24";
export const WIN_DAEMON_PREBUNDLE_ESM_REQUIRE_BANNER =
  'import { createRequire as __odCreateRequire } from "node:module"; const require = __odCreateRequire(import.meta.url);';
export const WIN_PREBUNDLE_ENTRYPOINTS_DIR_NAME = "prebundle-entrypoints";

// Runtime externals the prebundled daemon loads from node_modules at boot
// (see the `externals` in WIN_PREBUNDLE_POLICIES below). Their pinned versions
// MUST stay in lockstep with apps/daemon/package.json / the pnpm lockfile: the
// app is assembled with these as its declared deps (win/app.ts), and
// electron-builder 26's pnpm node_modules collector DROPS a dependency whose
// pin doesn't semver-satisfy the version resolvable on disk — silently
// shipping an app whose daemon dies at boot with `ERR_MODULE_NOT_FOUND`
// (issue #4638). A stale `12.9.0` pin here vs `12.10.0` on disk did exactly
// that. Keep every entry equal to the daemon's corresponding exact pin.
export const WIN_PREBUNDLE_RUNTIME_DEPENDENCIES = {
  "@ffmpeg-installer/ffmpeg": "1.1.0",
  "better-sqlite3": "12.10.0",
  "blake3-wasm": "2.1.5",
  "hyperframes": "0.8.1",
  "node-pty": "1.1.0",
  "sharp": "0.35.3",
} as const;

export const WIN_STANDALONE_PREBUNDLE_EXCLUDED_INTERNAL_PACKAGES = [
  "@open-design/daemon",
  "@open-design/desktop",
  "@open-design/launcher-proto",
  "@open-design/packaged",
  "@open-design/sidecar-proto",
  "@open-design/web",
] as const;

export const WIN_PREBUNDLE_POLICIES = {
  packagedMain: {
    externals: ["@open-design/sidecar", "electron"],
    forbiddenInputs: [
      "/apps/web/",
      "/node_modules/@open-design/web/",
      "/node_modules/next/",
      "/node_modules/openai/",
      "/node_modules/react/",
      "/node_modules/react-dom/",
    ],
    label: "packaged main",
  },
  daemonCli: {
    externals: ["@ffmpeg-installer/ffmpeg", "@open-design/sidecar", "better-sqlite3", "blake3-wasm", "hyperframes", "node-pty"],
    forbiddenInputs: [
      "/node_modules/@open-design/daemon/",
      "/node_modules/@ffmpeg-installer/ffmpeg/",
      "/node_modules/better-sqlite3/",
      "/node_modules/blake3-wasm/",
      "/node_modules/electron/",
      "/node_modules/hyperframes/",
      "/node_modules/next/",
      "/node_modules/node-pty/",
      "/node_modules/openai/",
      "/node_modules/react/",
      "/node_modules/react-dom/",
    ],
    label: "daemon cli",
  },
  daemonSidecar: {
    externals: ["@ffmpeg-installer/ffmpeg", "@open-design/sidecar", "better-sqlite3", "blake3-wasm", "hyperframes", "node-pty"],
    forbiddenInputs: [
      "/node_modules/@open-design/daemon/",
      "/node_modules/@ffmpeg-installer/ffmpeg/",
      "/node_modules/better-sqlite3/",
      "/node_modules/blake3-wasm/",
      "/node_modules/electron/",
      "/node_modules/hyperframes/",
      "/node_modules/next/",
      "/node_modules/node-pty/",
      "/node_modules/openai/",
      "/node_modules/react/",
      "/node_modules/react-dom/",
    ],
    label: "daemon sidecar",
  },
  webSidecar: {
    externals: ["@open-design/sidecar"],
    forbiddenInputs: [
      "/node_modules/next/",
      "/node_modules/openai/",
      "/node_modules/react/",
      "/node_modules/react-dom/",
    ],
    label: "web sidecar",
  },
} as const;

export type WinPrebundlePolicyName = keyof typeof WIN_PREBUNDLE_POLICIES;

function toPosixPath(value: string): string {
  return value.replaceAll("\\", "/");
}

export function shouldUseWinStandalonePrebundle(webOutputMode: ToolPackConfig["webOutputMode"]): boolean {
  return webOutputMode === "standalone";
}

export function shouldInstallInternalPackageForWinPrebundle(options: {
  packageName: string;
  webOutputMode: ToolPackConfig["webOutputMode"];
}): boolean {
  if (!shouldUseWinStandalonePrebundle(options.webOutputMode)) return true;
  return !WIN_STANDALONE_PREBUNDLE_EXCLUDED_INTERNAL_PACKAGES.includes(
    options.packageName as (typeof WIN_STANDALONE_PREBUNDLE_EXCLUDED_INTERNAL_PACKAGES)[number],
  );
}

export function findForbiddenWinPrebundleInputs(options: {
  forbiddenInputs: readonly string[];
  inputs: readonly string[];
}): string[] {
  return options.inputs
    .map(toPosixPath)
    .filter((input) => options.forbiddenInputs.some((forbidden) => input.includes(forbidden)));
}

export async function assertWinPrebundleMetafile(options: {
  metafilePath: string;
  policyName: WinPrebundlePolicyName;
}): Promise<void> {
  const policy = WIN_PREBUNDLE_POLICIES[options.policyName];
  const metafile = JSON.parse(await readFile(options.metafilePath, "utf8")) as { inputs?: Record<string, unknown> };
  const matched = findForbiddenWinPrebundleInputs({
    forbiddenInputs: policy.forbiddenInputs,
    inputs: Object.keys(metafile.inputs ?? {}),
  });
  if (matched.length > 0) {
    throw new Error(`${policy.label} prebundle included forbidden inputs: ${matched.join(", ")}`);
  }
}

export function renderWinPackagedMainEntry(usePrebundle: boolean): string {
  return usePrebundle
    ? 'import("./prebundled/packaged-main.mjs").catch((error) => {\n  console.error("packaged entry failed", error);\n  process.exit(1);\n});\n'
    : 'import("@open-design/packaged").catch((error) => {\n  console.error("packaged entry failed", error);\n  process.exit(1);\n});\n';
}

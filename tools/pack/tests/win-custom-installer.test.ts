import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ToolPackConfig } from "../src/config.js";
import { buildCustomWinNsisInstaller } from "../src/win/custom-installer.js";
import { resolveWinPaths } from "../src/win/paths.js";

const BUILD_HOST_NSIS_LOG_PATH = "D:\\a\\_temp\\tools-pack\\logs\\nsis.log";
const PORTABLE_NSIS_LOG_DIR = "$TEMP\\Open Design\\test-namespace";
const PORTABLE_NSIS_LOG_PATH = `${PORTABLE_NSIS_LOG_DIR}\\nsis.log`;

function createConfig(root: string, portable: boolean): ToolPackConfig {
  return {
    appVersion: "1.2.3",
    containerized: false,
    electronBuilderCliPath: "/unused/electron-builder",
    electronDistPath: "/unused/electron",
    electronVersion: "0.0.0",
    macCompression: "normal",
    namespace: "test-namespace",
    platform: "win",
    portable,
    removeData: false,
    removeLogs: false,
    removeProductUserData: false,
    removeSidecars: false,
    requireVelaCli: false,
    roots: {
      cacheRoot: join(root, "cache"),
      output: {
        appBuilderRoot: join(root, "out", "builder"),
        namespaceRoot: join(root, "out", "win", "namespaces", "test-namespace"),
        platformRoot: join(root, "out", "win"),
        root: join(root, "out"),
      },
      runtime: {
        namespaceBaseRoot: join(root, "runtime", "win", "namespaces"),
        namespaceRoot: join(root, "runtime", "win", "namespaces", "test-namespace"),
      },
      toolPackRoot: join(root, "tools-pack"),
    },
    signed: false,
    silent: true,
    to: "nsis",
    webOutputMode: "standalone",
    workspaceRoot: root,
  };
}

function nsisFunction(script: string, name: string): string {
  const start = script.indexOf(`Function ${name}\n`);
  if (start < 0) throw new Error(`missing NSIS function: ${name}`);
  const end = script.indexOf("\nFunctionEnd", start);
  if (end < 0) throw new Error(`unterminated NSIS function: ${name}`);
  return script.slice(start, end);
}

async function writeFakeMakensis(root: string): Promise<void> {
  const command = join(
    root,
    "node_modules",
    ".cache",
    "electron-builder",
    "nsis",
    "nsis-3.0.4.1-nsis-3.0.4.1",
    "makensis.exe",
  );
  await mkdir(dirname(command), { recursive: true });
  await writeFile(
    command,
    `#!/bin/sh
output=""
for arg in "$@"; do
  case "$arg" in
    /DOUTPUT_EXE=*) output="\${arg#/DOUTPUT_EXE=}" ;;
  esac
done
test -n "$output" || exit 2
: > "$output"
`,
    "utf8",
  );
  await chmod(command, 0o755);
}

async function generateInstallerScript(root: string, portable: boolean): Promise<string> {
  await writeFakeMakensis(root);
  const config = createConfig(root, portable);
  const paths = { ...resolveWinPaths(config), nsisLogPath: BUILD_HOST_NSIS_LOG_PATH };
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
  if (platformDescriptor == null) throw new Error("process.platform descriptor is unavailable");

  Object.defineProperty(process, "platform", { ...platformDescriptor, value: "win32" });
  try {
    await buildCustomWinNsisInstaller(config, paths);
  } finally {
    Object.defineProperty(process, "platform", platformDescriptor);
  }
  return readFile(paths.installerScriptPath, "utf8");
}

describe("buildCustomWinNsisInstaller logging", () => {
  it("uses the same runtime-writable log path for portable install and uninstall", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-custom-installer-"));
    try {
      const script = await generateInstallerScript(root, true);
      const installerLogger = nsisFunction(script, "LogInstallerEvent");
      const uninstallerLogger = nsisFunction(script, "un.LogInstallerEvent");

      for (const logger of [installerLogger, uninstallerLogger]) {
        expect(logger).toContain(`CreateDirectory "${PORTABLE_NSIS_LOG_DIR}"`);
        expect(logger).toContain(`FileOpen $1 "${PORTABLE_NSIS_LOG_PATH}" a`);
      }
      expect(script).not.toContain(BUILD_HOST_NSIS_LOG_PATH);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("retains tools-pack log readback for non-portable install and uninstall", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-custom-installer-"));
    try {
      const script = await generateInstallerScript(root, false);

      expect(nsisFunction(script, "LogInstallerEvent")).toContain(`FileOpen $1 "${BUILD_HOST_NSIS_LOG_PATH}" a`);
      expect(nsisFunction(script, "un.LogInstallerEvent")).toContain(`FileOpen $1 "${BUILD_HOST_NSIS_LOG_PATH}" a`);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

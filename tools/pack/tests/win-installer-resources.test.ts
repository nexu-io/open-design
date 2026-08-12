import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { resolveToolPackConfig, type ToolPackConfig } from "../src/config.js";
import { winResources } from "../src/resources.js";
import { hashWinNsisInstallerImplementation } from "../src/win/builder.js";
import {
  buildCustomWinNsisInstaller,
  renderWinNsisInstallerTemplate,
  resolveWinNsisInstallerHooks,
  WIN_NSIS_TEST_HOOKS_ENV,
} from "../src/win/custom-installer.js";
import { resolveWinPaths } from "../src/win/paths.js";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const config = { workspaceRoot } as ToolPackConfig;

describe("Windows installer resource boundary", () => {
  it("uses the production no-op include unless the explicit test fixture is requested", async () => {
    const production = resolveWinNsisInstallerHooks(config, {});
    const faults = resolveWinNsisInstallerHooks(config, { [WIN_NSIS_TEST_HOOKS_ENV]: "faults" });

    expect(production).toMatchObject({ mode: "production" });
    expect(production.path.replaceAll("\\", "/").endsWith("tools/pack/resources/win/nsis/installer-hooks.nsh")).toBe(true);
    expect(faults).toMatchObject({ mode: "faults" });
    expect(faults.path.replaceAll("\\", "/").endsWith("tools/pack/tests/fixtures/win/nsis/installer-faults.nsh")).toBe(true);
    await expect(readFile(production.path, "utf8")).resolves.not.toContain("ODTESTFAULT");
    await expect(readFile(faults.path, "utf8")).resolves.toContain("ODTESTFAULT");
  });

  it("rejects unknown hook modes instead of compiling test behavior accidentally", () => {
    expect(() => resolveWinNsisInstallerHooks(config, { [WIN_NSIS_TEST_HOOKS_ENV]: "true" })).toThrow(
      `${WIN_NSIS_TEST_HOOKS_ENV} must be faults or unset`,
    );
  });

  it("fails closed when template replacements drift", () => {
    expect(renderWinNsisInstallerTemplate("before @@VALUE@@ after", { VALUE: "rendered" })).toBe(
      "before rendered after",
    );
    expect(() => renderWinNsisInstallerTemplate("no token", { VALUE: "rendered" })).toThrow(
      "Windows NSIS template is missing @@VALUE@@",
    );
    expect(() => renderWinNsisInstallerTemplate("@@VALUE@@ @@MISSING@@", { VALUE: "rendered" })).toThrow(
      "Windows NSIS template has unresolved tokens: @@MISSING@@",
    );
  });

  it("keeps silent product-data deletion explicit while preserving the default", async () => {
    const template = await readFile(new URL("../resources/win/nsis/installer.nsi.tmpl", import.meta.url), "utf8");
    const uninstallInit = template.slice(template.indexOf("Function un.onInit"), template.indexOf("Function DetectRunningInstances"));

    expect(uninstallInit).toContain('StrCpy $RemoveLocalDataState 0');
    expect(uninstallInit).toContain('${GetOptions} $0 "/ODREMOVELOCALDATA=" $1');
    expect(uninstallInit).toContain('StrCpy $RemoveLocalDataState "${BST_CHECKED}"');
    expect(uninstallInit.indexOf('StrCpy $RemoveLocalDataState 0')).toBeLessThan(
      uninstallInit.indexOf('${GetOptions} $0 "/ODREMOVELOCALDATA=" $1'),
    );
  });

  it("gives production and fault-injection installers distinct cache identities", async () => {
    const production = await hashWinNsisInstallerImplementation(config, {});
    const faults = await hashWinNsisInstallerImplementation(config, { [WIN_NSIS_TEST_HOOKS_ENV]: "faults" });

    expect(production).not.toBe(faults);
  });

  it.runIf(process.platform === "win32" && process.env.OD_TEST_WIN_NSIS_COMPILE === "1")(
    "compiles both production and fault-injection resources with makensis",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "od-win-nsis-resource-compile-"));
      const previousHooks = process.env[WIN_NSIS_TEST_HOOKS_ENV];
      try {
        const buildConfig = resolveToolPackConfig("win", {
          dir: root,
          namespace: "win-installer-resource-compile",
          releaseVersion: "0.0.0-beta.1",
          shellVersion: "0.0.0-beta.1",
          to: "nsis",
        });
        const paths = resolveWinPaths(buildConfig);
        await mkdir(dirname(paths.installerBasePayloadPath), { recursive: true });
        await mkdir(dirname(paths.winIconPath), { recursive: true });
        await writeFile(paths.installerBasePayloadPath, "base fixture", "utf8");
        await writeFile(paths.installerOverlayPayloadPath, "overlay fixture", "utf8");
        await cp(winResources.icon, paths.winIconPath);

        delete process.env[WIN_NSIS_TEST_HOOKS_ENV];
        await buildCustomWinNsisInstaller(buildConfig, paths);
        await access(paths.setupPath);

        process.env[WIN_NSIS_TEST_HOOKS_ENV] = "faults";
        paths.setupPath = join(dirname(paths.setupPath), "faults-setup.exe");
        await buildCustomWinNsisInstaller(buildConfig, paths);
        await access(paths.setupPath);
      } finally {
        if (previousHooks == null) delete process.env[WIN_NSIS_TEST_HOOKS_ENV];
        else process.env[WIN_NSIS_TEST_HOOKS_ENV] = previousHooks;
        await rm(root, { force: true, recursive: true });
      }
    },
  );
});

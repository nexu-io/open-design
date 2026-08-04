import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const resourceRoot = join(import.meta.dirname, "../resources/server");

describe("server bootstrap resources", () => {
  it("keeps the POSIX bootstrap architecture-aware and atomically publishes private Node", async () => {
    const installer = await readFile(join(resourceRoot, "install.sh"), "utf8");

    expect(installer).toContain("node_is_compatible");
    expect(installer).toContain("process.platform");
    expect(installer).toContain("process.arch");
    expect(installer).toContain("verbatimSymlinks: true");
    expect(installer).toContain("fs.renameSync(stage, destination)");
    expect(installer).toContain("process.argv.slice(1)");
    expect(installer).toContain("installed launcher directory is not on PATH");
    expect(installer).toContain('DEFAULT_RELEASE_BASE_URL="https://releases.open-design.ai/server"');
    expect(installer).toContain('"$RELEASE_BASE_URL/latest/VERSION"');
    expect(installer).toContain('"$RELEASE_BASE_URL/v$VERSION/SHA256SUMS"');
  });

  it("keeps the Windows PowerShell 5 bootstrap on a short owned extraction drive", async () => {
    const installer = await readFile(join(resourceRoot, "install.ps1"), "utf8");

    expect(installer).toContain("function Test-CompatibleNode");
    expect(installer).toContain("function Get-NodeIdentity");
    expect(installer).toContain('Invoke-NodeProbe $NodePath "--version"');
    expect(installer).toContain('Invoke-NodeProbe $NodePath "-p process.platform"');
    expect(installer).toContain('Invoke-NodeProbe $NodePath "-p process.arch"');
    expect(installer).not.toMatch(/& \$NodePath\s+-p/);
    expect(installer).not.toContain(
      'process.versions.node + " " + process.platform',
    );
    expect(installer).toContain("verbatimSymlinks: true");
    expect(installer).toContain("fs.renameSync(stage, destination)");
    expect(installer).toContain("process.argv.slice(2)");
    expect(installer).toContain("System32\\subst.exe");
    expect(installer).toContain(".odsi-owner-$ownerToken");
    expect(installer).toContain("$destinationEntry.Length -gt 240");
    expect(installer).toContain("COM[1-9]");
    expect(installer).toContain("installed launcher directory is not on PATH");
    expect(installer).not.toContain("Expand-Archive");
    // Avoid Microsoft.PowerShell.Utility cmdlets; .NET SHA-256 works when
    // module autoload is unavailable under non-interactive Windows PS 5.1.
    expect(installer).not.toMatch(/\bGet-FileHash\b/);
    expect(installer).toContain("[System.Security.Cryptography.SHA256]::Create()");
    expect(installer).toContain('$DefaultReleaseBaseUrl = "https://releases.open-design.ai/server"');
    expect(installer).toContain('"$ReleaseBaseUrl/latest/VERSION"');
    expect(installer).toContain('"$ReleaseBaseUrl/v$Version/SHA256SUMS"');
  });

  it.skipIf(process.platform !== "win32")(
    "probes Node through the real Windows PowerShell 5 bootstrap functions",
    async () => {
      const testRoot = await mkdtemp(join(tmpdir(), "od-server-node-probe-"));
      const harnessPath = join(testRoot, "probe.ps1");
      const installerPath = join(resourceRoot, "install.ps1");
      await writeFile(
        harnessPath,
        String.raw`
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$source = [IO.File]::ReadAllText($env:OPEN_DESIGN_TEST_INSTALLER)
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseInput(
  $source,
  [ref]$tokens,
  [ref]$parseErrors
)
if ($parseErrors.Count -ne 0) {
  throw "install.ps1 did not parse cleanly"
}
$definitions = $ast.FindAll(
  {
    param($node)
    return $node -is [Management.Automation.Language.FunctionDefinitionAst]
  },
  $true
)
foreach ($definition in $definitions) {
  . ([scriptblock]::Create($definition.Extent.Text))
}
$NodeVersion = $env:OPEN_DESIGN_TEST_NODE_VERSION
$identity = Get-NodeIdentity $env:OPEN_DESIGN_TEST_NODE
if (-not $identity.IsRunnable) {
  throw "Node identity probe failed: $($identity.Detail)"
}
if ($identity.Version -cne $NodeVersion) {
  throw "version mismatch: $($identity.Version)"
}
if ($identity.Platform -cne "win32") {
  throw "platform mismatch: $($identity.Platform)"
}
if ($identity.Architecture -cne $env:OPEN_DESIGN_TEST_NODE_ARCH) {
  throw "architecture mismatch: $($identity.Architecture)"
}
if (-not (Test-CompatibleNode $env:OPEN_DESIGN_TEST_NODE $identity.Architecture)) {
  throw "compatible Node probe rejected the test runtime"
}
if (-not (Test-PinnedNode $env:OPEN_DESIGN_TEST_NODE $identity.Architecture)) {
  throw "pinned Node probe rejected the test runtime"
}
`,
        "utf8",
      );

      try {
        const powerShell = join(
          process.env.SystemRoot ?? "C:\\Windows",
          "System32",
          "WindowsPowerShell",
          "v1.0",
          "powershell.exe",
        );
        const result = spawnSync(
          powerShell,
          [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            harnessPath,
          ],
          {
            encoding: "utf8",
            env: {
              ...process.env,
              OPEN_DESIGN_TEST_INSTALLER: installerPath,
              OPEN_DESIGN_TEST_NODE: process.execPath,
              OPEN_DESIGN_TEST_NODE_ARCH: process.arch,
              OPEN_DESIGN_TEST_NODE_VERSION: process.version.slice(1),
            },
            timeout: 30_000,
            windowsHide: true,
          },
        );
        expect(
          result.status,
          `Windows PowerShell 5 probe failed (signal=${String(result.signal)}, error=${result.error?.message ?? "none"}).\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
        ).toBe(0);
      } finally {
        await rm(testRoot, { force: true, recursive: true });
      }
    },
  );
});

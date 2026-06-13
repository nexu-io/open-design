import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.join(repoRoot, "deploy/scripts/prepare-colima-build-swap.sh");

type FakeHost = {
  os: string;
  arch: string;
};

type VmState = {
  memTotalKiB?: number;
  swapTotalKiB?: number;
  fallocateFails?: boolean;
  activeSwapFiles?: string[];
};

type RunOptions = {
  args?: string[];
  env?: Record<string, string>;
  host?: FakeHost;
  vm?: VmState;
};

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function runScript({
  args = ["status"],
  env = {},
  host = { os: "Darwin", arch: "arm64" },
  vm = {},
}: RunOptions = {}) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "prepare-colima-build-swap-"));
  const binDir = path.join(tempDir, "bin");
  const remoteBinDir = path.join(tempDir, "remote-bin");
  await mkdir(binDir);
  await mkdir(remoteBinDir);

  const statePath = path.join(tempDir, "state.env");
  const commandLogPath = path.join(tempDir, "commands.log");
  await writeFile(
    statePath,
    [
      `MEM_TOTAL_KIB=${vm.memTotalKiB ?? 2097152}`,
      `SWAP_TOTAL_KIB=${vm.swapTotalKiB ?? 0}`,
      `FALLOCATE_FAILS=${vm.fallocateFails ? "1" : "0"}`,
      `ACTIVE_SWAP=${(vm.activeSwapFiles ?? []).join(":")}`,
      "DD_COUNT=",
      "FALLOCATE_SIZE=",
      "MKS_SWAP=",
      "SWAPON_TARGET=",
      "SWAPOFF_TARGETS=",
      "RM_TARGETS=",
    ].join("\n"),
  );

  await writeFile(
    path.join(binDir, "uname"),
    [
      "#!/usr/bin/env bash",
      "case \"$1\" in",
      `  -s) printf '%s\\n' ${shellQuote(host.os)} ;;`,
      `  -m) printf '%s\\n' ${shellQuote(host.arch)} ;;`,
      "  *) exit 2 ;;",
      "esac",
    ].join("\n"),
    { mode: 0o755 },
  );

  await writeFile(
    path.join(remoteBinDir, "awk"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `source ${shellQuote(statePath)}`,
      "query=\"$*\"",
      "case \"$query\" in",
      "  *MemTotal*SwapTotal*)",
      "    printf 'MemTotal:       %s kB\\n' \"$MEM_TOTAL_KIB\"",
      "    printf 'SwapTotal:      %s kB\\n' \"$SWAP_TOTAL_KIB\"",
      "    ;;",
      "  *MemTotal*) printf '%s\\n' \"$MEM_TOTAL_KIB\" ;;",
      "  *SwapTotal*) printf '%s\\n' \"$SWAP_TOTAL_KIB\" ;;",
      "  *) exit 2 ;;",
      "esac",
    ].join("\n"),
    { mode: 0o755 },
  );

  await writeFile(
    path.join(remoteBinDir, "swapon"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `source ${shellQuote(statePath)}`,
      "case \"${1:-}\" in",
      "  --show|--show=NAME)",
      "    old_ifs=\"$IFS\"",
      "    IFS=:",
      "    for item in $ACTIVE_SWAP; do",
      "      [ -n \"$item\" ] && printf '%s\\n' \"$item\"",
      "    done",
      "    IFS=\"$old_ifs\"",
      "    ;;",
      "  *)",
      "    printf 'unexpected swapon args: %s\\n' \"$*\" >&2",
      "    exit 2",
      "    ;;",
      "esac",
    ].join("\n"),
    { mode: 0o755 },
  );

  await writeFile(
    path.join(remoteBinDir, "sudo"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `state=${shellQuote(statePath)}`,
      "set_state() {",
      "  key=\"$1\"",
      "  value=\"$2\"",
      "  tmp=\"$state.tmp\"",
      "  /usr/bin/awk -F= -v key=\"$key\" -v value=\"$value\" 'BEGIN { done=0 } $1 == key { print key \"=\" value; done=1; next } { print } END { if (!done) print key \"=\" value }' \"$state\" > \"$tmp\"",
      "  mv \"$tmp\" \"$state\"",
      "}",
      "append_state() {",
      "  key=\"$1\"",
      "  value=\"$2\"",
      "  current=\"$(/usr/bin/awk -F= -v key=\"$key\" '$1 == key { print substr($0, length(key) + 2); exit }' \"$state\")\"",
      "  if [ -n \"$current\" ]; then",
      "    set_state \"$key\" \"$current:$value\"",
      "  else",
      "    set_state \"$key\" \"$value\"",
      "  fi",
      "}",
      "source \"$state\"",
      "case \"$1\" in",
      "  fallocate)",
      "    if [ \"$FALLOCATE_FAILS\" = 1 ]; then",
      "      exit 1",
      "    fi",
      "    set_state FALLOCATE_SIZE \"$3\"",
      "    ;;",
      "  dd)",
      "    count=\"\"",
      "    for arg in \"$@\"; do",
      "      case \"$arg\" in",
      "        count=*) count=\"${arg#count=}\" ;;",
      "      esac",
      "    done",
      "    set_state DD_COUNT \"$count\"",
      "    ;;",
      "  chmod)",
      "    ;;",
      "  mkswap)",
      "    set_state MKS_SWAP \"$2\"",
      "    ;;",
      "  swapon)",
      "    set_state SWAPON_TARGET \"$2\"",
      "    set_state ACTIVE_SWAP \"$2\"",
      "    set_state SWAP_TOTAL_KIB 1",
      "    ;;",
      "  swapoff)",
      "    append_state SWAPOFF_TARGETS \"$2\"",
      "    set_state ACTIVE_SWAP \"\"",
      "    set_state SWAP_TOTAL_KIB 0",
      "    ;;",
      "  rm)",
      "    shift",
      "    [ \"${1:-}\" = -f ] && shift",
      "    for target in \"$@\"; do",
      "      append_state RM_TARGETS \"$target\"",
      "    done",
      "    ;;",
      "  *)",
      "    printf 'unexpected sudo command: %s\\n' \"$*\" >&2",
      "    exit 2",
      "    ;;",
      "esac",
    ].join("\n"),
    { mode: 0o755 },
  );

  await writeFile(
    path.join(binDir, "colima"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `log=${shellQuote(commandLogPath)}`,
      `remote_bin=${shellQuote(remoteBinDir)}`,
      "printf '%s\\n' \"$*\" >> \"$log\"",
      "if [ \"$1\" = status ]; then",
      "  exit 0",
      "fi",
      "if [ \"$1\" != ssh ]; then",
      "  exit 2",
      "fi",
      "shift",
      "if [ \"${1:-}\" = -- ]; then",
      "  shift",
      "fi",
      "case \"$1\" in",
      "  awk)",
      "    PATH=\"$remote_bin:$PATH\" \"$@\"",
      "    ;;",
      "  sh)",
      "    shift",
      "    [ \"$1\" = -lc ] || exit 2",
      "    shift",
      "    script=\"$1\"",
      "    shift",
      "    env PATH=\"$remote_bin:$PATH\" bash -c \"$script\" \"$@\"",
      "    ;;",
      "  *)",
      "    exit 2",
      "    ;;",
      "esac",
    ].join("\n"),
    { mode: 0o755 },
  );

  const processResult = await new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
    const child = spawn("bash", [scriptPath, ...args], {
      env: {
        ...process.env,
        ...env,
        COLIMA_BIN: path.join(binDir, "colima"),
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
      },
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stderr });
    });
  });

  let colimaLog = "";
  try {
    colimaLog = await readFile(commandLogPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const state = Object.fromEntries(
    (await readFile(statePath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => {
        const [key, ...value] = line.split("=");
        return [key, value.join("=")];
      }),
  );

  return { ...processResult, colimaLog, state };
}

test("prepare-colima-build-swap refuses Linux hosts before checking Colima", async () => {
  const result = await runScript({ args: ["status"], host: { os: "Linux", arch: "x86_64" } });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /requires Apple Silicon macOS/);
  assert.equal(result.colimaLog, "");
});

test("prepare-colima-build-swap refuses Intel macOS hosts before checking Colima", async () => {
  const result = await runScript({ args: ["status"], host: { os: "Darwin", arch: "x86_64" } });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /requires Apple Silicon macOS/);
  assert.equal(result.colimaLog, "");
});

test("prepare-colima-build-swap allows Apple Silicon macOS hosts to check Colima", async () => {
  const result = await runScript({ args: ["status"] });

  assert.equal(result.code, 0);
  assert.match(result.colimaLog, /^status\nssh -- sh -lc/m);
});

test("ensure creates and enables swap for low-memory Colima without swap", async () => {
  const result = await runScript({ args: ["ensure"] });

  assert.equal(result.code, 0);
  assert.equal(result.state.FALLOCATE_SIZE, "4G");
  assert.equal(result.state.MKS_SWAP, "/swapfile-colima-build");
  assert.equal(result.state.SWAPON_TARGET, "/swapfile-colima-build");
});

test("ensure uses the configured swap size when dd fallback is needed", async () => {
  const result = await runScript({
    args: ["ensure"],
    env: { COLIMA_BUILD_SWAP_SIZE: "6G" },
    vm: { fallocateFails: true },
  });

  assert.equal(result.code, 0);
  assert.equal(result.state.DD_COUNT, "6144");
  assert.equal(result.state.SWAPON_TARGET, "/swapfile-colima-build");
});

test("ensure is a no-op when Colima already has swap", async () => {
  const result = await runScript({ args: ["ensure"], vm: { swapTotalKiB: 1048576 } });

  assert.equal(result.code, 0);
  assert.equal(result.state.FALLOCATE_SIZE, "");
  assert.equal(result.state.SWAPON_TARGET, "");
});

test("ensure is a no-op when Colima memory is above the threshold", async () => {
  const result = await runScript({ args: ["ensure"], vm: { memTotalKiB: 8388608 } });

  assert.equal(result.code, 0);
  assert.equal(result.state.FALLOCATE_SIZE, "");
  assert.equal(result.state.SWAPON_TARGET, "");
});

test("cleanup removes the default and legacy swap paths", async () => {
  const result = await runScript({
    args: ["cleanup"],
    vm: { activeSwapFiles: ["/swapfile-colima-build"], swapTotalKiB: 1048576 },
  });

  assert.equal(result.code, 0);
  assert.equal(result.state.SWAPOFF_TARGETS, "/swapfile-colima-build");
  assert.equal(result.state.RM_TARGETS, "/swapfile-colima-build:/swapfile-open-design-build");
});

test("cleanup refuses custom swap paths unless force is enabled", async () => {
  const result = await runScript({
    args: ["cleanup"],
    env: { COLIMA_BUILD_SWAPFILE: "/custom-swapfile" },
    vm: { activeSwapFiles: ["/custom-swapfile"], swapTotalKiB: 1048576 },
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /refusing to cleanup custom swap path/);
  assert.equal(result.state.RM_TARGETS, "");
});

test("cleanup removes custom swap paths when force is enabled", async () => {
  const result = await runScript({
    args: ["cleanup"],
    env: { COLIMA_BUILD_SWAPFILE: "/custom-swapfile", COLIMA_BUILD_SWAP_CLEANUP_FORCE: "1" },
    vm: { activeSwapFiles: ["/custom-swapfile"], swapTotalKiB: 1048576 },
  });

  assert.equal(result.code, 0);
  assert.equal(result.state.SWAPOFF_TARGETS, "/custom-swapfile");
  assert.equal(result.state.RM_TARGETS, "/custom-swapfile:/swapfile-open-design-build");
});

test("invalid swap size overrides fail before checking Colima", async () => {
  const result = await runScript({ args: ["status"], env: { COLIMA_BUILD_SWAP_SIZE: "4G; touch /tmp/pwned" } });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /COLIMA_BUILD_SWAP_SIZE must be/);
  assert.equal(result.colimaLog, "");
});

test("invalid swap file overrides fail before checking Colima", async () => {
  const result = await runScript({ args: ["status"], env: { COLIMA_BUILD_SWAPFILE: "/tmp/swap'file" } });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /COLIMA_BUILD_SWAPFILE must be/);
  assert.equal(result.colimaLog, "");
});

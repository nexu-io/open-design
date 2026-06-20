import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  atomicCopyFile,
  createCommandInvocation,
  createPackageManagerInvocation,
  createProcessStampArgs,
  mergeProxyAwareEnv,
  matchesStampedProcess,
  parseMacosScutilProxyOutput,
  parseWindowsInternetSettingsProxyOutput,
  pathContains,
  readProcessStampFromCommand,
  removePathBestEffort,
  resolveSystemProxyEnv,
  wellKnownUserToolchainBins,
  type ProcessStampContract,
} from "../src/index.js";

type FakeStamp = {
  app: "api" | "ui";
  ipc: string;
  mode: "dev" | "runtime";
  namespace: string;
  source: "tool" | "pack";
};

const fakeContract: ProcessStampContract<FakeStamp> = {
  stampFields: ["app", "mode", "namespace", "ipc", "source"],
  stampFlags: {
    app: "--fake-app",
    ipc: "--fake-ipc",
    mode: "--fake-mode",
    namespace: "--fake-namespace",
    source: "--fake-source",
  },
  normalizeStamp(input) {
    const value = input as Partial<FakeStamp>;
    if (value.app !== "api" && value.app !== "ui") throw new Error("invalid app");
    if (value.mode !== "dev" && value.mode !== "runtime") throw new Error("invalid mode");
    if (typeof value.namespace !== "string" || value.namespace.length === 0) throw new Error("invalid namespace");
    if (typeof value.ipc !== "string" || value.ipc.length === 0) throw new Error("invalid ipc");
    if (value.source !== "tool" && value.source !== "pack") throw new Error("invalid source");
    return {
      app: value.app,
      ipc: value.ipc,
      mode: value.mode,
      namespace: value.namespace,
      source: value.source,
    };
  },
  normalizeStampCriteria(input = {}) {
    const value = input as Partial<FakeStamp>;
    return {
      ...(value.app == null ? {} : { app: value.app }),
      ...(value.ipc == null ? {} : { ipc: value.ipc }),
      ...(value.mode == null ? {} : { mode: value.mode }),
      ...(value.namespace == null ? {} : { namespace: value.namespace }),
      ...(value.source == null ? {} : { source: value.source }),
    };
  },
};

const stamp: FakeStamp = {
  app: "ui",
  ipc: "/tmp/fake-product/ipc/stamp-boundary-a/ui.sock",
  mode: "dev",
  namespace: "stamp-boundary-a",
  source: "tool",
};

describe("generic process stamp primitives", () => {
  it("serializes descriptor-defined stamp flags", () => {
    const args = createProcessStampArgs(stamp, fakeContract);

    expect(args).toHaveLength(5);
    expect(args.join(" ")).toContain("--fake-app=ui");
    expect(args.join(" ")).toContain("--fake-mode=dev");
    expect(args.join(" ")).toContain("--fake-namespace=stamp-boundary-a");
    expect(args.join(" ")).toContain("--fake-ipc=/tmp/fake-product/ipc/stamp-boundary-a/ui.sock");
    expect(args.join(" ")).toContain("--fake-source=tool");
  });

  it("reads and matches stamped process commands using the descriptor", () => {
    const command = ["node", "ui.js", ...createProcessStampArgs(stamp, fakeContract)].join(" ");

    expect(readProcessStampFromCommand(command, fakeContract)).toEqual(stamp);
    expect(matchesStampedProcess({ command }, { app: "ui", namespace: stamp.namespace, source: "tool" }, fakeContract)).toBe(true);
    expect(matchesStampedProcess({ command }, { namespace: "stamp-boundary-b" }, fakeContract)).toBe(false);
    expect(matchesStampedProcess({ command }, { source: "pack" }, fakeContract)).toBe(false);
  });
});

describe("generic filesystem primitives", () => {
  it("recognizes paths contained by a resolved root", () => {
    const root = join(tmpdir(), "platform-path-root");

    expect(pathContains(root, join(root, "child", "file.txt"))).toBe(true);
    expect(pathContains(root, root)).toBe(true);
    expect(pathContains(root, join(root, "..", "outside.txt"))).toBe(false);
  });

  it("copies through a destination-local temporary file", async () => {
    const root = mkdtempSync(join(tmpdir(), "platform-atomic-copy-"));
    try {
      const source = join(root, "source.bin");
      const destination = join(root, "nested", "destination.bin");
      writeFileSync(source, "atomic copy payload");

      const result = await atomicCopyFile(source, destination);

      expect(result).toEqual({ bytesCopied: "atomic copy payload".length, replaced: false });
      expect(readFileSync(destination, "utf8")).toBe("atomic copy payload");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses to replace an existing destination unless overwrite is explicit", async () => {
    const root = mkdtempSync(join(tmpdir(), "platform-atomic-copy-exists-"));
    try {
      const source = join(root, "source.bin");
      const destination = join(root, "destination.bin");
      writeFileSync(source, "new payload");
      writeFileSync(destination, "old payload");

      await expect(atomicCopyFile(source, destination)).rejects.toMatchObject({ code: "EEXIST" });
      expect(readFileSync(destination, "utf8")).toBe("old payload");

      const overwritten = await atomicCopyFile(source, destination, { overwrite: true });
      expect(overwritten.replaced).toBe(true);
      expect(readFileSync(destination, "utf8")).toBe("new payload");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("removes paths best-effort without throwing on missing paths", async () => {
    const root = mkdtempSync(join(tmpdir(), "platform-best-effort-rm-"));
    const target = join(root, "target");
    mkdirSync(target);
    try {
      expect((await removePathBestEffort(target)).removed).toBe(true);
      expect(existsSync(target)).toBe(false);
      expect((await removePathBestEffort(target)).removed).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("system proxy env resolution", () => {
  it("enables Node env proxy support when merging user proxy variables", () => {
    const env = mergeProxyAwareEnv("darwin", {
      http_proxy: "http://user-proxy:7890",
    });

    expect(env).toMatchObject({
      HTTP_PROXY: "http://user-proxy:7890",
      NODE_USE_ENV_PROXY: "1",
      http_proxy: "http://user-proxy:7890",
    });
  });

  it("preserves an explicit NODE_USE_ENV_PROXY value when merging user proxy variables", () => {
    const env = mergeProxyAwareEnv("darwin", {
      HTTPS_PROXY: "http://user-proxy:7891",
      NODE_USE_ENV_PROXY: "0",
    });

    expect(env.HTTPS_PROXY).toBe("http://user-proxy:7891");
    expect(env.NODE_USE_ENV_PROXY).toBe("0");
  });

  it("parses macOS scutil output into standard proxy env vars", () => {
    const env = parseMacosScutilProxyOutput(`
<dictionary> {
  ExceptionsList : <array> {
    0 : *.local
    1 : localhost
  }
  HTTPEnable : 1
  HTTPPort : 7890
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 7891
  HTTPSProxy : corp-proxy.internal
  SOCKSEnable : 1
  SOCKSPort : 1080
  SOCKSProxy : 127.0.0.1
}
`);

    expect(env).toMatchObject({
      HTTP_PROXY: "http://127.0.0.1:7890",
      HTTPS_PROXY: "http://corp-proxy.internal:7891",
      ALL_PROXY: "socks5://127.0.0.1:1080",
      NO_PROXY: ".local,localhost,127.0.0.1,[::1]",
      NODE_USE_ENV_PROXY: "1",
      http_proxy: "http://127.0.0.1:7890",
      https_proxy: "http://corp-proxy.internal:7891",
      all_proxy: "socks5://127.0.0.1:1080",
      no_proxy: ".local,localhost,127.0.0.1,[::1]",
    });
  });

  it("brackets IPv6 system proxy hosts before composing proxy URLs", () => {
    const env = parseMacosScutilProxyOutput(`
<dictionary> {
  HTTPEnable : 1
  HTTPPort : 7890
  HTTPProxy : ::1
  HTTPSEnable : 1
  HTTPSPort : 7891
  HTTPSProxy : 2001:db8::10
  SOCKSEnable : 1
  SOCKSPort : 1080
  SOCKSProxy : fe80::1
}
`);

    expect(env).toMatchObject({
      HTTP_PROXY: "http://[::1]:7890",
      HTTPS_PROXY: "http://[2001:db8::10]:7891",
      ALL_PROXY: "socks5://[fe80::1]:1080",
      http_proxy: "http://[::1]:7890",
      https_proxy: "http://[2001:db8::10]:7891",
      all_proxy: "socks5://[fe80::1]:1080",
    });
  });

  it("parses Windows Internet Settings proxy registry values", () => {
    const env = parseWindowsInternetSettingsProxyOutput({
      proxyEnable: `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyEnable    REG_DWORD    0x1
`,
      proxyServer: `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyServer    REG_SZ    http=10.0.0.2:8080;https=10.0.0.3:8443;socks=10.0.0.4:1080
`,
      proxyOverride: `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyOverride    REG_SZ    localhost;<local>;*.corp
`,
    });

    expect(env).toEqual({
      HTTP_PROXY: "http://10.0.0.2:8080",
      HTTPS_PROXY: "http://10.0.0.3:8443",
      ALL_PROXY: "socks5://10.0.0.4:1080",
      NO_PROXY: "localhost,<local>,127.0.0.1,[::1],.local,.corp",
      NODE_USE_ENV_PROXY: "1",
    });
  });

  it("brackets Windows IPv6 proxy hosts before composing proxy URLs", () => {
    const segmented = parseWindowsInternetSettingsProxyOutput({
      proxyEnable: `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyEnable    REG_DWORD    0x1
`,
      proxyServer: `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyServer    REG_SZ    http=::1:8080;https=2001:db8::10:8443;socks=fe80::1:1080
`,
    });
    const shared = parseWindowsInternetSettingsProxyOutput({
      proxyEnable: `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyEnable    REG_DWORD    0x1
`,
      proxyServer: `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyServer    REG_SZ    ::1:8080
`,
    });

    expect(segmented).toMatchObject({
      HTTP_PROXY: "http://[::1]:8080",
      HTTPS_PROXY: "http://[2001:db8::10]:8443",
      ALL_PROXY: "socks5://[fe80::1]:1080",
    });
    expect(shared).toMatchObject({
      HTTP_PROXY: "http://[::1]:8080",
      HTTPS_PROXY: "http://[::1]:8080",
    });
  });

  it("normalizes bare IPv6 loopback bypass entries to bracketed form", () => {
    const env = parseWindowsInternetSettingsProxyOutput({
      proxyEnable: `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyEnable    REG_DWORD    0x1
`,
      proxyServer: `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyServer    REG_SZ    http=10.0.0.2:8080
`,
      proxyOverride: `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyOverride    REG_SZ    ::1;localhost
`,
    });

    expect(env.NO_PROXY).toBe("[::1],localhost,127.0.0.1");
  });

  it("preserves a wildcard macOS bypass list", () => {
    const env = parseMacosScutilProxyOutput(`
<dictionary> {
  ExceptionsList : <array> {
    0 : *
  }
  HTTPEnable : 1
  HTTPPort : 7890
  HTTPProxy : 127.0.0.1
}
`);

    expect(env.NO_PROXY).toBe("*");
    expect(env.no_proxy).toBe("*");
  });

  it("preserves a wildcard macOS bypass list when other entries are present", () => {
    const env = parseMacosScutilProxyOutput(`
<dictionary> {
  ExceptionsList : <array> {
    0 : *
    1 : <local>
  }
  HTTPEnable : 1
  HTTPPort : 7890
  HTTPProxy : 127.0.0.1
}
`);

    expect(env.NO_PROXY).toBe("*");
    expect(env.no_proxy).toBe("*");
  });

  it("adds <local> to the macOS bypass list when simple hostnames are excluded", () => {
    const env = parseMacosScutilProxyOutput(`
<dictionary> {
  ExcludeSimpleHostnames : 1
  HTTPEnable : 1
  HTTPPort : 7890
  HTTPProxy : 127.0.0.1
}
`);

    expect(env.NO_PROXY).toBe("<local>,localhost,127.0.0.1,[::1],.local");
    expect(env.no_proxy).toBe("<local>,localhost,127.0.0.1,[::1],.local");
  });

  it("preserves a wildcard Windows bypass list", () => {
    const env = parseWindowsInternetSettingsProxyOutput({
      proxyEnable: `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyEnable    REG_DWORD    0x1
`,
      proxyServer: `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyServer    REG_SZ    http=10.0.0.2:8080
`,
      proxyOverride: `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyOverride    REG_SZ    *
`,
    });

    expect(env.NO_PROXY).toBe("*");
  });

  it("preserves a wildcard Windows bypass list when other entries are present", () => {
    const env = parseWindowsInternetSettingsProxyOutput({
      proxyEnable: `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyEnable    REG_DWORD    0x1
`,
      proxyServer: `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyServer    REG_SZ    http=10.0.0.2:8080
`,
      proxyOverride: `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyOverride    REG_SZ    *;<local>
`,
    });

    expect(env.NO_PROXY).toBe("*");
  });

  it("resolves macOS system proxy env through the command runner", () => {
    const env = resolveSystemProxyEnv({
      platform: "darwin",
      runCommand(command, args) {
        expect(command).toBe("scutil");
        expect(args).toEqual(["--proxy"]);
        return `
<dictionary> {
  HTTPEnable : 1
  HTTPPort : 8888
  HTTPProxy : 127.0.0.1
}
`;
      },
    });

    expect(env.HTTP_PROXY).toBe("http://127.0.0.1:8888");
    expect(env.NODE_USE_ENV_PROXY).toBe("1");
  });

  it("returns an empty object when the platform has no system proxy adapter", () => {
    expect(resolveSystemProxyEnv({ platform: "linux" })).toEqual({});
  });

  it("does not cache system proxy resolution across calls", () => {
    const values = [
      "\n<dictionary> {\n  HTTPEnable : 1\n  HTTPPort : 8001\n  HTTPProxy : 127.0.0.1\n}\n",
      "\n<dictionary> {\n  HTTPEnable : 1\n  HTTPPort : 8002\n  HTTPProxy : 127.0.0.1\n}\n",
    ];
    let callCount = 0;
    const runCommand = () => values[callCount++] ?? values.at(-1) ?? "";

    const first = resolveSystemProxyEnv({ platform: "darwin", runCommand });
    const second = resolveSystemProxyEnv({ platform: "darwin", runCommand });

    expect(first.HTTP_PROXY).toBe("http://127.0.0.1:8001");
    expect(second.HTTP_PROXY).toBe("http://127.0.0.1:8002");
    expect(callCount).toBe(2);
  });

  it("makes the last proxy env source win case-insensitively", () => {
    const env = mergeProxyAwareEnv(
      "linux",
      { HTTPS_PROXY: "http://system:8443", https_proxy: "http://system:8443" },
      { https_proxy: "http://user:9443" },
    );

    expect(env.HTTPS_PROXY).toBe("http://user:9443");
    expect(env.https_proxy).toBe("http://user:9443");
  });

  it("makes lowercase proxy vars win within a single POSIX source", () => {
    const env = mergeProxyAwareEnv("linux", {
      http_proxy: "http://new:8080",
      HTTP_PROXY: "http://old:8080",
      HTTPS_PROXY: "http://older:8443",
      https_proxy: "http://newer:8443",
    });

    expect(env.HTTP_PROXY).toBe("http://new:8080");
    expect(env.http_proxy).toBe("http://new:8080");
    expect(env.HTTPS_PROXY).toBe("http://newer:8443");
    expect(env.https_proxy).toBe("http://newer:8443");
  });
});

// `createCommandInvocation` makes a platform-conditional choice based on
// `process.platform`. These tests stub it both ways so we exercise the
// Windows .cmd / .bat shim path on every CI runner, not just Windows.
describe("createCommandInvocation", () => {
  const originalPlatform = process.platform;
  function setPlatform(value: NodeJS.Platform): void {
    Object.defineProperty(process, "platform", { configurable: true, value });
  }
  afterEach(() => {
    Object.defineProperty(process, "platform", { configurable: true, value: originalPlatform });
  });

  it("returns the raw command and args unchanged on POSIX", () => {
    setPlatform("linux");
    const invocation = createCommandInvocation({
      command: "/usr/local/bin/codex",
      args: ["--help"],
    });
    expect(invocation).toEqual({
      args: ["--help"],
      command: "/usr/local/bin/codex",
    });
    expect(invocation.windowsVerbatimArguments).toBeUndefined();
  });

  it("returns the raw command and args unchanged on Windows for non-shim binaries", () => {
    setPlatform("win32");
    const invocation = createCommandInvocation({
      command: "C:\\Program Files\\node\\node.exe",
      args: ["script.js"],
    });
    expect(invocation).toEqual({
      args: ["script.js"],
      command: "C:\\Program Files\\node\\node.exe",
    });
    expect(invocation.windowsVerbatimArguments).toBeUndefined();
  });

  it("wraps a Windows .CMD shim through cmd.exe with verbatim arguments", () => {
    setPlatform("win32");
    const invocation = createCommandInvocation({
      command: "C:\\Users\\Ethical Byte\\AppData\\Local\\Programs\\nodejs\\codex.CMD",
      args: ["--version"],
      env: { ComSpec: "C:\\Windows\\System32\\cmd.exe" } as NodeJS.ProcessEnv,
    });

    expect(invocation.command).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(invocation.windowsVerbatimArguments).toBe(true);
    // Critical: the inner command line is wrapped in extra `"…"` so that
    // cmd.exe's `/s /c` quote-stripping (strip first + last `"`) leaves the
    // path quoting intact. Without the outer wrap, `Ethical Byte` gets
    // split on the space and cmd reports "not recognized" (issue #315).
    expect(invocation.args).toEqual([
      "/d",
      "/s",
      "/c",
      '""C:\\Users\\Ethical Byte\\AppData\\Local\\Programs\\nodejs\\codex.CMD" --version"',
    ]);
  });

  it("treats .bat shims the same as .cmd shims", () => {
    setPlatform("win32");
    const invocation = createCommandInvocation({
      command: "C:\\tools\\bin\\my tool.bat",
      args: [],
      env: { ComSpec: "cmd.exe" } as NodeJS.ProcessEnv,
    });
    expect(invocation.windowsVerbatimArguments).toBe(true);
    expect(invocation.args).toEqual(["/d", "/s", "/c", '""C:\\tools\\bin\\my tool.bat""']);
  });

  it("quotes argv elements containing spaces alongside the shim path", () => {
    setPlatform("win32");
    const invocation = createCommandInvocation({
      command: "C:\\Users\\First Last\\codex.cmd",
      args: ["--cwd", "C:\\Some Path\\proj", "exec", "echo hi"],
      env: { ComSpec: "cmd.exe" } as NodeJS.ProcessEnv,
    });
    // After the outer wrap and `/s /c` stripping, cmd will see:
    //   "C:\Users\First Last\codex.cmd" --cwd "C:\Some Path\proj" exec "echo hi"
    expect(invocation.args).toEqual([
      "/d",
      "/s",
      "/c",
      '""C:\\Users\\First Last\\codex.cmd" --cwd "C:\\Some Path\\proj" exec "echo hi""',
    ]);
  });

  it("does not quote argv elements without whitespace or shell metacharacters", () => {
    setPlatform("win32");
    const invocation = createCommandInvocation({
      command: "codex.cmd",
      args: ["--model", "claude-opus-4", "--max-tokens=4096"],
      env: { ComSpec: "cmd.exe" } as NodeJS.ProcessEnv,
    });
    expect(invocation.args).toEqual([
      "/d",
      "/s",
      "/c",
      '"codex.cmd --model claude-opus-4 --max-tokens=4096"',
    ]);
  });

  // cmd.exe runs percent-expansion on the inner command line of `cmd /s /c
  // "..."` regardless of inner quote state, so a `.cmd` shim spawn whose
  // argv carries an attacker-influenced `%DEEPSEEK_API_KEY%` substring would
  // otherwise have the daemon environment substituted into the child's
  // command line before the child saw the prompt. Pin that the constructed
  // invocation breaks every potential `%var%` pair with `"^%"` so cmd has no
  // chance to expand it, while `CommandLineToArgvW` still concatenates the
  // surrounding quote segments back into the original arg.
  it("escapes %var% sequences in argv so cmd.exe cannot expand them on a .cmd shim", () => {
    setPlatform("win32");
    const invocation = createCommandInvocation({
      command: "C:\\Users\\Tester\\AppData\\Roaming\\npm\\deepseek.cmd",
      args: ["exec", "--auto", "write a function that reads %DEEPSEEK_API_KEY% from env"],
      env: { ComSpec: "cmd.exe" } as NodeJS.ProcessEnv,
    });

    expect(invocation.command).toBe("cmd.exe");
    expect(invocation.windowsVerbatimArguments).toBe(true);
    // The full inner line cmd.exe receives after `/s` strips its outer wrap.
    const innerLine = invocation.args[3];
    if (typeof innerLine !== "string") throw new Error("expected an inner cmd line");

    // The literal `%DEEPSEEK_API_KEY%` pair must NOT survive intact in the
    // inner line — if it did, cmd would expand it before the child runs.
    expect(innerLine).not.toContain("%DEEPSEEK_API_KEY%");

    // Each `%` must be wrapped in `"^%"` so cmd's `^` escape neutralizes the
    // percent and `CommandLineToArgvW` rejoins the quote segments. Two `%`
    // chars in the prompt → two escaped occurrences.
    const escapedOccurrences = innerLine.split('"^%"').length - 1;
    expect(escapedOccurrences).toBe(2);

    // Sanity: the literal env-var name still appears (the prompt itself is
    // not corrupted, only the surrounding `%` are escaped).
    expect(innerLine).toContain("DEEPSEEK_API_KEY");
  });

  it("does not perturb argv quoting when no %var% sequence is present", () => {
    setPlatform("win32");
    const invocation = createCommandInvocation({
      command: "deepseek.cmd",
      args: ["exec", "--auto", "write hello world"],
      env: { ComSpec: "cmd.exe" } as NodeJS.ProcessEnv,
    });
    // Pre-fix shape — adding the `%` escape must not change the line for
    // ordinary prompts that happen not to mention env-var names.
    expect(invocation.args).toEqual([
      "/d",
      "/s",
      "/c",
      '"deepseek.cmd exec --auto "write hello world""',
    ]);
  });

  it("falls back to process.env.ComSpec when env override is absent", () => {
    setPlatform("win32");
    const original = process.env.ComSpec;
    process.env.ComSpec = "C:\\Windows\\System32\\cmd.exe";
    try {
      const invocation = createCommandInvocation({
        command: "tool.cmd",
        args: [],
      });
      expect(invocation.command).toBe("C:\\Windows\\System32\\cmd.exe");
    } finally {
      if (original == null) delete process.env.ComSpec;
      else process.env.ComSpec = original;
    }
  });
});

describe("wellKnownUserToolchainBins Windows fnm node discovery", () => {
  // Issue #3517: a GUI-launched packaged app on Windows inherits a stripped
  // PATH and never sees fnm-managed Node. fnm on Windows keeps its installs
  // under %APPDATA%\fnm\node-versions\<version>\installation, with node.exe
  // directly in `installation` (no POSIX-style `bin` subdir). The toolchain
  // bin list only probed ~/.fnm and ~/.local/share/fnm with [installation,
  // bin] segments, so Windows fnm Node was silently undetected.
  const originalPlatform = process.platform;
  function setPlatform(value: NodeJS.Platform): void {
    Object.defineProperty(process, "platform", { configurable: true, value });
  }
  afterEach(() => {
    Object.defineProperty(process, "platform", { configurable: true, value: originalPlatform });
  });

  it("surfaces the Windows fnm installation dir under %APPDATA%\\fnm", () => {
    const home = mkdtempSync(join(tmpdir(), "od-fnm-home-"));
    const appData = mkdtempSync(join(tmpdir(), "od-fnm-appdata-"));
    const installDir = join(appData, "fnm", "node-versions", "v22.13.1", "installation");
    mkdirSync(installDir, { recursive: true });
    setPlatform("win32");
    try {
      const dirs = wellKnownUserToolchainBins({ home, env: { APPDATA: appData } });
      expect(dirs).toContain(installDir);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(appData, { recursive: true, force: true });
    }
  });

  it("honors FNM_DIR over %APPDATA% for the Windows fnm root", () => {
    const home = mkdtempSync(join(tmpdir(), "od-fnm-home-"));
    const fnmDir = mkdtempSync(join(tmpdir(), "od-fnm-dir-"));
    const installDir = join(fnmDir, "node-versions", "v20.11.0", "installation");
    mkdirSync(installDir, { recursive: true });
    setPlatform("win32");
    try {
      const dirs = wellKnownUserToolchainBins({
        home,
        env: { APPDATA: join(home, "AppData", "Roaming"), FNM_DIR: fnmDir },
      });
      expect(dirs).toContain(installDir);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(fnmDir, { recursive: true, force: true });
    }
  });

  it("surfaces the Windows fnm installation dir under %LOCALAPPDATA%\\fnm", () => {
    // fnm on Windows can keep its root under %LOCALAPPDATA%\fnm (not only
    // %APPDATA%\fnm). A globally `npm i -g`'d CLI (e.g. Codex) lands in the
    // node install's `installation` dir, so probing this root makes that CLI
    // discoverable from a GUI launch. See issue #3062.
    const home = mkdtempSync(join(tmpdir(), "od-fnm-home-"));
    const localAppData = mkdtempSync(join(tmpdir(), "od-fnm-localappdata-"));
    const installDir = join(localAppData, "fnm", "node-versions", "v22.13.1", "installation");
    mkdirSync(installDir, { recursive: true });
    setPlatform("win32");
    try {
      const dirs = wellKnownUserToolchainBins({ home, env: { LOCALAPPDATA: localAppData } });
      expect(dirs).toContain(installDir);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(localAppData, { recursive: true, force: true });
    }
  });
});

describe("createPackageManagerInvocation", () => {
  const originalPlatform = process.platform;
  function setPlatform(value: NodeJS.Platform): void {
    Object.defineProperty(process, "platform", { configurable: true, value });
  }
  afterEach(() => {
    Object.defineProperty(process, "platform", { configurable: true, value: originalPlatform });
  });

  it("uses Node-loadable npm_execpath via process.execPath when set", () => {
    setPlatform("win32");
    const invocation = createPackageManagerInvocation(["install"], {
      npm_execpath: "C:\\Users\\u\\.nvm\\pnpm.cjs",
    } as NodeJS.ProcessEnv);
    expect(invocation.command).toBe(process.execPath);
    expect(invocation.args[0]).toBe("C:\\Users\\u\\.nvm\\pnpm.cjs");
    expect(invocation.args.slice(1)).toEqual(["install"]);
    expect(invocation.windowsVerbatimArguments).toBeUndefined();
  });

  it("executes native npm_execpath directly instead of loading it through Node", () => {
    setPlatform("linux");
    const invocation = createPackageManagerInvocation(["--filter", "@open-design/desktop", "build"], {
      npm_execpath: "/home/u/.local/share/pnpm/.tools/@pnpm+linux-x64/10.33.2/node_modules/@pnpm/linux-x64/pnpm",
    } as NodeJS.ProcessEnv);
    expect(invocation).toEqual({
      args: ["--filter", "@open-design/desktop", "build"],
      command: "/home/u/.local/share/pnpm/.tools/@pnpm+linux-x64/10.33.2/node_modules/@pnpm/linux-x64/pnpm",
    });
  });

  it("uses binary npm_execpath directly on POSIX", () => {
    setPlatform("linux");
    const invocation = createPackageManagerInvocation(["install"], {
      npm_execpath: "/home/runner/setup-pnpm/node_modules/.bin/pnpm",
    } as NodeJS.ProcessEnv);
    expect(invocation).toEqual({
      args: ["install"],
      command: "/home/runner/setup-pnpm/node_modules/.bin/pnpm",
    });
  });

  it("wraps binary npm_execpath shims through cmd.exe on Windows", () => {
    setPlatform("win32");
    const invocation = createPackageManagerInvocation(["install"], {
      ComSpec: "cmd.exe",
      npm_execpath: "C:\\Users\\u\\setup-pnpm\\pnpm.cmd",
    } as NodeJS.ProcessEnv);
    expect(invocation.command).toBe("cmd.exe");
    expect(invocation.windowsVerbatimArguments).toBe(true);
    expect(invocation.args).toEqual([
      "/d",
      "/s",
      "/c",
      '"C:\\Users\\u\\setup-pnpm\\pnpm.cmd install"',
    ]);
  });

  it("returns corepack pnpm invocation on POSIX without npm_execpath", () => {
    setPlatform("linux");
    const invocation = createPackageManagerInvocation(["install"], {} as NodeJS.ProcessEnv);
    expect(invocation).toEqual({ args: ["pnpm", "install"], command: "corepack" });
  });

  it("wraps corepack pnpm through cmd.exe with verbatim arguments on Windows", () => {
    setPlatform("win32");
    const invocation = createPackageManagerInvocation(["--filter", "@open-design/desktop", "build"], {
      ComSpec: "cmd.exe",
    } as NodeJS.ProcessEnv);
    expect(invocation.command).toBe("cmd.exe");
    expect(invocation.windowsVerbatimArguments).toBe(true);
    expect(invocation.args).toEqual([
      "/d",
      "/s",
      "/c",
      '"corepack pnpm --filter @open-design/desktop build"',
    ]);
  });
});

describe("wellKnownUserToolchainBins", () => {
  // Filesystem-backed cases use a sandboxed home so we don't depend on the
  // real machine's toolchain layout. PATHEXT-style Windows quirks aren't
  // relevant here — the helper returns directories, not resolved binaries.
  it("returns the documented user-level CLI install locations under home", () => {
    const home = mkdtempSync(join(tmpdir(), "wkutb-home-"));
    try {
      const dirs = wellKnownUserToolchainBins({ home, env: {}, includeSystemBins: false });
      expect(dirs).toContain(join(home, ".local", "bin"));
      expect(dirs).toContain(join(home, ".kimi-code", "bin"));
      expect(dirs).toContain(join(home, ".opencode", "bin"));
      expect(dirs).toContain(join(home, ".bun", "bin"));
      expect(dirs).toContain(join(home, ".volta", "bin"));
      expect(dirs).toContain(join(home, ".asdf", "shims"));
      expect(dirs).toContain(join(home, "Library", "pnpm"));
      expect(dirs).toContain(join(home, ".cargo", "bin"));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  // Non-Node user toolchains that still ship agent CLIs (or their deps):
  // Deno's install root, Go's default GOBIN, and pyenv's shim dir. GUI
  // launches inherit a stripped PATH, so these must be searched explicitly.
  it("includes Deno, Go, and pyenv user toolchain dirs", () => {
    const home = mkdtempSync(join(tmpdir(), "wkutb-extra-"));
    try {
      const dirs = wellKnownUserToolchainBins({ home, env: {}, includeSystemBins: false });
      expect(dirs).toContain(join(home, ".deno", "bin"));
      expect(dirs).toContain(join(home, "go", "bin"));
      expect(dirs).toContain(join(home, ".pyenv", "shims"));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  // Regression for #442. The two dominant non-canonical npm prefixes used
  // by sudo-free tutorials (~/.npm-global, ~/.npm-packages) must always
  // appear, otherwise GUI-launched daemons miss `npm i -g`'d CLIs.
  it("includes both ~/.npm-global/bin and ~/.npm-packages/bin (issue #442)", () => {
    const home = mkdtempSync(join(tmpdir(), "wkutb-npm-"));
    try {
      const dirs = wellKnownUserToolchainBins({ home, env: {}, includeSystemBins: false });
      expect(dirs).toContain(join(home, ".npm-global", "bin"));
      expect(dirs).toContain(join(home, ".npm-packages", "bin"));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("includes ~/.vite-plus/bin so vp-managed global shims resolve under GUI launchers", () => {
    const home = mkdtempSync(join(tmpdir(), "wkutb-vp-"));
    try {
      const dirs = wellKnownUserToolchainBins({ home, env: {}, includeSystemBins: false });
      expect(dirs).toContain(join(home, ".vite-plus", "bin"));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("appends $NPM_CONFIG_PREFIX/bin when set so corporate prefixes resolve", () => {
    const home = mkdtempSync(join(tmpdir(), "wkutb-prefix-"));
    const customPrefix = mkdtempSync(join(tmpdir(), "wkutb-custom-"));
    try {
      const dirs = wellKnownUserToolchainBins({
        home,
        env: { NPM_CONFIG_PREFIX: customPrefix },
        includeSystemBins: false,
      });
      expect(dirs).toContain(join(customPrefix, "bin"));
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(customPrefix, { recursive: true, force: true });
    }
  });

  it("falls back to lower-case npm_config_prefix when NPM_CONFIG_PREFIX is absent", () => {
    const home = mkdtempSync(join(tmpdir(), "wkutb-prefix-lc-"));
    const customPrefix = mkdtempSync(join(tmpdir(), "wkutb-custom-lc-"));
    try {
      const dirs = wellKnownUserToolchainBins({
        home,
        env: { npm_config_prefix: customPrefix },
        includeSystemBins: false,
      });
      expect(dirs).toContain(join(customPrefix, "bin"));
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(customPrefix, { recursive: true, force: true });
    }
  });

  it("prepends $VP_HOME/bin and expands ~/ so custom Vite+ homes outrank the default", () => {
    const home = mkdtempSync(join(tmpdir(), "wkutb-vp-home-"));
    try {
      const dirs = wellKnownUserToolchainBins({
        home,
        env: { VP_HOME: "~/custom-vp-home" },
        includeSystemBins: false,
      });
      expect(dirs[0]).toBe(join(home, "custom-vp-home", "bin"));
      expect(dirs).toContain(join(home, ".vite-plus", "bin"));
      expect(dirs.indexOf(join(home, ".vite-plus", "bin"))).toBeGreaterThan(0);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("places $VP_HOME/bin before $NPM_CONFIG_PREFIX/bin when both explicit homes are set", () => {
    const home = mkdtempSync(join(tmpdir(), "wkutb-vp-npm-order-"));
    const npmPrefix = mkdtempSync(join(tmpdir(), "wkutb-vp-npm-prefix-"));
    try {
      const dirs = wellKnownUserToolchainBins({
        home,
        env: { NPM_CONFIG_PREFIX: npmPrefix, VP_HOME: "~/custom-vp-home" },
        includeSystemBins: false,
      });
      const vpIdx = dirs.indexOf(join(home, "custom-vp-home", "bin"));
      const npmIdx = dirs.indexOf(join(npmPrefix, "bin"));
      expect(vpIdx).toBe(0);
      expect(npmIdx).toBeGreaterThan(vpIdx);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(npmPrefix, { recursive: true, force: true });
    }
  });

  it("includes the default mise shims dir so mise-installed CLIs (pi, kimi, etc.) are visible to GUI daemons", () => {
    const home = mkdtempSync(join(tmpdir(), "wkutb-mise-shims-"));
    try {
      const dirs = wellKnownUserToolchainBins({ home, env: {}, includeSystemBins: false });
      expect(dirs).toContain(join(home, ".local", "share", "mise", "shims"));
      // Legacy location too
      expect(dirs).toContain(join(home, ".mise", "shims"));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("respects $MISE_DATA_DIR for the shims location (custom mise root)", () => {
    const home = mkdtempSync(join(tmpdir(), "wkutb-mise-data-"));
    const customMise = mkdtempSync(join(tmpdir(), "wkutb-custom-mise-"));
    try {
      // Create fixture install trees under the custom root so the installs
      // scanning logic is exercised (this catches regressions that only
      // affect shims but not the Node / npm-openai-codex install paths).
      const customNodeBin = join(customMise, "installs", "node", "24.16.0", "bin");
      mkdirSync(customNodeBin, { recursive: true });
      writeFileSync(join(customNodeBin, "marker"), "");

      const customCodexBin = join(customMise, "installs", "npm-openai-codex", "latest", "bin");
      mkdirSync(customCodexBin, { recursive: true });
      writeFileSync(join(customCodexBin, "codex"), "");

      const dirs = wellKnownUserToolchainBins({
        home,
        env: { MISE_DATA_DIR: customMise },
        includeSystemBins: false,
      });

      expect(dirs).toContain(join(customMise, "shims"));
      // Install paths under custom root should be discovered
      expect(dirs).toContain(customNodeBin);
      expect(dirs).toContain(customCodexBin);

      // Default-root paths must not leak in when MISE_DATA_DIR is set
      expect(dirs).not.toContain(join(home, ".local", "share", "mise", "shims"));
      expect(dirs).not.toContain(join(home, ".local", "share", "mise", "installs", "node", "24.16.0", "bin"));

      // Legacy ~/.mise/shims must also be excluded when an explicit override is present
      expect(dirs).not.toContain(join(home, ".mise", "shims"));
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(customMise, { recursive: true, force: true });
    }
  });

  it("does not append a prefix entry when neither env var is set", () => {
    const home = mkdtempSync(join(tmpdir(), "wkutb-noprefix-"));
    try {
      const dirs = wellKnownUserToolchainBins({ home, env: {}, includeSystemBins: false });
      // The bare `/bin` suffix would be ambiguous, but we can at least
      // confirm nothing equal to "/bin" leaked in from a `join(undefined,
      // "bin")`-style bug.
      expect(dirs).not.toContain("/bin");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  // PR #614 review (mrcfps): npm's own resolution order is env > .npmrc
  // > default, so when the user has explicitly configured a prefix via
  // $NPM_CONFIG_PREFIX, that location holds the *current* `npm i -g`
  // installs and should outrank every conventional location below —
  // including ~/.local/bin (which is also a shared pip --user / cargo
  // install dumping ground). Conventional locations frequently retain
  // *stale* binaries from an older prefix.
  it("places $NPM_CONFIG_PREFIX/bin before every conventional location when VP_HOME is unset", () => {
    const home = mkdtempSync(join(tmpdir(), "wkutb-prefix-order-"));
    const customPrefix = mkdtempSync(join(tmpdir(), "wkutb-custom-order-"));
    try {
      const dirs = wellKnownUserToolchainBins({
        home,
        env: { NPM_CONFIG_PREFIX: customPrefix },
        includeSystemBins: false,
      });
      const explicitIdx = dirs.indexOf(join(customPrefix, "bin"));
      const localBinIdx = dirs.indexOf(join(home, ".local", "bin"));
      const npmGlobalIdx = dirs.indexOf(join(home, ".npm-global", "bin"));
      const npmPackagesIdx = dirs.indexOf(join(home, ".npm-packages", "bin"));
      // Explicit prefix must be present and ahead of every conventional
      // sibling. The first hit wins inside resolveOnPath() and the
      // packaged PATH builder, so this ordering propagates verbatim.
      expect(explicitIdx).toBe(0);
      expect(localBinIdx).toBeGreaterThan(explicitIdx);
      expect(npmGlobalIdx).toBeGreaterThan(explicitIdx);
      expect(npmPackagesIdx).toBeGreaterThan(explicitIdx);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(customPrefix, { recursive: true, force: true });
    }
  });

  it("ignores whitespace-only npm prefix values rather than emitting a `/bin` entry", () => {
    const home = mkdtempSync(join(tmpdir(), "wkutb-whitespace-prefix-"));
    try {
      const dirs = wellKnownUserToolchainBins({
        home,
        env: { NPM_CONFIG_PREFIX: "   " },
        includeSystemBins: false,
      });
      // Whitespace-only must not produce a bogus `<whitespace>/bin` entry
      // nor a bare `/bin` (the join("   ", "bin") shape).
      for (const dir of dirs) {
        expect(dir.trim()).not.toBe("/bin");
        expect(dir).not.toMatch(/^\s+\/bin$/);
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("includes /opt/homebrew/bin and /usr/local/bin when includeSystemBins is true", () => {
    const home = mkdtempSync(join(tmpdir(), "wkutb-sys-"));
    try {
      const dirs = wellKnownUserToolchainBins({ home, env: {}, includeSystemBins: true });
      expect(dirs).toContain("/opt/homebrew/bin");
      expect(dirs).toContain("/usr/local/bin");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("omits /opt/homebrew/bin and /usr/local/bin when includeSystemBins is false", () => {
    const home = mkdtempSync(join(tmpdir(), "wkutb-nosys-"));
    try {
      const dirs = wellKnownUserToolchainBins({ home, env: {}, includeSystemBins: false });
      expect(dirs).not.toContain("/opt/homebrew/bin");
      expect(dirs).not.toContain("/usr/local/bin");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("surfaces GUI-safe PATH additions and sorts versioned Node bins by highest semver first", () => {
    const home = mkdtempSync(join(tmpdir(), "wkutb-versioned-"));
    try {
      const miseBin = join(home, ".local", "share", "mise", "installs", "node", "24.14.1", "bin");
      const miseNpmCodexBin = join(
        home,
        ".local",
        "share",
        "mise",
        "installs",
        "npm-openai-codex",
        "latest",
        "bin",
      );
      const miseNpmCodexVersionBin = join(
        home,
        ".local",
        "share",
        "mise",
        "installs",
        "npm-openai-codex",
        "0.1.0",
        "bin",
      );
      const newestNvmBin = join(home, ".nvm", "versions", "node", "v24.1.0", "bin");
      const olderNvmBin = join(home, ".nvm", "versions", "node", "v22.10.0", "bin");
      const fnmBin = join(home, ".local", "share", "fnm", "node-versions", "v20.11.1", "installation", "bin");
      mkdirSync(miseBin, { recursive: true });
      mkdirSync(miseNpmCodexVersionBin, { recursive: true });
      symlinkSync("0.1.0", join(home, ".local", "share", "mise", "installs", "npm-openai-codex", "latest"), "dir");
      mkdirSync(newestNvmBin, { recursive: true });
      mkdirSync(olderNvmBin, { recursive: true });
      mkdirSync(fnmBin, { recursive: true });
      writeFileSync(join(miseBin, "marker"), "");
      writeFileSync(join(miseNpmCodexBin, "codex"), "");
      writeFileSync(join(newestNvmBin, "marker"), "");
      writeFileSync(join(olderNvmBin, "marker"), "");
      writeFileSync(join(fnmBin, "marker"), "");
      chmodSync(join(miseBin, "marker"), 0o644);
      chmodSync(join(miseNpmCodexBin, "codex"), 0o755);
      chmodSync(join(newestNvmBin, "marker"), 0o644);
      chmodSync(join(olderNvmBin, "marker"), 0o644);
      chmodSync(join(fnmBin, "marker"), 0o644);

      const dirs = wellKnownUserToolchainBins({
        home,
        env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
        includeSystemBins: true,
      });
      const newestNvmIdx = dirs.indexOf(newestNvmBin);
      const olderNvmIdx = dirs.indexOf(olderNvmBin);

      expect(dirs).toContain("/opt/homebrew/bin");
      expect(dirs).toContain("/usr/local/bin");
      expect(dirs).toContain(miseBin);
      expect(dirs).toContain(miseNpmCodexBin);
      expect(dirs).toContain(newestNvmBin);
      expect(dirs).toContain(olderNvmBin);
      expect(dirs).toContain(fnmBin);
      expect(newestNvmIdx).toBeGreaterThan(-1);
      expect(olderNvmIdx).toBeGreaterThan(newestNvmIdx);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("returns an empty version slice when toolchain root is absent", () => {
    const home = mkdtempSync(join(tmpdir(), "wkutb-empty-"));
    try {
      const dirs = wellKnownUserToolchainBins({ home, env: {}, includeSystemBins: false });
      // No mise/nvm/fnm directories were created — none of the per-version
      // bins should appear.
      expect(dirs.some((dir) => dir.includes(join(".nvm", "versions", "node")))).toBe(false);
      expect(dirs.some((dir) => dir.includes(join("fnm", "node-versions")))).toBe(false);
      expect(dirs.some((dir) => dir.includes(join("mise", "installs", "node")))).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

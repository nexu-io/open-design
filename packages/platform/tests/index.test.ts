import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createCommandInvocation,
  createPackageManagerInvocation,
  createProcessStampArgs,
  matchesStampedProcess,
  readProcessStampFromCommand,
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

describe("createPackageManagerInvocation", () => {
  const originalPlatform = process.platform;
  function setPlatform(value: NodeJS.Platform): void {
    Object.defineProperty(process, "platform", { configurable: true, value });
  }
  afterEach(() => {
    Object.defineProperty(process, "platform", { configurable: true, value: originalPlatform });
  });

  it("uses npm_execpath via process.execPath when set, regardless of platform", () => {
    setPlatform("win32");
    const invocation = createPackageManagerInvocation(["install"], {
      npm_execpath: "C:\\Users\\u\\.nvm\\pnpm.cjs",
    } as NodeJS.ProcessEnv);
    expect(invocation.command).toBe(process.execPath);
    expect(invocation.args[0]).toBe("C:\\Users\\u\\.nvm\\pnpm.cjs");
    expect(invocation.args.slice(1)).toEqual(["install"]);
    expect(invocation.windowsVerbatimArguments).toBeUndefined();
  });

  it("returns plain pnpm invocation on POSIX without npm_execpath", () => {
    setPlatform("linux");
    const invocation = createPackageManagerInvocation(["install"], {} as NodeJS.ProcessEnv);
    expect(invocation).toEqual({ args: ["install"], command: "pnpm" });
  });

  it("wraps pnpm through cmd.exe with verbatim arguments on Windows", () => {
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
      '"pnpm --filter @open-design/desktop build"',
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
  it("places $NPM_CONFIG_PREFIX/bin before every conventional location, including ~/.local/bin", () => {
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

  it("expands per-version Node toolchains for mise / nvm / fnm", () => {
    const home = mkdtempSync(join(tmpdir(), "wkutb-versioned-"));
    try {
      const miseBin = join(home, ".local", "share", "mise", "installs", "node", "24.14.1", "bin");
      const nvmBin = join(home, ".nvm", "versions", "node", "v22.10.0", "bin");
      const fnmBin = join(home, ".local", "share", "fnm", "node-versions", "v20.11.1", "installation", "bin");
      mkdirSync(miseBin, { recursive: true });
      mkdirSync(nvmBin, { recursive: true });
      mkdirSync(fnmBin, { recursive: true });
      writeFileSync(join(miseBin, "marker"), "");
      writeFileSync(join(nvmBin, "marker"), "");
      writeFileSync(join(fnmBin, "marker"), "");
      chmodSync(join(miseBin, "marker"), 0o644);
      chmodSync(join(nvmBin, "marker"), 0o644);
      chmodSync(join(fnmBin, "marker"), 0o644);

      const dirs = wellKnownUserToolchainBins({ home, env: {}, includeSystemBins: false });
      expect(dirs).toContain(miseBin);
      expect(dirs).toContain(nvmBin);
      expect(dirs).toContain(fnmBin);
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

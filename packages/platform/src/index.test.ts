import { afterEach, describe, expect, it } from "vitest";

import {
  createCommandInvocation,
  createPackageManagerInvocation,
  createProcessStampArgs,
  matchesStampedProcess,
  readProcessStampFromCommand,
  type ProcessStampContract,
} from "./index.js";

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

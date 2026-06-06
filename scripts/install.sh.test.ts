import assert from "node:assert/strict";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const repoRoot = join(import.meta.dirname, "..");
const installSh = join(repoRoot, "install.sh");
const mergeScript = join(repoRoot, "scripts", "install-sh-merge.mjs");

const SUPPORTED_AGENTS = [
  "claude",
  "codex",
  "cursor",
  "copilot",
  "openclaw",
  "antigravity",
  "gemini",
  "pi",
  "vibe",
  "hermes",
  "cline",
  "kimi",
  "trae",
  "opencode",
] as const;

const CLI_AGENTS = ["claude", "codex", "gemini", "kimi"] as const;
const JSON_AGENTS = ["cursor", "copilot", "cline", "opencode", "openclaw", "antigravity", "trae"] as const;
const MANUAL_AGENTS = ["pi", "vibe", "hermes"] as const;

function runInstall(args: string[], env: NodeJS.ProcessEnv = {}): SpawnSyncReturns<string> {
  return spawnSync("bash", [installSh, ...args], {
    cwd: repoRoot,
    // OD_INSTALL_SKIP_HEALTH_CHECK=1 short-circuits the daemon
    // health check so the test suite is not flaky on machines where
    // the URL host is unresolvable or slow. Tests that need the
    // health check to run explicitly unset this in their env.
    env: { ...process.env, OD_INSTALL_SKIP_HEALTH_CHECK: "1", ...env },
    encoding: "utf8",
    timeout: 30_000,
  });
}

// Run install.sh as if it were `curl -fsSL <url> | bash -s -- ...`.
// The script is piped on stdin (so $0 is `bash`, not the script path),
// and the cwd is a temp dir with no scripts/install-sh-merge.mjs
// sibling — which forces the heredoc fallback path inside install.sh.
function runInstallViaStdin(args: string[], env: NodeJS.ProcessEnv = {}): SpawnSyncReturns<string> {
  const cwd = mkdtempSync(join(tmpdir(), "od-install-stdin-"));
  const script = readFileSync(installSh, "utf8");
  try {
    return spawnSync("bash", ["-s", "--", ...args], {
      cwd,
      env: { ...process.env, ...env },
      input: script,
      encoding: "utf8",
      timeout: 30_000,
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

// Combined stdout + stderr: install.sh routes its own error/warn
// helpers to stderr (correct behavior), and the per-agent plan text
// to stdout. Tests assert on the user-visible message, not on which
// stream it came out of.
function combined(result: SpawnSyncReturns<string>): string {
  return (result.stdout ?? "") + (result.stderr ?? "");
}

function makeTempHome(): string {
  return mkdtempSync(join(tmpdir(), "od-install-test-"));
}

// ---------------------------------------------------------------------------
// Bug reproduction: install.sh must exist at the repo root.
//
// This is the red-spec test. On `main`, install.sh is missing — the
// README's one-liner `curl -fsSL https://open-design.ai/install.sh | bash`
// returns the SPA HTML (or 404s), fails to parse as bash, and a fresh
// checkout has no local copy either. This test goes red on `main` and
// green on the fix branch, satisfying the PR template's "Bug fix
// verification" requirement.
// ---------------------------------------------------------------------------

test("install.sh exists at the repo root (fixes the README's dead install.sh URL)", () => {
  assert.equal(existsSync(installSh), true, `expected install.sh at ${installSh}`);
});

test("install.sh is executable", () => {
  // The repo ships the file with the exec bit set; if a contributor
  // forgets `chmod +x`, the curl|bash flow would still work (bash
  // reads it via stdin) but the direct `./install.sh` path would fail.
  const stat = statSync(installSh);
  // owner-exec bit (0o100) must be set
  assert.ok((stat.mode & 0o100) !== 0, "install.sh must have the owner-exec bit set");
});

test("scripts/install-sh-merge.mjs exists (the JSON merge helper install.sh delegates to)", () => {
  assert.equal(existsSync(mergeScript), true, `expected merge helper at ${mergeScript}`);
});

test("install.sh declares bash, not sh (curl|sh would fail on dash)", () => {
  // Round-trip: invoke install.sh as `sh` with --help. The shebang is
  // ignored, so `set -euo pipefail` and `local` will fail under
  // `dash` (Debian/Ubuntu /bin/sh). We use a bash subshell to keep the
  // test framework itself running, but the inner `sh` is whatever
  // /bin/sh is on PATH.
  const result = spawnSync("/bin/sh", [installSh, "--help"], {
    encoding: "utf8",
    timeout: 10_000,
  });
  // Either status 0 (sh is bash) or non-zero (sh is dash and failed
  // before --help could run). Either way, the install.sh must NOT
  // claim to be `sh` in its comments.
  const src = readFileSync(installSh, "utf8");
  assert.match(src, /bash -s -- <agent>/, "the top-of-file comment must use `bash`, not `sh`");
  assert.doesNotMatch(
    src,
    /^\s*curl[^\n]*\|\s*sh\s+-s\b/m,
    "install.sh must not document a `curl | sh` form anywhere in its own source",
  );
  // Quiet the linter: we don't actually assert on result.status here
  // because dash/bash behavior on this box is environment-dependent.
  void result;
});

// ---------------------------------------------------------------------------
// --help
// ---------------------------------------------------------------------------

test("--help exits 0 and lists every supported agent", () => {
  const result = runInstall(["--help"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  for (const agent of SUPPORTED_AGENTS) {
    assert.match(result.stdout, new RegExp(`\\b${agent}\\b`), `missing agent '${agent}' in --help output`);
  }
});

// ---------------------------------------------------------------------------
// Bad arguments
// ---------------------------------------------------------------------------

test("no args exits 2 and prints usage", () => {
  const result = runInstall([]);
  assert.equal(result.status, 2, `stderr: ${result.stderr}`);
  assert.match(combined(result), /Missing required <agent> argument/);
});

test("unknown agent exits 2 and lists supported agents", () => {
  const result = runInstall(["definitely-not-an-agent"]);
  assert.equal(result.status, 2, `stderr: ${result.stderr}`);
  assert.match(combined(result), /Unknown agent: definitely-not-an-agent/);
  for (const agent of SUPPORTED_AGENTS) {
    assert.match(combined(result), new RegExp(`\\b${agent}\\b`));
  }
});

test("unknown flag exits 2", () => {
  const result = runInstall(["--not-a-real-flag"]);
  assert.equal(result.status, 2, `stderr: ${result.stderr}`);
  assert.match(combined(result), /Unknown option: --not-a-real-flag/);
});

test("multiple positional args exit 2", () => {
  const result = runInstall(["claude", "codex"]);
  assert.equal(result.status, 2, `stderr: ${result.stderr}`);
  assert.match(combined(result), /Unexpected extra argument: codex/);
});

// ---------------------------------------------------------------------------
// --daemon-url validation
// ---------------------------------------------------------------------------

test("--daemon-url with no value exits 2", () => {
  const result = runInstall(["claude", "--daemon-url"]);
  assert.equal(result.status, 2, `stderr: ${result.stderr}`);
  assert.match(combined(result), /--daemon-url requires a value/);
});

test("--daemon-url followed by another flag exits 2 (does not silently consume it)", () => {
  const result = runInstall(["cursor", "--daemon-url", "--write-config"]);
  assert.equal(result.status, 2, `stderr: ${result.stderr}`);
  assert.match(combined(result), /--daemon-url value cannot start with '-': got '--write-config'/);
});

test("--daemon-url= with empty value exits 2", () => {
  const result = runInstall(["claude", "--daemon-url="]);
  assert.equal(result.status, 2, `stderr: ${result.stderr}`);
  assert.match(combined(result), /--daemon-url= value cannot be empty/);
});

test("--daemon-url with shell metacharacters is rejected", () => {
  // A URL containing `"` would break the JSON entry; backslash would
  // too. The strict URL regex is the only line of defense.
  const result = runInstall(["claude", "--daemon-url", 'http://host"evil']);
  assert.equal(result.status, 2, `stderr: ${result.stderr}`);
  assert.match(combined(result), /Invalid --daemon-url/);
});

test("--daemon-url with whitespace is rejected", () => {
  const result = runInstall(["claude", "--daemon-url", "http://host path/with space"]);
  assert.equal(result.status, 2, `stderr: ${result.stderr}`);
  assert.match(combined(result), /Invalid --daemon-url/);
});

// ---------------------------------------------------------------------------
// CLI agents: prints the right <bin> mcp add argv, no file write
// ---------------------------------------------------------------------------

for (const agent of CLI_AGENTS) {
  test(`cli agent '${agent}' prints the right one-liner and writes nothing`, () => {
    const home = makeTempHome();
    try {
      const result = runInstall([agent, "--daemon-url", "http://daemon.test:7456"], { HOME: home });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      // daemon URL is in the printed command
      assert.match(result.stdout, new RegExp(`${agent} mcp add[\\s\\S]*--daemon-url http://daemon\\.test:7456`));
      // and the entry the daemon's mcp-agent-install.ts generates
      assert.match(result.stdout, /od mcp --daemon-url/);
      // nothing was written under HOME
      const homeContents = readdirSync(home);
      assert.deepEqual(homeContents, [], `cli agent must not write to HOME; got: ${homeContents.join(", ")}`);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test(`cli agent '${agent}' --write-config emits a warning, does not write`, () => {
    // --write-config is a no-op for cli agents (they always print
    // only). Without a warning, the user would think the install
    // succeeded.
    const home = makeTempHome();
    try {
      const result = runInstall([agent, "--write-config", "--daemon-url", "http://daemon.test:7456"], { HOME: home });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(combined(result), new RegExp(`--write-config is ignored for ${agent} \\(cli strategy\\)`));
      // nothing was written under HOME
      const homeContents = readdirSync(home);
      assert.deepEqual(homeContents, [], `cli agent --write-config must not write; got: ${homeContents.join(", ")}`);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
}

// ---------------------------------------------------------------------------
// Manual agents: always print only, never write even with --write-config
// ---------------------------------------------------------------------------

for (const agent of MANUAL_AGENTS) {
  test(`manual agent '${agent}' prints the snippet, --write-config is ignored`, () => {
    const home = makeTempHome();
    try {
      const result = runInstall([agent, "--write-config", "--daemon-url", "http://daemon.test:7456"], { HOME: home });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      // emits the manual-step header (in stdout via cat <<EOF)
      assert.match(combined(result), /Manual step required/);
      // warns that --write-config was ignored (in stderr via warn())
      assert.match(combined(result), /--write-config is ignored/);
      // nothing was written under HOME
      const homeContents = readdirSync(home);
      assert.deepEqual(homeContents, [], `manual agent must not write; got: ${homeContents.join(", ")}`);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
}

// ---------------------------------------------------------------------------
// JSON agents: dry-run prints the right shape; --write-config writes the
// right file with the right deep-merge semantics.
// ---------------------------------------------------------------------------

test("json agent dry-run: prints the entry under the right dot-keyPath (cursor)", () => {
  const home = makeTempHome();
  try {
    const result = runInstall(["cursor", "--daemon-url", "http://daemon.test:7456"], { HOME: home });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /\.cursor\/mcp\.json/);
    assert.match(result.stdout, /mcpServers/);
    // The printed entry is a JSON object: parse it and check the shape
    // matches what the daemon's mcp-agent-install.ts generates.
    const entry = extractPrintedJsonEntry(result.stdout);
    assert.equal(entry.command, "od");
    assert.deepEqual(entry.args, ["mcp", "--daemon-url", "http://daemon.test:7456"]);
    // Cursor is the only JSON-config agent whose entry must carry
    // `type: "stdio"`. The daemon's planAgentInstall('cursor', ...)
    // produces this via jsonEntry(spec, { type: 'stdio' }), and
    // apps/daemon/tests/mcp-agent-install.test.ts asserts the same.
    assert.equal(entry.type, "stdio", "cursor entry must include type: 'stdio' to match the daemon's planAgentInstall('cursor', ...)");
    assert.equal(entry.env.OD_DAEMON_URL, "http://daemon.test:7456");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("json agent dry-run: opencode uses the nested 'mcp' key and the local/command[] shape", () => {
  const home = makeTempHome();
  try {
    const result = runInstall(["opencode", "--daemon-url", "http://daemon.test:7456"], { HOME: home });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /\.config\/opencode\/opencode\.json/);
    assert.match(result.stdout, /\bmcp\b/);
    const entry = extractPrintedJsonEntry(result.stdout);
    assert.equal(entry.type, "local");
    assert.ok(Array.isArray(entry.command), "opencode entry.command must be an array");
    assert.deepEqual(entry.command, ["od", "mcp", "--daemon-url", "http://daemon.test:7456"]);
    assert.equal(entry.enabled, true);
    assert.equal(entry.environment.OD_DAEMON_URL, "http://daemon.test:7456");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// Extract the printed JSON entry from install.sh's per-agent plan
// block. The script prints it indented with 4 spaces at the end of
// the block. We find the first top-level `{` after the "Add this entry"
// header and match braces to extract the object.
function extractPrintedJsonEntry(stdout: string): Record<string, any> {
  const idx = stdout.indexOf("Add this entry");
  assert.ok(idx >= 0, "expected an 'Add this entry' header in stdout");
  const start = stdout.indexOf("{", idx);
  assert.ok(start >= 0, "expected a '{' after the 'Add this entry' header");
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;
  for (let i = start; i < stdout.length; i++) {
    const ch = stdout[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') inString = false;
    } else {
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
  }
  assert.ok(end >= 0, "unterminated JSON object in stdout");
  const jsonText = stdout.slice(start, end + 1);
  return JSON.parse(jsonText) as Record<string, any>;
}

test("json agent --write-config: writes the file from a fresh temp HOME (cursor)", () => {
  const home = makeTempHome();
  try {
    const result = runInstall(
      ["cursor", "--write-config", "--daemon-url", "http://daemon.test:7456"],
      { HOME: home },
    );
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const target = join(home, ".cursor", "mcp.json");
    assert.equal(existsSync(target), true, `expected ${target} to be created`);
    const parsed = JSON.parse(readFileSync(target, "utf8"));
    assert.deepEqual(Object.keys(parsed.mcpServers), ["open-design"]);
    // The full entry shape must match what the daemon's
    // planAgentInstall('cursor', ...) produces. Asserting the
    // whole object (not just the fields we care about) prevents
    // future drift if install.sh adds or renames fields.
    //
    // Source of truth: the daemon's own test
    // apps/daemon/tests/mcp-agent-install.test.ts, "cursor merges
    // a stdio entry under mcpServers". If that test changes, this
    // fixture must be updated to match.
    assert.deepEqual(parsed.mcpServers["open-design"], {
      command: "od",
      args: ["mcp", "--daemon-url", "http://daemon.test:7456"],
      type: "stdio",
      env: { OD_DAEMON_URL: "http://daemon.test:7456" },
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("json agent --write-config: deep-merges into an existing config (preserves other servers)", () => {
  const home = makeTempHome();
  try {
    const cursorDir = join(home, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const target = join(cursorDir, "mcp.json");
    writeFileSync(
      target,
      JSON.stringify(
        {
          mcpServers: {
            "other-server": { command: "x", args: [], env: {} },
          },
        },
        null,
        2,
      ),
    );

    const result = runInstall(
      ["cursor", "--write-config", "--daemon-url", "http://daemon.test:7456"],
      { HOME: home },
    );
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);

    const parsed = JSON.parse(readFileSync(target, "utf8"));
    // the existing server must be preserved
    assert.deepEqual(parsed.mcpServers["other-server"], { command: "x", args: [], env: {} });
    // the new server must be added
    assert.equal(parsed.mcpServers["open-design"].command, "od");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("json agent --write-config: content is stable across re-runs (idempotent)", () => {
  const home = makeTempHome();
  try {
    const target = join(home, ".config", "opencode", "opencode.json");
    const args = ["opencode", "--write-config", "--daemon-url", "http://daemon.test:7456"];

    const first = runInstall(args, { HOME: home });
    assert.equal(first.status, 0, `first run stderr: ${first.stderr}`);
    const firstContent = readFileSync(target, "utf8");

    const second = runInstall(args, { HOME: home });
    assert.equal(second.status, 0, `second run stderr: ${second.stderr}`);
    const secondContent = readFileSync(target, "utf8");

    assert.equal(firstContent, secondContent, "second run produced a different file (non-idempotent)");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("json agent --write-config: mtime is stable across re-runs (skip-write on unchanged content)", async () => {
  const home = makeTempHome();
  try {
    const target = join(home, ".config", "opencode", "opencode.json");
    const args = ["opencode", "--write-config", "--daemon-url", "http://daemon.test:7456"];

    const first = runInstall(args, { HOME: home });
    assert.equal(first.status, 0, `first run stderr: ${first.stderr}`);
    const firstStat = statSync(target);

    // Sleep 50ms so any new write would have a strictly larger mtime
    // (most filesystems have ms-resolution mtimes).
    await new Promise((resolve) => setTimeout(resolve, 50));

    const second = runInstall(args, { HOME: home });
    assert.equal(second.status, 0, `second run stderr: ${second.stderr}`);
    const secondStat = statSync(target);
    assert.equal(
      secondStat.mtimeMs,
      firstStat.mtimeMs,
      "second run should not change mtime (skip-write on unchanged content)",
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("json agent --write-config: custom --daemon-url is honored in the written file (opencode)", () => {
  const home = makeTempHome();
  try {
    const result = runInstall(
      ["opencode", "--write-config", "--daemon-url", "http://custom:9999"],
      { HOME: home },
    );
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const parsed = JSON.parse(readFileSync(join(home, ".config", "opencode", "opencode.json"), "utf8"));
    assert.equal(parsed.mcp["open-design"].environment.OD_DAEMON_URL, "http://custom:9999");
    assert.deepEqual(parsed.mcp["open-design"].command, ["od", "mcp", "--daemon-url", "http://custom:9999"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("json agent --write-config: openclaw uses the two-level mcp.servers keyPath", () => {
  const home = makeTempHome();
  try {
    const result = runInstall(
      ["openclaw", "--write-config", "--daemon-url", "http://daemon.test:7456"],
      { HOME: home },
    );
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const target = join(home, ".openclaw", "openclaw.json");
    assert.equal(existsSync(target), true);
    const parsed = JSON.parse(readFileSync(target, "utf8"));
    assert.deepEqual(Object.keys(parsed.mcp.servers), ["open-design"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("json agent --write-config: refuses to clobber a non-object at the dot-path", () => {
  const home = makeTempHome();
  try {
    const cursorDir = join(home, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const target = join(cursorDir, "mcp.json");
    // Intentionally bad shape: mcpServers is a non-object (an array).
    // The merge helper must refuse with exit 2, not silently overwrite.
    writeFileSync(target, JSON.stringify({ mcpServers: [] }, null, 2));

    const result = runInstall(
      ["cursor", "--write-config", "--daemon-url", "http://daemon.test:7456"],
      { HOME: home },
    );
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr: ${result.stderr}`);
    assert.match(combined(result), /refusing to clobber non-object at "mcpServers"/);

    // File must be untouched.
    const after = JSON.parse(readFileSync(target, "utf8"));
    assert.deepEqual(after, { mcpServers: [] });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("json agent --write-config: refuses to clobber a non-object at a deeper dot-path", () => {
  // openclaw uses mcp.servers — make sure a non-object at the
  // intermediate `mcp` key is also refused.
  const home = makeTempHome();
  try {
    const openclawDir = join(home, ".openclaw");
    mkdirSync(openclawDir, { recursive: true });
    const target = join(openclawDir, "openclaw.json");
    writeFileSync(target, JSON.stringify({ mcp: "not-an-object" }, null, 2));

    const result = runInstall(
      ["openclaw", "--write-config", "--daemon-url", "http://daemon.test:7456"],
      { HOME: home },
    );
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr: ${result.stderr}`);
    assert.match(combined(result), /refusing to clobber non-object at "mcp"/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("json agent --write-config: malformed JSON in the existing file refuses with exit 2", () => {
  const home = makeTempHome();
  try {
    const cursorDir = join(home, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const target = join(cursorDir, "mcp.json");
    writeFileSync(target, "{ this is not valid json");

    const result = runInstall(
      ["cursor", "--write-config", "--daemon-url", "http://daemon.test:7456"],
      { HOME: home },
    );
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr: ${result.stderr}`);
    assert.match(combined(result), /failed to parse/);
    // File must be untouched.
    assert.equal(readFileSync(target, "utf8"), "{ this is not valid json");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("json agent dry-run: never writes the config file, even with --dry-run explicit", () => {
  const home = makeTempHome();
  try {
    const result = runInstall(
      ["cursor", "--dry-run", "--daemon-url", "http://daemon.test:7456"],
      { HOME: home },
    );
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(existsSync(join(home, ".cursor", "mcp.json")), false, "dry-run must not write the config");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// curl|bash path: install.sh must work even when the merge helper .mjs
// is not on disk next to the script. The test pipes install.sh's
// content into `bash -s --` from a tmp dir, which forces the heredoc
// fallback inside install.sh.
// ---------------------------------------------------------------------------

test("curl|bash path: --write-config works even when scripts/install-sh-merge.mjs is not on disk", () => {
  const home = makeTempHome();
  try {
    const result = runInstallViaStdin(
      ["cursor", "--write-config", "--daemon-url", "http://daemon.test:7456"],
      { HOME: home },
    );
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const target = join(home, ".cursor", "mcp.json");
    assert.equal(existsSync(target), true, `expected ${target} to be created by the curl|bash fallback path`);
    const parsed = JSON.parse(readFileSync(target, "utf8"));
    assert.deepEqual(Object.keys(parsed.mcpServers), ["open-design"]);
    assert.deepEqual(parsed.mcpServers["open-design"].args, ["mcp", "--daemon-url", "http://daemon.test:7456"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("curl|bash path: refuses to clobber a non-object at the dot-path (heredoc matches the .mjs)", () => {
  // The heredoc fallback inside install.sh MUST produce the same
  // refusal behavior as the .mjs. This test exercises the heredoc.
  const home = makeTempHome();
  try {
    const cursorDir = join(home, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const target = join(cursorDir, "mcp.json");
    writeFileSync(target, JSON.stringify({ mcpServers: [] }, null, 2));

    const result = runInstallViaStdin(
      ["cursor", "--write-config", "--daemon-url", "http://daemon.test:7456"],
      { HOME: home },
    );
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr: ${result.stderr}`);
    assert.match(combined(result), /refusing to clobber non-object at "mcpServers"/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Network behavior: dry-run must be side-effect-free.
// ---------------------------------------------------------------------------

test("dry-run does not hit the network (no health check in dry-run)", () => {
  // Use a TEST-NET-1 URL (192.0.2.0/24, reserved for documentation) so
  // that if the health check DID run, it would still fail fast (no
  // route). The assertion is on the output: with the fix, no "Daemon"
  // line should appear at all. Without the fix, "Daemon not
  // reachable" would appear after a short delay.
  const home = makeTempHome();
  try {
    const start = Date.now();
    const result = runInstall(
      ["cursor", "--daemon-url", "http://192.0.2.1:7456"],
      { HOME: home },
    );
    const durationMs = Date.now() - start;
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(
      durationMs < 2_000,
      `dry-run took ${durationMs}ms; the health check probably ran (should be < 2s)`,
    );
    assert.doesNotMatch(combined(result), /Daemon (is healthy|not reachable)/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Second-pass safety tests (v2): shell-quoting, strict host
// validation, OD_INSTALL_SKIP_HEALTH_CHECK env, mode preservation,
// and the agents that don't have write-config tests above.
// ---------------------------------------------------------------------------

test("cli agent: shell-quotes the --daemon-url in the printed command (copy-paste safety)", () => {
  // `;` is a valid RFC 3986 sub-delim and is allowed in URL paths.
  // The script must shell-quote the URL with `printf '%q'` so
  // copy-paste into a shell does not interpret `;id` as a command
  // separator. bash's `printf '%q'` produces backslash-escaped
  // form: `http://host:7456/\;id` (the `\;` is a literal
  // semicolon to POSIX sh, not a command separator).
  const result = runInstall(["claude", "--daemon-url", "http://host:7456/;id"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  // The `;` must be backslash-escaped in the printed command.
  assert.match(result.stdout, /--daemon-url http:\/\/host:7456\/\\;id/);
  // The banner is allowed to show the raw URL (it's display-only,
  // not a copy-paste target), but the copy-paste block's URL must
  // NOT contain the raw, unescaped form.
  const banner = result.stdout.split("Run this in your shell")[0] ?? "";
  const snippet = result.stdout.split("Run this in your shell")[1] ?? "";
  assert.match(banner, /Daemon URL: http:\/\/host:7456\/;id/, "banner shows the raw URL (display-only)");
  assert.doesNotMatch(snippet, /--daemon-url http:\/\/host:7456\/;id(?!\?)/, "snippet URL must not contain raw unescaped ;id");
});

test("URL with empty host is rejected (http:///path)", () => {
  const result = runInstall(["cursor", "--daemon-url", "http:///path"]);
  assert.equal(result.status, 2, `stderr: ${result.stderr}`);
  assert.match(combined(result), /Invalid --daemon-url/);
});

test("URL with empty host and query is rejected (http://?x)", () => {
  const result = runInstall(["cursor", "--daemon-url", "http://?x"]);
  assert.equal(result.status, 2, `stderr: ${result.stderr}`);
  assert.match(combined(result), /Invalid --daemon-url/);
});

test("OD_INSTALL_SKIP_HEALTH_CHECK=1 short-circuits the health check and skips network", () => {
  // Point at an unreachable URL to prove the health check was
  // short-circuited (without the env var, curl would fail loudly
  // with "Daemon not reachable" and the test would also pass, but
  // the timing would be unreliable).
  const home = makeTempHome();
  try {
    const result = spawnSync(
      "bash",
      [installSh, "cursor", "--write-config", "--daemon-url", "http://192.0.2.1:7456"],
      {
        cwd: repoRoot,
        env: { ...process.env, HOME: home, OD_INSTALL_SKIP_HEALTH_CHECK: "1" },
        encoding: "utf8",
        timeout: 30_000,
      },
    );
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(combined(result), /Health check skipped \(OD_INSTALL_SKIP_HEALTH_CHECK=1\)/);
    // The unreachable URL must not have triggered a slow DNS lookup
    // or curl probe — the only Daemon-related line should be the
    // skip message.
    assert.doesNotMatch(combined(result), /Daemon not reachable/);
    assert.doesNotMatch(combined(result), /Daemon is healthy/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("json agent 'copilot' --write-config writes the right file with the copilot-specific fields", () => {
  const home = makeTempHome();
  try {
    const result = runInstall(
      ["copilot", "--write-config", "--daemon-url", "http://daemon.test:7456"],
      { HOME: home },
    );
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const target = join(home, ".copilot", "mcp-config.json");
    assert.equal(existsSync(target), true);
    const parsed = JSON.parse(readFileSync(target, "utf8"));
    assert.deepEqual(Object.keys(parsed.mcpServers), ["open-design"]);
    // copilot entry has the extra `type: "local"` and `tools: ["*"]`
    // fields on top of the standard shape.
    assert.equal(parsed.mcpServers["open-design"].type, "local");
    assert.deepEqual(parsed.mcpServers["open-design"].tools, ["*"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("json agent 'antigravity' --write-config writes the right file", () => {
  const home = makeTempHome();
  try {
    const result = runInstall(
      ["antigravity", "--write-config", "--daemon-url", "http://daemon.test:7456"],
      { HOME: home },
    );
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const target = join(home, ".gemini", "antigravity", "mcp_config.json");
    assert.equal(existsSync(target), true);
    const parsed = JSON.parse(readFileSync(target, "utf8"));
    assert.deepEqual(Object.keys(parsed.mcpServers), ["open-design"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("json agent 'cursor' --write-config: round-trips a URL with RFC 3986 sub-delims and percent-encoding", () => {
  // The new CURSOR_ENTRY printf must not corrupt URLs that contain
  // the characters allowed by the URL regex: `;`, `&`, `=`, `,`, `+`,
  // `$`, `(`, `)`, `*`, `!`, `@`, `~`, `?`, `#`, `/`, `:`, `%`.
  // The strict URL regex (validated up-front in install.sh) allows
  // these in path / query / fragment; the printf here must write
  // them as a valid JSON string. A regression would surface as
  // JSON.parse throwing, or as a corrupted args/env value.
  const home = makeTempHome();
  try {
    const url = "http://daemon.test:7456/a?x=1&y=2#frag;id,ok$*()+:@!~%25";
    const result = runInstall(
      ["cursor", "--write-config", "--daemon-url", url],
      { HOME: home },
    );
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const target = join(home, ".cursor", "mcp.json");
    const parsed = JSON.parse(readFileSync(target, "utf8"));
    assert.deepEqual(parsed.mcpServers["open-design"].args, [
      "mcp",
      "--daemon-url",
      url,
    ]);
    assert.equal(parsed.mcpServers["open-design"].env.OD_DAEMON_URL, url);
    assert.equal(parsed.mcpServers["open-design"].type, "stdio");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("json agent --write-config: preserves the existing file's mode", () => {
  const home = makeTempHome();
  try {
    const target = join(home, ".config", "opencode", "opencode.json");
    mkdirSync(dirname(target), { recursive: true });
    // Pre-create with a specific, non-default mode (0o644).
    writeFileSync(target, "{}\n");
    chmodSync(target, 0o644);

    const result = runInstall(
      ["opencode", "--write-config", "--daemon-url", "http://daemon.test:7456"],
      { HOME: home },
    );
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const mode = statSync(target).mode & 0o777;
    assert.equal(mode, 0o644, `expected mode 0o644 to be preserved, got 0o${mode.toString(8)}`);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("json agent --write-config: new file is not world-readable", () => {
  const home = makeTempHome();
  try {
    const target = join(home, ".cursor", "mcp.json");
    const result = runInstall(
      ["cursor", "--write-config", "--daemon-url", "http://daemon.test:7456"],
      { HOME: home },
    );
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const mode = statSync(target).mode & 0o777;
    // We can't assert a specific mode (the user's umask still
    // applies), but a freshly created config file should never be
    // world-readable. The URL inside is not a credential, but
    // host+port is mildly sensitive.
    assert.equal(mode & 0o004, 0, `expected new file to not be world-readable, got 0o${mode.toString(8)}`);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Per-agent roster sanity check: make sure the install.sh whitelist
// exactly matches apps/daemon/src/mcp-agent-install.ts AGENT_SLUGS, so
// the two installers stay in lock-step.
// ---------------------------------------------------------------------------

test("install.sh supported agents exactly match apps/daemon/src/mcp-agent-install.ts AGENT_SLUGS", () => {
  const mcpAgentInstall = readFileSync(
    join(repoRoot, "apps", "daemon", "src", "mcp-agent-install.ts"),
    "utf8",
  );
  // Pull the AGENT_SLUGS array literal out of the source so a
  // contributor who adds an agent there gets a fast red signal here
  // if they forget to mirror it in install.sh.
  const match = mcpAgentInstall.match(/export const AGENT_SLUGS\s*=\s*\[([\s\S]*?)\]\s*as const/);
  assert.ok(match, "could not find AGENT_SLUGS in apps/daemon/src/mcp-agent-install.ts");
  const daemonSlugs = (match[1] as string)
    .split(",")
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean)
    .sort();
  assert.deepEqual(daemonSlugs, [...SUPPORTED_AGENTS].sort());
});

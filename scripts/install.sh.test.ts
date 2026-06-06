import assert from "node:assert/strict";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 30_000,
  });
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
// README's one-liner `curl -fsSL https://open-design.ai/install.sh | sh`
// returns the SPA HTML, fails to parse as bash, and a fresh checkout
// has no local copy either. This test goes red on `main` and green on
// the fix branch, satisfying the PR template's "Bug fix verification"
// requirement.
// ---------------------------------------------------------------------------

test("install.sh exists at the repo root (fixes the README's dead install.sh URL)", () => {
  assert.equal(existsSync(installSh), true, `expected install.sh at ${installSh}`);
});

test("install.sh is executable", () => {
  // The repo ships the file with the exec bit set; if a contributor
  // forgets `chmod +x`, the curl|sh flow would still work (bash reads
  // it via stdin) but the direct `./install.sh` path would fail.
  const stat = statSync(installSh);
  // owner-exec bit (0o100) must be set
  assert.ok((stat.mode & 0o100) !== 0, "install.sh must have the owner-exec bit set");
});

test("scripts/install-sh-merge.mjs exists (the JSON merge helper install.sh delegates to)", () => {
  assert.equal(existsSync(mergeScript), true, `expected merge helper at ${mergeScript}`);
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
      const homeContents: string[] = [];
      try {
        const { readdirSync } = require("node:fs") as typeof import("node:fs");
        homeContents.push(...readdirSync(home));
      } catch {
        // home empty / not a dir is fine
      }
      assert.deepEqual(homeContents, [], `cli agent must not write to HOME; got: ${homeContents.join(", ")}`);
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
      const homeContents: string[] = [];
      try {
        const { readdirSync } = require("node:fs") as typeof import("node:fs");
        homeContents.push(...readdirSync(home));
      } catch {
        // empty
      }
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
    assert.equal(parsed.mcpServers["open-design"].command, "od");
    assert.deepEqual(parsed.mcpServers["open-design"].args, ["mcp", "--daemon-url", "http://daemon.test:7456"]);
    assert.equal(parsed.mcpServers["open-design"].env.OD_DAEMON_URL, "http://daemon.test:7456");
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

test("json agent --write-config: re-running is idempotent (same content, same mtime-stable file)", () => {
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

#!/usr/bin/env node
// install-sh-merge.mjs — JSON deep-merge helper for install.sh
//
// Reads an existing JSON config file (or treats a missing/malformed
// file as {}), deep-merges the supplied entry under a dot-path of
// keys, and writes the result back atomically. Used by the per-agent
// "json" branches of install.sh to wire the Open Design stdio MCP
// server into agents whose config is a plain JSON file (cursor /
// copilot / cline / opencode / openclaw / antigravity / trae).
//
// Kept as a standalone .mjs (not bundled into the daemon) because
// install.sh is the no-daemon-required bootstrap: it runs before
// `od` is installed, against a user-owned config file in $HOME.
//
// Usage:
//   install-sh-merge.mjs <configPath> <dotKeyPath> <serverName> <entryJson>
//
// Example:
//   install-sh-merge.mjs \
//     ~/.cursor/mcp.json \
//     mcpServers \
//     open-design \
//     '{"command":"od","args":["mcp","--daemon-url","http://127.0.0.1:7456"],"env":{"OD_DAEMON_URL":"http://127.0.0.1:7456"}}'
//
// Exit codes:
//   0  success
//   2  the existing file is not valid JSON (refusing to clobber)
//   1  any other I/O / argument error

import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";

const [configPath, dotKeyPath, serverName, entryJson] = process.argv.slice(2);

if (!configPath || !dotKeyPath || !serverName || !entryJson) {
  process.stderr.write(
    "install-sh-merge.mjs: usage: install-sh-merge.mjs <configPath> <dotKeyPath> <serverName> <entryJson>\n",
  );
  process.exit(1);
}

let entry;
try {
  entry = JSON.parse(entryJson);
} catch (err) {
  process.stderr.write(
    `install-sh-merge.mjs: failed to parse entryJson: ${err.message}\n`,
  );
  process.exit(1);
}

let cfg = {};
try {
  const raw = readFileSync(configPath, "utf8").trim();
  if (raw.length > 0) {
    cfg = JSON.parse(raw);
    if (typeof cfg !== "object" || cfg === null || Array.isArray(cfg)) {
      process.stderr.write(
        `install-sh-merge.mjs: refusing to merge into non-object root in ${configPath}\n`,
      );
      process.exit(2);
    }
  }
} catch (err) {
  if (err && err.code !== "ENOENT") {
    process.stderr.write(
      `install-sh-merge.mjs: failed to parse ${configPath}: ${err.message}\n`,
    );
    process.exit(2);
  }
}

let cursor = cfg;
for (const part of dotKeyPath.split(".").filter(Boolean)) {
  if (
    typeof cursor[part] !== "object" ||
    cursor[part] === null ||
    Array.isArray(cursor[part])
  ) {
    cursor[part] = {};
  }
  cursor = cursor[part];
}
cursor[serverName] = entry;

mkdirSync(dirname(configPath), { recursive: true });
const tmp = `${configPath}.install-sh.tmp`;
writeFileSync(tmp, JSON.stringify(cfg, null, 2) + "\n", "utf8");
renameSync(tmp, configPath);

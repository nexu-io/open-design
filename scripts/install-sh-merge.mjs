#!/usr/bin/env node
// install-sh-merge.mjs — JSON deep-merge helper for install.sh
//
// Reads an existing JSON config file (treating a missing or empty
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
// The same algorithm is also inlined into install.sh via a heredoc
// for the curl|bash path (where this file isn't on disk). The two
// copies MUST stay byte-equivalent; the test suite verifies both
// paths produce the same result.
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
//   0  success (file written, or content was already identical and no-op)
//   1  bad arguments or bad entryJson
//   2  the existing file is not valid JSON, has a non-object root,
//      or has a non-object value at the dot-path we're merging into
//      (we refuse to clobber in all these cases)

import { readFileSync, writeFileSync, mkdirSync, renameSync, statSync, chmodSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

const [configPath, dotKeyPath, serverName, entryJson] = process.argv.slice(2);

if (!configPath || !dotKeyPath || !serverName || !entryJson) {
  process.stderr.write(
    "install-sh-merge: usage: install-sh-merge <configPath> <dotKeyPath> <serverName> <entryJson>\n",
  );
  process.exit(1);
}

let entry;
try {
  entry = JSON.parse(entryJson);
} catch (err) {
  process.stderr.write(`install-sh-merge: failed to parse entryJson: ${err.message}\n`);
  process.exit(1);
}

// Missing or empty file is treated as {}. A non-object root or
// malformed JSON refuses to clobber with exit 2.
let cfg = {};
try {
  const raw = readFileSync(configPath, "utf8").trim();
  if (raw.length > 0) {
    cfg = JSON.parse(raw);
    if (typeof cfg !== "object" || cfg === null || Array.isArray(cfg)) {
      process.stderr.write(
        `install-sh-merge: refusing to merge into non-object root in ${configPath}\n`,
      );
      process.exit(2);
    }
  }
} catch (err) {
  if (err && err.code !== "ENOENT") {
    process.stderr.write(
      `install-sh-merge: failed to parse ${configPath}: ${err.message}\n`,
    );
    process.exit(2);
  }
}

// Walk the dot-path. Missing keys become {}. Existing non-object
// values refuse — the user almost certainly meant something else and
// we'd be silently clobbering it.
const parts = dotKeyPath.split(".").filter(Boolean);
let cursor = cfg;
for (let i = 0; i < parts.length; i++) {
  const part = parts[i];
  if (!(part in cursor)) {
    cursor[part] = {};
  } else if (typeof cursor[part] !== "object" || cursor[part] === null || Array.isArray(cursor[part])) {
    process.stderr.write(
      `install-sh-merge: refusing to clobber non-object at "${parts.slice(0, i + 1).join(".")}" in ${configPath}\n`,
    );
    process.exit(2);
  }
  cursor = cursor[part];
}
cursor[serverName] = entry;

const newContent = JSON.stringify(cfg, null, 2) + "\n";

// Idempotency: skip the write if the file already has the same content.
// Some agents and editor extensions watch their config file and
// reload on mtime change; we'd rather be a no-op than cause a
// needless reload when the merged content is byte-identical.
let existingContent = null;
try {
  existingContent = readFileSync(configPath, "utf8");
} catch {}
if (existingContent === newContent) {
  process.stdout.write(`install-sh-merge: ${configPath} unchanged\n`);
  process.exit(0);
}

mkdirSync(dirname(configPath), { recursive: true });
// Preserve the existing file's mode; default new files to 0o600
// (the URL inside is not a credential, but it's a host + port and
// 0o600 is the standard for new dotfiles).
let oldMode = 0o600;
try {
  oldMode = statSync(configPath).mode & 0o777;
} catch {}
// PID + UUID suffix prevents tmp-name collisions across concurrent
// runs of the installer. It does not implement safe symlink semantics;
// if `configPath` is a symlink, `renameSync` will replace it with a
// regular file. This is acceptable for the installer's threat model
// (writing user-owned dotfiles in $HOME after explicit --write-config
// opt-in) and is documented in the install.sh comments.
const tmp = `${configPath}.install-sh.${process.pid}.${randomUUID()}.tmp`;
writeFileSync(tmp, newContent, "utf8");
chmodSync(tmp, oldMode);
renameSync(tmp, configPath);

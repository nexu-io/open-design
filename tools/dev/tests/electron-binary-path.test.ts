import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { resolveElectronBinaryPath } from "../src/config.js";

const createdRoots: string[] = [];

/**
 * Builds a throwaway workspace whose `electron` package resolves its binary the
 * same way the real one does: `index.js` reads `path.txt` verbatim, without
 * trimming. Callers pick what lands in `path.txt` so a spec can reproduce a
 * malformed entry.
 */
function createWorkspaceWithElectron(pathTxtContents: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tools-dev-electron-"));
  createdRoots.push(root);

  const desktopDir = path.join(root, "apps/desktop");
  const electronDir = path.join(desktopDir, "node_modules/electron");
  fs.mkdirSync(path.join(electronDir, "dist"), { recursive: true });

  fs.writeFileSync(path.join(desktopDir, "package.json"), JSON.stringify({ name: "desktop" }));
  fs.writeFileSync(
    path.join(electronDir, "package.json"),
    JSON.stringify({ main: "index.js", name: "electron" }),
  );
  fs.writeFileSync(
    path.join(electronDir, "index.js"),
    [
      "const fs = require('fs');",
      "const path = require('path');",
      "module.exports = path.join(",
      "  __dirname,",
      "  'dist',",
      "  fs.readFileSync(path.join(__dirname, 'path.txt'), 'utf-8'),",
      ");",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(path.join(electronDir, "path.txt"), pathTxtContents);
  fs.writeFileSync(path.join(electronDir, "dist/electron"), "#!/bin/sh\n");

  return root;
}

afterEach(() => {
  while (createdRoots.length > 0) {
    const root = createdRoots.pop();
    if (root != null) fs.rmSync(root, { force: true, recursive: true });
  }
});

describe("tools-dev electron binary path", () => {
  it("resolves a spawnable path when path.txt has no trailing newline", () => {
    const root = createWorkspaceWithElectron("electron");

    const resolved = resolveElectronBinaryPath(root);

    assert.equal(fs.existsSync(resolved), true);
  });

  it("resolves a spawnable path when path.txt ends with a newline", () => {
    // A `path.txt` written with `echo` keeps its trailing newline, and electron's
    // own entrypoint does not trim it. The resulting path names no real file, so
    // spawn fails with ENOENT even though the binary is present and executable.
    const root = createWorkspaceWithElectron("electron\n");

    const resolved = resolveElectronBinaryPath(root);

    assert.equal(resolved.trim(), resolved);
    assert.equal(fs.existsSync(resolved), true);
  });
});

import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { startServer, stopServer } from "./case.mjs";

// Stands in for the CLI when the asked-for port is busy: it binds another port and announces that one.
const FAKE_CLI = `
const server = require("node:http").createServer((req, res) => res.end("[]"));
server.listen(0, "127.0.0.1", () => console.log("Studio: http://localhost:" + server.address().port));
`;

describe("starting the bench's Studio server", () => {
  it("serves on the port the server bound, not the one asked for", async () => {
    const root = mkdtempSync(join(tmpdir(), "hf-bench-server-"));
    const cli = join(root, "cli.cjs");
    writeFileSync(cli, FAKE_CLI);
    const asked = 1;
    const { child, port } = await startServer(cli, root, asked, [], root);
    try {
      expect(port).not.toBe(asked);
      expect((await fetch(`http://127.0.0.1:${port}/api/projects`)).ok).toBe(true);
    } finally {
      await stopServer(child);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")(
    "runs one server under the case's HOME when PATH's node is a HOME-keyed shim",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "hf-bench-server-"));
      const shims = join(root, "shims");
      mkdirSync(shims);
      const shim = join(shims, "node");
      writeFileSync(
        shim,
        `#!/bin/sh\n[ "$HOME" = "${homedir()}" ] || { echo "shim: no node under HOME=$HOME" >&2; exit 126; }\nexec "${process.execPath}" "$@"\n`,
      );
      chmodSync(shim, 0o755);
      const cli = join(root, "cli.cjs");
      const starts = join(root, "starts");
      writeFileSync(
        cli,
        `require("node:fs").appendFileSync(${JSON.stringify(starts)}, process.env.HOME + "\\n");\n${FAKE_CLI}`,
      );
      const caseHome = join(root, "home");
      const path = process.env.PATH;
      process.env.PATH = `${shims}${delimiter}${path}`;
      let child;
      try {
        ({ child } = await startServer(cli, root, 1, [], caseHome));
        expect(readFileSync(starts, "utf8").trim().split("\n")).toEqual([caseHome]);
      } finally {
        process.env.PATH = path;
        if (child) await stopServer(child);
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});

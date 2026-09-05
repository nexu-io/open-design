import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";

import { buildElectronDevClosureResources } from "../scripts/dev-closure-resources.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))); });

describe("Electron dev Closure resources", () => {
  it("builds signed thin adapters without copying mutable workspace payloads", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "electron-dev-closure-workspace-"));
    roots.push(workspaceRoot);
    const daemonEntry = join(workspaceRoot, "apps", "daemon", "dist", "sidecar", "index.js");
    const webEntry = join(workspaceRoot, "apps", "web", "dist", "sidecar", "index.js");
    const webServer = join(workspaceRoot, "apps", "web", ".next", "standalone", "apps", "web", "server.js");
    await Promise.all([mkdir(join(daemonEntry, ".."), { recursive: true }), mkdir(join(webEntry, ".."), { recursive: true }), mkdir(join(webServer, ".."), { recursive: true })]);
    await Promise.all([writeFile(daemonEntry, "daemon\n"), writeFile(webEntry, "web\n"), writeFile(webServer, "server\n")]);
    const outputRoot = join(workspaceRoot, ".tmp", "resources");
    const receipt = await buildElectronDevClosureResources({ outputRoot, workspaceRoot });

    expect(receipt.resources.map(({ id }) => id)).toEqual(["open-design-daemon", "open-design-web"]);
    for (const resource of receipt.resources) {
      expect(resource.treeSha256).toMatch(/^[a-f0-9]{64}$/u);
      const zip = await JSZip.loadAsync(await readFile(resource.path));
      expect(Object.keys(zip.files)).toEqual(["sidecar.mjs"]);
      const source = await zip.file("sidecar.mjs")!.async("string");
      expect(source).toContain("await import(\"file://");
      expect(source).not.toContain("daemon\\n");
      expect(source).not.toContain("web\\n");
      if (resource.id === "open-design-web") expect(source).toContain("OD_WEB_STANDALONE_ROOT");
    }
  });
});

import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extract, inspect } from "@open-design/archive";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createHash } from "node:crypto";
import { CLOSURE_DATA_RESOURCES } from "@open-design/closure/build-resources";

import { buildDevClosureResources } from "../src/closure-resources.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))); });

describe("tools-dev Closure fixture resources", () => {
  it("describes local producer references with a standard fixture receipt", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "electron-dev-closure-workspace-"));
    roots.push(workspaceRoot);
    for (const resource of CLOSURE_DATA_RESOURCES) for (const input of resource.inputs) {
      await mkdir(join(workspaceRoot, input.source), { recursive: true });
      await writeFile(join(workspaceRoot, input.source, "content.txt"), input.source);
    }
    const daemonEntry = join(workspaceRoot, "apps", "daemon", "dist", "sidecar", "index.js");
    const webEntry = join(workspaceRoot, "apps", "web", "dist", "sidecar", "index.js");
    const webServer = join(workspaceRoot, "apps", "web", ".next", "standalone", "apps", "web", "server.js");
    await Promise.all([mkdir(join(daemonEntry, ".."), { recursive: true }), mkdir(join(webEntry, ".."), { recursive: true }), mkdir(join(webServer, ".."), { recursive: true })]);
    await Promise.all([writeFile(daemonEntry, "daemon\n"), writeFile(webEntry, "web\n"), writeFile(webServer, "server\n")]);
    const webRoot = join(workspaceRoot, "apps", "web");
    await mkdir(join(webRoot, ".next", "static", "chunks"), { recursive: true });
    await mkdir(join(webRoot, "public"), { recursive: true });
    await writeFile(join(webRoot, ".next", "static", "chunks", "app.js"), "hydrate();");
    await writeFile(join(webRoot, "public", "icon.svg"), "<svg/>");
    const outputRoot = join(workspaceRoot, ".tmp", "resources");
    const receipt = await buildDevClosureResources({ outputRoot, workspaceRoot });
    assert.equal(await readFile(join(webServer, "..", ".next", "static", "chunks", "app.js"), "utf8"), "hydrate();");
    assert.equal(await readFile(join(webServer, "..", "public", "icon.svg"), "utf8"), "<svg/>");

    assert.equal(receipt.operation, "closure.resources.development");
    assert.deepEqual(JSON.parse(await readFile(join(outputRoot, "resource-receipt.json"), "utf8")), receipt);
    assert.deepEqual(receipt.resources.map(({ id }) => id), ["open-design-daemon", "open-design-web", ...CLOSURE_DATA_RESOURCES.map(({ id }) => id)]);
    for (const resource of receipt.resources) {
      assert.match(resource.treeSha256, /^[a-f0-9]{64}$/u);
      const bytes = await readFile(resource.path);
      assert.equal(bytes.byteLength, resource.size);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), resource.sha256);
      const unpacked = join(workspaceRoot, "unpacked", resource.id);
      await extract(resource.path, unpacked, { permissions: "portable" });
      if (resource.entrypoint === "resource.json") {
        assert.equal(JSON.parse(await readFile(join(unpacked, "resource.json"), "utf8")).id, resource.id);
        continue;
      }
      assert.deepEqual((await inspect(resource.path)).map(entry => entry.path), ["sidecar.mjs"]);
      const source = await readFile(join(unpacked, "sidecar.mjs"), "utf8");
      assert.ok(source.includes("await import(\"file://"));
      assert.ok(!source.includes("daemon\\n"));
      assert.ok(!source.includes("web\\n"));
      if (resource.id === "open-design-web") assert.ok(source.includes("OD_WEB_STANDALONE_ROOT"));
    }
  });
});

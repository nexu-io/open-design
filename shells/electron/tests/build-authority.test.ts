import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildElectronStandaloneAuthority } from "../scripts/build-authority.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))); });

describe("Electron Standalone authority build", () => {
  it("emits self-contained ESM host and Sidecar supervisor resources", async () => {
    const root = await mkdtemp(join(tmpdir(), "electron-authority-build-"));
    roots.push(root);
    const result = await buildElectronStandaloneAuthority(root);
    const [host, supervisor] = await Promise.all([readFile(result.host.path, "utf8"), readFile(result.supervisor.path, "utf8")]);
    expect(result.host.name).toBe("standalone-host.mjs");
    expect(result.supervisor.name).toBe("supervisor.mjs");
    expect(host).toContain("standalone.host.control.v1");
    expect(supervisor).toContain("sidecar supervisor failed to spawn target");
    expect(supervisor).not.toContain('from "@open-design/platform"');
  });
});

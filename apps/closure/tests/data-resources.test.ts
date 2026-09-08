import { mkdtemp, mkdir, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createHash } from "node:crypto";
import { standaloneTreeSha256 } from "@open-design/standalone";
import { OPEN_DESIGN_DATA_RESOURCE_IDS } from "@open-design/contracts";
import { CLOSURE_DATA_RESOURCES } from "../src/data-resources.js";
import { buildClosureDataResource, buildClosureDataResources } from "../src/build/data-resources.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "closure-data-")); roots.push(root);
  const workspaceRoot = join(root, "workspace");
  for (const resource of CLOSURE_DATA_RESOURCES) for (const input of resource.inputs) {
    await mkdir(join(workspaceRoot, input.source), { recursive: true });
    await writeFile(join(workspaceRoot, input.source, "content.txt"), input.source);
  }
  return { workspaceRoot, outputDirectory: join(root, "output") };
}

describe("independent Closure data blobs", () => {
  it("produces exactly the product contract data set", () => {
    expect(CLOSURE_DATA_RESOURCES.map(({ id }) => id)).toEqual(OPEN_DESIGN_DATA_RESOURCE_IDS);
  });
  it("builds one declared group without reading unrelated inputs or emitting a complete receipt", async () => {
    const input = await fixture();
    const baseline = await buildClosureDataResources(input);
    await rm(join(input.workspaceRoot, "skills"), { recursive: true });
    const selected = await buildClosureDataResource({ ...input, id: "design-systems" });
    expect(selected).toEqual(baseline.find(resource => resource.id === "design-systems"));
    expect(selected).not.toHaveProperty("resources");
    await expect(buildClosureDataResource({ ...input, id: "unknown" as never })).rejects.toThrow("unknown Closure data resource");
    await expect(buildClosureDataResource({ ...input, id: "skills" })).rejects.toThrow();
    await expect(buildClosureDataResources(input)).rejects.toThrow();
  });
  it("rebuilds deterministic archives and changes only the selected resource bytes", async () => {
    const input = await fixture();
    const [first, simultaneous] = await Promise.all([buildClosureDataResources(input), buildClosureDataResources(input)]);
    expect(simultaneous).toEqual(first);
    await utimes(join(input.workspaceRoot, "skills/content.txt"), new Date(), new Date());
    const [repeated, concurrent] = await Promise.all([buildClosureDataResources(input), buildClosureDataResources(input)]);
    expect(repeated).toEqual(first);
    expect(concurrent).toEqual(first);
    await writeFile(join(input.workspaceRoot, "design-systems/content.txt"), "changed system");
    const changed = await buildClosureDataResources(input);
    expect(changed.filter((item, index) => item.sha256 !== first[index]!.sha256).map(item => item.id)).toEqual(["design-systems"]);
    expect(first).toHaveLength(9);
    for (const resource of first) {
      const zip = await JSZip.loadAsync(await readFile(resource.path));
      const entries = await Promise.all(Object.values(zip.files).map(async file => {
        const body = await file.async("nodebuffer");
        return { path: file.name, sha256: createHash("sha256").update(body).digest("hex"), size: body.byteLength };
      }));
      expect(resource.treeSha256).toBe(standaloneTreeSha256(entries));
    }
    const plugins = await JSZip.loadAsync(await readFile(first.find(item => item.id === "plugins")!.path));
    expect(Object.keys(plugins.files).sort()).toEqual(["_official/content.txt", "registry/content.txt", "resource.json"]);
    expect(first.every(item => item.entrypoint === "resource.json" && item.sync)).toBe(true);
  });

  it("fails closed on missing inputs and symlinks instead of silently omitting data", async () => {
    const input = await fixture();
    await rm(join(input.workspaceRoot, "skills/content.txt"));
    await symlink(join(input.workspaceRoot, "craft/content.txt"), join(input.workspaceRoot, "skills/link"));
    await expect(buildClosureDataResources(input)).rejects.toThrow("symbolic link");
    await rm(join(input.workspaceRoot, "skills/link"));
    await rm(join(input.workspaceRoot, "skills"), { recursive: true });
    await expect(buildClosureDataResources(input)).rejects.toThrow();
  });

  it("rejects case-folded collisions and corrupt existing immutable output", async () => {
    const input = await fixture();
    const initial = await buildClosureDataResources(input);
    await writeFile(initial[0]!.path, "corrupt");
    await expect(buildClosureDataResources(input)).rejects.toThrow("immutable resource collision");
    await writeFile(join(input.workspaceRoot, "skills/Resource.json"), "reserved marker");
    await expect(buildClosureDataResources(input)).rejects.toThrow("resource path collision");
  });
});

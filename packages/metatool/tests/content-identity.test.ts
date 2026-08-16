import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveContentIdentity } from "../src/identity.js";
import { parseContentIdentityRegistry, resolveContentIdentityDeclaration } from "../src/identity-registry.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "od-content-identity-"));
  roots.push(root);
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "entry.ts"), "export const value = 1;\n");
  await writeFile(join(root, "package.json"), '{"name":"fixture","version":"1.0.0"}\n');
  return root;
}

describe("canonical content identity", () => {
  it("is deterministic and reacts to file, mode, symlink, and parameter changes", async () => {
    const root = await fixture();
    await symlink("entry.ts", join(root, "src", "current.ts"));
    const input = {
      id: "fixture.build",
      parameters: { target: "darwin-arm64" },
      root,
      schemaVersion: 1,
      sources: [{ path: "src" }],
    } as const;
    const initial = await resolveContentIdentity(input);
    await expect(resolveContentIdentity(input)).resolves.toEqual(initial);

    await writeFile(join(root, "src", "entry.ts"), "export const value = 2;\n");
    expect((await resolveContentIdentity(input)).digest).not.toBe(initial.digest);
    await writeFile(join(root, "src", "entry.ts"), "export const value = 1;\n");

    await chmod(join(root, "src", "entry.ts"), 0o600);
    expect((await resolveContentIdentity(input)).digest).toBe(initial.digest);
    await chmod(join(root, "src", "entry.ts"), 0o755);
    expect((await resolveContentIdentity(input)).digest).not.toBe(initial.digest);
    await chmod(join(root, "src", "entry.ts"), 0o644);

    await rm(join(root, "src", "current.ts"));
    await symlink("missing.ts", join(root, "src", "current.ts"));
    expect((await resolveContentIdentity(input)).digest).not.toBe(initial.digest);
    expect((await resolveContentIdentity({ ...input, parameters: { target: "darwin-x64" } })).digest)
      .not.toBe(initial.digest);
  });

  it("supports explicit exclusions, line ending normalization, and package version projection", async () => {
    const root = await fixture();
    await mkdir(join(root, "src", "dist"));
    await writeFile(join(root, "src", "dist", "generated.js"), "first\n");
    const input = {
      id: "fixture.source",
      root,
      schemaVersion: 1,
      sources: [
        { excludeDirectoryNames: ["dist"], normalizeTextLineEndings: true, path: "src" },
        { normalizePackageVersion: true, path: "package.json" },
      ],
    } as const;
    const initial = await resolveContentIdentity(input);
    await writeFile(join(root, "src", "dist", "generated.js"), "second\n");
    expect((await resolveContentIdentity(input)).digest).toBe(initial.digest);
    await writeFile(join(root, "src", "entry.ts"), "export const value = 1;\r\n");
    expect((await resolveContentIdentity(input)).digest).toBe(initial.digest);
    await writeFile(join(root, "package.json"), '{"name":"fixture","version":"2.0.0"}\n');
    expect((await resolveContentIdentity(input)).digest).toBe(initial.digest);
  });

  it("rejects missing, escaping, and overlapping declarations", async () => {
    const root = await fixture();
    await expect(resolveContentIdentity({ id: "fixture", root, schemaVersion: 1, sources: [{ path: "missing" }] }))
      .rejects.toThrow();
    await expect(resolveContentIdentity({ id: "fixture", root, schemaVersion: 1, sources: [{ path: "../outside" }] }))
      .rejects.toThrow(/inside/u);
    await expect(resolveContentIdentity({
      id: "fixture",
      root,
      schemaVersion: 1,
      sources: [{ path: "src" }, { path: "src/entry.ts" }],
    })).rejects.toThrow(/duplicate/u);
  });
});

describe("content identity declarations", () => {
  const registry = {
    identities: { "fixture.build": { parameters: [], schemaVersion: 1, sourceSets: ["fixture"] } },
    schemaVersion: 1,
    sourceSets: { fixture: { paths: ["src"] } },
  } as const;

  it("rejects unknown fields and malformed source options", () => {
    expect(() => parseContentIdentityRegistry({ ...registry, typo: true })).toThrow(/unknown fields/u);
    expect(() => parseContentIdentityRegistry({
      ...registry,
      sourceSets: { fixture: { paths: [{ normalizeTextLineEndings: "yes", path: "src" }] } },
    })).toThrow(/boolean/u);
  });

  it("projects source-set normalization into every declared source", () => {
    const parsed = parseContentIdentityRegistry({
      ...registry,
      sourceSets: { fixture: { normalizePackageVersion: true, paths: ["package.json"] } },
    });
    expect(resolveContentIdentityDeclaration(parsed, "fixture.build").sources[0]?.normalizePackageVersion).toBe(true);
  });
});

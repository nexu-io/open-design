import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveRepoRoot } from "../src/catalog/export-catalog.ts";
import { exportCatalog } from "../src/catalog/export.ts";
import { exporterVersion } from "../src/catalog/pack-catalog.ts";
import { assertValidCatalog, validateCatalog } from "../src/catalog/validate.ts";

const FIXTURE_ROOT = resolve(import.meta.dirname, "fixtures/catalog");
const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");
const SOURCE_COMMIT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("catalog export", () => {
  it("resolves the repository root from package and bundled CLI layouts", () => {
    expect(resolveRepoRoot()).toBe(WORKSPACE_ROOT);
  });

  it("derives immutable exporter identity from package version and source commit", () => {
    expect(exporterVersion(SOURCE_COMMIT)).toMatch(
      new RegExp(`^tools-release@[^+]+\\+${SOURCE_COMMIT}$`),
    );
  });

  it("exports a tiny fixture tree into a valid catalog.json", () => {
    const { catalog } = exportCatalog({
      repoRoot: FIXTURE_ROOT,
      sourceCommit: SOURCE_COMMIT,
      generatedAt: "2026-08-29T00:00:00.000Z",
    });

    assertValidCatalog(catalog);
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.sourceCommit).toBe(SOURCE_COMMIT);

    const byType = Object.fromEntries(
      ["skill", "system", "craft", "template", "plugin"].map((type) => [
        type,
        catalog.records.filter((r) => r.type === type).map((r) => r.id),
      ]),
    );

    expect(byType.skill).toEqual(["alpha", "beta"]);
    expect(byType.system).toEqual(["brand-x"]);
    expect(byType.craft).toEqual(["spacing-rules"]);
    expect(byType.template).toEqual(["deck-one"]);
    expect(byType.plugin).toEqual(["demo-atom", "example-demo-plugin"]);

    const alpha = catalog.records.find((r) => r.id === "alpha");
    expect(alpha).toMatchObject({
      type: "skill",
      kind: "template",
      name: "Alpha Skill",
      mode: "prototype",
    });
    expect(alpha && "preview" in alpha ? alpha.preview?.path : null).toBe("previews/skills/alpha.webp");

    const beta = catalog.records.find((r) => r.id === "beta");
    expect(beta).toMatchObject({ type: "skill", kind: "instruction" });

    const system = catalog.records.find((r) => r.id === "brand-x");
    expect(system).toMatchObject({
      type: "system",
      category: "Product",
      palette: expect.arrayContaining(["#1a1817", "#d44b1e", "#efe7d2"]),
    });
    if (system?.type === "system") {
      expect(system.bodiesI18n?.["zh-CN"]).toContain("中文正文");
      expect(system.tokens).toMatchObject({
        total: 4,
        grade: "excellent",
        theme: { bg: "#1a1817", accent: "#d44b1e" },
      });
    }

    const plugin = catalog.records.find((r) => r.id === "example-demo-plugin");
    expect(plugin?.type).toBe("plugin");
    if (plugin?.type === "plugin") {
      // Authored poster wins over baked video poster.
      expect(plugin.preview?.remotePoster).toBe("https://cdn.example.test/demo-poster.webp");
      expect(plugin.preview?.entryPath).toBe(
        "entries/plugins/examples/demo-plugin/example.html",
      );
      expect(plugin.titleI18n?.["zh-CN"]).toBe("演示插件");
    }

    const atom = catalog.records.find((record) => record.id === "demo-atom");
    expect(atom).toMatchObject({ type: "plugin", kind: "atom", discoverable: false });

    // Snapshot records must not embed raw example.html contents as files —
    // only markdown bodies. The export walk never copies html into catalog.json.
    const serialized = JSON.stringify(catalog);
    expect(serialized).not.toContain("<!doctype html>");
  });

  it("fails closed on unsupported/corrupt skill frontmatter", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-catalog-corrupt-"));
    try {
      await mkdir(join(root, "skills/bad"), { recursive: true });
      await writeFile(
        join(root, "skills/bad/SKILL.md"),
        "---\nname: [unterminated\n---\n\n# Bad\n",
        "utf8",
      );
      expect(() =>
        exportCatalog({
          repoRoot: root,
          sourceCommit: SOURCE_COMMIT,
          generatedAt: "2026-08-29T00:00:00.000Z",
        }),
      ).toThrow(/invalid YAML frontmatter/);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("catalog validate", () => {
  it("rejects duplicate stable ids", () => {
    const { catalog } = exportCatalog({
      repoRoot: FIXTURE_ROOT,
      sourceCommit: SOURCE_COMMIT,
      generatedAt: "2026-08-29T00:00:00.000Z",
    });
    catalog.records.push({ ...catalog.records[0]! });
    const result = validateCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("duplicate identity"))).toBe(true);
    }
  });

  it("rejects invalid schemaVersion and short commits", () => {
    const result = validateCatalog({
      schemaVersion: 99,
      sourceCommit: "abc",
      generatedAt: "",
      records: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toMatch(/schemaVersion/);
      expect(result.errors.join("\n")).toMatch(/sourceCommit/);
    }
  });
});

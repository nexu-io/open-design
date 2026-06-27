import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ASSET_CATALOG_SCHEMA_VERSION, buildAssetCatalog, validateAssetCatalog } from "./build-asset-catalog.ts";

function writeFixtureRepo(): string {
  const repo = mkdtempSync(path.join(tmpdir(), "od-asset-catalog-"));

  mkdirSync(path.join(repo, "design-systems", "quiet-saas"), { recursive: true });
  writeFileSync(
    path.join(repo, "design-systems", "quiet-saas", "manifest.json"),
    JSON.stringify({
      schemaVersion: "od-design-system-project/v1",
      id: "quiet-saas",
      name: "Quiet SaaS",
      category: "Productivity & SaaS",
      description: "A calm app design system for dense workflow products.",
      source: { type: "bundled", origin: "fixture" },
      files: { design: "DESIGN.md", tokens: "tokens.css", components: "components.html" },
    }),
  );
  writeFileSync(path.join(repo, "design-systems", "quiet-saas", "DESIGN.md"), "# Quiet SaaS\n> Category: Productivity & SaaS\n");
  writeFileSync(path.join(repo, "design-systems", "quiet-saas", "tokens.css"), ":root { --color-bg: #ffffff; }\n");
  writeFileSync(path.join(repo, "design-systems", "quiet-saas", "components.html"), "<main>Preview</main>\n");

  mkdirSync(path.join(repo, "design-templates", "dense-dashboard"), { recursive: true });
  writeFileSync(
    path.join(repo, "design-templates", "dense-dashboard", "SKILL.md"),
    [
      "---",
      "name: dense-dashboard",
      "description: Dense dashboard layout for operational tools.",
      "od:",
      "  mode: prototype",
      "  category: dashboard",
      "tags: [\"table\", \"sidebar\", \"metrics\"]",
      "---",
      "",
      "Use for data-heavy products.",
    ].join("\n"),
  );
  writeFileSync(path.join(repo, "design-templates", "dense-dashboard", "example.html"), "<main>Dashboard</main>\n");

  mkdirSync(path.join(repo, "design-templates", "suite-dashboard", "examples"), { recursive: true });
  writeFileSync(
    path.join(repo, "design-templates", "suite-dashboard", "SKILL.md"),
    [
      "---",
      "name: suite-dashboard",
      "description: Multi-surface dashboard suite with alternate baked examples.",
      "od:",
      "  mode: prototype",
      "  category: dashboard",
      "---",
      "",
      "Use when the preview lives under examples instead of example.html.",
    ].join("\n"),
  );
  writeFileSync(path.join(repo, "design-templates", "suite-dashboard", "examples", "overview.html"), "<main>Suite</main>\n");

  mkdirSync(path.join(repo, "design-templates", "personal-blog-projects", "references"), { recursive: true });
  writeFileSync(path.join(repo, "design-templates", "personal-blog-projects", "example.html"), "<main>Blogs</main>\n");
  writeFileSync(
    path.join(repo, "design-templates", "personal-blog-projects", "references", "catalog.json"),
    JSON.stringify({
      entries: [
        {
          id: "plain-notes",
          group: "classic-site",
          site: {
            name: "Plain Notes",
            language: "en",
            region: "global",
            type: "digital garden",
            license: "inspiration-only",
          },
          why: "Good for a personal knowledge base with pages and reusable blocks.",
          capture: { reusePolicy: "inspiration-only" },
        },
      ],
    }),
  );

  mkdirSync(path.join(repo, "design-templates", "commercial-product-launches", "references"), { recursive: true });
  writeFileSync(path.join(repo, "design-templates", "commercial-product-launches", "example.html"), "<main>Launches</main>\n");
  writeFileSync(
    path.join(repo, "design-templates", "commercial-product-launches", "references", "catalog.json"),
    JSON.stringify({
      entries: [
        {
          id: "hardware-launch",
          brand: { name: "Hardware Co", sector: "consumer hardware" },
          page: { title: "Product X", type: "product-family" },
          why: "Good for product storytelling with media, comparison, and commerce reassurance.",
          capture: { reusePolicy: "inspiration-only" },
        },
      ],
    }),
  );

  mkdirSync(path.join(repo, "design-templates", "product-ui-projects", "references"), { recursive: true });
  writeFileSync(path.join(repo, "design-templates", "product-ui-projects", "example.html"), "<main>Product UI</main>\n");
  writeFileSync(
    path.join(repo, "design-templates", "product-ui-projects", "references", "catalog.json"),
    JSON.stringify({
      entries: [
        {
          id: "workflow-os",
          project: {
            name: "Workflow OS",
            sector: "productivity software",
            type: "SaaS console",
          },
          why: "Good for a product suite with dashboard, detail, and settings surfaces.",
          surfaces: [
            { type: "dashboard", title: "Dashboard", url: "https://example.com/dashboard" },
            { type: "detail", title: "Task detail", url: "https://example.com/tasks/1" },
            { type: "settings", title: "Settings", url: "https://example.com/settings" },
          ],
          flows: [{ type: "review", title: "Review task" }],
          states: [{ type: "empty", title: "Empty queue" }],
          components: [{ type: "activity-feed", title: "Activity feed" }],
          capture: {
            reusePolicy: "inspiration-only",
            captureDepth: "surface-suite",
          },
        },
      ],
    }),
  );

  return repo;
}

test("asset catalog normalizes design systems, templates, and case libraries", async () => {
  const repo = writeFixtureRepo();
  const catalog = await buildAssetCatalog(repo);
  const errors = validateAssetCatalog(catalog);

  assert.deepEqual(errors, []);
  assert.equal(catalog.schemaVersion, ASSET_CATALOG_SCHEMA_VERSION);
  assert.equal(catalog.assets.length, 6);

  const byId = new Map(catalog.assets.map((asset) => [asset.id, asset]));
  assert.equal(byId.get("design-system:quiet-saas")?.kind, "design-system");
  assert.equal(byId.get("design-system:quiet-saas")?.previewPath, "design-systems/quiet-saas/components.html");
  assert.deepEqual(byId.get("design-system:quiet-saas")?.roles, ["visual-direction", "tokens"]);

  assert.equal(byId.get("design-template:dense-dashboard")?.kind, "design-template");
  assert.equal(byId.get("design-template:dense-dashboard")?.previewPath, "design-templates/dense-dashboard/example.html");
  assert.ok(byId.get("design-template:dense-dashboard")?.useCases.includes("dashboard"));
  assert.ok(byId.get("design-template:dense-dashboard")?.tags.includes("table"));
  assert.ok(byId.get("design-template:dense-dashboard")?.tags.includes("sidebar"));

  assert.equal(byId.get("design-template:suite-dashboard")?.previewPath, "design-templates/suite-dashboard/examples/overview.html");
  assert.equal(byId.get("design-template:suite-dashboard")?.files.preview, "design-templates/suite-dashboard/examples/overview.html");

  assert.equal(byId.get("personal-blog-projects:plain-notes")?.kind, "case-study");
  assert.ok(byId.get("personal-blog-projects:plain-notes")?.useCases.includes("digital garden"));
  assert.ok(byId.get("personal-blog-projects:plain-notes")?.roles.includes("block-patterns"));

  assert.equal(byId.get("commercial-product-launches:hardware-launch")?.kind, "case-study");
  assert.ok(byId.get("commercial-product-launches:hardware-launch")?.useCases.includes("product launch"));
  assert.ok(byId.get("commercial-product-launches:hardware-launch")?.roles.includes("page-modules"));

  assert.equal(byId.get("product-ui-projects:workflow-os")?.kind, "case-study");
  assert.equal(byId.get("product-ui-projects:workflow-os")?.previewPath, "design-templates/product-ui-projects/example.html");
  assert.ok(byId.get("product-ui-projects:workflow-os")?.useCases.includes("product UI"));
  assert.ok(byId.get("product-ui-projects:workflow-os")?.tags.includes("surface-suite"));
  assert.ok(byId.get("product-ui-projects:workflow-os")?.roles.includes("surface-suite"));
  assert.ok(byId.get("product-ui-projects:workflow-os")?.roles.includes("state-patterns"));
});

test("asset catalog validation catches duplicate ids and unsafe paths", () => {
  const errors = validateAssetCatalog({
    schemaVersion: ASSET_CATALOG_SCHEMA_VERSION,
    generatedAt: new Date(0).toISOString(),
    assets: [
      {
        id: "duplicate",
        kind: "design-template",
        title: "A",
        summary: "A",
        sourcePath: "design-templates/a",
        tags: [],
        useCases: ["prototype"],
        userWords: [],
        visualTraits: [],
        roles: ["artifact-shape"],
        sourcePolicy: "template",
        files: {},
      },
      {
        id: "duplicate",
        kind: "design-template",
        title: "B",
        summary: "B",
        sourcePath: "../outside",
        tags: [],
        useCases: [],
        userWords: [],
        visualTraits: [],
        roles: [],
        sourcePolicy: "template",
        files: {},
      },
    ],
  });

  assert.match(errors.join("\n"), /duplicate asset id: duplicate/);
  assert.match(errors.join("\n"), /sourcePath must be a repository-relative path/);
  assert.match(errors.join("\n"), /roles must not be empty/);
  assert.match(errors.join("\n"), /useCases must not be empty/);
});
